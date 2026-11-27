# Leaf

폰과 웹에서 쓰는 로컬 우선 개인 비서입니다. 일정, 할 일, 기억을 정리하고 또리와 이야기하며 때가 되면 알려줍니다. 기록은 기기에 먼저 저장되고, 연결하면 Cloudflare(Workers + D1)로 동기화됩니다.

## Features

- 한 줄 입력 해석과 확인 카드
- 말로 입력하기 (Android는 시스템 음성 입력, 웹은 지원하는 브라우저에서)
- 상황(시간, 비, 일정 수)에 따라 바뀌는 3D 방과 비서의 말
- 일정, 할 일, 기억 고치기와 반복(매일, 평일, 매주, 매월)
- 일정 알림, 할 일 알림(아침 8시, 저녁 6시), 아침 7시 보고 (Android)
- 비서 일기, 기억, 휴지통, 백업 내보내기와 가져오기
- 전화, 문자, 카카오톡 초안 (Android, 마지막은 사용자가 직접 누름)
- 친밀도에 따라 늘어나는 방의 물건과 편해지는 말투
- 홈 화면 위젯 (Android)
- 앱 설치 없이 화면만 자동 업데이트 (Android)
- 다른 앱에서 공유한 글을 일정이나 기억으로 받기 (Android)
- 묻는 말에 일정, 할 일, 기억에서 찾아 답하기
- 일정과 관련된 기억을 30분 전에 미리 알리기 (Android)
- 또리와 대화 (서버 연결 시 Cloudflare Workers AI. 일정·할 일·기억과 지난 대화를 함께 보냄. 대화는 7일 뒤 지움)
- 대화에 나온 약속과 할 일을 AI가 카드로 제안 (저장은 사용자가 직접 누름)
- 그날 대화를 담아 쓰는 비서 일기 (연결이 안 되면 정해진 글)
- 온디바이스 AI 대화 (Android, 연결이 안 될 때 직접 고르면)

## Requirements

- Node.js 24 이상
- JDK 21
- Android SDK 36
- Android NDK 29.0.13113456
- CMake 3.31.6
- ARM64, Android 13(API 33) 이상 기기
- Git LFS

모델 파일 `android/app/src/main/assets/models/qwen3-1.7b-q4.gguf`는 약 1.36GB이며 Git LFS로 관리합니다. 저장소를 복제한 뒤 `git lfs pull`로 모델을 받아야 합니다.

## Server

Worker 하나가 API, 웹 화면, 매일 새벽 3시(한국 시각) 백업을 맡습니다.

```powershell
npx wrangler login
npm run server:deploy                            # D1과 KV를 만들고 배포
npx wrangler d1 migrations apply DB --remote
npx wrangler secret put ACCESS_KEY               # 32자 이상의 무작위 값
```

배포 주소를 `.env`의 `VITE_SERVER_URL`에 넣고 폰 앱을 다시 빌드합니다. 비밀 키는 `.env`에 넣지 않고 폰과 웹의 "설정과 저장"에서 한 번씩 입력합니다. 키를 바꿀 때는 마지막 명령을 다시 실행합니다.

같은 기록을 여러 기기에서 고치면 나중에 고친 값이 남고, 서버에 있던 이전 값은 `record_history`에 보관됩니다. 백업은 30일 동안 보관하며 `GET /api/backups`로 목록을, `GET /api/backups/날짜`로 파일을 받아 앱의 "백업 가져오기"에 쓸 수 있습니다. 가져오기는 지금 기록보다 최근인 것과 없는 것만 되살립니다.

로컬에서는 `npx wrangler dev --var ACCESS_KEY:<32자 이상>`으로 서버를 띄우면 `npm run dev`가 연결합니다.

## Screen Update

`npm run server:deploy`는 웹 화면과 함께 폰 앱이 받을 서명된 화면 묶음을 올립니다. 폰 앱은 이를 내려받아 다음에 열 때 적용하고, 두 번 연속 열리지 않으면 이전 화면으로 돌아갑니다.

서명 키는 `~/.assistant/update-key.pem`에 있으며 저장소에 넣지 않습니다. 잃어버리면 새 키의 공개 키를 `WebBundles.kt`에 넣고 앱을 다시 설치해야 합니다. 네이티브 기능을 바꿔 새 화면이 옛 앱에서 돌 수 없게 되면 `AppUpdatePlugin.kt`의 `NATIVE_API`와 `scripts/release.mjs`의 `REQUIRES`를 함께 올립니다.

## Development

```powershell
npm install; npm run dev
npm test
```

프로덕션 웹 자산을 만들고 Android 프로젝트에 동기화합니다.

```powershell
npm run android:sync
```

## Android Package

```powershell
$env:JAVA_HOME=(Get-ChildItem 'C:\Program Files\Microsoft' -Directory -Filter 'jdk-21*' | Select-Object -First 1 -ExpandProperty FullName); Push-Location android; try { .\gradlew.bat assembleDebug } finally { Pop-Location }
```

생성된 APK는 `android/app/build/outputs/apk/debug/app-debug.apk`에 있습니다. 모델을 포함하면 약 1.4GB입니다.

화면과 알림만 시험할 때는 모델을 빼고 빌드합니다(약 64MB, AI 대화 불가). 모델 포함 여부를 바꿀 때는 아래의 clean 작업이 필요합니다.

```powershell
.\gradlew.bat :app:cleanPackageDebug :app:cleanMergeDebugAssets :app:cleanCompressDebugAssets :app:assembleDebug -PnoModel
```

## Architecture

```text
src/
  app/                     # 화면과 사용자 흐름
  features/assistant/      # 입력 해석, 비서의 말, 로컬 LLM 브리지
  features/recall/         # 기억 찾기
  features/room/           # 3D 방 (Three.js)
  features/records/        # IndexedDB 저장, 동기화, 백업
  features/notify/         # 로컬 알림
  features/device/         # 문자, 전화
  features/online/         # 날씨
server/                    # Worker API, D1 스키마, 백업
android/
  app/                     # Capacitor Android 앱과 네이티브 플러그인
  llama.cpp/               # bdcbaaf6 기반 Android 추론 빌드 필수 소스
```

패키지 ID는 `com.seony.assistant`입니다. 날씨와 동기화에만 인터넷을 사용합니다.

## Credits

- 날씨: [Open-Meteo](https://open-meteo.com/) (CC BY 4.0)
- 동네 이름: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
