# Hyundiary

주유할 때마다 똑똑해지는 나만의 자동차 가계부

## 1. 앱 이름 및 한 줄 소개

- 앱 이름: Hyundiary (패키지 `com.hyundiary.mockup`)
- 한 줄 소개: 주유를 자동으로 가계부에 기록하고, 경로 위 주유소 추천, 소비 습관 분석, 안전 운전 기록을 차량 화면에서 보여 주는 Pleos Connect 앱의 프로토타입입니다.

이 저장소의 앱은 화면과 흐름을 보여 주는 프로토타입입니다. 모든 수치와 주유소는 예시 값이며, 차량 데이터(Pleos Vehicle SDK, AAOS Car API)와 외부 API에는 아직 연결되어 있지 않습니다. 주행·정차 상태는 앱 안의 시연 버튼으로 바꿉니다.

## 2. APK 파일 위치

- `apk/건한_Hyundiary_release.apk` (release 빌드, APK Signature Scheme v2·v3 서명)

## 3. 실행 방법

### 3.1 APK 설치와 실행

Pleos Connect 에뮬레이터를 완전히 부팅한 뒤 다음을 실행합니다.

```bash
adb install -r apk/건한_Hyundiary_release.apk
adb shell am start --user 10 -n com.hyundiary.mockup/.MainActivity
```

- Pleos Connect 에뮬레이터는 사용자 10으로 동작하므로, 터미널에서 실행할 때 `--user 10`을 붙입니다.
- 에뮬레이터 앱 목록의 Hyundiary 아이콘으로 실행해도 됩니다.
- 앱은 landscape 앱 창(두 window를 합친 영역)으로 열립니다.

### 3.2 시연 방법

- 앱 창 오른쪽 위의 "시연" 버튼을 누르면 시연 패널이 열립니다. 발표자만 쓰는 조작입니다.
- 기본 흐름: ① 주행 시작 → ② 주유 제안 받기 → ③ 주유 후 정차(주유 기록 팝업) → ④ 주행 종료
- 다른 상황: 주행 중 안전 기록, 경로 없이 주행, 유가 정보 없는 주유, 소모품 경고, 전기차 전환, 충전 후 정차, 처음부터
- 정차 중에는 화면을 직접 눌러 가계부 달력, 통계의 소비 습관, 주유소 정렬, 안전 운전 기록을 볼 수 있습니다.
- 뒤로 가기(CCP 포함)는 영상, 팝업, 하위 화면 순으로 닫고, 홈에서는 앱을 뒤로 보냅니다(`moveTaskToBack`).

### 3.3 소스에서 빌드

```bash
cd android
./gradlew assembleRelease     # release APK: app/build/outputs/apk/release/
./gradlew installDebug        # debug 빌드를 에뮬레이터에 바로 설치
```

- JDK 17로 빌드합니다. Android Studio에 내장된 최신 JBR(Java 25)은 Gradle 8.10.2가 지원하지 않으므로, Android Studio에서는 Settings > Build, Execution, Deployment > Build Tools > Gradle > Gradle JDK를 17로 지정하고, 터미널에서는 `JAVA_HOME`을 JDK 17로 지정합니다.
- 터미널에서만 빌드할 때는 `ANDROID_HOME`을 지정하거나 `android/local.properties`에 `sdk.dir`을 적습니다. Android Studio로 열면 자동으로 만들어집니다.
- release 서명 키는 저장소에 포함하지 않습니다. `android/keystore.properties`(Git 제외 대상)에 아래 항목을 적으면 release 빌드가 그 키로 서명되고, 파일이 없으면 서명되지 않은 APK가 만들어집니다.

```properties
storeFile=/절대/경로/hyundiary-release.jks
storePassword=...
keyAlias=hyundiary
keyPassword=...
```

- `web/` 폴더가 그대로 APK assets로 들어갑니다. 웹 소스를 고친 뒤 다시 빌드하면 반영됩니다.

### 3.4 브라우저 프리뷰(참고)

같은 화면을 Pleos OS 화면(1920×1080) 안에 넣어 브라우저에서 볼 수 있습니다.

- `dist/hyundiary-preview.html`을 브라우저로 엽니다(인터넷 불필요).
- 소스를 고치면서 보려면 Node.js 18 이상에서 `npm start`를 실행하고 `http://127.0.0.1:5173/`(OS 화면 포함) 또는 `/app.html`(앱 창만)을 엽니다.
- 단일 파일 다시 만들기: `npm run build`. 동작 확인: `npm install`, `npx playwright install chromium` 후 `npm test`.

## 4. 테스트 환경 및 필요한 설정

### 4.1 테스트 환경

| 항목 | 내용 |
|---|---|
| 개발·테스트 PC | MacBook Pro (macOS) |
| IDE | Android Studio |
| JDK | Eclipse Temurin 17 |
| 빌드 도구 | Android Gradle Plugin 8.8.2, Gradle 8.10.2(wrapper 포함) |
| Android SDK | compileSdk 35, targetSdk 35, minSdk 28 |
| 언어 | Java 17(앱 셸), JavaScript(React 18.3.1 + htm 3.1.1, 화면) |
| 실행 환경 | Pleos Connect 에뮬레이터 v2.1.0(5장 참고) |
| WebView | 에뮬레이터 내장 `ai.pleos.android.webview` 131.0.6752.0 |

