package com.hyundiary.mockup.car

import ai.pleos.playground.location.fused.FusedLocation
import ai.pleos.playground.location.fused.listener.FusedLocationListener
import ai.pleos.playground.location.fused.model.LocationData
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * Pleos FusedLocation으로 현재 위치를 받는다(주유 기록의 위치, 주유소 거리 계산용).
 * 권한: pleos.car.permission.FUSED_LOCATION (런타임 권한)
 */
class LocationSource(
    private val context: Context,
    private val main: Handler,
    private val state: VehicleState,
    private val listener: Listener,
) {
    interface Listener {
        fun onLocationStatus(status: SourceState)
        fun onLocationChanged()
    }

    private var fused: FusedLocation? = null
    private var gotFirst = false

    private val callback = object : FusedLocationListener {
        override fun onChanged(location: LocationData?) = onMain {
            if (location != null) apply(location)
        }

        override fun onError(exception: Exception) = onMain {
            Log.w(TAG, "location error: ${exception.message}")
            if (!gotFirst) listener.onLocationStatus(SourceState.FAILED)
        }
    }

    fun start() {
        if (fused != null) return
        if (context.checkSelfPermission(PERMISSION) != PackageManager.PERMISSION_GRANTED) {
            listener.onLocationStatus(SourceState.DENIED)
            return
        }
        listener.onLocationStatus(SourceState.CONNECTING)
        try {
            val f = FusedLocation(context)
            // 차종마다 지원이 달라 먼저 확인한다
            if (!f.isSupported()) {
                listener.onLocationStatus(SourceState.UNSUPPORTED)
                return
            }
            f.initialize()
            fused = f
            f.getLastKnownLocation(callback)
            f.registerFusedLocationCallback(callback)
        } catch (e: SecurityException) {
            Log.w(TAG, "location permission", e)
            listener.onLocationStatus(SourceState.DENIED)
        } catch (e: Throwable) {
            Log.w(TAG, "location unavailable", e)
            fused = null
            listener.onLocationStatus(SourceState.FAILED)
        }
    }

    fun stop() {
        val f = fused ?: return
        try { f.unregisterFusedLocationCallback(callback) } catch (e: Throwable) { }
        try { f.release() } catch (e: Throwable) { Log.w(TAG, "release", e) }
        fused = null
        gotFirst = false
        listener.onLocationStatus(SourceState.OFF)
    }

    private fun apply(l: LocationData) {
        val lat = l.latitude
        val lng = l.longitude
        if (lat.isNaN() || lng.isNaN() || (lat == 0.0 && lng == 0.0)) return
        state.lat = lat
        state.lng = lng
        if (!gotFirst) {
            gotFirst = true
            listener.onLocationStatus(SourceState.OK)
        }
        listener.onLocationChanged()
    }

    private fun onMain(block: () -> Unit) {
        if (Looper.myLooper() == main.looper) block() else main.post(block)
    }

    companion object {
        private const val TAG = "HyLocation"
        const val PERMISSION = "pleos.car.permission.FUSED_LOCATION"
    }
}
