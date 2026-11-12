// 웹 목업 로컬 서버(의존성 없음). 사용: node tools/serve.mjs [포트]  → http://127.0.0.1:5173/
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../web', import.meta.url)));
const PORT = Number(process.argv[2] || process.env.PORT || 5173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff',
};

createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(ROOT, rel));
    // web/ 밖으로 나가는 경로 차단
    if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403).end('Forbidden'); return; }
    const st = statSync(file, { throwIfNoEntry: false });
    if (!st || !st.isFile()) { res.writeHead(404).end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(400).end('Bad Request');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`브라우저 프리뷰  http://127.0.0.1:${PORT}/`);
  console.log(`에뮬 앱 화면    http://127.0.0.1:${PORT}/app.html`);
});
