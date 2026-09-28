import type { Metadata } from 'next';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import './globals.css';

/* MAGAZINE GREEN 서체 시스템
   본 사이트와 같이 Pretendard 하나로 간다(globals.css 에서 로드,
   tailwind.config 의 sans/accent 에 매핑).

   [2026-09-08] 영문 강조 라벨용으로 next/font 의 Montserrat 를 따로 받고
   있었는데, 본 사이트에서는 한글 글리프가 없어 글자마다 폴백으로 떨어져
   서체가 뒤섞이는 문제 때문에 이미 걷어낸 서체다. 여기만 되살아나 있어
   같이 제거한다. 라벨의 성격(대문자·넓은 자간)은 tracking 으로 유지된다. */

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
    <html lang="ko">
      <body className="bg-white font-sans antialiased">
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
