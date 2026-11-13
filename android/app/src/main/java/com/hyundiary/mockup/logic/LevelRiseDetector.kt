package com.hyundiary.mockup.logic

/**
 * 정차 중 연료량(또는 배터리 잔량)이 늘어난 것을 주유(충전)로 판단한다.
 *
 * - 정차가 시작될 때의 값을 기준으로 잡고, 기준보다 [minRisePct] 이상 오르면 주유가 진행 중인 것으로 본다.
 * - 값이 [settleMs] 동안 더 오르지 않거나 다시 주행을 시작하면 주유가 끝난 것으로 보고 [Rise]를 한 번 낸다.
 * - 센서 값이 조금씩 출렁이는 것은 [minRisePct] 아래라 무시한다.
 *
 * 차량 콜백 스레드와 무관하게 한 스레드(메인)에서만 호출한다고 가정한다.
 */
class LevelRiseDetector(
    private val minRisePct: Float = 5f,
    private val settleMs: Long = 10_000L,
) {
    /** 한 번의 주유(충전). 값은 퍼센트(0~100). */
    data class Rise(val fromPct: Float, val toPct: Float, val startedAt: Long, val endedAt: Long) {
        val deltaPct: Float get() = toPct - fromPct
    }

    private var base: Float? = null   // 정차 시작 후 가장 낮은 값
    private var peak: Float? = null   // 정차 중 가장 높은 값
    private var peakAt = 0L
    private var risingSince = 0L      // 기준보다 처음 오른 시각
    private var lastParked = false

    /** 지금 주유가 진행 중인지(기준보다 충분히 올랐고 아직 확정 전). */
    val inProgress: Boolean
        get() {
            val b = base ?: return false
            val p = peak ?: return false
            return p - b >= minRisePct
        }

    /**
     * 새 측정값을 넣는다. [parked]는 기어 P(또는 속도 0으로 오래 멈춤) 여부.
     * 주행이 시작되는 순간 진행 중이던 주유가 있으면 확정해서 돌려준다.
     */
    fun onLevel(t: Long, pct: Float, parked: Boolean): Rise? {
        if (pct.isNaN() || pct < 0f || pct > 100.5f) return null
        if (!parked) {
            val done = if (lastParked) finish(t) else null
            lastParked = false
            base = null
            peak = null
            return done
        }
        if (!lastParked || base == null) {
            lastParked = true
            base = pct
            peak = pct
            peakAt = t
            risingSince = 0L
            return null
        }
        val b = base!!
        val p = peak!!
        if (pct < b && p - b < minRisePct) {
            // 아직 주유 전이면 기준을 낮춘다(정차 직후 값이 늦게 내려오는 경우)
            base = pct
            peak = pct
            peakAt = t
            return null
        }
        if (pct > p) {
            if (risingSince == 0L) risingSince = t
            peak = pct
            peakAt = t
        }
        return null
    }

    /** 일정 시간 값이 더 오르지 않았는지 확인한다. 1초마다 부른다. */
    fun onTick(t: Long): Rise? {
        if (!lastParked || !inProgress) return null
        if (t - peakAt < settleMs) return null
        return finish(t)
    }

    /** 주행 시작 등으로 정차가 끝났음을 알린다(연료 값 없이). */
    fun onDriveStart(t: Long): Rise? {
        if (!lastParked) return null
        val done = finish(t)
        lastParked = false
        base = null
        peak = null
        return done
    }

    private fun finish(t: Long): Rise? {
        val b = base ?: return null
        val p = peak ?: return null
        if (p - b < minRisePct) return null
        val rise = Rise(b, p, if (risingSince != 0L) risingSince else peakAt, t)
        // 같은 주유를 두 번 내지 않도록 기준을 현재 값으로 옮긴다
        base = p
        peak = p
        peakAt = t
        risingSince = 0L
        return rise
    }
}
