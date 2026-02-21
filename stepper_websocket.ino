/**
 * ESP32-S3 — Three 28BYJ-48 steppers, WebSocket-only API
 *
 * Libraries required (Arduino Library Manager):
 *   - ESP Async WebServer  (by mathieucarbou)
 *   - AsyncTCP             (by mathieucarbou)
 *   - ArduinoJson          (by Benoît Blanchon)
 *
 * Wiring (ULN2003 driver boards, external 5 V supply):
 *   Motor 0: GPIO4, GPIO5, GPIO6, GPIO7
 *   Motor 1: GPIO15, GPIO16, GPIO17, GPIO18
 *   Motor 2: GPIO8, GPIO9, GPIO10, GPIO11
 *
 * WebSocket endpoint: ws://<ESP_IP>/ws
 *
 * API (JSON):
 *   → { "motor": 0, "command": "runContinuous", "n_rpm": 10.0, "direction": "cw" }
 *   → { "motor": 0, "command": "moveSteps", "n_step": 500, "n_rpm": 8.0 }
 *   → { "motor": 0, "command": "stop" }
 *   → { "motor": 0, "command": "setBacklash", "n_step__backlash": 25 }
 *   → { "command": "stopAll" }
 *   → { "command": "status" }
 *   ← { "type":"status", "a_o_motor":[ {n_rpm,s_direction,b_running,n_position,s_mode,n_step__remaining,n_step__backlash,b_compensating}, ... ] }
 *   ← { "type":"moveComplete", "motor": 0, "n_position": 1734 }
 *   ← { "type":"moveCancelled", "motor": 0, "n_position": 1200 }
 */

#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>

// ─── WiFi credentials ───────────────────────────────────────────────
const char* WIFI_SSID = "{{wifi_ssid}}";
const char* WIFI_PASS = "{{wifi_password}}";

// ─── Motor hardware ─────────────────────────────────────────────────

static const int NUM_MOTORS = 3;

static const uint8_t MOTOR_PINS[NUM_MOTORS][4] = {
    { {{n_pin1__motor_0}}, {{n_pin2__motor_0}}, {{n_pin3__motor_0}}, {{n_pin4__motor_0}} },
    { {{n_pin1__motor_1}}, {{n_pin2__motor_1}}, {{n_pin3__motor_1}}, {{n_pin4__motor_1}} },
    { {{n_pin1__motor_2}}, {{n_pin2__motor_2}}, {{n_pin3__motor_2}}, {{n_pin4__motor_2}} },
};

static const uint8_t HALF_STEP_SEQ[8][4] = {
    {1,0,0,0}, {1,1,0,0}, {0,1,0,0}, {0,1,1,0},
    {0,0,1,0}, {0,0,1,1}, {0,0,0,1}, {1,0,0,1},
};

static const int SEQ_LEN            = 8;
static const int HALF_STEPS_PER_REV = 4096;

static const float N_RPM__BACKLASH_BURST = 10.0;

// ─── Move modes ─────────────────────────────────────────────────────

enum MoveMode {
    MODE_IDLE       = 0,
    MODE_CONTINUOUS = 1,
    MODE_STEPS      = 2,
};

// ─── Motor state ────────────────────────────────────────────────────

struct MotorState {
    uint8_t  pins[4];
    int      n_idx__seq;
    long     n_position;
    int      n_direction;
    int      n_direction__prev;
    bool     b_running;

    float    n_rpm;
    unsigned long n_us__step_delay;
    unsigned long n_us__last_step;

    MoveMode mode;
    long     n_step__target;
    long     n_step__current;

    long     n_step__backlash;
    bool     b_compensating;
    long     n_step__comp_target;
    long     n_step__comp_current;
    float    n_rpm__after_comp;
};

MotorState motors[NUM_MOTORS];

// flag: set to true in motorsUpdate when a move completes or is cancelled
// processed in loop() to send WS messages outside the tight stepping loop
struct MoveEvent {
    bool     b_pending;
    bool     b_complete;   // true = complete, false = cancelled
    int      n_motor;
    long     n_position;
};
static const int MAX_MOVE_EVENT = 4;
MoveEvent a_o_move_event[MAX_MOVE_EVENT];
int n_cnt__move_event = 0;

