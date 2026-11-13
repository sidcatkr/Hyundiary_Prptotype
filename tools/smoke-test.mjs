// 동작 확인: 브라우저 프리뷰와 에뮬 앱 화면을 열어 런타임 오류·폰트·주요 흐름을 점검한다.
// 차량 데이터 모드는 앱 브리지(HyundiaryNative)를 흉내 내어 VehicleHub 이벤트에 따른 화면 흐름을 점검한다.
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
  for (const m of ['가계부', '통계', '안전 운전', '승차감', '소모품', '주유소', '설정', '홈']) {
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
  // 승차감 시연: 기록 주행 → 큰 흔들림(주행 화면은 그대로) → 주행 종료 팝업에 승차감 점수
  for (const step of ['승차감 기록 주행', '큰 흔들림', '주행 종료']) {
    await app.locator('.dock-fab').click();
    await app.locator('.dock-panel button', { hasText: new RegExp('^' + step + '$') }).click();
    await app.waitForTimeout(700);
    if (step === '큰 흔들림') check((await app.locator('.drv').count()) > 0 && !(await stage.innerText()).includes('큰 흔들림'), '시연 큰 흔들림이 주행 화면에 보임');
  }
  check((await stage.innerText()).includes('주행을 마쳤습니다') && (await stage.innerText()).includes('큰 흔들림 1') && (await stage.innerText()).includes('90점'), '시연 주행 종료 팝업에 승차감 점수가 없음');
  check((await app.evaluate(() => window.hyBack())) === true, '뒤로 가기로 주행 종료 팝업이 닫히지 않음');
  check((await app.locator('.cupg, .cup-drv').count()) === 0, '커피잔 그림이 남아 있음');

  // 2) 브라우저 프리뷰: OS 화면 포함
  const pv = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  watch(pv);
  await pv.goto(base + '/');
  await pv.waitForTimeout(1200);
  check((await pv.locator('.os-img').count()) === 3, '프리뷰에 OS 이미지 3장이 없음');
  await pv.getByRole('button', { name: '① 주행 시작', exact: true }).click();
  await pv.waitForTimeout(900);

  // 3) 차량 데이터 모드: 앱 브리지(HyundiaryNative)를 흉내 내고 VehicleHub 이벤트를 보내 화면 흐름을 확인한다
  const car = await browser.newPage({ viewport: { width: 1280, height: 907 } });
  watch(car);
  await car.addInitScript(() => {
    window.__hy = [];
    window.HyundiaryNative = {
      caps: () => JSON.stringify({ native: true, sources: { car: 'ok', vehicle: 'ok', navi: 'ok', voice: 'ok', location: 'denied' } }),
      snapshot: () => JSON.stringify({ fuelPct: 18, rangeKm: 120, speedKmh: 0, gear: 'P', odoKm: 43210.4, route: { active: true, dest: '천안', remainKm: 85 } }),
      ready: () => { window.__hy.push('ready'); },
      addWaypoint: (j) => { window.__hy.push('wp:' + j); return true; },
      speak: (t) => { window.__hy.push('speak:' + t); return true; },
      cupEnable: (on) => { window.__hy.push('cup:' + on); return true; },
    };
  });
  await car.goto(base + '/app.html');
  await car.waitForTimeout(1000);
  const emit = (ev) => car.evaluate((e) => window.HyVehicle._emit(JSON.stringify(e)), ev);
  const text = () => car.locator('#stage').innerText();
  const calls = () => car.evaluate(() => window.__hy.slice());
  check((await calls()).includes('ready'), '브리지 ready가 불리지 않음');
  check((await calls()).includes('cup:false'), '시작할 때 승차감 기록 설정(꺼짐)을 앱에 알리지 않음');
  const cstage = car.locator('#stage');
  await cstage.locator('.menu-item', { hasText: '설정' }).first().click();
  await car.waitForTimeout(500);
  check((await text()).includes('권한 필요'), '설정에 연동 상태(권한 필요)가 보이지 않음');
  await cstage.getByRole('button', { name: '차량', exact: true }).click();
  await car.waitForTimeout(300);
  await cstage.locator('.menu-item', { hasText: '홈' }).first().click();
  await car.waitForTimeout(600);
  check((await text()).includes('43,210 km'), '차량 모드 홈에 누적 주행거리 실제 값이 보이지 않음');
  await emit({ type: 'trip', phase: 'start' });
  await car.waitForTimeout(700);
  check((await car.locator('.drv').count()) > 0, '주행 시작 이벤트로 주행 화면이 되지 않음');
  await emit({ type: 'snapshot', data: { fuelPct: 17, rangeKm: 110, speedKmh: 62, gear: 'D', route: { active: true, dest: '천안', remainKm: 83.8 }, trip: { active: true, km: 1.2, sec: 120, events: { decel: 0, speeding: 0, lane: 0, belt: 0 } } } });
  await car.waitForTimeout(500);
  check((await text()).includes('1.2 km'), '주행 거리가 차량 값으로 바뀌지 않음');
  await emit({ type: 'fuelLow', rangeKm: 110, remainKm: 84 });
  await car.waitForTimeout(700);
  check((await text()).includes('주유 추천'), '주유 필요 이벤트로 주유 추천이 뜨지 않음');
  check((await calls()).some((c) => c.startsWith('speak:')), '주유 추천 음성 안내를 요청하지 않음');
  await cstage.getByRole('button', { name: '경유지 추가' }).click();
  await car.waitForTimeout(300);
  check((await calls()).some((c) => c.startsWith('wp:') && c.includes('"lat"')), '경유지 추가가 내비게이션으로 가지 않음');
  await emit({ type: 'safety', kind: 'speeding', kmh: 76, counts: { decel: 0, speeding: 1, lane: 0, belt: 0 } });
  await car.waitForTimeout(700);
  check((await text()).includes('제한속도 초과 1회'), '안전 기록 이벤트가 주행 화면에 보이지 않음');
  await emit({ type: 'restricted', on: true });
  await emit({ type: 'refuel', fromPct: 17, toPct: 73, liters: 33.6, capL: 60, capKnown: true, at: Date.now(), address: '서울 서초구 서초대로' });
  await car.waitForTimeout(300);
  check((await car.locator('.scrim').count()) === 0, '주행 중에 팝업이 뜸');
  await emit({ type: 'restricted', on: false });
  await emit({ type: 'trip', phase: 'end', trip: { km: 3.4, sec: 600, maxKmh: 70, events: { decel: 0, speeding: 1, lane: 0, belt: 0 } } });
  await car.waitForTimeout(900);
  check((await text()).includes('33.6 L'), '정차 후 감지한 주유 팝업이 뜨지 않음');
  await cstage.getByRole('button', { name: '기록', exact: true }).click();
  await car.waitForTimeout(900);
  check((await text()).includes('서울 서초구 서초대로'), '감지한 주유가 가계부에 기록되지 않음');
  // 주행 종료 팝업은 실제 주행 값을 보여 준다(시연 숫자 아님)
  await emit({ type: 'trip', phase: 'start' });
  await car.waitForTimeout(500);
  await emit({ type: 'trip', phase: 'end', trip: { km: 2.0, sec: 300, maxKmh: 55, events: { decel: 1, speeding: 0, lane: 0, belt: 0 } } });
  await car.waitForTimeout(900);
  check((await text()).includes('이번 주행에서 2.0 km를 5분'), '차량 모드 주행 종료 팝업에 실제 거리·시간이 없음');
  check((await text()).includes('급감속 1') && !(await text()).includes('양재동'), '차량 모드 주행 종료 팝업에 시연 값이 섞임');
  await cstage.getByRole('button', { name: '닫기', exact: true }).click();
  await car.waitForTimeout(500);
  // 기어만 바꾸고 움직이지 않았으면 주행 종료 팝업을 띄우지 않는다
  await emit({ type: 'trip', phase: 'start' });
  await car.waitForTimeout(500);
  await emit({ type: 'trip', phase: 'end', trip: { km: 0, sec: 50, maxKmh: 0, events: { decel: 0, speeding: 0, lane: 0, belt: 0 } } });
  await car.waitForTimeout(700);
  check((await car.locator('.scrim').count()) === 0, '움직이지 않은 주행에 종료 팝업이 뜸');
  // 전기차 충전: 정차 중 팝업 → D로 바꿔도 사라지지 않고 정차 뒤 다시 뜸 → 기록하면 실제 값이 가계부·홈에 남음
  await car.locator('.dock-fab').click();
  await car.waitForTimeout(300);
  await car.getByRole('button', { name: '전기차로 전환' }).click();
  await car.waitForTimeout(700);
  await emit({ type: 'snapshot', data: { evSoc: 85, evCapKwh: 77.4, speedKmh: 0, gear: 'P', odoKm: 0, route: { active: false } } });
  await car.waitForTimeout(400);
  check((await text()).includes('주행가능거리 382 km'), '차량 모드 전기차 주행가능거리가 잔량 × 용량 × 전비로 계산되지 않음');
  check(!(await text()).includes('타이어 공기압'), '차량 모드 전기차 홈에 차량 신호가 없는 항목이 보임');
  check((await text()).includes('누적 주행거리') && (await text()).includes('0 km') && !(await text()).includes('18,240 km'), '차량 모드 전기차 홈에 실제 누적 주행거리가 보이지 않음');
  await emit({ type: 'charge', fromPct: 60, toPct: 85, kwh: 19.4, at: Date.now() });
  await car.waitForTimeout(700);
  check((await text()).includes('19.4 kWh'), '감지한 충전 팝업이 뜨지 않음');
  await emit({ type: 'trip', phase: 'start' });
  await car.waitForTimeout(700);
  check((await text()).includes('경로 안내 없이') && (await text()).includes('충전비') && !(await text()).includes('48.'), '차량 모드 전기차 주행 화면에 실제 값이 아닌 문구가 보임');
  await emit({ type: 'trip', phase: 'end', trip: { km: 0, sec: 20, maxKmh: 0, events: { decel: 0, speeding: 0, lane: 0, belt: 0 } } });
  await car.waitForTimeout(900);
  check((await text()).includes('19.4 kWh'), 'D로 바꾼 뒤 대기하던 충전 팝업이 정차 후 다시 뜨지 않음');
  check(!(await text()).includes('28.4 kWh'), '기록하지 않은 충전이 홈에 자동 기록으로 보임');
  await cstage.getByRole('button', { name: '기록', exact: true }).click();
  await car.waitForTimeout(900);
  check((await text()).includes('19.4 kWh · 자동 기록') && (await text()).includes('6,730원'), '기록한 충전이 실제 값으로 홈에 보이지 않음');
  await car.locator('.dock-fab').click();
  await car.waitForTimeout(300);
  await car.getByRole('button', { name: '내연기관차로 전환' }).click();
  await car.waitForTimeout(500);
  // 승차감 기록(차량 데이터): 켜기 → 앱 판정 이벤트(주행 화면은 그대로) → 주행 종료 팝업에 승차감 점수
  await cstage.locator('.menu-item', { hasText: '승차감' }).first().click();
  await car.waitForTimeout(500);
  await cstage.getByRole('button', { name: '승차감 기록 켜기' }).click();
  await car.waitForTimeout(300);
  check((await calls()).includes('cup:true'), '승차감 기록을 켜도 앱에 알리지 않음');
  await emit({ type: 'trip', phase: 'start' });
  await emit({ type: 'cup', phase: 'start' });
  await emit({ type: 'cup', phase: 'event', kind: 'spill', delta: -10, level: 90, bonus: 0, g: 0.52, counts: { wobble: 0, spill: 1, lane: 0, eco: 0 } });
  await car.waitForTimeout(700);
  check((await car.locator('.drv').count()) > 0 && !(await text()).includes('큰 흔들림'), '앱의 승차감 판정이 주행 화면에 보임');
  await emit({ type: 'safety', kind: 'decel', counts: { decel: 1, speeding: 0, lane: 0, belt: 0 } });
  await emit({ type: 'cup', phase: 'end', stage: { level: 90, bonus: 0, lost: 10, km: 12.3, sec: 900, counts: { wobble: 0, spill: 1, lane: 0, eco: 0 } } });
  await emit({ type: 'trip', phase: 'end', trip: { km: 12.3, sec: 900, maxKmh: 80, events: { decel: 1, speeding: 0, lane: 0, belt: 0 } } });
  await car.waitForTimeout(900);
  check((await text()).includes('주행을 마쳤습니다') && (await text()).includes('큰 흔들림 1') && (await text()).includes('90점'), '정차 후 주행 종료 팝업에 승차감 점수가 없음');
  await cstage.getByRole('button', { name: '닫기', exact: true }).click();
  await car.waitForTimeout(500);
  await cstage.locator('.menu-item', { hasText: '승차감' }).first().click();
  await car.waitForTimeout(500);
  check((await text()).includes('12.3 km · 15분 · 큰 흔들림 1'), '승차감 화면의 최근 주행에 앱 기록이 없음');
  // 안전벨트를 매지 않아 기록하지 못한 주행은 주행 종료 팝업에 그렇게 적는다
  await emit({ type: 'trip', phase: 'start' });
  await emit({ type: 'cup', phase: 'blocked', reason: 'belt' });
  await car.waitForTimeout(300);
  await emit({ type: 'cup', phase: 'end' });
  await emit({ type: 'trip', phase: 'end', trip: { km: 3.1, sec: 400, maxKmh: 40, events: { decel: 0, speeding: 0, lane: 0, belt: 1 } } });
  await car.waitForTimeout(900);
  check((await text()).includes('안전벨트를 매지 않아 기록하지 않았습니다'), '벨트 없이 끝난 주행의 승차감 안내가 팝업에 없음');
  await cstage.getByRole('button', { name: '닫기', exact: true }).click();
  await car.waitForTimeout(500);
  // 움직이지 않고 끝난 주행은 팝업 없이 닫힌다
  await emit({ type: 'trip', phase: 'start' });
  await emit({ type: 'cup', phase: 'start' });
  await car.waitForTimeout(500);
  await emit({ type: 'cup', phase: 'end' });
  await emit({ type: 'trip', phase: 'end', trip: { km: 0, sec: 30, maxKmh: 0, events: { decel: 0, speeding: 0, lane: 0, belt: 0 } } });
  await car.waitForTimeout(700);
  check((await car.locator('.scrim').count()) === 0, '움직이지 않은 주행에 팝업이 뜸');
  // 시연 모드여도 주행 규제가 켜지면 주행 화면으로 바뀌고, 꺼지면 돌아온다
  await cstage.locator('.menu-item', { hasText: '설정' }).first().click();
  await car.waitForTimeout(500);
  await cstage.getByRole('button', { name: '시연', exact: true }).click();
  await emit({ type: 'restricted', on: true });
  await car.waitForTimeout(700);
  check((await car.locator('.drv').count()) > 0, '주행 규제 중인데 정차 화면이 보임');
  check((await car.locator('.menu').count()) === 0, '주행 규제 중인데 메뉴가 보임');
  await emit({ type: 'restricted', on: false });
  await car.waitForTimeout(800);
  check((await car.locator('.menu').count()) > 0, '주행 규제가 풀렸는데 정차 화면으로 돌아오지 않음');

  await browser.close();
} catch (e) {
  errs.push('실행 실패: ' + e.message);
} finally {
  server.kill();
}
console.log(errs.length ? errs.join('\n') : '통과: 오류 없음');
process.exit(errs.length ? 1 : 0);
