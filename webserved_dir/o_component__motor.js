import { o_state, f_send_esp, f_save_setting__debounced } from './index.js';

let a_o_motor_config = [
    { s_name: 'Motor A', s_gpio: '4, 5, 6, 7' },
    { s_name: 'Motor B', s_gpio: '15, 16, 17, 18' },
    { s_name: 'Motor C', s_gpio: '8, 9, 10, 11' },
];

let o_component__motor = {
    name: 'component-motor',
    template: `
        <div class="overlay-panel panel-motors" :class="{ visible: o_state.o_panel_visibility.motors }">
            <div class="panel-header">
                <h2>Motors</h2>
                <button class="panel-close" @click="f_close">&times;</button>
            </div>
            <div class="panel-body">
                <div class="motors-stack">
                    <div
                        class="motor-card"
                        v-for="(o_config, n_idx) in a_o_motor_config"
                        :key="n_idx"
                    >
                        <div class="card-header">
                            <h2>{{ o_config.s_name }}</h2>
                            <span class="motor-id">GPIO {{ o_config.s_gpio }}</span>
                        </div>
                        <div class="position-display">
                            Position: <strong>{{ o_state.a_o_motor[n_idx].n_position }}</strong> steps
                        </div>
                        <div class="control-group">
                            <label>
                                Speed
                                <span class="speed-value">{{ o_state.a_o_motor[n_idx].n_speed }}%</span>
                            </label>
                            <input
                                type="range"
                                min="0" max="100"
                                :value="o_state.a_o_motor[n_idx].n_speed"
                                @input="f_on_speed_change(n_idx, $event)"
                            >
                        </div>
                        <div class="control-group">
                            <label>Direction</label>
                            <div class="dir-toggle">
                                <button
                                    class="dir-btn"
                                    :class="{ active: o_state.a_o_motor[n_idx].s_direction === 'cw' }"
                                    @click="f_set_dir(n_idx, 'cw')"
                                >CW</button>
                                <button
                                    class="dir-btn"
                                    :class="{ active: o_state.a_o_motor[n_idx].s_direction === 'ccw' }"
                                    @click="f_set_dir(n_idx, 'ccw')"
                                >CCW</button>
                            </div>
                        </div>
                        <button class="stop-btn" @click="f_stop_motor(n_idx)">&#9632; Stop</button>
                    </div>
                </div>
                <div class="global-bar">
                    <button class="global-btn stop-all" @click="f_stop_all">&#9632; Stop All</button>
                    <button class="global-btn" @click="f_request_status">&#8635; Refresh</button>
                </div>
            </div>
        </div>
    `,
    data: function() {
        return {
            o_state: o_state,
            a_o_motor_config: a_o_motor_config,
            a_n_id__debounce: [0, 0, 0],
        };
    },
    methods: {
        f_close: function() {
            o_state.o_panel_visibility.motors = false;
            f_save_setting__debounced('o_panel_visibility', o_state.o_panel_visibility);
        },
        f_on_speed_change: function(n_idx, o_evt) {
            let o_self = this;
            let n_speed = parseInt(o_evt.target.value, 10);
            o_state.a_o_motor[n_idx].n_speed = n_speed;
            clearTimeout(o_self.a_n_id__debounce[n_idx]);
            o_self.a_n_id__debounce[n_idx] = setTimeout(function() {
                f_send_esp({
                    motor: n_idx,
                    speed: n_speed,
                    direction: o_state.a_o_motor[n_idx].s_direction,
                });
            }, 50);
        },
        f_set_dir: function(n_idx, s_dir) {
            o_state.a_o_motor[n_idx].s_direction = s_dir;
            if (o_state.a_o_motor[n_idx].b_running) {
                f_send_esp({
                    motor: n_idx,
                    speed: o_state.a_o_motor[n_idx].n_speed,
                    direction: s_dir,
                });
            }
        },
        f_stop_motor: function(n_idx) {
            f_send_esp({ motor: n_idx, command: 'stop' });
        },
        f_stop_all: function() {
            f_send_esp({ command: 'stopAll' });
        },
        f_request_status: function() {
            f_send_esp({ command: 'status' });
        },
    },
};

export { o_component__motor };
