// 라이브러리 LUT 전체를 .cube 파일로 묶은 ZIP. DaVinci Resolve 등 다른 프로그램에서 쓸 수 있다.

import { serializeCube, serializeCube1D } from './lut';
import { buildLibraryLut, LUT_CATEGORIES, LUT_LIBRARY } from './lutLibrary';
import { buildZip, deflateRaw, type ZipEntry } from './zip';

/** VFX IO 같은 1차원 곡선은 1D LUT(이 크기)로 쓴다. 3D보다 작고 정확하다. */
export const PACK_1D_SIZE = 4096;

export const PACK_FOLDER = 'GREEN GRADE LUT';

/** 파일 이름에 쓸 수 없는 문자를 바꾼다 */
export function cubeFileName(name: string): string {
  return name.replace(/→/g, 'to').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() + '.cube';
}

const README = `GREEN GRADE LUT 라이브러리

공개된 수식(카메라 제조사 백서, 표준 문서)으로 만든 3D LUT입니다. 다른 프로그램의 LUT 파일을 옮긴 것이 아닙니다.
필름 룩과 Sony 스타일 LUT는 측정 데이터가 아니라 특성을 따라 만든 스타일 근사입니다.

출력 기준
- VFX IO는 1D LUT(4096칸)이고, 나머지는 3D LUT(33³)입니다.
- 카메라 로그, 필름 룩, 룩, 정원 LUT의 출력은 sRGB 코드값입니다(사진·웹 기준).
- DaVinci Resolve의 Rec.709 감마 2.4 타임라인에서 영상용으로 쓰려면, 이 LUT 뒤 노드에
  "VFX IO/sRGB to Gamma 2.4.cube"를 이어 두세요.

DaVinci Resolve에 넣는 법
1. Project Settings → Color Management → Lookup Tables → Open LUT Folder
2. 이 폴더를 통째로 복사해 넣고 Update Lists
3. 노드에서 오른쪽 클릭 → LUT → GREEN GRADE LUT
`;

/** 라이브러리 LUT 하나의 .cube 텍스트 (1차원 곡선은 1D, 나머지는 33³ 3D) */
export function libraryCubeText(id: string): string {
  const item = LUT_LIBRARY.find((x) => x.id === id);
  if (!item) throw new Error(`LUT 없음: ${id}`);
  // TITLE에는 다른 프로그램이 읽기 쉽도록 화살표 대신 to
  const title = item.name.replace(/→/g, 'to');
  return item.curve ? serializeCube1D(title, PACK_1D_SIZE, item.curve) : serializeCube({ ...buildLibraryLut(item.id, 33), name: title });
}

/** 모든 라이브러리 LUT를 .cube로 만들어 압축 ZIP 하나로 묶는다 */
export async function buildLibraryZip(onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const enc = new TextEncoder();
  const entry = async (name: string, data: Uint8Array): Promise<ZipEntry> => ({ name, data, deflated: (await deflateRaw(data)) ?? undefined });
  const entries: ZipEntry[] = [await entry(`${PACK_FOLDER}/읽어보기.txt`, enc.encode(README))];
  const order = new Map(LUT_CATEGORIES.map(([c, label], i) => [c, `${String(i + 1).padStart(2, '0')} ${label}`]));
  for (let i = 0; i < LUT_LIBRARY.length; i++) {
    const item = LUT_LIBRARY[i];
    onProgress?.(i, LUT_LIBRARY.length);
    // 화면이 멈추지 않도록 몇 개마다 양보
    if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
    entries.push(await entry(`${PACK_FOLDER}/${order.get(item.category)}/${cubeFileName(item.name)}`, enc.encode(libraryCubeText(item.id))));
  }
  onProgress?.(LUT_LIBRARY.length, LUT_LIBRARY.length);
  return buildZip(entries);
}
