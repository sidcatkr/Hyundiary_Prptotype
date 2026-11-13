package com.hyundiary.mockup.logic

/**
 * 주행 시작과 종료를 판단하고 거리·시간을 모은다.
 *
 * - 시작: 기어가 P가 아닌 곳으로 가거나(기어 값이 있을 때), 속도가 [moveKmh]를 넘을 때.
 * - 종료: 기어가 P로 돌아올 때. 기어 값이 없으면 [stopHoldMs] 동안 멈춰 있을 때.
 * - 거리: 누적 주행거리(오도미터)가 늘면 그 차이를, 늘지 않으면(에뮬레이터는 0으로 고정) 속도를 시간에 대해 적분한다.
 */
class TripTracker(
    private val moveKmh: Float = 3f,
    private val stopHoldMs: Long = 180_000L,
    private val maxGapMs: Long = 5_000L,
) {
    data class Trip(
        val startedAt: Long,
        val endedAt: Long,
        val km: Double,
        val sec: Long,
        val maxKmh: Float,
    )

    sealed class Event {
        data class Started(val t: Long) : Event()
        data class Ended(val trip: Trip) : Event()
    }

    var active = false
        private set
    private var startedAt = 0L
    private var lastT = -1L
    private var lastKmh = 0f
    private var integratedKm = 0.0
    private var odoStart: Double? = null
    private var odoLast: Double? = null
    private var maxKmh = 0f
    private var stoppedSince = 0L
    private var gear = Gear.UNKNOWN

    fun onGear(t: Long, g: Gear): Event? {
        gear = g
        if (g == Gear.UNKNOWN) return null
        if (!active && g != Gear.P) return start(t)
        if (active && g == Gear.P) return end(t)
        return null
    }

    fun onOdometer(km: Double) {
        if (km.isNaN() || km <= 0.0) return
        if (active && odoStart == null) odoStart = km
        odoLast = km
    }

    /** 속도(km/h). 1초에 한 번 이상 들어온다고 가정한다. */
    fun onSpeed(t: Long, kmh: Float): Event? {
        val v = if (kmh.isNaN() || kmh < 0f) 0f else kmh
        var ev: Event? = null
        if (!active && v > moveKmh && gear != Gear.P) ev = start(t)
        if (active) {
            val dt = t - lastT
            if (lastT >= 0L && dt in 1..maxGapMs) {
                // 사다리꼴 적분. 간격이 너무 길면(앱이 멈춰 있던 동안) 건너뛴다
                integratedKm += ((lastKmh + v) / 2.0) * (dt / 3_600_000.0)
            }
            if (v > maxKmh) maxKmh = v
            if (v < 1f) {
                if (stoppedSince == 0L) stoppedSince = t
                if (gear == Gear.UNKNOWN && t - stoppedSince >= stopHoldMs) ev = end(t)
            } else {
                stoppedSince = 0L
            }
        }
        lastT = t
        lastKmh = v
        return ev
    }

    /** 지금까지의 주행. 주행 중이 아니면 null. */
    fun current(t: Long): Trip? = if (!active) null else Trip(startedAt, t, distanceKm(), (t - startedAt) / 1000, maxKmh)

    private fun distanceKm(): Double {
        val s = odoStart
        val l = odoLast
        val odoKm = if (s != null && l != null) l - s else 0.0
        // 오도미터가 실제로 움직였으면 그 값을 믿는다
        return if (odoKm > 0.05) odoKm else integratedKm
    }

    private fun start(t: Long): Event {
        active = true
        startedAt = t
        integratedKm = 0.0
        odoStart = odoLast
        maxKmh = 0f
        stoppedSince = 0L
        return Event.Started(t)
    }

    private fun end(t: Long): Event {
        val trip = Trip(startedAt, t, distanceKm(), (t - startedAt) / 1000, maxKmh)
        active = false
        stoppedSince = 0L
        return Event.Ended(trip)
    }
}
