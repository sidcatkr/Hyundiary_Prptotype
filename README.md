# Hyundiary

주유할 때마다 똑똑해지는 나만의 자동차 가계부

## 1. 앱 이름 및 한 줄 소개

- 팀명: 한건
- 앱 이름: Hyundiary (패키지 `com.hyundiary.mockup`, 에뮬레이터 앱 목록에 표시되는 이름도 Hyundiary)
- 한 줄 소개: 주유를 자동으로 가계부에 기록하고, 경로 위 주유소 추천, 소비 습관 분석, 안전 운전 기록, 승차감 기록을 차량 화면에서 보여 주는 Pleos Connect 앱의 프로토타입입니다.

이 저장소의 앱은 화면은 목업이고 내부 코드는 실제 차량 API에 연결된 프로토타입입니다.

- 화면: 모든 수치와 주유소는 예시 값입니다. 기본 상태인 "시연" 모드에서는 앱 안의 시연 버튼으로 주행·정차 상태를 바꿉니다.
- 내부 코드: AAOS Car API와 Pleos Connect SDK(Vehicle, NaviHelper, TextToSpeech, FusedLocation)를 호출합니다. 설정에서 "차량" 모드를 고르면 연료량 변화로 주유를 감지하고, 기어로 주행 시작·종료를 판단하고, 안전 운전 기록을 남기고, 주유소를 내비게이션 경유지로 넣고, 차속·조향각으로 흔들림을 계산해 승차감 점수를 매깁니다(7.2절, 7.4절).
- 유가 정보(오피넷)와 주유소 검색은 아직 연동하지 않았습니다. 차량 모드에서도 단가와 주유소는 예시 값을 씁니다.

## 2. APK 파일 위치

- `apk/한건_Hyundiary_release.apk` (release 빌드, APK Signature Scheme v3 서명. minSdk 28이라 v2 서명은 넣지 않습니다)

## 3. 실행 방법

### 3.1 APK 설치와 실행

Pleos Connect 에뮬레이터를 완전히 부팅한 뒤 다음을 실행합니다.

```bash
adb install -r apk/한건_Hyundiary_release.apk
adb shell am start --user 10 -n com.hyundiary.mockup/.MainActivity
```

- Pleos Connect 에뮬레이터는 사용자 10으로 동작하므로, 터미널에서 실행할 때 `--user 10`을 붙입니다.
- 에뮬레이터 앱 목록의 Hyundiary 아이콘으로 실행해도 됩니다.
- 앱은 landscape 앱 창(두 window를 합친 영역)으로 열립니다.

### 3.2 시연 방법

- 앱 창 오른쪽 위의 "시연" 버튼을 누르면 시연 패널이 열립니다. 발표자만 쓰는 조작입니다.
- 기본 흐름: ① 주행 시작 → ② 주유 제안 받기 → ③ 주유 후 정차(주유 기록 팝업) → ④ 주행 종료
- 다른 상황: 주행 중 안전 기록, 경로 없이 주행, 유가 정보 없는 주유, 소모품 경고, 전기차 전환, 충전 후 정차, 처음부터
- 승차감: 승차감 기록 주행 → 흔들림·큰 흔들림(주행 화면은 바뀌지 않음) → 주행 종료(주행 종료 팝업에 승차감 점수). 메뉴 "승차감"에서 판정 기준, 최근 주행, 11월 점수(100 km당 환산), 월별 점수와 연비를 봅니다.
- 정차 중에는 화면을 직접 눌러 가계부 달력, 통계의 소비 습관, 주유소 정렬, 안전 운전 기록을 볼 수 있습니다.
- 뒤로 가기(CCP 포함)는 영상, 팝업, 하위 화면 순으로 닫고, 홈에서는 앱을 뒤로 보냅니다(`moveTaskToBack`).

### 3.3 차량 데이터 모드

