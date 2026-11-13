package com.hyundiary.mockup.car

import ai.pleos.playground.vehicle.Vehicle
import ai.pleos.playground.vehicle.api.model.area.SeatArea
import ai.pleos.playground.vehicle.constant.area.SeatValue
import ai.pleos.playground.vehicle.constant.area.TurnSignalValue
import ai.pleos.playground.vehicle.constant.control.DrivingModeType
import ai.pleos.playground.vehicle.listener.DistanceDrivenListener
import ai.pleos.playground.vehicle.listener.DrivingModeStateListener
import ai.pleos.playground.vehicle.listener.EvBatteryStateOfChargeListener
import ai.pleos.playground.vehicle.listener.SeatBeltBuckledStateListener
import ai.pleos.playground.vehicle.listener.SteeringWheelAngleListener
import ai.pleos.playground.vehicle.listener.TurnSignalStateListener
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * Pleos Vehicle SDK로 읽는 값.
 *
 * - Odometer DistanceDriven     → 누적 주행거리, 주행 거리 계산 (pleos CAR_DRIVE)
 * - EvBattery StateOfCharge     → 전기차 배터리 %, 충전 감지 (pleos CAR_ENERGY)
 * - TurnSignal                  → 깜빡이 없이 차로 변경 판단 (pleos CAR_LIGHTS)
 * - SteeringWheel angle         → 차로 변경 추정 (pleos CAR_DRIVE)
 * - Seat belt (운전석 ROW_1_LEFT) → 안전벨트 미착용 주행, 승차감 기록 시작 조건 (pleos CAR_SEATS)
 * - DrivingMode                 → 승차감 정속 보너스를 에코 모드에서만 센다 (pleos CAR_DRIVE)
 *   에뮬레이터에는 이 값이 없다(ERROR_NOT_SUPPORTED_PROPERTY). 없으면 정속만으로 센다.
 *
 * 브레이크 페달(Brake)은 밟았는지 여부(Boolean)만 줘서 흔들림 계산에 쓰지 않는다(차속 변화율로 계산).
 * Safety의 안전벨트 경고(hasSeatBeltNotBuckledWarning)와 Odometer의 Trip 거리·시간은 에뮬레이터에 없어서
 * 안전벨트는 Seat, 주행 거리·시간은 차속 적분([com.hyundiary.mockup.logic.TripTracker])으로 대신한다.
 *
 * 경고등(Safety Telltales)은 쓰지 않는다. 에뮬레이터 실측에서 CAR_SAFETY만으로는 조회가 거부되고
 * (PRIVATE_CAR_SAFETY 필요), SDK의 경고등 종류에 와셔액이 없어 소모품 화면에 쓸 수 없었다.
 * 연료 %는 이 SDK의 Fuel이 에뮬레이터에서 값을 주지 않아 AAOS Car API(FUEL_LEVEL)로 받는다([CarApiSource]).
 * SDK는 binder 오류 때 onComplete·onFailed를 모두 부르지 않을 수 있어 조회마다 타임아웃을 둔다.
 * 에뮬레이터에서 첫 조회는 서비스 연결 때문에 3초를 넘기기도 해서 타임아웃을 8초로 둔다.
 * SDK 콜백은 어느 스레드에서 올지 모르므로 모두 메인 스레드로 옮겨 처리한다.
 */
