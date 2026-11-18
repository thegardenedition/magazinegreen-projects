# Higgsfield·3D 스킬 — 출처

| 폴더 | 출처 | 라이선스 | 비고 |
|---|---|---|---|
| `higgsfield-generate`, `-video-explainer`, `-product-photoshoot`, `-soul-id`, `-brandkit`, `-websites`, `-youtube-thumbnail`, `-marketplace-cards` | github.com/higgsfield-ai/skills (공식) | MIT | Higgsfield CLI로 동작합니다. CLI가 없으면 공식 `higgsfield-ai/cli` 설치 스크립트(`curl … \| sh`)로 설치합니다. |
| `higgsfield-prompt-suite/` (입구 스킬 + 하위 스킬 35개: 3D, 시네마, 카메라, Seedance, Soul, 모션 등) | github.com/OSideMedia/higgsfield-ai-prompt-skill | MIT | 하위 스킬을 상대 경로로 참조하므로 폴더 구조를 그대로 유지했습니다. 테스트·평가 파일은 뺐습니다. 프롬프트 작성 전용이며, 접속 주소는 mcp.higgsfield.ai입니다. |
| `creative-brief-grill` → `storyboard-builder` → `video-prompt-architect` 등 15개 | github.com/alew3/skills (higgsfield-seedance-video-suite) | MIT | 기획 인터뷰 → 캐릭터·스타일·장소 시트 → 스토리보드 → Seedance 프롬프트로 이어지는 제작 과정 |
| `threejs-*` (24개) | github.com/OpenAEC-Foundation/Three.js-Claude-Skill-Package | MIT | Three.js r160 이상, React Three Fiber, Drei, WebGPU |

가져오기 전 스크립트를 검토했습니다. 공식 Higgsfield CLI 설치 스크립트 외에는 외부 코드를 받아 실행하는 곳이 없고, 인증 정보에 접근하는 코드도 없습니다.

받지 않은 것:
- 라이선스 없음(재배포 불가): automatorsplus/higgsfield-skill, thecraighewitt/higgsfield-skills, Arnie936/higgsfield-website-skill, cloudai-x/threejs-skills
- 기능 중복(이미 연결된 Higgsfield MCP·공식 스킬로 대체 가능): Koushik890/higgsfield-skill(API 키 직접 사용), robonuggets/higgsfield-skill
