# HyperFrames 스킬 — 출처

https://github.com/heygen-com/hyperframes 의 `skills/` 폴더(원본 커밋 0d6bdd4)에서 스킬 21개를 복사했습니다.
Apache 2.0 라이선스이며, 각 폴더에 `LICENSE.hyperframes`가 들어 있습니다.
스킬끼리 서로의 파일을 경로로 참조하므로 21개를 같은 폴더에 나란히 두어야 합니다.

가져오기 전 검토 결과:
- `media-use`는 익명 사용 통계를 PostHog로 보냅니다. 끄려면 환경변수 `HYPERFRAMES_NO_TELEMETRY=1` 또는 `DO_NOT_TRACK=1`을 설정합니다.
- 유료 API(Gemini·Google, ElevenLabs, HeyGen)는 환경변수에 넣은 키만 읽어 각 서비스로만 보냅니다: `GEMINI_API_KEY` / `GOOGLE_API_KEY`, `ELEVENLABS_API_KEY`, `HEYGEN_API_KEY`.
- 보조 npm 설치는 설치 스크립트를 끈 채(`--ignore-scripts`) 임시 폴더에서만 실행됩니다. 파일 삭제는 스킬이 직접 만든 작업·임시 폴더로 한정됩니다.
