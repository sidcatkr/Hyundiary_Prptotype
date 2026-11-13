package com.hyundiary.mockup.car

import ai.pleos.playground.tts.TextToSpeech
import ai.pleos.playground.tts.constant.ErrorType
import ai.pleos.playground.tts.constant.Mode
import ai.pleos.playground.tts.listener.EventListener
import ai.pleos.playground.tts.listener.OnInitializeListener
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import java.util.Locale

/**
 * Pleos TextToSpeech로 주행 중 주유 추천을 음성으로 알린다(화면을 보지 않아도 되게).
 *
 * - ON_DEVICE 모드: 앱 등록(Client ID/Secret)과 네트워크 없이 동작한다. 에뮬레이터에서 확인된 모드다.
 * - 말하기 전에 오디오 포커스를 잠깐(DUCK) 받고, 끝나면 돌려준다(Pleos 오디오 포커스 가이드).
 * - 권한: pleos.car.permission.TTS_SERVICE
 */
class VoiceGuide(
    private val context: Context,
    private val main: Handler,
    private val listener: Listener,
) {
    interface Listener {
        fun onVoiceStatus(status: SourceState)
    }

    private var tts: TextToSpeech? = null
    private var ready = false
    private val audio = context.getSystemService(AudioManager::class.java)
    private val attrs = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
    private val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
        .setAudioAttributes(attrs)
        .build()

    private val events = object : EventListener {
        override fun onReady() = Unit
        override fun onStart() = Unit
        override fun onUpdatedRms(rms: Double) = Unit
        override fun onDone() = onMain { releaseFocus() }
        override fun onStop() = onMain { releaseFocus() }
        override fun onError(errorType: ErrorType) = onMain {
            Log.w(TAG, "tts error $errorType")
            releaseFocus()
        }
    }

    fun start() {
        if (tts != null) return
        listener.onVoiceStatus(SourceState.CONNECTING)
        try {
            val t = TextToSpeech(context, Mode.ON_DEVICE)
            tts = t
            t.initialize(object : OnInitializeListener {
                override fun onSuccess() = onMain {
                    try {
                        t.addEventListener(events)
                        t.setLocale(Locale.KOREA)
                        t.setAudioAttributes(attrs)
                        ready = true
                        listener.onVoiceStatus(SourceState.OK)
                    } catch (e: Throwable) {
                        Log.w(TAG, "tts setup", e)
                        listener.onVoiceStatus(SourceState.FAILED)
                    }
                }

                override fun onFailure(errorType: ErrorType) = onMain {
                    Log.w(TAG, "tts init failed $errorType")
                    ready = false
                    listener.onVoiceStatus(
                        when (errorType) {
                            ErrorType.PERMISSION_DENIED -> SourceState.DENIED
                            ErrorType.NOT_SUPPORTED_API -> SourceState.UNSUPPORTED
                            else -> SourceState.FAILED
                        }
                    )
                }
            })
        } catch (e: Throwable) {
            Log.w(TAG, "tts unavailable", e)
            tts = null
            listener.onVoiceStatus(SourceState.UNSUPPORTED)
        }
    }

    /** 한 문장을 말한다. 준비 전이거나 오디오 포커스를 못 받으면 false. */
    fun speak(text: String): Boolean {
        val t = tts ?: return false
        if (!ready) return false
        val clean = text.trim().take(MAX_CHARS)
        if (clean.isEmpty()) return false
        if (audio?.requestAudioFocus(focus) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) return false
        return try {
            t.speak(clean, true)
            true
        } catch (e: Throwable) {
            Log.w(TAG, "speak", e)
            releaseFocus()
            false
        }
    }

    fun stop() {
        val t = tts ?: return
        try { t.stop() } catch (e: Throwable) { }
        try { t.removeEventListener(events) } catch (e: Throwable) { }
        try { t.release() } catch (e: Throwable) { Log.w(TAG, "release", e) }
        releaseFocus()
        tts = null
        ready = false
        listener.onVoiceStatus(SourceState.OFF)
    }

    private fun releaseFocus() {
        try { audio?.abandonAudioFocusRequest(focus) } catch (e: Throwable) { }
    }

    private fun onMain(block: () -> Unit) {
        if (Looper.myLooper() == main.looper) block() else main.post(block)
    }

    companion object {
        private const val TAG = "HyVoice"
        private const val MAX_CHARS = 120 // 주행 중 안내는 짧게
    }
}
