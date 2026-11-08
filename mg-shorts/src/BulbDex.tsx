import React, { useLayoutEffect, useRef } from 'react';
import { Audio, staticFile, useCurrentFrame } from 'remotion';
import { loadFonts } from './fonts';
import { C } from './arcade/sprites';
import { CRT, EN, FB, H, KR, S, U, W, center, dissolve, seg, spr } from './arcade/engine';
import TL from './arcade/dex.json';

loadFonts();

/* ---------------------------------------------------------------------------
 * 정원 오락실 1화 삽입 「PLANT DATA · 구근」 (6초 = 3마디 @120 BPM)
 * 1화의 타이틀(0~6s)과 STAGE 1 사이, 화면이 완전히 검은 마디 경계에 끼운다.
 *
 * 사실(감수 대상):
 *  - 구근은 양분을 저장한 짧은 땅속 줄기. 두툼한 비늘잎이 겹겹이 양분을 저장한다.
 *  - 튤립 구근 속에는 다음 봄에 필 꽃눈이 이미 만들어져 있다.
 *  - 씨앗은 작은 양분으로 시작해 자라면서 꽃눈을 만든다 / 구근은 저장 양분과 꽃눈으로 시작한다.
 *  - 늘어나는 법: 씨앗 / 새끼 구근.  양파·마늘도 구근(양파 단면 = 겹겹의 비늘잎).
 * 화면 전환: 시작 8f 검정에서 디졸브 인, 끝 10f 검정으로 디졸브 아웃 → 1화 경계와 맞물림.
 * ------------------------------------------------------------------------- */

/** 구근 단면: 겹겹의 비늘잎(양분), 가운데 꽃눈, 아래 바닥판과 뿌리 */
function crossSection(fb: FB, cx: number, cy: number, f: number) {
  const reveal = seg(f, 8, 22);
  const layers = 6;
  for (let i = 0; i < layers; i++) {
    const r = Math.round((34 - i * 5) * (0.6 + 0.4 * reveal));
    const col = i % 2 ? C.tan : '#f6d3a4';
    // 위쪽이 좁아지는 물방울 꼴: 원 + 위로 뾰족
    for (let y = -r - 10; y <= r; y++)
      for (let x = -r; x <= r; x++) {
        const ry = y < 0 ? y / (1 + (-y / r) * 0.5) : y;
        if (x * x + ry * ry * 1.0 <= r * r && Math.abs(x) <= r * (y < -r * 0.6 ? (r + y + 10) / (r * 0.4 + 10) : 1)) fb.px(cx + x, cy + y, U(col));
      }
  }
  // 바깥 껍질(얇은 갈색)
  for (let a = 0; a < 120; a++) {
    const t = (a / 120) * Math.PI * 2;
    fb.px(cx + Math.cos(t) * 35 * (0.6 + 0.4 * reveal), cy + Math.sin(t) * 35 * (0.6 + 0.4 * reveal), U(C.tanD));
  }
  // 바닥판과 뿌리
  fb.rect(cx - 14, cy + 30, 28, 4, U(C.tanD));
  for (let k = 0; k < 7; k++) fb.line(cx - 12 + k * 4, cy + 34, cx - 16 + k * 5.3, cy + 44 + (k % 2) * 3, U(C.root));
  // 가운데 꽃눈(초록 싹 + 분홍 꽃봉오리)
  if (f >= TL.labels[0] - 4) {
    fb.rect(cx - 1, cy - 6, 3, 30, U(C.green));
    fb.rect(cx - 3, cy - 12, 7, 7, U(C.pink));
    fb.rect(cx - 2, cy - 14, 5, 2, U(C.red));
  }
}

