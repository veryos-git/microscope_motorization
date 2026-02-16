
import {
    f_db_delete_table_data,
    f_init_db,
    f_v_crud__indb,
} from "./database_functions.module.js";
import {
    a_o_model,
    f_o_model__from_s_name_table,
    f_o_model_instance,
    o_model__o_wsclient,
    a_o_sfunexposed,
    f_s_name_table__from_o_model,
    f_o_wsmsg,
    f_o_toast,
} from "./webserved_dir/constructors.module.js";
import {
    s_ds,
    s_root_dir,
} from "./runtimedata.module.js";
import {
    f_o_detect_esp_usb,
    f_o_check_arduino_cli,
    f_flash_esp,
} from "./flash_functions.module.js";

f_init_db();

// ─── CLI args ───────────────────────────────────────────────────────

let n_port = 8000;
let s_ip__esp = '';

let a_s_arg = Deno.args;
for(let n_idx = 0; n_idx < a_s_arg.length; n_idx++){
    if(a_s_arg[n_idx] === '--port' && a_s_arg[n_idx + 1]){
        n_port = parseInt(a_s_arg[n_idx + 1], 10);
        n_idx++;
    }
    if(a_s_arg[n_idx] === '--esp' && a_s_arg[n_idx + 1]){
        s_ip__esp = a_s_arg[n_idx + 1];
        n_idx++;
    }
}

// ─── Content type detection ─────────────────────────────────────────

let f_s_content_type = function(s_path) {
    if (s_path.endsWith('.html')) return 'text/html';
    if (s_path.endsWith('.js')) return 'application/javascript';
    if (s_path.endsWith('.css')) return 'text/css';
    if (s_path.endsWith('.json')) return 'application/json';
    if (s_path.endsWith('.png')) return 'image/png';
    if (s_path.endsWith('.jpg') || s_path.endsWith('.jpeg')) return 'image/jpeg';
    if (s_path.endsWith('.gif')) return 'image/gif';
    if (s_path.endsWith('.svg')) return 'image/svg+xml';
    if (s_path.endsWith('.ico')) return 'image/x-icon';
    if (s_path.endsWith('.webp')) return 'image/webp';
    return 'application/octet-stream';
};

// ─── Request handler ────────────────────────────────────────────────

