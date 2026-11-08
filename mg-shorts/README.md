# mg-shorts — 매거진그린 쇼츠 텍스트 모션 (Remotion)

코드로 만드는 9:16 쇼츠. 작업 규칙은 `.claude/skills/video-motion/SKILL.md`(영상 모션 스킬)를 따른다.

## 들어 있는 것

| 컴포지션 | 내용 | 길이 |
|---|---|---|
| `Storybook` | 같은 이야기의 파스텔 수채 동화책판 — 멀티플레인 카메라로 꽃밭을 밀고 들어가 땅속 세 층으로 내려갔다가, 나비가 네 지면 간판을 건드리고, 나무가 사계절을 지나 자란 뒤 책장이 넘어가 제목을 쓴다 | 39초(1170프레임) |
| `LeafBlanket` | 정원 오락실 STAGE 2 · 12월 「낙엽 이불」 — 서릿발 위기 → 낙엽 기사단 출격(막기·콤보) → 보스 북풍 장군(탄막·분노) → 겨울 손님 → 미션. 적은 생물이 아니라 날씨 | 44초(1320프레임) |
| `ReelCover` · `ReelOutro` | 인스타그램 릴스 포장(매거진그린 문법): 3:4 그리드 안전 영역 커버, 브라운관 꺼짐 → 편집부 카드 3초. `--props='{"ep":1}'` 또는 2. 캡션은 `reels/instagram-captions.md` | 커버 1장 · 3초 |
| `Arcade` | 「구근의 모험」 — 튤립 구근의 한 해를 아케이드 스테이지로(심는 깊이 → 겨울 추위 → 개화 → 꽃 진 뒤 잎 → 새끼 구근). 픽셀 아트 + 브라운관 + 8비트 사운드 | 40초(1200프레임) |
| `Manifesto` | 매거진그린 브랜드 쇼츠 「왜 거기 있는지」 — 넘쳐나는 정원 사진 → 매거진그린은 이유를 묻는다 → 정원을 읽는 세 개의 층(생태·역사·책임) → 네 개의 지면 → 엔드 카드 | 36초(1080프레임) |

- `src/motion.tsx` — 모션 토큰(박자 격자 100 BPM = 18f/박, 이징, 스프링)과 프리미티브(`MaskLine` 어절 마스크 등장, `Fade`, `useCreep` 느린 확대)
- `src/arcade/engine.tsx` — 회차 공용 엔진(픽셀 버퍼·스프라이트·파티클·대화 상자·말풍선·브라운관). 새 회차는 이것과 회차별 타임라인 JSON 으로
- `src/Arcade.tsx`, `src/arcade/` — 픽셀 스프라이트, 이벤트 타임라인(timeline.json — 화면과 `scripts/chiptune.py`가 같이 읽는다)
- `src/story/kit.tsx` — 동화책 부품(팔레트, 시드 난수, 수채 필터, 물감 덩어리, 꽃, 나비)
- `src/fonts.ts` — 로컬 폰트 로딩(Noto Serif KR, Pretendard, 고운바탕, 개구, 갈무리, Press Start 2P — 모두 OFL, `public/fonts/LICENSE-*`)
- 무음이다. 100 BPM 곡을 깔면 장면 경계·단어 진입이 박에 떨어진다.

## 실행

```bash
cd mg-shorts
npm install
npx remotion studio                       # 미리보기
npx remotion still src/index.ts PaperTex public/paper.png   # 종이 질감 굽기(Storybook 렌더 전 한 번)
python3 scripts/chiptune.py                                # 8비트 사운드 만들기(Arcade 렌더 전 한 번) → public/arcade.wav
python3 scripts/chiptune_dec.py                            # 12월 회차 사운드 → public/leaf-blanket.wav
# 릴스 엔드 카드는 회차 마지막 프레임을 쓴다: ffmpeg -sseof -0.05 -i out/<회차>.mp4 -frames:v 1 -update 1 public/reel/last-ep<N>.png
npx remotion still src/index.ts Manifesto out/f.png --frame=300 --scale=0.5
npx remotion render src/index.ts Manifesto out/raw.mp4
# 납품 인코딩(Remotion 은 전체 범위 yuvj420p 로 나온다 → tv 범위 yuv420p)
ffmpeg -i out/raw.mp4 -vf "scale=in_range=full:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf 16 -profile:v high -level 4.2 \
  -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -movflags +faststart -an out/magazinegreen-brand-shorts.mp4
python3 ../.claude/skills/video-motion/scripts/qa_video.py out/magazinegreen-brand-shorts.mp4
```

Chrome 내려받기가 막힌 환경에서는 `REMOTION_CHROME=<headless shell 경로>`를 지정한다(`remotion.config.ts`).
Remotion 은 직원 4명 이상 회사의 상업 사용에 유료 라이선스가 필요하다.
