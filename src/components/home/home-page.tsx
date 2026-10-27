"use client";

import { useDebounce } from "@/hooks/use-debounce";
import { useSearchQuery } from "@/hooks/use-search-query";
import { useState } from "react";
import toiletData from "../../../data/processed/toilets-first-100-success.json";
import NaverMap from "./naver-map";

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
    data: places = [],
    isFetching: loading,
    error,
    isSuccess,
  } = useSearchQuery(query.trim() ? debouncedQuery : "");
  const waiting = query.trim() !== debouncedQuery;
  // 새 검색어를 입력하는 동안 이전 결과를 선택하지 않도록 목록을 잠시 숨긴다.
  const visiblePlaces = !searchResultsOpen || waiting || !query.trim() ? [] : places;
  const message = !searchResultsOpen ? "" :
    waiting || loading
      ? query.trim()
        ? "검색 중…"
        : ""
      : error?.message ||
        (isSuccess && places.length === 0 ? "검색 결과가 없습니다." : "");

  // 성공 데이터만 담긴 파일이므로 별도의 상태 필터 없이 사용한다.
  const toilets = toiletData.items;
  // 지도는 화면 안의 ID만 알려주고, 이름과 주소는 원본 데이터에서 가져와 중복 상태를 줄인다.
  // React의 상태 설정 함수는 참조가 안정적이어서 지도 이벤트를 렌더링마다 재등록하지 않는다.
  const [visibleToiletIds, setVisibleToiletIds] = useState<string[] | null>(null);
  const visibleIdSet = new Set(visibleToiletIds ?? []);
  const visibleToilets = toilets.filter((toilet) => visibleIdSet.has(toilet.id));
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
            aria-label="지역 또는 장소"
            placeholder="지역 또는 장소를 입력하세요"
            className="min-w-0 flex-1 border p-2"
          />
          <button type="button" disabled className="shrink-0 whitespace-nowrap border p-2">
            내 위치
          </button>
        </div>
        <p role="status">{message}</p>
        <ul className="space-y-2">
          {visiblePlaces.map((place, index) => (
            <li key={`${place.mapx}-${place.mapy}-${index}`}>
              <button
                type="button"
                className="w-full border p-2 text-left"
                onClick={() => {
                  // 검색 좌표는 1천만 배 정수이므로 도 단위로 바꿔 지도에 전달한다.
                  setPosition({
                    lat: Number(place.mapy) / 10_000_000,
                    lng: Number(place.mapx) / 10_000_000,
                  });
                  // 선택한 검색 위치를 반영한 뒤 검색 결과만 닫아 지도와 화장실 목록을 보여준다.
                  setSearchResultsOpen(false);
                }}
              >
                {/* 검색어 강조 태그는 제거하고 텍스트로 출력해 HTML 삽입을 막는다. */}
                <p>{place.title.replace(/<[^>]*>/g, "")}</p>
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
          {visibleToiletIds === null
            ? "지도를 불러오는 중입니다."
            : `현재 지도 영역의 화장실: ${visibleToilets.length}개`}
        </p>
        {visibleToiletIds !== null && visibleToilets.length === 0 && (
          <p>현재 지도 영역에 등록된 화장실이 없습니다. 지도를 이동하거나 축소해 보세요.</p>
        )}
        {/* 목록이 길어져도 지도 위치가 계속 밀리지 않도록 목록 내부에서 스크롤한다. */}
        <ul className="max-h-72 space-y-2 overflow-y-auto" aria-label="현재 지도 영역의 화장실 목록">
          {visibleToilets.map((toilet) => (
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
              <p className="text-sm">{toilet.roadAddress || toilet.jibunAddress}</p>
            </li>
          ))}
        </ul>
          </>
        )}
      </section>

      {/* 최대 너비 제한을 두지 않아 홈 화면에서 사용할 수 있는 폭을 모두 채운다. */}
      <section aria-label="주변 화장실 지도" className="w-full border">
        <NaverMap
          position={position}
          toilets={toilets}
          highlightedToiletId={highlightedToiletId}
          onVisibleToiletsChange={setVisibleToiletIds}
        />
      </section>
    </div>
  );
}