- 처음 실행하면 차속·연료·위치 권한을 묻습니다. 허용해야 해당 값을 받습니다.
- 설정 > 화면 데이터에서 "차량"을 고르면 화면이 차량 값으로 움직입니다. 설정 > 연결에서 연동 대상별 상태(연결됨, 권한 필요, 지원 안 함, 응답 없음)와 차량에서 받은 값을 확인할 수 있습니다.
- 에뮬레이터에서 확인하는 방법(Virtual Console, `adb forward tcp:8088 tcp:8088`)
  - 충전 감지(전기차): 시연 패널에서 "전기차로 전환"을 누르고, 기어 P에서 배터리 잔량을 5% 넘게 올립니다. 5분 동안 그대로이면 "충전을 기록할까요?" 팝업이 뜨고, 그 전에 출발하면 정차한 뒤에 뜹니다. "기록"을 누르면 실제 충전량과 금액이 가계부와 홈에 남습니다.
  - 주유 감지(내연기관차): 감지 방식은 충전과 같으며(기어 P에서 연료가 5%p 넘게 늘고 10초 동안 그대로이면 1건), 주유량은 연료량 변화와 탱크 용량으로 계산합니다. 이 에뮬레이터는 Virtual Console에 연료량 조절이 없고 user 빌드라 `cmd car_service inject-vhal-event`도 거부되어 연료량을 바꿀 수 없습니다. 그래서 주유 감지는 단위 테스트와 브라우저 점검(`npm test`)으로 확인했습니다.
  - 주행 시작·종료: 기어를 P에서 D로 바꾸면 주행 화면, 다시 P로 바꾸면 이번 주행의 실제 거리·시간·안전 기록으로 주행 종료 팝업이 뜹니다. 움직이지 않았으면(0.1 km 미만) 팝업을 띄우지 않습니다.
  - 주행 중 기록: 차속을 올리면 주행 거리가 쌓이고, 급감속·제한속도 초과·깜빡이 없는 차로 변경·안전벨트 미착용을 기록합니다. 주행가능거리가 남은 경로보다 짧아지면 주유 추천을 띄우고 음성으로 알립니다.
  - 승차감 기록: 메뉴 "승차감"에서 승차감 기록을 켭니다. 운전석 안전벨트를 맨 상태로 P에서 D로 바꾸면 기록을 시작하고, 급감속(차속)이나 차속이 있을 때 핸들을 크게 돌리면 흔들림·큰 흔들림을 판정합니다. 주행 중에는 화면을 바꾸지 않고 큰 흔들림만 음성으로 알립니다. P로 돌아오면 주행 종료 팝업에 승차감 점수가 들어갑니다.
    - 이 에뮬레이터는 Virtual Console에 안전벨트 조절이 없고(운전석 벨트 기본값 미착용) user 빌드라 VHAL 주입도 거부되어, 차량 모드에서는 "안전벨트를 매 주세요" 안내 음성과 주행 종료 팝업의 "안전벨트를 매지 않아 기록하지 않았습니다"까지 확인할 수 있습니다. 흔들림 판정과 점수는 시연 모드와 단위 테스트(`CoffeeCupTest`)로 확인합니다.
- 주행 규제(CarUxRestrictions)가 켜지면 시연 모드여도 입력 없는 주행 화면으로 바뀌고, 팝업·영상·입력 화면을 막습니다. 규제가 풀리면 정차 화면으로 돌아옵니다.

### 3.4 소스에서 빌드

```bash
cd android
./gradlew assembleRelease     # release APK: app/build/outputs/apk/release/
./gradlew installDebug        # debug 빌드를 에뮬레이터에 바로 설치
./gradlew testDebugUnitTest   # 판단 로직 단위 테스트
```

