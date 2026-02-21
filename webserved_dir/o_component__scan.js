import { o_state, f_send_esp, f_send_esp_move_step, f_send_wsmsg_with_response, f_save_setting__debounced } from './index.js';
import { f_o_wsmsg } from './constructors.module.js';

let N_RPM__SCAN = 8.0;
let N_MS__SETTLE = 500;
let N_MS__MOVE_TIMEOUT = 30000;

let o_component__scan = {
    name: 'component-scan',
    template: `
        <div class="overlay-panel panel-scan" :class="{ visible: o_state.o_panel_visibility.scan }">
            <div class="panel-header">
                <h2>Tile Scan</h2>
                <button class="panel-close" @click="f_close" :disabled="s_status === 'scanning'">&times;</button>
            </div>
            <div class="panel-body">

                <!-- ── Config (idle) ─────────────────────── -->
                <template v-if="s_status === 'idle'">

                    <div class="scan-section">
                        <div class="scan-label">Movement Distance (steps)</div>
                        <div class="scan-hint">
                            Set slightly less than camera field of view so adjacent
                            tiles overlap. Overlap is needed for stitching.
                        </div>

                        <div class="scan-field">
                            <label>X distance</label>
                            <div class="scan-field-row">
                                <input
                                    type="number"
                                    v-model.number="n_step__x"
                                    min="1"
                                    @change="f_save_config"
                                >
                                <button
                                    class="btn-small"
                                    @click="f_test_distance('x', 1)"
                                    :disabled="b_testing || !o_state.b_connected__esp"
                                >Test +X</button>
                                <button
                                    class="btn-small"
                                    @click="f_test_distance('x', -1)"
                                    :disabled="b_testing || !o_state.b_connected__esp"
                                >Test &minus;X</button>
                            </div>
                        </div>

                        <div class="scan-field">
                            <label>Y distance</label>
                            <div class="scan-field-row">
                                <input
                                    type="number"
                                    v-model.number="n_step__y"
                                    min="1"
                                    @change="f_save_config"
                                >
                                <button
                                    class="btn-small"
                                    @click="f_test_distance('y', 1)"
                                    :disabled="b_testing || !o_state.b_connected__esp"
                                >Test +Y</button>
                                <button
                                    class="btn-small"
                                    @click="f_test_distance('y', -1)"
                                    :disabled="b_testing || !o_state.b_connected__esp"
                                >Test &minus;Y</button>
                            </div>
                        </div>
                    </div>

                    <div class="scan-section">
                        <div class="scan-label">Tile Grid</div>

                        <div class="scan-field">
                            <label>X tiles (columns)</label>
                            <input
                                type="number"
                                v-model.number="n_tile_x"
                                min="1" max="100"
                                @change="f_save_config"
                            >
                        </div>

                        <div class="scan-field">
                            <label>Y tiles (rows)</label>
                            <input
                                type="number"
                                v-model.number="n_tile_y"
                                min="1" max="100"
                                @change="f_save_config"
                            >
                        </div>

                        <div class="scan-total">
                            {{ n_tile_x }} &times; {{ n_tile_y }} = {{ n_tile_x * n_tile_y }} images
                        </div>
                    </div>

                    <button
                        class="btn-scan-start"
                        @click="f_start_scan"
                        :disabled="!o_state.b_connected__esp || n_step__x < 1 || n_step__y < 1 || n_tile_x < 1 || n_tile_y < 1"
                    >Start Scan</button>
                </template>

                <!-- ── Progress (scanning) ───────────────── -->
                <template v-if="s_status === 'scanning'">
                    <div class="scan-progress-text">{{ s_status__detail }}</div>

                    <div class="scan-progress-count">
                        Capturing {{ n_cnt__tile__captured + 1 }} / {{ n_tile_x * n_tile_y }}
                    </div>

                    <div
                        class="scan-grid"
                        :style="{ 'grid-template-columns': 'repeat(' + n_tile_x + ', 1fr)' }"
                    >
                        <div
                            v-for="n_idx in (n_tile_x * n_tile_y)"
                            :key="n_idx"
                            class="scan-grid-cell"
                            :class="{
                                captured: a_b_captured[n_idx - 1],
                                current: (n_idx - 1) === n_idx__cell__current
                            }"
                        ></div>
                    </div>

                    <div class="scan-elapsed">Elapsed: {{ s_elapsed }}</div>

                    <button class="btn-scan-stop" @click="f_stop_scan">Stop Scan</button>
                </template>

                <!-- ── Summary (complete) ────────────────── -->
                <template v-if="s_status === 'complete'">
                    <div class="scan-summary">
                        <div class="scan-summary-item">
                            <span class="scan-summary-label">Images captured</span>
                            <span class="scan-summary-value">{{ n_cnt__tile__captured }} / {{ n_tile_x * n_tile_y }}</span>
                        </div>
                        <div class="scan-summary-item">
                            <span class="scan-summary-label">Folder</span>
                            <span class="scan-summary-value scan-summary-path">{{ s_path_folder__scan }}</span>
                        </div>
                        <div class="scan-summary-item">
                            <span class="scan-summary-label">Duration</span>
                            <span class="scan-summary-value">{{ s_elapsed }}</span>
                        </div>
                    </div>
                    <button class="btn-scan-start" @click="f_reset">New Scan</button>
                </template>

            </div>
        </div>
    `,

    data: function() {
        return {
            o_state: o_state,

            // config
            n_step__x: 50,
            n_step__y: 30,
            n_tile_x: 3,
            n_tile_y: 3,

            // state machine: 'idle' | 'scanning' | 'complete'
            s_status: 'idle',
            s_status__detail: '',
            b_testing: false,
            b_stop_requested: false,

            // progress
            n_cnt__tile__captured: 0,
            n_idx__cell__current: -1,
            a_b_captured: [],
            n_ts_ms__start: 0,
            s_path_folder__scan: '',

            // elapsed timer
            n_id__elapsed_interval: 0,
            s_elapsed: '0:00',
        };
    },

    mounted: function() {
        this.f_load_config();
    },

    methods: {

        // ── Panel ────────────────────────────────────────────────────

        f_close: function() {
            if (this.s_status === 'scanning') return;
            o_state.o_panel_visibility.scan = false;
            f_save_setting__debounced('o_panel_visibility', o_state.o_panel_visibility);
        },

        // ── Config persistence ───────────────────────────────────────

        f_load_config: function() {
            let o_self = this;
            let o_setting = o_state.a_o_setting.find(function(o) {
                return o.s_key === 'o_config__scan';
            });
            if (o_setting && o_setting.s_value) {
                try {
                    let o_config = JSON.parse(o_setting.s_value);
                    if (o_config.n_step__x) o_self.n_step__x = o_config.n_step__x;
                    if (o_config.n_step__y) o_self.n_step__y = o_config.n_step__y;
                    if (o_config.n_tile_x) o_self.n_tile_x = o_config.n_tile_x;
                    if (o_config.n_tile_y) o_self.n_tile_y = o_config.n_tile_y;
                } catch (e) { /* ignore parse errors */ }
            }
        },

        f_save_config: function() {
            f_save_setting__debounced('o_config__scan', {
                n_step__x: this.n_step__x,
                n_step__y: this.n_step__y,
                n_tile_x: this.n_tile_x,
                n_tile_y: this.n_tile_y,
            });
        },

        // ── Motor helpers ────────────────────────────────────────────

        f_move_motor_n_step: async function(n_motor, n_step) {
            let o_self = this;
            if (n_step === 0) return;
            if (o_self.b_stop_requested) return;

            let o_promise__move = f_send_esp_move_step(n_motor, n_step, N_RPM__SCAN);
            let o_promise__timeout = new Promise(function(resolve) {
                setTimeout(function() { resolve('timeout'); }, N_MS__MOVE_TIMEOUT);
            });

            let v_result = await Promise.race([o_promise__move, o_promise__timeout]);
            if (v_result === 'timeout') {
                console.warn('Move timeout: motor', n_motor);
                f_send_esp({ motor: n_motor, command: 'stop' });
            }
        },

        f_delay: function(n_ms) {
            return new Promise(function(resolve) { setTimeout(resolve, n_ms); });
        },

        // ── Image capture ────────────────────────────────────────────

        f_capture_frame: function() {
            return new Promise(function(resolve, reject) {
                let el_video = document.getElementById('webcamVideo');
                if (!el_video || !el_video.srcObject || el_video.readyState < 2) {
                    reject(new Error('No webcam stream available'));
                    return;
                }

                let el_canvas = document.createElement('canvas');
                el_canvas.width = el_video.videoWidth;
                el_canvas.height = el_video.videoHeight;
                let o_ctx = el_canvas.getContext('2d');
                o_ctx.drawImage(el_video, 0, 0);

                el_canvas.toBlob(function(o_blob) {
                    if (o_blob) {
                        resolve(o_blob);
                    } else {
                        reject(new Error('Failed to capture frame'));
                    }
                }, 'image/jpeg', 0.92);
            });
        },

        f_save_image: async function(o_blob, s_filename) {
            let o_self = this;
            let o_array_buffer = await o_blob.arrayBuffer();
            let o_response = await fetch(
                '/api/scan/save_image'
                    + '?s_path_folder=' + encodeURIComponent(o_self.s_path_folder__scan)
                    + '&s_filename=' + encodeURIComponent(s_filename),
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/octet-stream' },
                    body: o_array_buffer,
                }
            );
            if (!o_response.ok) {
                throw new Error('Failed to save image: ' + o_response.statusText);
            }
        },

        // ── Test distance ────────────────────────────────────────────

        f_test_distance: async function(s_axis, n_sign) {
            let o_self = this;
            o_self.b_testing = true;
            try {
                let n_motor = (s_axis === 'x') ? 0 : 1;
                let n_step = (s_axis === 'x') ? o_self.n_step__x : o_self.n_step__y;
                await o_self.f_move_motor_n_step(n_motor, n_step * n_sign);
            } catch (e) {
                console.error('Test distance error:', e);
            }
            o_self.b_testing = false;
        },

        // ── Scan path builder ────────────────────────────────────────

        f_a_o_tile__path: function() {
            let o_self = this;
            let a_o_tile = [];
            for (let n_row = 0; n_row < o_self.n_tile_y; n_row++) {
                let b_reverse = n_row % 2 === 1;
                for (let n_col = 0; n_col < o_self.n_tile_x; n_col++) {
                    let n_col__actual = b_reverse ? (o_self.n_tile_x - 1 - n_col) : n_col;
                    a_o_tile.push({ n_row: n_row, n_col: n_col__actual });
                }
            }
            return a_o_tile;
        },

        // ── Elapsed timer ────────────────────────────────────────────

        f_start_elapsed_timer: function() {
            let o_self = this;
            o_self.n_ts_ms__start = Date.now();
            o_self.s_elapsed = '0:00';
            o_self.n_id__elapsed_interval = setInterval(function() {
                let n_sec__total = Math.floor((Date.now() - o_self.n_ts_ms__start) / 1000);
                let n_min = Math.floor(n_sec__total / 60);
                let n_sec = n_sec__total % 60;
                o_self.s_elapsed = n_min + ':' + String(n_sec).padStart(2, '0');
            }, 1000);
        },

        f_stop_elapsed_timer: function() {
            clearInterval(this.n_id__elapsed_interval);
        },

        // ── Main scan execution ──────────────────────────────────────

        f_start_scan: async function() {
            let o_self = this;

            // create scan folder on server
            let o_resp = await f_send_wsmsg_with_response(
                f_o_wsmsg('scan_create_folder', {})
            );
            if (!o_resp.v_result || !o_resp.v_result.s_path_folder) {
                console.error('Failed to create scan folder');
                return;
            }
            o_self.s_path_folder__scan = o_resp.v_result.s_path_folder;

            // init scan state
            o_state.b_scanning = true;
            o_self.s_status = 'scanning';
            o_self.b_stop_requested = false;
            o_self.n_cnt__tile__captured = 0;
            o_self.n_idx__cell__current = -1;
            o_self.a_b_captured = new Array(o_self.n_tile_x * o_self.n_tile_y).fill(false);
            o_self.f_start_elapsed_timer();

            let a_o_tile = o_self.f_a_o_tile__path();

            for (let n_idx = 0; n_idx < a_o_tile.length; n_idx++) {
                if (o_self.b_stop_requested) break;
                if (!o_state.b_connected__esp) {
                    o_self.b_stop_requested = true;
                    break;
                }

                let o_tile = a_o_tile[n_idx];
                let n_idx__cell = o_tile.n_row * o_self.n_tile_x + o_tile.n_col;
                o_self.n_idx__cell__current = n_idx__cell;

                // move to tile position (skip for first tile)
                if (n_idx > 0) {
                    let o_tile__prev = a_o_tile[n_idx - 1];
                    let n_delta_col = o_tile.n_col - o_tile__prev.n_col;
                    let n_delta_row = o_tile.n_row - o_tile__prev.n_row;

                    if (n_delta_col !== 0) {
                        o_self.s_status__detail = 'Moving X...';
                        await o_self.f_move_motor_n_step(0, n_delta_col * o_self.n_step__x);
                        if (o_self.b_stop_requested) break;
                    }

                    if (n_delta_row !== 0) {
                        o_self.s_status__detail = 'Moving Y...';
                        await o_self.f_move_motor_n_step(1, n_delta_row * o_self.n_step__y);
                        if (o_self.b_stop_requested) break;
                    }
                }

                // wait for vibration to settle
                o_self.s_status__detail = 'Settling...';
                await o_self.f_delay(N_MS__SETTLE);
                if (o_self.b_stop_requested) break;

                // capture and save image
                let s_filename = 'tile_r'
                    + String(o_tile.n_row).padStart(2, '0')
                    + '_c'
                    + String(o_tile.n_col).padStart(2, '0')
                    + '.jpg';
                o_self.s_status__detail = 'Capturing ' + s_filename;

                try {
                    let o_blob = await o_self.f_capture_frame();
                    await o_self.f_save_image(o_blob, s_filename);
                    o_self.a_b_captured[n_idx__cell] = true;
                    o_self.n_cnt__tile__captured++;
                } catch (e) {
                    console.error('Capture error at tile r' + o_tile.n_row + ' c' + o_tile.n_col + ':', e);
                }
            }

            // scan finished
            o_self.f_stop_elapsed_timer();
            o_state.b_scanning = false;
            o_self.n_idx__cell__current = -1;
            o_self.s_status = 'complete';
            o_self.s_status__detail = '';

            console.log(
                'Scan ' + (o_self.b_stop_requested ? 'stopped' : 'complete')
                + ': ' + o_self.n_cnt__tile__captured + '/' + (o_self.n_tile_x * o_self.n_tile_y)
                + ' tiles captured in ' + o_self.s_elapsed
            );
        },

        f_stop_scan: function() {
            this.b_stop_requested = true;
            f_send_esp({ command: 'stopAll' });
        },

        f_reset: function() {
            this.s_status = 'idle';
            this.n_cnt__tile__captured = 0;
            this.n_idx__cell__current = -1;
            this.a_b_captured = [];
            this.s_path_folder__scan = '';
            this.s_elapsed = '0:00';
        },
    },

    beforeUnmount: function() {
        if (this.s_status === 'scanning') {
            this.f_stop_scan();
        }
        this.f_stop_elapsed_timer();
    },
};

export { o_component__scan };
