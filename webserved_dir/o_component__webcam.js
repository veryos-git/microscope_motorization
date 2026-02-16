import { o_state, f_save_setting__debounced } from './index.js';

let o_component__webcam = {
    name: 'component-webcam',
    template: `
        <video
            ref="el_video"
            id="webcamVideo"
            autoplay
            playsinline
            muted
            :style="{ display: b_streaming ? 'block' : 'none' }"
        ></video>
        <div id="webcamPlaceholder" v-if="!b_streaming">
            <span>No camera active</span>
            <span style="font-size:0.75rem;">select a camera in the toolbar above</span>
        </div>
    `,
    data: function() {
        return {
            o_state: o_state,
            b_streaming: false,
            o_stream: null,
        };
    },
    mounted: function() {
        let o_self = this;
        o_self.f_enumerate_webcam();
    },
    watch: {
        'o_state.s_id__webcam_device': function(s_id__new) {
            if(s_id__new){
                this.f_start_webcam(s_id__new);
            } else {
                this.f_stop_webcam();
            }
        }
    },
    methods: {
        f_enumerate_webcam: async function() {
            let o_self = this;
            try {
                // need temporary stream to get device labels
                let o_temp_stream = await navigator.mediaDevices.getUserMedia({ video: true });
                o_temp_stream.getTracks().forEach(function(o_track){ o_track.stop(); });

                let a_o_device = await navigator.mediaDevices.enumerateDevices();
                o_state.a_o_device__webcam = a_o_device.filter(function(o_dev){
                    return o_dev.kind === 'videoinput';
                });

                // auto-start saved device
                if(o_state.s_id__webcam_device){
                    let b_found = o_state.a_o_device__webcam.some(function(o_dev){
                        return o_dev.deviceId === o_state.s_id__webcam_device;
                    });
                    if(b_found){
                        o_self.f_start_webcam(o_state.s_id__webcam_device);
                    }
                }
            } catch(e) {
                console.warn('Webcam enumeration failed:', e);
            }
        },
        f_start_webcam: async function(s_device_id) {
            let o_self = this;
            o_self.f_stop_webcam();
            try {
                o_self.o_stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        deviceId: { exact: s_device_id },
                        width: { ideal: 1920 },
                        height: { ideal: 1080 },
                    }
                });
                o_self.$refs.el_video.srcObject = o_self.o_stream;
                o_self.b_streaming = true;
            } catch(e) {
                console.error('Webcam start failed:', e);
                o_self.b_streaming = false;
            }
        },
        f_stop_webcam: function() {
            let o_self = this;
            if(o_self.o_stream){
                o_self.o_stream.getTracks().forEach(function(o_track){ o_track.stop(); });
                o_self.o_stream = null;
            }
            o_self.b_streaming = false;
        },
    },
    beforeUnmount: function() {
        this.f_stop_webcam();
    },
};

export { o_component__webcam };