let f_handler = async function(o_request, o_conninfo) {

    // ── WebSocket upgrade ───────────────────────────────────────────
    if (o_request.headers.get('upgrade') === 'websocket') {
        let { socket: o_socket, response: o_response } = Deno.upgradeWebSocket(o_request);

        let s_ip = o_request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || o_conninfo.remoteAddr.hostname;

        let o_wsclient = f_o_model_instance(
            o_model__o_wsclient,
            { s_ip }
        );
        let s_name_table__wsclient = f_s_name_table__from_o_model(o_model__o_wsclient);
        let o_wsclient_db = f_v_crud__indb(
            'read',
            s_name_table__wsclient,
            o_wsclient
        )?.at(0);
        if(!o_wsclient_db){
            o_wsclient_db = f_v_crud__indb(
                'create',
                s_name_table__wsclient,
                o_wsclient,
                true
            );
        }

        o_socket.onopen = async function() {
            console.log('websocket connected');
            // send init message with ESP IP from CLI
            o_socket.send(JSON.stringify({
                s_type: 'init',
                s_root_dir: s_root_dir,
                s_ip__esp: s_ip__esp,
            }));

            // send all model data
            for(let o_model of a_o_model){
                o_socket.send(JSON.stringify({
                    o_model: o_model,
                    v_data: (await f_v_crud__indb(
                            'read',
                            f_s_name_table__from_o_model(o_model)
                        )
                    )
                }));
            }
        };

        o_socket.onmessage = async function(o_evt) {
            let o_data = JSON.parse(o_evt.data);

            let o_sfunexposed = a_o_sfunexposed.find(function(o){ return o.s_name === o_data.s_type; });
            if(o_sfunexposed){
                try {
                    let a_v_arg = Array.isArray(o_data.v_data) ? o_data.v_data : [];
                    let AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
                    let f = new AsyncFunction('f_v_crud__indb', 'f_o_model__from_s_name_table', 'f_delete_table_data', 'Deno', '...a_v_arg', o_sfunexposed.s_f);
                    let v_result = await f(f_v_crud__indb, f_o_model__from_s_name_table, f_db_delete_table_data, Deno, ...a_v_arg);
                    o_socket.send(JSON.stringify({
                        v_result,
                        s_uuid: o_data.s_uuid,
                    }));
                } catch (o_error) {
                    console.error('Error in exposed function:', o_sfunexposed.s_name, o_error);
                    o_socket.send(JSON.stringify({ error: o_error.message, s_uuid: o_data.s_uuid }));
                    o_socket.send(JSON.stringify(
                        f_o_wsmsg(
                            'toast',
                            f_o_toast(
                                `${o_sfunexposed.s_name}: ${o_error.message}`,
                                'error',
                                Date.now(),
                                8000
                            )
                        )
                    ));
                }
            }
            if(o_data.s_type === 'hello_from_client'){
                o_socket.send(JSON.stringify({
                    s_type: 'hello_from_server',
                    v_data: { s_message: 'Hello from server!' },
                    s_uuid: o_data.s_uuid,
                }))
            }

            // ── Flash-related message handlers ──────────────────────
            if(o_data.s_type === 'check_arduino_cli'){
                let o_result = await f_o_check_arduino_cli();
                o_socket.send(JSON.stringify({
                    s_type: 'check_arduino_cli_result',
                    v_data: o_result,
                    s_uuid: o_data.s_uuid,
                }));
            }

            if(o_data.s_type === 'detect_esp_usb'){
                let o_result = await f_o_detect_esp_usb();
                o_socket.send(JSON.stringify({
                    s_type: 'detect_esp_usb_result',
                    v_data: o_result,
                    s_uuid: o_data.s_uuid,
                }));
            }

            if(o_data.s_type === 'flash_esp'){
                let v = o_data.v_data;
                let f_on_line = function(s_line, s_source){
                    try {
                        o_socket.send(JSON.stringify({
                            s_type: 'flash_progress',
                            v_data: { s_line, s_source },
                        }));
                    } catch { /* socket may have closed */ }
                };

                let o_result = await f_flash_esp(
                    v.s_port,
                    v.s_wifi_ssid,
                    v.s_wifi_password,
                    v.a_o_pin_config,
                    f_on_line,
                );

                // update stored ESP IP if flash succeeded
                if(o_result.b_success && o_result.s_ip__esp){
                    s_ip__esp = o_result.s_ip__esp;
                }

                o_socket.send(JSON.stringify({
                    s_type: 'flash_result',
                    v_data: o_result,
                    s_uuid: o_data.s_uuid,
                }));
            }
        };

        o_socket.onclose = function() {
            console.log('websocket disconnected');
        };

        return o_response;
    }

    // ── HTTP routing ────────────────────────────────────────────────

    let o_url = new URL(o_request.url);
    let s_path = o_url.pathname;

    // exposed functions via HTTP
    let o_sfunexposed = a_o_sfunexposed.find(function(o){ return o.s_name === s_path.slice('/api/'.length); });
    if(o_sfunexposed){
        try {
            let o_data = await o_request.json();
            let a_v_arg = Array.isArray(o_data.v_data) ? o_data.v_data : [];
            let AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
            let f = new AsyncFunction('f_v_crud__indb', 'f_o_model__from_s_name_table', 'f_delete_table_data', 'Deno', '...a_v_arg', o_sfunexposed.s_f);
            let v_result = await f(f_v_crud__indb, f_o_model__from_s_name_table, f_db_delete_table_data, Deno, ...a_v_arg);
            return new Response(JSON.stringify({ v_result }), {
                headers: { 'content-type': 'application/json' },
            });
        } catch (o_error) {
            console.error('Error in exposed function:', o_sfunexposed.s_name, o_error);
            return new Response('Error: ' + o_error.message, { status: 500 });
        }
    }

    // serve file from absolute path
    if (s_path === '/api/file') {
        let s_path_file = o_url.searchParams.get('path');
        if (!s_path_file) {
            return new Response('Missing path parameter', { status: 400 });
        }
        try {
            let a_n_byte = await Deno.readFile(s_path_file);
            let s_content_type = f_s_content_type(s_path_file);
            return new Response(a_n_byte, {
                headers: { 'content-type': s_content_type },
            });
        } catch {
            return new Response('File not found', { status: 404 });
        }
    }

    // serve static file from webserved_dir
    if (s_path === '/') {
        s_path = '/index.html';
    }

    try {
        let s_path_file = `./webserved_dir${s_path}`.replace(/\//g, s_ds);
        let a_n_byte = await Deno.readFile(s_path_file);
        let s_content_type = f_s_content_type(s_path);
        return new Response(a_n_byte, {
            headers: { 'content-type': s_content_type },
        });
    } catch {
        // SPA fallback: serve index.html for navigation routes (e.g. /setup, /control)
        if(!s_path.startsWith('/api/')){
            try {
                let a_n_byte = await Deno.readFile(`./webserved_dir/index.html`);
                return new Response(a_n_byte, {
                    headers: { 'content-type': 'text/html' },
                });
            } catch { /* fall through */ }
        }
        return new Response('Not Found', { status: 404 });
    }
};

Deno.serve({
    port: n_port,
    onListen() {
        console.log(`server running on http://localhost:${n_port}`);
    },
}, f_handler);
