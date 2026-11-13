package com.hyundiary.mockup.logic

/** 주유량·주유 필요 여부 계산. 화면의 "주유량 = 연료량 변화 × 탱크 용량"과 같은 식이다. */
object FuelMath {
    /** 경로가 있을 때 남은 거리보다 이만큼 더 갈 수 있어야 주유 제안을 하지 않는다(km). */
    const val ROUTE_MARGIN_KM = 50.0
    /** 경로가 없을 때 주유 제안 기준(km). */
    const val LOW_RANGE_KM = 100.0
    /** 주행가능거리를 모를 때 주유 제안 기준(%). */
    const val LOW_FUEL_PCT = 20f

    /** 늘어난 퍼센트와 탱크 용량(L)으로 주유량(L)을 구한다. 소수 첫째 자리로 반올림. */
    fun liters(deltaPct: Float, capacityL: Double): Double {
        if (deltaPct <= 0f || capacityL <= 0.0 || capacityL.isNaN()) return 0.0
        return Math.round(deltaPct / 100.0 * capacityL * 10.0) / 10.0
    }

    /** 금액(원) = 주유량 × 단가, 10원 단위 반올림. */
    fun amount(liters: Double, pricePerL: Int): Long {
        if (liters <= 0.0 || pricePerL <= 0) return 0L
        return Math.round(liters * pricePerL / 10.0) * 10L
    }

    /**
     * 지금 주유를 제안할지 판단한다.
     * - 경로가 있으면: 주행가능거리가 남은 거리 + 여유([ROUTE_MARGIN_KM])보다 짧을 때
     * - 경로가 없으면: 주행가능거리가 [LOW_RANGE_KM]보다 짧을 때
     * - 주행가능거리를 모르면: 연료가 [LOW_FUEL_PCT] 아래일 때
     */
    fun needsFuel(rangeKm: Double?, fuelPct: Float?, routeRemainKm: Double?): Boolean {
        if (rangeKm != null && rangeKm >= 0.0) {
            if (routeRemainKm != null && routeRemainKm > 0.0) return rangeKm < routeRemainKm + ROUTE_MARGIN_KM
            return rangeKm < LOW_RANGE_KM
        }
        if (fuelPct != null && fuelPct >= 0f) return fuelPct < LOW_FUEL_PCT
        return false
    }
}
