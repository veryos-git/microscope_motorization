/**
 * Deno static file server for the stepper motor control UI.
 *
 * Usage:
 *   deno run --allow-net --allow-read server.ts
 *   deno run --allow-net --allow-read server.ts --port 3000 --esp 192.168.1.42
 *
 * Flags:
 *   --port <number>   HTTP port (default: 8000)
 *   --esp  <ip>       ESP32 IP, injected into the served HTML (default: prompt in UI)
 */

const args = parseArgs(Deno.args);
const PORT = Number(args.port ?? 8000);
const ESP_IP = args.esp ?? "";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const PUBLIC_DIR = new URL("./public/", import.meta.url);

Deno.serve({ port: PORT }, async (req: Request) => {
  const url = new URL(req.url);
  let pathname = url.pathname === "/" ? "/index.html" : url.pathname;

  // Prevent directory traversal
  if (pathname.includes("..")) {
    return new Response("Forbidden", { status: 403 });
  }

  const filePath = new URL("." + pathname, PUBLIC_DIR);

  try {
    let body: BodyInit;
    const ext = pathname.substring(pathname.lastIndexOf("."));
    const contentType = MIME[ext] ?? "application/octet-stream";

    if (ext === ".html" && ESP_IP) {
      // Inject ESP_IP into HTML so the JS knows where to connect
      let html = await Deno.readTextFile(filePath);
      html = html.replace(
        "<!--ESP_IP_INJECT-->",
        `<script>window.__ESP_IP__ = "${ESP_IP}";</script>`
      );
      body = html;
    } else {
      body = await Deno.readFile(filePath);
    }

    return new Response(body, {
      headers: { "Content-Type": contentType },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
});

console.log(`\n  Stepper Control UI`);
console.log(`  ──────────────────────────────`);
console.log(`  Server:  http://localhost:${PORT}`);
if (ESP_IP) {
  console.log(`  ESP32:   ${ESP_IP} (injected)`);
} else {
  console.log(`  ESP32:   enter IP in the UI`);
}
console.log(`  ──────────────────────────────\n`);

// ─── Arg parser ─────────────────────────────────────────────────────

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--") && i + 1 < args.length) {
      result[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return result;
}
