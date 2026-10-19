import type { MetadataRoute } from 'next';
import { ARCHIVE_PUBLIC } from '@/lib/exposure';

// [robots.txt — 왜 Disallow 가 아니라 Allow 인가]
// 이미 색인된 주소를 검색에서 빼려면 크롤러가 페이지를 읽고 noindex(메타·X-Robots-Tag)를 봐야 한다.
// robots.txt 로 막으면(Disallow) 크롤러가 noindex 를 못 읽어 오히려 색인이 남을 수 있다(구글 안내).
// 그래서 지금은 Allow + 모든 응답에 noindex 를 둔다. 색인에서 사라진 것이 확인되면
// NEXT_PUBLIC_ROBOTS_BLOCK=on 으로 Disallow: / 를 더해 다시 수집되지 않게 한다(두 번째 단계).
// 사이트맵은 두지 않는다.
export default function robots(): MetadataRoute.Robots {
  if (ARCHIVE_PUBLIC) return { rules: { userAgent: '*', allow: '/' } };
  if (process.env.NEXT_PUBLIC_ROBOTS_BLOCK === 'on') return { rules: { userAgent: '*', disallow: '/' } };
  return { rules: { userAgent: '*', allow: '/' } };
}
