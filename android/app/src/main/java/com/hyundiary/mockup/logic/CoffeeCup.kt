package com.hyundiary.mockup.logic

import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.tan

/**
 * 승차감 판정 로직(커피잔 모델): 운전석 옆에 가득 찬 커피잔이 있다고 보고, 차량 움직임으로 흔들림을 판정해
 * 승차감 점수(100에서 시작)를 깎는다. 커피잔은 계산 모델일 뿐이고 화면에는 점수와 횟수만 보낸다.
 *
 * 앱이 쓸 수 있는 차량 신호로 가속도를 추정한다(가속도 센서·차선 인식은 Pleos 앱 API로 보장되지 않는다).
 * - 앞뒤: 차속 변화율(Δv/Δt). Pleos Brake는 밟았는지 여부(Boolean)만 줘서 세기 계산에 쓰지 않는다.
 * - 좌우: 차속과 조향각으로 구한 횡가속도 v² × tan(조향각 ÷ 조향비) ÷ 축거.
 * - 흔들림 = 앞뒤·좌우를 합친 크기(g). [wobbleG]를 넘으면 흔들리기 시작하고,
 *   [calmG] 아래로 [calmMs] 동안 내려오면 한 번이 끝난다.
 *   그 사이 [spillG]를 넘으면 큰 흔들림(SPILL, −[spillLoss]점), 넘지 않았으면 흔들림(WOBBLE, −[wobbleLoss]점).
 * - 깜빡이 없이 차로 변경([SafetyMonitor] 판단)은 −[laneLoss]점.
 * - [ecoMinKmh] 이상에서 흔들림 [ecoMaxG] 아래를 [ecoHoldMs] 동안 이어 가면 정속 보너스 +[ecoBonus]점.
 *   주행 모드(DrivingMode)를 알려 주는 차는 에코 모드일 때만 센다. 모르는 차(null)는 정속만 본다.
 *
 * 시간(t)은 ms 단위 단조 증가 값을 쓴다. 한 스레드에서만 호출한다.
 */
