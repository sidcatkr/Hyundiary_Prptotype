// 동작 확인: 브라우저 프리뷰와 에뮬 앱 화면을 열어 런타임 오류·폰트·주요 흐름을 점검한다.
// 준비: npm install && npx playwright install chromium   사용: npm test
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORT = 5199;
const server = spawn(process.execPath, [fileURLToPath(new URL('./serve.mjs', import.meta.url)), String(PORT)], { stdio: 'ignore' });
const base = `http://127.0.0.1:${PORT}`;
const errs = [];
const check = (ok, msg) => { if (!ok) errs.push(msg); };

try {
  await new Promise((r) => setTimeout(r, 600));
  const browser = await chromium.launch();
  const watch = (p) => {
    p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
    p.on('requestfailed', (r) => errs.push('requestfailed: ' + r.url()));
  };

  // 1) 에뮬 앱 화면: 앱 창(1280×907)에 OS 화면 없이 꽉 차야 한다
  const app = await browser.newPage({ viewport: { width: 1280, height: 907 } });
  watch(app);
  await app.goto(base + '/app.html');
  await app.waitForTimeout(1200);
  check(await app.evaluate(() => document.fonts.check('24px "Asta Sans"', '가계부')), 'Asta Sans 폰트가 로드되지 않음');
  check((await app.locator('.os-img').count()) === 0, '에뮬 앱 화면에 OS 이미지가 그려짐');
  const stage = app.locator('#stage');
  for (const m of ['가계부', '통계', '안전 운전', '소모품', '주유소', '설정', '홈']) {
    await stage.locator('.menu-item', { hasText: m }).first().click();
    await app.waitForTimeout(450);
  }
  for (const step of ['① 주행 시작', '② 주유 제안 받기', '③ 주유 후 정차']) {
    await app.locator('.dock-fab').click();
    await app.locator('.dock-panel button', { hasText: step }).click();
    await app.waitForTimeout(900);
  }
  check((await app.locator('.scrim').count()) > 0, '주유 후 정차에서 기록 팝업이 뜨지 않음');
  check((await app.evaluate(() => window.hyBack())) === true, '뒤로 가기로 팝업이 닫히지 않음');
  await app.waitForTimeout(500);
  check((await app.evaluate(() => window.hyBack())) === false, '홈에서 뒤로 가기가 앱을 내보내지 않음');

  // 2) 브라우저 프리뷰: OS 화면 포함
  const pv = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  watch(pv);
  await pv.goto(base + '/');
  await pv.waitForTimeout(1200);
  check((await pv.locator('.os-img').count()) === 3, '프리뷰에 OS 이미지 3장이 없음');
  await pv.getByRole('button', { name: '① 주행 시작', exact: true }).click();
  await pv.waitForTimeout(900);

  await browser.close();
} catch (e) {
  errs.push('실행 실패: ' + e.message);
} finally {
  server.kill();
}
console.log(errs.length ? errs.join('\n') : '통과: 오류 없음');
process.exit(errs.length ? 1 : 0);
