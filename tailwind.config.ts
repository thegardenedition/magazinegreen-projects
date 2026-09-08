import type { Config } from 'tailwindcss';

const config: Config = {
    content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                /* 본 사이트(magazinegreen.co.kr)의 --logo-green 과 같은 값.
                   이전 값 #1A4D2E 는 서브도메인에만 있던 다른 초록이었다. */
                'brand-green': '#0B5345',
                /* 버튼 호버 등 한 단계 진한 톤 — 본 사이트가 쓰는 값 그대로 */
                'brand-green-dark': '#093D33',
                /* 자재 핀 전용 악센트. 식물(초록)과 구분하기 위한 색이지
                   브랜드 컬러가 아니다. */
                'brand-teal': '#2E4F4F',
                'brand-offwhite': '#F9F9F7',
                'brand-cream': '#FDFBF7',
            },
            fontFamily: {
                /* MAGAZINE GREEN 서체 시스템 — 본 사이트와 같이 Pretendard 하나로 간다.
                   이전 설정은 sans 와 serif 에 똑같은 Pretendard 스택을 넣어 둬서
                   코드 곳곳의 font-serif 가 아무 효과도 내지 못했다(주석에는
                   "세리프/산세리프 믹스매치"라고 적혀 있었지만 실제 대비는 0).
                   제목의 위계는 서체가 아니라 굵기(600)와 자간(-0.02em)으로 준다.
                   accent 도 같은 스택이다 — 영문 라벨용으로 Montserrat 를 따로
                   받고 있었는데, 한글 글리프가 없어 서체가 뒤섞이는 문제 때문에
                   본 사이트에서 이미 걷어낸 서체였다. */
                sans: [
                    '"Pretendard Variable"',
                    'Pretendard',
                    '-apple-system',
                    'BlinkMacSystemFont',
                    '"Apple SD Gothic Neo"',
                    '"Noto Sans KR"',
                    'sans-serif',
                ],
                accent: [
                    '"Pretendard Variable"',
                    'Pretendard',
                    '-apple-system',
                    'BlinkMacSystemFont',
                    '"Apple SD Gothic Neo"',
                    '"Noto Sans KR"',
                    'sans-serif',
                ],
            },
        },
    },
    plugins: [],
};

export default config;
