import { createApp, reactive, watch, markRaw } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import {
    a_o_model,
    f_o_toast,
    f_s_name_table__from_o_model,
    o_sfunexposed__f_v_crud__indb,
    a_o_sfunexposed,
    f_o_wsmsg
} from './constructors.module.js';

import { o_component__toolbar } from './o_component__toolbar.js';
import { o_component__webcam } from './o_component__webcam.js';
import { o_component__jog } from './o_component__jog.js';
import { o_component__minimap } from './o_component__minimap.js';
import { o_component__motor } from './o_component__motor.js';
import { o_component__scan } from './o_component__scan.js';
import { o_component__camera_setting } from './o_component__camera_setting.js';
import { o_component__page_setup } from './o_component__page_setup.js';
import { o_component__page_control } from './o_component__page_control.js';

// ─── Global reactive state ─────────────────────────────────────────

let o_state = reactive({
    // app server connection
    b_connected__server: false,

    // DB-backed data
    a_o_setting: [],
    a_o_wsclient: [],
    a_o_model,

    // ESP32 connection
    s_ip__esp: '',
    b_connected__esp: false,

    // motor state from ESP32 status messages
    a_o_motor: [
        { n_rpm: 0, s_direction: 'cw', b_running: false, n_position: 0, s_mode: 'idle', n_step__remaining: 0, n_step__backlash: 0, b_compensating: false },
        { n_rpm: 0, s_direction: 'cw', b_running: false, n_position: 0, s_mode: 'idle', n_step__remaining: 0, n_step__backlash: 0, b_compensating: false },
        { n_rpm: 0, s_direction: 'cw', b_running: false, n_position: 0, s_mode: 'idle', n_step__remaining: 0, n_step__backlash: 0, b_compensating: false },
    ],

    // jog settings
    n_rpm__jog: 5.0,
    o_mapping__w: { s_motor: '1', s_dir: 'cw' },
    o_mapping__s: { s_motor: '1', s_dir: 'ccw' },
    o_mapping__a: { s_motor: '0', s_dir: 'ccw' },
    o_mapping__d: { s_motor: '0', s_dir: 'cw' },

    // UI
    o_panel_visibility: { jog: true, minimap: true, motors: true, scan: false, camera_setting: false },
    o_key_held: {},

    // scan
    b_scanning: false,

    // backlash compensation (per motor)
    a_n_step__backlash: [0, 0, 0],

    // webcam
    s_id__webcam_device: '',
    a_o_device__webcam: [],
    b_streaming__webcam: false,

    // gamepad
    s_name__gamepad: '',
    b_connected__gamepad: false,

    // toast
    a_o_toast: [],
    n_ts_ms_now: Date.now(),

    // setup page state
    s_wifi_ssid: '',
    s_wifi_password: '',
    a_o_pin_config: [
        { s_name: 'Motor X', n_pin1: 4, n_pin2: 5, n_pin3: 6, n_pin4: 7 },
        { s_name: 'Motor Y', n_pin1: 15, n_pin2: 16, n_pin3: 17, n_pin4: 18 },
        { s_name: 'Motor Z', n_pin1: 8, n_pin2: 9, n_pin3: 10, n_pin4: 11 },
    ],
    b_flashing: false,
    s_flash_output: '',
    s_flash_status: 'idle',
    b_detected__esp_usb: false,
    s_port__esp_usb: '',
});

// ─── App server WebSocket (template pattern) ────────────────────────

let o_socket = null;
let a_f_handler = [];

let f_register_handler = function(f_handler) {
    a_f_handler.push(f_handler);
    return function() {
        let n_idx = a_f_handler.indexOf(f_handler);
        if (n_idx !== -1) a_f_handler.splice(n_idx, 1);
    };
};

let f_send_wsmsg_with_response = async function(o_wsmsg){
    return new Promise(function(resolve, reject) {
        let f_handler_response = function(o_wsmsg2){
            if(o_wsmsg2.s_uuid === o_wsmsg.s_uuid){
                resolve(o_wsmsg2);
                f_unregister();
            }
        }
        let f_unregister = f_register_handler(f_handler_response);
        o_socket.send(JSON.stringify(o_wsmsg))
    });
}

