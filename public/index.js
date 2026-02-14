// ─── State ──────────────────────────────────────────────────────────
const NUM_MOTORS  = 3;
const MOTOR_NAMES = ["Motor A", "Motor B", "Motor C"];
const MOTOR_GPIOS = ["4,5,6,7", "15,16,17,18", "8,9,10,11"];

let socket = null;
let reconnectTimer = null;
let statusInterval = null;
let espIp = "";

// Track which keys are currently held (to avoid key-repeat spam)
const keysHeld = new Set();

// ─── Initialise on load ─────────────────────────────────────────────
const minimap = new MinimapCanvas(document.getElementById("minimapCanvas"));
buildMotorCards();
initKeyboard();
enumerateWebcam();
loadSettings().then(() => {
  if (document.getElementById("espIpInput").value.trim()) {
    connectToEsp();
  }
});

// ─── Panel toggle ───────────────────────────────────────────────────

function togglePanel(name) {
  const panel = document.getElementById("panel" + name.charAt(0).toUpperCase() + name.slice(1));
  const btn = document.querySelector(`.toolbar-toggle[data-panel="${name}"]`);
  if (!panel) return;

  const b_visible = panel.classList.toggle("visible");
  if (btn) btn.classList.toggle("active", b_visible);
  saveSettings();
}

function getPanelVisibility() {
  const o_visibility = {};
  document.querySelectorAll(".overlay-panel").forEach(el => {
    // extract name from id like "panelJog" -> "jog"
    const s_name = el.id.replace("panel", "");
    o_visibility[s_name.toLowerCase()] = el.classList.contains("visible");
  });
  return o_visibility;
}

function applyPanelVisibility(o_visibility) {
  if (!o_visibility) return;
  for (const [s_name, b_visible] of Object.entries(o_visibility)) {
    const panel = document.getElementById("panel" + s_name.charAt(0).toUpperCase() + s_name.slice(1));
    const btn = document.querySelector(`.toolbar-toggle[data-panel="${s_name}"]`);
    if (panel) panel.classList.toggle("visible", b_visible);
    if (btn) btn.classList.toggle("active", b_visible);
  }
}

// ─── Connection ─────────────────────────────────────────────────────

function connectToEsp() {
  const input = document.getElementById("espIpInput");
  const ip = input.value.trim();
  if (!ip) return;

  if (socket) { socket.onclose = null; socket.close(); }
  clearTimeout(reconnectTimer);
  clearInterval(statusInterval);

  espIp = ip;
  saveSettings();
  openWebSocket();
}

function openWebSocket() {
  const url = `ws://${espIp}/ws`;
  console.log("Connecting to", url);
  socket = new WebSocket(url);

  socket.onopen = () => {
    console.log("WebSocket connected");
    document.getElementById("connBadge").classList.add("connected");
    document.getElementById("connText").textContent = "connected";
    requestStatus();
    statusInterval = setInterval(requestStatus, 1000);
  };

  socket.onclose = () => {
    console.log("WebSocket disconnected");
    document.getElementById("connBadge").classList.remove("connected");
    document.getElementById("connText").textContent = "disconnected";
    clearInterval(statusInterval);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(openWebSocket, 2000);
  };

  socket.onerror = () => socket.close();

  socket.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      if (msg.type === "status") updateUI(msg.motors);
      if (msg.error) console.warn("ESP error:", msg.error);
    } catch (e) {
      console.warn("Bad WS message:", evt.data);
    }
  };
}

function send(obj) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(obj));
  }
}

// ─── Motor API ──────────────────────────────────────────────────────

function setMotor(motor, speed, direction) {
  send({ motor, speed, direction });
}

function stopMotor(motor) {
  send({ motor, command: "stop" });
  document.getElementById(`speed${motor}`).value = 0;
  document.getElementById(`speedVal${motor}`).textContent = "0%";
}

function sendStopAll() {
  send({ command: "stopAll" });
  for (let i = 0; i < NUM_MOTORS; i++) {
    document.getElementById(`speed${i}`).value = 0;
    document.getElementById(`speedVal${i}`).textContent = "0%";
  }
}

