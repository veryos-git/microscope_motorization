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

if (window.__ESP_IP__) {
  document.getElementById("espIpInput").value = window.__ESP_IP__;
  connectToEsp();
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
    // Don't capture when typing in input fields
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") return;

    const key = e.key.toLowerCase();
    if (!JOG_KEYS.includes(key)) return;

    e.preventDefault();

    // Visual feedback
    const cap = document.getElementById(`key${key.toUpperCase()}`);
    if (cap) cap.classList.add("pressed");

    // Only send on initial press, not key-repeat
    if (keysHeld.has(key)) return;
    keysHeld.add(key);
    jogStart(key);
  });

  document.addEventListener("keyup", (e) => {
    const key = e.key.toLowerCase();
    if (!JOG_KEYS.includes(key)) return;

    e.preventDefault();

    // Visual feedback
    const cap = document.getElementById(`key${key.toUpperCase()}`);
    if (cap) cap.classList.remove("pressed");

    if (!keysHeld.has(key)) return;
    keysHeld.delete(key);
    jogStop(key);
  });

  // Safety: if window loses focus, stop all jogging motors
  window.addEventListener("blur", () => {
    for (const key of keysHeld) {
      jogStop(key);
      const cap = document.getElementById(`key${key.toUpperCase()}`);
      if (cap) cap.classList.remove("pressed");
    }
    keysHeld.clear();
  });
}

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
    // Only update sliders if this motor isn't currently being jogged
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
