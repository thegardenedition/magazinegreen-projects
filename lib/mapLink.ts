// 정원지도 위치 링크를 만드는 곳은 여기 한 군데다. 매거진그린 /garden-map 페이지의 iframe 은
// 쿼리를 넘기지 않아 지도 앱 주소로 바로 연결한다. 지도 서브도메인이나 앱 주소가 정해지면 이 값만 바꾼다.
// utm 값은 지도에서 접수된 견적이 "아카이브를 거쳐 온 것"임을 알아보게 하는 출처 표시다.
// utm_medium 으로 어디서 눌렀는지(상세 페이지 / 목록 카드)를 구분한다.
const MAP_APP_URL = 'https://garden-map-app.vercel.app';

export type MapLinkPlace = 'detail' | 'list';

export function buildMapLink(lat: number, lng: number, place: MapLinkPlace = 'detail'): string {
  const q = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    utm_source: 'projects',
    utm_medium: place,
    utm_campaign: 'see-on-map',
  });
  return `${MAP_APP_URL}/?${q.toString()}`;
}