let f_connect = async function() {
    return new Promise(function(resolve, reject) {
        try {
            let s_protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            o_socket = new WebSocket(s_protocol + '//' + window.location.host);

            o_socket.onopen = async function() {
                o_state.b_connected__server = true;
                console.log('app server websocket connected');

                let o_resp = await f_send_wsmsg_with_response(
                    f_o_wsmsg(
                        'hello_from_client',
                        { s_message: 'Hello from client!' }
                    )
                )
                console.log(o_resp)
                resolve();
            };

            o_socket.onmessage = function(o_evt) {
                let o_data = JSON.parse(o_evt.data);

                // init message with ESP IP from CLI
                if(o_data.s_type === 'init'){
                    if(o_data.s_ip__esp && !o_state.s_ip__esp){
                        o_state.s_ip__esp = o_data.s_ip__esp;
                    }
                    return;
                }

                // model data broadcast
                if(o_data?.o_model){
                    let s_name_table = f_s_name_table__from_o_model(o_data.o_model);
                    o_state[s_name_table] = o_data.v_data;
                    // when settings arrive, apply them to reactive state
                    if(s_name_table === 'a_o_setting'){
                        f_apply_setting_from_db();
                    }
                    return;
                }

                // toast
                if(o_data.s_type === 'toast'){
                    o_state.a_o_toast.push(o_data.v_data);
                    return;
                }

                // handler registry (for f_send_wsmsg_with_response)
                for (let f_handler of a_f_handler) {
                    f_handler(o_data);
                }
            };

            o_socket.onclose = function() {
                o_state.b_connected__server = false;
                console.log('app server websocket disconnected, reconnecting...');
                setTimeout(f_connect, 2000);
            };

        } catch (error) {
            reject(error);
        }
    });
};

// ─── Settings load/save via DB ──────────────────────────────────────

let f_v_setting = function(s_key){
    let o_setting = o_state.a_o_setting.find(function(o){ return o.s_key === s_key; });
    if(!o_setting) return undefined;
    return o_setting.s_value;
}

let f_apply_setting_from_db = function(){
    let f_get = function(s_key, v_default){
        let s_val = f_v_setting(s_key);
        if(s_val === undefined || s_val === '') return v_default;
        return s_val;
    };
    let f_get_json = function(s_key, v_default){
        let s_val = f_v_setting(s_key);
        if(s_val === undefined || s_val === '') return v_default;
        try { return JSON.parse(s_val); } catch(e) { return v_default; }
    };

    o_state.s_ip__esp = o_state.s_ip__esp || f_get('s_ip__esp', '');
    o_state.n_rpm__jog = parseFloat(f_get('n_rpm__jog', '5.0'));
    o_state.s_id__webcam_device = f_get('s_id__webcam_device', '');

    let o_vis = f_get_json('o_panel_visibility', { jog: true, minimap: true, motors: true, scan: false, camera_setting: false });
    o_state.o_panel_visibility.jog = o_vis.jog;
    o_state.o_panel_visibility.minimap = o_vis.minimap;
    o_state.o_panel_visibility.motors = o_vis.motors;
    o_state.o_panel_visibility.scan = o_vis.scan || false;
    o_state.o_panel_visibility.camera_setting = o_vis.camera_setting || false;

    o_state.o_mapping__w = f_get_json('o_mapping__w', o_state.o_mapping__w);
    o_state.o_mapping__s = f_get_json('o_mapping__s', o_state.o_mapping__s);
    o_state.o_mapping__a = f_get_json('o_mapping__a', o_state.o_mapping__a);
    o_state.o_mapping__d = f_get_json('o_mapping__d', o_state.o_mapping__d);

    // backlash (per motor)
    o_state.a_n_step__backlash = f_get_json('a_n_step__backlash', o_state.a_n_step__backlash);

    // setup page settings
    o_state.s_wifi_ssid = f_get('s_wifi_ssid', o_state.s_wifi_ssid);
    o_state.s_wifi_password = f_get('s_wifi_password', o_state.s_wifi_password);
    o_state.a_o_pin_config = f_get_json('a_o_pin_config', o_state.a_o_pin_config);

    // auto-redirect: if ESP IP is known, try to connect and go to control page
    f_try_auto_redirect();
};

let n_id__save_timeout = 0;

