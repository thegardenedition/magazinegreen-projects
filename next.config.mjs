/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
          remotePatterns: [
            { protocol: 'https', hostname: 'images.unsplash.com' },
            { protocol: 'https', hostname: 'cdn.prod.website-files.com' },
            { protocol: 'https', hostname: 'raw.githubusercontent.com' },
                ],
    },
    // 비공개 단계: 모든 경로(페이지·API·정적 파일)에 검색 색인 금지 헤더. 공개 때 NEXT_PUBLIC_ARCHIVE_PUBLIC=on.
    async headers() {
        if (process.env.NEXT_PUBLIC_ARCHIVE_PUBLIC === 'on') return [];
        return [
            {
                source: '/:path*',
                headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet, noimageindex' }],
            },
        ];
    },
};

export default nextConfig;
