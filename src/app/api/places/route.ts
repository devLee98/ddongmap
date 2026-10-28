import type { SearchResponse, SearchResult } from "@/types/search";
import { enforceRateLimit } from "@/lib/rate-limit";

type LocalItem = { title: string; address: string; roadAddress?: string; mapx: string; mapy: string };
type AddressItem = { roadAddress: string; jibunAddress: string; x: string; y: string };

function validPosition(item: SearchResult) {
  return Number.isFinite(item.lat) && Number.isFinite(item.lng)
    && item.lat >= -90 && item.lat <= 90 && item.lng >= -180 && item.lng <= 180;
}

async function searchPlaces(query: string, signal: AbortSignal): Promise<SearchResult[]> {
  const clientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("장소 검색 인증 정보가 없습니다.");
  const url = new URL("https://naverapihub.apigw.ntruss.com/search/v1/local");
  url.searchParams.set("query", query);
  url.searchParams.set("display", "5");
  url.searchParams.set("format", "json");
  const response = await fetch(url, {
    headers: { "X-NCP-APIGW-API-KEY-ID": clientId, "X-NCP-APIGW-API-KEY": clientSecret },
    cache: "no-store", signal,
  });
  if (!response.ok) throw new Error("장소 검색에 실패했습니다.");
  const data = await response.json();
  if (!Array.isArray(data.items)) throw new Error("장소 검색 응답 오류");
  // 장소 API의 정수 좌표를 도 단위로 바꿔 주소 검색과 같은 형태로 반환한다.
  return (data.items as LocalItem[]).map((item): SearchResult => ({
    title: item.title.replace(/<[^>]*>/g, ""),
    address: item.roadAddress || item.address,
    lat: String(item.mapy ?? "").trim() ? Number(item.mapy) / 10_000_000 : NaN,
    lng: String(item.mapx ?? "").trim() ? Number(item.mapx) / 10_000_000 : NaN,
    kind: "place",
  })).filter(validPosition);
}

async function searchAddresses(query: string, signal: AbortSignal): Promise<SearchResult[]> {
  const clientId = process.env.NAVER_MAP_CLIENT_ID || process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const secret = process.env.NAVER_MAP_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error("주소 검색 인증 정보가 없습니다.");
  const url = new URL("https://maps.apigw.ntruss.com/map-geocode/v2/geocode");
  // 충장로1길25처럼 붙여 쓴 주소는 끝의 번지 앞만 띄워 도로명 자체를 보존한다.
  const addressQuery = query.replace(/([로길동리가읍면])(?=(?:산)?\d+(?:-\d+)?$)/u, "$1 ");
  url.searchParams.set("query", addressQuery);
  url.searchParams.set("count", "5");
  const response = await fetch(url, {
    headers: { "x-ncp-apigw-api-key-id": clientId, "x-ncp-apigw-api-key": secret, Accept: "application/json" },
    cache: "no-store", signal,
  });
  if (!response.ok) throw new Error("주소 검색에 실패했습니다.");
  const data = await response.json();
  if (data.status !== "OK" || !Array.isArray(data.addresses)) throw new Error("주소 검색 응답 오류");
  // 주소 API는 도 단위 좌표를 반환하므로 장소 API의 좌표 배율을 적용하지 않는다.
  return (data.addresses as AddressItem[]).map((item): SearchResult => ({
    title: item.roadAddress || item.jibunAddress,
    address: item.jibunAddress || item.roadAddress,
    lat: String(item.y ?? "").trim() ? Number(item.y) : NaN,
    lng: String(item.x ?? "").trim() ? Number(item.x) : NaN,
    kind: "address",
  })).filter(validPosition);
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("query")?.trim().replace(/\s+/g, " ");
  if (!query) return Response.json({ message: "검색어를 입력해주세요." }, { status: 400 });
  if (query.length > 100) {
    return Response.json({ message: "검색어는 100자 이하로 입력해 주세요." }, { status: 400 });
  }
  // 공개 검색 프록시를 통한 네이버 API 한도 소진을 줄이기 위해 IP별 호출 수를 제한한다.
  const limited = enforceRateLimit(request, { scope: "places", limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  // 이름과 주소를 단정하지 않고 병렬 조회해 지번·도로명·장소명을 함께 지원한다.
  // 브라우저 요청 취소와 시간 제한을 두 API에 함께 적용해 오래된 검색을 종료한다.
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]);
  const [places, addresses] = await Promise.allSettled([
    searchPlaces(query, signal), searchAddresses(query, signal),
  ]);
  const failed = [places, addresses].filter((result) => result.status === "rejected").length;
  if (failed === 2) {
    return Response.json({ message: "검색 정보를 불러오지 못했습니다. 다시 시도해 주세요." }, { status: 502 });
  }
  // 한 API만 실패해도 다른 결과는 유지하고 부분 실패를 결과 없음과 구분한다.
  const addressItems = addresses.status === "fulfilled" ? addresses.value : [];
  const placeItems = places.status === "fulfilled" ? places.value : [];
  const body: SearchResponse = { items: [...addressItems, ...placeItems] };
  if (failed) {
    body.warning = places.status === "rejected"
      ? "장소 검색을 불러오지 못해 주소 검색 결과만 표시합니다."
      : "주소 검색을 불러오지 못해 장소 검색 결과만 표시합니다.";
  }
  return Response.json(body);
}
