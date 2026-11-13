package com.hyundiary.mockup.car

import com.hyundiary.mockup.logic.Gear
import org.json.JSONArray
import org.json.JSONObject

/** 연동 대상 하나(AAOS Car API, Pleos Vehicle SDK, NaviHelper, TTS, FusedLocation)의 연결 상태. */
enum class SourceState(val key: String) {
    CONNECTING("connecting"),   // 연결 중
    OK("ok"),                   // 값을 받고 있음
    DENIED("denied"),           // 권한 없음
    UNSUPPORTED("unsupported"), // 이 차(에뮬레이터)에 없음
    FAILED("failed"),           // 연결 실패
    OFF("off"),                 // 시작 전 또는 해제됨
}

/**
 * 차량에서 받은 최신 값. 메인 스레드에서만 읽고 쓴다.
 * 값을 아직 못 받았거나 차가 지원하지 않으면 null.
 */
class VehicleState {
    // AAOS Car API (CarPropertyManager)
    var fuelMl: Float? = null            // FUEL_LEVEL (ml)
    var fuelCapMl: Float? = null         // INFO_FUEL_CAPACITY (ml)
    var rangeM: Float? = null            // RANGE_REMAINING (m)
    var evCapWh: Float? = null           // INFO_EV_BATTERY_CAPACITY (Wh)
    var speedMs: Float? = null           // PERF_VEHICLE_SPEED (m/s)
    var gear: Gear = Gear.UNKNOWN        // GEAR_SELECTION
    var restricted: Boolean? = null      // CarUxRestrictions.isRequiresDistractionOptimization

    // Pleos Vehicle SDK
    var odoKm: Float? = null             // Odometer DistanceDriven (km)
    var evSocPct: Float? = null          // EvBattery StateOfCharge (%)
    var turnSignal: String? = null       // TurnSignal OFF / LEFT / RIGHT
    var steerDeg: Float? = null          // SteeringWheel angle (도)
    var driverBelt: Boolean? = null      // Seat ROW_1_LEFT belt buckled
    var telltales: List<String> = emptyList() // Safety 켜진 경고등 이름

    // Pleos NaviHelper
    var naviStatus: String? = null       // NavigationStatus
    var speedLimitKmh: Int? = null       // onCurrentRoadSpeedLimit
    var destName: String? = null
    var destRemainM: Int? = null         // 목적지까지 남은 거리(m)
    var destRemainSec: Int? = null
    var address: String? = null          // onCurrentLocationInfo 주소

    // Pleos FusedLocation
    var lat: Double? = null
    var lng: Double? = null

    /** 연비를 모를 때 주행가능거리를 어림하는 값(km/L). 앱 화면의 최근 30일 연비와 같다. */
    var fallbackKmPerL = 12.4

    val fuelCapL: Double? get() = fuelCapMl?.takeIf { it > 0f }?.let { it / 1000.0 }

    val fuelPct: Float?
        get() {
            val f = fuelMl ?: return null
            val c = fuelCapMl ?: return null
            if (c <= 0f || f < 0f) return null
            return (f / c * 100f).coerceIn(0f, 100f)
        }

    val speedKmh: Float? get() = speedMs?.let { it * 3.6f }

    /** RANGE_REMAINING이 0 이하(에뮬레이터 기본값)면 연료량 × 연비로 어림한다. */
    val rangeKm: Double?
        get() {
            val r = rangeM
            if (r != null && r > 0f) return r / 1000.0
            val f = fuelMl ?: return null
            return f / 1000.0 * fallbackKmPerL
        }
    val rangeEstimated: Boolean get() = !(rangeM != null && rangeM!! > 0f) && fuelMl != null

    val routeActive: Boolean get() = naviStatus == "ROUTE_DRIVE" || (destRemainM != null && destRemainM!! > 0)

    val parked: Boolean
        get() = when (gear) {
            Gear.P -> true
            Gear.UNKNOWN -> (speedMs ?: 0f) < 0.3f
            else -> false
        }

    fun toJson(trip: JSONObject?): JSONObject = JSONObject().apply {
        putOpt("fuelPct", fuelPct?.let { round1(it) })
        putOpt("fuelL", fuelMl?.let { round1(it / 1000f) })
        putOpt("capL", fuelCapL?.let { round1(it.toFloat()) })
        putOpt("rangeKm", rangeKm?.let { Math.round(it) })
        put("rangeEst", rangeEstimated)
        putOpt("evSoc", evSocPct?.let { round1(it) })
        putOpt("evCapKwh", evCapWh?.let { round1(it / 1000f) })
        putOpt("speedKmh", speedKmh?.let { round1(it) })
        put("gear", gear.label)
        putOpt("odoKm", odoKm?.takeIf { it > 0f }?.let { round1(it) })
        putOpt("turn", turnSignal)
        putOpt("steerDeg", steerDeg?.let { round1(it) })
        putOpt("belt", driverBelt)
        put("restricted", restricted == true)
        put("telltales", JSONArray(telltales))
        putOpt("speedLimit", speedLimitKmh)
        put("route", JSONObject().apply {
            put("active", routeActive)
            putOpt("status", naviStatus)
            putOpt("dest", destName)
            putOpt("remainKm", destRemainM?.let { round1(it / 1000f) })
            putOpt("remainMin", destRemainSec?.let { Math.round(it / 60f) })
        })
        putOpt("address", address)
        if (lat != null && lng != null) put("loc", JSONObject().put("lat", lat).put("lng", lng))
        putOpt("trip", trip)
    }

    private fun round1(v: Float): Double = Math.round(v * 10.0) / 10.0
}
