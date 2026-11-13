package com.hyundiary.mockup.logic

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FuelMathTest {
    @Test
    fun litersFromLevelChange() {
        // 화면 예시: 60 L 탱크, 18% → 74% = 33.6 L
        assertEquals(33.6, FuelMath.liters(56f, 60.0), 0.001)
        assertEquals(0.0, FuelMath.liters(-3f, 60.0), 0.0)
        assertEquals(0.0, FuelMath.liters(10f, 0.0), 0.0)
    }

    @Test
    fun amountRoundsToTenWon() {
        // 33.6 L × 1,689원 = 56,750.4원 → 56,750원
        assertEquals(56_750L, FuelMath.amount(33.6, 1689))
        assertEquals(0L, FuelMath.amount(0.0, 1689))
    }

    @Test
    fun refuelSuggestion() {
        // 천안까지 85 km, 120 km 주행 가능 → 여유 50 km가 안 돼서 제안
        assertTrue(FuelMath.needsFuel(120.0, 18f, 85.0))
        assertFalse(FuelMath.needsFuel(500.0, 74f, 85.0))
        assertTrue(FuelMath.needsFuel(80.0, null, null))
        assertFalse(FuelMath.needsFuel(150.0, null, null))
        assertTrue(FuelMath.needsFuel(null, 15f, null))
        assertFalse(FuelMath.needsFuel(null, null, null))
    }
}