- JDK 17로 빌드합니다. Android Studio에 내장된 최신 JBR(Java 25)은 Gradle 8.10.2가 지원하지 않으므로, Android Studio에서는 Settings > Build, Execution, Deployment > Build Tools > Gradle > Gradle JDK를 17로 지정하고, 터미널에서는 `JAVA_HOME`을 JDK 17로 지정합니다.
- 터미널에서만 빌드할 때는 `ANDROID_HOME`을 지정하거나 `android/local.properties`에 `sdk.dir`을 적습니다. Android Studio로 열면 자동으로 만들어집니다.
- Pleos Connect SDK는 Pleos Maven 저장소(`https://nexus-playground.pleos.ai/repository/maven-releases/`)에서 받습니다. 처음 빌드할 때 인터넷 연결이 필요합니다.
- AAOS Car API는 Android SDK의 `platforms/android-35/optional/android.car.jar`를 씁니다(`useLibrary 'android.car'`).
- release 서명 키는 저장소에 포함하지 않습니다. `android/keystore.properties`(Git 제외 대상)에 아래 항목을 적으면 release 빌드가 그 키로 서명되고, 파일이 없으면 서명되지 않은 APK가 만들어집니다.

```properties
storeFile=/절대/경로/hyundiary-release.jks
storePassword=...
keyAlias=hyundiary
keyPassword=...
```

- `web/` 폴더가 그대로 APK assets로 들어갑니다. 웹 소스를 고친 뒤 다시 빌드하면 반영됩니다.

### 3.5 브라우저 프리뷰(참고)

같은 화면을 Pleos OS 화면(1920×1080) 안에 넣어 브라우저에서 볼 수 있습니다.

- `dist/hyundiary-preview.html`을 브라우저로 엽니다(인터넷 불필요).
- 소스를 고치면서 보려면 Node.js 18 이상에서 `npm start`를 실행하고 `http://127.0.0.1:5173/`(OS 화면 포함) 또는 `/app.html`(앱 창만)을 엽니다.
- 브라우저에는 차량 연동이 없으므로 시연 모드로만 동작합니다.
- 단일 파일 다시 만들기: `npm run build`. 동작 확인: `npm install`, `npx playwright install chromium` 후 `npm test`. 차량 모드 흐름은 앱 브리지를 흉내 내어 함께 점검합니다.

## 4. 테스트 환경 및 필요한 설정

### 4.1 테스트 환경

| 항목 | 내용 |
|---|---|
| 개발·테스트 PC | MacBook Pro (macOS) |
| IDE | Android Studio |
| JDK | Eclipse Temurin 17 |
| 빌드 도구 | Android Gradle Plugin 8.8.2, Kotlin 2.0.21, Gradle 8.10.2(wrapper 포함) |
| Android SDK | compileSdk 35, targetSdk 35, minSdk 28 |
| 언어 | Kotlin(차량 연동·판단 로직), Java 17(앱 셸), JavaScript(React 18.3.1 + htm 3.1.1, 화면) |
| 차량 API | AAOS Car API(`android.car`), Pleos Vehicle 2.3.2, NaviHelper 3.0.5, TextToSpeech 3.3.1, FusedLocation 1.1.3 |
| 실행 환경 | Pleos Connect 에뮬레이터 v2.1.0(5장 참고) |
| WebView | 에뮬레이터 내장 `ai.pleos.android.webview` 131.0.6752.0 |

### 4.2 필요한 설정

