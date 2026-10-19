// [아카이브 비공개 단계 스위치 — 2026-10-19 대표 지시]
// 프로젝트 아카이브는 아직 공개 단계가 아니라 검색에 나오지 않게 하고, 외부로 이끄는 문구·링크를 숨긴다.
// 삭제가 아니라 보관이다. 공개할 때는 아래 환경변수만 바꿔 다시 배포하면 된다.
//  - NEXT_PUBLIC_SHOW_SUBMIT_GUIDE=on : 푸터의 「프로젝트 등재 문의·안내」를 다시 보인다.
//  - NEXT_PUBLIC_ARCHIVE_PUBLIC=on    : 검색 차단(robots 메타·X-Robots-Tag)을 끈다(next.config.mjs 도 같은 값을 읽는다).
export const SHOW_SUBMIT_GUIDE = process.env.NEXT_PUBLIC_SHOW_SUBMIT_GUIDE === 'on';
export const ARCHIVE_PUBLIC = process.env.NEXT_PUBLIC_ARCHIVE_PUBLIC === 'on';
