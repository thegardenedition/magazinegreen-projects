// 상단 메뉴박스를 보일지 숨길지 정하는 규칙. 화면 없이 시험할 수 있도록 따로 뒀다.
// - 맨 위(80px 이내)에서는 항상 보인다.
// - 아래로 스크롤하면(8px 넘게) 숨는다.
// - 읽다가 조금 위로 올린 것만으로는 다시 나오지 않는다. 위로 280px 넘게 이어서 올리면 나온다.
//   (예전에는 위로 8px만 올려도 바로 나와서 본문 윗줄을 가렸다.)
export const REVEAL_ZONE_PX = 80;
export const DIRECTION_THRESHOLD_PX = 8;
export const REVEAL_UP_PX = 280;

export interface HeaderScrollState {
  hidden: boolean;
  /** 마지막으로 아래로 움직인 뒤 위로 올린 누적 거리 */
  upTravel: number;
}

export const INITIAL_HEADER_STATE: HeaderScrollState = { hidden: false, upTravel: 0 };

export function nextHeaderState(prev: HeaderScrollState, currentY: number, lastY: number): HeaderScrollState {
  const delta = currentY - lastY;

  if (currentY < REVEAL_ZONE_PX) return { hidden: false, upTravel: 0 };
  if (delta > DIRECTION_THRESHOLD_PX) return { hidden: true, upTravel: 0 };
  if (delta > 0) return { hidden: prev.hidden, upTravel: 0 };
  if (delta < 0) {
    const upTravel = prev.upTravel - delta;
    return { hidden: upTravel >= REVEAL_UP_PX ? false : prev.hidden, upTravel };
  }
  return prev;
}
