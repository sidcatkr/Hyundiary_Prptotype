package com.hyundiary.mockup.car

import android.car.Car
import android.car.VehiclePropertyIds
import android.car.drivingstate.CarUxRestrictions
import android.car.drivingstate.CarUxRestrictionsManager
import android.car.hardware.CarPropertyValue
import android.car.hardware.property.CarPropertyManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.util.Log
import com.hyundiary.mockup.logic.Gear

/**
 * AAOS Car API(android.car)로 읽는 값.
 * Pleos Vehicle SDK에 없거나 에뮬레이터에서 오지 않는 값(연료량, 차속, 기어, 주행 규제)을 여기서 받는다.
 *
 * - FUEL_LEVEL / INFO_FUEL_CAPACITY → 연료 %   (CAR_ENERGY 런타임 권한 / CAR_INFO)
 * - RANGE_REMAINING                 → 주행가능거리 (CAR_ENERGY)
 * - PERF_VEHICLE_SPEED              → 차속      (CAR_SPEED 런타임 권한)
 * - GEAR_SELECTION                  → 기어      (CAR_POWERTRAIN)
 * - INFO_EV_BATTERY_CAPACITY        → 충전량 계산 (CAR_INFO)
 * - CarUxRestrictions               → 주행 규제(주행 중 화면 제한)
 *
 * 에뮬레이터(API 34)에서 돌아야 하므로 API 35의 subscribePropertyEvents 대신 registerCallback을 쓴다.
 */