class CoffeeCup(
    private val wheelbaseM: Double = 2.9,
    private val steerRatio: Double = 15.0,
    private val wobbleG: Double = 0.25,
    private val spillG: Double = 0.40,
    private val calmG: Double = 0.15,
    private val calmMs: Long = 500L,
    private val accelWindowMs: Long = 800L,
    private val maxGapMs: Long = 2_000L,
    val wobbleLoss: Int = 2,
    val spillLoss: Int = 10,
    val laneLoss: Int = 5,
    private val ecoMinKmh: Float = 30f,
    private val ecoMaxG: Double = 0.05,
    private val ecoHoldMs: Long = 60_000L,
    val ecoBonus: Int = 1,
) {
    enum class Kind(val key: String) { WOBBLE("wobble"), SPILL("spill"), LANE("lane"), ECO("eco") }

    /** 판정 1건. delta는 점수 변화(감점은 음수, 보너스는 [Kind.ECO]의 점수). level은 판정 뒤 점수. */
    data class Event(val kind: Kind, val t: Long, val delta: Int, val level: Int, val g: Double)

    /** 한 주행(출발 ~ P) 결과. level = 승차감 점수, lost = 실제로 깎인 점수. */
    data class Stage(
        val startedAt: Long,
        val endedAt: Long,
        val level: Int,
        val bonus: Int,
        val lost: Int,
        val counts: Map<Kind, Int>,
    )

    var running = false
        private set
    var level = 100
        private set
    var bonus = 0
        private set

    /** 지금 흔들림 크기(g). */
    var g = 0.0
        private set

    val counts = mutableMapOf<Kind, Int>()

    private var startedAt = 0L
    private val speeds = ArrayDeque<Pair<Long, Double>>() // (t, m/s)
    private var kmh = 0f
    private var lastSpeedT = -1L
    private var aLong = 0.0 // m/s²
    private var steerDeg = 0f
    private var eco: Boolean? = null // null = 주행 모드를 모름
    private var ecoSince = -1L
    private var inEpisode = false
    private var peak = 0.0
    private var spilled = false
    private var calmSince = -1L

    fun start(t: Long) {
        running = true
        startedAt = t
        level = 100
        bonus = 0
        counts.clear()
        resetEpisode()
        ecoSince = -1L
        // 이전 구간의 차속 기록이 가속도에 섞이지 않게 새로 잡는다
        speeds.clear()
        lastSpeedT = -1L
        aLong = 0.0
        g = 0.0
    }

    fun stop(t: Long): Stage? {
        if (!running) return null
        running = false
        resetEpisode()
        return Stage(startedAt, t, level, bonus, 100 - level, HashMap(counts))
    }

    fun onSpeed(t: Long, valueKmh: Float): List<Event> {
        val v = if (valueKmh.isNaN() || valueKmh < 0f) 0f else valueKmh
        kmh = v
        val ms = v / 3.6
        if (lastSpeedT >= 0 && t - lastSpeedT > maxGapMs) { // 값이 끊겼다 오면 기준을 새로 잡는다
            speeds.clear()
            aLong = 0.0
        }
        lastSpeedT = t
        speeds.addLast(t to ms)
        // 기준점은 [accelWindowMs]보다 오래된 값 중 가장 최근 것
        while (speeds.size >= 2 && speeds[1].first <= t - accelWindowMs) speeds.removeFirst()
        val ref = speeds.first()
        val dt = (t - ref.first) / 1000.0
        aLong = if (dt >= 0.2) (ms - ref.second) / dt else aLong
        return evaluate(t)
    }

    fun onSteering(t: Long, deg: Float): List<Event> {
        steerDeg = if (deg.isNaN()) 0f else deg
        return evaluate(t)
    }

    /** 주행 모드가 에코인지. 이 차가 주행 모드를 알려 주지 않으면 null. */
    fun onEcoMode(t: Long, on: Boolean?) {
        if (eco != on) ecoSince = -1L
        eco = on
    }

    /** 깜빡이 없이 차로 변경 1건. */
    fun onLaneChange(t: Long): Event? = if (running) lose(Kind.LANE, laneLoss, t) else null

    /** 차속이 한동안 오지 않을 때(값이 그대로일 때) 흔들림이 끝났는지 본다. 1초마다 부른다. */
    fun onTick(t: Long): List<Event> {
        if (lastSpeedT >= 0 && t - lastSpeedT >= accelWindowMs) aLong = 0.0
        return evaluate(t)
    }

    // ── 내부 ──

    private fun currentG(): Double {
        val gLong = abs(aLong) / G
        val ms = kmh / 3.6
        val wheelRad = Math.toRadians(abs(steerDeg) / steerRatio)
        val gLat = ms * ms * tan(wheelRad) / wheelbaseM / G
        return hypot(gLong, gLat)
    }

    private fun evaluate(t: Long): List<Event> {
        g = currentG()
        if (!running) return emptyList()
        val out = ArrayList<Event>(2)
        if (!inEpisode && g >= wobbleG) {
            inEpisode = true
            peak = g
            spilled = false
            calmSince = -1L
        }
        if (inEpisode) {
            peak = max(peak, g)
            if (!spilled && g >= spillG) {
                spilled = true
                lose(Kind.SPILL, spillLoss, t)?.let { out += it }
            }
            if (g < calmG) {
                if (calmSince < 0) calmSince = t
                if (t - calmSince >= calmMs) {
                    if (!spilled) lose(Kind.WOBBLE, wobbleLoss, t, peak)?.let { out += it }
                    resetEpisode()
                }
            } else {
                calmSince = -1L
            }
        }
        // 정속 보너스
        if (eco != false && kmh >= ecoMinKmh && g < ecoMaxG && !inEpisode) {
            if (ecoSince < 0) ecoSince = t
            else if (t - ecoSince >= ecoHoldMs) {
                ecoSince = t
                bonus += ecoBonus
                counts[Kind.ECO] = (counts[Kind.ECO] ?: 0) + 1
                out += Event(Kind.ECO, t, ecoBonus, level, g)
            }
        } else {
            ecoSince = -1L
        }
        return out
    }

    private fun lose(kind: Kind, amount: Int, t: Long, gAt: Double = g): Event? {
        if (!running) return null
        val d = minOf(amount, level)
        level -= d
        counts[kind] = (counts[kind] ?: 0) + 1
        return Event(kind, t, -d, level, gAt)
    }

    private fun resetEpisode() {
        inEpisode = false
        peak = 0.0
        spilled = false
        calmSince = -1L
    }

    companion object {
        const val G = 9.80665

        /**
         * 기간 점수(월 단위 등): 감점(보너스 뺌)을 100 km 주행당으로 환산해 100에서 뺀다. 주행거리가 달라도 같은 기준으로 보기 위함.
         * [minKm]보다 짧으면 의미가 없어 null.
         */
        fun scorePer100Km(lost: Int, bonus: Int, km: Double, minKm: Double = 20.0): Double? {
            if (km.isNaN() || km < minKm) return null
            val per100 = (lost - bonus).coerceAtLeast(0) * 100.0 / km
            return (100.0 - per100).coerceIn(0.0, 100.0)
        }
    }
}
