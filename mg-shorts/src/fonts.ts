import { continueRender, delayRender, staticFile } from 'remotion';

/**
 * 폰트는 전부 public/fonts 의 로컬 파일. 렌더 서버가 CDN 에 닿지 못해도 결과가 같아야 한다(결정성).
 * delayRender 로 폰트가 다 읽힐 때까지 프레임 캡처를 막는다. 안 막으면 첫 몇 프레임이 대체 서체로 찍힌다.
 */
const FACES: [family: string, file: string, weight: string][] = [
  ['MG Serif', 'noto-serif-kr-korean-400-normal.woff2', '400'],
  ['MG Serif', 'noto-serif-kr-korean-700-normal.woff2', '700'],
  ['MG Serif', 'noto-serif-kr-korean-900-normal.woff2', '900'],
  ['MG Sans', 'Pretendard-Regular.woff2', '400'],
  ['MG Sans', 'Pretendard-Medium.woff2', '500'],
  ['MG Sans', 'Pretendard-SemiBold.woff2', '600'],
  ['MG Sans', 'Pretendard-Bold.woff2', '700'],
  ['Story Serif', 'gowun-batang-korean-400-normal.woff2', '400'],
  ['Story Serif', 'gowun-batang-korean-700-normal.woff2', '700'],
  ['Story Hand', 'gaegu-korean-400-normal.woff2', '400'],
  ['Story Hand', 'gaegu-korean-700-normal.woff2', '700'],
];

let started = false;
export function loadFonts() {
  if (started || typeof document === 'undefined') return;
  started = true;
  const handle = delayRender('MG fonts');
  Promise.all(
    FACES.map(([family, file, weight]) => {
      const face = new FontFace(family, `url(${staticFile(`fonts/${file}`)}) format('woff2')`, { weight });
      (document.fonts as unknown as { add: (f: FontFace) => void }).add(face);
      return face.load();
    }),
  )
    .then(() => continueRender(handle))
    .catch((err) => {
      console.error(err);
      continueRender(handle);
    });
}

export const SERIF = '"MG Serif", "Noto Serif KR", serif';
export const SANS = '"MG Sans", Pretendard, "Apple SD Gothic Neo", sans-serif';

export const STORY_SERIF = '"Story Serif", "Gowun Batang", "MG Serif", serif';
export const STORY_HAND = '"Story Hand", Gaegu, "Story Serif", cursive';