- 권한: 실제로 호출하는 API의 권한만 선언합니다(7.3절). 차속(`android.car.permission.CAR_SPEED`), 연료(`android.car.permission.CAR_ENERGY`), 위치(`pleos.car.permission.FUSED_LOCATION`)는 처음 실행할 때 사용자 동의를 받습니다.
- 네트워크: 실행 중에는 필요 없습니다. 화면 자원은 모두 APK 안에 있고, 음성 안내(TextToSpeech)는 ON_DEVICE 모드라 INTERNET 권한을 두지 않습니다. 에뮬레이터에서 INTERNET 권한 없이 음성 안내가 나오는 것을 확인했습니다(첫 문장은 음성 엔진 준비로 약 14초 걸립니다).
- 로그인, 계정, Pleos 앱 등록 정보(Client ID/Secret): 필요 없습니다.
- 차량 상태: 정차·주행 모두 실행할 수 있습니다. `distractionOptimized`를 선언했으며, 주행 규제 중에는 화면이 주행 화면으로 바뀝니다.
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
| `android/` | 에뮬레이터 앱(Android Gradle 프로젝트, Kotlin·Java) |
| `android/.../mockup/car/` | 차량 연동: `VehicleHub`(중심), `CarApiSource`, `PleosVehicleSource`, `NaviSource`, `VoiceGuide`, `VoiceCommand`, `LocationSource`, `CupSound` |
| `android/.../mockup/logic/` | 판단 로직: 주유·충전 감지, 주행 시작·종료, 안전 운전 기록, 주유 제안, 승차감 판정(단위 테스트는 `android/app/src/test/`) |
| `android/.../mockup/NativeBridge.kt` | 웹 화면과 앱 사이의 브리지(`window.HyundiaryNative`) |
| `web/app.html` | 앱 화면 진입점(앱 창만, 시연 버튼 포함) |
| `web/index.html` | 브라우저 프리뷰 진입점(OS 화면 포함) |
| `web/src/app.js` | 화면과 동작 전체(React 18 + htm, 빌드 단계 없음) |
| `web/src/native.js` | 차량 연동 계층(`window.HyVehicle`). 브라우저에서는 연동 없이 시연 모드로 동작 |
| `web/src/style.css` | 스타일(Pleos OS 라이트 테마 기준) |
| `web/src/icons.js` | Pleos 아이콘 경로 모음 |
| `web/assets/img/` | 브라우저 프리뷰용 OS 화면 캡처(에뮬레이터 화면) |
| `web/vendor/` | React, ReactDOM, htm, Asta Sans 폰트(오프라인 실행용) |
| `dist/hyundiary-preview.html` | 브라우저 프리뷰 단일 파일 |
| `tools/` | 로컬 서버, 단일 파일 빌드, 동작 확인 스크립트 |

## 7. 구현 메모

### 7.1 앱 셸

- 화면 맞춤: 1280×907 화면을 앱 창에 맞춰 가운데 정렬합니다. 창 크기나 방향이 바뀌어도 WebView를 다시 만들지 않습니다(`configChanges`).
- 자원 제공: APK assets를 `https://appassets.androidplatform.net/` 주소로 내어 줍니다(`AssetServer`). `file://` 접근은 열지 않으며, 그 밖의 주소는 모두 차단합니다.
- WebView 보안: 파일·콘텐츠 접근 차단, 혼합 콘텐츠 차단, 앱 밖 주소로 이동 차단, 원격 디버깅은 debug 빌드에서만 켭니다. release 빌드는 `debuggable false`입니다.
- 생명주기: 화면에서 사라지면 WebView 타이머(주행 시뮬레이션 포함)를 멈추고, 렌더러가 비정상 종료되면 WebView를 새로 만듭니다. 차량 연동은 Activity가 살아 있는 동안 계속 값을 받습니다.

### 7.2 차량 연동 구조

```
AAOS Car API ─┐
Pleos Vehicle ─┤
NaviHelper ────┼─> VehicleHub ─ 판단 로직(logic/) ─> 이벤트(JSON) ─> window.HyVehicle ─> 화면 상태
TextToSpeech <─┤        ^                                                    │
FusedLocation ─┘        └── NativeBridge(경유지 추가, 음성 안내, 승차감 기록 켜기) <─┘
```

