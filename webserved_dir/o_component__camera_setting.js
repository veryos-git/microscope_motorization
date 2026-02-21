import { o_state, f_save_setting__debounced } from './index.js';

let o_component__camera_setting = {
    name: 'component-camera-setting',
    template: `
        <div class="overlay-panel panel-camera-setting" :class="{ visible: o_state.o_panel_visibility.camera_setting }">
            <div class="panel-header">
                <h2>Camera Settings</h2>
                <button class="panel-close" @click="f_close">&times;</button>
            </div>
            <div class="panel-body">
                <div v-if="!b_stream_active" class="camera-setting-placeholder">
                    No camera stream active
                </div>
                <div v-else class="camera-setting-stack">

                    <!-- Exposure Mode -->
                    <div class="camera-setting-group" v-if="o_capability.exposureMode">
                        <div class="camera-setting-row">
                            <span class="camera-setting-label">Exposure</span>
                            <div class="mode-toggle">
                                <button
                                    class="mode-btn"
                                    :class="{ active: s_mode__exposure === 'manual' }"
                                    @click="f_set_mode('exposureMode', 'manual')"
                                >Manual</button>
                                <button
                                    class="mode-btn"
                                    :class="{ active: s_mode__exposure === 'continuous' }"
                                    @click="f_set_mode('exposureMode', 'continuous')"
                                >Auto</button>
                            </div>
                        </div>
                        <div class="camera-setting-slider" v-if="s_mode__exposure === 'manual' && o_capability.exposureTime">
                            <label>
                                <span>Exposure Time</span>
                                <span class="setting-value">{{ n_time__exposure }}</span>
                            </label>
                            <input
                                type="range"
                                :min="o_capability.exposureTime.min"
                                :max="o_capability.exposureTime.max"
                                :step="o_capability.exposureTime.step || 1"
                                v-model.number="n_time__exposure"
                                @input="f_apply_setting('exposureTime', n_time__exposure)"
                            />
                        </div>
                        <div class="camera-setting-slider" v-if="s_mode__exposure === 'continuous' && o_capability.exposureCompensation">
                            <label>
                                <span>Exposure Compensation</span>
                                <span class="setting-value">{{ n_compensation__exposure }}</span>
                            </label>
                            <input
                                type="range"
                                :min="o_capability.exposureCompensation.min"
                                :max="o_capability.exposureCompensation.max"
                                :step="o_capability.exposureCompensation.step || 1"
                                v-model.number="n_compensation__exposure"
                                @input="f_apply_setting('exposureCompensation', n_compensation__exposure)"
                            />
                        </div>
                    </div>

                    <!-- White Balance Mode -->
                    <div class="camera-setting-group" v-if="o_capability.whiteBalanceMode">
                        <div class="camera-setting-row">
                            <span class="camera-setting-label">White Balance</span>
                            <div class="mode-toggle">
                                <button
                                    class="mode-btn"
                                    :class="{ active: s_mode__white_balance === 'manual' }"
                                    @click="f_set_mode('whiteBalanceMode', 'manual')"
                                >Manual</button>
                                <button
                                    class="mode-btn"
                                    :class="{ active: s_mode__white_balance === 'continuous' }"
                                    @click="f_set_mode('whiteBalanceMode', 'continuous')"
                                >Auto</button>
                            </div>
                        </div>
                        <div class="camera-setting-slider" v-if="s_mode__white_balance === 'manual' && o_capability.colorTemperature">
                            <label>
                                <span>Color Temperature</span>
                                <span class="setting-value">{{ n_temperature__color }}K</span>
                            </label>
                            <input
                                type="range"
                                :min="o_capability.colorTemperature.min"
                                :max="o_capability.colorTemperature.max"
                                :step="o_capability.colorTemperature.step || 1"
                                v-model.number="n_temperature__color"
                                @input="f_apply_setting('colorTemperature', n_temperature__color)"
                            />
                        </div>
                    </div>

                    <!-- Focus Mode -->
                    <div class="camera-setting-group" v-if="o_capability.focusMode">
                        <div class="camera-setting-row">
                            <span class="camera-setting-label">Focus</span>
                            <div class="mode-toggle">
                                <button
                                    class="mode-btn"
                                    :class="{ active: s_mode__focus === 'manual' }"
                                    @click="f_set_mode('focusMode', 'manual')"
                                >Manual</button>
                                <button
                                    class="mode-btn"
                                    :class="{ active: s_mode__focus === 'continuous' }"
                                    @click="f_set_mode('focusMode', 'continuous')"
                                >Auto</button>
                            </div>
                        </div>
                        <div class="camera-setting-slider" v-if="s_mode__focus === 'manual' && o_capability.focusDistance">
                            <label>
                                <span>Focus Distance</span>
                                <span class="setting-value">{{ n_distance__focus }}</span>
                            </label>
                            <input
                                type="range"
                                :min="o_capability.focusDistance.min"
                                :max="o_capability.focusDistance.max"
                                :step="o_capability.focusDistance.step || 1"
                                v-model.number="n_distance__focus"
                                @input="f_apply_setting('focusDistance', n_distance__focus)"
                            />
                        </div>
                    </div>

                    <!-- Brightness -->
                    <div class="camera-setting-group" v-if="o_capability.brightness">
                        <div class="camera-setting-slider">
                            <label>
                                <span>Brightness</span>
                                <span class="setting-value">{{ n_brightness }}</span>
                            </label>
                            <input
                                type="range"
                                :min="o_capability.brightness.min"
                                :max="o_capability.brightness.max"
                                :step="o_capability.brightness.step || 1"
                                v-model.number="n_brightness"
                                @input="f_apply_setting('brightness', n_brightness)"
                            />
                        </div>
                    </div>

                    <!-- Contrast -->
                    <div class="camera-setting-group" v-if="o_capability.contrast">
                        <div class="camera-setting-slider">
                            <label>
                                <span>Contrast</span>
                                <span class="setting-value">{{ n_contrast }}</span>
                            </label>
                            <input
                                type="range"
                                :min="o_capability.contrast.min"
                                :max="o_capability.contrast.max"
                                :step="o_capability.contrast.step || 1"
                                v-model.number="n_contrast"
                                @input="f_apply_setting('contrast', n_contrast)"
                            />
                        </div>
                    </div>

                    <!-- Saturation -->
                    <div class="camera-setting-group" v-if="o_capability.saturation">
                        <div class="camera-setting-slider">
                            <label>
                                <span>Saturation</span>
                                <span class="setting-value">{{ n_saturation }}</span>
                            </label>
                            <input
                                type="range"
                                :min="o_capability.saturation.min"
                                :max="o_capability.saturation.max"
                                :step="o_capability.saturation.step || 1"
                                v-model.number="n_saturation"
                                @input="f_apply_setting('saturation', n_saturation)"
                            />
                        </div>
                    </div>

                    <!-- Sharpness -->
                    <div class="camera-setting-group" v-if="o_capability.sharpness">
                        <div class="camera-setting-slider">
                            <label>
                                <span>Sharpness</span>
                                <span class="setting-value">{{ n_sharpness }}</span>
                            </label>
                            <input
                                type="range"
                                :min="o_capability.sharpness.min"
                                :max="o_capability.sharpness.max"
                                :step="o_capability.sharpness.step || 1"
                                v-model.number="n_sharpness"
                                @input="f_apply_setting('sharpness', n_sharpness)"
                            />
                        </div>
                    </div>

                    <!-- Zoom -->
                    <div class="camera-setting-group" v-if="o_capability.zoom">
                        <div class="camera-setting-slider">
                            <label>
                                <span>Zoom</span>
                                <span class="setting-value">{{ n_zoom.toFixed(1) }}x</span>
                            </label>
                            <input
                                type="range"
                                :min="o_capability.zoom.min"
                                :max="o_capability.zoom.max"
                                :step="o_capability.zoom.step || 0.1"
                                v-model.number="n_zoom"
                                @input="f_apply_setting('zoom', n_zoom)"
                            />
                        </div>
                    </div>

                </div>
            </div>
        </div>
    `,
    data: function() {
        return {
            o_state: o_state,
            b_stream_active: false,
            o_capability: {},
            // mode setting
            s_mode__exposure: 'manual',
            s_mode__white_balance: 'continuous',
            s_mode__focus: 'continuous',
            // numeric setting
            n_time__exposure: 0,
            n_compensation__exposure: 0,
            n_temperature__color: 4000,
            n_distance__focus: 0,
            n_brightness: 128,
            n_contrast: 128,
            n_saturation: 128,
            n_sharpness: 128,
            n_zoom: 1,
        };
    },
    watch: {
        'o_state.b_streaming__webcam': function(b_new) {
            let o_self = this;
            if (b_new) {
                setTimeout(function(){ o_self.f_read_and_apply(); }, 500);
            } else {
                o_self.b_stream_active = false;
                o_self.o_capability = {};
            }
        },
        'o_state.o_panel_visibility.camera_setting': function(b_visible) {
            if (b_visible && o_state.b_streaming__webcam) {
                this.f_read_capability();
            }
        },
    },
    methods: {
        f_o_track: function() {
            let el_video = document.getElementById('webcamVideo');
            if (el_video && el_video.srcObject) {
                let a_o_track = el_video.srcObject.getVideoTracks();
                if (a_o_track.length > 0) return a_o_track[0];
            }
            return null;
        },
        f_read_capability: function() {
            let o_self = this;
            let o_track = o_self.f_o_track();
            if (!o_track) {
                o_self.b_stream_active = false;
                return;
            }
            o_self.b_stream_active = true;

            let o_cap = {};
            try { o_cap = o_track.getCapabilities(); } catch(e) { console.warn('getCapabilities not supported', e); }
            let o_current = {};
            try { o_current = o_track.getSettings(); } catch(e) {}

            o_self.o_capability = o_cap;

            if (o_cap.exposureMode) {
                o_self.s_mode__exposure = o_current.exposureMode || 'manual';
            }
            if (o_cap.exposureTime) {
                o_self.n_time__exposure = o_current.exposureTime || o_cap.exposureTime.min;
            }
            if (o_cap.exposureCompensation) {
                o_self.n_compensation__exposure = o_current.exposureCompensation || 0;
            }
            if (o_cap.whiteBalanceMode) {
                o_self.s_mode__white_balance = o_current.whiteBalanceMode || 'continuous';
            }
            if (o_cap.colorTemperature) {
                o_self.n_temperature__color = o_current.colorTemperature || o_cap.colorTemperature.min;
            }
            if (o_cap.focusMode) {
                o_self.s_mode__focus = o_current.focusMode || 'continuous';
            }
            if (o_cap.focusDistance) {
                o_self.n_distance__focus = o_current.focusDistance || o_cap.focusDistance.min;
            }
            if (o_cap.brightness) {
                o_self.n_brightness = o_current.brightness !== undefined ? o_current.brightness : 128;
            }
            if (o_cap.contrast) {
                o_self.n_contrast = o_current.contrast !== undefined ? o_current.contrast : 128;
            }
            if (o_cap.saturation) {
                o_self.n_saturation = o_current.saturation !== undefined ? o_current.saturation : 128;
            }
            if (o_cap.sharpness) {
                o_self.n_sharpness = o_current.sharpness !== undefined ? o_current.sharpness : 128;
            }
            if (o_cap.zoom) {
                o_self.n_zoom = o_current.zoom || 1;
            }
        },
        f_read_and_apply: async function() {
            let o_self = this;
            let o_track = o_self.f_o_track();
            if (!o_track) {
                o_self.b_stream_active = false;
                return;
            }
            o_self.b_stream_active = true;

            let o_cap = {};
            try { o_cap = o_track.getCapabilities(); } catch(e) { return; }
            o_self.o_capability = o_cap;

            // load saved setting from DB
            let o_saved = null;
            let o_entry = o_state.a_o_setting.find(function(o){ return o.s_key === 'o_camera_setting'; });
            if (o_entry) {
                try { o_saved = JSON.parse(o_entry.s_value); } catch(e) {}
            }

            // apply exposure mode (default: manual = auto exposure OFF)
            if (o_cap.exposureMode) {
                let s_mode = (o_saved && o_saved.s_mode__exposure) || 'manual';
                try {
                    await o_track.applyConstraints({ advanced: [{ exposureMode: s_mode }] });
                    o_self.s_mode__exposure = s_mode;
                } catch(e) { console.warn('Could not set exposureMode', e); }

                if (s_mode === 'manual' && o_cap.exposureTime && o_saved && o_saved.n_time__exposure) {
                    try {
                        await o_track.applyConstraints({ advanced: [{ exposureTime: o_saved.n_time__exposure }] });
                        o_self.n_time__exposure = o_saved.n_time__exposure;
                    } catch(e) {}
                } else if (o_cap.exposureTime) {
                    let o_current = {};
                    try { o_current = o_track.getSettings(); } catch(e) {}
                    o_self.n_time__exposure = o_current.exposureTime || o_cap.exposureTime.min;
                }

                if (s_mode === 'continuous' && o_cap.exposureCompensation && o_saved && o_saved.n_compensation__exposure !== undefined) {
                    try {
                        await o_track.applyConstraints({ advanced: [{ exposureCompensation: o_saved.n_compensation__exposure }] });
                        o_self.n_compensation__exposure = o_saved.n_compensation__exposure;
                    } catch(e) {}
                }
            }

            // apply white balance
            if (o_cap.whiteBalanceMode) {
                let s_mode = (o_saved && o_saved.s_mode__white_balance) || 'continuous';
                try {
                    await o_track.applyConstraints({ advanced: [{ whiteBalanceMode: s_mode }] });
                    o_self.s_mode__white_balance = s_mode;
                } catch(e) {}

                if (s_mode === 'manual' && o_cap.colorTemperature && o_saved && o_saved.n_temperature__color) {
                    try {
                        await o_track.applyConstraints({ advanced: [{ colorTemperature: o_saved.n_temperature__color }] });
                        o_self.n_temperature__color = o_saved.n_temperature__color;
                    } catch(e) {}
                }
            }

            // apply focus
            if (o_cap.focusMode) {
                let s_mode = (o_saved && o_saved.s_mode__focus) || 'continuous';
                try {
                    await o_track.applyConstraints({ advanced: [{ focusMode: s_mode }] });
                    o_self.s_mode__focus = s_mode;
                } catch(e) {}

                if (s_mode === 'manual' && o_cap.focusDistance && o_saved && o_saved.n_distance__focus) {
                    try {
                        await o_track.applyConstraints({ advanced: [{ focusDistance: o_saved.n_distance__focus }] });
                        o_self.n_distance__focus = o_saved.n_distance__focus;
                    } catch(e) {}
                }
            }

            // apply numeric setting
            let a_o_numeric = [
                { s_api: 'brightness', s_local: 'n_brightness' },
                { s_api: 'contrast', s_local: 'n_contrast' },
                { s_api: 'saturation', s_local: 'n_saturation' },
                { s_api: 'sharpness', s_local: 'n_sharpness' },
                { s_api: 'zoom', s_local: 'n_zoom' },
            ];
            for (let n_idx = 0; n_idx < a_o_numeric.length; n_idx++) {
                let o_item = a_o_numeric[n_idx];
                if (o_cap[o_item.s_api] && o_saved && o_saved[o_item.s_local] !== undefined) {
                    try {
                        let o_constraint = {};
                        o_constraint[o_item.s_api] = o_saved[o_item.s_local];
                        await o_track.applyConstraints({ advanced: [o_constraint] });
                        o_self[o_item.s_local] = o_saved[o_item.s_local];
                    } catch(e) {}
                }
            }

            // read back current values for anything not set from saved
            let o_final = {};
            try { o_final = o_track.getSettings(); } catch(e) {}
            if (o_cap.whiteBalanceMode && !o_saved) {
                o_self.s_mode__white_balance = o_final.whiteBalanceMode || 'continuous';
            }
            if (o_cap.colorTemperature && !(o_saved && o_saved.n_temperature__color)) {
                o_self.n_temperature__color = o_final.colorTemperature || o_cap.colorTemperature.min;
            }
            if (o_cap.focusMode && !o_saved) {
                o_self.s_mode__focus = o_final.focusMode || 'continuous';
            }
            if (o_cap.focusDistance && !(o_saved && o_saved.n_distance__focus)) {
                o_self.n_distance__focus = o_final.focusDistance || o_cap.focusDistance.min;
            }
            if (o_cap.brightness && !(o_saved && o_saved.n_brightness !== undefined)) {
                o_self.n_brightness = o_final.brightness !== undefined ? o_final.brightness : 128;
            }
            if (o_cap.contrast && !(o_saved && o_saved.n_contrast !== undefined)) {
                o_self.n_contrast = o_final.contrast !== undefined ? o_final.contrast : 128;
            }
            if (o_cap.saturation && !(o_saved && o_saved.n_saturation !== undefined)) {
                o_self.n_saturation = o_final.saturation !== undefined ? o_final.saturation : 128;
            }
            if (o_cap.sharpness && !(o_saved && o_saved.n_sharpness !== undefined)) {
                o_self.n_sharpness = o_final.sharpness !== undefined ? o_final.sharpness : 128;
            }
            if (o_cap.zoom && !(o_saved && o_saved.n_zoom !== undefined)) {
                o_self.n_zoom = o_final.zoom || 1;
            }
            if (o_cap.exposureCompensation && !(o_saved && o_saved.n_compensation__exposure !== undefined)) {
                o_self.n_compensation__exposure = o_final.exposureCompensation || 0;
            }
        },
        f_set_mode: async function(s_api_name, s_value) {
            let o_self = this;
            let o_track = o_self.f_o_track();
            if (!o_track) return;

            try {
                let o_constraint = {};
                o_constraint[s_api_name] = s_value;
                await o_track.applyConstraints({ advanced: [o_constraint] });

                if (s_api_name === 'exposureMode') o_self.s_mode__exposure = s_value;
                if (s_api_name === 'whiteBalanceMode') o_self.s_mode__white_balance = s_value;
                if (s_api_name === 'focusMode') o_self.s_mode__focus = s_value;

                f_save_setting__debounced('o_camera_setting', o_self.f_o_snapshot());
            } catch(e) {
                console.warn('Failed to set mode:', s_api_name, s_value, e);
            }
        },
        f_apply_setting: async function(s_api_name, v_value) {
            let o_self = this;
            let o_track = o_self.f_o_track();
            if (!o_track) return;

            try {
                let o_constraint = {};
                o_constraint[s_api_name] = v_value;
                await o_track.applyConstraints({ advanced: [o_constraint] });

                f_save_setting__debounced('o_camera_setting', o_self.f_o_snapshot());
            } catch(e) {
                console.warn('Failed to apply setting:', s_api_name, v_value, e);
            }
        },
        f_o_snapshot: function() {
            let o_self = this;
            return {
                s_mode__exposure: o_self.s_mode__exposure,
                n_time__exposure: o_self.n_time__exposure,
                n_compensation__exposure: o_self.n_compensation__exposure,
                s_mode__white_balance: o_self.s_mode__white_balance,
                n_temperature__color: o_self.n_temperature__color,
                s_mode__focus: o_self.s_mode__focus,
                n_distance__focus: o_self.n_distance__focus,
                n_brightness: o_self.n_brightness,
                n_contrast: o_self.n_contrast,
                n_saturation: o_self.n_saturation,
                n_sharpness: o_self.n_sharpness,
                n_zoom: o_self.n_zoom,
            };
        },
        f_close: function() {
            o_state.o_panel_visibility.camera_setting = false;
            f_save_setting__debounced('o_panel_visibility', o_state.o_panel_visibility);
        },
    },
    mounted: function() {
        if (o_state.b_streaming__webcam) {
            this.f_read_and_apply();
        }
    },
};

export { o_component__camera_setting };