// ─── WebSocket server ───────────────────────────────────────────────

AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

// ─── Motor helpers ──────────────────────────────────────────────────

unsigned long rpmToDelay(float n_rpm) {
    if (n_rpm <= 0) return 0;
    return (unsigned long)(60000000.0 / ((float)HALF_STEPS_PER_REV * n_rpm));
}

void motorInit() {
    for (int m = 0; m < NUM_MOTORS; m++) {
        for (int p = 0; p < 4; p++) {
            motors[m].pins[p] = MOTOR_PINS[m][p];
            pinMode(motors[m].pins[p], OUTPUT);
            digitalWrite(motors[m].pins[p], LOW);
        }
        motors[m].n_idx__seq        = 0;
        motors[m].n_position        = 0;
        motors[m].n_direction       = 1;
        motors[m].n_direction__prev = 0;
        motors[m].b_running         = false;
        motors[m].n_rpm             = 0;
        motors[m].n_us__step_delay  = 0;
        motors[m].n_us__last_step   = 0;
        motors[m].mode              = MODE_IDLE;
        motors[m].n_step__target    = 0;
        motors[m].n_step__current   = 0;
        motors[m].n_step__backlash  = 0;
        motors[m].b_compensating    = false;
        motors[m].n_step__comp_target  = 0;
        motors[m].n_step__comp_current = 0;
        motors[m].n_rpm__after_comp    = 0;
    }
    n_cnt__move_event = 0;
}

void motorApplySeq(int m) {
    int idx = motors[m].n_idx__seq;
    for (int i = 0; i < 4; i++)
        digitalWrite(motors[m].pins[i], HALF_STEP_SEQ[idx][i]);
}

void motorRelease(int m) {
    for (int i = 0; i < 4; i++)
        digitalWrite(motors[m].pins[i], LOW);
}

void motorSetRPM(int m, float n_rpm) {
    if (n_rpm <= 0) n_rpm = 0.01;
    motors[m].n_rpm = n_rpm;
    motors[m].n_us__step_delay = rpmToDelay(n_rpm);
}

void queueMoveEvent(bool b_complete, int m) {
    if (n_cnt__move_event < MAX_MOVE_EVENT) {
        a_o_move_event[n_cnt__move_event].b_pending  = true;
        a_o_move_event[n_cnt__move_event].b_complete = b_complete;
        a_o_move_event[n_cnt__move_event].n_motor    = m;
        a_o_move_event[n_cnt__move_event].n_position = motors[m].n_position;
        n_cnt__move_event++;
    }
}

// Start backlash compensation phase if direction changed
// Returns true if compensation was started (caller should not set b_running yet)
bool motorStartBacklash(int m, float n_rpm_requested) {
    bool b_direction_changed = (motors[m].n_direction__prev != 0) &&
                               (motors[m].n_direction != motors[m].n_direction__prev);
    if (b_direction_changed && motors[m].n_step__backlash > 0) {
        motors[m].b_compensating       = true;
        motors[m].n_step__comp_target  = motors[m].n_step__backlash;
        motors[m].n_step__comp_current = 0;
        motors[m].n_rpm__after_comp    = n_rpm_requested;
        // burst at max speed during compensation
        motors[m].n_us__step_delay = rpmToDelay(N_RPM__BACKLASH_BURST);
        motors[m].n_rpm = N_RPM__BACKLASH_BURST;
        return true;
    }
    return false;
}

void motorRunContinuous(int m, float n_rpm, int n_direction) {
    motors[m].n_direction = n_direction;
    motors[m].mode = MODE_CONTINUOUS;
    motors[m].n_step__target  = 0;
    motors[m].n_step__current = 0;

    if (!motorStartBacklash(m, n_rpm)) {
        motorSetRPM(m, n_rpm);
    }

    motors[m].n_direction__prev = n_direction;
    motors[m].b_running = true;
}

