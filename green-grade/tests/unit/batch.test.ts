import { describe, expect, it } from 'vitest';
import { defaultPrimary, gradePixel8, toUniforms, type Vec3 } from '../../src/engine/color';
import { bakeCurves, defaultCurves } from '../../src/engine/curves';
import { sampleLut } from '../../src/engine/lut';
import { bakeGradeLut, lutChain, windowNodeCount } from '../../src/engine/lutExport';
import { defaultQualifier, defaultShape, defaultWindow, maskUniform } from '../../src/engine/mask';
import { buildZip, crc32, uniqueNames } from '../../src/engine/zip';

/** ZIP을 읽어 (이름, 데이터) 목록으로 */
async function readZip(blob: Blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(buf.buffer);
  const out: Array<{ name: string; data: Uint8Array; crc: number }> = [];
  let i = 0;
  while (dv.getUint32(i, true) === 0x04034b50) {
    const crc = dv.getUint32(i + 14, true);
    const size = dv.getUint32(i + 18, true);
    const nameLen = dv.getUint16(i + 26, true);
    const name = new TextDecoder().decode(buf.subarray(i + 30, i + 30 + nameLen));
    const data = buf.subarray(i + 30 + nameLen, i + 30 + nameLen + size);
    out.push({ name, data, crc });
    i += 30 + nameLen + size;
  }
  // 끝 레코드의 항목 수와 일치하는지
  const end = buf.length - 22;
  expect(dv.getUint32(end, true)).toBe(0x06054b50);
  expect(dv.getUint16(end + 10, true)).toBe(out.length);
  return out;
}

describe('ZIP', () => {
  it('CRC-32 표준 값', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('한글 파일 이름과 데이터를 그대로 담는다', async () => {
    const a = new Uint8Array([1, 2, 3, 4, 5]);
    const b = new Uint8Array(1000).map((_, i) => i % 251);
    const files = await readZip(buildZip([{ name: '정원_GG.jpg', data: a }, { name: 'b.jpg', data: b }]));
    expect(files.map((f) => f.name)).toEqual(['정원_GG.jpg', 'b.jpg']);
    expect(Array.from(files[0].data)).toEqual(Array.from(a));
    expect(files[1].crc).toBe(crc32(b));
  });

  it('같은 이름은 번호를 붙여 구분한다 (대소문자 무시)', () => {
    expect(uniqueNames(['a_GG.jpg', 'A_GG.jpg', 'a_GG.jpg', 'b.jpg'])).toEqual([
      'a_GG.jpg',
      'A_GG (2).jpg',
      'a_GG (3).jpg',
      'b.jpg',
    ]);
  });
});

describe('그레이드 → .cube', () => {
  const colors: Vec3[] = [];
  for (let i = 0; i < 300; i++) colors.push([(i * 97) % 256, (i * 57 + 30) % 256, (i * 31 + 90) % 256]);

  it('기본 그레이드는 항등 LUT', async () => {
    const lut = await bakeGradeLut([toUniforms(defaultPrimary())], 17, 'exclude', 'id');
    for (const c of colors.slice(0, 40)) {
      const o = sampleLut(lut, c.map((v) => v / 255) as Vec3).map((v) => Math.round(v * 255));
      expect(o).toEqual(c);
    }
  });

  it('33³ LUT로 다시 적용하면 원래 그레이드와 거의 같다 (평균 1 LSB 이하, 최대 4)', async () => {
    const curves = defaultCurves();
    curves.y = [{ x: 0, y: 0.02 }, { x: 0.4, y: 0.34 }, { x: 0.8, y: 0.84 }, { x: 1, y: 0.98 }];
    curves.hueSat = [{ x: 0.2, y: 0.5 }, { x: 0.3, y: 0.42 }, { x: 0.4, y: 0.5 }];
    const chain = [
      toUniforms({ ...defaultPrimary(), gain: { x: 0.2, y: 0.25, master: 1.1 }, saturation: 0.9 }, { curves: bakeCurves(curves) }),
      toUniforms({ ...defaultPrimary(), lift: { x: -0.3, y: 0.1, master: 0.02 }, contrast: 1.08 }),
    ];
    const lut = await bakeGradeLut(chain, 33, 'exclude', 'look');
    let sum = 0;
    let max = 0;
    for (const c of colors) {
      const direct = gradePixel8(c, chain);
      const viaLut = sampleLut(lut, c.map((v) => v / 255) as Vec3).map((v) => Math.round(v * 255));
      for (let k = 0; k < 3; k++) {
        const d = Math.abs(direct[k] - viaLut[k]);
        sum += d;
        max = Math.max(max, d);
      }
    }
    expect(sum / (colors.length * 3)).toBeLessThanOrEqual(1);
    expect(max).toBeLessThanOrEqual(4);
  });

  it('창이 켜진 노드: 빼고 굽기 / 창만 무시하기, Qualifier는 남는다', () => {
    const q = { ...defaultQualifier(), enabled: true };
    const w = { ...defaultWindow(), enabled: true, shape: defaultShape('gradient') };
    const plain = toUniforms(defaultPrimary());
    const winOnly = toUniforms({ ...defaultPrimary(), saturation: 0 }, { mask: maskUniform(defaultQualifier(), w) });
    const both = toUniforms({ ...defaultPrimary(), saturation: 0 }, { mask: maskUniform(q, w) });
    const chain = [plain, winOnly, both];
    expect(windowNodeCount(chain)).toBe(2);
    expect(lutChain(chain, 'exclude')).toEqual([plain]);
    const ignored = lutChain(chain, 'ignore');
    expect(ignored).toHaveLength(3);
    expect(ignored[1].mask).toBeNull();
    expect(ignored[2].mask?.qualifier).toBeTruthy();
    expect(ignored[2].mask?.window).toBeNull();
  });
});
