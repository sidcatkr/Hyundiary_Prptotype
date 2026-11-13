// 차량 연동 계층(window.HyVehicle).
// - 에뮬레이터·차량 앱(WebView): window.HyundiaryNative(Kotlin NativeBridge)로 실제 AAOS Car API와 Pleos SDK 값을 받는다.
//   앱은 window.HyVehicle._emit(json)으로 이벤트를 보낸다(종류는 VehicleHub.kt 참고).
// - 브라우저 프리뷰: 브리지가 없어 available=false. 화면은 시연 데이터로만 동작한다.
(function () {
  'use strict';
  var N = window.HyundiaryNative || null;
  var subs = [];
  var caps = null;
  var snap = null;

  function parse(s) {
    if (typeof s !== 'string' || !s) return null;
    try { return JSON.parse(s); } catch (e) { return null; }
  }
  function call(fn) {
    try { return fn(); } catch (e) { console.warn('[HyVehicle]', e && e.message); return null; }
  }

  var HV = {
    available: !!N,
    caps: function () { return caps; },
    snapshot: function () { return snap; },
    // 이벤트 구독. 해제 함수를 돌려준다.
    on: function (fn) {
      subs.push(fn);
      return function () { subs = subs.filter(function (f) { return f !== fn; }); };
    },
    // 웹이 구독을 마친 뒤 부른다. 앱이 지금 상태(caps, snapshot, restricted)를 한 번 보낸다.
    ready: function () { if (N && N.ready) call(function () { N.ready(); }); },
    // 주유소를 내비게이션 경유지로 넣는다. 결과는 waypoint 이벤트로 온다.
    addWaypoint: function (st) {
      if (!N) return false;
      return call(function () { return N.addWaypoint(JSON.stringify(st)); }) === true;
    },
    // 음성 안내(Pleos TextToSpeech). 주행 중 짧은 한 문장만.
    speak: function (text) {
      if (!N) return false;
      return call(function () { return N.speak(String(text)); }) === true;
    },
    // 승차감 기록 켜기/끄기. 앱은 주행을 시작할 때 판정(logic/CoffeeCup)을 시작하고, cup 이벤트로 결과를 보낸다.
    cupEnable: function (on) {
      if (!N || !N.cupEnable) return false;
      return call(function () { return N.cupEnable(!!on); }) === true;
    },
    _emit: function (ev) {
      if (typeof ev === 'string') ev = parse(ev);
      if (!ev || typeof ev.type !== 'string') return;
      if (ev.type === 'caps') caps = ev.caps || null;
      if (ev.type === 'snapshot') snap = ev.data || null;
      subs.slice().forEach(function (fn) {
        try { fn(ev); } catch (e) { console.error('[HyVehicle] listener', e); }
      });
    },
  };

  if (N) {
    caps = parse(call(function () { return N.caps(); }));
    snap = parse(call(function () { return N.snapshot(); }));
  }
  window.HyVehicle = HV;
})();
