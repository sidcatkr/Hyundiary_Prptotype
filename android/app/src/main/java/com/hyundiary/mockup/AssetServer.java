package com.hyundiary.mockup;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * APK assets를 https://appassets.androidplatform.net/ 주소로 내어 준다(androidx WebViewAssetLoader와 같은 방식).
 * file:// 접근을 열지 않아도 되고, 같은 출처라 웹 폰트도 문제없이 읽힌다. 그 밖의 주소는 모두 막는다.
 */
final class AssetServer {
    static final String HOST = "appassets.androidplatform.net";
    static final String ORIGIN = "https://" + HOST;

    private static final Map<String, String> TYPES = new HashMap<>();
    static {
        TYPES.put("html", "text/html");
        TYPES.put("js", "text/javascript");
        TYPES.put("css", "text/css");
        TYPES.put("json", "application/json");
        TYPES.put("txt", "text/plain");
        TYPES.put("svg", "image/svg+xml");
        TYPES.put("png", "image/png");
        TYPES.put("jpg", "image/jpeg");
        TYPES.put("webp", "image/webp");
        TYPES.put("woff2", "font/woff2");
        TYPES.put("woff", "font/woff");
        TYPES.put("wav", "audio/wav");
    }

    private final AssetManager assets;

    AssetServer(AssetManager assets) {
        this.assets = assets;
    }

    static boolean isLocal(Uri uri) {
        return uri != null && "https".equals(uri.getScheme()) && HOST.equals(uri.getHost());
    }

    WebResourceResponse serve(Uri uri) {
        if (uri == null) return null;
        String scheme = uri.getScheme();
        // data:, blob: 등은 WebView가 직접 처리
        if (!"http".equals(scheme) && !"https".equals(scheme)) return null;
        if (!isLocal(uri)) return status(403, "Forbidden");

        String path = uri.getPath();
        if (path == null || path.isEmpty() || "/".equals(path)) path = "/app.html";
        String rel = path.substring(1);
        // 상위 경로 접근 차단
        if (rel.contains("..") || rel.startsWith("/")) return status(404, "Not Found");

        String type = typeOf(rel);
        try {
            InputStream in = assets.open(rel, AssetManager.ACCESS_STREAMING);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            headers.put("X-Content-Type-Options", "nosniff");
            return new WebResourceResponse(type, isText(type) ? "utf-8" : null, 200, "OK", headers, in);
        } catch (IOException e) {
            return status(404, "Not Found");
        }
    }

    private static String typeOf(String rel) {
        int dot = rel.lastIndexOf('.');
        String ext = dot < 0 ? "" : rel.substring(dot + 1).toLowerCase(Locale.ROOT);
        String t = TYPES.get(ext);
        return t != null ? t : "application/octet-stream";
    }

    private static boolean isText(String type) {
        return type.startsWith("text/") || type.equals("application/json") || type.equals("image/svg+xml");
    }

    private static WebResourceResponse status(int code, String reason) {
        return new WebResourceResponse("text/plain", "utf-8", code, reason, new HashMap<>(), new ByteArrayInputStream(new byte[0]));
    }
}