void motorMoveSteps(int m, long n_step, float n_rpm) {
    if (n_step == 0) return;

    motors[m].n_direction = (n_step > 0) ? 1 : -1;
    motors[m].mode = MODE_STEPS;
    motors[m].n_step__target  = (n_step > 0) ? n_step : -n_step;
    motors[m].n_step__current = 0;

    if (!motorStartBacklash(m, n_rpm)) {
        motorSetRPM(m, n_rpm);
    }

    motors[m].n_direction__prev = motors[m].n_direction;
    motors[m].b_running = true;
}

void motorStop(int m) {
    bool b_was_stepping = (motors[m].mode == MODE_STEPS && motors[m].b_running);
    motors[m].b_running      = false;
    motors[m].b_compensating = false;
    motors[m].mode           = MODE_IDLE;
    motors[m].n_rpm          = 0;
    motors[m].n_us__step_delay = 0;
    motorRelease(m);
    if (b_was_stepping) {
        queueMoveEvent(false, m);
    }
}

void motorSetBacklash(int m, long n_step) {
    motors[m].n_step__backlash = (n_step > 0) ? n_step : 0;
}

// ─── Motor update (called every loop) ───────────────────────────────

void motorsUpdate() {
    unsigned long now = micros();
    for (int m = 0; m < NUM_MOTORS; m++) {
        if (!motors[m].b_running) continue;
        if (motors[m].n_us__step_delay == 0) continue;
        if (now - motors[m].n_us__last_step < motors[m].n_us__step_delay) continue;

        motors[m].n_us__last_step = now;

        // advance one half-step
        motors[m].n_idx__seq = (motors[m].n_idx__seq + motors[m].n_direction + SEQ_LEN) % SEQ_LEN;
        motorApplySeq(m);
        motors[m].n_position += motors[m].n_direction;

        // backlash compensation phase
        if (motors[m].b_compensating) {
            motors[m].n_step__comp_current++;
            if (motors[m].n_step__comp_current >= motors[m].n_step__comp_target) {
                // compensation done — restore requested RPM
                motors[m].b_compensating = false;
                motorSetRPM(m, motors[m].n_rpm__after_comp);
                // for MODE_STEPS, the step counter starts now (after compensation)
            }
            continue;
        }

        // step counting for MODE_STEPS
        if (motors[m].mode == MODE_STEPS) {
            motors[m].n_step__current++;
            if (motors[m].n_step__current >= motors[m].n_step__target) {
                // move complete
                motors[m].b_running = false;
                motors[m].mode = MODE_IDLE;
                motors[m].n_rpm = 0;
                motors[m].n_us__step_delay = 0;
                motorRelease(m);
                queueMoveEvent(true, m);
            }
        }
    }
}

// ─── WebSocket handling ─────────────────────────────────────────────

void sendStatus(AsyncWebSocketClient *client = nullptr) {
    JsonDocument doc;
    doc["type"] = "status";
    JsonArray arr = doc["a_o_motor"].to<JsonArray>();
    for (int i = 0; i < NUM_MOTORS; i++) {
        JsonObject mo = arr.add<JsonObject>();
        mo["n_rpm"]             = motors[i].n_rpm;
        mo["s_direction"]       = (motors[i].n_direction == 1) ? "cw" : "ccw";
        mo["b_running"]         = motors[i].b_running;
        mo["n_position"]        = motors[i].n_position;
        mo["n_step__backlash"]  = motors[i].n_step__backlash;
        mo["b_compensating"]    = motors[i].b_compensating;

        const char* s_mode = "idle";
        long n_remaining = 0;
        if (motors[i].mode == MODE_CONTINUOUS) {
            s_mode = "continuous";
        } else if (motors[i].mode == MODE_STEPS) {
            s_mode = "steps";
            n_remaining = motors[i].n_step__target - motors[i].n_step__current;
            if (n_remaining < 0) n_remaining = 0;
        }
        mo["s_mode"]            = s_mode;
        mo["n_step__remaining"] = n_remaining;
    }
    String json;
    serializeJson(doc, json);
    if (client) client->text(json);
    else        ws.textAll(json);
}

