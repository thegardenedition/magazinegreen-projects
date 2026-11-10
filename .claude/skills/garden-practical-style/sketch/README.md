# 손스케치 단면도 도구 (기획 AU 그림 1 기준)

- `make_sketch_example.py` — 손스케치 풍 단면상세도 SVG 생성 예시. 좌표·재료·주석만 바꿔 다음 기사에 재사용한다.
  `python3 make_sketch_example.py out.svg`
- `render_sketch.js` — SVG를 손글씨 글꼴로 2.5배 PNG 렌더. 같은 폴더의 `fonts/`에서 글꼴을 읽는다.
  `node render_sketch.js out.svg out.png` (Playwright 필요. 실행 폴더에 node_modules 연결)

글꼴은 저장소에 넣지 않는다(용량). 컨테이너마다 Google Fonts에서 받는다(OFL):

```bash
mkdir -p fonts && cd fonts
curl -sS "https://fonts.googleapis.com/css2?family=Nanum+Pen+Script" | grep -o "https://[^)]*" | xargs -I{} curl -sS -o NanumPenScript-Regular.ttf {}
```

(`render_sketch.js`가 Gaegu도 등록하지만 현재 예시는 Nanum Pen Script만 쓴다. Gaegu가 없어도 렌더된다.)