| 화면 기능 | 사용하는 API | 판단 |
|---|---|---|
| 연료 %, 주행가능거리 | Car API `FUEL_LEVEL`, `INFO_FUEL_CAPACITY`, `RANGE_REMAINING` | 주행가능거리가 0 이하로 오면 연료량 × 연비(12.4 km/L)로 추정 |
| 주유 자동 기록 | 위 연료 값, NaviHelper `getCurrentLocationInfo`(주소), FusedLocation(위치) | 기어 P에서 연료가 5%p 넘게 늘고 10초 동안 더 늘지 않거나 출발하면 주유 1건. 주유량 = 늘어난 % × 탱크 용량 |
| 충전 기록(전기차) | Vehicle `EvBattery` 잔량, Car API `INFO_EV_BATTERY_CAPACITY` | 정차 중 잔량이 5%p 넘게 늘고 5분 동안 그대로이거나 출발하면 충전 1건 |
| 주행 시작·종료, 주행 거리 | Car API `GEAR_SELECTION`, `PERF_VEHICLE_SPEED`, Vehicle `Odometer` | P가 아니면 주행, P로 돌아오면 종료. 거리는 누적 주행거리 차이, 누적 주행거리가 움직이지 않으면 차속 적분 |
| 주유 추천·음성 안내 | NaviHelper 목적지·남은 거리, TextToSpeech(ON_DEVICE) | 주행가능거리 < 남은 거리 + 50 km(경로 없으면 100 km)면 주유 추천을 띄우고 한 문장으로 안내 |
| 경유지 추가 | NaviHelper `addWaypoint` | 추천 주유소를 첫 번째 경유지로 넣음 |
| 안전 운전 기록 | 차속, NaviHelper 제한속도, Vehicle `TurnSignal`·`SteeringWheel`·운전석 안전벨트 | 급감속(2초에 30 km/h 넘게), 제한속도 +10 km/h 3초 넘게, 40 km/h 이상에서 깜빡이 없이 핸들을 6° 넘게 0.8~5초 돌렸다 되돌림, 벨트 없이 10 km/h 이상 5초 |
| 주행 중 화면 제한 | Car API `CarUxRestrictionsManager` | 규제 중에는 주행 화면만 보이고 팝업·영상·입력을 막음 |
| 승차감 기록 | 차속, Vehicle `SteeringWheel`·`TurnSignal`·운전석 안전벨트·`DrivingMode`, TextToSpeech | 7.4절 |

- 모든 SDK 콜백은 메인 스레드로 옮겨 처리하고, Vehicle SDK 조회에는 8초 타임아웃을 둡니다(binder 오류 때 콜백이 오지 않을 수 있음. 에뮬레이터의 첫 조회는 3초를 넘기기도 함).
- 연동 대상 하나가 실패해도 나머지는 계속 동작하며, 실패한 기능은 설정 > 연결에 상태로 표시합니다. 차량 API가 없는 기기에서는 시연 모드로만 동작합니다.
- 판단 로직(`logic/`)은 Android에 의존하지 않는 Kotlin 코드이며 단위 테스트로 기준을 검증합니다.

### 7.3 선언한 권한

| 권한 | 용도 | 동의 |
|---|---|---|
| `android.car.permission.CAR_ENERGY` | `FUEL_LEVEL`, `RANGE_REMAINING` | 실행 중 |
| `android.car.permission.CAR_SPEED` | `PERF_VEHICLE_SPEED` | 실행 중 |
| `android.car.permission.CAR_INFO` | 탱크·배터리 용량 | 설치 시 |
| `android.car.permission.CAR_POWERTRAIN` | `GEAR_SELECTION` | 설치 시 |
| `pleos.car.permission.CAR_DRIVE` | Odometer, SteeringWheel, DrivingMode | 설치 시 |
| `pleos.car.permission.CAR_ENERGY` | EvBattery | 설치 시 |
| `pleos.car.permission.CAR_LIGHTS` | TurnSignal | 설치 시 |
| `pleos.car.permission.CAR_SEATS` | 안전벨트 | 설치 시 |
| `pleos.car.permission.NAVI_ROUTE` | 목적지·주행 정보, 현재 위치 주소 | 설치 시 |
| `pleos.car.permission.NAVI_ROUTE_SEARCH` | 경유지 추가 | 설치 시 |
| `pleos.car.permission.TTS_SERVICE` | 음성 안내 | 설치 시 |
| `pleos.car.permission.FUSED_LOCATION` | 현재 위치 | 실행 중 |

