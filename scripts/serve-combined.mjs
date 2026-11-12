import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { build } from "./prepare-combined.mjs";
const root = path.join(build, "site");
const types = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};
createServer((req, res) => {
  try {
    let url = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (!url.startsWith("/pindou-preview/")) {
      res.writeHead(404);
      res.end();
      return;
    }
    let p = path.resolve(root, "." + url.slice("/pindou-preview".length));
    if (!p.startsWith(root + path.sep) && p !== root)
      throw new Error("Invalid path");
    if (statSync(p).isDirectory()) p = path.join(p, "index.html");
    res.writeHead(200, {
      "Content-Type": types[path.extname(p)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(readFileSync(p));
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(Number(process.env.PORT || 4400), "127.0.0.1", () =>
  console.log("Combined site on http://127.0.0.1:4400/pindou-preview/"),
);
