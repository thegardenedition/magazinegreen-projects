import type { Metadata } from 'next';
import { Noto_Sans_KR, Noto_Serif_KR } from 'next/font/google';
import './globals.css';

/* 본문: Noto Sans KR (가독성 중심) / 제목·인용구: Noto Serif KR (에디토리얼 톤) */
const notoSans = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const notoSerif = Noto_Serif_KR({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-serif',
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
    <html lang="ko" className={`${notoSans.variable} ${notoSerif.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
