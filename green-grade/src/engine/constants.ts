export type Vec3 = [number, number, number];

/** Rec.709 휘도 계수 (선형 sRGB와 원색 공유) */
export const LUMA: Vec3 = [0.2126, 0.7152, 0.0722];

/** 그레이딩 인코딩 지수. 톤 조작(Lift/Gamma/Contrast/Curves)은 이 지각적 공간에서 한다. */
export const GRADING_GAMMA = 2.4;

/** 노드 체인의 최대 길이. 셰이더가 노드별 값을 이 길이의 배열로 받는다. */
export const MAX_NODES = 8;