function requestStatus() {
  send({ command: "status" });
}

// ─── WASD Keyboard Jog ─────────────────────────────────────────────

const JOG_KEYS = ["w", "a", "s", "d"];

function getMapping(key) {
  const k = key.toUpperCase();
  const motorSel = document.getElementById(`map${k}_motor`);
  const dirSel   = document.getElementById(`map${k}_dir`);
  if (!motorSel || !dirSel) return null;
  const motor = motorSel.value;
  if (motor === "none") return null;
  return { motor: parseInt(motor), direction: dirSel.value };
}

function getJogSpeed() {
  return parseInt(document.getElementById("jogSpeed").value);
}

function jogStart(key) {
  const mapping = getMapping(key);
  if (!mapping) return;
  send({ motor: mapping.motor, speed: getJogSpeed(), direction: mapping.direction });
}

function jogStop(key) {
  const mapping = getMapping(key);
  if (!mapping) return;
  send({ motor: mapping.motor, command: "stop" });
}

function initKeyboard() {
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;

    const key = e.key.toLowerCase();
    if (!JOG_KEYS.includes(key)) return;

    e.preventDefault();

    const cap = document.getElementById(`key${key.toUpperCase()}`);
    if (cap) cap.classList.add("pressed");

    if (keysHeld.has(key)) return;
    keysHeld.add(key);
    jogStart(key);
  });

  document.addEventListener("keyup", (e) => {
    const key = e.key.toLowerCase();
    if (!JOG_KEYS.includes(key)) return;

    e.preventDefault();

    const cap = document.getElementById(`key${key.toUpperCase()}`);
    if (cap) cap.classList.remove("pressed");

    if (!keysHeld.has(key)) return;
    keysHeld.delete(key);
    jogStop(key);
  });

  window.addEventListener("blur", () => {
    for (const key of keysHeld) {
      jogStop(key);
      const cap = document.getElementById(`key${key.toUpperCase()}`);
      if (cap) cap.classList.remove("pressed");
    }
    keysHeld.clear();
  });
}

// ─── Webcam (fullscreen background) ────────────────────────────────

let webcamStream = null;

async function enumerateWebcam() {
  try {
    const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
    tempStream.getTracks().forEach(track => track.stop());

    const a_o_device = await navigator.mediaDevices.enumerateDevices();
    const a_o_device__video = a_o_device.filter(d => d.kind === "videoinput");
    const select = document.getElementById("webcamSelect");
    // Remember current selection before rebuilding
    const s_prev_value = select.value;
    select.innerHTML = '<option value="">-- camera --</option>';
    a_o_device__video.forEach((o_device, n_idx) => {
      const option = document.createElement("option");
      option.value = o_device.deviceId;
      option.textContent = o_device.label || `Camera ${n_idx}`;
      select.appendChild(option);
    });
    // Restore previous selection if still valid
    if (s_prev_value) select.value = s_prev_value;
  } catch (e) {
    console.warn("Could not enumerate cameras:", e);
  }
}

async function startWebcam(deviceId) {
  const video = document.getElementById("webcamVideo");
  const placeholder = document.getElementById("webcamPlaceholder");

  // Stop existing stream
  if (webcamStream) {
    webcamStream.getTracks().forEach(track => track.stop());
    webcamStream = null;
  }

  if (!deviceId) {
    video.style.display = "none";
    placeholder.style.display = "flex";
    return;
  }

  const constraints = {
    video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  };

  try {
    webcamStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = webcamStream;
    video.style.display = "block";
    placeholder.style.display = "none";
  } catch (e) {
    console.error("Webcam error:", e);
    video.style.display = "none";
    placeholder.style.display = "flex";
    placeholder.querySelector("span").textContent = "camera access denied or unavailable";
  }
}

// Auto-start webcam when camera is selected in toolbar dropdown
document.getElementById("webcamSelect").addEventListener("change", (e) => {
  startWebcam(e.target.value);
  saveSettings();
});

