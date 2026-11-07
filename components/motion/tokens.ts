/**
 * components/motion/tokens.ts
 * ------------------------------------------------------------------------
 * 매거진그린 모션 토큰. 숫자를 감으로 고르지 않도록 "물리량"으로 적어 둔다.
 *
 * 스프링은 질량(m)·강성(k)·감쇠(c)로 정의되고, 성격은 감쇠비 ζ = c / (2√(k·m)) 로 정해진다.
 *   ζ < 1  : 목표를 지나쳤다 돌아온다(튕김). 가벼운 물체 — 하트, 핀, 잎.
 *   ζ ≈ 1  : 지나치지 않고 가장 빨리 멈춘다. 카드·패널·사진처럼 "무게 있는" 면.
 *   ζ > 1  : 느리게 스며든다. 숫자 카운트처럼 넘어가면 안 되는 값.
 * 정착 시간(대략) ≈ 4 / (ζ·ω₀), ω₀ = √(k/m).
 *
 * 규칙: 새 숫자를 만들지 말고 여기서 고른다. 맞는 게 없으면 여기에 이유와 함께 추가한다.
 */

export const SPRING = {
  /** ζ≈0.92 · 정착 ~0.19s — 토글, 핸들 점프, 버튼 눌림 */
  snap: { type: 'spring', stiffness: 520, damping: 42, mass: 1 },
  /** ζ≈0.93 · 정착 ~0.27s — 카드·패널·모달처럼 면적 있는 요소 */
  settle: { type: 'spring', stiffness: 260, damping: 30, mass: 1 },
  /** ζ≈1.00 · 정착 ~0.37s — 히어로 사진, 큰 면의 이동 */
  soft: { type: 'spring', stiffness: 120, damping: 22, mass: 1 },
  /** ζ≈0.50 · 한두 번 출렁임 — 하트, 핀 팝, 잎사귀 같은 가벼운 것 */
  leaf: { type: 'spring', stiffness: 180, damping: 12, mass: 0.8 },
  /** ζ≈1.04 · 포인터를 쫓는 기울기·시차. 지연 ~60ms, 떨림 없음 */
  follow: { type: 'spring', stiffness: 150, damping: 18, mass: 0.5 },
  /** ζ≈1.29 · 과감쇠 — 숫자 카운트(목표값을 넘으면 틀린 숫자가 보인다) */
  count: { type: 'spring', stiffness: 60, damping: 20, mass: 1 },
} as const;

/** useSpring 용(type 키 없이) */
export const springOf = (s: (typeof SPRING)[keyof typeof SPRING]) => ({
  stiffness: s.stiffness,
  damping: s.damping,
  mass: s.mass,
});

/** 시간 기반 이징. 스프링이 어색한 곳(불투명도, 마스크, 클립)에만 쓴다. */
export const EASE = {
  /** 감속형 · 들어오는 것 — 기존 사이트 곡선과 같다 */
  out: [0.16, 1, 0.3, 1] as const,
  /** 대칭 · 화면 안에서 위치만 바뀌는 것 */
  inOut: [0.65, 0, 0.35, 1] as const,
  /** 가속형 · 나가는 것(나갈 때는 들어올 때의 60~70% 시간) */
  in: [0.7, 0, 0.84, 0] as const,
};

/** 지속 시간(초). 이동 거리와 면적이 클수록 길게. */
export const DUR = {
  micro: 0.18, // 색, 아이콘
  ui: 0.32, // 버튼·칩·툴팁
  panel: 0.55, // 카드·패널
  scene: 1.1, // 히어로·장면 전환
  lens: 1.6, // 히어로 사진 초점 정착
} as const;

/** 관성 투척: 놓는 순간 속도(단위/초) × power 만큼(최대 maxTravel) 더 미끄러진 뒤 SPRING.soft 로 내려앉는다. */
export const INERTIA = { power: 0.22, maxTravel: 22 } as const;
