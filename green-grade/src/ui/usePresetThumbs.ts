import { useEffect, useState } from 'react';
import { chainOfPreset } from '../engine/presetChain';
import type { Preset } from '../engine/presets';
import { getActiveRenderer } from '../engine/renderer';
import { useGrade } from '../state/store';

/** 미리보기 썸네일의 가로 크기 (px) */
export const THUMB_W = 96;
const THUMB_LUT_SIZE = 17;

/**
 * 지금 사진의 작은 사본에 프리셋을 하나씩 적용한 썸네일 URL (프리셋 이름 → URL).
 * 사진이 바뀌면 다시 만든다. 화면이 멈추지 않도록 하나씩 렌더하고 사이마다 쉰다.
 * 노드 색 보정만 반영한다 (그레인·비네트 같은 효과는 썸네일 크기에서 보이지 않아 뺀다).
 */
export function usePresetThumbs(presets: Preset[], enabled: boolean): Map<string, string> {
  const image = useGrade((s) => s.image);
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!enabled || !image) return;
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      // 사진을 연 직후의 조작(확대·탭)이 먼저 처리되도록 잠시 기다린다
      await new Promise((res) => setTimeout(res, 500));
      if (cancelled) return;
      const h = Math.max(1, Math.round((THUMB_W * image.proxy.height) / image.proxy.width));
      const small = await createImageBitmap(image.proxy, { resizeWidth: THUMB_W, resizeHeight: h, resizeQuality: 'medium', premultiplyAlpha: 'none' });
      const canvas = new OffscreenCanvas(THUMB_W, h);
      const ctx = canvas.getContext('2d')!;
      const out = new Map<string, string>();
      for (let i = 0; i < presets.length && !cancelled; i++) {
        const r = getActiveRenderer();
        if (!r) break;
        // 썸네일은 96px이라 LUT도 17³이면 충분하다 (계산·GPU 업로드가 훨씬 가볍다)
        const px = r.renderFull(small, chainOfPreset(presets[i], THUMB_LUT_SIZE), { dither: true });
        ctx.putImageData(new ImageData(px.pixels, px.width, px.height), 0, 0);
        const url = URL.createObjectURL(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 }));
        urls.push(url);
        out.set(presets[i].name, url);
        // 8개마다 화면에 반영하고, 매번 한 번씩 쉬어 터치·입력이 밀리지 않게 한다
        // (프로 워크플로 프리셋은 처음 쓸 때 LUT를 계산하므로 한 개가 0.1초 넘게 걸릴 수 있다)
        if (i % 8 === 7 || i === presets.length - 1) {
          if (!cancelled) setThumbs(new Map(out));
        }
        await new Promise((res) => setTimeout(res, 0));
      }
      small.close();
    })();
    return () => {
      cancelled = true;
      // 다음 썸네일이 그려진 뒤 이전 URL을 정리한다
      setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 2000);
    };
  }, [image, enabled, presets]);

  return image ? thumbs : new Map();
}
