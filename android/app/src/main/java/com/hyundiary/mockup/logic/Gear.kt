package com.hyundiary.mockup.logic

/** 변속 레버 위치. 차량 값을 받지 못하면 UNKNOWN. */
enum class Gear(val label: String) {
    P("P"), R("R"), N("N"), D("D"), UNKNOWN("");

    companion object {
        /**
         * AAOS `GEAR_SELECTION`(android.car.VehicleGear 비트 값)을 변환한다.
         * NEUTRAL 0x1, REVERSE 0x2, PARK 0x4, DRIVE 0x8, 1~9단은 0x10 이상.
         */
        fun fromVehicleGear(value: Int): Gear = when {
            value == 0x4 -> P
            value == 0x2 -> R
            value == 0x1 -> N
            value == 0x8 || value >= 0x10 -> D
            else -> UNKNOWN
        }
    }
}
