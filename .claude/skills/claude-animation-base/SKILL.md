---
name: claude-animation-base
description: p5.js와 p5.brush로 손그림 느낌의 2D 캐릭터 애니메이션을 만들어 MP4로 렌더링하는 도구 모음. 수채 채색, 살아 움직이는 떨리는 선, 붓질 화면 전환이 특징이다. John Heibel이 뮤직비디오 "I'm Upping My P(doom)" 제작 경험으로 만들었고 Claude Opus에 맞춰져 있다. 캐릭터(기본은 Clawd, 다른 캐릭터로 교체 가능)가 장면을 연기하는 짧은 손그림 애니메이션 영상이 필요할 때 사용한다. 원작자 규칙상 화면에 글자를 넣지 않으므로, 제목이 필요하면 텍스트 모션 스킬과 함께 쓴다. (hand-painted animation, watercolor cartoon, character animation)
---

# Claude Animation Base

출처: https://github.com/JohnHeibel/ClaudeAnimationBase (MIT, `LICENSE` 참고). 이 폴더에 도구 모음 전체가 들어 있습니다.

1. 먼저 이 폴더의 `ANIMATION_GUIDE.md`를 읽습니다. 규칙, 작업 순서, 전체 API가 들어 있습니다.
2. 작업은 복사본에서 합니다. 이 폴더를 프로젝트 폴더(예: `<이름>/`)로 복사한 뒤 그 안에서 `npm install`을 실행합니다. `.claude/skills/` 안에서 직접 렌더링하지 않습니다.
3. 장면은 `src/scenes/`에 만듭니다. 스토리보드를 먼저 짜고, 컷 단위로 만들고, 컨택트 시트(장면 미리보기 모음)로 결과를 확인합니다.
4. 렌더링: `node render.mjs --clip --out=out/video.mp4`
   - Node, Chrome 또는 Chromium, ffmpeg가 필요합니다.
   - Linux에서는 자동으로 `--no-sandbox`를 붙입니다.
   - GPU가 없으면 `--soft-gl`을 쓰거나, 느린 수채 채색 대신 다른 표현을 쓰도록 요청합니다.
