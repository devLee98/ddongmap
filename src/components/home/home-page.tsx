"use client";

import { useDebounce } from "@/hooks/use-debounce";
import { useSearchQuery } from "@/hooks/use-search-query";
import { useState } from "react";
import { useToiletsQuery } from "@/hooks/use-toilets-query";
import { MIN_TOILET_ZOOM, type MapViewport, type Toilet } from "@/types/toilet";
import NaverMap from "./naver-map";
import { FACILITY_STYLES, getFacilityStyle } from "@/lib/toilet-facilities";

const EMPTY_TOILETS: Toilet[] = [];

export default function HomePage() {
  // 입력값은 즉시 화면에 반영하고 API에는 입력이 멈춘 뒤의 검색어만 전달한다.
  const [query, setQuery] = useState("");
  // 검색어를 유지하면서 선택 후 결과만 닫고, 다시 입력하면 결과를 열기 위해 분리한다.
  const [searchResultsOpen, setSearchResultsOpen] = useState(false);
  const debouncedQuery = useDebounce(query.trim());
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(
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
  const message = !searchResultsOpen ? "" :
    waiting || loading
      ? query.trim()
        ? "검색 중…"
        : ""
      : error?.message || searchData?.warning ||
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
  const activeToiletId = hoveredToiletId ?? focusedToiletId;
  // 지도 이동으로 목록에서 사라진 항목은 마커 강조 대상에서도 제외한다.
  const highlightedToiletId = activeToiletId && visibleIdSet.has(activeToiletId)
    ? activeToiletId : null;

  return (
    // 배치를 쉽게 파악하고 수정할 수 있도록 검색, 목록, 지도를 위에서 아래로 배치한다.
    <div className="space-y-6 p-4">
      <section aria-label="화장실 검색" className="space-y-2">
        <div className="flex gap-2">
          <input
            name="query"
            value={query}
            // 새 입력이나 재포커스 시 결과를 열고, 실제 검색 요청은 기존 debounce를 유지한다.
            onChange={(event) => {
              setQuery(event.target.value);
              setSearchResultsOpen(true);
            }}
            onFocus={() => setSearchResultsOpen(true)}
            aria-label="주소 또는 장소"
            placeholder="도로명주소, 지번주소 또는 장소를 입력하세요"
            className="min-w-0 flex-1 border p-2"
          />
          <button type="button" disabled className="shrink-0 whitespace-nowrap border p-2">
            내 위치
          </button>
        </div>
        <p role="status">{message}</p>
        <ul className="space-y-2">
          {visiblePlaces.map((place, index) => (
            <li key={`${place.kind}-${place.lng}-${place.lat}-${index}`}>
              <button
                type="button"
                className="w-full border p-2 text-left"
                onClick={() => {
                  // 서버에서 주소와 장소 좌표를 같은 도 단위로 맞춰 지도에 그대로 전달한다.
                  setPosition({
                    lat: place.lat,
                    lng: place.lng,
                  });
                  // 이전 검색의 마커와 진행 중인 조회를 비우고 새 지도 영역을 기다린다.
                  setViewport(null);
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

      <section aria-labelledby="nearby-title" className="space-y-2 border p-4">
        <h1 id="nearby-title" className="font-bold">
          주변 공중화장실
        </h1>
        {/* 첫 진입은 검색 안내를 보여주고, 위치 선택 이후에만 지도 영역의 목록을 공개한다. */}
        {position === null ? (
          <div className="space-y-1">
            <p>주소나 장소를 검색해 주변 화장실을 찾아보세요.</p>
          </div>
        ) : (
          <>
        <p role="status">
          {zoomInRequired
            ? "지도를 더 확대하면 화장실이 표시됩니다."
            : toiletQuery.isError
              ? toiletQuery.error.message
              : viewport === null || toiletQuery.isFetching
                ? "현재 지도 영역의 화장실을 불러오는 중입니다."
                : `현재 지도 영역의 화장실: ${toilets.length}개`}
        </p>
        {toiletQuery.isError && (
          <button type="button" className="border p-2" onClick={() => void toiletQuery.refetch()}>
            다시 시도
          </button>
        )}
        {viewport && !zoomInRequired && toiletQuery.isSuccess && !toiletQuery.isFetching && toilets.length === 0 && (
          <p>현재 지도 영역에 등록된 화장실이 없습니다. 지도를 이동하거나 축소해 보세요.</p>
        )}
        {/* 목록이 길어져도 지도 위치가 계속 밀리지 않도록 목록 내부에서 스크롤한다. */}
        <ul className="max-h-72 space-y-2 overflow-y-auto" aria-label="현재 지도 영역의 화장실 목록">
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
              <p className="text-sm">{getFacilityStyle(toilet).label}</p>
              <p className="text-sm">{toilet.address}</p>
            </li>
          ))}
        </ul>
          </>
        )}
      </section>

      {/* 최대 너비 제한을 두지 않아 홈 화면에서 사용할 수 있는 폭을 모두 채운다. */}
      <section aria-label="주변 화장실 지도" className="w-full border">
        <ul aria-label="마커 색상 안내" className="flex flex-wrap gap-3 p-2 text-sm">
          {[FACILITY_STYLES.both, FACILITY_STYLES.male, FACILITY_STYLES.female, { ...FACILITY_STYLES.unknown, label: "일반 시설 없음·확인 필요" }].map((style) => (
            <li key={style.label} className="flex items-center gap-1">
              <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ backgroundColor: style.color }} />
              {style.label}
            </li>
          ))}
        </ul>
        <NaverMap
          position={position}
          toilets={toilets}
          highlightedToiletId={highlightedToiletId}
          onViewportChange={setViewport}
        />
      </section>
    </div>
  );
}
