const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "out");
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 43123);

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function send(res, status, body, headers) {
  res.writeHead(status, headers);
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/__runtime") {
    send(res, 200, JSON.stringify({ canQuit: true, kind: "server" }), {
      "Content-Type": "application/json; charset=utf-8",
    });
    return;
  }
  if (url.pathname === "/__shutdown") {
    send(res, 200, JSON.stringify({ ok: true }), {
      "Content-Type": "application/json; charset=utf-8",
    });
    setTimeout(() => process.exit(0), 150);
    return;
  }

  let rel = decodeURIComponent(url.pathname);
  if (!rel || rel === "/") rel = "/index.html";
  if (rel.endsWith("/")) rel += "index.html";

  const filePath = path.normalize(path.join(ROOT, rel));
  const root = path.normalize(ROOT + path.sep);
  if (!filePath.startsWith(root) && filePath !== path.normalize(ROOT)) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (rel !== "/index.html") {
        fs.readFile(path.join(ROOT, "index.html"), (fallbackErr, html) => {
          if (fallbackErr) {
            send(res, 404, "Not found");
            return;
          }
          send(res, 200, html, { "Content-Type": MIME[".html"] });
        });
        return;
      }
      send(res, 404, "Not found. Run npm run build first.");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, data, { "Content-Type": MIME[ext] || "application/octet-stream" });
  });
});

if (!fs.existsSync(path.join(ROOT, "index.html"))) {
  console.error("No static build found. Run npm run build first.");
  process.exit(1);
}

server.listen(PORT, HOST, () => {
  console.log(`LogCutter at http://localhost:${PORT}`);
});