TextToSpeech SDK가 합쳐 넣는 `android.permission.INTERNET`은 매니페스트에서 뺍니다(`tools:node="remove"`). ON_DEVICE 모드로 쓰며, 에뮬레이터에서 INTERNET 권한 없이 음성 안내가 나오고 빌드된 APK의 합쳐진 매니페스트에 INTERNET 권한이 없음을 확인했습니다.

Vehicle SDK의 경고등(`Safety` Telltales)은 쓰지 않습니다. 에뮬레이터에서 `CAR_SAFETY`만으로는 조회가 거부되어 `PRIVATE_CAR_SAFETY` 권한이 필요했고, 경고등 종류에 와셔액이 없어 소모품 화면에 쓸 수 없었습니다. 쓰지 않는 권한을 두지 않기 위해 `CAR_SAFETY`도 선언하지 않습니다.

### 7.4 승차감 기록

동승자가 느끼는 흔들림을 차량 데이터로 계산해 주행마다 승차감 점수(100점에서 감점)를 남깁니다. 계산 모델은 운전석 옆에 가득 찬 커피잔이 있다고 보고 커피가 얼마나 흔들리는지 보는 방식이며, 이 모델은 로직(`logic/CoffeeCup.kt`, 단위 테스트 `CoffeeCupTest`)에만 있습니다. 화면에는 커피잔 그림이나 효과음 없이 점수와 횟수만 보이고, 웹 시연 모드도 같은 기준을 씁니다.

| 항목 | 기준 |
|---|---|
| 흔들림(g) | 앞뒤: 차속 변화율(0.8초 구간). 좌우: 차속² × tan(조향각 ÷ 조향비 15) ÷ 축거 2.9 m. 두 값을 합친 크기 |
| 흔들림 | 0.25 g를 넘었다가 0.15 g 아래로 0.5초 내려오면 1회, −2점 |
| 큰 흔들림 | 0.4 g를 넘으면 바로 1회, −10점. 한 문장 음성 안내(1분에 한 번까지) |
| 깜빡이 없이 차로 변경 | 안전 운전 기록과 같은 판단, −5점 |
| 정속 주행 보너스 | 30 km/h 이상에서 흔들림 0.05 g 아래로 1분, +1점. 주행 모드를 알려 주는 차는 에코 모드일 때만 셉니다 |
| 시작 조건 | 승차감 기록을 켜고 주행을 시작할 때. 운전석 안전벨트를 안 맸으면 맬 때까지 기다리고 음성으로 알립니다(벨트 상태를 모르는 차는 바로 시작) |
| 주행 중 화면 | 바꾸지 않습니다. 결과는 P로 돌아온 뒤 주행 종료 팝업과 승차감 화면에서 봅니다. 1시간마다 쉬어 가기를 음성으로 권합니다 |
| 월 점수 | 100 − (감점 − 보너스) × 100 ÷ 주행 km. 20 km 미만이면 계산하지 않습니다 |

에뮬레이터에서 확인한 API 제약과 대체 경로는 다음과 같습니다.