let f_save_setting = async function(s_key, v_value) {
    let s_value = typeof v_value === 'string' ? v_value : JSON.stringify(v_value);
    let o_existing = o_state.a_o_setting.find(function(o){ return o.s_key === s_key; });
    if (o_existing) {
        let o_resp = await f_send_wsmsg_with_response(
            f_o_wsmsg(o_sfunexposed__f_v_crud__indb.s_name,
                ['update', 'a_o_setting', o_existing, { s_value: s_value }]
            )
        );
        if(o_resp.v_result){
            o_existing.s_value = s_value;
            o_existing.n_ts_ms_updated = o_resp.v_result.n_ts_ms_updated;
        }
    } else {
        let o_resp = await f_send_wsmsg_with_response(
            f_o_wsmsg(o_sfunexposed__f_v_crud__indb.s_name,
                ['create', 'a_o_setting', { s_key: s_key, s_value: s_value }]
            )
        );
        if(o_resp.v_result){
            o_state.a_o_setting.push(o_resp.v_result);
        }
    }
};

let f_save_setting__debounced = function(s_key, v_value) {
    clearTimeout(n_id__save_timeout);
    n_id__save_timeout = setTimeout(function(){ f_save_setting(s_key, v_value); }, 300);
};

// ─── Auto-redirect logic ──────────────────────────────────────────────

let b_auto_redirect_attempted = false;

let f_b_probe_esp = function(s_ip) {
    return new Promise(function(resolve) {
        let o_ws = null;
        let n_id__timeout = setTimeout(function() {
            try { o_ws.close(); } catch {}
            resolve(false);
        }, 3000);
        try {
            o_ws = new WebSocket('ws://' + s_ip + '/ws');
            o_ws.onopen = function() {
                clearTimeout(n_id__timeout);
                o_ws.close();
                resolve(true);
            };
            o_ws.onerror = function() {
                clearTimeout(n_id__timeout);
                resolve(false);
            };
        } catch {
            clearTimeout(n_id__timeout);
            resolve(false);
        }
    });
};

let f_try_auto_redirect = async function() {
    if (b_auto_redirect_attempted) return;
    b_auto_redirect_attempted = true;

    if (o_state.s_ip__esp) {
        let b_reachable = await f_b_probe_esp(o_state.s_ip__esp);
        if (b_reachable) {
            o_router.push('/control');
            return;
        }
    }
    // stay on current page (setup) if ESP not reachable
};

// ─── ESP32 WebSocket (direct to hardware) ───────────────────────────

let o_ws__esp = null;
let n_id__esp_reconnect = 0;
let n_id__esp_status_poll = 0;

let f_connect_esp = function(s_ip){
    if(!s_ip) return;
    if(o_ws__esp){
        o_ws__esp.close();
    }
    clearInterval(n_id__esp_reconnect);
    clearInterval(n_id__esp_status_poll);

    o_state.s_ip__esp = s_ip;

    let f_open_ws = function(){
        try {
            o_ws__esp = new WebSocket('ws://' + s_ip + '/ws');

            o_ws__esp.onopen = function(){
                o_state.b_connected__esp = true;
                console.log('ESP32 websocket connected');
                f_send_esp({ command: 'status' });
                // push backlash config to ESP32 on connect
                for(let n_idx = 0; n_idx < o_state.a_n_step__backlash.length; n_idx++){
                    if(o_state.a_n_step__backlash[n_idx] > 0){
                        f_send_esp({ motor: n_idx, command: 'setBacklash', n_step__backlash: o_state.a_n_step__backlash[n_idx] });
                    }
                }
                n_id__esp_status_poll = setInterval(function(){
                    f_send_esp({ command: 'status' });
                }, 1000);
            };

            o_ws__esp.onmessage = function(o_evt){
                let o_data = JSON.parse(o_evt.data);
                if(o_data.type === 'status' && o_data.a_o_motor){
                    for(let n_idx = 0; n_idx < o_data.a_o_motor.length && n_idx < o_state.a_o_motor.length; n_idx++){
                        let o_src = o_data.a_o_motor[n_idx];
                        o_state.a_o_motor[n_idx].n_rpm = o_src.n_rpm;
                        o_state.a_o_motor[n_idx].s_direction = o_src.s_direction;
                        o_state.a_o_motor[n_idx].b_running = o_src.b_running;
                        o_state.a_o_motor[n_idx].n_position = o_src.n_position;
                        o_state.a_o_motor[n_idx].s_mode = o_src.s_mode;
                        o_state.a_o_motor[n_idx].n_step__remaining = o_src.n_step__remaining;
                        o_state.a_o_motor[n_idx].n_step__backlash = o_src.n_step__backlash;
                        o_state.a_o_motor[n_idx].b_compensating = o_src.b_compensating;
                    }
                }
            };

            o_ws__esp.onclose = function(){
                o_state.b_connected__esp = false;
                clearInterval(n_id__esp_status_poll);
                console.log('ESP32 websocket disconnected');
            };

            o_ws__esp.onerror = function(){
                o_state.b_connected__esp = false;
            };
        } catch(e) {
            console.error('ESP32 WS error:', e);
        }
    };

    f_open_ws();
    n_id__esp_reconnect = setInterval(function(){
        if(!o_state.b_connected__esp){
            f_open_ws();
        }
    }, 2000);
};

