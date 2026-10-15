# Higgsfield & 3D skills — sources

| Folder(s) | Source | License | Notes |
|---|---|---|---|
| `higgsfield-generate`, `-video-explainer`, `-product-photoshoot`, `-soul-id`, `-brandkit`, `-websites`, `-youtube-thumbnail`, `-marketplace-cards` | github.com/higgsfield-ai/skills (official) | MIT | Use the Higgsfield CLI; skills install it via the official `higgsfield-ai/cli` install script if missing (`curl … \| sh`). |
| `higgsfield-prompt-suite/` (dispatcher + 35 sub-skills incl. `higgsfield-3d`, cinema, camera, seedance, soul, motion) | github.com/OSideMedia/higgsfield-ai-prompt-skill | MIT | Kept intact (relative paths); tests/evals omitted. Prompt-writing only; MCP endpoint mcp.higgsfield.ai. |
| `creative-brief-grill` → `storyboard-builder` → `video-prompt-architect` … (15) | github.com/alew3/skills (higgsfield-seedance-video-suite) | MIT | Brief → character/style/env sheets → storyboard → Seedance prompt pipeline. |
| `threejs-*` (24) | github.com/OpenAEC-Foundation/Three.js-Claude-Skill-Package | MIT | Three.js r160+, R3F, Drei, WebGPU. |

Reviewed scripts before import: no remote code execution beyond the official Higgsfield CLI installer, no credential access.
Not imported (no license): automatorsplus/higgsfield-skill, thecraighewitt/higgsfield-skills, Arnie936/higgsfield-website-skill, cloudai-x/threejs-skills.
Not imported (redundant with the connected Higgsfield MCP / official skills): Koushik890/higgsfield-skill (raw API key), robonuggets/higgsfield-skill.
