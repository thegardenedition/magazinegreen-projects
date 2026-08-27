import type { Metadata } from 'next';
import { Montserrat } from 'next/font/google';
import './globals.css';

/* MAGAZINE GREEN 서체 시스템
   - 국문 본문·제목: Pretendard (globals.css에서 로드, tailwind.config의 sans/serif에 매핑)
   - 영문 강조 라벨(브랜드 홈페이지의 "Weekly"/"Green"과 동일한 패턴): Montserrat */
const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-accent',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Projects | MAGAZINE GREEN',
    template: '%s | MAGAZINE GREEN Projects',
  },
  description: '매거진그린이 기록한 정원 프로젝트 아카이브.',
  metadataBase: new URL('https://projects.magazinegreen.co.kr'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={montserrat.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