class PleosVehicleSource(
    private val context: Context,
    private val main: Handler,
    private val state: VehicleState,
    private val listener: Listener,
) {
    interface Listener {
        fun onVehicleStatus(status: SourceState, domains: Map<String, SourceState>)
        fun onVehicleChanged(what: String)
    }

    private var vehicle: Vehicle? = null
    private var status = SourceState.OFF
    private val domains = linkedMapOf<String, SourceState>()
    private val driverSeat = SeatArea(SeatValue.ROW_1_LEFT)

    private val odoListener = object : DistanceDrivenListener {
        override fun onDistanceDrivenUpdated(value: Float?) = onMain {
            if (value != null && !value.isNaN()) {
                state.odoKm = value
                ok("odometer")
                listener.onVehicleChanged("odo")
            }
        }

        override fun onFailed(e: Exception) = onMain { fail("odometer", e) }
    }

    private val socListener = object : EvBatteryStateOfChargeListener {
        override fun onEvBatteryStateOfChargeUpdated(value: Int?) = onMain {
            if (value != null) {
                state.evSocPct = value.toFloat()
                ok("evBattery")
                listener.onVehicleChanged("soc")
            }
        }

        override fun onFailed(e: Exception) = onMain { fail("evBattery", e) }
    }

    private val turnListener = object : TurnSignalStateListener {
        override fun onTurnSignalStateUpdated(value: TurnSignalValue?) = onMain {
            if (value != null) {
                state.turnSignal = value.name
                ok("turnSignal")
                listener.onVehicleChanged("turn")
            }
        }

        override fun onFailed(e: Exception) = onMain { fail("turnSignal", e) }
    }

    private val steerListener = object : SteeringWheelAngleListener {
        override fun onSteeringWheelAngleUpdated(value: Float?) = onMain {
            if (value != null && !value.isNaN()) {
                state.steerDeg = value
                ok("steering")
                listener.onVehicleChanged("steer")
            }
        }

        override fun onFailed(e: Exception) = onMain { fail("steering", e) }
    }

    private val modeListener = object : DrivingModeStateListener {
        override fun onDrivingModeStateUpdated(value: DrivingModeType?) = onMain {
            if (value != null) {
                state.drivingMode = value.name
                ok("drivingMode")
                listener.onVehicleChanged("mode")
            }
        }

        override fun onFailed(e: Exception) = onMain { fail("drivingMode", e) }
    }

    private val beltListener = object : SeatBeltBuckledStateListener {
        override fun onSeatBeltBuckledStateUpdated(value: Boolean?) = onMain {
            if (value != null) {
                state.driverBelt = value
                ok("seatBelt")
                listener.onVehicleChanged("belt")
            }
        }

        override fun onFailed(e: Exception) = onMain { fail("seatBelt", e) }
    }

    fun start() {
        if (vehicle != null) return
        status = SourceState.CONNECTING
        val v = try {
            Vehicle(context).also { it.initialize() }
        } catch (e: Throwable) {
            Log.w(TAG, "Vehicle.initialize failed", e)
            status = SourceState.FAILED
            report()
            return
        }
        vehicle = v
        report()

        // 구독(값이 바뀔 때마다)과 현재 값 조회를 함께 한다. 하나가 실패해도 나머지는 계속한다.
        guard("odometer") {
            val odo = v.getOdometer()
            odo.registerDistanceDriven(odoListener)
            watch("odometer") { done, failed ->
                odo.getCurrentDistanceDriven({ x -> onMain { done(); if (x != null && x > 0f) { state.odoKm = x; listener.onVehicleChanged("odo") } } }, { e -> onMain { failed(e) } })
            }
        }
        guard("evBattery") {
            val ev = v.getEvBattery()
            ev.registerEvBatteryStateOfCharge(socListener)
            watch("evBattery") { done, failed ->
                ev.getEvBatteryStateOfCharge({ x -> onMain { done(); if (x != null) { state.evSocPct = x.toFloat(); listener.onVehicleChanged("soc") } } }, { e -> onMain { failed(e) } })
            }
        }
        guard("turnSignal") {
            val ts = v.getTurnSignal()
            ts.registerTurnSignalState(turnListener)
            watch("turnSignal") { done, failed ->
                ts.getCurrentTurnSignalState({ x -> onMain { done(); if (x != null) { state.turnSignal = x.name; listener.onVehicleChanged("turn") } } }, { e -> onMain { failed(e) } })
            }
        }
        guard("steering") {
            val sw = v.getSteeringWheel()
            sw.registerSteeringWheelAngle(steerListener)
            watch("steering") { done, failed ->
                sw.getCurrentSteeringWheelAngle({ x -> onMain { done(); if (x != null) { state.steerDeg = x; listener.onVehicleChanged("steer") } } }, { e -> onMain { failed(e) } })
            }
        }
        guard("seatBelt") {
            val seat = v.getSeat()
            seat.registerSeatBeltBuckledState(driverSeat, beltListener)
            watch("seatBelt") { done, failed ->
                seat.getCurrentSeatBeltBuckledState(driverSeat, { x -> onMain { done(); if (x != null) { state.driverBelt = x; listener.onVehicleChanged("belt") } } }, { e -> onMain { failed(e) } })
            }
        }
        guard("drivingMode") {
            val dm = v.getDrivingMode()
            dm.registerDrivingModeState(modeListener)
            watch("drivingMode") { done, failed ->
                dm.getCurrentDrivingModeState({ x -> onMain { done(); if (x != null) { state.drivingMode = x.name; listener.onVehicleChanged("mode") } } }, { e -> onMain { failed(e) } })
            }
        }
    }

    fun stop() {
        val v = vehicle ?: return
        quiet { v.getDrivingMode().unregisterDrivingModeState(modeListener) }
        // 콜백이 남아 있는 상태에서 release하지 않도록 구독부터 푼다
        quiet { v.getOdometer().unregisterDistanceDriven(odoListener) }
        quiet { v.getEvBattery().unregisterEvBatteryStateOfCharge(socListener) }
        quiet { v.getTurnSignal().unregisterTurnSignalState(turnListener) }
        quiet { v.getSteeringWheel().unregisterSteeringWheelAngle(steerListener) }
        quiet { v.getSeat().unregisterSeatBeltBuckledState(driverSeat, beltListener) }
        quiet { v.release() }
        main.removeCallbacksAndMessages(timeoutToken)
        vehicle = null
        status = SourceState.OFF
        domains.clear()
    }

    // ── 내부 ──

    private val timeoutToken = Any()

    /** 조회 하나에 타임아웃을 건다. 시간 안에 응답이 없으면 그 기능을 "응답 없음(FAILED)"으로 둔다. */
    private fun watch(key: String, call: (done: () -> Unit, failed: (Exception) -> Unit) -> Unit) {
        var finished = false
        val timeout = Runnable {
            if (!finished) {
                finished = true
                if (domains[key] != SourceState.OK) mark(key, SourceState.FAILED)
                Log.w(TAG, "$key: no response in ${TIMEOUT_MS}ms")
            }
        }
        main.postAtTime(timeout, timeoutToken, android.os.SystemClock.uptimeMillis() + TIMEOUT_MS)
        call({
            if (!finished) {
                finished = true
                main.removeCallbacks(timeout, timeoutToken)
                ok(key)
            }
        }, { e ->
            if (!finished) {
                finished = true
                main.removeCallbacks(timeout, timeoutToken)
                fail(key, e)
            }
        })
    }

    private inline fun guard(key: String, block: () -> Unit) {
        try {
            block()
        } catch (e: Throwable) {
            Log.w(TAG, "$key failed", e)
            mark(key, classify(e))
        }
    }

    private inline fun quiet(block: () -> Unit) {
        try { block() } catch (e: Throwable) { Log.w(TAG, "cleanup", e) }
    }

    private fun ok(key: String) = mark(key, SourceState.OK)

    private fun fail(key: String, e: Throwable) {
        Log.w(TAG, "$key: ${e.message}")
        // 이미 값이 오고 있으면 일시 오류로 보고 상태를 바꾸지 않는다
        if (domains[key] != SourceState.OK) mark(key, classify(e))
    }

    /** SDK 예외 클래스가 난독화돼 있어 ErrorCode 대신 예외 종류와 메시지로 나눈다. */
    private fun classify(e: Throwable): SourceState {
        val m = (e.message ?: "").uppercase()
        return when {
            e is SecurityException || "PERMISSION" in m -> SourceState.DENIED
            "NOT_SUPPORTED" in m || "NOT SUPPORTED" in m || "NOT ON THIS CAR" in m -> SourceState.UNSUPPORTED
            else -> SourceState.FAILED
        }
    }

    private fun mark(key: String, s: SourceState) {
        if (domains[key] == s) return
        domains[key] = s
        status = when {
            domains.values.any { it == SourceState.OK } -> SourceState.OK
            domains.values.all { it == SourceState.DENIED } && domains.isNotEmpty() -> SourceState.DENIED
            domains.values.any { it == SourceState.CONNECTING } || domains.isEmpty() -> SourceState.CONNECTING
            else -> SourceState.FAILED
        }
        report()
    }

    private fun report() = listener.onVehicleStatus(status, HashMap(domains))

    private fun onMain(block: () -> Unit) {
        if (Looper.myLooper() == main.looper) block() else main.post(block)
    }

    companion object {
        private const val TAG = "HyVehicle"
        private const val TIMEOUT_MS = 8_000L
    }
}
