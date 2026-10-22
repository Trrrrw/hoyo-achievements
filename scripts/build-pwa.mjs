import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) result.push(...(await files(path)));
    else if (entry.name !== "sw.js") result.push(path);
  }
  return result.sort();
}
const paths = await files("dist");
const hash = createHash("sha256");
for (const path of paths) hash.update(path).update(await readFile(path));
const cache = `achievement-shell-${hash.digest("hex").slice(0, 16)}`;
const urls = paths.map((path) => "/" + path.slice(5));
await writeFile(
  "dist/sw.js",
  `
const CACHE = ${JSON.stringify(cache)}, URLS = ${JSON.stringify(urls)};
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(URLS))));
self.addEventListener('message', event => { if (event.data === 'UPDATE') self.skipWaiting(); });
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('achievement-shell-') && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('Authorization') || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith(caches.open(CACHE).then(cache => cache.match('/index.html')).then(response => response || fetch(request)));
  } else if (URLS.includes(url.pathname) && !url.search) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(url.pathname)).then(response => response || fetch(request)));
  }
});
`,
);
console.log(`PWA shell: ${urls.length} assets, ${cache}`);
