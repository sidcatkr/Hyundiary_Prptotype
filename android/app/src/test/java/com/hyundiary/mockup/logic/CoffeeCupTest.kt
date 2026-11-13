package com.hyundiary.mockup.logic

import com.hyundiary.mockup.logic.CoffeeCup.Kind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CoffeeCupTest {
    /** 200 ms 간격(차속 UI 주기)으로 차속을 넣고 생긴 판정을 모은다. */
    private fun drive(cup: CoffeeCup, from: Long, kmh: List<Float>, stepMs: Long = 200L): List<CoffeeCup.Event> {
        val out = ArrayList<CoffeeCup.Event>()
        kmh.forEachIndexed { i, v -> out += cup.onSpeed(from + i * stepMs, v) }
        return out
    }

    private fun steady(v: Float, n: Int) = List(n) { v }

    @Test
    fun steadyDrivingKeepsTheCupFull() {
        val cup = CoffeeCup().apply { start(0) }
        val ev = drive(cup, 0, steady(50f, 50))
        assertTrue(ev.isEmpty())
        assertEquals(100, cup.level)
    }

    @Test
    fun hardBrakingSpillsOnce() {
        val cup = CoffeeCup().apply { start(0) }
        drive(cup, 0, steady(50f, 10))
        // 50 → 10 km/h를 1초에(약 1.1 g)
        val ev = drive(cup, 2_000, listOf(42f, 34f, 26f, 18f, 10f) + steady(10f, 10))
        assertEquals(listOf(Kind.SPILL), ev.map { it.kind })
        assertEquals(90, cup.level)
        assertEquals(-10, ev[0].delta)
    }

    @Test
    fun moderateBrakingIsAWobbleAfterItCalms() {
        val cup = CoffeeCup().apply { start(0) }
        drive(cup, 0, steady(40f, 10))
        // 약 0.3 g: 0.2초마다 2.1 km/h씩 1.6초 줄인 뒤 일정
        val dec = (1..8).map { 40f - it * 2.1f }
        val ev = drive(cup, 2_000, dec + steady(40f - 8 * 2.1f, 10))
        assertEquals(listOf(Kind.WOBBLE), ev.map { it.kind })
        assertEquals(98, cup.level)
        assertTrue(ev[0].g in 0.25..0.40)
    }

    @Test
    fun sharpSteeringAtSpeedSpillsButGentleCurveDoesNot() {
        val fast = CoffeeCup().apply { start(0) }
        drive(fast, 0, steady(60f, 5))
        assertEquals(listOf(Kind.SPILL), fast.onSteering(1_200, 60f).map { it.kind })

        val slow = CoffeeCup().apply { start(0) }
        drive(slow, 0, steady(30f, 5))
        assertTrue(slow.onSteering(1_200, 20f).isEmpty())
        assertTrue(slow.g < 0.1)
    }

    @Test
    fun parkedCarDoesNotSloshEvenWithFullSteering() {
        val parked = CoffeeCup().apply { start(0) }
        drive(parked, 0, steady(0f, 5))
        assertTrue(parked.onSteering(1_200, -470f).isEmpty())
        assertEquals(0.0, parked.g, 1e-9)
    }

    @Test
    fun episodeEndsOnTickWhenSpeedStopsArriving() {
        val cup = CoffeeCup().apply { start(0) }
        drive(cup, 0, steady(40f, 5))
        // 한 번에 약 0.3 g(0.8초에 8.5 km/h)만 들어오고 차속 값이 더 오지 않는다
        cup.onSpeed(1_000, 39f)
        cup.onSpeed(1_800, 31.5f)
        assertTrue(cup.g >= 0.25)
        val ev = cup.onTick(3_000) + cup.onTick(4_000)
        assertEquals(listOf(Kind.WOBBLE), ev.map { it.kind })
    }

    @Test
    fun restartForgetsTheLastStagesSpeeds() {
        val cup = CoffeeCup().apply { start(0) }
        drive(cup, 0, steady(60f, 5))
        cup.stop(1_000)
        // 1초 뒤 다시 시작: 이전 구간의 60 km/h와 비교해 급감속으로 보면 안 된다
        cup.start(2_000)
        assertTrue(drive(cup, 2_000, steady(0f, 10)).isEmpty())
        assertEquals(100, cup.level)
    }

    @Test
    fun laneChangeWithoutSignalCostsFive() {
        val cup = CoffeeCup().apply { start(0) }
        val e = cup.onLaneChange(1_000)!!
        assertEquals(Kind.LANE, e.kind)
        assertEquals(95, cup.level)
    }

    @Test
    fun ecoSteadyDrivingEarnsBonusEveryMinute() {
        val cup = CoffeeCup().apply { start(0) }
        cup.onEcoMode(0, true)
        val ev = drive(cup, 0, steady(60f, 5 * 61 + 1)) // 61초
        assertEquals(listOf(Kind.ECO), ev.map { it.kind })
        assertEquals(1, cup.bonus)
        assertEquals(100, cup.level)
    }

    @Test
    fun steadyBonusNeedsEcoOnlyWhenTheCarReportsTheMode() {
        // 주행 모드를 알려 주지 않는 차(에뮬레이터): 정속만으로 센다
        val unknown = CoffeeCup().apply { start(0) }
        assertEquals(listOf(Kind.ECO), drive(unknown, 0, steady(60f, 5 * 61 + 1)).map { it.kind })
        // 일반 모드라고 알려 주면 세지 않는다
        val normal = CoffeeCup().apply { start(0) }
        normal.onEcoMode(0, false)
        assertTrue(drive(normal, 0, steady(60f, 5 * 61 + 1)).isEmpty())
        assertEquals(0, normal.bonus)
    }

    @Test
    fun nothingCountsBeforeStartAndLevelStopsAtZero() {
        val cup = CoffeeCup()
        assertNull(cup.onLaneChange(0))
        assertTrue(drive(cup, 0, listOf(50f, 50f, 50f, 50f, 50f, 10f)).isEmpty())
        cup.start(10_000)
        repeat(25) { cup.onLaneChange(10_000L + it) }
        assertEquals(0, cup.level)
        val stage = cup.stop(20_000)!!
        assertEquals(100, stage.lost)
        assertEquals(25, stage.counts[Kind.LANE])
        assertNull(cup.stop(21_000))
    }

    @Test
    fun periodScoreIsPer100Km() {
        assertEquals(94.2, CoffeeCup.scorePer100Km(24, 0, 412.0)!!, 0.05)
        assertEquals(100.0, CoffeeCup.scorePer100Km(3, 5, 120.0)!!, 1e-9)
        assertEquals(0.0, CoffeeCup.scorePer100Km(100, 0, 25.0)!!, 1e-9)
        assertNull(CoffeeCup.scorePer100Km(10, 0, 5.0))
    }
}
