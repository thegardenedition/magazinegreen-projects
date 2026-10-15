# HyperFrames skills — source

21 skills copied from https://github.com/heygen-com/hyperframes (`skills/`, commit 0d6bdd4), Apache License 2.0
(`LICENSE.hyperframes` in each folder). They reference each other by sibling paths, so keep them side by side.

Notes from review before import:
- `media-use` sends anonymous usage telemetry to PostHog. Opt out: `HYPERFRAMES_NO_TELEMETRY=1` or `DO_NOT_TRACK=1`.
- Optional paid APIs read keys from env only: GEMINI_API_KEY / GOOGLE_API_KEY, ELEVENLABS_API_KEY, HEYGEN_API_KEY.
- Helper npm installs run with `--ignore-scripts` in temp dirs. Deletes are limited to the skills' own work/temp folders.
