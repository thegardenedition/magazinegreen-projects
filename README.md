# magazinegreen-projects

MAGAZINE GREEN의 [Projects] 메뉴 전용 별도 사이트 (`projects.magazinegreen.co.kr`).
Next.js 15(App Router) + Tailwind CSS + Framer Motion으로 만들었습니다.

빌드 검증 완료: `npm install` → `npm run build`까지 로컬에서 오류 없이 통과했습니다.

## 폴더 구조

```
app/
  layout.tsx              전역 레이아웃, 폰트(Noto Sans/Serif KR) 설정
  page.tsx                루트 접속 시 /projects로 리다이렉트
  projects/
    page.tsx              프로젝트 목록 페이지 (/projects)
    [slug]/
      page.tsx            프로젝트 상세 페이지 (/projects/[slug])
      not-found.tsx        존재하지 않는 slug 접근 시 404 화면
components/projects/
  ProjectDetail.tsx        상세 페이지 메인 레이아웃 (Breadcrumb, Hero, TOC, 하단 바 등)
  ImageWithPins.tsx        핫스팟 핀 인터랙션 컴포넌트
  ProjectCard.tsx          목록 그리드용 카드
data/projects/*.json       프로젝트 3건 목업 데이터 (CMS 대체용)
lib/projects.ts            데이터 조회 함수 (실제 CMS 연동 시 이 파일만 교체)
```

## 로컬에서 실행하기

```bash
npm install
npm run dev
```

`http://localhost:3000` 접속 시 `/projects`로 자동 이동합니다.

## Vercel로 배포하기

1. 이 폴더를 GitHub 저장소로 올립니다 (새 repo 하나 생성 후 push).
2. [vercel.com](https://vercel.com) 가입/로그인 → **Add New → Project** → 방금 올린 저장소 선택.
3. Framework Preset은 Next.js가 자동으로 감지됩니다. 별도 설정 없이 **Deploy** 클릭.
4. 배포가 끝나면 `xxx.vercel.app` 주소로 사이트가 먼저 뜹니다. 이후 서브도메인을 연결합니다.

## `projects.magazinegreen.co.kr` 서브도메인 연결

1. Vercel 프로젝트 → **Settings → Domains** → `projects.magazinegreen.co.kr` 입력 후 추가.
2. Vercel이 안내하는 CNAME 값(보통 `cname.vercel-dns.com`)을 확인합니다.
3. `magazinegreen.co.kr` 도메인의 DNS 관리 화면(이미 사용 중인 Cloudflare 대시보드)에서:
   - 타입: `CNAME`
   - 이름: `projects`
   - 대상: Vercel이 안내한 값 (예: `cname.vercel-dns.com`)
   - **Proxy status는 반드시 "DNS only"(회색 구름)로 설정** — Cloudflare가 프록시(주황 구름)로
     걸어두면 Vercel이 SSL 인증서를 자동 발급하지 못해 사이트가 열리지 않습니다.
4. DNS 반영까지 몇 분~1시간 정도 걸릴 수 있습니다. Vercel Domains 화면에서 초록색 체크가
   뜨면 연결 완료입니다.

## 실제 CMS로 교체할 때

지금은 `data/projects/*.json`을 정적으로 읽어오지만, 실제 운영 단계에서 Webflow CMS API나
별도 헤드리스 CMS로 옮길 때는 `lib/projects.ts`의 `getAllProjects()` /
`getProjectBySlug()` / `getAllProjectSlugs()` 세 함수의 내부 구현만 fetch 기반으로
바꾸면 됩니다. 페이지·컴포넌트 코드는 전혀 손댈 필요가 없습니다.

## 알려진 제약사항 / 다음 단계 후보

- 현재 이미지·영상은 예시 URL(Unsplash, 유튜브 dQw4w... 등)입니다. 실제 촬영 사진과
  프로젝트별 유튜브 링크로 교체해야 합니다.
- 핀 데이터의 `link.targetSlug`(식물 큐레이션/자재 페이지 링크)는 현재 실제 라우팅과
  연결되어 있지 않습니다. 매거진그린 본 사이트(Webflow)의 식물도감 상세 URL 규칙에 맞춰
  `onPinNavigate` 콜백에서 이동 처리를 붙이면 됩니다.
- 모바일 하단 액션바의 "스크랩" 기능은 현재 프론트엔드 상태(state)로만 토글되고
  서버에 저장되지 않습니다. 로그인/즐겨찾기 기능이 필요하면 별도 API가 필요합니다.
