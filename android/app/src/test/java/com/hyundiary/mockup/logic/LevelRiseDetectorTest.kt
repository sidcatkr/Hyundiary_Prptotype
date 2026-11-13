package com.hyundiary.mockup.logic

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class LevelRiseDetectorTest {
    @Test
    fun jumpWhileParkedIsReportedAfterSettle() {
        val d = LevelRiseDetector(minRisePct = 5f, settleMs = 10_000L)
        assertNull(d.onLevel(0L, 18f, parked = true))
        assertNull(d.onLevel(1_000L, 74f, parked = true))
        assertNull(d.onTick(5_000L))
        val r = d.onTick(11_000L)
        assertNotNull(r)
        assertEquals(18f, r!!.fromPct, 0.01f)
        assertEquals(74f, r.toPct, 0.01f)
        // 같은 주유를 다시 내지 않는다
        assertNull(d.onTick(30_000L))
    }

    @Test
    fun gradualRiseIsOneRefuel() {
        val d = LevelRiseDetector(minRisePct = 5f, settleMs = 10_000L)
        d.onLevel(0L, 20f, parked = true)
        var t = 1_000L
        var pct = 20f
        while (pct < 70f) {
            pct += 1f
            assertNull(d.onLevel(t, pct, parked = true))
            assertNull(d.onTick(t))
            t += 1_000L
        }
        val r = d.onTick(t + 10_000L)
        assertNotNull(r)
        assertEquals(50f, r!!.deltaPct, 0.01f)
    }

    @Test
    fun smallNoiseIsIgnored() {
        val d = LevelRiseDetector(minRisePct = 5f, settleMs = 1_000L)
        d.onLevel(0L, 40f, parked = true)
        d.onLevel(1_000L, 42f, parked = true)
        d.onLevel(2_000L, 39f, parked = true)
        assertNull(d.onTick(20_000L))
    }

    @Test
    fun drivingAwayConfirmsRefuelImmediately() {
        val d = LevelRiseDetector(minRisePct = 5f, settleMs = 60_000L)
        d.onLevel(0L, 18f, parked = true)
        d.onLevel(1_000L, 60f, parked = true)
        val r = d.onDriveStart(2_000L)
        assertNotNull(r)
        assertEquals(42f, r!!.deltaPct, 0.01f)
    }

    @Test
    fun fuelBurnWhileDrivingIsNotRefuel() {
        val d = LevelRiseDetector()
        assertNull(d.onLevel(0L, 50f, parked = false))
        assertNull(d.onLevel(1_000L, 49f, parked = false))
        // 정차 후 기준을 새로 잡는다
        assertNull(d.onLevel(2_000L, 49f, parked = true))
        assertNull(d.onTick(100_000L))
    }

    @Test
    fun invalidValuesAreIgnored() {
        val d = LevelRiseDetector(minRisePct = 5f, settleMs = 1_000L)
        d.onLevel(0L, 20f, parked = true)
        assertNull(d.onLevel(1_000L, Float.NaN, parked = true))
        assertNull(d.onLevel(2_000L, 250f, parked = true))
        assertNull(d.onTick(10_000L))
    }
}
