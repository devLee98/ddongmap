"use client";

import { useQuery } from "@tanstack/react-query";
import type { SearchResponse } from "@/types/search";

export function useSearchQuery(query: string) {
  return useQuery<SearchResponse>({
    // 검색어별로 결과를 구분해 서로 다른 장소 검색의 캐시가 섞이지 않게 한다.
    queryKey: ["place-address-search", query],
    // debounce를 거친 검색어가 있을 때만 요청해 첫 화면과 빈 입력의 호출을 막는다.
    enabled: query.length > 0,
    queryFn: async ({ signal }) => {
      // 인증은 서버에 맡기고, 검색어가 바뀌면 이전 요청을 취소할 수 있게 한다.
      const response = await fetch(
        `/api/places?query=${encodeURIComponent(query)}`,
        { signal },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "검색에 실패했습니다.");
      return data;
    },
    // 검색어 변경으로 조회하고 창 전환이나 재연결에 따른 불필요한 요청은 막는다.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}
