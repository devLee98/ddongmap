import { readFile } from "node:fs/promises";
import path from "node:path";
import { MIN_TOILET_ZOOM, type Toilet, type ToiletResponse } from "@/types/toilet";

export const runtime = "nodejs";

type StoredToilet = Omit<Toilet, "address"> & {
  roadAddress: string;
  jibunAddress: string;
};

let toiletsPromise: Promise<Toilet[]> | undefined;

function getToilets() {
  // 파일은 서버 프로세스에서 최초 조회 때만 읽고, 동시 요청도 같은 로딩 작업을 공유한다.
  // 화면에 쓰지 않는 변환 이력은 제외해 메모리와 API 응답 크기를 줄인다.
  toiletsPromise ??= readFile(
    path.join(process.cwd(), "data/processed/toilets-all-success.json"), "utf8",
  ).then((text) => {
    const data = JSON.parse(text) as { items: StoredToilet[] };
    return data.items.map(({ id, name, roadAddress, jibunAddress, lat, lng }) => ({
      id, name, address: roadAddress || jibunAddress, lat, lng,
    }));
  }).catch((error) => {
    // 일시적인 파일 읽기 실패가 모든 후속 요청에 고정되지 않도록 다음 조회를 허용한다.
    toiletsPromise = undefined;
    throw error;
  });
  return toiletsPromise;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const keys = ["south", "north", "west", "east", "zoom"] as const;
  if (keys.some((key) => !params.get(key)?.trim())) {
    return Response.json({ message: "지도 영역과 확대 수준이 필요합니다." }, { status: 400 });
  }
  const [south, north, west, east, zoom] = keys.map((key) => Number(params.get(key)));
  if (![south, north, west, east, zoom].every(Number.isFinite) ||
    south < -90 || north > 90 || south >= north ||
    west < -180 || east > 180 || west >= east || zoom < 0 || zoom > 30) {
    return Response.json({ message: "지도 영역이 올바르지 않습니다." }, { status: 400 });
  }
  const respond = (body: ToiletResponse) => Response.json(body);
  // 넓은 지도에서 전국 마커를 다시 만들지 않도록 서버에서도 확대 수준을 검사한다.
  if (zoom < MIN_TOILET_ZOOM) return respond({ items: [], zoomInRequired: true });
  try {
    const toilets = await getToilets();
    const items: Toilet[] = [];
    for (const toilet of toilets) {
      if (toilet.lat >= south && toilet.lat <= north && toilet.lng >= west && toilet.lng <= east) {
        items.push(toilet);
        // 일부만 표시해 전체 결과로 오해시키지 않고, 과밀 영역은 더 확대하도록 안내한다.
        if (items.length > 500) return respond({ items: [], zoomInRequired: true });
      }
    }
    return respond({ items, zoomInRequired: false });
  } catch {
    return Response.json({ message: "화장실 정보를 불러오지 못했습니다. 다시 시도해 주세요." }, { status: 500 });
  }
}
