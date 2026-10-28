"use client";

import { useDebounce } from "@/hooks/use-debounce";
import { useSearchQuery } from "@/hooks/use-search-query";
import { useEffect, useRef, useState } from "react";
import { useToiletsQuery } from "@/hooks/use-toilets-query";
import { MIN_TOILET_ZOOM, type MapViewport, type Toilet } from "@/types/toilet";
import NaverMap from "./naver-map";
import { FACILITY_STYLES } from "@/lib/toilet-facilities";
import { getLocationErrorMessage } from "@/lib/naver-directions";

const EMPTY_TOILETS: Toilet[] = [];

export default function HomePage() {
  // 입력값은 즉시 화면에 반영하고 API에는 입력이 멈춘 뒤의 검색어만 전달한다.
  const [query, setQuery] = useState("");
  // 검색어를 유지하면서 선택 후 결과만 닫고, 다시 입력하면 결과를 열기 위해 분리한다.
  const [searchResultsOpen, setSearchResultsOpen] = useState(false);
  const debouncedQuery = useDebounce(query.trim());
  const [position, setPosition] = useState<{ lat: number; lng: number; name?: string } | null>(
    null,
  );
  // 입력을 지우면 대기 시간 없이 결과를 비우고 빈 검색어 요청을 막는다.
  const {
    data: searchData,
    isFetching: loading,
    error,
    isSuccess,
  } = useSearchQuery(query.trim() ? debouncedQuery : "");
  const places = searchData?.items ?? [];
  const waiting = query.trim() !== debouncedQuery;
  // 새 검색어를 입력하는 동안 이전 결과를 선택하지 않도록 목록을 잠시 숨긴다.
  const visiblePlaces = !searchResultsOpen || waiting || !query.trim() ? [] : places;
  // 검색 중에는 빈 상태를 유지하고 완료된 결과나 사용자가 확인해야 할 오류만 표시한다.
  const message = !searchResultsOpen || waiting || loading ? "" :
    error?.message || searchData?.warning ||
    (isSuccess && places.length === 0 ? "검색 결과가 없습니다." : "");

  // 전국 JSON 대신 검색 후 지도 영역만 서버로 보내고, 응답 하나를 지도와 목록에서 공유한다.
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const toiletQuery = useToiletsQuery(viewport);
  const zoomInRequired = (viewport !== null && viewport.zoom < MIN_TOILET_ZOOM)
    || toiletQuery.data?.zoomInRequired === true;
  const toilets = position && !zoomInRequired && !toiletQuery.isFetching && !toiletQuery.isError
    ? toiletQuery.data?.items ?? EMPTY_TOILETS : EMPTY_TOILETS;
  const visibleIdSet = new Set(toilets.map((toilet) => toilet.id));
  // 마우스와 키보드 상태를 분리해 마우스가 벗어나도 키보드 포커스의 강조는 유지한다.
  const [hoveredToiletId, setHoveredToiletId] = useState<string | null>(null);
  const [focusedToiletId, setFocusedToiletId] = useState<string | null>(null);
  // 지도 공간을 우선 보여주고 사용자가 원할 때만 목록을 지도 위에 펼친다.
  const [isListOpen, setIsListOpen] = useState(false);
  const activeToiletId = hoveredToiletId ?? focusedToiletId;
  // 지도 이동으로 목록에서 사라진 항목은 마커 강조 대상에서도 제외한다.
  const highlightedToiletId = activeToiletId && visibleIdSet.has(activeToiletId)
    ? activeToiletId : null;

  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const locationRequestRef = useRef(0);

  // 브라우저의 단발 위치 요청은 취소 API가 없으므로 번호를 바꿔 오래된 응답을 무시한다.
  const cancelLocationRequest = () => {
    locationRequestRef.current += 1;
    setLocating(false);
    setLocationMessage("");
  };

  useEffect(() => {
    // 페이지를 떠난 뒤 도착한 위치 응답은 상태를 갱신하지 않는다.
    return () => { locationRequestRef.current += 1; };
  }, []);

  const handleCurrentLocation = () => {
    setSearchResultsOpen(false);
    if (!window.isSecureContext || !navigator.geolocation) {
      setLocationMessage("현재 위치는 HTTPS 또는 localhost에서 위치 기능을 지원하는 브라우저로 이용해 주세요.");
      return;
    }
    const requestId = ++locationRequestRef.current;
    setLocating(true);
    // 위치 확인 중에는 별도 문구를 표시하지 않고 완료되거나 오류가 발생했을 때만 화면을 갱신한다.
    setLocationMessage("");
    // 버튼을 눌렀을 때만 권한을 요청하고, 획득한 위치를 기존 지도 이동·주변 조회에 연결한다.
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (requestId !== locationRequestRef.current) return;
      setLocating(false);
      if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) {
        setLocationMessage("올바른 현재 위치를 받지 못했습니다. 다시 시도해 주세요.");
        return;
      }
      setPosition({ lat: coords.latitude, lng: coords.longitude, name: "현재 위치" });
      setViewport(null);
      setIsListOpen(false);
      setQuery("");
      setSearchResultsOpen(false);
      // 지도 이동 자체로 성공 여부가 드러나므로 완료 문구는 남기지 않는다.
      setLocationMessage("");
    }, (error) => {
      if (requestId !== locationRequestRef.current) return;
      setLocating(false);
      setLocationMessage(getLocationErrorMessage(error));
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  };

  return (
    // 동적 뷰포트 높이를 사용해 모바일 주소창 크기가 달라져도 검색 아래를 지도로 채운다.
    <div className="flex h-dvh flex-col gap-4 p-4">
      <section aria-label="화장실 검색" className="shrink-0 space-y-2">
        <div className="flex gap-2">
          <input
            name="query"
            value={query}
            // 새 입력이나 재포커스 시 결과를 열고, 실제 검색 요청은 기존 debounce를 유지한다.
            onChange={(event) => {
              // 위치 확인 중 새 검색을 시작하면 늦은 위치 응답이 검색 결과를 덮지 않게 한다.
              cancelLocationRequest();
              setQuery(event.target.value);
              setSearchResultsOpen(true);
            }}
            onFocus={() => setSearchResultsOpen(true)}
            aria-label="주소 또는 장소"
            placeholder="도로명주소, 지번주소 또는 장소를 입력하세요"
            className="min-w-0 flex-1 border p-2"
          />
          <button
            type="button"
            onClick={handleCurrentLocation}
            disabled={locating}
            aria-busy={locating}
            className="shrink-0 whitespace-nowrap border p-2 disabled:opacity-50"
          >
            {locating ? "위치 확인 중…" : "내 위치"}
          </button>
        </div>
        <p role="status">{message}</p>
        <p role="status">{locationMessage}</p>
        <ul className="space-y-2">
          {visiblePlaces.map((place, index) => (
            <li key={`${place.kind}-${place.lng}-${place.lat}-${index}`}>
              <button
                type="button"
                className="w-full border p-2 text-left"
                onClick={() => {
                  cancelLocationRequest();
                  // 서버에서 주소와 장소 좌표를 같은 도 단위로 맞춰 지도에 그대로 전달한다.
                  setPosition({
                    lat: place.lat,
                    lng: place.lng,
                    name: place.title,
                  });
                  // 이전 검색의 마커와 진행 중인 조회를 비우고 새 지도 영역을 기다린다.
                  setViewport(null);
                  setIsListOpen(false);
                  // 선택한 검색 위치를 반영한 뒤 검색 결과만 닫아 지도와 화장실 목록을 보여준다.
                  setSearchResultsOpen(false);
                }}
              >
                <span className="text-xs text-gray-600">{place.kind === "address" ? "주소 후보" : "장소"}</span>
                <p>{place.title}</p>
                <p className="text-sm">{place.address}</p>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* 남은 높이를 지도에 할당하고 내부 요소가 부모 높이를 넘지 않도록 제한한다. */}
      <section aria-label="주변 화장실 지도" className="flex min-h-0 w-full flex-1 flex-col border">
        <ul aria-label="마커 색상 안내" className="flex flex-wrap gap-3 p-2 text-sm">
          {[FACILITY_STYLES.both, FACILITY_STYLES.male, FACILITY_STYLES.female, FACILITY_STYLES.unknown].map((style) => (
            <li key={style.label} className="flex items-center gap-1">
              <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ backgroundColor: style.color }} />
              {style.label}
            </li>
          ))}
        </ul>
        <div className="relative min-h-0 flex-1">
          <NaverMap
            position={position}
            toilets={toilets}
            highlightedToiletId={highlightedToiletId}
            onViewportChange={setViewport}
          />

          {/* 지도 위에 겹쳐 배치해 목록을 열어도 지도의 크기와 현재 영역이 바뀌지 않게 한다. */}
          {position !== null && zoomInRequired && (
            <p className="absolute inset-x-3 bottom-3 z-10 bg-white/95 p-3 shadow" role="status">
              지도를 더 확대하면 화장실이 표시됩니다.
            </p>
          )}
          {position !== null && !zoomInRequired && toiletQuery.isError && (
            <div className="absolute inset-x-3 bottom-3 z-10 flex items-center justify-between gap-3 bg-white/95 p-3 shadow">
              <p role="status">{toiletQuery.error.message}</p>
              <button type="button" className="shrink-0 border p-2" onClick={() => void toiletQuery.refetch()}>
                다시 시도
              </button>
            </div>
          )}
          {position !== null && !zoomInRequired && !toiletQuery.isError
            && (viewport === null || toiletQuery.isFetching) && (
            <p className="absolute inset-x-3 bottom-3 z-10 bg-white/95 p-3 shadow" role="status">
              현재 지도 영역의 화장실을 불러오는 중입니다.
            </p>
          )}
          {position !== null && viewport && !zoomInRequired && toiletQuery.isSuccess
            && !toiletQuery.isFetching && toilets.length === 0 && (
            <p className="absolute inset-x-3 bottom-3 z-10 bg-white/95 p-3 shadow" role="status">
              현재 지도 영역에 등록된 화장실이 없습니다. 지도를 이동하거나 축소해 보세요.
            </p>
          )}

          {position !== null && toilets.length > 0 && !isListOpen && (
            <button
              type="button"
              aria-expanded="false"
              aria-controls="nearby-toilet-list"
              className="absolute inset-x-3 bottom-3 z-10 bg-white p-3 font-bold shadow"
              onClick={() => setIsListOpen(true)}
            >
              주변 화장실 목록
            </button>
          )}

          {position !== null && toilets.length > 0 && isListOpen && (
            <section
              id="nearby-toilet-list"
              aria-labelledby="nearby-title"
              className="absolute inset-x-0 bottom-0 z-20 flex max-h-1/2 flex-col bg-white shadow-2xl"
            >
              <button
                type="button"
                aria-expanded="true"
                aria-controls="nearby-toilet-list"
                className="w-full border-b p-3 text-left font-bold"
                onClick={() => setIsListOpen(false)}
              >
                <span id="nearby-title">주변 화장실 목록</span>
                <span aria-hidden="true" className="float-right">▼</span>
              </button>
              {/* 패널 높이는 유지하고 목록 내부만 스크롤해 지도 조작 영역을 남겨 둔다. */}
              <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" aria-label="현재 지도 영역의 화장실 목록">
                {toilets.map((toilet) => (
                  <li
                    key={toilet.id}
                    tabIndex={0}
                    className={`border p-2 outline-offset-2 focus-visible:outline-2 focus-visible:outline-orange-600 ${
                      highlightedToiletId === toilet.id ? "border-orange-600 bg-orange-50" : ""
                    }`}
                    // 클릭 없이 대상 ID를 전달하고, 벗어날 때는 해당 항목의 강조 상태만 해제한다.
                    onMouseEnter={() => setHoveredToiletId(toilet.id)}
                    onMouseLeave={() => setHoveredToiletId((id) => id === toilet.id ? null : id)}
                    onFocus={() => setFocusedToiletId(toilet.id)}
                    onBlur={() => setFocusedToiletId((id) => id === toilet.id ? null : id)}
                  >
                    <p className="font-medium">{toilet.name}</p>
                    <p className="text-sm">{toilet.address}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
