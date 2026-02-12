/**
 * ESP32-S3 — Three 28BYJ-48 steppers, WebSocket-only API
 *
 * Libraries required (Arduino Library Manager):
 *   - ESPAsyncWebServer  (by lacamera / me-no-dev)
 *   - AsyncTCP           (by dvarrel / me-no-dev)
 *   - ArduinoJson        (by Benoît Blanchon)
 *
 * Wiring (ULN2003 driver boards, external 5 V supply):
 *   Motor 0: GPIO4, GPIO5, GPIO6, GPIO7
 *   Motor 1: GPIO15, GPIO16, GPIO17, GPIO18
 *   Motor 2: GPIO8, GPIO9, GPIO10, GPIO11
 *
 * WebSocket endpoint: ws://<ESP_IP>/ws
 *
 * API (JSON):
 *   → { "motor": 0, "speed": 75, "direction": "cw" }
 *   → { "motor": 1, "command": "stop" }
 *   → { "command": "stopAll" }
 *   → { "command": "status" }
 *   ← { "type":"status", "motors":[ {speed,direction,running,position}, ... ] }
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
    { 4,  5,  6,  7},
    {15, 16, 17, 18},
    { 8,  9, 10, 11},
};

static const uint8_t HALF_STEP_SEQ[8][4] = {
    {1,0,0,0}, {1,1,0,0}, {0,1,0,0}, {0,1,1,0},
    {0,0,1,0}, {0,0,1,1}, {0,0,0,1}, {1,0,0,1},
};

static const int SEQ_LEN            = 8;
static const int HALF_STEPS_PER_REV = 4096;

static const unsigned long MIN_STEP_DELAY_US = 900;
static const unsigned long MAX_STEP_DELAY_US = 5000;

struct MotorState {
    uint8_t  pins[4];
    int      seqIndex;
    long     position;
    int      speed;
    int      direction;
    bool     running;
    unsigned long lastStepUs;
    unsigned long stepDelayUs;
};

MotorState motors[NUM_MOTORS];

// ─── WebSocket server ───────────────────────────────────────────────

AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

// ─── Motor helpers ──────────────────────────────────────────────────

void motorInit() {
    for (int m = 0; m < NUM_MOTORS; m++) {
        for (int p = 0; p < 4; p++) {
            motors[m].pins[p] = MOTOR_PINS[m][p];
            pinMode(motors[m].pins[p], OUTPUT);
            digitalWrite(motors[m].pins[p], LOW);
        }
        motors[m].seqIndex    = 0;
        motors[m].position    = 0;
        motors[m].speed       = 0;
        motors[m].direction   = 1;
        motors[m].running     = false;
        motors[m].lastStepUs  = 0;
        motors[m].stepDelayUs = MAX_STEP_DELAY_US;
    }
}

void motorApplySeq(int m) {
    int idx = motors[m].seqIndex;
    for (int i = 0; i < 4; i++)
        digitalWrite(motors[m].pins[i], HALF_STEP_SEQ[idx][i]);
}

void motorRelease(int m) {
    for (int i = 0; i < 4; i++)
        digitalWrite(motors[m].pins[i], LOW);
}

unsigned long speedToDelay(int speed) {
    if (speed <= 0) return 0;
    return MAX_STEP_DELAY_US - (unsigned long)(speed - 1) * (MAX_STEP_DELAY_US - MIN_STEP_DELAY_US) / 99;
}

void setMotor(int m, int speed, int direction) {
    motors[m].speed       = constrain(speed, 0, 100);
    motors[m].direction   = direction;
    motors[m].stepDelayUs = speedToDelay(motors[m].speed);
    motors[m].running     = (motors[m].speed > 0);
    if (!motors[m].running) motorRelease(m);
}

void stopMotor(int m) {
    motors[m].speed   = 0;
    motors[m].running = false;
    motorRelease(m);
}

void motorsUpdate() {
    unsigned long now = micros();
    for (int m = 0; m < NUM_MOTORS; m++) {
        if (!motors[m].running) continue;
        if (now - motors[m].lastStepUs >= motors[m].stepDelayUs) {
            motors[m].lastStepUs = now;
            motors[m].seqIndex = (motors[m].seqIndex + motors[m].direction + SEQ_LEN) % SEQ_LEN;
            motorApplySeq(m);
            motors[m].position += motors[m].direction;
        }
    }
}

// ─── WebSocket handling ─────────────────────────────────────────────

void sendStatus(AsyncWebSocketClient *client = nullptr) {
    JsonDocument doc;
    doc["type"] = "status";
    JsonArray arr = doc["motors"].to<JsonArray>();
    for (int i = 0; i < NUM_MOTORS; i++) {
        JsonObject mo = arr.add<JsonObject>();
        mo["speed"]     = motors[i].speed;
        mo["direction"] = (motors[i].direction == 1) ? "cw" : "ccw";
        mo["running"]   = motors[i].running;
        mo["position"]  = motors[i].position;
    }
    String json;
    serializeJson(doc, json);
    if (client) client->text(json);
    else        ws.textAll(json);
}

void handleWsMessage(AsyncWebSocketClient *client, uint8_t *data, size_t len) {
    JsonDocument doc;
    if (deserializeJson(doc, data, len)) {
        client->text("{\"error\":\"invalid JSON\"}");
        return;
    }

    if (doc["command"].is<const char*>()) {
        String cmd = doc["command"].as<String>();
        if (cmd == "stopAll") {
            for (int i = 0; i < NUM_MOTORS; i++) stopMotor(i);
            sendStatus(); return;
        }
        if (cmd == "status") { sendStatus(client); return; }
    }

    if (doc["motor"].is<int>()) {
        int m = doc["motor"].as<int>();
        if (m < 0 || m >= NUM_MOTORS) {
            client->text("{\"error\":\"invalid motor index\"}");
            return;
        }
        if (doc["command"].is<const char*>() && doc["command"].as<String>() == "stop") {
            stopMotor(m); sendStatus(); return;
        }
        int spd = doc["speed"] | motors[m].speed;
        int dir = motors[m].direction;
        if (doc["direction"].is<const char*>())
            dir = (doc["direction"].as<String>() == "ccw") ? -1 : 1;
        setMotor(m, spd, dir);
        sendStatus();
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
    ws.cleanupClients();
}
