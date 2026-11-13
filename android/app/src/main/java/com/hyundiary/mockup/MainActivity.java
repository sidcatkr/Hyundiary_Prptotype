package com.hyundiary.mockup;

import android.app.Activity;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.hyundiary.mockup.car.LocationSource;
import com.hyundiary.mockup.car.VehicleHub;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Hyundiary 앱. APK 안의 웹 화면(assets/app.html)을 WebView 하나로 띄운다.
 * Pleos OS 화면(Driving view, 상태바, GNB)은 에뮬레이터가 그리므로 웹은 앱 창만 채운다.
 *
 * 차량 연동은 {@link VehicleHub}가 맡는다(AAOS Car API, Pleos Vehicle SDK, NaviHelper, TextToSpeech, FusedLocation).
 * 웹은 window.HyundiaryNative({@link NativeBridge})로 값을 묻고, 앱은 window.HyVehicle._emit(...)으로 이벤트를 보낸다.
 */
public class MainActivity extends Activity {
    private static final String TAG = "Hyundiary";
    private static final String START_URL = AssetServer.ORIGIN + "/app.html";
    private static final int REQ_PERMISSIONS = 1;

    /** 사용자 동의가 필요한(dangerous) 권한. 나머지 차량 권한은 설치할 때 주어진다. */
    private static final String[] RUNTIME_PERMISSIONS = {
            "android.car.permission.CAR_SPEED",     // PERF_VEHICLE_SPEED
            "android.car.permission.CAR_ENERGY",    // FUEL_LEVEL, RANGE_REMAINING
            LocationSource.PERMISSION,               // Pleos FusedLocation
    };

    private WebView webView;
    private VehicleHub hub;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 원격 디버깅은 debug 빌드에서만 켠다(Pleos 보안 가이드: 배포 앱은 OFF)
        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(debuggable);

        hub = new VehicleHub(this, this::pushToWeb);

        webView = createWebView();
        setContentView(webView);
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(START_URL);
        }

        // 권한이 필요 없는 연동은 바로 시작하고, 권한을 받으면 나머지를 다시 붙인다
        hub.start();
        requestMissingPermissions();
    }

    private void requestMissingPermissions() {
        List<String> missing = new ArrayList<>();
        for (String p : RUNTIME_PERMISSIONS) {
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) missing.add(p);
        }
        if (!missing.isEmpty()) {
            requestPermissions(missing.toArray(new String[0]), REQ_PERMISSIONS);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_PERMISSIONS && hub != null) {
            hub.onPermissionsChanged();
        }
    }

    /** 차량 이벤트를 웹으로 보낸다. 메인 스레드에서 불린다. JSON은 문자열 리터럴로 감싸 넘긴다. */
    private void pushToWeb(String json) {
        if (webView == null) return;
        webView.evaluateJavascript("window.HyVehicle&&window.HyVehicle._emit(" + JSONObject.quote(json) + ")", null);
    }

    private WebView createWebView() {
        WebView view = new WebView(this);
        view.setBackgroundColor(Color.WHITE);
        view.setOverScrollMode(View.OVER_SCROLL_NEVER);
        view.setVerticalScrollBarEnabled(false);
        view.setHorizontalScrollBarEnabled(false);

        WebSettings s = view.getSettings();
        s.setJavaScriptEnabled(true);           // React 목업 실행
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);            // 로컬 파일 접근 차단: 자원은 AssetServer로만 받는다
        s.setAllowContentAccess(false);
        s.setGeolocationEnabled(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);                     // 시스템 글자 크기와 관계없이 목업 배치를 그대로 유지
        s.setMediaPlaybackRequiresUserGesture(true);

        view.setWebViewClient(new Client(new AssetServer(getAssets())));
        // 웹 화면이 차량 값을 읽고 경유지 추가·음성 안내를 요청하는 통로
        view.addJavascriptInterface(new NativeBridge(hub), "HyundiaryNative");
        return view;
    }

    /** Back(CCP 포함): 웹이 팝업·하위 화면을 먼저 닫고, 더 닫을 게 없으면 앱을 뒤로 보낸다. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView == null) {
            moveTaskToBack(true);
            return;
        }
        webView.evaluateJavascript("(window.hyBack && window.hyBack()) === true", value -> {
            if (!"true".equals(value)) {
                moveTaskToBack(true);
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.resumeTimers();
            webView.onResume();
        }
    }

    /**
     * 화면에서 사라지면 애니메이션·주행 시뮬레이션 타이머를 멈춰 차량 자원을 아낀다.
     * 차량 연동(VehicleHub)은 Activity가 살아 있는 동안 계속 받아 주유·주행을 놓치지 않는다.
     */
    @Override
    protected void onPause() {
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    @Override
    protected void onDestroy() {
        if (hub != null) {
            hub.release();
            hub = null;
        }
        destroyWebView();
        super.onDestroy();
    }

    private void destroyWebView() {
        if (webView == null) return;
        ViewGroup parent = (ViewGroup) webView.getParent();
        if (parent != null) parent.removeView(webView);
        webView.stopLoading();
        webView.destroy();
        webView = null;
    }

    private final class Client extends WebViewClient {
        private final AssetServer server;

        Client(AssetServer server) {
            this.server = server;
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return server.serve(request.getUrl());
        }

        /** 앱 밖 주소로는 이동하지 않는다. */
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return !AssetServer.isLocal(request.getUrl());
        }

        /** 렌더러가 죽으면 앱 전체가 같이 죽지 않도록 WebView를 새로 만든다. */
        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            Log.w(TAG, "WebView renderer gone, crash=" + detail.didCrash());
            if (view == webView) {
                destroyWebView();
                webView = createWebView();
                setContentView(webView);
                webView.loadUrl(START_URL);
            }
            return true;
        }
    }
}