- Vehicle `Brake`(`registerBrakePedalStatus`)는 밟았는지 여부(Boolean)만 줍니다. 세기를 알 수 없어 흔들림 계산에는 차속 변화율을 씁니다.
- Vehicle `DrivingMode`는 이 에뮬레이터에 없습니다(`ERROR_NOT_SUPPORTED_PROPERTY`). 값이 없으면 정속만으로 보너스를 셉니다.
- Vehicle `Safety.hasSeatBeltNotBuckledWarning`은 이 에뮬레이터에 없습니다. 안전벨트는 `Seat.registerSeatBeltBuckledState`(운전석)로 받습니다.
- Vehicle `Odometer`의 Trip 거리·시간은 이 에뮬레이터에 없습니다. 주행 거리는 차속 적분, 시간은 앱이 잽니다.
- 조향각 범위는 −470°~500°이며, 이 에뮬레이터는 좌우 부호가 반대입니다. 흔들림은 크기만 쓰므로 영향이 없습니다.

## 8. 제약과 주의사항

- 화면은 목업입니다. 수치·주유소·단가는 예시 값이며, 유가 API(오피넷)와 주유소 검색은 연동하지 않았습니다. 차량 모드에서도 단가는 1,689원/L(충전 347원/kWh) 예시 값을 씁니다.
- 주유소 좌표는 경유지 추가를 보여 주기 위한 예시 좌표입니다.
- 연료 %는 Pleos Vehicle SDK `Fuel`이 에뮬레이터에서 값을 주지 않아 AAOS Car API(`FUEL_LEVEL`)로 받습니다. 에뮬레이터의 `RANGE_REMAINING`은 0이라 주행가능거리는 추정값입니다. 전기차 주행가능거리는 배터리 잔량 × 배터리 용량 × 전비(5.8 km/kWh)로 추정합니다.
- 에뮬레이터의 누적 주행거리는 0이라, 주행 거리는 차속을 적분해서 구합니다. 차량 모드 화면에는 차량이 보낸 누적 주행거리를 그대로 보여 줍니다.
- 소모품 화면의 와셔액 경고, 엔진오일 교환 시기, 안전 운전 점수, 월별 통계는 시연 값입니다. 차량 모드에서는 차량 신호가 없는 와셔액 경고를 표시하지 않습니다.
- 전기차 화면의 가계부 목록은 시연용 내연기관 기록을 함께 보여 줍니다. 차량 모드에서 기록한 충전은 목록 맨 위와 홈에 실제 값으로 들어갑니다.
- NaviHelper의 남은 거리 단위는 문서에 없어 미터로 처리했습니다.
- 차량 연동은 앱(Activity)이 실행 중일 때만 동작합니다. 앱이 꺼진 동안의 주유 감지는 포그라운드 서비스가 필요하며 아직 만들지 않았습니다.
- portrait(한 window) 전용 화면은 아직 없습니다. landscape 화면을 줄여서 보여 줍니다.
- 달력 요일은 2025년 배치(11월 9일 일요일)를 따릅니다.
- 승차감의 11월 9일 기록, 11월 누적 거리, 8~10월 점수와 연비는 시연 데이터입니다. 결제 내역 연동은 INTERNET 권한과 서버가 필요해 만들지 않았습니다. Pleos Connect SDK에는 결제 API가 없습니다.

## 9. 사용한 오픈소스

| 이름 | 버전 | 라이선스 | 위치 |
|---|---|---|---|
| React, ReactDOM | 18.3.1 | MIT | `web/vendor/LICENSE-react*.txt` |
| htm | 3.1.1 | Apache-2.0 | `web/vendor/LICENSE-htm.txt` |
| Asta Sans | 1.000 | SIL Open Font License 1.1 | `web/vendor/fonts/OFL.txt` |
| Kotlin 표준 라이브러리 | 2.0.21 | Apache-2.0 | Gradle 의존성 |

Pleos Connect SDK(Vehicle, NaviHelper, TextToSpeech, FusedLocation)는 Pleos Playground에서 배포하는 SDK로, 저장소에는 포함하지 않고 빌드할 때 Pleos Maven 저장소에서 받습니다.

`web/assets/img/`의 이미지는 Pleos Connect 에뮬레이터 화면을 캡처한 것으로, 브라우저 프리뷰에서 OS 화면을 보여 주는 용도로만 씁니다.
