package com.hyundiary.mockup.logic

/**
 * 주행 중 안전 운전 기록을 판단한다. 기준은 앱 화면의 "기록 기준"과 같다.
 *
 * - 급감속: [decelWindowMs](2초) 안에 [decelKmh](30 km/h) 넘게 줄임
 * - 제한속도 초과: 내비 제한속도 + [overLimitKmh](10 km/h)를 [overHoldMs] 넘게 유지
 * - 깜빡이 없이 차로 변경: [laneMinKmh] 이상에서 핸들을 [laneSteerDeg] 넘게 잠깐 돌렸다 되돌렸는데
 *   그 앞뒤로 방향지시등이 켜지지 않음(핸들 움직임으로 추정)
 * - 안전벨트 미착용 주행: 운전석 벨트를 풀고 [beltMinKmh] 이상으로 [beltHoldMs] 넘게 주행
 *
 * 같은 상황이 이어지는 동안에는 한 번만 기록한다. 한 스레드에서만 호출한다.
 */
class SafetyMonitor(
    private val decelKmh: Float = 30f,
    private val decelWindowMs: Long = 2_000L,
    private val decelCooldownMs: Long = 5_000L,
    private val overLimitKmh: Float = 10f,
    private val overHoldMs: Long = 3_000L,
    private val laneMinKmh: Float = 40f,
    private val laneSteerDeg: Float = 6f,
    private val laneCenterDeg: Float = 2f,
    private val laneMinMs: Long = 800L,
    private val laneMaxMs: Long = 5_000L,
    private val signalGraceMs: Long = 3_000L,
    private val beltMinKmh: Float = 10f,
    private val beltHoldMs: Long = 5_000L,
) {
    enum class Kind(val key: String) {
        HARD_DECEL("decel"), SPEEDING("speeding"), LANE_NO_SIGNAL("lane"), BELT_OFF("belt")
    }

    data class Record(val kind: Kind, val t: Long, val kmh: Float)

    private val speeds = ArrayDeque<Pair<Long, Float>>()
    private var kmh = 0f
    private var lastDecelAt = -1L
    private var limit: Int? = null
    private var overSince = 0L
    private var overCounted = false
    private var signalOn = false
    private var signalOffAt = -1L
    private var steerStart = 0L
    private var steerPeak = 0f
    private var steerWithSignal = false
    private var beltBuckled: Boolean? = null
    private var beltRunSince = 0L
    private var beltCounted = false

    val counts = mutableMapOf<Kind, Int>()

    fun reset() {
        speeds.clear()
        counts.clear()
        overSince = 0L; overCounted = false
        steerStart = 0L; steerPeak = 0f
        beltRunSince = 0L; beltCounted = false
        lastDecelAt = -1L
    }

    fun onSpeedLimit(kmhLimit: Int?) {
        limit = kmhLimit?.takeIf { it in 1..200 }
    }

    fun onTurnSignal(t: Long, on: Boolean) {
        if (signalOn && !on) signalOffAt = t
        signalOn = on
        if (on) steerWithSignal = true
    }

    fun onBelt(t: Long, buckled: Boolean): Record? {
        beltBuckled = buckled
        if (buckled) beltCounted = false
        return checkBelt(t)
    }

    fun onSpeed(t: Long, value: Float): List<Record> {
        val v = if (value.isNaN() || value < 0f) 0f else value
        kmh = v
        val out = ArrayList<Record>(2)
        // 급감속
        speeds.addLast(t to v)
        while (speeds.isNotEmpty() && t - speeds.first().first > decelWindowMs) speeds.removeFirst()
        val maxInWindow = speeds.maxOf { it.second }
        if (maxInWindow - v > decelKmh && (lastDecelAt < 0 || t - lastDecelAt >= decelCooldownMs)) {
            lastDecelAt = t
            out += count(Record(Kind.HARD_DECEL, t, maxInWindow))
            speeds.clear()
            speeds.addLast(t to v)
        }
        // 제한속도 초과(히스테리시스: 제한속도 + 5 km/h 아래로 내려오면 다시 셀 수 있다)
        val lim = limit
        if (lim != null && v > lim + overLimitKmh) {
            if (overSince == 0L) overSince = t
            if (!overCounted && t - overSince >= overHoldMs) {
                overCounted = true
                out += count(Record(Kind.SPEEDING, t, v))
            }
        } else if (lim == null || v <= lim + overLimitKmh / 2) {
            overSince = 0L
            overCounted = false
        }
        checkBelt(t)?.let { out += it }
        return out
    }

    /** 핸들 각도(도). 왼쪽·오른쪽 부호는 상관없다. */
    fun onSteering(t: Long, deg: Float): Record? {
        if (deg.isNaN()) return null
        val a = kotlin.math.abs(deg)
        if (steerStart == 0L) {
            if (a >= laneSteerDeg && kmh >= laneMinKmh) {
                steerStart = t
                steerPeak = a
                // 직전에 방향지시등을 켰다 끈 경우도 깜빡이를 켠 것으로 본다
                steerWithSignal = signalOn || (signalOffAt >= 0 && t - signalOffAt <= signalGraceMs)
            }
            return null
        }
        if (a > steerPeak) steerPeak = a
        if (signalOn) steerWithSignal = true
        if (a <= laneCenterDeg) {
            val dur = t - steerStart
            val noSignal = !steerWithSignal
            steerStart = 0L
            steerPeak = 0f
            if (dur in laneMinMs..laneMaxMs && noSignal && kmh >= laneMinKmh) {
                return count(Record(Kind.LANE_NO_SIGNAL, t, kmh))
            }
        } else if (t - steerStart > laneMaxMs) {
            // 길게 돌린 핸들은 곡선 도로·회전으로 보고 버린다
            steerStart = 0L
            steerPeak = 0f
        }
        return null
    }

    /** 벨트를 푼 채 [beltMinKmh] 이상으로 달린 시간이 [beltHoldMs]를 넘으면 한 번 기록한다. */
    private fun checkBelt(t: Long): Record? {
        if (beltBuckled != false || kmh < beltMinKmh) {
            beltRunSince = 0L
            return null
        }
        if (beltCounted) return null
        if (beltRunSince == 0L) beltRunSince = t
        if (t - beltRunSince < beltHoldMs) return null
        beltCounted = true
        return count(Record(Kind.BELT_OFF, t, kmh))
    }

    private fun count(r: Record): Record {
        counts[r.kind] = (counts[r.kind] ?: 0) + 1
        return r
    }
}
