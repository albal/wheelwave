const ARTIFACT_PREFIX = "packages/";
const MANIFEST_KEY = "simple/manifest-v1.json";

// PEP 503-ish normalization: lowercase, collapse runs of [-_.] -> -
function normalizeProject(name) {
  return String(name).toLowerCase().replace(/[-_.]+/g, "-");
}

function htmlEscape(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Very small in-memory cache per isolate
let manifestCache = null; // { loadedAtMs:number, etag?:string, data:object }

async function loadManifest(env) {
  const now = Date.now();
  const TTL_MS = 60_000; // keep /simple/ fairly fresh

  if (manifestCache && (now - manifestCache.loadedAtMs) < TTL_MS) {
    return manifestCache.data;
  }

  // Try conditional GET if we have an ETag (R2 provides httpEtag in Workers API)
  const onlyIf = new Headers();
  if (manifestCache?.etag) onlyIf.set("If-None-Match", manifestCache.etag);

  const obj = await env.PYPI_BUCKET.get(MANIFEST_KEY, { onlyIf });
  if (!obj) {
    // No manifest uploaded yet
    manifestCache = { loadedAtMs: now, etag: undefined, data: null };
    return null;
  }

  // If precondition not modified, obj may be metadata-only; simplest is: if no body, reuse cached data
  if (!obj.body) {
    return manifestCache?.data ?? null;
  }

  const text = await obj.text();
  const data = JSON.parse(text);

  manifestCache = { loadedAtMs: now, etag: obj.httpEtag, data };
  return data;
}

function htmlHeaders(ttlSeconds = 60) {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": `public, max-age=${ttlSeconds}`,
  };
}

function artifactHeaders(etag) {
  const h = {
    // artifacts should be immutable; cache hard
    "Cache-Control": "public, max-age=31536000, immutable",
  };
  if (etag) h["ETag"] = etag;
  return h;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    if (path === "/") return Response.redirect(`${url.origin}/simple/`, 302);
    if (path === "/simple") return Response.redirect(`${url.origin}/simple/`, 301);

    // Serve artifacts: /packages/<filename>
    if (path.startsWith("/packages/")) {
      const key = path.replace(/^\/+/, ""); // "packages/<filename>"
      const obj = await env.PYPI_BUCKET.get(key, { range: request.headers, onlyIf: request.headers });
      if (!obj) return new Response("Not Found", { status: 404 });

      const headers = new Headers(artifactHeaders(obj.httpEtag));
      obj.writeHttpMetadata?.(headers);

      if (!headers.has("Content-Type")) {
        if (key.endsWith(".whl")) headers.set("Content-Type", "application/octet-stream");
        else if (key.endsWith(".tar.gz")) headers.set("Content-Type", "application/gzip");
      }

      if (request.method === "HEAD") return new Response(null, { status: 200, headers });
      return new Response(obj.body, { status: 200, headers });
    }

    // /simple/ -> list projects
    if (path === "/simple/") {
      const manifest = await loadManifest(env);

      if (!manifest?.projects || typeof manifest.projects !== "object") {
        const body = `<!doctype html><html><head><meta charset="utf-8"><title>Simple Index</title></head>
<body><h1>Simple Index</h1><p><em>No manifest uploaded yet.</em></p></body></html>`;
        return new Response(body, { status: 200, headers: htmlHeaders(30) });
      }

      const projects = Object.keys(manifest.projects)
        .map(normalizeProject)
        .sort((a, b) => a.localeCompare(b));

      const links = projects
        .map((p) => `<a href="/simple/${encodeURIComponent(p)}/">${htmlEscape(p)}</a>`)
        .join("<br/>\n");

      const body = `<!doctype html><html><head><meta charset="utf-8"><title>Simple Index</title></head>
<body><h1>Simple Index</h1>${links || "<em>(no packages)</em>"}</body></html>`;

      return new Response(body, { status: 200, headers: htmlHeaders(60) });
    }

    // /simple/<project>/ -> list files for that project
    const m = path.match(/^\/simple\/([^/]+)\/$/);
    if (m) {
      const project = normalizeProject(decodeURIComponent(m[1]));
      const manifest = await loadManifest(env);

      const files = Array.isArray(manifest?.projects?.[project]) ? manifest.projects[project] : [];
      files.sort((a, b) => a.localeCompare(b));

      const links = files
        .map((f) => `<a href="/packages/${encodeURIComponent(f)}">${htmlEscape(f)}</a>`)
        .join("<br/>\n");

      const body = `<!doctype html><html><head><meta charset="utf-8"><title>Links for ${htmlEscape(project)}</title></head>
<body><h1>Links for ${htmlEscape(project)}</h1>${links || "<em>(no files)</em>"}</body></html>`;

      return new Response(body, { status: 200, headers: htmlHeaders(60) });
    }

    // Canonicalize /simple/<project> (missing trailing slash)
    const m2 = path.match(/^\/simple\/([^/]+)$/);
    if (m2) {
      return Response.redirect(`${url.origin}/simple/${encodeURIComponent(m2[1])}/`, 301);
    }

    return new Response("Not Found", { status: 404 });
  },
};
