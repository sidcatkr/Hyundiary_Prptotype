# Hyundiary 프로토타입

주유할 때마다 똑똑해지는 나만의 자동차 가계부 "Hyundiary"의 차량 화면 목업입니다. 같은 웹 목업을 두 가지 방식으로 실행합니다.

- 브라우저 프리뷰: Pleos OS 화면(1920×1080) 안에 앱을 넣어 보여 줍니다.
- 에뮬레이터 앱: Pleos Connect 에뮬레이터에 설치하는 안드로이드 앱입니다. WebView 하나로 웹 목업을 띄우며, OS 화면은 에뮬레이터가 그리고 앱은 앱 창만 채웁니다.

모든 수치와 주유소는 예시 값이며, 차량 데이터나 외부 API와 연결되어 있지 않습니다.

## 1. 폴더 구성

| 경로 | 내용 |
|---|---|
| `web/index.html` | 브라우저 프리뷰 진입점(OS 화면 포함) |
| `web/app.html` | 에뮬레이터 앱 진입점(앱 창만, 시연 버튼 포함) |
| `web/src/app.js` | 화면과 동작 전체(React 18 + htm, 빌드 단계 없음) |
| `web/src/style.css` | 스타일(Pleos OS 라이트 테마 기준) |
| `web/src/icons.js` | Pleos 아이콘 경로 모음 |
| `web/assets/img/` | 브라우저 프리뷰용 OS 화면 캡처(에뮬레이터 화면) |
| `web/vendor/` | React, ReactDOM, htm, Asta Sans 폰트(오프라인 실행용) |
| `android/` | 에뮬레이터 앱(Android Gradle 프로젝트, Java) |
| `dist/hyundiary-preview.html` | 브라우저 프리뷰 단일 파일(모든 자원 포함, 인터넷 불필요) |
| `tools/` | 로컬 서버, 단일 파일 빌드, 동작 확인 스크립트 |

## 2. 브라우저에서 실행

- 가장 간단한 방법: `dist/hyundiary-preview.html`을 브라우저로 엽니다.
- 소스를 고치면서 보려면 Node.js 18 이상에서 다음을 실행합니다.

```bash
npm start
# 브라우저 프리뷰  http://127.0.0.1:5173/
# 에뮬 앱 화면    http://127.0.0.1:5173/app.html
```

- 소스를 고친 뒤 단일 파일을 다시 만들려면 `npm run build`를 실행합니다.
- 동작 확인: `npm install`, `npx playwright install chromium` 후 `npm test`를 실행합니다. 런타임 오류, 폰트 로드, 메뉴 이동, 시연 흐름, 뒤로 가기를 점검합니다.

## 3. Pleos 에뮬레이터에서 실행

### 3.1 준비

- Android Studio(JDK 17 이상), Android SDK API 35
- Pleos Connect 에뮬레이터(AVD `Pleos_Connect_v2.1.0`, Android 14)가 완전히 부팅된 상태

### 3.2 빌드와 설치

Android Studio에서 `android/` 폴더를 열고 Run을 누르거나, 터미널에서 다음을 실행합니다.

```bash
cd android
./gradlew installDebug
adb shell am start -n com.hyundiary.mockup/.MainActivity
```

- 터미널에서만 빌드할 때는 `ANDROID_HOME`을 지정하거나 `android/local.properties`에 `sdk.dir`을 적습니다. Android Studio로 열면 자동으로 만들어집니다.
- `web/` 폴더가 그대로 APK assets로 들어갑니다. 웹 소스를 고친 뒤에는 다시 빌드하면 반영됩니다.
- 앱 이름은 Hyundiary, 패키지는 `com.hyundiary.mockup`입니다.

### 3.3 시연 방법

- 앱 창 오른쪽 위의 "시연" 버튼을 누르면 시연 패널이 열립니다. 발표자만 쓰는 조작입니다.
- 기본 흐름: ① 주행 시작 → ② 주유 제안 받기 → ③ 주유 후 정차(기록 팝업) → ④ 주행 종료
- 다른 상황: 주행 중 안전 기록, 경로 없이 주행, 유가 정보 없는 주유, 소모품 경고, 전기차 전환, 충전 후 정차, 처음부터
- 정차 중에는 화면을 직접 눌러 가계부 달력, 통계의 소비 습관, 주유소 정렬, 안전 운전 기록을 볼 수 있습니다.
- 뒤로 가기(CCP 포함)는 영상, 팝업, 하위 화면 순으로 닫고, 홈에서는 앱을 뒤로 보냅니다(`moveTaskToBack`).

## 4. 구현 메모

- 앱 창 크기: landscape(두 window를 합친 영역)를 기준으로 1280×907 화면을 창에 맞춰 가운데 정렬합니다. 창 비율이 다르면 남는 부분은 흰 여백이 됩니다.
- 자원 제공: APK assets를 `https://appassets.androidplatform.net/` 주소로 내어 줍니다(`AssetServer`). `file://` 접근은 열지 않으며, 그 밖의 주소는 모두 차단합니다. 따라서 INTERNET 권한이 없습니다.
- WebView 설정: 파일·콘텐츠 접근 차단, 확대 비활성, 글자 크기 100% 고정, 원격 디버깅은 debug 빌드에서만 켭니다.
- 생명주기: 화면에서 사라지면 WebView 타이머를 멈추고(주행 시뮬레이션 포함), 창 크기·방향이 바뀌어도 WebView를 다시 만들지 않습니다. 렌더러가 비정상 종료되면 WebView를 새로 만듭니다.

## 5. 제약과 주의사항

- 목업입니다. 차량 데이터(Pleos Vehicle SDK, AAOS Car API), 유가 API, 내비게이션 연동은 없습니다. 주행 상태도 시연 버튼으로만 바뀝니다.
- `distractionOptimized`를 선언하지 않았습니다. 에뮬레이터가 주행 규제 상태이면 앱이 가려지므로, 시연은 정차 상태에서 합니다.
- portrait(한 window) 전용 화면은 아직 없습니다. landscape 화면을 줄여서 보여 줍니다.
- release 서명 설정이 없습니다. 공모전 GitHub 가산점 요건의 `apk/팀명_앱이름_release.apk`는 정식 서명 키를 정한 뒤 별도로 만들어야 합니다.
- 달력 요일은 2025년 배치(11월 9일 일요일)를 따릅니다.

## 6. 사용한 오픈소스

| 이름 | 버전 | 라이선스 | 위치 |
|---|---|---|---|
| React, ReactDOM | 18.3.1 | MIT | `web/vendor/LICENSE-react*.txt` |
| htm | 3.1.1 | Apache-2.0 | `web/vendor/LICENSE-htm.txt` |
| Asta Sans | 1.000 | SIL Open Font License 1.1 | `web/vendor/fonts/OFL.txt` |

`web/assets/img/`의 이미지는 Pleos Connect 에뮬레이터 화면을 캡처한 것으로, 브라우저 프리뷰에서 OS 화면을 보여 주는 용도로만 씁니다.
