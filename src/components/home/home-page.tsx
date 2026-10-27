"use client";

import { useState } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { useSearchQuery } from "@/hooks/use-search-query";
import NaverMap from "./naver-map";

export default function HomePage() {
  // 입력값은 즉시 화면에 반영하고 API에는 입력이 멈춘 뒤의 검색어만 전달한다.
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query.trim());
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  // 입력을 지우면 대기 시간 없이 결과를 비우고 빈 검색어 요청을 막는다.
  const { data: places = [], isFetching: loading, error, isSuccess } = useSearchQuery(query.trim() ? debouncedQuery : "");
  const waiting = query.trim() !== debouncedQuery;
  // 새 검색어를 입력하는 동안 이전 결과를 선택하지 않도록 목록을 잠시 숨긴다.
  const visiblePlaces = waiting || !query.trim() ? [] : places;
  const message = waiting || loading
    ? (query.trim() ? "검색 중…" : "")
    : error?.message || (isSuccess && places.length === 0 ? "검색 결과가 없습니다." : "");

  return (
    // 배치를 쉽게 파악하고 수정할 수 있도록 검색, 목록, 지도를 위에서 아래로 배치한다.
    <div className="space-y-6 p-4">
      <section aria-label="화장실 검색" className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <input
            name="query"
            value={query}
            // 입력 이벤트는 값만 저장하고 실제 요청 시점은 debounce 훅에 맡긴다.
            onChange={(event) => setQuery(event.target.value)}
            aria-label="지역 또는 장소"
            placeholder="지역 또는 장소를 입력하세요"
            className="w-full border p-2"
          />
          <button type="button" disabled className="border p-2">
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
        <p>지역을 검색하거나 내 위치를 선택하세요.</p>
        <p>검색한 지역의 화장실이 여기에 표시됩니다.</p>
      </section>

      {/* 최대 너비 제한을 두지 않아 홈 화면에서 사용할 수 있는 폭을 모두 채운다. */}
      <section
        aria-label="주변 화장실 지도"
        className="w-full border"
      >
        <NaverMap position={position} />
      </section>
    </div>
  );
}
