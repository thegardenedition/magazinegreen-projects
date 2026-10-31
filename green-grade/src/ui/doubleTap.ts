// 터치 화면의 두 번 탭을 dblclick으로 바꿔 보낸다.
// 슬라이더·휠 리셋, 커브 점 삭제, 노드 이름 바꾸기처럼 더블클릭에 걸린 동작을 휴대폰에서도 쓸 수 있게 한다.
// 브라우저가 스스로 dblclick을 보내면(일부 안드로이드) 중복되지 않도록 그것은 막는다.

const TAP_MS = 320;
const TAP_PX = 24;

export function installDoubleTap(target: Window = window) {
  let last: { t: number; x: number; y: number; el: EventTarget | null } | null = null;
  let synthAt = -Infinity;
  let down: { x: number; y: number; t: number } | null = null;

  target.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'touch' || !e.isPrimary) return;
      down = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    },
    true,
  );

  target.addEventListener(
    'pointerup',
    (e) => {
      if (e.pointerType !== 'touch' || !e.isPrimary || !down) return;
      // 끌기는 탭이 아니다
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10 || e.timeStamp - down.t > 400) {
        last = null;
        return;
      }
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (last && e.timeStamp - last.t < TAP_MS && Math.hypot(e.clientX - last.x, e.clientY - last.y) < TAP_PX && el === last.el) {
        last = null;
        synthAt = performance.now();
        el?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, view: window }));
        return;
      }
      last = { t: e.timeStamp, x: e.clientX, y: e.clientY, el };
    },
    true,
  );

  target.addEventListener(
    'dblclick',
    (e) => {
      if (e.isTrusted && performance.now() - synthAt < 500) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true,
  );
}
