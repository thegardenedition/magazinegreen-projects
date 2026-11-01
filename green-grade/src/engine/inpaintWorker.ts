// 지우개 계산을 화면과 다른 스레드에서 한다 (큰 영역은 1초 넘게 걸린다)
import { inpaint } from './inpaint';

self.onmessage = (e: MessageEvent<{ rgba: Uint8ClampedArray; w: number; h: number; mask: Uint8Array }>) => {
  const { rgba, w, h, mask } = e.data;
  const out = inpaint(rgba, w, h, mask);
  (self as unknown as Worker).postMessage(out, [out.buffer]);
};