// ─── Build motor cards ──────────────────────────────────────────────

function buildMotorCards() {
  const grid = document.getElementById("motorsGrid");
  for (let i = 0; i < NUM_MOTORS; i++) {
    const card = document.createElement("div");
    card.className = "motor-card";
    card.innerHTML = `
      <div class="card-header">
        <h2>${MOTOR_NAMES[i]}</h2>
        <span class="motor-id">M${i} · GPIO ${MOTOR_GPIOS[i]}</span>
      </div>
      <div class="position-display">pos: <span id="pos${i}">0</span> steps</div>

      <div class="control-group">
        <label>Speed <span class="speed-value" id="speedVal${i}">0%</span></label>
        <input type="range" id="speed${i}" min="0" max="100" value="0"
               oninput="onSpeedChange(${i}, this.value)">
      </div>

      <div class="control-group">
        <label>Direction</label>
        <div class="dir-toggle">
          <button class="dir-btn active" id="cwBtn${i}"  onclick="setDir(${i}, 'cw')">CW &#8635;</button>
          <button class="dir-btn"        id="ccwBtn${i}" onclick="setDir(${i}, 'ccw')">CCW &#8634;</button>
        </div>
      </div>

      <button class="stop-btn" onclick="stopMotor(${i})">&#9632; Stop</button>
    `;
    grid.appendChild(card);
  }
}

// ─── Motor card interaction ─────────────────────────────────────────

const sendTimers = {};

function onSpeedChange(motor, value) {
  document.getElementById(`speedVal${motor}`).textContent = value + "%";
  clearTimeout(sendTimers[motor]);
  sendTimers[motor] = setTimeout(() => {
    const dir = document.getElementById(`cwBtn${motor}`).classList.contains("active") ? "cw" : "ccw";
    setMotor(motor, parseInt(value), dir);
  }, 50);
}

function setDir(motor, dir) {
  document.getElementById(`cwBtn${motor}`).classList.toggle("active", dir === "cw");
  document.getElementById(`ccwBtn${motor}`).classList.toggle("active", dir === "ccw");
  const speed = parseInt(document.getElementById(`speed${motor}`).value);
  setMotor(motor, speed, dir);
}

// ─── Update UI from status ──────────────────────────────────────────

function updateUI(motorsData) {
  minimap.update(motorsData);
  motorsData.forEach((m, i) => {
    document.getElementById(`pos${i}`).textContent = m.position;
    const joggedMotors = new Set();
    for (const key of keysHeld) {
      const mapping = getMapping(key);
      if (mapping) joggedMotors.add(mapping.motor);
    }
    if (!joggedMotors.has(i)) {
      document.getElementById(`speed${i}`).value = m.speed;
      document.getElementById(`speedVal${i}`).textContent = m.speed + "%";
    }
    document.getElementById(`cwBtn${i}`).classList.toggle("active", m.direction === "cw");
    document.getElementById(`ccwBtn${i}`).classList.toggle("active", m.direction === "ccw");
  });
}

// ─── Settings persistence ───────────────────────────────────────────

let n_id__save_timeout = 0;

function gatherSettings() {
  return {
    s_ip__esp: document.getElementById("espIpInput").value,
    n_speed__jog: parseInt(document.getElementById("jogSpeed").value),
    s_id__webcam_device: document.getElementById("webcamSelect").value,
    o_panel_visibility: getPanelVisibility(),
    o_mapping__w: {
      s_motor: document.getElementById("mapW_motor").value,
      s_dir: document.getElementById("mapW_dir").value,
    },
    o_mapping__s: {
      s_motor: document.getElementById("mapS_motor").value,
      s_dir: document.getElementById("mapS_dir").value,
    },
    o_mapping__a: {
      s_motor: document.getElementById("mapA_motor").value,
      s_dir: document.getElementById("mapA_dir").value,
    },
    o_mapping__d: {
      s_motor: document.getElementById("mapD_motor").value,
      s_dir: document.getElementById("mapD_dir").value,
    },
  };
}

