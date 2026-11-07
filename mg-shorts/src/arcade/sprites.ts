/* ---------------------------------------------------------------------------
 * 「구근의 모험」 픽셀 스프라이트 — 전부 이 작업을 위해 새로 그린 원본 캐릭터.
 * 글자 한 칸 = 논리 픽셀 한 칸. '.' 은 투명.
 * 팔레트도 이 작품 고유(정원·흙·밤하늘 계열 18색).
 * ------------------------------------------------------------------------- */

export const C = {
  ink: '#140f24',
  cream: '#fff4e0',
  white: '#ffffff',
  tan: '#e8b07a',
  tanD: '#b9744a',
  hi: '#fff1d6',
  pink: '#ff8fb1',
  red: '#ff4f7b',
  rose: '#ffa3c2',
  green: '#4fd16e',
  greenD: '#1f8a4f',
  root: '#f0d9b5',
  ice: '#9fe8ff',
  blue: '#3f9cff',
  stone: '#7c6f9c',
  stoneD: '#4e456e',
  yellow: '#ffd84a',
  orange: '#ff9a2e',
  pale: '#fff7b0',
  soil: '#8a4f32',
  soilD: '#5e3424',
  soilDD: '#3d2116',
};

const MAP: Record<string, string> = {
  k: C.ink, w: C.white, b: C.tan, B: C.tanD, h: C.hi, p: C.pink, '4': C.red, '5': C.rose,
  g: C.green, G: C.greenD, r: C.root, c: C.ice, C: C.blue, s: C.stone, S: C.stoneD,
  y: C.yellow, o: C.orange, Y: C.pale,
};

const BODY = [
  '......kbbk......',
  '.....kbhbbk.....',
  '....kbhbbbbk....',
  '...kbhbbbbbBk...',
  '..kbhbbbbbbbBk..',
];
const LOWER = [
  '.kbpbbbbbbbpbBk.',
  '.kbbbbkkkbbbbBk.',
  '.kBbbbbbbbbbBBk.',
  '..kBBbbbbbBBBk..',
  '...kkBBBBBBkk...',
  '.....kkkkkk.....',
];
const TUFT = ['.......gg.......', '......gGgg......', '.......Gk.......'];
const EYES_OPEN = ['..kbbwwbbwwbBk..', '.kbbbwkbbwkbbBk.'];
const EYES_SHUT = ['..kbbbbbbbbbBk..', '.kbbkkbbbkkbbBk.'];
const EYES_HAPPY = ['..kbbkbbbkbbBk..'.replace(/^(.{16}).*$/, '$1'), '.kbbkbkbkbkbbBk.'];
const ROOTS_A = ['......r.r.r.....', '.....r..r..r....'];
const ROOTS_B = ['.....r.r.r......', '......r.r.r.....'];

export const SPR: Record<string, string[]> = {
  bulb: [...TUFT, ...BODY, ...EYES_OPEN, ...LOWER, ...ROOTS_A],
  bulbWalk: [...TUFT, ...BODY, ...EYES_OPEN, ...LOWER, ...ROOTS_B],
  bulbBlink: [...TUFT, ...BODY, ...EYES_SHUT, ...LOWER, ...ROOTS_A],
  bulbSleep: [...TUFT, ...BODY, ...EYES_SHUT, ...LOWER.map((r, i) => (i === 1 ? '.kbbbbbkbbbbbBk.' : r)), ...ROOTS_A],
  bulbHappy: [...TUFT, ...BODY, ...EYES_HAPPY, ...LOWER, ...ROOTS_A],
  tip: ['...g...', '..ggg..', '.gGgGg.', 'gG.G.Gg', '...G...'],
  bud: ['...g...', '..gGg..', '.gGgGg.', '.gGgGg.', '.gGgGg.', '..gGg..', '...G...'],
  budPink: ['...4...', '..454..', '.g454g.', '.gG5Gg.', '.gGgGg.', '..gGg..', '...G...'],
  tulip: [
    '..k.k...k.k..',
    '.k4k4k.k4k4k.',
    '.k454kkk454k.',
    'k45554445554k',
    'k45554445554k',
    'k44555555544k',
    '.k445555544k.',
    '..kk44444kk..',
    '....kkGkk....',
  ],
  frost: ['....c....', '.c.cwc.c.', '..cwwwc..', '.cwkwkwc.', 'cwwwwwwwc', '.cwwpwwc.', '..cwwwc..', '.c.cwc.c.', '....c....'],
  drop: ['..C..', '.CcC.', '.CcC.', 'CcwcC', 'CccwC', 'CcccC', '.CCC.'],
  stone: ['..ssss....', '.ssssssS..', 'sssssssSS.', 'sssssSSSSS', '.SSSSSSSS.'],
  light: ['.yYy.', 'yYwYy', 'YwwwY', 'yYwYy', '.yYy.'],
  mini: ['....g....', '...kGk...', '..kbbbk..', '.kbhbbBk.', '.kbwbwBk.', '.kbbbbBk.', '..kBBBk..', '...kkk...', '...r.r...'],
  leafL: ['....gg', '..gggG', '.ggGG.', 'gGG...'],
  leafR: ['gg....', 'Gggg..', '.GGgg.', '...GGg'],
};

const cache = new Map<string, HTMLCanvasElement>();
/** 스프라이트 캔버스(캐시). tint 를 주면 불투명 픽셀을 전부 그 색으로(맞을 때 번쩍임) */
export function sprite(name: string, tint?: string): HTMLCanvasElement {
  const key = tint ? `${name}:${tint}` : name;
  const hit = cache.get(key);
  if (hit) return hit;
  const rows = SPR[name];
  const w = Math.max(...rows.map((r) => r.length));
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = rows.length;
  const ctx = cv.getContext('2d')!;
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const col = MAP[ch];
      if (!col) return;
      ctx.fillStyle = tint ?? col;
      ctx.fillRect(x, y, 1, 1);
    }),
  );
  cache.set(key, cv);
  return cv;
}
