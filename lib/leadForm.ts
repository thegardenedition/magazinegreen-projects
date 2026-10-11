// 견적 폼 주소를 만드는 곳은 여기 한 군데다. 폼은 mg-biz 서버가 한 벌로 내려주고(동의 문안 포함),
// 지도·기사·아카이브가 같은 폼을 iframe 으로 쓴다. 복사본을 만들지 않는다.
export const LEAD_FORM_ORIGIN = 'https://mg-biz.chgreena.workers.dev';

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;

export function buildLeadFormUrl(sourceRef: string, landingPath: string, search: string): string {
  const q = new URLSearchParams({ source: 'project', source_ref: sourceRef, landing_path: landingPath });
  const current = new URLSearchParams(search);
  for (const key of UTM_KEYS) {
    const value = current.get(key);
    if (value) q.set(key, value);
  }
  return `${LEAD_FORM_ORIGIN}/leads/form?${q.toString()}`;
}
