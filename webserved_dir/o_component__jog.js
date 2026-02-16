import { o_state, f_send_esp, f_save_setting, f_save_setting__debounced } from './index.js';

// ─── Gamepad constants ──────────────────────────────────────────────

let N_DEADZONE = 0.15;
let N_MS__GAMEPAD_POLL = 50;

let o_component__jog = {
    name: 'component-jog',
    template: `
        <div class="overlay-panel panel-jog" :class="{ visible: o_state.o_panel_visibility.jog }">
            <div class="panel-header">
                <h2>Keyboard Jog</h2>
                <button class="panel-close" @click="f_close">&times;</button>
            </div>
            <div class="panel-body">
                <div class="keybind-body">
                    <div>
                        <div class="wasd-visual">
                            <div class="wasd-row">
                                <div class="key-spacer"></div>
                                <div class="key-cap" :class="{ pressed: o_state.o_key_held['w'] }">W</div>
                                <div class="key-spacer"></div>
                            </div>
                            <div class="wasd-row">
                                <div class="key-cap" :class="{ pressed: o_state.o_key_held['a'] }">A</div>
                                <div class="key-cap" :class="{ pressed: o_state.o_key_held['s'] }">S</div>
                                <div class="key-cap" :class="{ pressed: o_state.o_key_held['d'] }">D</div>
                            </div>
                        </div>
                        <div class="jog-speed-group" style="margin-top: 12px;">
                            <label>Jog Speed <span class="speed-value">{{ o_state.n_speed__jog }}%</span></label>
                            <input
                                type="range"
                                min="1" max="100"
                                v-model.number="o_state.n_speed__jog"
                                @input="f_on_speed_change"
                            >
                            <input
                                type="number"
                                min="1" max="100"
                                v-model.number="o_state.n_speed__jog"
                                @input="f_on_speed_change"
                                style="width:52px; margin-top:4px; background:rgba(10,10,12,0.6); border:1px solid var(--border); border-radius:6px; padding:4px 6px; color:var(--text); font-family:'JetBrains Mono',monospace; font-size:0.7rem; text-align:center; outline:none;"
                            >
                        </div>
                    </div>
                    <div class="mapping-grid">
                        <div class="mapping-row header">
                            <span>Key</span>
                            <span>Motor</span>
                            <span>Dir</span>
                        </div>
                        <div class="mapping-row" v-for="s_key in ['w','s','a','d']" :key="s_key">
                            <span class="key-label">{{ s_key.toUpperCase() }}</span>
                            <select
                                v-model="f_o_mapping(s_key).s_motor"
                                @change="f_on_mapping_change(s_key)"
                            >
                                <option value="none">&mdash;</option>
                                <option value="0">M0</option>
                                <option value="1">M1</option>
                                <option value="2">M2</option>
                            </select>
                            <select
                                v-model="f_o_mapping(s_key).s_dir"
                                @change="f_on_mapping_change(s_key)"
                            >
                                <option value="cw">CW</option>
                                <option value="ccw">CCW</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Gamepad section -->
                <div class="gamepad-section">
                    <div class="gamepad-header">Gamepad</div>
                    <div
                        class="gamepad-status"
                        :class="{ connected: o_state.b_connected__gamepad }"
                    >
                        <span class="gamepad-dot"></span>
                        <span>{{ o_state.b_connected__gamepad ? o_state.s_name__gamepad : 'connect a USB gamepad as a controller' }}</span>
                    </div>
                </div>
            </div>
        </div>
    `,
    data: function() {
        return {
            o_state: o_state,
            n_id__gamepad_interval: 0,
            n_axis_x__prev: 0,
            n_axis_y__prev: 0,
        };
    },
    methods: {
        f_o_mapping: function(s_key) {
            return o_state['o_mapping__' + s_key];
        },
        f_close: function() {
            o_state.o_panel_visibility.jog = false;
            f_save_setting__debounced('o_panel_visibility', o_state.o_panel_visibility);
        },
        f_on_speed_change: function() {
            f_save_setting__debounced('n_speed__jog', String(o_state.n_speed__jog));
        },
        f_on_mapping_change: function(s_key) {
            f_save_setting('o_mapping__' + s_key, o_state['o_mapping__' + s_key]);
        },

        // ─── Keyboard jog ───────────────────────────────────────────

        f_get_mapping: function(s_key) {
            let o_map = o_state['o_mapping__' + s_key];
            if(!o_map || o_map.s_motor === 'none') return null;
            return { motor: parseInt(o_map.s_motor, 10), direction: o_map.s_dir };
        },
        f_on_keydown: function(o_evt) {
            let o_self = this;
            let s_key = o_evt.key.toLowerCase();
            if(!['w','a','s','d'].includes(s_key)) return;
            if(o_state.o_key_held[s_key]) return; // already held
            o_state.o_key_held[s_key] = true;

            let o_mapping = o_self.f_get_mapping(s_key);
            if(o_mapping){
                f_send_esp({ motor: o_mapping.motor, speed: o_state.n_speed__jog, direction: o_mapping.direction });
            }
        },
        f_on_keyup: function(o_evt) {
            let o_self = this;
            let s_key = o_evt.key.toLowerCase();
            if(!['w','a','s','d'].includes(s_key)) return;
            o_state.o_key_held[s_key] = false;

            let o_mapping = o_self.f_get_mapping(s_key);
            if(o_mapping){
                f_send_esp({ motor: o_mapping.motor, command: 'stop' });
            }
        },
        f_on_blur: function() {
            // stop all held keys on window blur
            for(let s_key of ['w','a','s','d']){
                if(o_state.o_key_held[s_key]){
                    o_state.o_key_held[s_key] = false;
                    let o_mapping = this.f_get_mapping(s_key);
                    if(o_mapping){
                        f_send_esp({ motor: o_mapping.motor, command: 'stop' });
                    }
                }
            }
        },

        // ─── Gamepad ────────────────────────────────────────────────

        f_on_gamepad_connected: function(o_evt) {
            let o_self = this;
            o_state.b_connected__gamepad = true;
            o_state.s_name__gamepad = o_evt.gamepad.id;
            console.log('Gamepad connected:', o_evt.gamepad.id);
            if(!o_self.n_id__gamepad_interval){
                o_self.n_id__gamepad_interval = setInterval(function(){ o_self.f_poll_gamepad(); }, N_MS__GAMEPAD_POLL);
            }
        },
        f_on_gamepad_disconnected: function(o_evt) {
            let o_self = this;
            console.log('Gamepad disconnected:', o_evt.gamepad.id);
            o_self.f_gamepad_stop_axis('x');
            o_self.f_gamepad_stop_axis('y');
            o_self.n_axis_x__prev = 0;
            o_self.n_axis_y__prev = 0;

            let a_o_gamepad = navigator.getGamepads();
            let b_any = false;
            let s_name__remaining = '';
            for(let o_gp of a_o_gamepad){
                if(o_gp){ b_any = true; s_name__remaining = o_gp.id; break; }
            }
            if(!b_any){
                clearInterval(o_self.n_id__gamepad_interval);
                o_self.n_id__gamepad_interval = 0;
                o_state.b_connected__gamepad = false;
                o_state.s_name__gamepad = '';
            } else {
                o_state.s_name__gamepad = s_name__remaining;
            }
        },
        f_apply_deadzone: function(n_val) {
            if(Math.abs(n_val) < N_DEADZONE) return 0;
            let n_sign = n_val > 0 ? 1 : -1;
            return n_sign * (Math.abs(n_val) - N_DEADZONE) / (1 - N_DEADZONE);
        },
        f_gamepad_stop_axis: function(s_axis) {
            let o_self = this;
            if(s_axis === 'x'){
                let o_map = o_self.f_get_mapping('a') || o_self.f_get_mapping('d');
                if(o_map) f_send_esp({ motor: o_map.motor, command: 'stop' });
            } else {
                let o_map = o_self.f_get_mapping('w') || o_self.f_get_mapping('s');
                if(o_map) f_send_esp({ motor: o_map.motor, command: 'stop' });
            }
        },
        f_gamepad_drive_axis: function(s_axis, n_val) {
            let o_self = this;
            let s_key_neg, s_key_pos;
            if(s_axis === 'x'){ s_key_neg = 'a'; s_key_pos = 'd'; }
            else { s_key_neg = 'w'; s_key_pos = 's'; }

            let s_key = n_val < 0 ? s_key_neg : s_key_pos;
            let o_mapping = o_self.f_get_mapping(s_key);
            if(!o_mapping) return;

            let n_speed = Math.round(Math.abs(n_val) * o_state.n_speed__jog);
            if(n_speed <= 0) return;

            f_send_esp({ motor: o_mapping.motor, speed: n_speed, direction: o_mapping.direction });
        },
        f_poll_gamepad: function() {
            let o_self = this;
            let a_o_gamepad = navigator.getGamepads();
            let o_gamepad = null;
            for(let o_gp of a_o_gamepad){
                if(o_gp){ o_gamepad = o_gp; break; }
            }
            if(!o_gamepad) return;

            let n_axis_x = o_self.f_apply_deadzone(o_gamepad.axes[0] ?? 0);
            let n_axis_y = o_self.f_apply_deadzone(o_gamepad.axes[1] ?? 0);

            let b_keyboard_x = o_state.o_key_held['a'] || o_state.o_key_held['d'];
            let b_keyboard_y = o_state.o_key_held['w'] || o_state.o_key_held['s'];

            // X axis
            if(!b_keyboard_x){
                let b_was_active = o_self.n_axis_x__prev !== 0;
                let b_now_active = n_axis_x !== 0;
                if(b_now_active){
                    o_self.f_gamepad_drive_axis('x', n_axis_x);
                } else if(b_was_active && !b_now_active){
                    o_self.f_gamepad_stop_axis('x');
                }
            }

            // Y axis
            if(!b_keyboard_y){
                let b_was_active = o_self.n_axis_y__prev !== 0;
                let b_now_active = n_axis_y !== 0;
                if(b_now_active){
                    o_self.f_gamepad_drive_axis('y', n_axis_y);
                } else if(b_was_active && !b_now_active){
                    o_self.f_gamepad_stop_axis('y');
                }
            }

            o_self.n_axis_x__prev = n_axis_x;
            o_self.n_axis_y__prev = n_axis_y;
        },
    },
    mounted: function() {
        let o_self = this;
        // keyboard listeners
        o_self._f_on_keydown = function(e){ o_self.f_on_keydown(e); };
        o_self._f_on_keyup = function(e){ o_self.f_on_keyup(e); };
        o_self._f_on_blur = function(){ o_self.f_on_blur(); };
        document.addEventListener('keydown', o_self._f_on_keydown);
        document.addEventListener('keyup', o_self._f_on_keyup);
        window.addEventListener('blur', o_self._f_on_blur);

        // gamepad listeners
        o_self._f_on_gamepad_connected = function(e){ o_self.f_on_gamepad_connected(e); };
        o_self._f_on_gamepad_disconnected = function(e){ o_self.f_on_gamepad_disconnected(e); };
        window.addEventListener('gamepadconnected', o_self._f_on_gamepad_connected);
        window.addEventListener('gamepaddisconnected', o_self._f_on_gamepad_disconnected);
    },
    beforeUnmount: function() {
        let o_self = this;
        document.removeEventListener('keydown', o_self._f_on_keydown);
        document.removeEventListener('keyup', o_self._f_on_keyup);
        window.removeEventListener('blur', o_self._f_on_blur);
        window.removeEventListener('gamepadconnected', o_self._f_on_gamepad_connected);
        window.removeEventListener('gamepaddisconnected', o_self._f_on_gamepad_disconnected);
        clearInterval(o_self.n_id__gamepad_interval);
    },
};

export { o_component__jog };