### 4.2 필요한 설정

- 권한: 없음. INTERNET 권한도 쓰지 않으며, 화면 자원은 모두 APK 안에 있습니다.
- 네트워크, 로그인, 계정 설정: 필요 없습니다.
- 차량 상태: 정차 상태에서 실행합니다. 앱이 `distractionOptimized`를 선언하지 않았으므로 에뮬레이터의 주행 규제가 켜져 있으면 앱이 가려집니다. 주행 장면은 앱 안의 시연 버튼으로 보여 줍니다.
- 에뮬레이터: AVD `Pleos_Connect_v2.1.0`을 콜드 부트(`-no-snapshot`)로 켜고 부팅이 끝난 뒤 설치합니다.

## 5. 개발에 사용한 Pleos Connect 에뮬레이터 버전과 화면 규격

| 항목 | 내용 |
|---|---|
| 에뮬레이터 | Pleos Connect Emulator v2.1.0 (AVD `Pleos_Connect_v2.1.0`) |
| 시스템 이미지 | Android 14 (API 34) Automotive |
| 디스플레이 | 2560×1440 px, 160 dpi |
| 앱 창 | landscape 멀티윈도우, 1682×1210 px (화면 좌표 (853, 90)~(2535, 1300)) |
| 앱 화면 기준 크기 | 1280×907 px을 앱 창에 맞춰 비율 유지 확대(이 에뮬레이터에서 약 1.31배), 남는 부분은 흰 여백 |

화면 왼쪽의 Driving view, 위쪽 상태바, 아래쪽 GNB는 에뮬레이터(OS)가 그리며, 앱은 앱 창만 채웁니다.

## 6. 폴더 구성

| 경로 | 내용 |
|---|---|
| `apk/` | 제출용 release APK |
| `android/` | 에뮬레이터 앱(Android Gradle 프로젝트, Java) |
| `web/app.html` | 앱 화면 진입점(앱 창만, 시연 버튼 포함) |
| `web/index.html` | 브라우저 프리뷰 진입점(OS 화면 포함) |
| `web/src/app.js` | 화면과 동작 전체(React 18 + htm, 빌드 단계 없음) |
| `web/src/style.css` | 스타일(Pleos OS 라이트 테마 기준) |
| `web/src/icons.js` | Pleos 아이콘 경로 모음 |
| `web/assets/img/` | 브라우저 프리뷰용 OS 화면 캡처(에뮬레이터 화면) |
| `web/vendor/` | React, ReactDOM, htm, Asta Sans 폰트(오프라인 실행용) |
| `dist/hyundiary-preview.html` | 브라우저 프리뷰 단일 파일 |
| `tools/` | 로컬 서버, 단일 파일 빌드, 동작 확인 스크립트 |

## 7. 구현 메모

- 화면 맞춤: 1280×907 화면을 앱 창에 맞춰 가운데 정렬합니다. 창 크기나 방향이 바뀌어도 WebView를 다시 만들지 않습니다(`configChanges`).
- 자원 제공: APK assets를 `https://appassets.androidplatform.net/` 주소로 내어 줍니다(`AssetServer`). `file://` 접근은 열지 않으며, 그 밖의 주소는 모두 차단합니다.
- WebView 보안: 파일·콘텐츠 접근 차단, 혼합 콘텐츠 차단, 앱 밖 주소로 이동 차단, 원격 디버깅은 debug 빌드에서만 켭니다. release 빌드는 `debuggable false`입니다.
- 생명주기: 화면에서 사라지면 WebView 타이머(주행 시뮬레이션 포함)를 멈추고, 렌더러가 비정상 종료되면 WebView를 새로 만듭니다.

## 8. 제약과 주의사항

- 프로토타입입니다. 차량 데이터, 유가 API, 내비게이션 연동은 없습니다.
- portrait(한 window) 전용 화면은 아직 없습니다. landscape 화면을 줄여서 보여 줍니다.
- 달력 요일은 2025년 배치(11월 9일 일요일)를 따릅니다.

## 9. 사용한 오픈소스

| 이름 | 버전 | 라이선스 | 위치 |
|---|---|---|---|
| React, ReactDOM | 18.3.1 | MIT | `web/vendor/LICENSE-react*.txt` |
| htm | 3.1.1 | Apache-2.0 | `web/vendor/LICENSE-htm.txt` |
| Asta Sans | 1.000 | SIL Open Font License 1.1 | `web/vendor/fonts/OFL.txt` |

`web/assets/img/`의 이미지는 Pleos Connect 에뮬레이터 화면을 캡처한 것으로, 브라우저 프리뷰에서 OS 화면을 보여 주는 용도로만 씁니다.
