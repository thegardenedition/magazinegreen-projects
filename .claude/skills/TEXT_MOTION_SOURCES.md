# 텍스트·키네틱 타이포그래피 모션 스킬 — 출처

| 스킬 폴더 | 출처 | 라이선스 |
|---|---|---|
| `kinetic-typography` | iart-ai/kinetic-typography-skills | MIT |
| `kinetic-typography-readable`(원래 이름 `kinetic-typography`에서 변경), `motion-storyboard`, `code-motion-build`, `ui-motion-design`, `seamless-motion-loop`, `motion-export-review` | Kyyzen0/claude-motion-design-skills | MIT |
| `animation-principles`, `after-effects`, `remotion-video`, `motion-art-direction`, `motion-background`, `beat-sync-editing`, `logo-animation`, `color-motion`, `shot-composition` | iart-ai/motion-design-skills | MIT |
| `motion-launch-videos`, `motion-captions`, `motion-overlays` + 같은 계열 9개(`motion-3d`, `-particles`, `-shapes`, `-charts`, `-globe`, `-ui`, `-photo`, `-pixel`, `-cartoon`) | Kimeur/motion-launch-videos | MIT |
| `apple-motion` | IskakovDamir/apple-motion | MIT |
| `html-animation`(HyperFrames 스킬과 이름이 겹쳐 `motion-graphics`에서 변경) | acelera-agency/html-animation | MIT |
| `bang-motion` | bangtutorial/bang-motion | MIT |
| `remotion-motion-graphics` | fernandokaraka/remotion-motion-graphics-skill | MIT |
| `kinetic-reel`, `painted-animation` | tuzhechen2005/opus-video-skills | MIT |
| `gsap-animation`, `react-animation`, `spring-animation` | notedit/happy-skills (`skills/video`) | MIT |
| `hyperframes-text-motion`(텍스트·자막·타이틀 효과 133종 오프라인 묶음) | heygen-com/hyperframes `registry/` | Apache 2.0 |
| `claude-animation-base`(도구 모음을 스킬로 감쌈, `SKILL.md`는 직접 작성) | JohnHeibel/ClaudeAnimationBase | MIT |

스크립트 검토 결과: ffmpeg·ffprobe, 화면 없는 Chrome(Linux에서는 `--no-sandbox`), 폰트 패키지 다운로드(`npm pack @fontsource/*`)만 실행합니다. 외부 코드를 받아 실행하거나 인증 정보에 접근하는 코드는 없고, 네트워크는 로컬 미리보기 서버(localhost)만 씁니다.

받지 않은 것:
- 독점 라이선스("모든 권리 보유"): imMamdouhaboammar/motion-graphics-skills
- 라이선스 없음: Eskapeum/animation-forge, ouerf-man/kinetic-editorial-skill, VasiniDevi/motion-skills
- 텍스트 전용 스킬 없음: calesthio/openmontage (AGPL)
- 다른 저장소들을 모아둔 목록일 뿐인 저장소: iart-ai/motion-skills
