import { NextResponse } from 'next/server';
import { getAllProjects } from '@/lib/projects';

/**
 * app/api/projects/route.ts
 * ------------------------------------------------------------------------
 * 정원지도(garden-map-app, 별도 배포)가 이 엔드포인트를 불러와서 프로젝트를
 * 지도 위 마커로 표시하고, 클릭하면 이 사이트의 /projects/[slug] 게시글로
 * 이동시킨다. 좌표(lat/lng)가 아직 없는 프로젝트는 지도에 찍을 수 없으므로
 * 응답에서 제외한다.
 *
 * 다른 도메인(garden-map-app.vercel.app, magazinegreen.co.kr)에서 호출하므로
 * CORS 헤더를 명시적으로 연다.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// meta에 lat/lng가 아직 ProjectData 타입에 선언돼 있지 않을 수 있어 로컬 타입으로 안전하게 읽는다.
interface MetaWithCoords {
  title: string;
  category: string;
  location: string;
  thumbnail: string;
  lat?: number;
  lng?: number;
}

export async function GET() {
  const projects = getAllProjects()
    .map((p) => ({ slug: p.slug, meta: p.meta as unknown as MetaWithCoords }))
    .filter((p) => typeof p.meta.lat === 'number' && typeof p.meta.lng === 'number')
    .map((p) => ({
      slug: p.slug,
      title: p.meta.title,
      category: p.meta.category,
      location: p.meta.location,
      lat: p.meta.lat,
      lng: p.meta.lng,
      thumbnail: p.meta.thumbnail,
      url: `https://project.magazinegreen.co.kr/projects/${p.slug}`,
    }));

  return NextResponse.json({ results: projects }, { headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
