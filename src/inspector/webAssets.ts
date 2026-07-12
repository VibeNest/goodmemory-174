import { access, readFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { brotliDecompress } from "node:zlib";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_WEB_ROOTS = [
  join(MODULE_DIR, "inspector-web"),
  join(MODULE_DIR, "..", "..", "dist", "inspector-web"),
];
const decompressBrotli = promisify(brotliDecompress);

export async function serveInspectorWeb(
  request: Request,
  configuredRoot?: string,
): Promise<Response> {
  const webRoot = configuredRoot ?? await findWebRoot();
  if (!webRoot) {
    return new Response(
      "GoodMemory Inspector web assets are missing. Run `bun run build:inspector-web`.\n",
      { status: 503 },
    );
  }
  const url = new URL(request.url);
  let assetPath = "index.html";
  if (url.pathname.startsWith("/assets/")) {
    try {
      assetPath = decodeURIComponent(url.pathname.slice(1));
    } catch {
      return new Response("Not found.\n", { status: 404 });
    }
  }
  const path = resolve(webRoot, assetPath);
  if (path !== resolve(webRoot, "index.html") && !path.startsWith(`${resolve(webRoot)}${sep}`)) {
    return new Response("Not found.\n", { status: 404 });
  }
  try {
    const asset = await readWebAsset(path, acceptsBrotli(request));
    const body = request.method.toUpperCase() === "HEAD"
      ? null
      : new Uint8Array(asset.body);
    return new Response(body, {
      headers: staticHeaders(assetPath, asset.encoding),
      status: 200,
    });
  } catch {
    return new Response("Not found.\n", { status: 404 });
  }
}

async function findWebRoot(): Promise<string | undefined> {
  for (const candidate of DEFAULT_WEB_ROOTS) {
    try {
      await access(join(candidate, "index.html"));
      return candidate;
    } catch {
      // Try the source-tree or packaged location next.
    }
  }
  return undefined;
}

async function readWebAsset(
  path: string,
  serveBrotli: boolean,
): Promise<{ body: Buffer; encoding?: "br" }> {
  try {
    return { body: await readFile(path) };
  } catch {
    const compressed = await readFile(`${path}.br`);
    return serveBrotli
      ? { body: compressed, encoding: "br" }
      : { body: await decompressBrotli(compressed) };
  }
}

function acceptsBrotli(request: Request): boolean {
  return (request.headers.get("accept-encoding") ?? "")
    .split(",")
    .some((entry) => {
      const [encoding, ...parameters] = entry.split(";");
      return encoding?.trim() === "br" &&
        !parameters.some((parameter) => /^q=0(?:\.0*)?$/u.test(parameter.trim()));
    });
}

function staticHeaders(path: string, encoding?: "br"): Headers {
  const asset = path !== "index.html";
  const headers = new Headers({
    "cache-control": asset
      ? "public, max-age=31536000, immutable"
      : "no-store",
    "content-security-policy":
      "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    "content-type": contentType(path),
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  if (path !== "index.html" && encoding) {
    headers.set("content-encoding", encoding);
  }
  if (path !== "index.html" && (path.endsWith(".js") || path.endsWith(".css"))) {
    headers.set("vary", "Accept-Encoding");
  }
  return headers;
}

function contentType(path: string): string {
  switch (extname(path)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "text/html; charset=utf-8";
  }
}