void sendMoveEvent(bool b_complete, int m, long n_position) {
    JsonDocument doc;
    doc["type"]       = b_complete ? "moveComplete" : "moveCancelled";
    doc["motor"]      = m;
    doc["n_position"] = n_position;
    String json;
    serializeJson(doc, json);
    ws.textAll(json);
}

void handleWsMessage(AsyncWebSocketClient *client, uint8_t *data, size_t len) {
    JsonDocument doc;
    if (deserializeJson(doc, data, len)) {
        client->text("{\"error\":\"invalid JSON\"}");
        return;
    }

    // global commands (no motor index)
    if (doc["command"].is<const char*>()) {
        String cmd = doc["command"].as<String>();
        if (cmd == "stopAll") {
            for (int i = 0; i < NUM_MOTORS; i++) motorStop(i);
            sendStatus(); return;
        }
        if (cmd == "status") { sendStatus(client); return; }
    }

    // per-motor commands
    if (doc["motor"].is<int>()) {
        int m = doc["motor"].as<int>();
        if (m < 0 || m >= NUM_MOTORS) {
            client->text("{\"error\":\"invalid motor index\"}");
            return;
        }

        String cmd = "";
        if (doc["command"].is<const char*>()) {
            cmd = doc["command"].as<String>();
        }

        if (cmd == "stop") {
            motorStop(m);
            sendStatus();
            return;
        }

        if (cmd == "runContinuous") {
            float n_rpm = doc["n_rpm"] | 5.0f;
            int dir = 1;
            if (doc["direction"].is<const char*>())
                dir = (doc["direction"].as<String>() == "ccw") ? -1 : 1;
            motorRunContinuous(m, n_rpm, dir);
            sendStatus();
            return;
        }

        if (cmd == "moveSteps") {
            float n_rpm = doc["n_rpm"] | 5.0f;
            long n_step = doc["n_step"] | 0L;
            if (n_step == 0) { sendStatus(); return; }
            motorMoveSteps(m, n_step, n_rpm);
            sendStatus();
            return;
        }

        if (cmd == "setBacklash") {
            long n_backlash = doc["n_step__backlash"] | 0L;
            motorSetBacklash(m, n_backlash);
            sendStatus();
            return;
        }
    }
}

void onWsEvent(AsyncWebSocket *srv, AsyncWebSocketClient *client,
               AwsEventType type, void *arg, uint8_t *data, size_t len)
{
    switch (type) {
        case WS_EVT_CONNECT:
            Serial.printf("WS client #%u connected from %s\n",
                          client->id(), client->remoteIP().toString().c_str());
            sendStatus(client);
            break;
        case WS_EVT_DISCONNECT:
            Serial.printf("WS client #%u disconnected\n", client->id());
            break;
        case WS_EVT_DATA: {
            AwsFrameInfo *info = (AwsFrameInfo*)arg;
            if (info->final && info->index == 0 && info->len == len && info->opcode == WS_TEXT)
                handleWsMessage(client, data, len);
            break;
        }
        default: break;
    }
}

// ─── Setup ──────────────────────────────────────────────────────────

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n=== Stepper WebSocket API ===\n");

    motorInit();
    Serial.println("Motors initialised.");

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    Serial.print("Connecting to WiFi");
    while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
    Serial.printf("\nConnected!  IP: %s\n", WiFi.localIP().toString().c_str());
    Serial.println("WebSocket endpoint: ws://<IP>/ws\n");

    ws.onEvent(onWsEvent);
    server.addHandler(&ws);
    server.begin();
}

// ─── Loop ───────────────────────────────────────────────────────────

void loop() {
    motorsUpdate();

    // send queued move events (outside the tight stepping loop)
    for (int i = 0; i < n_cnt__move_event; i++) {
        if (a_o_move_event[i].b_pending) {
            sendMoveEvent(
                a_o_move_event[i].b_complete,
                a_o_move_event[i].n_motor,
                a_o_move_event[i].n_position
            );
            sendStatus();
            a_o_move_event[i].b_pending = false;
        }
    }
    if (n_cnt__move_event > 0) {
        // compact: just reset counter since we processed all
        n_cnt__move_event = 0;
    }

    ws.cleanupClients();
}
