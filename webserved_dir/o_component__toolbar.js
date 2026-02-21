import { o_state, o_router, f_connect_esp, f_save_setting, f_save_setting__debounced } from './index.js';

let o_component__toolbar = {
    name: 'component-toolbar',
    template: `
        <div class="toolbar">
            <span class="toolbar-title">&#9881; Stepper</span>
            <button class="toolbar-toggle" @click="f_go_setup">Setup</button>
            <div class="toolbar-sep"></div>

            <div class="toolbar-ip">
                <input
                    type="text"
                    v-model="o_state.s_ip__esp"
                    placeholder="ESP32 IP"
                />
                <button @click="f_on_connect">Connect</button>
            </div>

            <div class="toolbar-sep"></div>

            <button
                class="toolbar-toggle"
                :class="{ active: o_state.o_panel_visibility.jog }"
                @click="f_toggle_panel('jog')"
            >Jog</button>
            <button
                class="toolbar-toggle"
                :class="{ active: o_state.o_panel_visibility.minimap }"
                @click="f_toggle_panel('minimap')"
            >Map</button>
            <button
                class="toolbar-toggle"
                :class="{ active: o_state.o_panel_visibility.motors }"
                @click="f_toggle_panel('motors')"
            >Motors</button>
            <button
                class="toolbar-toggle"
                :class="{ active: o_state.o_panel_visibility.scan }"
                @click="f_toggle_panel('scan')"
            >Scan</button>
            <button
                class="toolbar-toggle"
                :class="{ active: o_state.o_panel_visibility.camera_setting }"
                @click="f_toggle_panel('camera_setting')"
            >Cam</button>

            <div class="toolbar-spacer"></div>

            <select
                v-model="o_state.s_id__webcam_device"
                @change="f_on_webcam_change"
            >
                <option value="">-- camera --</option>
                <option
                    v-for="o_dev in o_state.a_o_device__webcam"
                    :value="o_dev.deviceId"
                >{{ o_dev.label || o_dev.deviceId }}</option>
            </select>

            <div
                class="conn-badge"
                :class="{ connected: o_state.b_connected__esp }"
            >
                <span class="dot"></span>
                <span>{{ o_state.b_connected__esp ? 'connected' : 'disconnected' }}</span>
            </div>
        </div>
    `,
    data: function() {
        return {
            o_state: o_state,
        };
    },
    methods: {
        f_on_connect: function() {
            f_connect_esp(o_state.s_ip__esp);
            f_save_setting('s_ip__esp', o_state.s_ip__esp);
        },
        f_toggle_panel: function(s_name) {
            o_state.o_panel_visibility[s_name] = !o_state.o_panel_visibility[s_name];
            f_save_setting__debounced('o_panel_visibility', o_state.o_panel_visibility);
        },
        f_on_webcam_change: function() {
            f_save_setting__debounced('s_id__webcam_device', o_state.s_id__webcam_device);
        },
        f_go_setup: function() {
            o_router.push('/setup');
        },
    },
};

export { o_component__toolbar };
