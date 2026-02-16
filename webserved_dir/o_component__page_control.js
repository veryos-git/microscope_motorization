import { o_state, f_connect_esp } from './index.js';

let o_component__page_control = {
    name: 'page-control',
    template: `
        <o_component__webcam />
        <o_component__toolbar />
        <o_component__jog />
        <o_component__minimap />
        <o_component__motor />
    `,
    data: function() {
        return {
            o_state: o_state,
        };
    },
    mounted: function() {
        if (o_state.s_ip__esp && !o_state.b_connected__esp) {
            f_connect_esp(o_state.s_ip__esp);
        }
    },
};

export { o_component__page_control };
