# 또리의 방

폰과 웹에서 쓰는 로컬 우선 개인 비서입니다. 한 줄로 맡기면 일정, 할 일, 기억으로 정리하고 때가 되면 알려줍니다. 기록은 기기에 먼저 저장되고, 연결하면 Cloudflare(Workers + D1)로 동기화됩니다.

## Features

- 한 줄 입력 해석과 확인 카드
- 상황(시간, 비, 일정 수)에 따라 바뀌는 3D 방과 비서의 말
- 일정 알림과 아침 8시 보고 (Android)
- 비서 일기, 기억, 휴지통, 백업 내보내기와 가져오기
- 전화, 문자, 카카오톡 초안 (Android, 마지막은 사용자가 직접 누름)
- 홈 화면 위젯 (Android)
- 다른 앱에서 공유한 글을 일정이나 기억으로 받기 (Android)
- 온디바이스 AI 대화 (Android, 물음표로 끝나는 입력)

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
