// Hyundiary 차량 화면 프리뷰 (React 18 + htm). 모든 수치와 주유소는 예시 값이다.
const { useState, useEffect, useLayoutEffect, useRef, useContext, createContext } = React;
const html = htm.bind(React.createElement);
const ICONS = window.PLEOS_ICONS || {}; // src/icons.js
// OS 화면 배경(에뮬레이터 캡처). 빌드 시 data URI로 바뀐다.
const IMG = { dv: 'assets/img/pleos-driving-view.png', sb: 'assets/img/pleos-status-bar.png', gnb: 'assets/img/pleos-gnb.png' };
// 에뮬레이터 앱(WebView) 모드: OS 화면(Driving view·상태바·GNB)은 실제 OS가 그리므로 앱 영역만 그린다.
const EMBED = window.HY_EMBED === true;
const AW = 1280, AH = 907; // landscape 앱 창(두 window 합친 영역) 기준 크기
const RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const FontTick = createContext(0);

// ── 숫자 도우미 ──
const won = (n) => Math.round(n).toLocaleString('ko-KR');
const signedWon = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + won(Math.abs(n)) + '원';
const cx = (...a) => a.filter(Boolean).join(' ');
const ease = (t) => 1 - Math.pow(1 - t, 3);
const toNum = (s) => {
  const n = parseFloat(String(s ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// ── 예시 데이터 (서로 맞물리게 계산한 값) ──
const BASE = 1738;          // 평소 단가 = 10월 내 주유 평균 (210,100원 ÷ 120.9 L)
const EFF30 = 12.4;         // 최근 30일 연비 (차량)
const DEST = 85;            // 내비게이션 목적지 천안까지
const KM_NOV = 488;         // 11월 1~9일 주행거리
const FORECAST = 200800;    // 11월 예상 주유비 = 108,280 + 남은 21일 92,500
const FORECAST_ALL = 220880;
const OCT_SAME = { km: 437, eff: 12.8, price: 1742, cost: 59440 }; // 10월 1~9일 (437 km ÷ 12.8 × 1,742)

// 주유소(예시 데이터). lat/lng는 내비게이션 경유지 추가(NaviHelper.addWaypoint)에 쓰는 예시 좌표
const STATIONS = [
  { id: 'seocho', name: '서초 셀프주유소', km: 1.2, min: 4, price: 1689, detour: 1.6, addr: '서울 서초구 서초대로 000', lat: 37.4918, lng: 127.0089 },
  { id: 'gwacheon', name: '과천 알뜰주유소', km: 6.8, min: 14, price: 1659, detour: 11.0, addr: '경기 과천시 과천대로 000', lat: 37.4292, lng: 126.9876 },
  { id: 'yangjae', name: '양재대로 주유소', km: 2.0, min: 6, price: 1694, detour: 3.0, addr: '서울 서초구 양재대로 000', lat: 37.4846, lng: 127.0342 },
  { id: 'umyeon', name: '우면주유소', km: 0.8, min: 3, price: 1749, detour: 0.4, addr: '서울 서초구 우면동 000', lat: 37.4687, lng: 127.0237 },
];
function saving(price, detour, L) {
  const gross = Math.round((BASE - price) * L);
  const extra = Math.round((detour / EFF30) * price);
  return { gross, extra, net: gross - extra };
}

const F1109 = {
  id: 'f1109', icon: 'fuel', title: '서초 셀프주유소', when: '11월 9일 18:42', detail: '11월 9일 18:42 · 33.6 L · 자동 기록', amount: 56750, unit: '1,689원/L',
  fuel: true, auto: true, L: 33.6, price: 1689, lv: '연료 18%에서 74%로', odo: 42480, km: 398, since: '11월 2일 주유 후 주행', eff: 11.8,
  src: '오피넷 11월 9일 18:00', rec: true, detour: 1.6,
};
const LEDGER0 = () => [
  { id: 't1107', icon: 'toll', title: '통행료', detail: '11월 7일 · 서울TG에서 수원신갈TG · 직접 입력', amount: 2100 },
  { id: 'p1106', icon: 'parking', title: '주차', detail: '11월 6일 · 강남역 공영주차장 · 직접 입력', amount: 6000 },
  { id: 'w1103', icon: 'drop', title: '세차', detail: '11월 3일 · 직접 입력', amount: 12000 },
  { id: 'f1102', icon: 'fuel', title: '양재대로 주유소', when: '11월 2일 08:15', detail: '11월 2일 08:15 · 30.4 L · 자동 기록', amount: 51530, unit: '1,695원/L',
    fuel: true, auto: true, L: 30.4, price: 1695, lv: '연료 21%에서 72%로', odo: 42082, km: 376, since: '10월 27일 주유 후 주행', eff: 12.4,
    src: '오피넷 11월 2일 08:00', rec: true, detour: 3.0 },
];
const OLD = {
  '10월': [
    ['fuel', '남부순환 셀프주유소', '10월 27일 19:20 · 34.4 L · 자동 기록', 59615, '1,733원/L'],
    ['fuel', '양재대로 주유소', '10월 18일 08:10 · 31.0 L · 자동 기록', 53785, '1,735원/L'],
    ['parking', '주차', '10월 17일 · 판교역 공영주차장 · 직접 입력', 4500],
    ['fuel', '우면주유소', '10월 8일 07:50 · 29.5 L · 자동 기록', 51330, '1,740원/L'],
    ['fuel', '서초 셀프주유소', '10월 3일 18:30 · 26.0 L · 자동 기록', 45370, '1,745원/L'],
  ],
  '9월': [
    ['drop', '세차', '9월 27일 · 직접 입력', 12000],
    ['fuel', '서초 셀프주유소', '9월 22일 18:10 · 36.9 L · 자동 기록', 64686, '1,753원/L'],
    ['wrench', '와이퍼 교체', '9월 14일 · 직접 입력', 32000],
    ['fuel', '양재대로 주유소', '9월 5일 08:02 · 35.8 L · 자동 기록', 62614, '1,749원/L'],
  ],
  '8월': [
    ['fuel', '서초 셀프주유소', '8월 28일 19:05 · 36.9 L · 자동 기록', 64464, '1,747원/L'],
    ['parking', '주차', '8월 16일 · 강릉 경포해변 주차장 · 직접 입력', 6500],
    ['fuel', '강릉 셀프주유소', '8월 16일 14:20 · 33.0 L · 자동 기록', 57816, '1,752원/L'],
    ['oil', '엔진오일 교환', '8월 9일 · 37,660 km · 직접 입력', 48000],
    ['tire', '타이어 위치 교환', '8월 9일 · 직접 입력', 12000],
    ['fuel', '우면주유소', '8월 2일 07:40 · 28.0 L · 자동 기록', 48020, '1,715원/L'],
  ],
};
const YEAR = [['1월', 190200], ['2월', 184300], ['3월', 201500], ['4월', 206700], ['5월', 214900], ['6월', 182400], ['7월', 205100], ['8월', 236800], ['9월', 171300], ['10월', 214600]];
const WEEKS = [['9/29', 94], ['10/6', 91], ['10/13', 95], ['10/20', 93], ['10/27', 92], ['11/3', 88]];
const KINDS = [['급감속', '2초에 30 km/h 넘게 줄임', 2], ['제한속도 초과', '내비 제한속도 +10 km/h', 2], ['깜빡이 없이 차로 변경', '핸들 움직임으로 추정', 0.5], ['안전벨트 미착용 주행', '', 0]];
const SAFE = {
  '이번 주': { sub: '11월 3일 ~ 9일 · 주행 6회 · 187 km', score: 88, prev: 92, prevLabel: '지난주', n: [3, 2, 4, 0], pn: [2, 1, 4, 0], sel: [5],
    trips: [['11월 9일 17:58', '서초동에서 양재동 · 21.4 km', '3건'], ['11월 8일 09:12', '양재동에서 판교 · 18.9 km', '1건'], ['11월 7일 19:40', '수원에서 서초동 · 34.2 km', '2건'], ['11월 6일 08:05', '서초동에서 강남역 · 6.1 km', '없음']] },
  '지난 주': { sub: '10월 27일 ~ 11월 2일 · 주행 7회 · 214 km', score: 92, prev: 93, prevLabel: '그 전 주', n: [2, 1, 4, 0], pn: [1, 2, 2, 0], sel: [4],
    trips: [['11월 2일 08:15', '양재동에서 판교 · 18.9 km', '없음'], ['10월 31일 18:30', '판교에서 서초동 · 20.1 km', '2건'], ['10월 29일 07:55', '서초동에서 수원 · 34.0 km', '1건']] },
  '11월': { sub: '11월 1일 ~ 9일 · 주행 9회 · 262 km', score: 90, prev: 93, prevLabel: '10월', n: [5, 2, 6, 0], pn: [2, 1, 5, 0], sel: [4, 5], avg: true,
    trips: [['11월 9일 17:58', '서초동에서 양재동 · 21.4 km', '3건'], ['11월 8일 09:12', '양재동에서 판교 · 18.9 km', '1건'], ['11월 7일 19:40', '수원에서 서초동 · 34.2 km', '2건'], ['11월 2일 08:15', '양재동에서 판교 · 18.9 km', '없음']] },
};
const SPEED = [[0, 0], [1, 22], [2.5, 44], [4, 56], [5.8, 62], [5.86, 18], [7, 30], [9, 44], [11, 40], [13, 47], [15, 52], [16.8, 64], [17.4, 63], [18.6, 47], [20, 36], [22, 44], [24, 46], [25.5, 41], [27, 30], [29, 38], [31, 26], [33, 33], [35, 22], [37, 10], [38, 0]];
const LIMITS = [[0, 10, 60], [10, 20, 50], [20, 38, 60]];
const EVENTS = [
  { t: 5.8, v: 62, title: '18:04 반포대로에서 급감속', detail: '시속 62 km에서 2초 만에 18 km로 줄였습니다.', pt: '−2점', tip: '앞차와 2초 넘게 간격을 두면 급하게 밟을 일이 줄어듭니다.' },
  { t: 16.8, v: 64, title: '18:15 서초대로에서 제한속도 초과', detail: '제한속도 50 km 길을 시속 64 km로 지났습니다.', pt: '−2점', tip: '50 표지판이 보이면 미리 발을 떼 주세요.' },
  { t: 24, v: 46, title: '18:22 강남대로에서 깜빡이 없이 차로 변경', detail: '깜빡이 없이 오른쪽 차로로 옮긴 것으로 보입니다.', pt: '−0.5점', tip: '핸들을 돌리기 전에 깜빡이를 먼저 켜 주세요.' },
];
// 차량 데이터 모드의 안전 기록 종류(VehicleHub safety 이벤트의 kind)
const KIND_KEYS = ['decel', 'speeding', 'lane', 'belt'];
const KIND_NAME = { decel: '급감속', speeding: '제한속도 초과', lane: '깜빡이 없이 차로 변경', belt: '안전벨트 미착용' };
// 설정 > 연결: 연동 대상과 상태 표기
const SRC_ROWS = [
  ['car', '차량 데이터', 'AAOS Car API · 연료, 차속, 기어, 주행 규제'],
  ['vehicle', 'Pleos Vehicle SDK', '주행거리, 배터리, 깜빡이, 핸들, 안전벨트'],
  ['navi', '내비게이션', 'Pleos NaviHelper · 목적지, 제한속도, 경유지'],
  ['voice', '음성 안내', 'Pleos TextToSpeech'],
  ['location', '위치', 'Pleos FusedLocation'],
];
const SRC_TXT = { ok: '연결됨', connecting: '연결 중', denied: '권한 필요', unsupported: '지원 안 함', failed: '응답 없음', off: '꺼짐' };
// 유가 API는 아직 연동 전이라 차량 데이터 모드에서도 주유 단가·충전 단가는 예시 값을 쓴다
const LIVE_PRICE = 1689;
const LIVE_KWH_PRICE = 347;
const EV_EFF = 5.8; // 전기차 11월 평균 전비(km/kWh)
// 이번 주행 비용(차량 데이터 모드): 내연기관은 연비 × 휘발유 단가, 전기차는 전비 × 충전 단가
const tripCost = (S, km) => (S.ev
  ? { name: '충전비', basis: '전비 ' + EV_EFF + ' km/kWh · ' + LIVE_KWH_PRICE + '원/kWh', won: Math.round(((km / EV_EFF) * LIVE_KWH_PRICE) / 10) * 10 }
  : { name: '연료비', basis: '연비 ' + EFF30 + ' km/L · ' + won(LIVE_PRICE) + '원/L', won: Math.round(((km / EFF30) * LIVE_PRICE) / 10) * 10 });
const HV = window.HyVehicle || null; // src/native.js
const native = () => !!(HV && HV.available);
const pad2 = (n) => String(n).padStart(2, '0');
const whenOf = (ms) => { const d = new Date(ms || Date.now()); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
const sumCounts = (c) => KIND_KEYS.reduce((a, k) => a + ((c && c[k]) || 0), 0);
const VIDEOS = [['차로를 바꿀 때 깜빡이 켜는 순서', '3분'], ['앞차와 거리 두는 법', '4분']];
const CATS = ['주유', '주차', '통행료', '세차', '정비', '기타'];
const CAT_ICON = { 주유: 'fuel', 주차: 'parking', 통행료: 'toll', 세차: 'drop', 정비: 'wrench', 기타: 'ledger' };
const CAT_DEF = { 주차: ['6,000', '강남역 공영주차장'], 통행료: ['2,100', '서울TG'], 세차: ['12,000', ''], 정비: ['', ''], 기타: ['', ''] };
const DATES = ['11월 9일', '11월 8일', '11월 7일'];
const FTYPES = ['휘발유', '경유', 'LPG'];
const MENU = [['home', '홈', 'home'], ['ledger', '가계부', 'ledger'], ['stats', '통계', 'chart'], ['safety', '안전 운전', 'shield'], ['care', '소모품', 'wrench'], ['stations', '주유소', 'fuel'], null, ['settings', '설정', 'gear']];
const MENU_OF = { detail: 'ledger', entry: 'ledger', trip: 'safety' };

// ── 날짜별 기록 (요일은 기존 화면의 '11월 9일 일요일'에 맞춘 달력 배치) ──
const MONTHS = {
  '8월': { n: 8, first: 5, days: 31, off: 0 },
  '9월': { n: 9, first: 1, days: 30, off: 31 },
  '10월': { n: 10, first: 3, days: 31, off: 61 },
  '11월': { n: 11, first: 6, days: 30, off: 92, today: 9 },
};
const MORDER = ['8월', '9월', '10월', '11월'];
const MTABS = ['11월', '10월', '9월', '8월'];
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const CAT_OF = { fuel: '주유', drop: '세차', oil: '정비', tire: '정비', wrench: '정비', parking: '주차', toll: '통행료', ledger: '기타' };
const CAT_CLS = { 주유: 'fuel', 세차: 'wash', 정비: 'maint', 주차: 'park', 통행료: 'park', 기타: 'etc' };
const CAT_ORDER = ['주유', '정비', '세차', '주차', '통행료', '기타'];
const dayOf = (s) => { const m = /(\d+)월 (\d+)일/.exec(s || ''); return m ? +m[2] : 1; };
const hourOf = (s) => { const m = /(\d{1,2}):(\d{2})/.exec(s || ''); return m ? +m[1] : null; };
const wdOf = (m, d) => (MONTHS[m].first + d - 1) % 7;
const stripDate = (s) => String(s || '').replace(/^\d+월 \d+일( · )?/, '');
const sumOf = (list, f) => list.reduce((a, e) => a + (!f || f(e) ? e.amount : 0), 0);

// 달마다 같은 모양으로 맞춘 기록 목록 (11월은 상태에 따라 바뀜)
function entries(S, m) {
  if (m === '11월') {
    return S.ledger.map((r) => ({ k: r.id, d: dayOf(r.detail), cat: CAT_OF[r.icon] || '기타', icon: r.icon, title: r.title, detail: r.detail,
      amount: r.amount, unit: r.unit, L: r.L || 0, rec: !!r.rec, go: r.fuel ? r.id : null }));
  }
  return OLD[m].map((r, i) => {
    const L = /([\d.]+) L/.exec(r[2]);
    return { k: m + i, d: dayOf(r[2]), cat: CAT_OF[r[0]] || '기타', icon: r[0], title: r[1], detail: r[2], amount: r[3], unit: r[4], L: L ? +L[1] : 0, go: null };
  });
}
function byDay(list) {
  const o = {};
  list.forEach((e) => { (o[e.d] = o[e.d] || []).push(e); });
  return o;
}
function defDay(S, m) {
  if (MONTHS[m].today) return MONTHS[m].today;
  const ds = entries(S, m).map((e) => e.d);
  return ds.length ? Math.max(...ds) : 1;
}
const calDay = (S, m) => (S.cal && S.cal[m]) || defDay(S, m);
function allEntries(S) {
  return MORDER.flatMap((m) => entries(S, m).map((e) => ({ ...e, m, abs: MONTHS[m].off + e.d, wd: wdOf(m, e.d) })));
}

// 소비 습관: 이번 달 9일까지와 지난달 같은 기간 비교
function compareSame(S) {
  const t = MONTHS['11월'].today;
  const now = entries(S, '11월').filter((e) => e.d <= t);
  const prev = entries(S, '10월').filter((e) => e.d <= t);
  const rows = CAT_ORDER.map((c) => ({ c, a: sumOf(now, (e) => e.cat === c), b: sumOf(prev, (e) => e.cat === c), n: now.filter((e) => e.cat === c).length }))
    .filter((r) => r.a || r.b).map((r) => ({ ...r, diff: r.a - r.b })).sort((x, y) => y.diff - x.diff);
  return { a: sumOf(now), b: sumOf(prev), rows };
}
function cumSteps(list, days) {
  const per = Array(days + 2).fill(0);
  list.forEach((e) => { per[e.d] += e.amount; });
  const out = [];
  let c = 0;
  for (let d = 1; d <= days; d += 1) { c += per[d]; out.push([d, c]); }
  return out;
}
function weekdaySums(S) {
  const w = Array(7).fill(0);
  allEntries(S).forEach((e) => { w[e.wd] += e.amount; });
  return w;
}
function fuelHabit(S) {
  const f = allEntries(S).filter((e) => e.cat === '주유').sort((a, b) => a.abs - b.abs);
  const n = f.length;
  const slots = { 오전: 0, 오후: 0, 저녁: 0 };
  f.forEach((e) => { const h = hourOf(e.detail); if (h != null) slots[h < 12 ? '오전' : h < 17 ? '오후' : '저녁'] += 1; });
  const cnt = {};
  f.forEach((e) => { cnt[e.title] = (cnt[e.title] || 0) + 1; });
  const top = Math.max(0, ...Object.values(cnt));
  let fav = '';
  f.forEach((e) => { if (cnt[e.title] === top) fav = e.title; }); // 같은 횟수면 최근에 간 곳
  return {
    n, first: f[0],
    gap: n > 1 ? (f[n - 1].abs - f[0].abs) / (n - 1) : 0,
    L: f.reduce((a, e) => a + e.L, 0) / Math.max(1, n),
    amt: sumOf(f) / Math.max(1, n),
    slots: Object.entries(slots).filter(([, v]) => v).sort((a, b) => b[1] - a[1]),
    fav, favN: top,
  };
}
const MIX = [['주유', ['주유'], 'fuel'], ['정비', ['정비'], 'maint'], ['세차', ['세차'], 'wash'], ['주차·통행료', ['주차', '통행료', '기타'], 'park']];
function monthMix(S) {
  return MORDER.map((m) => {
    const l = entries(S, m);
    return { m, total: sumOf(l), parts: MIX.map(([, cs]) => sumOf(l, (e) => cs.includes(e.cat))) };
  });
}

const formFor = (cat) => ({
  cat, date: '11월 9일', amt: (CAT_DEF[cat] || ['', ''])[0], place: (CAT_DEF[cat] || ['', ''])[1], memo: '',
  fdate: '11월 9일 18:42', fplace: '서초 셀프주유소', ftype: '휘발유', L: '33.6', price: '1,689', famt: '56,750',
});
const fresh = () => ({
  ev: false, mode: 'parked', page: 'home', arg: null, dir: 'fade', popup: null, drive: 'route', video: 0,
  refueled: false, filled: false, charged: false, washer: true, stop: false, speed: 0, trip: { km: 0, sec: 0, events: 0 },
  tab: { ledger: '11월', lview: '달력', stats: '요약', range: '6개월', safety: '이번 주', stations: '추천순' }, cal: {},
  set: { fuel: '휘발유', auto: '켜기', safety: '켜기' }, tank: '60', stSel: 'seocho', evSel: 1,
  form: formFor('주차'), ledger: LEDGER0(), flash: null, toast: null,
  // 차량 연동(src/native.js): src '시연'(기본, 예시 데이터) 또는 '차량'(AAOS Car API·Pleos SDK 실제 값)
  // car=최신 차량 값, caps=연동 대상별 연결 상태, restricted=주행 규제, live=감지한 주유·충전, kinds=이번 주행 안전 기록
  src: '시연', car: null, caps: null, restricted: false, forced: false, live: null, kinds: null, lastKind: null, queued: null,
});

// 상태에서 계산하는 값
const total = (S) => S.ledger.reduce((a, r) => a + r.amount, 0);
const fuelRows = (S) => S.ledger.filter((r) => r.fuel);
const fuelSum = (S) => fuelRows(S).reduce((a, r) => a + r.amount, 0);
const fuelL = (S) => fuelRows(S).reduce((a, r) => a + (r.L || 0), 0);
const recRows = (S) => S.ledger.filter((r) => r.rec);
const savedSum = (S) => recRows(S).reduce((a, r) => a + saving(r.price, r.detour, r.L).net, 0);
const tank = (S) => S.filled || S.refueled; // 실제로 주유했는지(기록 여부와 별개)
// 차량 데이터 모드에서 실제 값이 있으면 그 값을, 없으면 시연 값을 쓴다
const carOn = (S) => S.src === '차량' && !!S.car;
const fuelPct = (S) => (carOn(S) && S.car.fuelPct != null ? Math.round(S.car.fuelPct) : tank(S) ? 74 : 18);
const socPct = (S) => (carOn(S) && S.car.evSoc != null ? Math.round(S.car.evSoc) : S.charged ? 82 : 34);
const range = (S) => {
  if (carOn(S) && !S.ev && S.car.rangeKm != null) return Math.round(S.car.rangeKm);
  // 전기차는 차량이 주행가능거리를 주지 않아 잔량 × 배터리 용량 × 전비로 추정한다
  if (carOn(S) && S.ev && S.car.evSoc != null && S.car.evCapKwh) return Math.round((S.car.evSoc / 100) * S.car.evCapKwh * EV_EFF);
  return S.ev ? (S.charged ? 410 : 170) : Math.max(0, Math.round((tank(S) ? 500 : 120) - (S.mode === 'driving' ? S.trip.km : 0)));
};
const routeOf = (S) => (carOn(S) && S.car.route && S.car.route.active ? S.car.route : null);
const destName = (S) => { const r = routeOf(S); return (r && r.dest) || '천안'; };
const destLeft = (S) => {
  const r = routeOf(S);
  if (r && r.remainKm != null) return r.remainKm;
  return S.mode === 'driving' ? Math.max(0, DEST - S.trip.km) : DEST;
};
// 누적 주행거리: 차량 데이터 모드는 Odometer 값(아직 못 받았으면 '확인 중')
const odoText = (S, demo) => (carOn(S) ? (S.car.odoKm != null ? won(S.car.odoKm) + ' km' : '확인 중') : demo);
// 주유 제안이 필요 없는지. 차량 데이터 모드는 FuelMath.needsFuel과 같은 기준
// (경로가 있으면 남은 거리 + 50 km, 없으면 100 km, 주행가능거리를 모르면 연료 20%)
const fuelOk = (S) => {
  if (!carOn(S) || S.ev) return tank(S);
  const c = S.car;
  const r = routeOf(S);
  if (c.rangeKm != null && c.rangeKm >= 0) return r && r.remainKm > 0 ? c.rangeKm >= r.remainKm + 50 : c.rangeKm >= 100;
  return !(c.fuelPct != null && c.fuelPct < 20);
};
// 홈 안내 문구의 목적지 부분. 차량 데이터 모드에서 경로가 없으면 뺀다
const destPart = (S) => (carOn(S) && !routeOf(S) ? '' : destName(S) + '까지 ' + Math.round(destLeft(S)) + ' km · ');
const needL = (S) => (tank(S) ? 30 : 33.6);
const ranked = (S) => STATIONS.map((s) => ({ ...s, ...saving(s.price, s.detour, needL(S)) })).sort((a, b) => b.net - a.net);
const novPrice = (S) => Math.round(fuelSum(S) / Math.max(1, fuelL(S)));
const novCost = (S) => Math.round(((KM_NOV / EFF30) * novPrice(S)) / 10) * 10;

// ── 움직임 도우미 ──
function useTween(target, from) {
  const [v, setV] = useState(() => (from != null && !RM ? from : target));
  const cur = useRef(v);
  useEffect(() => {
    if (RM) { cur.current = target; setV(target); return undefined; }
    const start = cur.current;
    if (start === target) return undefined;
    const t0 = performance.now();
    const dur = 700;
    let raf = 0;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const x = start + (target - start) * ease(k);
      cur.current = x; setV(x);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}
function Num({ v, d = 0, from, suf = '', sign = false }) {
  const x = useTween(v, from);
  const a = Math.abs(x);
  const zero = d ? a < 0.05 : a < 0.5;
  const s = d ? a.toFixed(d) : won(a);
  const pre = zero ? '' : x < 0 ? '−' : sign ? '+' : '';
  return html`<span className="num">${pre}${s}${suf}</span>`;
}

// 화면 바꿈: 나가는 화면을 잠깐 남겨 두고 들어오는 화면과 겹쳐 전환한다
function Swap({ k, cls = '', dir = '', passthru = false, dur = 320, children }) {
  const [st, setSt] = useState({ k, outs: [] });
  const last = useRef(children);
  if (st.k !== k) {
    const keep = st.outs.filter((o) => o.k !== k && o.k !== st.k);
    const outs = last.current != null ? keep.concat([{ k: st.k, node: last.current, d: dir }]) : keep;
    setSt({ k, outs });
  }
  last.current = children;
  useEffect(() => {
    if (!st.outs.length) return undefined;
    const t = setTimeout(() => setSt((s) => ({ ...s, outs: [] })), RM ? 0 : dur);
    return () => clearTimeout(t);
  }, [st.outs]);
  return html`<div className=${cx('swap', passthru && 'passthru')}>
    ${st.outs.map((o) => html`<div key=${'L' + o.k} className=${cx('layer', 'out', cls, o.d)} aria-hidden="true">${o.node}</div>`)}
    ${children != null ? html`<div key=${'L' + k} className=${cx('layer', 'in', cls, dir)}>${children}</div>` : null}
  </div>`;
}

// 목록 순서가 바뀌면 행이 제자리로 미끄러진다 (FLIP)
function useFlip(ref, sig) {
  const prev = useRef(null);
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    const next = new Map();
    c.querySelectorAll(':scope > [data-k]').forEach((el) => {
      const key = el.getAttribute('data-k');
      const top = el.offsetTop;
      next.set(key, top);
      if (!prev.current || RM || !el.animate) return;
      const p = prev.current.get(key);
      if (p == null) el.animate([{ opacity: 0, transform: 'translateY(-16px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.2,.7,.2,1)' });
      else if (p !== top) el.animate([{ transform: 'translateY(' + (p - top) + 'px)' }, { transform: 'none' }], { duration: 460, easing: 'cubic-bezier(.2,.7,.2,1)' });
    });
    prev.current = next;
  }, [sig]);
}

// 선택 표시가 미끄러지는 탭과 세그먼트
function useIndicator(ref, sel, deps, vertical) {
  const ft = useContext(FontTick);
  const [box, setBox] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current && ref.current.querySelector(sel);
    if (el) setBox(vertical ? { y: el.offsetTop } : { x: el.offsetLeft, w: el.offsetWidth });
    else setBox(null);
  }, [...deps, ft]);
  return box;
}
function Tabs({ items, value, onChange, sm, label }) {
  const ref = useRef(null);
  const b = useIndicator(ref, '[aria-selected="true"]', [value, items.join('|')]);
  return html`<div className=${cx('tabs', sm && 'sm')} role="tablist" aria-label=${label} ref=${ref}>
    ${items.map((t) => html`<button key=${t} type="button" role="tab" className="tab" aria-selected=${String(t === value)} onClick=${() => onChange(t)}>${t}</button>`)}
    ${b ? html`<span className="tab-ind" style=${{ transform: 'translateX(' + b.x + 'px)', width: b.w + 'px' }}></span>` : null}
  </div>`;
}
function Seg({ items, value, onChange, label }) {
  const ref = useRef(null);
  const b = useIndicator(ref, '[aria-pressed="true"]', [value, items.join('|')]);
  return html`<div className="seg" role="group" aria-label=${label} ref=${ref}>
    ${b ? html`<span className="seg-ind" style=${{ transform: 'translateX(' + b.x + 'px)', width: b.w + 'px' }}></span>` : null}
    ${items.map((t) => html`<button key=${t} type="button" className="seg-item" aria-pressed=${String(t === value)} onClick=${() => onChange(t)}>${t}</button>`)}
  </div>`;
}

// ── 부품 ──
function Icon({ name, size = 28, className }) {
  return html`<svg className=${cx('ic', className)} width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true"><path d=${ICONS[name] || ICONS.info} fillRule="evenodd" clipRule="evenodd"></path></svg>`;
}
function Btn({ children, v = 'basic', size, icon, onClick, block }) {
  return html`<button type="button" className=${cx('btn', v, size, block && 'block')} onClick=${onClick}>${icon ? html`<${Icon} name=${icon} size=${size === 'l' ? 36 : 32} />` : null}${children}</button>`;
}
function Src({ list }) {
  return html`<span className="srcs">${list.map((x) => html`<span key=${x} className="src">${x}</span>`)}</span>`;
}
function Row({ title, detail, value, vd, vtone, icon, chevron, dense, tone, onClick, sel, chip, chipTitle, k, pad, flash, tip, src }) {
  const ch = chip ? html`<span className="chip">${chip}</span>` : null;
  const Tag = onClick ? 'button' : 'div';
  const side = value != null || vd || src;
  return html`<${Tag} type=${onClick ? 'button' : undefined} data-k=${k} onClick=${onClick}
      className=${cx('row', dense && 'dense', tone && 'row-' + tone, sel && 'is-sel', pad && 'pad', flash && 'flash')}>
    ${icon ? html`<${CatIcon} icon=${icon} size=${dense ? 28 : 32} />` : null}
    <div className="row-main">
      <div className="row-title">${title}${chipTitle ? ch : null}</div>
      ${detail || (chip && !chipTitle) ? html`<div className="row-detail">${chipTitle ? null : ch}${detail}</div>` : null}
      ${tip ? html`<div className="row-tip">${tip}</div>` : null}
    </div>
    ${side ? html`<div className="row-side">
      ${value != null ? html`<div className="row-value">${value}</div>` : null}
      ${vd ? html`<div className=${cx('row-vd', vtone && 'v-' + vtone)}>${vd}</div>` : null}
      ${src ? html`<${Src} list=${src} />` : null}
    </div>` : null}
    ${chevron ? html`<${Icon} name="chevron-right" size=${28} className="row-chev" />` : null}
  <//>`;
}
function Meter({ v, label }) {
  return html`<div className=${cx('meter', 'grow', v < 20 && 'low')} role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${v} aria-label=${label}><span style=${{ width: v + '%' }}></span></div>`;
}
function H2({ children, first }) { return html`<h2 className=${cx('h2', first && 'first')}>${children}</h2>`; }
function Head({ title, sub, right, back, chip }) {
  return html`<header className="hd">
    <div className="hd-l">
      ${back ? html`<button type="button" className="hd-back" onClick=${back[1]}><${Icon} name="chevron-left" size=${28} />${back[0]}</button>` : null}
      <h1>${title}${chip ? html`<span className="chip">${chip}</span>` : null}</h1>
      ${sub ? html`<p>${sub}</p>` : null}
    </div>
    ${right ? html`<div className="hd-r">${right}</div>` : null}
  </header>`;
}
function KV({ k, v, total, small }) {
  return html`<div className=${cx('kv', total && 'total')}><span>${k}${small ? html`<small>${small}</small>` : null}</span><span>${v}</span></div>`;
}
function Field({ id, label, value, onInput, unit, hint, placeholder, ro, select, onCycle, numeric, boxRef }) {
  if (select) {
    return html`<div className="field"><span className="lab" id=${id + '-l'}>${label}</span>
      <button type="button" id=${id} className="fbox sel" aria-labelledby=${id + '-l'} onClick=${onCycle}><span style=${{ flex: '1 1 auto' }}>${value}</span><${Icon} name="chevron-down" size=${28} /></button>
      ${hint ? html`<div className="fhint">${hint}</div>` : null}</div>`;
  }
  return html`<div className="field"><label htmlFor=${id}>${label}</label>
    <div className=${cx('fbox', ro && 'ro')} ref=${boxRef}>
      <input id=${id} value=${value} placeholder=${placeholder || ''} readOnly=${!!ro} inputMode=${numeric ? 'decimal' : undefined} onInput=${(e) => onInput && onInput(e.target.value)} onChange=${() => {}} />
      ${unit ? html`<span className="unit">${unit}</span>` : null}
    </div>
    ${hint ? html`<div className="fhint">${hint}</div>` : null}</div>`;
}

// ── OS 영역 ──
// 장면 시각: 주유 전 18:37, 주유 후 18:45, 전기차 충전 07:05/07:12 + 주행 경과
function clock(S) {
  const base = S.ev ? (S.charged ? 7 * 60 + 12 : 7 * 60 + 5) : (tank(S) ? 18 * 60 + 45 : 18 * 60 + 37);
  const m = base + (S.mode === 'driving' ? Math.floor(S.trip.sec / 60) : 0);
  const h = Math.floor(m / 60) % 24, mm = String(m % 60).padStart(2, '0');
  return (h % 12 || 12) + ':' + mm + ' ' + (h < 12 ? '오전' : '오후');
}
function OsChrome({ S }) {
  const d = S.mode === 'driving';
  const sp = useTween(d ? S.speed : 0);
  const rg = useTween(range(S));
  return html`<div aria-hidden="false">
    <img className="os-img" src=${IMG.dv} alt="Driving view (Pleos OS 에뮬레이터 화면)" style=${{ left: 0, top: 0, width: '640px', height: '975px' }} />
    <img className="os-img" src=${IMG.sb} alt="상태바" style=${{ left: '640px', top: 0, width: '1280px', height: '68px' }} />
    <img className="os-img" src=${IMG.gnb} alt="GNB" style=${{ left: 0, top: '975px', width: '1920px', height: '105px' }} />
    <div className="os-clock">${clock(S)}</div>
    <div className="os-gauge" aria-hidden="true"><span style=${{ width: Math.max(4, Math.min(100, rg / (S.ev ? 5 : 6.75))) + '%' }}></span></div>
    <div className="os-range"><span>${Math.round(rg)}</span><small>km</small></div>
    <div className="os-drive" style=${{ opacity: d ? 1 : 0 }}>
      <div className="os-speed"><span>${Math.round(sp)}</span><small>km/h</small></div>
      <div className="os-gear"><span>P</span><span>R</span><span>N</span><span className="on">D</span></div>
      <div className="os-cover"></div>
      <div className="os-navon" style=${{ transform: 'scaleX(' + (d && S.drive !== 'nonav' ? 1 : 0) + ')', transition: 'transform .4s cubic-bezier(.2,.7,.2,1)' }}></div>
    </div>
  </div>`;
}

// ── 정차 중 화면 ──
function Menu({ S, A }) {
  const ref = useRef(null);
  const cur = MENU_OF[S.page] || S.page;
  const items = MENU.filter((m) => !(S.ev && m && m[0] === 'stations'));
  const b = useIndicator(ref, '[aria-current="page"]', [cur, S.ev], true);
  return html`<nav className="menu" aria-label="차계부 메뉴" ref=${ref}>
    ${b ? html`<span className="menu-ind" style=${{ transform: 'translateY(' + b.y + 'px)' }}></span>` : null}
    ${items.map((m, i) => (m
      ? html`<button key=${m[0]} type="button" className="menu-item" aria-current=${m[0] === cur ? 'page' : undefined} onClick=${() => A.go(m[0], { dir: 'fade' })}><${Icon} name=${m[2]} size=${30} /><span>${m[1]}</span></button>`
      : html`<div key=${'gap' + i} className="menu-gap"></div>`))}
  </nav>`;
}

function Home({ S, A }) {
  if (S.ev) return html`<${HomeEv} S=${S} A=${A} />`;
  const fuel = fuelPct(S);
  const last = S.ledger.find((r) => r.fuel);
  const best = ranked(S)[0];
  const n = recRows(S).length;
  const hint = fuelOk(S)
    ? html`<div className="hint quiet" role="note"><${Icon} name="check" size=${30} /><div className="hint-m"><div className="hint-t">지금은 넣지 않아도 됩니다</div>
        <div className="hint-s">${destPart(S)}${range(S)} km 주행 가능 <${Src} list=${['차량', '내비게이션']} /></div></div></div>`
    : html`<button type="button" className="hint" onClick=${() => A.go('stations', { dir: 'fade' })}><${Icon} name="fuel" size=${30} />
        <div className="hint-m"><div className="hint-t">가는 길에 <b>${best.name}</b>에서 넣으면 <b>${won(best.net)}원</b> 아낍니다</div>
        <div className="hint-s">${destPart(S)}${range(S)} km 주행 가능 · 우회 ${best.detour.toFixed(1)} km <${Src} list=${['차량', '내비게이션', '오피넷']} /></div></div>
        <${Icon} name="chevron-right" size=${28} className="row-chev" /></button>`;
  return html`<div className="pg home">
    <${Head} title="홈" sub="11월 9일 일요일 · 정차 중" right=${html`<${Btn} v="outline" icon="search" onClick=${() => A.go('stations', { dir: 'fade' })}>주유소 찾기<//><${Btn} v="outline" icon="plus" onClick=${() => A.newEntry('주차')}>기록 추가<//>`} />
    <div className="cols">
      <div className="col">
        <${H2} first>차량<//>
        <${Row} title="연료" detail=${'주행가능거리 ' + range(S) + ' km'} value=${html`<${Num} v=${fuel} suf="%" />`} src=${['차량']} icon="fuel" tone=${fuel < 20 ? 'neg' : ''} />
        <${Meter} v=${fuel} label="연료" />
        <${Row} title="누적 주행거리" value=${odoText(S, '42,480 km')} icon="gauge" dense />
        <${Row} title="11월 평균 연비" value="12.4 km/L" icon="chart" dense />
        <${H2}>11월 지출<//>
        <${Row} title="합계" detail=${S.ledger.length + '건 · 1km당 ' + won(total(S) / KM_NOV) + '원'} value=${html`<${Num} v=${total(S)} suf="원" />`} icon="ledger" chevron dense onClick=${() => A.go('ledger', { dir: 'fade' })} />
        <${Row} title=${last.title} detail=${last.detail.replace(' · 자동 기록', '').replace(' · 직접 입력', '').replace('11월 9일', '오늘')} value=${won(last.amount) + '원'} icon="fuel" chevron dense onClick=${() => A.go('detail', { arg: last.id, dir: 'fwd' })} />
        <${H2}>안전 운전<//>
        <${Row} title="이번 주" detail="주행 6회 · 급감속 3회" value="88점" icon="shield" chevron onClick=${() => A.go('safety', { dir: 'fade' })} />
      </div>
      <div className="col">
        <${H2} first>주유 추천<//>
        ${hint}
        <${H2}>이번 달 주유<//>
        <${Row} title="예상 주유비" detail="최근 30일 주행 기준" value=${html`<${Num} v=${FORECAST} suf="원" />`} src=${['차량']} icon="calendar" chevron dense onClick=${() => A.go('stats', { dir: 'fade' })} />
        <${Row} title="지난달 대비" detail="같은 기간 쓴 연료비" value="+12%" tone="neg" src=${['차량']} icon="chart" chevron dense onClick=${() => A.go('stats', { dir: 'fade' })} />
        <${Row} title="누적 절감액" detail=${'추천 주유 ' + n + '회'} value=${html`<${Num} v=${savedSum(S)} suf="원" />`} tone="pos" src=${['내 주유 기록']} icon="check" chevron dense onClick=${() => A.go('detail', { arg: last.id, dir: 'fwd' })} />
        <${H2}>확인할 항목<//>
        ${S.washer && !carOn(S) ? html`<${Row} title="와셔액" detail="차량 경고 신호" value="보충 필요" tone="neg" icon="drop" chevron dense onClick=${() => A.go('care', { dir: 'fade' })} />` : null}
        <${Row} title="엔진오일" detail="다음 교환까지" value="5,180 km" icon="oil" chevron dense onClick=${() => A.go('care', { dir: 'fade' })} />
      </div>
    </div>
  </div>`;
}
function HomeEv({ S, A }) {
  const soc = socPct(S);
  // 차량 데이터 모드: 가계부에 기록한 실제 충전(시연 합계 2회 31,960원에 더한다)
  const lives = carOn(S) ? S.ledger.filter((r) => r.charge && r.live) : [];
  const liveSum = sumOf(lives);
  const n = carOn(S) ? 2 + lives.length : S.charged ? 3 : 2;
  const sum = carOn(S) ? 31960 + liveSum : S.charged ? 41820 : 31960;
  const lastLive = lives[0];
  return html`<div className="pg home">
    <${Head} title="홈" sub="11월 9일 일요일 · 정차 중" right=${html`<${Btn} v="outline" icon="plus" onClick=${() => A.newEntry('주차')}>기록 추가<//>`} />
    <div className="cols">
      <div className="col">
        <${H2} first>차량<//>
        <${Row} title="배터리" detail=${'주행가능거리 ' + range(S) + ' km'} value=${html`<${Num} v=${soc} suf="%" />`} src=${['차량']} icon="battery" />
        <${Meter} v=${soc} label="배터리" />
        <${Row} title="누적 주행거리" value=${odoText(S, '18,240 km')} icon="gauge" dense />
        <${Row} title="11월 평균 전비" value="5.8 km/kWh" icon="chart" dense />
        <${H2}>11월 지출<//>
        <${Row} title="합계" detail=${'충전 ' + n + '회 · 1km당 52원'} value=${html`<${Num} v=${sum} suf="원" />`} icon="ledger" chevron dense onClick=${() => A.go('ledger', { dir: 'fade' })} />
        ${lastLive ? html`<${Row} title=${lastLive.title} detail=${lastLive.detail} value=${won(lastLive.amount) + '원'} icon="plug" />`
          : S.charged && !carOn(S) ? html`<${Row} title="집 완속충전" detail="오늘 07:10 · 28.4 kWh · 자동 기록" value="9,860원" icon="plug" />` : null}
      </div>
      <div className="col">
        ${carOn(S) ? null : html`<${H2} first>확인할 항목<//>
        <${Row} title="충전구" detail="차량에서 읽음" value="닫힘" icon="plug" dense />
        <${Row} title="타이어 공기압" detail="차량 경고 신호" value="정상" icon="tire" dense />`}
        <${H2} first=${carOn(S)}>안전 운전<//>
        <${Row} title="이번 주" detail="주행 5회 · 142 km" value="91점" icon="shield" chevron onClick=${() => A.go('safety', { dir: 'fade' })} />
      </div>
    </div>
  </div>`;
}

// 선택한 칸의 위치와 크기 (달력 선택 표시가 미끄러지도록)
function useBox(ref, sel, deps) {
  const ft = useContext(FontTick);
  const [b, setB] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current && ref.current.querySelector(sel);
    setB(el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null);
  }, [...deps, ft]);
  return b;
}
function CatIcon({ icon, size = 28 }) {
  return html`<span className=${cx('ri', 'c-' + (CAT_CLS[CAT_OF[icon]] || 'none'))}><${Icon} name=${icon} size=${size} /></span>`;
}

function Calendar({ S, A, m }) {
  const meta = MONTHS[m];
  const days = byDay(entries(S, m));
  const sel = calDay(S, m);
  const ref = useRef(null);
  const box = useBox(ref, '[data-d="' + sel + '"]', [m, sel]);
  const flashDay = S.flash ? (days ? Object.keys(days).find((d) => days[d].some((e) => e.k === S.flash)) : null) : null;
  const cells = [];
  for (let i = 0; i < meta.first; i += 1) cells.push(null);
  for (let d = 1; d <= meta.days; d += 1) cells.push(d);
  return html`<div className="cal" ref=${ref}>
    ${box ? html`<span className="cal-sel" aria-hidden="true" style=${{ transform: 'translate(' + box.x + 'px,' + box.y + 'px)', width: box.w + 'px', height: box.h + 'px' }}></span>` : null}
    ${cells.map((d, i) => {
      if (d == null) return html`<div key=${'e' + i} className="cal-c empty" aria-hidden="true"></div>`;
      const list = days[d] || [];
      const sum = sumOf(list);
      const fut = meta.today && d > meta.today;
      const icons = [...new Set(list.map((e) => e.icon))].slice(0, 3);
      return html`<button key=${d} type="button" data-d=${d} disabled=${fut}
          className=${cx('cal-c', d === sel && 'on', fut && 'fut', meta.today === d && 'today', String(d) === flashDay && 'flash', wdOf(m, d) === 0 && 'sun')}
          aria-pressed=${String(d === sel)} aria-label=${meta.n + '월 ' + d + '일' + (sum ? ', ' + won(sum) + '원' : ', 기록 없음')}
          onClick=${() => A.cal(m, d)}>
        <span className="cal-n">${d}</span>
        <span className="cal-i">${icons.map((ic) => html`<span key=${ic} className=${'c-' + (CAT_CLS[CAT_OF[ic]] || 'none')}><${Icon} name=${ic} size=${18} /></span>`)}</span>
        ${sum ? html`<span className="cal-a"><${Num} v=${sum} /></span>` : null}
      </button>`;
    })}
  </div>`;
}

function DayRow({ e, A, flash, date }) {
  const Tag = e.go ? 'button' : 'div';
  return html`<${Tag} type=${e.go ? 'button' : undefined} className=${cx('dr', flash && 'flash')} onClick=${e.go ? () => A.go('detail', { arg: e.go, dir: 'fwd' }) : undefined}>
    <${CatIcon} icon=${e.icon} size=${26} />
    <span className="dr-m"><span className="dr-t">${e.title}</span><span className="dr-d">${date ? e.detail : stripDate(e.detail)}</span></span>
    <span className="dr-v">${won(e.amount)}원</span>
  <//>`;
}

function DayPanel({ S, A, m }) {
  const meta = MONTHS[m];
  const sel = calDay(S, m);
  const all = entries(S, m);
  const list = byDay(all)[sel] || [];
  const cats = CAT_ORDER.map((c) => ({ c, n: all.filter((e) => e.cat === c).length, v: sumOf(all, (e) => e.cat === c), icon: (all.find((e) => e.cat === c) || {}).icon }))
    .filter((r) => r.n);
  return html`<div className="col day">
    <div key=${m + sel} className="swapin day-in">
      <div className="day-h">${meta.n}월 ${sel}일 ${WD[wdOf(m, sel)]}요일${meta.today === sel ? ' · 오늘' : ''}</div>
      <div className=${cx('day-sum', !list.length && 'none')}>${list.length ? html`<${Num} v=${sumOf(list)} suf="원" />` : '기록 없음'}</div>
      ${list.map((e) => html`<${DayRow} key=${e.k} e=${e} A=${A} flash=${S.flash === e.k} />`)}
    </div>
    <${H2}>${m} 항목별<//>
    ${cats.map((r) => html`<div key=${r.c} className="dr sm">
      <${CatIcon} icon=${r.icon} size=${24} />
      <span className="dr-m"><span className="dr-t">${r.c}</span><span className="dr-d">${r.n}회</span></span>
      <span className="dr-v">${won(r.v)}원</span>
    </div>`)}
  </div>`;
}

function Ledger({ S, A }) {
  const m = S.tab.ledger;
  const view = S.tab.lview;
  const ref = useRef(null);
  const prevM = useRef(m);
  const dir = MTABS.indexOf(m) > MTABS.indexOf(prevM.current) ? 'fwd' : 'back';
  useEffect(() => { prevM.current = m; }, [m]);
  const all = entries(S, m);
  const sum = sumOf(all);
  const f = sumOf(all, (e) => e.cat === '주유');
  useFlip(ref, view + m + ':' + all.map((r) => r.k).join(','));
  return html`<div className="pg">
    <${Head} title="가계부" sub=${'합계 ' + won(sum) + '원 · 주유 ' + won(f) + '원 · 기타 ' + won(sum - f) + '원'}
      right=${html`<div className="hd-seg"><${Seg} items=${['달력', '목록']} value=${view} label="보기" onChange=${(t) => A.tab('lview', t)} /></div><${Btn} v="outline" icon="plus" onClick=${() => A.newEntry('주차')}>기록 추가<//>`} />
    <${Tabs} sm items=${MTABS} value=${m} label="기간" onChange=${(t) => A.tab('ledger', t)} />
    ${view === '달력'
      ? html`<div key="cal" className="ld-body swapin">
          <div className="col">
            <div className="cal-wds" aria-hidden="true">${WD.map((w) => html`<span key=${w}>${w}</span>`)}</div>
            <div className="cal-box"><${Swap} k=${m} cls="calsw" dir=${dir} dur=${380}><${Calendar} S=${S} A=${A} m=${m} /><//></div>
          </div>
          <${DayPanel} S=${S} A=${A} m=${m} />
        </div>`
      : html`<div key=${'list' + m} className="swapin" ref=${ref} style=${{ marginTop: '-20px' }}>
          ${all.map((r) => html`<${Row} key=${r.k} k=${r.k} title=${r.title} chip=${r.rec ? '추천 주유' : ''} detail=${r.detail} value=${won(r.amount) + '원'} vd=${r.unit} icon=${r.icon}
            chevron=${!!r.go} flash=${S.flash === r.k} onClick=${r.go ? () => A.go('detail', { arg: r.go, dir: 'fwd' }) : undefined} />`)}
        </div>`}
  </div>`;
}

function Detail({ S, A }) {
  const r = S.ledger.find((x) => x.id === S.arg && x.fuel) || S.ledger.find((x) => x.fuel);
  const sv = r.rec ? saving(r.price, r.detour, r.L) : null;
  const left = r.live
    ? html`
      <${Row} title="금액" detail="주유량 × 예시 단가" value=${won(r.amount) + '원'} dense />
      <${Row} title="유종" detail="설정 값" value=${S.set.fuel} dense />
      <${Row} title="주유량" detail=${r.lv} value=${r.L + ' L'} dense />
      <${Row} title="단가" detail=${r.src} value=${won(r.price) + '원/L'} dense />
      ${r.odo ? html`<${Row} title="누적 주행거리" value=${won(r.odo) + ' km'} dense />` : null}`
    : r.auto
    ? html`
      <${Row} title="금액" detail="연료량 변화 × 오피넷 단가로 추정" value=${won(r.amount) + '원'} dense />
      <${Row} title="유종" detail="설정 값" value=${S.set.fuel} dense />
      <${Row} title="주유량" detail=${r.lv} value=${r.L + ' L'} dense />
      <${Row} title="단가" detail=${r.src} value=${won(r.price) + '원/L'} dense />
      <${Row} title="누적 주행거리" value=${won(r.odo) + ' km'} dense />
      <${Row} title=${r.since} value=${r.km + ' km'} dense />
      <${Row} title="이 구간 연비" detail=${r.km + ' km ÷ ' + r.L + ' L'} value=${r.eff + ' km/L'} dense />
      <${Row} title="이 구간 1km당 연료비" detail=${won(r.amount) + '원 ÷ ' + r.km + ' km'} value=${won(r.amount / r.km) + '원'} dense />`
    : html`
      <${Row} title="금액" detail="직접 입력" value=${won(r.amount) + '원'} dense />
      <${Row} title="유종" value=${r.ftype || S.set.fuel} dense />
      <${Row} title="주유량" value=${r.L + ' L'} dense />
      <${Row} title="단가" value=${won(r.price) + '원/L'} dense />`;
  return html`<div className="pg">
    <${Head} title=${r.title} chip=${r.rec ? '추천 주유' : ''} sub=${r.when ? r.when + (r.auto ? ' 자동 기록 · 영수증과 다르면 수정' : ' 직접 입력') : '직접 입력'}
      back=${['가계부', () => A.go('ledger', { dir: 'back' })]} right=${html`<${Btn} v="outline" icon="edit" onClick=${() => A.newEntry('주유', 'fwd')}>수정<//>`} />
    <div className="cols">
      <div className="col">${left}</div>
      <div className="col">
        ${sv ? html`<section className="card" aria-label="추천 주유 절감 내역">
          <h3>추천 주유 절감 내역</h3>
          <div>
            <${KV} k="평소 단가" small="10월 내 주유 평균" v=${won(BASE) + '원/L'} />
            <${KV} k="단가 차이" small=${'(' + won(BASE) + '원 − ' + won(r.price) + '원) × ' + r.L + ' L'} v=${signedWon(sv.gross)} />
            <${KV} k="우회 연료비" small=${r.detour.toFixed(1) + ' km ÷ ' + EFF30 + ' km/L × ' + won(r.price) + '원'} v=${'−' + won(sv.extra) + '원'} />
            <${KV} total k="실제 절감액" v=${html`<span className="pos"><${Num} v=${sv.net} from=${0} suf="원" /></span>`} />
          </div>
        </section>` : null}
        <${H2}>데이터 출처<//>
        <${Row} title="연료량, 주행거리" detail="AAOS Car API FUEL_LEVEL, Pleos Vehicle SDK Odometer" src=${['차량']} dense />
        <${Row} title="주유 위치, 우회 거리" detail="NaviHelper 위치와 경로" src=${['내비게이션']} dense />
        <${Row} title="단가" detail="주유한 곳 반경 300 m 가격" src=${['오피넷']} dense />
        ${sv ? html`<${Row} title="평소 단가" detail="10월 주유 4회 평균" src=${['내 주유 기록']} dense />` : null}
      </div>
    </div>
  </div>`;
}

function Entry({ S, A }) {
  const f = S.form;
  const fuel = f.cat === '주유';
  const amtRef = useRef(null);
  const setF = (patch) => A.form(patch);
  const recalc = (L, price) => {
    const a = Math.round(toNum(L) * toNum(price));
    setF({ L, price, famt: a ? won(a) : '' });
    const el = amtRef.current;
    if (el && el.animate && !RM) el.animate([{ backgroundColor: '#E6EEFF' }, { backgroundColor: '#FFFFFF' }], { duration: 900, easing: 'cubic-bezier(.2,.7,.2,1)' });
  };
  const cycle = (key, list) => setF({ [key]: list[(list.indexOf(f[key]) + 1) % list.length] });
  const fields = fuel
    ? html`<div key="fuel" className="fields swapin" style=${{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <${Field} id="f-fdate" label="날짜" select value=${f.fdate} onCycle=${() => cycle('fdate', ['11월 9일 18:42', '11월 8일 19:10', '11월 7일 08:30'])} />
        <${Field} id="f-fplace" label="장소" value=${f.fplace} hint="내비게이션 위치" onInput=${(v) => setF({ fplace: v })} />
        <${Field} id="f-ftype" label="유종" select value=${f.ftype} hint="설정 값" onCycle=${() => cycle('ftype', FTYPES)} />
        <${Field} id="f-l" label="주유량" value=${f.L} unit="L" numeric hint="영수증 보고 입력" onInput=${(v) => recalc(v, f.price)} />
        <${Field} id="f-price" label="리터당 단가" value=${f.price} unit="원/L" numeric hint="오피넷 18:00 가격" onInput=${(v) => recalc(f.L, v)} />
        <${Field} id="f-famt" label="금액" value=${f.famt} unit="원" numeric hint="주유량 × 단가 · 영수증과 다르면 고치세요" boxRef=${amtRef} onInput=${(v) => setF({ famt: v })} />
      </div>`
    : html`<div key="etc" className="fields swapin" style=${{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <${Field} id="f-date" label="날짜" select value=${f.date} onCycle=${() => cycle('date', DATES)} />
        <${Field} id="f-amt" label="금액" value=${f.amt} unit="원" numeric placeholder="영수증 금액" onInput=${(v) => setF({ amt: v })} />
        <${Field} id="f-place" label="장소" value=${f.place} hint="현재 위치에서 채움 · 내비게이션" onInput=${(v) => setF({ place: v })} />
        <${Field} id="f-memo" label="메모" value=${f.memo} placeholder="선택 입력" onInput=${(v) => setF({ memo: v })} />
      </div>`;
  return html`<div className="pg">
    <${Head} title="기록 추가" sub=${fuel ? '자동 기록이 빠진 주유를 직접 넣습니다. 단가는 오피넷 가격으로 채워 두었습니다.' : '분류를 고르면 입력 칸이 바뀝니다.'} back=${['가계부', () => A.go('ledger', { dir: 'back' })]} />
    <div className="field"><span className="lab">분류</span><${Seg} items=${CATS} value=${f.cat} label="분류" onChange=${(c) => A.form({ ...formFor(c), cat: c })} /></div>
    ${fields}
    <div className="kv" style=${{ borderTop: '1px solid #E0E1E6' }}><span>누적 주행거리</span><span>${odoText(S, '42,480 km')} <span className="src" style=${{ marginLeft: '10px' }}>차량에서 자동 입력</span></span></div>
    <div style=${{ flex: '1 1 auto' }}></div>
    <div className="actions"><${Btn} v="outline" onClick=${() => A.go('ledger', { dir: 'back' })}>취소<//><${Btn} v="primary" onClick=${A.saveEntry}>저장<//></div>
  </div>`;
}

function Bars({ S }) {
  const half = S.tab.range === '6개월';
  const data = half ? YEAR.slice(5) : YEAR;
  const now = total(S);
  const max = 236800;
  const H = 150;
  const px = (v) => Math.max(2, Math.round((v / max) * H));
  const avg = half ? 202040 : 200780;
  const n = data.length + 1;
  const w = n > 7 ? 30 : 44;
  return html`<figure style=${{ margin: 0 }} aria-label="월별 지출 막대그래프, 11월은 예상 포함">
    <div className="bars" style=${{ gridTemplateColumns: 'repeat(' + n + ', minmax(0, 1fr))' }}>
      ${data.map(([m, v], i) => html`<div key=${m} className="barc" style=${{ height: H + 32 + 'px' }}>
        <div className="barv" style=${n > 7 ? { fontSize: '17px' } : null}>${(v / 10000).toFixed(1)}</div>
        <div className="bar" style=${{ width: w + 'px', height: px(v) + 'px', '--i': i }}></div></div>`)}
      <div className="barc" style=${{ height: H + 32 + 'px' }}>
        <div className="barv" style=${n > 7 ? { fontSize: '17px' } : null}>예상 ${(FORECAST_ALL / 10000).toFixed(1)}</div>
        <div className="bar fc" style=${{ width: w + 'px', height: px(FORECAST_ALL - now) + 'px' }}></div>
        <div className="bar" style=${{ width: w + 'px', height: px(now) + 'px', '--i': data.length, transition: 'height .7s cubic-bezier(.2,.7,.2,1)' }}></div></div>
      <div className="avgline" style=${{ bottom: px(avg) + 'px' }}></div>
    </div>
    <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(' + n + ', minmax(0, 1fr))', marginTop: '8px' }}>
      ${data.map(([m]) => html`<div key=${m} className="barm" style=${n > 7 ? { fontSize: '19px' } : null}>${m}</div>`)}<div className="barm" style=${n > 7 ? { fontSize: '19px' } : null}>11월</div>
    </div>
    <figcaption className="cap" style=${{ marginTop: '10px' }}><span className="lg"><i className="sw"></i>실적</span><span className="lg"><i className="sw fc"></i>남은 기간 예상</span><span className="lg"><i className="sw av"></i>월평균 ${(avg / 10000).toFixed(1)}</span>단위 만 원</figcaption>
  </figure>`;
}

// 누적 지출: 이번 달(9일까지)과 지난달을 계단선으로 겹쳐 본다
function CumChart({ S }) {
  const W = 420, H = 230, L = 58, R = 12, T = 26, B = 34;
  const t = MONTHS['11월'].today;
  const nov = cumSteps(entries(S, '11월'), 30).slice(0, t);
  const oct = cumSteps(entries(S, '10월'), 31);
  const max = 250000;
  const x = (d) => L + ((d - 1) / 30) * (W - L - R);
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const path = (pts) => pts.reduce((p, [d, v], i) => (i === 0 ? 'M' + x(1) + ',' + y(0) + ' V' + y(v) : p + ' H' + x(d).toFixed(1) + ' V' + y(v).toFixed(1)), '');
  const nv = nov[t - 1][1];
  const ov = oct[t - 1][1];
  const end = oct[oct.length - 1][1];
  return html`<figure className="cumf">
    <svg className="cum" width=${W} height=${H} viewBox=${'0 0 ' + W + ' ' + H} role="img"
      aria-label=${'누적 지출. 11월 9일까지 ' + won(nv) + '원, 10월 같은 날까지 ' + won(ov) + '원, 10월 한 달 ' + won(end) + '원'}>
      ${[0, 100000, 200000].map((v) => html`<g key=${v}><line className="gl" x1=${L} x2=${W - R} y1=${y(v)} y2=${y(v)}></line>
        <text x=${L - 10} y=${y(v) + 6} textAnchor="end">${v ? v / 10000 + '만' : '0'}</text></g>`)}
      ${[[1, '1일'], [15, '15일'], [31, '31일']].map(([d, s]) => html`<text key=${d} x=${x(d)} y=${H - 8} textAnchor=${d === 1 ? 'start' : d === 31 ? 'end' : 'middle'}>${s}</text>`)}
      <line className="today" x1=${x(t)} x2=${x(t)} y1=${T - 8} y2=${H - B}></line>
      <text className="today-t" x=${x(t)} y=${T - 12} textAnchor="middle">오늘</text>
      <path className="l-prev draw" pathLength="1" d=${path(oct)}></path>
      <path key=${'n' + nv} className="l-now draw" pathLength="1" d=${path(nov)} style=${{ animationDelay: '.35s' }}></path>
      <circle className="dotin" cx=${x(t)} cy=${y(ov)} r="6" fill="#FFFFFF" stroke="#A4A8AE" strokeWidth="3" style=${{ animationDelay: '.9s' }}></circle>
      <circle key=${'d' + nv} className="dotin d-now" cx=${x(t)} cy=${y(nv)} r="7" style=${{ animationDelay: '1.2s' }}></circle>
    </svg>
    <figcaption className="lgd">
      <span><i></i>11월 9일까지 ${won(nv)}원</span>
      <span><i className="prev"></i>10월 같은 기간 ${won(ov)}원</span>
    </figcaption>
  </figure>`;
}

function WeekBars({ S }) {
  const order = [1, 2, 3, 4, 5, 6, 0]; // 월~일, 주말을 붙여서
  const w = weekdaySums(S);
  const tot = w.reduce((a, b) => a + b, 0);
  const max = Math.max(...w);
  const top = w.indexOf(max);
  const H = 130;
  const px = (v) => (v ? Math.max(3, Math.round((v / 250000) * H)) : 0);
  const wk = w[6] + w[0];
  return html`<figure style=${{ margin: 0 }} aria-label="요일별 지출 막대그래프">
    <div className="bars wk" style=${{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
      ${order.map((i, k) => html`<div key=${i} className="barc" style=${{ height: H + 32 + 'px' }}>
        <div className="barv">${w[i] ? (w[i] / 10000).toFixed(1) : '0'}</div>
        <div className=${cx('bar', i !== top && 'soft')} style=${{ width: '36px', height: px(w[i]) + 'px', '--i': k }}></div></div>`)}
    </div>
    <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', marginTop: '8px' }}>
      ${order.map((i) => html`<div key=${i} className=${cx('barm', i === top && 'on')}>${WD[i]}</div>`)}
    </div>
    <figcaption className="cap" style=${{ marginTop: '10px' }}>${WD[top]}요일 ${Math.round((max / tot) * 100)}% · 주말 ${Math.round((wk / tot) * 100)}% · 8월부터 · 단위 만 원</figcaption>
  </figure>`;
}

function MonthMix({ S }) {
  const rows = monthMix(S);
  const max = Math.max(...rows.map((r) => r.total));
  return html`<figure style=${{ margin: 0 }} aria-label="월별 지출 구성">
    ${rows.map((r, i) => html`<div key=${r.m} className="mix-r">
      <div className="mix-l">${r.m}${r.m === '11월' ? html`<small>9일까지</small>` : null}</div>
      <div className="mix-b" style=${{ width: (r.total / max) * 100 + '%', animationDelay: 0.08 * i + 0.1 + 's' }}>
        ${r.parts.map((v, j) => (v ? html`<span key=${j} className=${'bg-' + MIX[j][2]} style=${{ flexGrow: v }} title=${MIX[j][0] + ' ' + won(v) + '원'}></span>` : null))}
      </div>
      <div className="mix-v"><${Num} v=${r.total} suf="원" /></div>
    </div>`)}
    <figcaption className="mix-lg">${MIX.map(([n, , c]) => html`<span key=${n}><i className=${'bg-' + c}></i>${n}</span>`)}</figcaption>
  </figure>`;
}

function Habits({ S, A }) {
  const c = compareSame(S);
  const diff = c.a - c.b;
  const fh = fuelHabit(S);
  const more = diff >= 0;
  return html`
    <div className="cols">
      <div className="col">
        <div className="hl">
          <small>11월 1일 ~ 9일 · 지난달 같은 기간과 비교</small>
          <p className="hl-t"><b className=${more ? 'neg' : 'pos'}><${Num} v=${Math.abs(diff)} from=${0} suf="원" /></b> ${more ? '더' : '덜'} 썼습니다</p>
        </div>
        <${CumChart} S=${S} />
      </div>
      <div className="col">
        <${H2} first>항목별 차이<//>
        ${c.rows.map((r) => html`<${Row} key=${r.c} k=${r.c} icon=${CAT_ICON[r.c]} title=${r.c} dense
          detail=${'지난달 ' + (r.b ? won(r.b) + '원' : '없음')} vd=${won(r.a) + '원'}
          value=${signedWon(r.diff)} tone=${r.diff > 0 ? 'neg' : r.diff < 0 ? 'pos' : ''} />`)}
        ${more ? null : html`<p className="note">주유한 날이 달라 지출은 줄었지만, 달린 거리만큼 쓴 연료비는 12% 늘었습니다.</p>`}
      </div>
    </div>
    <div className="cols">
      <div className="col">
        <${H2} first>요일별 지출<//>
        <${WeekBars} S=${S} />
      </div>
      <div className="col">
        <${H2} first>주유 습관<//>
        <${KV} k="주유 간격" v=${'평균 ' + fh.gap.toFixed(1) + '일'} small=${'8월 2일부터 ' + fh.n + '회'} />
        <${KV} k="한 번에" v=${fh.L.toFixed(1) + ' L · ' + won(fh.amt) + '원'} />
        <${KV} k="주유 시간" v=${fh.slots.map(([k, v]) => k + ' ' + v + '회').join(' · ')} />
        <${KV} k="자주 간 곳" v=${fh.fav + ' ' + fh.favN + '회'} />
      </div>
    </div>
    <section>
      <${H2} first>월별 지출 구성<//>
      <${MonthMix} S=${S} />
    </section>`;
}

function Summary({ S, A }) {
  const f = fuelSum(S);
  const nf = fuelRows(S).length;
  const p = novPrice(S);
  const dPrice = Math.round((p / OCT_SAME.price - 1) * 100);
  return html`
    <section className="kpis" aria-label="이번 달 요약">
      <div className="kpi"><small>이번 달 주유비</small><b><${Num} v=${f} from=${0} suf="원" /></b><span>9일까지 · 주유 ${nf}회</span></div>
      <div className="kpi"><small>지난달 같은 기간 대비</small><b className="neg"><${Num} v=${12} from=${0} sign suf="%" /></b><span style=${{ whiteSpace: 'normal' }}>달린 거리만큼 쓴 연료비 기준</span></div>
      <div className="kpi"><small>이번 달 예상 주유비</small><b><${Num} v=${FORECAST} from=${0} suf="원" /></b><span>최근 30일 주행으로 계산</span></div>
      <div className="kpi"><small>최근 30일 연비</small><b><${Num} v=${12.4} d=${1} from=${0} suf=" km/L" /></b><span>차량</span></div>
    </section>
    <div className="cols">
      <div className="col">
        <div className="bars-h"><span className="h2" style=${{ margin: 0 }}>월별 지출</span><div style=${{ width: '220px' }}><${Tabs} sm items=${['6개월', '올해']} value=${S.tab.range} label="기간" onChange=${(t) => A.tab('range', t)} /></div></div>
        <div key=${S.tab.range}><${Bars} S=${S} /></div>
        <${Row} title="1km당 비용" detail="11월 9일까지 · 지출 ÷ 주행거리" value=${won(total(S) / KM_NOV) + '원'} dense />
        <${Row} title="평균 주유 단가" detail="10월 · 주유 4회" value="1,738원/L" src=${['내 주유 기록']} dense />
      </div>
      <div className="col">
        <section className="card why" aria-label="주유비가 늘어난 이유">
          <h3>주유비가 늘어난 이유</h3>
          <ul>
            <li><b>주행거리 +12%</b> · ${OCT_SAME.km} km에서 ${KM_NOV} km로 <${Src} list=${['차량']} /></li>
            <li><b>연비 −0.4 km/L</b> · ${OCT_SAME.eff}에서 ${EFF30} km/L로. 급감속이 2회에서 5회로 늘었습니다 <${Src} list=${['차량', '안전 운전 기록']} /></li>
            <li><b>주유 단가 ${dPrice}%</b> · ${won(OCT_SAME.price)}원에서 ${won(p)}원으로, 추천 주유로 낮췄습니다 <${Src} list=${['내 주유 기록']} /></li>
          </ul>
          <div className="cap" style=${{ display: 'flex', gap: '16px', alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span>달린 거리만큼 쓴 연료비 ${won(novCost(S))}원, 지난달 같은 기간 ${won(OCT_SAME.cost)}원</span>
            <button type="button" className="link" onClick=${() => A.go('safety', { dir: 'fade' })}>안전 운전 기록 보기</button>
          </div>
        </section>
        <${Row} title="이번 달 누적 절감액" detail=${'추천 주유 ' + recRows(S).length + '회 · 우회 비용 뺀 금액'} value=${html`<${Num} v=${savedSum(S)} suf="원" />`} tone="pos" src=${['내 주유 기록']} chevron dense
          onClick=${() => A.go('detail', { arg: (S.ledger.find((r) => r.rec) || {}).id, dir: 'fwd' })} />
      </div>
    </div>`;
}

function Stats({ S, A }) {
  const t = S.tab.stats;
  return html`<div className="pg">
    <${Head} title="통계" sub="11월 9일까지 · 주유와 직접 입력 기록" right=${html`<div style=${{ width: '340px' }}><${Tabs} items=${['요약', '소비 습관']} value=${t} label="보기" onChange=${(v) => A.tab('stats', v)} /></div>`} />
    <div key=${t} className="pg-body swapin">${t === '요약' ? html`<${Summary} S=${S} A=${A} />` : html`<${Habits} S=${S} A=${A} />`}</div>
  </div>`;
}

function ScoreLine({ sel }) {
  const W = 418, H = 112, X0 = 28, X1 = 390, Y0 = 18, Y1 = 82;
  const pts = WEEKS.map(([lab, v], i) => [X0 + (i * (X1 - X0)) / (WEEKS.length - 1), Y1 - ((v - 80) / 20) * (Y1 - Y0), lab, v]);
  return html`<svg width=${W} height=${H} viewBox=${'0 0 ' + W + ' ' + H} role="img" aria-label=${'최근 6주 점수: ' + WEEKS.map((w) => w[0] + ' ' + w[1] + '점').join(', ')} style=${{ display: 'block' }}>
    <line x1="0" y1=${Y1 + 6} x2=${W} y2=${Y1 + 6} stroke="#E0E1E6" strokeWidth="1"></line>
    <polyline className="svgline draw" pathLength="1" points=${pts.map((p) => p[0].toFixed(0) + ',' + p[1].toFixed(0)).join(' ')}></polyline>
    ${pts.map((p, i) => {
      const on = sel.indexOf(i) >= 0;
      return html`<g key=${i}>
        <rect className="dotin" style=${{ animationDelay: 0.25 + i * 0.08 + 's' }} x=${p[0] - (on ? 7 : 5)} y=${p[1] - (on ? 7 : 5)} width=${on ? 14 : 10} height=${on ? 14 : 10} fill=${on ? '#131417' : '#FFFFFF'} stroke="#131417" strokeWidth="2"></rect>
        <text x=${p[0]} y=${p[1] - 13} textAnchor="middle" fontSize="18" fontWeight=${on ? 700 : 400} fill="rgba(19,20,23,0.84)" fontFamily="Asta Sans, sans-serif">${p[3]}</text>
        <text x=${p[0]} y="108" textAnchor="middle" fontSize="18" fill="rgba(19,20,23,0.64)" fontFamily="Asta Sans, sans-serif">${p[2]}</text></g>`;
    })}
  </svg>`;
}
function Safety({ S, A }) {
  const t = S.tab.safety;
  const d = SAFE[t];
  const parts = KINDS.slice(0, 3).map((k, i) => [k[0], d.n[i] * k[2], d.n[i] + '회 × ' + k[2] + '점']);
  const ded = parts.reduce((a, p) => a + p[1], 0);
  const shades = ['#131417', '#686A72', '#C7C9CE'];
  return html`<div className="pg">
    <${Head} title="안전 운전" sub=${d.sub} right=${html`<div style=${{ width: '420px' }}><${Tabs} items=${['이번 주', '지난 주', '11월']} value=${t} label="기간" onChange=${(x) => A.tab('safety', x)} /></div>`} />
    <div className="cols">
      <div className="col">
        <div className="score">
          <div className="score-top"><div style=${{ display: 'flex', alignItems: 'baseline', gap: '12px' }}><small>${d.avg ? '11월 주별 점수 평균' : '점수'}</small><span className="big"><${Num} v=${d.score} />점</span></div><small>${d.prevLabel} ${d.prev}점</small></div>
          <${Meter} v=${d.score} label="안전 운전 점수" />
          <${ScoreLine} sel=${d.sel} />
        </div>
        ${KINDS.map((k, i) => html`<${Row} key=${k[0]} title=${k[0]} detail=${k[1]} value=${d.n[i] + '회'} vd=${d.prevLabel + ' ' + d.pn[i] + '회'} vtone=${d.n[i] > d.pn[i] ? 'neg' : ''} dense />`)}
      </div>
      <div className="col">
        <${H2} first>감점 ${won(ded * 10 / 10)}점 내역<//>
        <div className="stack" role="img" aria-label=${'감점 ' + ded + '점 구성'}>${parts.map((p, i) => html`<span key=${p[0]} style=${{ flexGrow: p[1], flexBasis: 0, background: shades[i] }}></span>`)}</div>
        <div className="legend">${parts.map((p, i) => html`<div key=${p[0]}><i style=${{ background: shades[i] }}></i><span>${p[0]}</span><span className="n">${p[2]}</span><span className="p">${p[1]}점</span></div>`)}</div>
        <${H2}>주행 기록<//>
        ${d.trips.map((tr) => html`<${Row} key=${tr[0]} title=${tr[0]} detail=${tr[1]} value=${tr[2]} chevron dense onClick=${() => A.go('trip', { dir: 'fwd' })} />`)}
      </div>
    </div>
  </div>`;
}

function SpeedGraph({ sel }) {
  const W = 556, H = 168, X0 = 52, X1 = 548, Y0 = 36, Y1 = 138;
  const fx = (t) => X0 + (t / 38) * (X1 - X0);
  const fy = (v) => Y1 - (v / 80) * (Y1 - Y0);
  return html`<figure style=${{ margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
    <svg width=${W} height=${H} viewBox=${'0 0 ' + W + ' ' + H} role="img" aria-label="주행 중 속도 변화. 1 급감속 18:04, 2 제한속도 초과 18:15, 3 깜빡이 없이 차로 변경 18:22" style=${{ display: 'block' }}>
      ${[0, 40, 80].map((v) => html`<g key=${v}><line x1=${X0} y1=${fy(v)} x2=${X1} y2=${fy(v)} stroke="#E0E1E6" strokeWidth="1"></line><text x=${X0 - 10} y=${fy(v) + 6} textAnchor="end" fontSize="18" fill="rgba(19,20,23,0.64)" fontFamily="Asta Sans, sans-serif">${v}</text></g>`)}
      ${[[0, '17:58'], [12, '18:10'], [22, '18:20'], [32, '18:30'], [38, '18:36']].map(([t, l]) => html`<text key=${l} x=${fx(t)} y="164" textAnchor="middle" fontSize="18" fill="rgba(19,20,23,0.64)" fontFamily="Asta Sans, sans-serif">${l}</text>`)}
      ${LIMITS.map(([a, b, v]) => html`<line key=${a} x1=${fx(a)} y1=${fy(v)} x2=${fx(b)} y2=${fy(v)} stroke="#686A72" strokeWidth="2" strokeDasharray="6 5"></line>`)}
      <polyline className="svgline draw" pathLength="1" points=${SPEED.map(([t, v]) => fx(t).toFixed(1) + ',' + fy(v).toFixed(1)).join(' ')}></polyline>
      ${EVENTS.map((e, i) => {
        const on = sel === i + 1;
        const x = fx(e.t), y = fy(e.v) - 34;
        return html`<g key=${i} className="dotin" style=${{ animationDelay: 0.7 + i * 0.12 + 's' }}>
          ${on ? html`<rect className="ring" x=${x - 14} y=${y} width="28" height="28" fill="none" stroke="#131417" strokeWidth="2"></rect>` : null}
          <g className=${cx('mk', on && 'on')}><rect x=${x - 14} y=${y} width="28" height="28" fill=${on ? '#0064FF' : '#131417'} style=${{ transition: 'fill .25s' }}></rect>
          <text x=${x} y=${y + 20} textAnchor="middle" fontSize="18" fontWeight="700" fill="#FFFFFF" fontFamily="Asta Sans, sans-serif">${i + 1}</text></g></g>`;
      })}
    </svg>
    <figcaption className="cap">실선 속도(차량), 점선 제한속도(내비게이션), 번호는 아래 기록</figcaption>
  </figure>`;
}
function Trip({ S, A }) {
  return html`<div className="pg">
    <${Head} title="11월 9일 17:58 ~ 18:36" sub="서초동에서 양재동 · 21.4 km · 38분 · 평균 34 km/h" back=${['안전 운전', () => A.go('safety', { dir: 'back' })]} />
    <div style=${{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', columnGap: '48px', alignItems: 'start' }}>
      <${SpeedGraph} sel=${S.evSel} />
      <div>${[['연비', '12.2 km/L'], ['연료비', '약 2,960원'], ['감점', '4.5점'], ['이번 주 점수', '88점']].map(([k, v]) => html`<${KV} key=${k} k=${k} v=${v} />`)}</div>
    </div>
    <div className="ev-rows">
      ${EVENTS.map((e, i) => html`<${Row} key=${i} title=${html`<span style=${{ display: 'inline-flex', width: '34px', height: '30px', alignItems: 'center', justifyContent: 'center', background: S.evSel === i + 1 ? '#0064FF' : '#131417', color: '#FFFFFF', fontSize: '18px', fontWeight: 700, marginRight: '14px', transition: 'background-color .25s' }}>${i + 1}</span>${e.title}`}
        detail=${e.detail} tip=${e.tip} value=${e.pt} dense pad sel=${S.evSel === i + 1} onClick=${() => A.set({ evSel: i + 1 })} />`)}
    </div>
    <section className="videos" aria-label="추천 안전 운전 영상">
      ${VIDEOS.map(([t, m], i) => html`<button key=${t} type="button" className="vcard" onClick=${() => A.set({ video: i + 1 })}>
        <span className="vthumb" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24"><path d="M7 4v16l13-8z" fill="#131417"></path></svg></span>
        <span style=${{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}><span className="vt">${t}</span><span className="vs">추천 영상 ${m} · 정차 중에만 재생</span></span></button>`)}
    </section>
  </div>`;
}

function Care({ S, A }) {
  return html`<div className="pg">
    <${Head} title="소모품" sub=${'누적 주행거리 ' + odoText(S, '42,480 km') + ' · 차량에서 읽음'} right=${html`<${Btn} v="outline" icon="plus" onClick=${() => A.newEntry('정비')}>교체 기록<//>`} />
    <div className="cols">
      <div className="col">
        <${H2} first>차량 경고 신호<//>
        <${Row} title="와셔액" value=${S.washer ? '보충 필요' : '정상'} tone=${S.washer ? 'neg' : ''} icon="drop" dense />
        <${Row} title="엔진오일 양" value="정상" icon="oil" dense />
        <${Row} title="브레이크액" value="정상" icon="warning" dense />
        <${Row} title="타이어 공기압" value="정상" icon="tire" dense />
        <p className="note">차량이 보내는 경고만 표시합니다. 잔량 수치는 받을 수 없습니다.</p>
        ${S.washer ? html`<div style=${{ marginTop: '20px' }}><${Btn} v="outline" icon="check" onClick=${() => A.washerDone()}>와셔액 보충함<//></div>` : null}
      </div>
      <div className="col">
        <${H2} first>교체 주기 (주행거리로 계산)<//>
        <${Row} title="엔진오일" detail="마지막 교체 37,660 km · 주기 10,000 km" value="5,180 km 남음" dense />
        <${Meter} v=${52} label="엔진오일 남은 비율" />
        <${Row} title="타이어" detail="교체 기록 없음 · 기준 60,000 km" value="약 17,500 km 남음" dense />
        <${Meter} v=${29} label="타이어 남은 비율" />
        <${Row} title="에어컨 필터" detail="마지막 교체 2월 · 주기 12개월" value="3개월 남음" dense />
        <${Meter} v=${25} label="에어컨 필터 남은 비율" />
      </div>
    </div>
  </div>`;
}

function Stations({ S, A }) {
  const list = ranked(S);
  const best = list[0];
  const sort = S.tab.stations;
  const shown = sort === '추천순' ? list : list.slice().sort((a, b) => (sort === '가격순' ? a.price - b.price : a.km - b.km));
  const s = list.find((x) => x.id === S.stSel) || best;
  const need = !tank(S);
  const left = range(S) - DEST;
  const cheapest = Math.min(...list.map((x) => x.price));
  const ref = useRef(null);
  useFlip(ref, shown.map((x) => x.id).join(','));
  return html`<div className="pg">
    <${Head} title="주유소" sub=${(need ? '11월 9일 18:37 양재동 · ' : '11월 9일 18:45 서초동 · ') + S.set.fuel + ' · 오피넷 18:00 가격'} />
    <section className="card rec" aria-label="주유 추천">
      <div className="rec-top">
        <div className="rec-kpis">
          <div><small>주행가능거리</small><b><${Num} v=${range(S)} suf=" km" /></b><em>차량</em></div>
          <div><small>천안까지</small><b>${DEST} km</b><em>내비게이션</em></div>
          <div><small>도착 후 남는 거리</small><b className=${need ? 'neg' : ''}><${Num} v=${left} suf=" km" /></b><em>${need ? '여유 50 km 미만' : '여유 충분'}</em></div>
        </div>
        <div className=${cx('rec-verdict', !need && 'ok')}><${Icon} name=${need ? 'fuel' : 'check'} size=${34} /><span>${need ? html`가는 길에 <b>${best.name}</b>에서 넣으세요` : '지금은 넣지 않아도 됩니다. 다음 주유 때 다시 추천합니다.'}</span></div>
      </div>
      <div className="rec-calc">
        <div className="rec-st"><b>${best.name}</b><span>${won(best.price)}원/L · 우회 ${best.detour.toFixed(1)} km</span><${Src} list=${['오피넷']} />
          <span className="res"><small>실제 절감액</small><b className=${best.net < 0 ? 'neg' : ''}><${Num} v=${best.net} from=${0} suf="원" /></b></span></div>
        <div className="formula">
          <span className="f-l">단가 차이</span><span className="f-x">(${won(BASE)} − ${won(best.price)})원 × ${needL(S)} L</span><b className="f-v">${won(best.gross)}원</b>
          <span className="f-l">우회 연료비</span><span className="f-x">${best.detour.toFixed(1)} km ÷ ${EFF30} km/L × ${won(best.price)}원</span><b className="f-v">−${won(best.extra)}원</b>
        </div>
        <div className="cap">평소 단가 ${won(BASE)}원/L는 10월 내 주유 평균입니다. ${need ? '주유량 33.6 L는 74%까지 채울 때 기준입니다.' : '다음 주유 30 L 기준입니다.'} <${Src} list=${['내 주유 기록']} /></div>
      </div>
    </section>
    <div className="cols" style=${{ gridTemplateColumns: 'minmax(0, 1fr) 320px' }}>
      <div className="col">
        <${Tabs} sm items=${['추천순', '가격순', '거리순']} value=${sort} label="정렬" onChange=${(t) => A.tab('stations', t)} />
        <div ref=${ref}>
          ${shown.map((x) => html`<${Row} key=${x.id} k=${x.id} title=${x.name} chipTitle chip=${x.id === best.id ? '추천' : x.price === cheapest ? '최저가' : ''}
            detail=${x.km.toFixed(1) + ' km · 우회 ' + x.detour.toFixed(1) + ' km'} value=${won(x.price) + '원'}
            vd=${x.net >= 0 ? won(x.net) + '원 절감' : won(-x.net) + '원 손해'} vtone=${x.net > 0 ? 'pos' : x.net < 0 ? 'neg' : ''}
            dense pad sel=${x.id === s.id} onClick=${() => A.set({ stSel: x.id })} />`)}
        </div>
        <p className="note">가장 싼 곳보다 우회 비용을 뺀 실제 절감액이 큰 곳을 먼저 보여 줍니다.</p>
      </div>
      <div className="col">
        <${H2} first>선택한 주유소<//>
        <div>
          <${KV} k="이름" v=${s.name} />
          <${KV} k=${S.set.fuel} v=${won(s.price) + '원/L'} />
          <${KV} k="거리" v=${s.km.toFixed(1) + ' km · ' + s.min + '분'} />
          <${KV} k="우회 거리" v=${s.detour.toFixed(1) + ' km'} />
          <${KV} k="단가 차이 절감" v=${html`<${Num} v=${s.gross} sign suf="원" />`} />
          <${KV} k="우회 연료비" v=${html`<${Num} v=${-s.extra} suf="원" />`} />
          <${KV} total k="실제 절감액" v=${html`<span className=${s.net > 0 ? 'pos' : s.net < 0 ? 'neg' : ''}><${Num} v=${s.net} sign suf="원" /></span>`} />
        </div>
        <div className="actions stack" style=${{ marginTop: '24px' }}><${Btn} v="primary" block onClick=${A.guide}>경로 안내<//><${Btn} v="outline" block onClick=${A.waypoint}>경유지 추가<//></div>
      </div>
    </div>
  </div>`;
}

function Settings({ S, A }) {
  return html`<div className="pg">
    <${Head} title="설정" />
    <div className="cols">
      <div className="col">
        <${H2} first>연결<//>
        ${native() ? html`
          ${SRC_ROWS.map(([key, title, detail]) => {
            const st = S.caps && S.caps.sources ? S.caps.sources[key] : 'connecting';
            return html`<${Row} key=${key} title=${title} detail=${detail} value=${SRC_TXT[st] || '확인 중'} vtone=${st === 'denied' || st === 'failed' ? 'neg' : ''} dense />`;
          })}
          <${Row} title="유가 정보" detail="오피넷 · 연동 전이라 예시 단가" value="예시" dense />` : html`
          <${Row} title="차량 데이터" detail="연료, 주행거리, 주행·경고 신호" value="연결됨" dense />
          <${Row} title="내비게이션" detail="위치, 경로, 제한속도" value="연결됨" dense />
          <${Row} title="유가 정보" detail="오피넷 · 1시간마다" value="18:00 갱신" dense />`}
        ${native() && S.car ? html`<${CarValues} S=${S} />` : null}
        <${H2}>데이터<//>
        <${Row} title="기록 내보내기" detail="CSV · 차량 밖으로 보낼 때 확인" chevron dense onClick=${() => A.toast('차량 밖으로 보내기 전에 확인 화면을 띄웁니다')} />
      </div>
      <div className="col">
        ${native() ? html`<div className="setg"><div className="setl">화면 데이터</div>
          <${Seg} items=${['시연', '차량']} value=${S.src} label="화면 데이터" onChange=${A.setSrc} />
          <div className="fhint" style=${{ marginTop: '8px' }}>시연: 예시 데이터와 시연 버튼으로 동작합니다. 차량: 연료·주행·안전 기록을 차량에서 받습니다.</div></div>` : null}
        ${[['연료 종류', 'fuel', FTYPES], ['주유 자동 기록', 'auto', ['켜기', '끄기']], ['안전 운전 기록', 'safety', ['켜기', '끄기']]].map(([l, key, items]) => html`<div key=${key} className="setg"><div className="setl">${l}</div>
          <${Seg} items=${items} value=${S.set[key]} label=${l} onChange=${(v) => A.setting(key, v)} /></div>`)}
        <${Field} id="f-tank" label="연료탱크 용량" value=${S.tank} unit="L" numeric hint="주유량 계산에 씁니다" onInput=${(v) => A.set({ tank: v })} />
      </div>
    </div>
  </div>`;
}

// 설정 > 차량에서 받은 값(앱에서만). 연동이 실제로 되는지 확인하는 용도
function CarValues({ S }) {
  const c = S.car;
  const r = c.route || {};
  const v = (x, suf) => (x == null ? '–' : x + suf);
  return html`<${H2}>차량에서 받은 값<//>
    <${Row} title="연료" detail=${'탱크 ' + v(c.capL, ' L') + ' · ' + (c.rangeEst ? '주행가능거리는 연료량 × 연비로 추정' : '주행가능거리는 차량 값')} value=${v(c.fuelPct, '%') + ' · ' + v(c.rangeKm, ' km')} dense />
    <${Row} title="주행" detail=${'기어 ' + (c.gear || '–') + (c.restricted ? ' · 주행 규제 중' : '')} value=${v(c.speedKmh, ' km/h')} dense />
    <${Row} title="누적 주행거리 · 배터리" value=${v(c.odoKm, ' km') + ' · ' + v(c.evSoc, '%')} dense />
    <${Row} title="내비게이션" detail=${r.active ? (r.dest || '목적지') + ' · 제한속도 ' + v(c.speedLimit, ' km/h') : '경로 안내 없음'} value=${r.active ? v(r.remainKm, ' km') : '–'} dense />`;
}

const PAGES = { home: Home, ledger: Ledger, detail: Detail, entry: Entry, stats: Stats, safety: Safety, trip: Trip, care: Care, stations: Stations, settings: Settings };
function Parked({ S, A }) {
  const P = PAGES[S.page] || Home;
  const key = S.page + ':' + (S.page === 'detail' ? S.arg : '') + (S.ev && S.page === 'home' ? ':ev' : '');
  return html`<div className="shell full"><${Menu} S=${S} A=${A} />
    <div className="mainwrap"><${Swap} k=${key} dir=${S.dir}><${P} S=${S} A=${A} /><//></div></div>`;
}

// ── 팝업 ──
function Popup({ icon, title, desc, children, actions }) {
  return html`<div className="scrim"><div className="popup" role="dialog" aria-modal="true" aria-label=${title}>
    <div className="pop-head"><${Icon} name=${icon} size=${56} /><h2>${title}</h2><p>${desc}</p></div>
    ${children ? html`<div className="pop-body">${children}</div>` : null}
    <div className="pop-foot">${actions.map(([l, v, fn]) => html`<${Btn} key=${l} v=${v} onClick=${fn}>${l}<//>`)}</div>
  </div></div>`;
}
function PopupLayer({ S, A }) {
  const sv = saving(1689, 1.6, 33.6);
  const [amt, setAmt] = useState('');
  if (S.popup === 'refuel' && S.live && S.live.type === 'refuel') {
    const lv = S.live;
    const amt = Math.round((lv.liters * LIVE_PRICE) / 10) * 10;
    return html`<${Popup} icon="fuel" title="주유를 기록할까요?" desc=${'오늘 ' + whenOf(lv.at).split(' ').pop() + (lv.address ? ' ' + lv.address + '에서' : '') + ' 연료가 ' + lv.fromPct + '%에서 ' + lv.toPct + '%로 늘었습니다.'}
      actions=${[['기록 안 함', 'basic', A.closePopup], ['수정', 'outline', () => A.newEntry('주유', 'fwd')], ['기록', 'primary', A.record]]}>
      <${Row} title="주유량" detail=${'연료량 변화 × 탱크 ' + lv.capL + ' L' + (lv.capKnown ? '' : '(설정 값)')} value=${lv.liters + ' L'} dense />
      <${Row} title="단가" detail="예시 단가 · 유가 정보 연동 전" value=${won(LIVE_PRICE) + '원/L'} dense />
      <${Row} title="금액" detail="주유량 × 단가" value=${won(amt) + '원'} dense />
      <p className="pop-note">영수증 금액과 다르면 수정을 누르세요.</p>
    <//>`;
  }
  if (S.popup === 'refuel') {
    return html`<${Popup} icon="fuel" title="주유를 기록할까요?" desc="오늘 18:42 서초 셀프주유소에서 연료가 18%에서 74%로 늘었습니다."
      actions=${[['기록 안 함', 'basic', A.closePopup], ['수정', 'outline', () => A.newEntry('주유', 'fwd')], ['기록', 'primary', A.record]]}>
      <${Row} title="주유량" detail="연료량 변화로 계산" value="33.6 L" dense />
      <${Row} title="단가" detail="오피넷 18:00" value="1,689원/L" dense />
      <${Row} title="금액" detail="주유량 × 단가" value="56,750원" dense />
      <${Row} title="추천 주유 절감" detail=${'평소 단가 ' + won(BASE) + '원 대비, 우회 비용 뺀 금액'} value=${won(sv.net) + '원'} tone="pos" dense />
      <p className="pop-note">영수증 금액과 다르면 수정을 누르세요.</p>
    <//>`;
  }
  if (S.popup === 'refuelManual') {
    return html`<${Popup} icon="fuel" title="주유를 기록할까요?" desc="오늘 18:42 서초동에서 연료가 18%에서 74%로 늘었습니다. 이 주유소의 가격 정보를 받지 못했습니다."
      actions=${[['나중에', 'basic', A.closePopup], ['저장', 'primary', () => A.recordManual(amt)]]}>
      <div className="fields" style=${{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <${Field} id="p-amt" label="금액" value=${amt} placeholder="영수증 금액" unit="원" numeric hint="영수증을 보고 넣어 주세요" onInput=${setAmt} />
        <${Field} id="p-l" label="주유량" value="33.6" unit="L" ro hint="연료량 변화로 계산" />
      </div>
    <//>`;
  }
  if (S.popup === 'care') {
    return html`<${Popup} icon="drop" title="와셔액을 보충해 주세요" desc="주행 중에 차량이 보낸 경고입니다. 정차한 뒤에 알려 드립니다."
      actions=${[['확인', 'basic', A.closePopup], ['소모품 보기', 'primary', () => A.go('care', { dir: 'fade' })]]} />`;
  }
  // 차량 데이터 모드에서 실제 주행이 끝난 경우(kinds는 주행 시작 이벤트 때 생긴다)
  if (S.popup === 'tripEnd' && S.src === '차량' && S.kinds) {
    const t = S.trip;
    const c = tripCost(S, t.km);
    const k = S.kinds || {};
    const kinds = KIND_KEYS.filter((x) => k[x]).map((x) => KIND_NAME[x] + ' ' + k[x]);
    const dur = t.sec < 60 ? Math.round(t.sec) + '초' : Math.round(t.sec / 60) + '분';
    return html`<${Popup} icon="car" title="주행을 마쳤습니다" desc=${'이번 주행에서 ' + t.km.toFixed(1) + ' km를 ' + dur + ' 동안 달렸습니다.'}
      actions=${[['닫기', 'primary', A.closePopup]]}>
      <${Row} title=${c.name} detail=${c.basis + '로 계산'} value=${'약 ' + won(c.won) + '원'} dense />
      <${Row} title="안전 기록" detail=${kinds.length ? kinds.join(' · ') : '기록 없음'} value=${t.events ? t.events + '건' : '없음'} dense />
    <//>`;
  }
  if (S.popup === 'tripEnd') {
    const live = S.trip.km > 0.5;
    const km = live ? S.trip.km : 21.4;
    const min = live ? Math.max(1, Math.round(S.trip.sec / 60)) : 38;
    const ev = live ? S.trip.events : 3;
    return html`<${Popup} icon="car" title="주행을 마쳤습니다" desc=${(live ? '양재동에서 ' : '서초동에서 양재동까지 ') + km.toFixed(1) + ' km를 ' + min + '분 동안 달렸습니다.'}
      actions=${[['닫기', 'basic', A.closePopup], ['자세히', 'primary', () => A.go('trip', { dir: 'fwd' })]]}>
      <${Row} title="연료비" detail="연비 12.2 km/L · 1,689원/L로 계산" value=${'약 ' + won(Math.round(((km / 12.2) * 1689) / 10) * 10) + '원'} dense />
      <${Row} title="안전 기록" detail=${ev ? (live ? '급감속 ' + ev + '회' : '급감속 1 · 제한속도 초과 1 · 깜빡이 없이 차로 변경 1') : '기록 없음'} value=${ev ? ev + '건' : '없음'} dense />
    <//>`;
  }
  if (S.popup === 'charge' && S.live && S.live.type === 'charge') {
    const lv = S.live;
    const kwh = lv.kwh != null ? lv.kwh : null;
    return html`<${Popup} icon="plug" title="충전을 기록할까요?" desc=${'오늘 ' + whenOf(lv.at).split(' ').pop() + ' 배터리가 ' + lv.fromPct + '%에서 ' + lv.toPct + '%로 늘었습니다.'}
      actions=${[['기록 안 함', 'basic', A.closePopup], ['기록', 'primary', A.recordCharge]]}>
      <${Row} title="충전량" detail="배터리 변화 × 차량 배터리 용량" value=${kwh != null ? kwh + ' kWh' : '–'} dense />
      <${Row} title="단가" detail="설정 값" value=${LIVE_KWH_PRICE + '원/kWh'} dense />
      <${Row} title="금액" value=${kwh != null ? won(Math.round((kwh * LIVE_KWH_PRICE) / 10) * 10) + '원' : '–'} dense />
    <//>`;
  }
  if (S.popup === 'charge') {
    return html`<${Popup} icon="plug" title="충전을 기록할까요?" desc="오늘 07:10 집에서 충전을 마쳤습니다. 배터리가 34%에서 82%로 늘었습니다."
      actions=${[['기록 안 함', 'basic', A.closePopup], ['기록', 'primary', A.recordCharge]]}>
      <${Row} title="충전량" detail="배터리 변화와 용량 59.3 kWh로 계산" value="28.4 kWh" dense />
      <${Row} title="단가" detail="설정 값" value="347원/kWh" dense />
      <${Row} title="금액" value="9,860원" dense />
    <//>`;
  }
  return null;
}
function VideoLayer({ S, A }) {
  if (!S.video) return null;
  const v = VIDEOS[S.video - 1];
  return html`<div className="scrim"><div className="player" role="dialog" aria-modal="true" aria-label="안전 운전 영상">
    <div className="screen"><svg width="76" height="76" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z" fill="#FFFFFF"></path></svg>
      <span className="sub">영상 자리 표시 · 출처 연동 전</span><div className="prog"><span></span></div></div>
    <div style=${{ padding: '32px 40px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style=${{ fontSize: '30px', lineHeight: '38px' }}>${v[0]}</div>
      <div style=${{ fontSize: '22px', lineHeight: '28px', color: 'rgba(19,20,23,0.64)' }}>${v[1]} · 정차(P단) 중에만 재생합니다. 기어를 바꾸면 멈춥니다.</div></div>
    <div style=${{ padding: '32px 40px 40px', display: 'flex', justifyContent: 'flex-end' }}><${Btn} v="primary" onClick=${() => A.set({ video: 0 })}>닫기<//></div>
  </div></div>`;
}

// ── 주행 중 ──
function NavPane({ S }) {
  const route = S.drive !== 'nonav';
  const pin = route && (S.stop || S.drive === 'refuel');
  const left = destLeft(S);
  return html`<div className="nav">
    <svg width="640" height="907" viewBox="0 0 640 907" role="img" aria-label="내비게이션 지도 자리 표시" style=${{ display: 'block' }}>
      <rect width="640" height="907" fill="#EEF0F3"></rect>
      <g fill="#E3E6EA"><rect x="40" y="60" width="200" height="180"></rect><rect x="300" y="60" width="300" height="180"></rect><rect x="40" y="320" width="200" height="260"></rect><rect x="420" y="320" width="180" height="260"></rect><rect x="40" y="660" width="560" height="200"></rect></g>
      <g stroke="#FFFFFF" strokeWidth="22" fill="none"><path d="M0 280 H640"></path><path d="M0 620 H640"></path><path d="M270 0 V907"></path><path d="M370 280 V907"></path><path d="M0 0 L640 520"></path></g>
      ${route ? html`<g><path d="M320 820 V620 H370 V280 L430 0" fill="none" stroke="#0064FF" strokeWidth="12"></path><path className="routeline" d="M320 820 V620 H370 V280 L430 0" fill="none" stroke="#9CC4FF" strokeWidth="4"></path></g>` : null}
      <path d="M298 790 l22 -48 22 48 -22 -12z" fill="#131417" stroke="#FFFFFF" strokeWidth="3"></path>
    </svg>
    ${route ? html`<div className="nav-dest"><span>${S.stop ? '경유 서초 셀프주유소' : destName(S)}</span><small>${S.stop ? destName(S) + '까지 ' + left.toFixed(0) + ' km' : left.toFixed(1) + ' km 남음'}</small></div>` : null}
    ${pin ? html`<div className="nav-st"><${Icon} name="fuel" size=${26} />서초 셀프 1,689원${S.stop ? ' · 경유지' : ''}</div>` : null}
    <div className="nav-tag">OS 내비게이션 영역 (자리 표시)</div>
  </div>`;
}
const dkv = (k, v) => html`<div key=${k} className="dkv"><span>${k}</span><span>${v}</span></div>`;
function DrivePanel({ S, A }) {
  const t = S.trip;
  const cost = Math.round(((t.km / EFF30) * 1692) / 10) * 10;
  if (S.drive === 'refuel') {
    const best = ranked({ ...S, refueled: false, filled: false })[0];
    return html`<div className="drv-in" style=${{ display: 'contents' }}>
      <div className="d-l">주유 추천</div>
      <div className="d-b mid">${best.name}</div>
      <div className="d-s">경로에서 ${best.detour.toFixed(1)} km 우회 · ${won(best.price)}원/L</div>
      <div>${dkv('주행가능거리', range(S) + ' km')}${dkv(destName(S) + '까지', destLeft(S).toFixed(0) + ' km')}${dkv('예상 절감', html`<span className="pos">${won(best.net)}원</span>`)}</div>
      <div style=${{ flex: '1 1 auto' }}></div>
      <div className="d-btns"><${Btn} v="primary" size="l" block onClick=${A.driveWaypoint}>경유지 추가<//><${Btn} v="outline" size="l" block onClick=${() => A.set({ drive: 'route' })}>닫기<//></div>
    </div>`;
  }
  if (S.drive === 'safety' && S.kinds) {
    // 차량 데이터: SafetyMonitor가 보낸 이번 주행 기록
    const k = S.kinds;
    const last = S.lastKind || 'decel';
    const belt = S.car && S.car.belt != null ? (S.car.belt ? '착용' : '미착용') : '확인 안 됨';
    return html`<div className="drv-in" style=${{ display: 'contents' }}>
      <div className="d-l">안전 기록</div>
      <div className="d-b">${KIND_NAME[last]} ${Math.max(1, k[last] || 0)}회</div>
      <div className="d-s">이번 주행 · 방금</div>
      <div>${KIND_KEYS.filter((x) => x !== last && x !== 'belt').map((x) => dkv(KIND_NAME[x], (k[x] || 0) + '회'))}${dkv('안전벨트', belt)}</div>
      <p className="d-note">주행 중에는 기록만 합니다. 자세한 내용은 정차한 뒤에 보여 드립니다.</p>
    </div>`;
  }
  if (S.drive === 'safety') {
    return html`<div className="drv-in" style=${{ display: 'contents' }}>
      <div className="d-l">안전 기록</div>
      <div className="d-b">급감속 ${Math.max(1, t.events)}회</div>
      <div className="d-s">이번 주행 · 방금 반포대로</div>
      <div>${dkv('제한속도 초과', '0회')}${dkv('깜빡이 없이 차로 변경', '0회')}${dkv('안전벨트', '착용')}</div>
      <p className="d-note">주행 중에는 기록만 합니다. 자세한 내용은 정차한 뒤에 보여 드립니다.</p>
    </div>`;
  }
  if (S.drive === 'nonav' && S.src === '차량') {
    const c = tripCost(S, t.km);
    return html`<div className="drv-in" style=${{ display: 'contents' }}>
      <div className="d-l">이번 주행</div>
      <div className="d-b"><${Num} v=${t.km} d=${1} suf=" km" /></div>
      <div className="d-s">경로 안내 없이 주행 중</div>
      <div>${dkv('시간', Math.round(t.sec / 60) + '분')}${dkv(c.name, '약 ' + won(c.won) + '원')}${dkv('안전 기록', t.events ? t.events + '건' : '없음')}</div>
    </div>`;
  }
  if (S.drive === 'nonav') {
    const km = 48.2 + t.km;
    return html`<div className="drv-in" style=${{ display: 'contents' }}>
      <div className="d-l">오늘 주행</div>
      <div className="d-b"><${Num} v=${km} d=${1} suf=" km" /></div>
      <div className="d-s">경로 안내 없이 주행 중</div>
      <div>${dkv('연비', '12.6 km/L')}${dkv('연료비', '약 ' + won(Math.round(((km / 12.6) * 1692) / 10) * 10) + '원')}${dkv('안전 기록', '없음')}</div>
    </div>`;
  }
  const lc = S.src === '차량' ? tripCost(S, t.km) : null;
  return html`<div className="drv-in" style=${{ display: 'contents' }}>
    <div className="d-l">이번 주행</div>
    <div className="d-b"><${Num} v=${lc ? lc.won : cost} suf="원" /></div>
    <div className="d-s">${lc ? lc.name + ' · ' + lc.basis + '로 계산' : '연료비 · ' + EFF30 + ' km/L로 계산'}</div>
    <div>${dkv('주행', t.km.toFixed(1) + ' km · ' + Math.round(t.sec / 60) + '분')}${dkv(S.stop ? '경유지까지' : destName(S) + '까지', S.stop ? Math.max(0, 1.6 - t.km).toFixed(1) + ' km' : destLeft(S).toFixed(1) + ' km')}${dkv('안전 기록', t.events ? (S.kinds ? t.events + '건' : '급감속 ' + t.events + '회') : '없음')}</div>
  </div>`;
}
function Driving({ S, A }) {
  return html`<div className="full"><${NavPane} S=${S} />
    <div className="drv"><${Swap} k=${S.drive} cls="dv"><div className="drv-in" style=${{ position: 'absolute', inset: 0, boxSizing: 'border-box', padding: '48px 48px 40px', display: 'flex', flexDirection: 'column', gap: '8px' }}><${DrivePanel} S=${S} A=${A} /></div><//></div>
  </div>`;
}

// ── 차량 연동 ──
// 차량 데이터 모드에서 주유소를 내비게이션 경유지로 넣는다. 시연 모드는 화면만 바꾼다.
function sendWaypoint(s, st) {
  if (s.src !== '차량' || !native()) return true;
  return HV.addWaypoint({ lat: st.lat, lng: st.lng, name: st.name, address: st.addr, poiId: st.id });
}
function liveFuelRow(s) {
  const lv = s.live;
  const when = whenOf(lv.at);
  const amount = Math.round((lv.liters * LIVE_PRICE) / 10) * 10;
  return { id: 'live' + (lv.at || Date.now()), icon: 'fuel', title: lv.address || '주유', when, detail: when + ' · ' + lv.liters + ' L · 자동 기록', amount,
    unit: won(LIVE_PRICE) + '원/L', fuel: true, auto: true, live: true, L: lv.liters, price: LIVE_PRICE, lv: '연료 ' + lv.fromPct + '%에서 ' + lv.toPct + '%로',
    odo: s.car && s.car.odoKm ? Math.round(s.car.odoKm) : null, src: '예시 단가 · 유가 정보 연동 전' };
}
function liveChargeRow(s) {
  const lv = s.live;
  const when = whenOf(lv.at);
  const kwh = lv.kwh != null ? lv.kwh : 0;
  const amount = Math.round((kwh * LIVE_KWH_PRICE) / 10) * 10;
  return { id: 'live' + (lv.at || Date.now()), icon: 'plug', title: '충전', when, detail: when + ' · ' + kwh + ' kWh · 자동 기록', amount,
    unit: LIVE_KWH_PRICE + '원/kWh', charge: true, auto: true, live: true, kwh, lv: '배터리 ' + lv.fromPct + '%에서 ' + lv.toPct + '%로',
    odo: s.car && s.car.odoKm != null ? Math.round(s.car.odoKm) : null };
}
const driveView = (s) => (routeOf(s) ? 'route' : 'nonav');
// 주행 규제(CarUxRestrictions)는 시연·차량 모드와 관계없이 따른다: 켜지면 입력 없는 주행 화면으로 바꾸고 팝업·영상을 닫는다
function restrict(s, on) {
  if (on) {
    if (s.restricted && s.mode === 'driving') return s;
    const keep = s.popup === 'refuel' || s.popup === 'charge' ? s.popup : s.queued;
    const base = { ...s, restricted: true, popup: null, video: 0, queued: keep };
    if (s.mode === 'driving') return base;
    return { ...base, mode: 'driving', forced: true, drive: s.src === '차량' ? driveView(s) : 'route', trip: s.src === '차량' ? s.trip : { km: 0, sec: 0, events: 0 } };
  }
  if (!s.restricted) return s;
  if (!s.forced) return { ...s, restricted: false };
  return { ...s, restricted: false, forced: false, mode: 'parked', speed: 0, page: 'home', dir: 'fade', popup: s.queued || null, queued: null };
}
// VehicleHub 이벤트 → 화면 상태. 차량 모드에서만 화면 흐름을 바꾸고(주행 규제 제외), 시연 모드에서는 값만 받아 둔다
function vehicleEvent(ev, setS, getS) {
  const live = (fn) => setS((s) => (s.src === '차량' ? fn(s) : s));
  switch (ev.type) {
    case 'caps':
      setS((s) => ({ ...s, caps: ev.caps || null }));
      break;
    case 'snapshot':
      setS((s) => {
        const car = ev.data || null;
        const n = { ...s, car };
        const tr = car && car.trip;
        if (s.src === '차량' && s.mode === 'driving' && car) {
          n.speed = car.speedKmh || 0;
          if (tr && tr.active) n.trip = { km: tr.km, sec: tr.sec, events: sumCounts(tr.events) };
        }
        return n;
      });
      break;
    case 'restricted':
      setS((s) => restrict(s, !!ev.on));
      break;
    case 'trip':
      live((s) => {
        if (ev.phase === 'start') {
          // 떠 있던 주유·충전 팝업은 지우지 않고 정차한 뒤에 다시 띄운다
          const keep = s.popup === 'refuel' || s.popup === 'charge' ? s.popup : s.queued;
          return { ...s, mode: 'driving', forced: false, drive: driveView(s), popup: null, queued: keep, video: 0, stop: false, trip: { km: 0, sec: 0, events: 0 }, kinds: { decel: 0, speeding: 0, lane: 0, belt: 0 }, lastKind: null };
        }
        const t = ev.trip || {};
        const trip = { km: t.km || 0, sec: t.sec || 0, events: sumCounts(t.events) };
        const kinds = t.events && typeof t.events === 'object' ? t.events : s.kinds;
        // 기어만 바꾸고 움직이지 않았으면(0.1 km 미만) 주행 종료 팝업을 띄우지 않는다
        const next = s.queued || (trip.km >= 0.1 ? 'tripEnd' : null);
        if (s.restricted) return { ...s, trip, kinds, forced: true, queued: next };
        return { ...s, mode: 'parked', forced: false, speed: 0, video: 0, page: 'home', dir: 'fade', trip, kinds, popup: next, queued: null };
      });
      break;
    case 'refuel':
    case 'charge':
      live((s) => {
        if ((ev.type === 'refuel') === !!s.ev) return s; // 지금 화면 차종과 맞는 것만
        // 기록 여부는 사용자가 팝업에서 고른다(기록을 누를 때 가계부에 넣는다)
        if (s.mode === 'driving' || s.restricted) return { ...s, live: ev, queued: ev.type };
        return { ...s, live: ev, popup: ev.type };
      });
      break;
    case 'safety':
      live((s) => (s.mode !== 'driving' ? s : { ...s, drive: 'safety', lastKind: ev.kind, kinds: ev.counts || s.kinds, trip: { ...s.trip, events: sumCounts(ev.counts) } }));
      break;
    case 'fuelLow': {
      const s = getS();
      if (s.src !== '차량' || s.mode !== 'driving' || s.ev) break;
      const best = ranked({ ...s, refueled: false, filled: false })[0];
      setS((x) => ({ ...x, drive: 'refuel', stop: false }));
      // 화면을 보지 않아도 되도록 한 문장으로 알린다(Pleos TextToSpeech)
      HV.speak('가는 길에 ' + best.name + '에서 주유하면 ' + won(best.net) + '원 아낄 수 있습니다.');
      break;
    }
    case 'waypoint':
      if (!ev.ok) setS((s) => ({ ...s, toast: { id: Date.now() + Math.random(), msg: '내비게이션이 경유지를 받지 못했습니다' } }));
      break;
    default:
      break;
  }
}

// ── 동작 ──
function makeActions(setS, getS) {
  const up = (fn) => setS((s) => ({ ...s, ...(typeof fn === 'function' ? fn(s) : fn) }));
  const toast = (msg) => up({ toast: { id: Date.now() + Math.random(), msg } });
  const A = {
    set: (patch) => up(patch),
    toast,
    go: (page, o = {}) => up((s) => {
      if (s.mode === 'driving') return {};
      if (s.page === page && (o.arg == null || o.arg === s.arg) && !s.popup && !s.video) return {};
      return { page, arg: o.arg != null ? o.arg : s.arg, dir: o.dir || 'fade', popup: null, video: 0, flash: null };
    }),
    tab: (key, v) => up((s) => ({ tab: { ...s.tab, [key]: v }, flash: null })),
    cal: (m, d) => up((s) => ({ cal: { ...s.cal, [m]: d }, flash: null })),
    setting: (key, v) => up((s) => ({ set: { ...s.set, [key]: v } })),
    form: (patch) => up((s) => ({ form: { ...s.form, ...patch } })),
    newEntry: (cat, dir) => up((s) => ({ page: 'entry', dir: dir || (s.page === 'home' || s.page === 'ledger' || s.page === 'care' ? 'fwd' : 'fade'), popup: null, form: formFor(cat), flash: null })),
    closePopup: () => up({ popup: null }),
    record: () => {
      const cur = getS();
      if (cur.live && cur.live.type === 'refuel') {
        // 차량 데이터로 감지한 주유를 기록한다
        up((s) => {
          if (!s.live || s.live.type !== 'refuel') return { popup: null };
          const row = liveFuelRow(s);
          return { ledger: [row, ...s.ledger], live: null, filled: true, stop: false, popup: null, page: 'ledger', dir: 'fade', tab: { ...s.tab, ledger: '11월' }, cal: { ...s.cal, '11월': dayOf(row.detail) }, flash: row.id };
        });
        toast('가계부에 기록했습니다');
        return;
      }
      up((s) => (s.refueled ? { popup: null } : { ledger: [{ ...F1109, demoFill: true }, ...s.ledger], refueled: true, stop: false, popup: null, page: 'ledger', dir: 'fade', tab: { ...s.tab, ledger: '11월' }, cal: { ...s.cal, '11월': 9 }, flash: 'f1109' }));
      toast('가계부에 기록했습니다 · 추천 주유로 1,428원 절감');
    },
    recordManual: (amt) => {
      const v = toNum(amt);
      if (!v) { toast('영수증 금액을 넣어 주세요'); return; }
      up((s) => ({ ledger: [{ id: 'm' + Date.now(), demoFill: true, icon: 'fuel', title: '서초동 주유', when: '11월 9일 18:42', detail: '11월 9일 18:42 · 33.6 L · 직접 입력', amount: v, unit: won(v / 33.6) + '원/L', fuel: true, L: 33.6, price: Math.round(v / 33.6) }, ...s.ledger],
        refueled: true, popup: null, page: 'ledger', dir: 'fade', tab: { ...s.tab, ledger: '11월' }, cal: { ...s.cal, '11월': 9 } }));
      toast('가계부에 기록했습니다');
    },
    recordCharge: () => {
      const cur = getS();
      if (cur.live && cur.live.type === 'charge') {
        // 차량 데이터로 감지한 충전을 가계부에 넣는다
        up((s) => {
          if (!s.live || s.live.type !== 'charge') return { popup: null };
          const row = liveChargeRow(s);
          return { ledger: [row, ...s.ledger], live: null, charged: true, popup: null, flash: row.id };
        });
        toast('가계부에 기록했습니다');
        return;
      }
      up({ charged: true, popup: null, live: null });
      toast('충전을 기록했습니다');
    },
    // 화면 데이터 전환: 시연(예시 데이터) / 차량(실제 차량 값)
    setSrc: (v) => up((s) => (v === s.src ? {} : { src: v, live: null, queued: null, kinds: null, lastKind: null, popup: null })),
    saveEntry: () => setS((s) => {
      const f = s.form;
      const fuel = f.cat === '주유';
      const v = toNum(fuel ? f.famt : f.amt);
      if (!v) return { ...s, toast: { id: Date.now(), msg: '금액을 넣어 주세요' } };
      const id = 'n' + Date.now();
      const row = fuel
        ? { id, icon: 'fuel', title: f.fplace || '주유', when: f.fdate, detail: f.fdate + ' · ' + toNum(f.L) + ' L · 직접 입력', amount: v, unit: won(toNum(f.price)) + '원/L', fuel: true, L: toNum(f.L), price: toNum(f.price), ftype: f.ftype }
        : { id, icon: CAT_ICON[f.cat], title: f.cat, detail: [f.date, f.place, '직접 입력'].filter(Boolean).join(' · '), amount: v };
      return { ...s, ledger: [row, ...s.ledger], page: 'ledger', dir: 'back', tab: { ...s.tab, ledger: '11월' }, cal: { ...s.cal, '11월': dayOf(row.detail) }, flash: id, toast: { id: Date.now(), msg: '기록을 저장했습니다' } };
    }),
    washerDone: () => { up({ washer: false }); toast('와셔액 경고를 지웠습니다'); },
    waypoint: () => {
      const s = getS();
      const st = STATIONS.find((x) => x.id === s.stSel) || STATIONS[0];
      if (!sendWaypoint(s, st)) { toast('내비게이션에 연결되지 않아 경유지를 넣지 못했습니다'); return; }
      up({ stop: true, toast: { id: Date.now(), msg: st.name + '를 경유지로 추가했습니다' } });
    },
    guide: () => up((s) => ({ stop: true, mode: 'driving', drive: 'route', popup: null, video: 0, trip: { km: 0, sec: 0, events: 0 }, toast: { id: Date.now(), msg: (STATIONS.find((x) => x.id === s.stSel) || STATIONS[0]).name + '까지 경로 안내를 시작합니다' } })),
    driveWaypoint: () => {
      const s = getS();
      const best = ranked({ ...s, refueled: false, filled: false })[0];
      if (!sendWaypoint(s, best)) { toast('내비게이션에 연결되지 않아 경유지를 넣지 못했습니다'); return; }
      up({ stop: true, drive: 'route' });
      toast(best.name + '를 경유지로 추가했습니다');
    },
  };
  // 실제 차량이 주행 규제 중이면 시연 버튼으로도 정차 화면으로 바꾸지 않는다
  const park = (patch) => up((s) => (s.restricted ? {} : { mode: 'parked', speed: 0, video: 0, page: 'home', dir: 'fade', ...(typeof patch === 'function' ? patch(s) : patch) }));
  const drive = (view, events) => up((s) => ({ mode: 'driving', drive: view, popup: null, video: 0, trip: s.mode === 'driving' ? { ...s.trip, events: Math.max(s.trip.events, events || 0) } : { km: 0, sec: 0, events: events || 0 } }));
  const D = {
    start: () => { up({ ev: false }); drive('route'); },
    suggest: () => { up((s) => ({ ev: false, refueled: false, filled: false, stop: false, flash: null, ledger: s.ledger.filter((r) => r.id !== 'f1109' && !r.demoFill) })); drive('refuel'); },
    arrive: () => { park((s) => ({ ev: false, filled: true, popup: s.refueled ? null : 'refuel' })); },
    tripEnd: () => park({ ev: false, popup: 'tripEnd' }),
    safety: () => { up({ ev: false }); drive('safety', 1); },
    nonav: () => { up({ ev: false }); drive('nonav'); },
    noPrice: () => park((s) => ({ ev: false, filled: true, popup: s.refueled ? null : 'refuelManual' })),
    care: () => park({ ev: false, popup: 'care', washer: true }),
    ev: () => park((s) => ({ ev: !s.ev, popup: null })),
    charge: () => park((s) => ({ ev: true, popup: s.charged ? null : 'charge' })),
    reset: () => setS((s) => ({ ...fresh(), src: s.src, car: s.car, caps: s.caps, restricted: s.restricted, ...(s.restricted ? { mode: 'driving', forced: true } : {}) })),
  };
  return { A, D };
}

// ── 앱 ──
function App() {
  const [S, setS] = useState(fresh);
  const [box, setBox] = useState({ s: 0.5, x: 0, y: 0 });
  const sRef = useRef(S);
  sRef.current = S;
  const [ft, setFt] = useState(0);
  const fitRef = useRef(null);
  const acts = useRef(null);
  if (!acts.current) acts.current = makeActions(setS, () => sRef.current);
  const { A, D } = acts.current;

  useLayoutEffect(() => {
    const el = fitRef.current;
    const fit = () => {
      if (!EMBED) { setBox({ s: el.clientWidth / 1920, x: 0, y: 0 }); return; }
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      const s = Math.min(w / AW, h / AH);
      setBox({ s, x: Math.round((w - AW * s) / 2), y: Math.round((h - AH * s) / 2) });
    };
    fit();
    if (window.ResizeObserver) { const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect(); }
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  useEffect(() => { if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => setFt(1)); }, []);
  useEffect(() => {
    window.hyBack = () => {
      const s = sRef.current;
      if (s.video) { A.set({ video: 0 }); return true; }
      if (s.popup) { A.closePopup(); return true; }
      if (s.mode === 'driving') return false;
      const bk = document.querySelector('#stage .layer.in .hd-back');
      if (bk) { bk.click(); return true; }
      if (s.page !== 'home') { A.go('home'); return true; }
      return false;
    };
    return () => { delete window.hyBack; };
  }, []);
  // 차량 연동(앱에서만): VehicleHub 이벤트를 받는다
  useEffect(() => {
    if (!native()) return undefined;
    setS((s) => ({ ...s, caps: HV.caps() || s.caps, car: HV.snapshot() || s.car }));
    const off = HV.on((ev) => vehicleEvent(ev, setS, () => sRef.current));
    HV.ready();
    return off;
  }, []);
  // 차량 모드: 안전 기록 패널은 잠깐 보여 주고 주행 화면으로 돌아간다
  useEffect(() => {
    if (S.src !== '차량' || S.mode !== 'driving' || S.drive !== 'safety') return undefined;
    const t = setTimeout(() => setS((s) => (s.drive === 'safety' ? { ...s, drive: driveView(s) } : s)), 8000);
    return () => clearTimeout(t);
  }, [S.src, S.mode, S.drive, S.kinds]);
  // 시연 모드의 주행 시뮬레이션. 차량 모드에서는 거리·시간을 차량에서 받는다
  useEffect(() => {
    if (S.mode !== 'driving' || S.src === '차량') return undefined;
    const iv = setInterval(() => setS((s) => {
      if (s.mode !== 'driving' || s.src === '차량') return s;
      const sec = s.trip.sec + 20;
      const speed = 58 + Math.sin(sec / 40) * 8 + Math.random() * 3;
      return { ...s, speed, trip: { ...s.trip, sec, km: s.trip.km + (speed / 3600) * 20, events: s.trip.events || (s.drive === 'route' && sec >= 240 ? 1 : 0) } };
    }), 1000);
    setS((s) => ({ ...s, speed: s.speed || 60 }));
    return () => clearInterval(iv);
  }, [S.mode, S.src]);
  useEffect(() => {
    if (!S.toast) return undefined;
    const t = setTimeout(() => setS((s) => (s.toast && s.toast.id === S.toast.id ? { ...s, toast: null } : s)), 2800);
    return () => clearTimeout(t);
  }, [S.toast && S.toast.id]);
  useEffect(() => {
    if (!S.flash) return undefined;
    const t = setTimeout(() => setS((s) => ({ ...s, flash: null })), 1800);
    return () => clearTimeout(t);
  }, [S.flash]);

  const state = (S.ev ? '전기차' : '내연기관차') + ' · ' + (S.mode === 'driving' ? '주행 중, 입력 없이 숫자와 큰 버튼만' : '정차 중') + ' · ' + (S.ev ? (S.charged ? '충전 후 82%' : '충전 전 34%') : (tank(S) ? '주유 후 74%' : '주유 전 18%'));
  const popupKey = S.restricted ? '' : S.popup || '';
  return html`<${FontTick.Provider} value=${ft}><div className=${EMBED ? 'wrap embed' : 'wrap'}>
    ${EMBED ? null : html`<div className="top"><span><b>Hyundiary</b> 차량 화면 프리뷰 · Pleos OS 화면을 본뜬 비공식 목업이며 모든 수치와 주유소는 예시입니다.</span><span className="st" aria-live="polite">${state}</span></div>`}
    <div id="fit" className=${EMBED ? 'embed' : undefined} ref=${fitRef}>
      <div id="stage" className=${EMBED ? 'embed' : undefined} role="region" aria-label="차량 디스플레이" style=${{ transform: 'translate(' + box.x + 'px, ' + box.y + 'px) scale(' + box.s + ')' }}>
        ${EMBED ? null : html`<${OsChrome} S=${S} />`}
        <div className="app-area">
          <${Swap} k=${S.mode} cls=${S.mode === 'driving' ? 'mode-drive' : 'mode-park'} dur=${420}>
            ${S.mode === 'driving' ? html`<${Driving} S=${S} A=${A} />` : html`<${Parked} S=${S} A=${A} />`}
          <//>
          <${Swap} k=${popupKey} cls="pop" passthru dur=${240}>${S.popup && !S.restricted ? html`<${PopupLayer} key=${popupKey} S=${S} A=${A} />` : null}<//>
          <${Swap} k=${'v' + S.video} cls="pop" passthru dur=${240}>${S.video && !S.restricted ? html`<${VideoLayer} S=${S} A=${A} />` : null}<//>
        </div>
        <${Swap} k=${S.toast ? String(S.toast.id) : ''} cls="tst" passthru dur=${240}>${S.toast ? html`<div className="toast" role="status">${S.toast.msg}</div>` : null}<//>
      </div>
    </div>
    ${EMBED ? html`<${DemoDock} S=${S} D=${D} />` : html`<div className="demo" aria-label="시연 버튼">
      <${DemoGroups} S=${S} D=${D} />
      <div className="now">정차 중에는 차량 화면을 바로 눌러 볼 수 있습니다. 가계부 달력의 날짜, 통계의 소비 습관, 주유소 정렬, 안전 운전의 기록 번호와 영상을 눌러 보세요.</div>
    </div>`}
  </div><//>`;
}

// 시연 버튼 묶음. after는 버튼을 누른 뒤 부를 함수(에뮬 앱에서 패널 닫기)
function DemoGroups({ S, D, after }) {
  const b = (fn, label, p) => html`<button type="button" className=${p ? 'p' : undefined} onClick=${() => { fn(); if (after) after(); }}>${label}</button>`;
  return html`
    <div className="g"><span className="lbl">기본 흐름</span>
      ${b(D.start, '① 주행 시작', 1)}${b(D.suggest, '② 주유 제안 받기', 1)}${b(D.arrive, '③ 주유 후 정차', 1)}${b(D.tripEnd, '④ 주행 종료', 1)}</div>
    <div className="g"><span className="lbl">다른 상황</span>
      ${b(D.safety, '주행 중 안전 기록')}${b(D.nonav, '경로 없이 주행')}${b(D.noPrice, '유가 정보 없는 주유')}${b(D.care, '소모품 경고')}</div>
    <div className="g"><span className="lbl">차종</span>
      ${b(D.ev, S.ev ? '내연기관차로 전환' : '전기차로 전환')}${b(D.charge, '충전 후 정차')}${b(D.reset, '처음부터')}</div>`;
}

// 에뮬 앱용 시연 패널: 오른쪽 아래 작은 버튼으로 열고 닫는다. 발표자만 쓰는 조작이라 앱 화면과 구분되게 둔다.
function DemoDock({ S, D }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return html`<div className="dock">
    ${open ? html`<div className="dock-scrim" onClick=${close}></div>` : null}
    ${open ? html`<div className="demo dock-panel" role="dialog" aria-label="시연 버튼">
      <${DemoGroups} S=${S} D=${D} after=${close} />
      <div className="now">${(S.ev ? '전기차' : '내연기관차') + ' · ' + (S.mode === 'driving' ? '주행 중' : '정차 중') + (native() ? ' · ' + (S.src === '차량' ? '차량 데이터' : '시연 데이터') + (S.restricted ? ' · 주행 규제' : '') : '')}</div>
    </div>` : null}
    <button type="button" className=${'dock-fab' + (open ? ' on' : '')} aria-expanded=${open} onClick=${() => setOpen(!open)}>${open ? '닫기' : '시연'}</button>
  </div>`;
}

ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
