import { readFile } from "node:fs/promises";
import path from "node:path";
import { MIN_TOILET_ZOOM, type Toilet, type ToiletResponse } from "@/types/toilet";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

let toiletsPromise: Promise<Toilet[]> | undefined;

function getToilets() {
  // 파일은 서버 프로세스에서 최초 조회 때만 읽고, 동시 요청도 같은 로딩 작업을 공유한다.
  // 화면에 쓰지 않는 변환 이력은 제외해 메모리와 API 응답 크기를 줄인다.
  toiletsPromise ??= readFile(
    path.join(process.cwd(), "data/processed/toilets-runtime.json"), "utf8",
  ).then((text) => {
    // 빌드 단계에서 필요한 필드만 남겼으므로 요청 시 추가 배열 변환 없이 바로 재사용한다.
    const data = JSON.parse(text) as { items: Toilet[] };
    return data.items;
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
  // 지도 드래그로 정상 요청이 이어질 수 있어 검색보다 여유 있는 한도를 적용한다.
  const limited = enforceRateLimit(request, { scope: "toilets", limit: 180, windowMs: 60_000 });
  if (limited) return limited;
  const respond = (body: ToiletResponse) => Response.json(body, {
    // 같은 지도 영역의 반복 조회는 CDN에서 짧게 재사용해 서버의 전체 배열 순회를 줄인다.
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
  });
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
