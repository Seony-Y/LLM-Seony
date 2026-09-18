# LLM Seony

Galaxy S24+에서 실행되는 로컬 우선 Android 개인 비서입니다. React와 Capacitor로 화면을 구성하고, Android용 llama.cpp와 번들된 Qwen3 1.7B Q4 GGUF 모델로 기기 안에서 답변을 생성합니다. AI 대화에는 서버나 API 키가 필요하지 않습니다.

## Features

- 온디바이스 AI 대화
- 로컬 일정 저장 및 알림 예약
- 카메라 앱 열기
- 연락처 이름 또는 전화번호로 문자 작성 및 전화 다이얼러 열기
- 현재 위치 기반 Open-Meteo 날씨
- DuckDuckGo 브라우저 검색

문자 전송과 전화 발신은 자동으로 실행하지 않습니다. 앱이 시스템 작성 화면이나 다이얼러를 열면 사용자가 최종 확인합니다.

## Requirements

- Node.js 24 이상
- JDK 21
- Android SDK 36
- Android NDK 29.0.13113456
- CMake 3.31.6
- ARM64, Android 13(API 33) 이상 기기
- Git LFS

모델 파일 `android/app/src/main/assets/models/qwen3-1.7b-q4.gguf`는 약 1.36GB이며 Git LFS로 관리합니다. 저장소를 복제한 뒤 `git lfs pull`로 모델을 받아야 합니다.

## Development

```powershell
npm install; npm run dev
```

프로덕션 웹 자산을 만들고 Android 프로젝트에 동기화합니다.

```powershell
npm run android:sync
```

## Android Package

```powershell
$env:JAVA_HOME=(Get-ChildItem 'C:\Program Files\Microsoft' -Directory -Filter 'jdk-21*' | Select-Object -First 1 -ExpandProperty FullName); Push-Location android; try { .\gradlew.bat assembleDebug } finally { Pop-Location }
```

생성된 APK는 `android/app/build/outputs/apk/debug/app-debug.apk`에 있습니다. 모델을 포함하므로 APK 크기는 약 1.5GB입니다.

## Architecture

```text
src/
  app/                     # React 화면과 사용자 흐름
  features/assistant/      # Capacitor 로컬 LLM 브리지
  features/device/         # 카메라, 문자, 전화 명령
  features/online/         # 날씨와 브라우저 검색
  features/schedule/       # 일정 저장과 로컬 알림
android/
  app/                     # Capacitor Android 앱과 네이티브 플러그인
  llama.cpp/               # bdcbaaf6 기반 Android 추론 빌드 필수 소스
```

패키지 ID는 `com.seony.assistant`입니다. 날씨와 웹 검색만 인터넷을 사용하며 AI 추론과 일정 데이터는 기기 안에서 처리됩니다.
