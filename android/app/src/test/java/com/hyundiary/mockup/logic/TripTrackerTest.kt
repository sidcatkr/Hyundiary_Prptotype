package com.hyundiary.mockup.logic

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TripTrackerTest {
    @Test
    fun gearStartsAndEndsTrip() {
        val tr = TripTracker()
        assertTrue(tr.onGear(0L, Gear.D) is TripTracker.Event.Started)
        // 60 km/h로 60초 = 1 km
        for (i in 0..60) tr.onSpeed(i * 1_000L, 60f)
        val ev = tr.onGear(61_000L, Gear.P)
        assertTrue(ev is TripTracker.Event.Ended)
        val trip = (ev as TripTracker.Event.Ended).trip
        assertEquals(1.0, trip.km, 0.001)
        assertEquals(61L, trip.sec)
        assertFalse(tr.active)
    }

    @Test
    fun odometerWinsWhenItMoves() {
        val tr = TripTracker()
        tr.onOdometer(42_480.0)
        tr.onGear(0L, Gear.D)
        for (i in 0..10) tr.onSpeed(i * 1_000L, 30f)
        tr.onOdometer(42_485.0)
        val trip = (tr.onGear(11_000L, Gear.P) as TripTracker.Event.Ended).trip
        assertEquals(5.0, trip.km, 0.001)
    }

    @Test
    fun frozenOdometerFallsBackToSpeed() {
        // 에뮬레이터는 누적 주행거리가 0.0으로 고정된다
        val tr = TripTracker()
        tr.onOdometer(0.0)
        tr.onGear(0L, Gear.D)
        for (i in 0..36) tr.onSpeed(i * 1_000L, 100f)
        val trip = tr.current(36_000L)!!
        assertEquals(1.0, trip.km, 0.001)
    }

    @Test
    fun withoutGearSpeedStartsAndLongStopEnds() {
        val tr = TripTracker(stopHoldMs = 10_000L)
        assertTrue(tr.onSpeed(0L, 20f) is TripTracker.Event.Started)
        tr.onSpeed(1_000L, 0f)
        assertEquals(null, tr.onSpeed(5_000L, 0f))
        assertTrue(tr.onSpeed(11_000L, 0f) is TripTracker.Event.Ended)
    }

    @Test
    fun longGapIsNotIntegrated() {
        val tr = TripTracker(maxGapMs = 5_000L)
        tr.onGear(0L, Gear.D)
        tr.onSpeed(0L, 100f)
        tr.onSpeed(600_000L, 100f) // 앱이 10분 멈춰 있던 경우
        assertEquals(0.0, tr.current(600_000L)!!.km, 0.001)
    }

    @Test
    fun gearMapping() {
        assertEquals(Gear.P, Gear.fromVehicleGear(4))
        assertEquals(Gear.D, Gear.fromVehicleGear(8))
        assertEquals(Gear.D, Gear.fromVehicleGear(0x20))
        assertEquals(Gear.R, Gear.fromVehicleGear(2))
        assertEquals(Gear.N, Gear.fromVehicleGear(1))
        assertEquals(Gear.UNKNOWN, Gear.fromVehicleGear(0))
    }
}
