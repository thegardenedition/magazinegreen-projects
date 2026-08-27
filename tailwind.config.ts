import type { Config } from 'tailwindcss';

const config: Config = {
    content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                'brand-green': '#1A4D2E',
                'brand-teal': '#2E4F4F',
                'brand-offwhite': '#F9F9F7',
            },
            fontFamily: {
                /* MAGAZINE GREEN 서체 시스템: 본문·제목 모두 Pretendard (세리프 미사용) */
                sans: [
                    '"Pretendard Variable"',
                    'Pretendard',
                    '-apple-system',
                    'BlinkMacSystemFont',
                    '"Apple SD Gothic Neo"',
                    '"Noto Sans KR"',
                    'sans-serif',
                ],
                serif: [
                    '"Pretendard Variable"',
                    'Pretendard',
                    '-apple-system',
                    'BlinkMacSystemFont',
                    '"Apple SD Gothic Neo"',
                    '"Noto Sans KR"',
                    'sans-serif',
                ],
                accent: ['var(--font-accent)', 'sans-serif'],
            },
        },
    },
    plugins: [],
};

export default config;