let f_send_esp = function(o_msg){
    if(o_ws__esp && o_ws__esp.readyState === WebSocket.OPEN){
        o_ws__esp.send(JSON.stringify(o_msg));
    }
};

// ─── ESP32 motor command helpers ─────────────────────────────────────

let f_send_esp_run_continuous = function(n_motor, n_rpm, s_direction) {
    f_send_esp({ motor: n_motor, command: 'runContinuous', n_rpm: n_rpm, direction: s_direction });
};

let f_send_esp_move_step = function(n_motor, n_step, n_rpm) {
    return new Promise(function(resolve) {
        if(!o_ws__esp || o_ws__esp.readyState !== WebSocket.OPEN){
            resolve(0);
            return;
        }
        let f_on_message = function(o_evt) {
            let o_data = JSON.parse(o_evt.data);
            if((o_data.type === 'moveComplete' || o_data.type === 'moveCancelled') && o_data.motor === n_motor){
                o_ws__esp.removeEventListener('message', f_on_message);
                resolve(o_data.n_position);
            }
        };
        o_ws__esp.addEventListener('message', f_on_message);
        f_send_esp({ motor: n_motor, command: 'moveSteps', n_step: n_step, n_rpm: n_rpm });
    });
};

let f_send_esp_set_backlash = function(n_motor, n_step__backlash) {
    f_send_esp({ motor: n_motor, command: 'setBacklash', n_step__backlash: n_step__backlash });
};

// ─── Vue Router ─────────────────────────────────────────────────────

let a_o_route = [
    { path: '/', redirect: '/setup' },
    { path: '/setup', component: o_component__page_setup },
    { path: '/control', component: o_component__page_control },
];

let o_router = createRouter({
    history: createWebHistory(),
    routes: a_o_route,
});

// ─── Connect to app server ──────────────────────────────────────────

await f_connect();

// ─── Timestamp ticker ───────────────────────────────────────────────

setInterval(function(){ o_state.n_ts_ms_now = Date.now(); }, 1000);

// ─── Mount Vue app ──────────────────────────────────────────────────

globalThis.o_state = o_state;

let o_app = createApp({
    data: function() {
        return o_state;
    },
    template: `
        <router-view />
        <div class="a_o_toast">
            <div
                v-for="o_toast in a_o_toast"
                class="o_toast"
                :class="[o_toast.s_type, { expired: n_ts_ms_now > o_toast.n_ts_ms_created + o_toast.n_ttl_ms }]"
            >{{ o_toast.s_message }}</div>
        </div>
    `,
});

o_app.component('o_component__toolbar', o_component__toolbar);
o_app.component('o_component__webcam', o_component__webcam);
o_app.component('o_component__jog', o_component__jog);
o_app.component('o_component__minimap', o_component__minimap);
o_app.component('o_component__motor', o_component__motor);
o_app.component('o_component__scan', o_component__scan);
o_app.component('o_component__camera_setting', o_component__camera_setting);

o_app.use(o_router);

globalThis.o_app = o_app;
o_app.mount('#app');

export {
    o_state,
    o_socket,
    o_router,
    f_send_wsmsg_with_response,
    f_register_handler,
    f_connect_esp,
    f_send_esp,
    f_send_esp_run_continuous,
    f_send_esp_move_step,
    f_send_esp_set_backlash,
    f_save_setting,
    f_save_setting__debounced,
}