function applySettings(o_settings) {
  if (!o_settings || typeof o_settings !== "object") return;

  if (o_settings.s_ip__esp) {
    document.getElementById("espIpInput").value = o_settings.s_ip__esp;
  }
  if (window.__ESP_IP__) {
    document.getElementById("espIpInput").value = window.__ESP_IP__;
  }

  if (o_settings.n_speed__jog != null) {
    document.getElementById("jogSpeed").value = o_settings.n_speed__jog;
    document.getElementById("jogSpeedNum").value = o_settings.n_speed__jog;
    document.getElementById("jogSpeedVal").textContent = o_settings.n_speed__jog + "%";
  }

  if (o_settings.s_id__webcam_device) {
    const select = document.getElementById("webcamSelect");
    select.value = o_settings.s_id__webcam_device;
    // Auto-start camera with saved device
    startWebcam(o_settings.s_id__webcam_device);
  }

  const a_s_key = ["w", "s", "a", "d"];
  for (const s_key of a_s_key) {
    const o_mapping = o_settings[`o_mapping__${s_key}`];
    if (!o_mapping) continue;
    const k = s_key.toUpperCase();
    if (o_mapping.s_motor != null) document.getElementById(`map${k}_motor`).value = o_mapping.s_motor;
    if (o_mapping.s_dir != null) document.getElementById(`map${k}_dir`).value = o_mapping.s_dir;
  }

  applyPanelVisibility(o_settings.o_panel_visibility);
}

async function loadSettings() {
  try {
    const resp = await fetch("/api/settings");
    if (!resp.ok) return;
    const o_settings = await resp.json();
    applySettings(o_settings);
  } catch (e) {
    console.warn("Could not load settings:", e);
  }
}

function saveSettings() {
  clearTimeout(n_id__save_timeout);
  n_id__save_timeout = setTimeout(async () => {
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(gatherSettings()),
      });
    } catch (e) {
      console.warn("Could not save settings:", e);
    }
  }, 300);
}

// Auto-save when any setting changes
function initSettingsAutoSave() {
  document.getElementById("jogSpeed").addEventListener("input", saveSettings);
  document.getElementById("jogSpeedNum").addEventListener("input", saveSettings);

  for (const s_key of ["W", "S", "A", "D"]) {
    document.getElementById(`map${s_key}_motor`).addEventListener("change", saveSettings);
    document.getElementById(`map${s_key}_dir`).addEventListener("change", saveSettings);
  }
}

initSettingsAutoSave();

// ─── Gamepad controller ─────────────────────────────────────────────

const N_DEADZONE = 0.15;
const N_MS__GAMEPAD_POLL = 50;

// Track previous axis states to detect changes
let n_axis_x__prev = 0;
let n_axis_y__prev = 0;
let b_gamepad__active = false;
let n_id__gamepad_interval = 0;

function updateGamepadUI(s_id__gamepad) {
  const el_status = document.getElementById("gamepadStatus");
  const el_label = document.getElementById("gamepadLabel");
  if (s_id__gamepad) {
    el_status.classList.add("connected");
    el_label.textContent = s_id__gamepad;
  } else {
    el_status.classList.remove("connected");
    el_label.textContent = "connect a USB gamepad as a controller";
  }
}

function initGamepad() {
  window.addEventListener("gamepadconnected", (evt) => {
    console.log("Gamepad connected:", evt.gamepad.id);
    b_gamepad__active = true;
    updateGamepadUI(evt.gamepad.id);
    if (!n_id__gamepad_interval) {
      n_id__gamepad_interval = setInterval(pollGamepad, N_MS__GAMEPAD_POLL);
    }
  });

  window.addEventListener("gamepaddisconnected", (evt) => {
    console.log("Gamepad disconnected:", evt.gamepad.id);
    // Stop any running motors from gamepad
    gamepadStopAxis("x");
    gamepadStopAxis("y");
    b_gamepad__active = false;
    n_axis_x__prev = 0;
    n_axis_y__prev = 0;

    // Check if any gamepads remain
    const a_o_gamepad = navigator.getGamepads();
    let b_any = false;
    let s_id__remaining = "";
    for (const o_gp of a_o_gamepad) {
      if (o_gp) { b_any = true; s_id__remaining = o_gp.id; break; }
    }
    if (!b_any) {
      clearInterval(n_id__gamepad_interval);
      n_id__gamepad_interval = 0;
      updateGamepadUI(null);
    } else {
      updateGamepadUI(s_id__remaining);
    }
  });
}