class CarApiSource(
    private val context: Context,
    private val main: Handler,
    private val state: VehicleState,
    private val listener: Listener,
) {
    interface Listener {
        fun onCarStatus(status: SourceState, props: Map<String, Boolean>)
        fun onCarChanged(what: String)
    }

    private var car: Car? = null
    private var props: CarPropertyManager? = null
    private var ux: CarUxRestrictionsManager? = null
    private val available = linkedMapOf<String, Boolean>()
    private var status = SourceState.OFF

    private val callback = object : CarPropertyManager.CarPropertyEventCallback {
        override fun onChangeEvent(value: CarPropertyValue<*>) {
            if (value.status != CarPropertyValue.STATUS_AVAILABLE) return
            apply(value.propertyId, value.value)
        }

        override fun onErrorEvent(propertyId: Int, areaId: Int) {
            Log.w(TAG, "property error ${VehiclePropertyIds.toString(propertyId)}")
        }
    }

    private val uxListener = CarUxRestrictionsManager.OnUxRestrictionsChangedListener { r -> applyUx(r) }

    fun start() {
        if (car != null) return
        status = SourceState.CONNECTING
        report()
        try {
            // 차량 서비스가 늦게 뜨거나 재시작돼도 다시 붙도록 수명 주기 콜백을 쓴다
            car = Car.createCar(context, main, Car.CAR_WAIT_TIMEOUT_WAIT_FOREVER) { c, ready ->
                if (ready) onReady(c) else onLost()
            }
        } catch (e: Throwable) {
            Log.w(TAG, "Car.createCar failed", e)
            status = SourceState.UNSUPPORTED
            report()
        }
    }

    /** 권한을 새로 받은 뒤 다시 구독한다. */
    fun resubscribe() {
        val c = car ?: return start()
        if (c.isConnected) onReady(c)
    }

    fun stop() {
        try { props?.unregisterCallback(callback) } catch (e: Throwable) { Log.w(TAG, "unregister", e) }
        try { ux?.unregisterListener() } catch (e: Throwable) { Log.w(TAG, "ux unregister", e) }
        try { car?.disconnect() } catch (e: Throwable) { Log.w(TAG, "disconnect", e) }
        props = null
        ux = null
        car = null
        status = SourceState.OFF
    }

    private fun onReady(c: Car) {
        props?.let { try { it.unregisterCallback(callback) } catch (e: Throwable) { } }
        val pm = c.getCarManager(Car.PROPERTY_SERVICE) as? CarPropertyManager
        props = pm
        available.clear()
        var denied = false
        if (pm != null) {
            // 고정 값은 한 번 읽는다
            readOnce(pm, "fuelCap", VehiclePropertyIds.INFO_FUEL_CAPACITY)?.let { if (it is Float) state.fuelCapMl = it }
            readOnce(pm, "evCap", VehiclePropertyIds.INFO_EV_BATTERY_CAPACITY)?.let { if (it is Float) state.evCapWh = it }
            // 바뀌는 값은 구독한다. 연속 값은 1초(차속은 5 Hz: 급감속 판단용), 기어는 바뀔 때만
            denied = denied or !subscribe(pm, "fuel", VehiclePropertyIds.FUEL_LEVEL, CarPropertyManager.SENSOR_RATE_NORMAL, Car.PERMISSION_ENERGY)
            denied = denied or !subscribe(pm, "range", VehiclePropertyIds.RANGE_REMAINING, CarPropertyManager.SENSOR_RATE_NORMAL, Car.PERMISSION_ENERGY)
            denied = denied or !subscribe(pm, "speed", VehiclePropertyIds.PERF_VEHICLE_SPEED, CarPropertyManager.SENSOR_RATE_UI, Car.PERMISSION_SPEED)
            denied = denied or !subscribe(pm, "gear", VehiclePropertyIds.GEAR_SELECTION, CarPropertyManager.SENSOR_RATE_ONCHANGE, Car.PERMISSION_POWERTRAIN)
        }
        try {
            val um = c.getCarManager(Car.CAR_UX_RESTRICTION_SERVICE) as? CarUxRestrictionsManager
            ux = um
            if (um != null) {
                um.registerListener(uxListener)
                um.currentCarUxRestrictions?.let { applyUx(it) }
                available["restriction"] = true
            }
        } catch (e: Throwable) {
            Log.w(TAG, "ux restrictions", e)
            available["restriction"] = false
        }
        status = when {
            available.values.any { it } -> SourceState.OK
            denied -> SourceState.DENIED
            else -> SourceState.UNSUPPORTED
        }
        report()
        listener.onCarChanged("all")
    }

    private fun onLost() {
        props = null
        ux = null
        status = SourceState.CONNECTING
        report()
    }

    /** 구독에 성공하면 true, 권한 문제로 실패하면 false(지원하지 않으면 true로 두고 available=false). */
    private fun subscribe(pm: CarPropertyManager, key: String, prop: Int, rate: Float, permission: String): Boolean {
        // 권한이 없으면 config 자체가 안 보이므로(지원 안 함과 구분이 안 됨) 먼저 확인한다
        if (context.checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) {
            available[key] = false
            return false
        }
        return try {
            if (pm.getCarPropertyConfig(prop) == null) {
                available[key] = false
                return true
            }
            val ok = pm.registerCallback(callback, prop, rate)
            available[key] = ok
            true
        } catch (e: SecurityException) {
            Log.w(TAG, "no permission for $key")
            available[key] = false
            false
        } catch (e: Throwable) {
            Log.w(TAG, "subscribe $key", e)
            available[key] = false
            true
        }
    }

    private fun readOnce(pm: CarPropertyManager, key: String, prop: Int): Any? = try {
        if (pm.getCarPropertyConfig(prop) == null) null
        else pm.getProperty<Any>(prop, 0)?.takeIf { it.status == CarPropertyValue.STATUS_AVAILABLE }?.value
    } catch (e: Throwable) {
        Log.w(TAG, "read $key", e)
        null
    }

    private fun apply(prop: Int, value: Any?) {
        when (prop) {
            VehiclePropertyIds.FUEL_LEVEL -> (value as? Float)?.let { state.fuelMl = it; listener.onCarChanged("fuel") }
            VehiclePropertyIds.RANGE_REMAINING -> (value as? Float)?.let { state.rangeM = it; listener.onCarChanged("range") }
            VehiclePropertyIds.PERF_VEHICLE_SPEED -> (value as? Float)?.let { state.speedMs = kotlin.math.abs(it); listener.onCarChanged("speed") }
            VehiclePropertyIds.GEAR_SELECTION -> (value as? Int)?.let { state.gear = Gear.fromVehicleGear(it); listener.onCarChanged("gear") }
        }
    }

    private fun applyUx(r: CarUxRestrictions) {
        val on = r.isRequiresDistractionOptimization
        if (state.restricted != on) {
            state.restricted = on
            listener.onCarChanged("restricted")
        }
    }

    private fun report() = listener.onCarStatus(status, HashMap(available))

    companion object {
        private const val TAG = "HyCarApi"
    }
}
