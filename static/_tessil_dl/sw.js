// Tessil streaming-download Service Worker (generic, no crypto).
//
// The page decrypts client-side and feeds plaintext chunks over a MessagePort;
// this worker exposes them as a streaming attachment Response so the browser
// writes the file straight to disk with bounded memory (and works on Safari).
// It holds no keys and does no caching.
//
// Scope is "/_tessil_dl/" (the directory this file lives in), so it can never
// intercept or cache the app's pages or assets.
//
// See docs/audit/32-streaming-download-service-worker.md.

const downloads = new Map(); // id -> { stream, meta }

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "init") return;
  const port = event.ports && event.ports[0];
  if (!port) return;

  let controller;
  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
    cancel() {
      downloads.delete(data.id);
    },
  });

  downloads.set(data.id, {
    stream,
    port,
    meta: { filename: data.filename, mimeType: data.mimeType, size: data.size },
  });

  port.onmessage = (ev) => {
    const msg = ev.data;
    if (!msg) return;
    try {
      if (msg.type === "chunk") {
        controller.enqueue(new Uint8Array(msg.chunk));
      } else if (msg.type === "end") {
        controller.close();
      } else if (msg.type === "abort") {
        controller.error(new Error("aborted"));
        downloads.delete(data.id);
      }
    } catch (_e) {
      // Controller already closed or errored (e.g. the download was cancelled
      // by the browser). Nothing to do.
    }
  };

  port.postMessage({ type: "ack" });
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const match = url.pathname.match(/^\/_tessil_dl\/([^/]+)$/);
  if (!match) return; // pass-through
  const id = match[1];
  if (id === "sw.js") return; // never intercept the worker file itself

  const entry = downloads.get(id);
  if (!entry) {
    event.respondWith(new Response("Not found", { status: 404 }));
    return;
  }
  downloads.delete(id); // one-shot

  // Tell the page the download genuinely started, so it can distinguish a real
  // start from a blocked/failed trigger and only then feed the stream.
  try {
    entry.port.postMessage({ type: "started" });
  } catch (_e) {
    /* port closed */
  }

  const filename = entry.meta.filename || "download";
  const headers = new Headers({
    "Content-Type": entry.meta.mimeType || "application/octet-stream",
    "Content-Disposition":
      'attachment; filename="' +
      filename.replace(/["\\]/g, "") +
      "\"; filename*=UTF-8''" +
      encodeURIComponent(filename),
    "Cache-Control": "no-store",
  });
  if (typeof entry.meta.size === "number" && entry.meta.size >= 0) {
    headers.set("Content-Length", String(entry.meta.size));
  }
  event.respondWith(new Response(entry.stream, { headers }));
});
