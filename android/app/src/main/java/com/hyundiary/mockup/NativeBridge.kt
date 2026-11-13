package com.hyundiary.mockup

import android.webkit.JavascriptInterface
import com.hyundiary.mockup.car.VehicleHub

/**
 * 웹 목업(web/src/native.js)이 부르는 브리지. window.HyundiaryNative로 노출된다.
 * WebView는 APK 안의 자원(AssetServer)만 열고 다른 주소로 이동하지 못하므로, 이 브리지를 부르는 쪽은 앱 자신의 웹 코드뿐이다.
 * 메서드는 JavaBridge 스레드에서 불리므로 상태 변경은 [VehicleHub]가 메인 스레드로 옮긴다.
 */
class NativeBridge(private val hub: VehicleHub) {
    /** 연동 대상별 연결 상태(JSON). */
    @JavascriptInterface
    fun caps(): String = hub.caps()

    /** 현재 차량 값(JSON). */
    @JavascriptInterface
    fun snapshot(): String = hub.snapshot()

    /** 웹이 이벤트 리스너를 붙였다는 신호. 지금 상태를 이벤트로 한 번 보낸다. */
    @JavascriptInterface
    fun ready() = hub.webReady()

    /** 주유소를 내비게이션 경유지로 넣는다. {lat, lng, name, address, poiId} */
    @JavascriptInterface
    fun addWaypoint(json: String?): Boolean {
        if (json == null || json.length > MAX_JSON) return false
        return hub.addWaypoint(json)
    }

    /** 음성 안내 한 문장. */
    @JavascriptInterface
    fun speak(text: String?): Boolean {
        if (text.isNullOrBlank() || text.length > MAX_TEXT) return false
        return hub.speak(text)
    }

    /** 승차감 기록 켜기/끄기(설정). */
    @JavascriptInterface
    fun cupEnable(on: Boolean): Boolean = hub.cupEnable(on)

    companion object {
        private const val MAX_JSON = 2_000
        private const val MAX_TEXT = 300
    }
}
