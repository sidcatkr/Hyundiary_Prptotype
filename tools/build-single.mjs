// 단일 HTML 만들기(의존성 없음): web/index.html 또는 app.html의 CSS·JS·이미지·폰트를 모두 넣어
// 인터넷 없이 파일 하나로 열리게 한다. 사용: node tools/build-single.mjs  → dist/*.html
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'web');
const OUT = join(ROOT, 'dist');
const MIME = { png: 'image/png', woff2: 'font/woff2', woff: 'font/woff', jpg: 'image/jpeg', svg: 'image/svg+xml' };

const read = (p) => readFileSync(join(WEB, p), 'utf8');
const dataUri = (p) => {
  const ext = p.split('.').pop().toLowerCase();
  if (!MIME[ext]) throw new Error('지원하지 않는 형식: ' + p);
  return `data:${MIME[ext]};base64,${readFileSync(join(WEB, p)).toString('base64')}`;
};
// CSS 안의 url(...)을 data URI로
const inlineCss = (p) => {
  const base = dirname(p);
  return read(p).replace(/url\(([^)'"]+)\)/g, (m, u) => (u.startsWith('data:') || /^https?:/.test(u) ? m : `url(${dataUri(join(base, u))})`));
};
// </script> 조기 종료 방지
const safeJs = (s) => s.replace(/<\/script/gi, '<\\/script');

function build(entry, outName) {
  let html = read(entry);
  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => `<style>\n${inlineCss(href)}\n</style>`);
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    let js = read(src);
    // app.js의 OS 화면 이미지 경로를 data URI로
    if (src === 'src/app.js') js = js.replace(/'(assets\/img\/[\w.-]+\.png)'/g, (mm, p) => JSON.stringify(dataUri(p)));
    return `<script>\n${safeJs(js)}\n</script>`;
  });
  if (/(?:href|src)="(?!data:|https?:)[^"]+"/.test(html)) throw new Error(entry + ': 넣지 못한 로컬 자원이 남았습니다');
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, outName), html);
  console.log(`${outName}  ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MB`);
}

build('index.html', 'hyundiary-preview.html');