function draw(ctx: CanvasRenderingContext2D, f: number) {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, W, H);
  const fb = new FB(ctx);
  fb.grad(0, H, ['#0d0b2e', '#1d1648', '#2b1d4a']);
  // 도감 격자 배경
  for (let y = 0; y < H; y += 8) fb.rect(0, y, W, 1, U('#241a4e'));
  for (let x = 0; x < W; x += 8) fb.rect(x, 0, 1, H, U('#241a4e'));
  if (f < TL.vs) {
    crossSection(fb, 66, 150, f);
    // 이름표로 가는 지시선
    if (f >= TL.labels[0]) fb.line(70, 137, 112, 118, U(C.cream));
    if (f >= TL.labels[1]) fb.line(92, 152, 112, 150, U(C.cream));
    if (f >= TL.labels[2]) fb.line(76, 190, 112, 184, U(C.cream));
    fb.flush(ctx);
  } else {
    // VS: 씨앗 vs 구근
    const p = seg(f, TL.vs, TL.vs + 8);
    fb.flush(ctx);
    // 씨앗(갈색 알, 구근보다 훨씬 작게 — 크기 차이도 비교의 일부)
    const sd = new FB(ctx, ctx.getImageData(0, 0, W, H));
    for (let y = -5; y <= 5; y++) for (let x = -8; x <= 8; x++) if ((x * x) / 64 + (y * y) / 25 <= 1 * p) sd.px(46 + x, 126 + y, U(y > 2 ? C.soilD : C.tanD));
    sd.px(42, 123, U(C.tan));
    sd.px(43, 123, U(C.tan));
    sd.flush(ctx);
    spr(ctx, 'bulb', 132, 134, { sx: 2 * p, sy: 2 * p });
  }
  const d = f < 8 ? 1 - f / 8 : f >= TL.total - 10 ? (f - (TL.total - 10)) / 10 : 0;
  dissolve(ctx, d);
}

const Box: React.FC<{ y: number; children: React.ReactNode }> = ({ y, children }) => (
  <div style={{ position: 'absolute', left: 84, right: 84, top: y, padding: '22px 32px', background: C.ink, border: `6px solid ${C.cream}`, boxShadow: `0 0 0 6px ${C.ink}` }}>{children}</div>
);

export const BulbDex: React.FC = () => {
  const f = useCurrentFrame();
  const main = useRef<HTMLCanvasElement>(null);
  const glow = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    draw(main.current!.getContext('2d')!, f);
    const g = glow.current!.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    g.drawImage(main.current!, 0, 0);
  }, [f]);
  const vis = f >= 6 && f < TL.total - 8;
  const label = (i: number, text: string, y: number, col: string) =>
    f >= TL.labels[i] && f < TL.vs - 6 && <div key={text} style={{ ...KR(48, col), position: 'absolute', left: 114 * S, top: y * S - 30 }}>{text}</div>;
  const row = (i: number, k: string, a: string, b: string) =>
    f >= TL.rows[i] && (
      <div key={k} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'center', marginTop: 22, textAlign: 'center' }}>
        <div style={KR(40, C.cream)}>{a}</div>
        <div style={KR(36, C.ice)}>{k}</div>
        <div style={KR(40, C.yellow)}>{b}</div>
      </div>
    );
  return (
    <>
      <Audio src={staticFile('dex.wav')} />
      <CRT dx={0} dy={0} f={f} flash={0} main={main} glow={glow}>
        {vis && (
          <>
            <div style={{ ...center(300) }}>
              <div style={EN(36, C.ice)}>PLANT DATA · No.001</div>
              <div style={{ ...KR(84, C.yellow), marginTop: 18 }}>{f < TL.vs ? '구근' : '씨앗 VS 구근'}</div>
            </div>
            {label(0, '꽃눈', 118, C.pink)}
            {label(1, '양분을 저장한 잎', 150, C.cream)}
            {label(2, '뿌리', 184, C.root)}
            {f >= TL.caption && f < TL.vs - 4 && (
              <Box y={1236}>
                <div style={{ ...KR(56, C.cream), textShadow: 'none' }}>구근은 양분을 저장한</div>
                <div style={{ ...KR(56, C.yellow), textShadow: 'none' }}>짧은 땅속 줄기예요</div>
              </Box>
            )}
            {f >= TL.vs && (
              <>
                <div style={{ position: 'absolute', left: 84, right: 84, top: 830, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', textAlign: 'center' }}>
                  <div style={KR(54, C.cream)}>씨앗</div>
                  <div />
                  <div style={KR(54, C.yellow)}>구근</div>
                </div>
                <div style={{ position: 'absolute', left: 84, right: 84, top: 920 }}>
                  {row(0, '시작', '작은 양분', '저장한 양분')}
                  {row(1, '꽃눈', '자라며 만든다', '이미 들어 있다')}
                  {row(2, '늘어나기', '씨앗', '새끼 구근')}
                </div>
                {f >= TL.onion && (
                  <Box y={1236}>
                    <div style={{ ...KR(56, C.cream), textShadow: 'none' }}>양파와 마늘도 구근이에요</div>
                    <div style={{ ...KR(46, C.ice), textShadow: 'none', marginTop: 6 }}>자르면 겹겹이 쌓인 잎이 보여요</div>
                  </Box>
                )}
              </>
            )}
          </>
        )}
      </CRT>
    </>
  );
};
