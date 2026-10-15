---
name: claude-animation-base
description: Hand-painted 2D character animation in p5.js + p5.brush (watercolour fills, boiling linework, brush-wipe transitions), rendered headlessly to MP4. Starter kit by John Heibel built from the "I'm Upping My P(doom)" music video, tuned for Claude Opus. Use when the user wants a short handmade-looking animated video of a character (Clawd by default, or a swapped/new character) acting out a scene. Text-free by design — combine with a kinetic-type skill for titles.
---

# Claude Animation Base

Source: https://github.com/JohnHeibel/ClaudeAnimationBase (MIT, see LICENSE). This folder is the whole kit.

1. Read `ANIMATION_GUIDE.md` in this folder first — rules, workflow, full API.
2. Work in a copy: copy this folder to a project directory (e.g. `<name>/`), then `npm install` there. Never render inside `.claude/skills/`.
3. Put scenes in `src/scenes/`, storyboard first, build shot by shot, check contact sheets.
4. Render: `node render.mjs --clip --out=out/video.mp4` (needs Node, Chrome/Chromium, ffmpeg; on Linux it adds `--no-sandbox`; no GPU → `--soft-gl` or ask to avoid watercolour fills).
