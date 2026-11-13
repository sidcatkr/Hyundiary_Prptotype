package com.hyundiary.mockup.car

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import com.hyundiary.mockup.logic.FuelMath
import com.hyundiary.mockup.logic.Gear
import com.hyundiary.mockup.logic.LevelRiseDetector
import com.hyundiary.mockup.logic.SafetyMonitor
import com.hyundiary.mockup.logic.TripTracker
import org.json.JSONObject

/**
 * 차량 연동의 중심. 각 연동 대상에서 받은 값을 [VehicleState]에 모으고, 판단 로직(주유 감지, 주행 시작·종료,
 * 안전 운전 기록, 주유 제안)을 돌려 웹 화면에 이벤트(JSON)로 보낸다.
 *
 * 모든 상태 변경은 메인 스레드에서만 한다. 웹 브리지(JavaBridge 스레드)에서 오는 호출은 메인으로 옮긴다.
 *
 * 웹으로 보내는 이벤트(type):
 *  caps      연동 대상별 연결 상태
 *  snapshot  현재 값(1초마다, 바뀐 경우만)
 *  restricted 주행 규제(주행 중 화면 제한) 켜짐/꺼짐
 *  trip      주행 시작(phase=start) / 종료(phase=end, 거리·시간·안전 기록)
 *  refuel    정차 중 연료 증가 → 주유량(L)
 *  charge    정차 중 배터리 증가 → 충전량(kWh)
 *  safety    안전 운전 기록 1건(decel/speeding/lane/belt)
 *  fuelLow   주행 중 주유가 필요해짐(주행가능거리 < 남은 경로 + 여유)
 *  waypoint  경유지 추가 결과
 */
