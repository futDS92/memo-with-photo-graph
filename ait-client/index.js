import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = join(__dirname, "dist");
const port = Number(process.env.PORT || 3000);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function safePath(requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const normalized = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  return join(rootDir, normalized);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    let pathname = url.pathname;
    if (pathname === "/") pathname = "/index.html";
    const filePath = safePath(pathname);

    try {
      const data = await readFile(filePath);
      const type = mimeTypes[extname(filePath)] || "application/octet-stream";
      res.writeHead(200, {
        "content-type": type,
        "cache-control": "no-store",
      });
      res.end(data);
      return;
    } catch {
      const index = await readFile(join(rootDir, "index.html"));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(index.toString("utf8"));
    }
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: String(error?.message || error) }));
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`memo with photo graph ait client running at http://localhost:${port}`);
});
