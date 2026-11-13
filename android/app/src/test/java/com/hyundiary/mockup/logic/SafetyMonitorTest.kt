package com.hyundiary.mockup.logic

import com.hyundiary.mockup.logic.SafetyMonitor.Kind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SafetyMonitorTest {
    private fun kinds(list: List<SafetyMonitor.Record>) = list.map { it.kind }

    @Test
    fun hardDecelOnce() {
        val m = SafetyMonitor()
        assertTrue(m.onSpeed(0L, 62f).isEmpty())
        assertTrue(m.onSpeed(1_000L, 50f).isEmpty())
        assertEquals(listOf(Kind.HARD_DECEL), kinds(m.onSpeed(1_800L, 18f)))
        // 쿨다운 동안 다시 세지 않는다
        assertTrue(m.onSpeed(2_200L, 0f).isEmpty())
        assertEquals(1, m.counts[Kind.HARD_DECEL])
    }

    @Test
    fun slowBrakingIsNotHardDecel() {
        val m = SafetyMonitor()
        var v = 60f
        var t = 0L
        while (v > 0f) {
            assertTrue(m.onSpeed(t, v).isEmpty())
            v -= 5f // 1초에 5 km/h
            t += 1_000L
        }
    }

    @Test
    fun speedingNeedsLimitAndHold() {
        val m = SafetyMonitor()
        assertTrue(m.onSpeed(0L, 90f).isEmpty()) // 제한속도 모름
        m.onSpeedLimit(60)
        assertTrue(m.onSpeed(1_000L, 75f).isEmpty())
        assertTrue(m.onSpeed(3_000L, 75f).isEmpty())
        assertEquals(listOf(Kind.SPEEDING), kinds(m.onSpeed(4_100L, 76f)))
        assertTrue(m.onSpeed(6_000L, 76f).isEmpty())
        // 제한속도 근처로 내려왔다가 다시 넘으면 새로 센다
        m.onSpeed(7_000L, 60f)
        m.onSpeed(8_000L, 75f)
        assertEquals(listOf(Kind.SPEEDING), kinds(m.onSpeed(11_100L, 75f)))
        assertEquals(2, m.counts[Kind.SPEEDING])
    }

    @Test
    fun laneChangeWithoutSignal() {
        val m = SafetyMonitor()
        m.onSpeed(0L, 70f)
        assertNull(m.onSteering(1_000L, 8f))
        assertNull(m.onSteering(1_800L, -4f))
        assertEquals(Kind.LANE_NO_SIGNAL, m.onSteering(2_500L, 1f)?.kind)
    }

    @Test
    fun laneChangeWithSignalIsFine() {
        val m = SafetyMonitor()
        m.onSpeed(0L, 70f)
        m.onTurnSignal(500L, true)
        m.onSteering(1_000L, 8f)
        m.onTurnSignal(2_000L, false)
        assertNull(m.onSteering(2_500L, 1f))
        // 깜빡이를 끈 직후의 핸들 조작도 깜빡이를 켠 것으로 본다
        m.onSteering(3_000L, 8f)
        assertNull(m.onSteering(4_000L, 0f))
    }

    @Test
    fun curveIsNotLaneChange() {
        val m = SafetyMonitor()
        m.onSpeed(0L, 70f)
        m.onSteering(1_000L, 10f)
        m.onSteering(4_000L, 12f)
        m.onSteering(7_000L, 10f) // 5초 넘게 돌림
        assertNull(m.onSteering(8_000L, 0f))
    }

    @Test
    fun slowTurnIsIgnored() {
        val m = SafetyMonitor()
        m.onSpeed(0L, 20f)
        m.onSteering(1_000L, 30f)
        assertNull(m.onSteering(2_000L, 0f))
    }

    @Test
    fun beltOffWhileDrivingOncePerEpisode() {
        val m = SafetyMonitor()
        assertNull(m.onBelt(0L, false)) // 정차 중에 풂
        assertTrue(m.onSpeed(60_000L, 30f).isEmpty())
        assertTrue(m.onSpeed(62_000L, 30f).isEmpty())
        assertEquals(listOf(Kind.BELT_OFF), kinds(m.onSpeed(65_100L, 30f)))
        assertTrue(m.onSpeed(70_000L, 30f).isEmpty())
        m.onBelt(71_000L, true)
        m.onBelt(72_000L, false)
        m.onSpeed(73_000L, 30f)
        assertEquals(listOf(Kind.BELT_OFF), kinds(m.onSpeed(78_100L, 30f)))
        assertEquals(2, m.counts[Kind.BELT_OFF])
    }
}