function applyDeadzone(n_val) {
  if (Math.abs(n_val) < N_DEADZONE) return 0;
  // Remap so that just past deadzone starts near 0
  const n_sign = n_val > 0 ? 1 : -1;
  return n_sign * (Math.abs(n_val) - N_DEADZONE) / (1 - N_DEADZONE);
}

function gamepadStopAxis(s_axis) {
  if (s_axis === "x") {
    const o_map_a = getMapping("a");
    const o_map_d = getMapping("d");
    if (o_map_a) send({ motor: o_map_a.motor, command: "stop" });
    else if (o_map_d) send({ motor: o_map_d.motor, command: "stop" });
  } else {
    const o_map_w = getMapping("w");
    const o_map_s = getMapping("s");
    if (o_map_w) send({ motor: o_map_w.motor, command: "stop" });
    else if (o_map_s) send({ motor: o_map_s.motor, command: "stop" });
  }
}

function gamepadDriveAxis(s_axis, n_val) {
  // n_val: -1..+1 after deadzone. For X: negative=left(A), positive=right(D)
  // For Y: negative=up(W), positive=down(S)
  let s_key_neg, s_key_pos;
  if (s_axis === "x") {
    s_key_neg = "a";
    s_key_pos = "d";
  } else {
    s_key_neg = "w";
    s_key_pos = "s";
  }

  const s_key = n_val < 0 ? s_key_neg : s_key_pos;
  const o_mapping = getMapping(s_key);
  if (!o_mapping) return;

  const n_speed__jog = getJogSpeed();
  const n_speed = Math.round(Math.abs(n_val) * n_speed__jog);
  if (n_speed <= 0) return;

  send({ motor: o_mapping.motor, speed: n_speed, direction: o_mapping.direction });
}

function pollGamepad() {
  const a_o_gamepad = navigator.getGamepads();
  let o_gamepad = null;
  for (const o_gp of a_o_gamepad) {
    if (o_gp) { o_gamepad = o_gp; break; }
  }
  if (!o_gamepad) return;

  const n_axis_x__raw = o_gamepad.axes[0] ?? 0; // left stick X
  const n_axis_y__raw = o_gamepad.axes[1] ?? 0; // left stick Y

  const n_axis_x = applyDeadzone(n_axis_x__raw);
  const n_axis_y = applyDeadzone(n_axis_y__raw);

  // Don't send if keyboard jog is active on same axes
  const b_keyboard_x = keysHeld.has("a") || keysHeld.has("d");
  const b_keyboard_y = keysHeld.has("w") || keysHeld.has("s");

  // X axis (A/D)
  if (!b_keyboard_x) {
    const b_was_active = n_axis_x__prev !== 0;
    const b_now_active = n_axis_x !== 0;

    if (b_now_active) {
      gamepadDriveAxis("x", n_axis_x);
    } else if (b_was_active && !b_now_active) {
      gamepadStopAxis("x");
    }
  }

  // Y axis (W/S)
  if (!b_keyboard_y) {
    const b_was_active = n_axis_y__prev !== 0;
    const b_now_active = n_axis_y !== 0;

    if (b_now_active) {
      gamepadDriveAxis("y", n_axis_y);
    } else if (b_was_active && !b_now_active) {
      gamepadStopAxis("y");
    }
  }

  n_axis_x__prev = n_axis_x;
  n_axis_y__prev = n_axis_y;
}

initGamepad();