class VehicleHub(context: Context, private val sink: EventSink) :
    CarApiSource.Listener,
    PleosVehicleSource.Listener,
    NaviSource.Listener,
    VoiceGuide.Listener,
    LocationSource.Listener {

    /** 웹으로 이벤트를 보낸다. 메인 스레드에서 불린다. */
    fun interface EventSink {
        fun onEvent(json: String)
    }

    private val app = context.applicationContext
    private val main = Handler(Looper.getMainLooper())
    private val state = VehicleState()

    private val carApi = CarApiSource(app, main, state, this)
    private val vehicle = PleosVehicleSource(app, main, state, this)
    private val navi = NaviSource(app, main, state, this)
    private val voice = VoiceGuide(app, main, this)
    private val location = LocationSource(app, main, state, this)

    private val refuel = LevelRiseDetector(minRisePct = 5f, settleMs = 10_000L)
    // 충전은 1%씩 천천히 오르므로 오래 기다리거나 출발할 때 확정한다
    private val charge = LevelRiseDetector(minRisePct = 5f, settleMs = 300_000L)
    private val trips = TripTracker()
    private val safety = SafetyMonitor()

    private val sources = linkedMapOf(
        "car" to SourceState.OFF,
        "vehicle" to SourceState.OFF,
        "navi" to SourceState.OFF,
        "voice" to SourceState.OFF,
        "location" to SourceState.OFF,
    )
    private var carProps: Map<String, Boolean> = emptyMap()
    private var vehicleDomains: Map<String, SourceState> = emptyMap()

    @Volatile private var capsJson = "{}"
    @Volatile private var snapshotJson = "{}"
    @Volatile private var naviReady = false
    @Volatile private var voiceReady = false

    private var started = false
    private var fuelLowSent = false
    private var addressAsked = false
    private var lastGear = Gear.UNKNOWN

    private val tick = object : Runnable {
        override fun run() {
            if (!started) return
            onTick(SystemClock.elapsedRealtime())
            main.postDelayed(this, TICK_MS)
        }
    }

    // ── 수명 주기(Activity에서 부른다) ──

    fun start() = onMain {
        if (started) return@onMain
        started = true
        carApi.start()
        vehicle.start()
        navi.start()
        voice.start()
        location.start()
        main.postDelayed(tick, TICK_MS)
        updateCaps()
    }

    /** 런타임 권한을 새로 받은 뒤 부른다. */
    fun onPermissionsChanged() = onMain {
        if (!started) return@onMain
        carApi.resubscribe()
        location.start()
    }

    fun release() = onMain {
        started = false
        main.removeCallbacks(tick)
        location.stop()
        voice.stop()
        navi.stop()
        vehicle.stop()
        carApi.stop()
    }

    // ── 웹 브리지에서 부른다(아무 스레드) ──

    fun caps(): String = capsJson
    fun snapshot(): String = snapshotJson

    /** 웹이 리스너를 붙인 뒤 부른다. 지금 상태를 한 번 보낸다. */
    fun webReady() = onMain {
        emit(JSONObject().put("type", "caps").put("caps", JSONObject(capsJson)))
        emitSnapshot(force = true)
        state.restricted?.let { emit(JSONObject().put("type", "restricted").put("on", it)) }
    }

    /** 웹에서 받은 주유소를 경유지로 넣는다. 결과는 waypoint 이벤트로 간다. */
    fun addWaypoint(json: String): Boolean {
        if (!naviReady) return false
        val o = try { JSONObject(json) } catch (e: Exception) { return false }
        val lat = o.optDouble("lat", Double.NaN)
        val lng = o.optDouble("lng", Double.NaN)
        val name = o.optString("name", "").take(60)
        if (lat.isNaN() || lng.isNaN() || name.isBlank()) return false
        val addr = o.optString("address", "").take(120)
        val poiId = o.optString("poiId", "").take(60)
        main.post {
            if (!navi.addWaypoint(lat, lng, name, addr, poiId)) onWaypointResult(false, "NOT_SENT")
        }
        return true
    }

    fun speak(text: String): Boolean {
        if (!voiceReady) return false
        main.post { voice.speak(text) }
        return true
    }

    // ── 연동 대상 콜백(메인 스레드) ──

    override fun onCarStatus(status: SourceState, props: Map<String, Boolean>) {
        sources["car"] = status
        carProps = props
        updateCaps()
    }

    override fun onCarChanged(what: String) {
        val t = SystemClock.elapsedRealtime()
        when (what) {
            "speed" -> state.speedKmh?.let { v ->
                handleTrip(trips.onSpeed(t, v))
                if (trips.active) safety.onSpeed(t, v).forEach { emitSafety(it) }
            }
            "gear" -> onGear(t, state.gear)
            "fuel" -> onFuel(t)
            "restricted" -> emit(JSONObject().put("type", "restricted").put("on", state.restricted == true))
        }
    }

    override fun onVehicleStatus(status: SourceState, domains: Map<String, SourceState>) {
        sources["vehicle"] = status
        vehicleDomains = domains
        updateCaps()
    }

    override fun onVehicleChanged(what: String) {
        val t = SystemClock.elapsedRealtime()
        when (what) {
            "odo" -> state.odoKm?.let { trips.onOdometer(it.toDouble()) }
            "soc" -> state.evSocPct?.let { soc ->
                charge.onLevel(t, soc, state.parked)?.let { emitCharge(it) }
            }
            "turn" -> safety.onTurnSignal(t, state.turnSignal != null && state.turnSignal != "OFF")
            "steer" -> state.steerDeg?.let { deg -> if (trips.active) safety.onSteering(t, deg)?.let { emitSafety(it) } }
            "belt" -> state.driverBelt?.let { b -> safety.onBelt(t, b)?.let { if (trips.active) emitSafety(it) } }
        }
    }

    override fun onNaviStatus(status: SourceState) {
        sources["navi"] = status
        naviReady = status == SourceState.OK
        updateCaps()
    }

    override fun onNaviChanged(what: String) {
        if (what == "limit") safety.onSpeedLimit(state.speedLimitKmh)
    }

    override fun onWaypointResult(ok: Boolean, error: String?) {
        emit(JSONObject().put("type", "waypoint").put("ok", ok).putOpt("error", error))
    }

    override fun onVoiceStatus(status: SourceState) {
        sources["voice"] = status
        voiceReady = status == SourceState.OK
        updateCaps()
    }

    override fun onLocationStatus(status: SourceState) {
        sources["location"] = status
        updateCaps()
    }

    override fun onLocationChanged() = Unit

    // ── 판단 ──

    private fun onTick(t: Long) {
        // 차속 이벤트가 값이 같을 때 오지 않는 경우에도 거리가 쌓이도록 1초마다 현재 차속을 넣는다
        state.speedKmh?.let { handleTrip(trips.onSpeed(t, it)) }
        refuel.onTick(t)?.let { emitRefuel(it) }
        charge.onTick(t)?.let { emitCharge(it) }
        if (trips.active && !fuelLowSent) {
            val remain = state.destRemainM?.let { it / 1000.0 }
            if (FuelMath.needsFuel(state.rangeKm, state.fuelPct, remain)) {
                fuelLowSent = true
                emit(JSONObject().put("type", "fuelLow")
                    .putOpt("rangeKm", state.rangeKm?.let { Math.round(it) })
                    .putOpt("remainKm", remain?.let { Math.round(it) })
                    .putOpt("fuelPct", state.fuelPct?.let { Math.round(it) }))
            }
        }
        emitSnapshot(force = false)
    }

    private fun onGear(t: Long, g: Gear) {
        if (g == lastGear) return
        val wasParked = lastGear == Gear.P
        lastGear = g
        if (wasParked && g != Gear.P) {
            // 출발하면 진행 중이던 주유·충전을 확정한다
            refuel.onDriveStart(t)?.let { emitRefuel(it) }
            charge.onDriveStart(t)?.let { emitCharge(it) }
        }
        handleTrip(trips.onGear(t, g))
        // 정차 상태가 바뀌었으니 연료 기준을 새로 잡게 한다
        state.fuelPct?.let { refuel.onLevel(t, it, state.parked) }
        state.evSocPct?.let { charge.onLevel(t, it, state.parked) }
    }

    private fun onFuel(t: Long) {
        val pct = state.fuelPct ?: return
        refuel.onLevel(t, pct, state.parked)?.let { emitRefuel(it) }
        // 주유가 시작되면 기록에 쓸 주소를 미리 받아 둔다
        if (refuel.inProgress && !addressAsked) {
            addressAsked = true
            navi.requestAddress()
        }
    }

    private fun handleTrip(ev: TripTracker.Event?) {
        when (ev) {
            is TripTracker.Event.Started -> {
                safety.reset()
                fuelLowSent = false
                navi.refresh()
                emit(JSONObject().put("type", "trip").put("phase", "start"))
            }
            is TripTracker.Event.Ended -> {
                emit(JSONObject().put("type", "trip").put("phase", "end").put("trip", tripJson(ev.trip)))
            }
            null -> Unit
        }
    }

    private fun emitRefuel(r: LevelRiseDetector.Rise) {
        addressAsked = false
        fuelLowSent = false
        val cap = state.fuelCapL ?: DEFAULT_TANK_L
        emit(JSONObject().put("type", "refuel")
            .put("fromPct", Math.round(r.fromPct))
            .put("toPct", Math.round(r.toPct))
            .put("liters", FuelMath.liters(r.deltaPct, cap))
            .put("capL", cap)
            .put("capKnown", state.fuelCapL != null)
            .put("at", System.currentTimeMillis())
            .putOpt("address", state.address)
            .putOpt("loc", locJson()))
    }

    private fun emitCharge(r: LevelRiseDetector.Rise) {
        val capKwh = state.evCapWh?.let { it / 1000.0 }
        emit(JSONObject().put("type", "charge")
            .put("fromPct", Math.round(r.fromPct))
            .put("toPct", Math.round(r.toPct))
            .putOpt("kwh", capKwh?.let { Math.round(r.deltaPct / 100.0 * it * 10.0) / 10.0 })
            .put("at", System.currentTimeMillis())
            .putOpt("address", state.address))
    }

    private fun emitSafety(r: SafetyMonitor.Record) {
        emit(JSONObject().put("type", "safety")
            .put("kind", r.kind.key)
            .put("kmh", Math.round(r.kmh))
            .put("counts", countsJson()))
    }

    private fun emitSnapshot(force: Boolean) {
        val now = SystemClock.elapsedRealtime()
        val trip = trips.current(now)?.let { tripJson(it).put("active", true) }
        val json = state.toJson(trip).toString()
        if (!force && json == snapshotJson) return
        snapshotJson = json
        emit(JSONObject().put("type", "snapshot").put("data", JSONObject(json)))
    }

    private fun updateCaps() {
        val o = JSONObject()
        o.put("native", true)
        o.put("sources", JSONObject().apply { sources.forEach { (k, v) -> put(k, v.key) } })
        o.put("car", JSONObject().apply { carProps.forEach { (k, v) -> put(k, v) } })
        o.put("vehicle", JSONObject().apply { vehicleDomains.forEach { (k, v) -> put(k, v.key) } })
        val json = o.toString()
        if (json == capsJson) return
        capsJson = json
        emit(JSONObject().put("type", "caps").put("caps", o))
    }

    private fun tripJson(t: TripTracker.Trip) = JSONObject()
        .put("km", Math.round(t.km * 10.0) / 10.0)
        .put("sec", t.sec)
        .put("maxKmh", Math.round(t.maxKmh))
        .put("events", countsJson())

    private fun countsJson() = JSONObject().apply {
        SafetyMonitor.Kind.values().forEach { put(it.key, safety.counts[it] ?: 0) }
    }

    private fun locJson(): JSONObject? {
        val lat = state.lat ?: return null
        val lng = state.lng ?: return null
        return JSONObject().put("lat", lat).put("lng", lng)
    }

    private fun emit(o: JSONObject) {
        try {
            sink.onEvent(o.toString())
        } catch (e: Throwable) {
            Log.w(TAG, "emit", e)
        }
    }

    private fun onMain(block: () -> Unit) {
        if (Looper.myLooper() == main.looper) block() else main.post(block)
    }

    companion object {
        private const val TAG = "HyHub"
        private const val TICK_MS = 1_000L
        private const val DEFAULT_TANK_L = 60.0 // 차량이 탱크 용량을 주지 않을 때(앱 설정 기본값)
    }
}
