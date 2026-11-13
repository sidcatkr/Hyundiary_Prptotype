package com.hyundiary.mockup.car

import ai.pleos.playground.navi.constants.NaviErrorCode
import ai.pleos.playground.navi.constants.NavigationStatus
import ai.pleos.playground.navi.constants.WaypointIndex
import ai.pleos.playground.navi.data.CurrentLocationInfo
import ai.pleos.playground.navi.data.DestinationArrivedInfo
import ai.pleos.playground.navi.data.DestinationInfo
import ai.pleos.playground.navi.data.DrivingInfo
import ai.pleos.playground.navi.data.RequestWaypointInfo
import ai.pleos.playground.navi.data.RouteStartInfo
import ai.pleos.playground.navi.data.WaypointChangedInfo
import ai.pleos.playground.navi.helper.NaviHelper
import ai.pleos.playground.navi.helper.listener.NaviHelperEventListener
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * Pleos NaviHelper 연동: 목적지·남은 거리, 도로 제한속도, 현재 위치 주소를 받고 주유소를 경유지로 넣는다.
 *
 * - 조회 API는 값을 바로 돌려주지 않고 리스너 이벤트로 온다(getDestinationInfo → onDestinationInfo).
 * - 에뮬레이터에서는 onRouteEnded가 onRouteStarted 직후에 와서 주행 종료 신호로 쓰지 않는다.
 *   주행 종료는 기어(P)로 판단한다([com.hyundiary.mockup.logic.TripTracker]).
 * - 권한: 조회·이벤트 NAVI_ROUTE, 경유지 추가 NAVI_ROUTE_SEARCH
 */
class NaviSource(
    private val context: Context,
    private val main: Handler,
    private val state: VehicleState,
    private val listener: Listener,
) {
    interface Listener {
        fun onNaviStatus(status: SourceState)
        fun onNaviChanged(what: String)
        fun onWaypointResult(ok: Boolean, error: String?)
    }

    private var helper: NaviHelper? = null
    private var connected = false
    private var waypointPending = false

    private val events = object : NaviHelperEventListener {
        override fun onNavigationStatus(status: NavigationStatus) = onMain {
            state.naviStatus = status.name
            if (status != NavigationStatus.ROUTE_DRIVE) {
                state.destRemainM = null
                state.destRemainSec = null
            }
            listener.onNaviChanged("status")
        }

        override fun onCurrentRoadSpeedLimit(speedLimit: Int) = onMain {
            state.speedLimitKmh = speedLimit.takeIf { it > 0 }
            listener.onNaviChanged("limit")
        }

        override fun onRouteStarted(info: RouteStartInfo) = onMain {
            state.destName = info.name
            state.destRemainM = info.distance
            state.destRemainSec = info.duration
            state.naviStatus = NavigationStatus.ROUTE_DRIVE.name
            listener.onNaviChanged("route")
        }

        override fun onDrivingInfo(info: DrivingInfo) = onMain {
            info.destination?.let { d ->
                d.name?.let { state.destName = it }
                state.destRemainM = d.distance
                state.destRemainSec = d.duration
                listener.onNaviChanged("driving")
            }
        }

        override fun onDestinationInfo(info: DestinationInfo) = onMain {
            state.destName = info.name
            state.destRemainM = info.remainDistance
            state.destRemainSec = info.remainTime
            listener.onNaviChanged("destination")
        }

        override fun onRouteCancelled() = onMain { clearRoute() }

        override fun onDestinationArrived(info: DestinationArrivedInfo) = onMain { clearRoute() }

        override fun onCurrentLocationInfo(info: CurrentLocationInfo) = onMain {
            info.address?.takeIf { it.isNotBlank() }?.let { state.address = it }
            listener.onNaviChanged("location")
        }

        override fun onWaypointChanged(info: WaypointChangedInfo) = onMain {
            if (waypointPending) {
                waypointPending = false
                listener.onWaypointResult(true, null)
            }
            helper?.getDestinationInfo()
        }

        override fun onError(code: NaviErrorCode) = onMain {
            Log.w(TAG, "navi error $code")
            if (waypointPending) {
                waypointPending = false
                listener.onWaypointResult(false, code.name)
            }
        }
    }

    fun start() {
        if (helper != null) return
        listener.onNaviStatus(SourceState.CONNECTING)
        val h = try {
            NaviHelper(context)
        } catch (e: Throwable) {
            Log.w(TAG, "NaviHelper unavailable", e)
            listener.onNaviStatus(SourceState.UNSUPPORTED)
            return
        }
        helper = h
        try {
            h.initialize({
                onMain {
                    connected = true
                    h.addListener(events)
                    listener.onNaviStatus(SourceState.OK)
                    refresh()
                }
            }, { t ->
                onMain {
                    Log.w(TAG, "NaviHelper connect failed", t)
                    connected = false
                    listener.onNaviStatus(if (t is SecurityException) SourceState.DENIED else SourceState.FAILED)
                }
            })
        } catch (e: Throwable) {
            Log.w(TAG, "NaviHelper.initialize", e)
            listener.onNaviStatus(if (e is SecurityException) SourceState.DENIED else SourceState.FAILED)
        }
    }

    /** 목적지·경로 상태를 다시 묻는다. 결과는 이벤트로 온다. */
    fun refresh() {
        val h = helper ?: return
        if (!connected) return
        quiet { h.getDestinationInfo() }
    }

    /** 현재 위치 주소를 묻는다(주유 기록의 장소로 쓴다). */
    fun requestAddress() {
        val h = helper ?: return
        if (!connected) return
        quiet { h.getCurrentLocationInfo() }
    }

    /**
     * 주유소를 첫 번째 경유지로 넣는다. 경로 안내 중일 때만 의미가 있다.
     * 결과는 onWaypointChanged(성공) 또는 onError(실패)로 오고 [Listener.onWaypointResult]로 넘긴다.
     */
    fun addWaypoint(lat: Double, lng: Double, name: String, address: String, poiId: String): Boolean {
        val h = helper ?: return false
        if (!connected) return false
        if (lat !in -90.0..90.0 || lng !in -180.0..180.0) return false
        return try {
            waypointPending = true
            h.addWaypoint(RequestWaypointInfo(lat, lng, name, WaypointIndex.FIRST, poiId, address, "0"))
            // 이벤트가 오지 않는 경우를 대비해 일정 시간 뒤 대기 상태를 푼다
            main.postDelayed({
                if (waypointPending) {
                    waypointPending = false
                    listener.onWaypointResult(true, "NO_EVENT")
                }
            }, 5_000L)
            true
        } catch (e: Throwable) {
            Log.w(TAG, "addWaypoint", e)
            waypointPending = false
            false
        }
    }

    fun stop() {
        val h = helper ?: return
        quiet { h.removeListener(events) }
        quiet { h.release() }
        helper = null
        connected = false
        listener.onNaviStatus(SourceState.OFF)
    }

    private fun clearRoute() {
        state.destRemainM = null
        state.destRemainSec = null
        state.naviStatus = NavigationStatus.FREE_DRIVE.name
        listener.onNaviChanged("route")
    }

    private inline fun quiet(block: () -> Unit) {
        try { block() } catch (e: Throwable) { Log.w(TAG, "navi call", e) }
    }

    private fun onMain(block: () -> Unit) {
        if (Looper.myLooper() == main.looper) block() else main.post(block)
    }

    companion object {
        private const val TAG = "HyNavi"
    }
}
