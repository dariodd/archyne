#!/usr/bin/env node
/**
 * `npx archyne` — serve the built editor from this package and open it.
 *
 * Archyne is static files, so "running" it is just serving a directory. This
 * exists so that trying it costs one command instead of a clone, an install
 * and a build; that difference is most of whether an evaluation happens.
 *
 * No dependencies on purpose: a tool whose pitch is "nothing leaves your
 * machine" should not pull a server framework to show you a local page.
 *
 * Binds to 127.0.0.1 deliberately. `--host` opts into a LAN-visible server,
 * which is occasionally what you want for a tablet and never what you want by
 * accident — the editor has no authentication because it has no accounts.
 *
 *   npx archyne
 *   npx archyne diagram.mmd
 *   npx archyne --port 8080 --host --no-open
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "dist");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
};

function parseArgs(argv) {
  const opts = { port: 4173, open: true, host: false, file: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--port" || arg === "-p") opts.port = Number(argv[++i]);
    else if (arg.startsWith("--port=")) opts.port = Number(arg.slice(7));
    else if (arg === "--no-open") opts.open = false;
    else if (arg === "--host") opts.host = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--version" || arg === "-v") opts.version = true;
    else if (!arg.startsWith("-")) opts.file = arg;
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

if (opts.help) {
  console.log(`archyne — a visual editor for Mermaid diagrams

  npx archyne [file.mmd] [options]

  -p, --port <n>   port to listen on (default 4173)
      --host       also listen on the LAN, not just 127.0.0.1
      --no-open    do not open a browser
  -h, --help       this message
  -v, --version    print the version

Everything runs locally: the editor is static files and makes no network
requests of its own. Diagrams stay in your browser and your filesystem.`);
  process.exit(0);
}

if (opts.version) {
  const pkg = JSON.parse(
    await readFile(resolve(fileURLToPath(import.meta.url), "..", "..", "package.json"), "utf8"),
  );
  console.log(pkg.version);
  process.exit(0);
}

if (!Number.isInteger(opts.port) || opts.port < 1 || opts.port > 65535) {
  console.error(`Not a usable port: ${opts.port}`);
  process.exit(1);
}

try {
  await stat(join(ROOT, "index.html"));
} catch {
  console.error(
    `No build found at ${ROOT}.\n` +
      `If you are running from a git checkout, run \`npm run build\` first.`,
  );
  process.exit(1);
}

/**
 * A diagram given on the command line is handed over through `?code=`, which
 * is the same share-link path the app already supports. URLs are not a
 * reliable transport for arbitrarily large files, so oversize ones are left
 * for the editor's own Open command rather than silently truncated.
 */
const MAX_INLINE_BYTES = 32 * 1024;
let query = "";
if (opts.file) {
  try {
    const code = await readFile(opts.file, "utf8");
    if (Buffer.byteLength(code) > MAX_INLINE_BYTES) {
      console.warn(
        `${opts.file} is larger than ${MAX_INLINE_BYTES / 1024} KB — open it from inside the editor instead.`,
      );
    } else {
      query = `?code=${encodeURIComponent(code)}`;
    }
  } catch (err) {
    console.error(`Could not read ${opts.file}: ${err.message}`);
    process.exit(1);
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const requested = decodeURIComponent(url.pathname);
    // Resolve inside ROOT and verify it stayed there: `..` segments and
    // encoded separators must not reach the rest of the filesystem.
    const candidate = normalize(join(ROOT, requested === "/" ? "/index.html" : requested));
    if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    const body = await readFile(candidate);
    res.writeHead(200, {
      "content-type": TYPES[extname(candidate).toLowerCase()] ?? "application/octet-stream",
      // The build is content-hashed except for index.html, which must not be
      // cached or a stale shell survives an upgrade.
      "cache-control": candidate.endsWith("index.html")
        ? "no-cache"
        : "public, max-age=31536000, immutable",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${opts.port} is already in use — try \`--port ${opts.port + 1}\`.`);
    process.exit(1);
  }
  throw err;
});

server.listen(opts.port, opts.host ? "0.0.0.0" : "127.0.0.1", () => {
  const url = `http://localhost:${opts.port}/${query}`;
  console.log(`Archyne is running at http://localhost:${opts.port}/`);
  if (opts.host)
    console.log("Also reachable on your local network (--host). There is no login.");
  console.log("Press Ctrl+C to stop.");
  if (opts.open) {
    const [cmd, args] =
      process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : process.platform === "darwin"
          ? ["open", [url]]
          : ["xdg-open", [url]];
    // Best effort: a headless box has no browser, and that is not an error.
    spawn(cmd, args, { stdio: "ignore", detached: true })
      .on("error", () => {})
      .unref();
  }
});
