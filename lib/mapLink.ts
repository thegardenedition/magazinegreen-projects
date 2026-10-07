// 정원지도 위치 링크를 만드는 곳은 여기 한 군데다. 매거진그린 /garden-map 페이지의 iframe 은
// 쿼리를 넘기지 않아 지도 앱 주소로 바로 연결한다. 지도 서브도메인이나 앱 주소가 정해지면 이 값만 바꾼다.
const MAP_APP_URL = 'https://garden-map-app.vercel.app';

export function buildMapLink(lat: number, lng: number): string {
  return `${MAP_APP_URL}/?lat=${lat}&lng=${lng}`;
}
