"use client";

import { useQuery } from "@tanstack/react-query";
import { MIN_TOILET_ZOOM, type MapViewport, type ToiletResponse } from "@/types/toilet";

export function useToiletsQuery(viewport: MapViewport | null) {
  return useQuery<ToiletResponse>({
    // 영역별로 캐시를 분리해 이전 영역의 응답이 새 영역의 지도·목록을 덮지 않게 한다.
    queryKey: ["toilets", viewport],
    enabled: viewport !== null && viewport.zoom >= MIN_TOILET_ZOOM,
    queryFn: async ({ signal }) => {
      if (!viewport) throw new Error("지도 영역이 필요합니다.");
      const params = new URLSearchParams(
        Object.entries(viewport).map(([key, value]) => [key, String(value)]),
      );
      // 지도 영역이 바뀌면 이전 조회를 취소해 빠르게 이동했을 때도 최신 영역만 반영한다.
      const response = await fetch(`/api/toilets?${params}`, { signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "화장실 조회에 실패했습니다.");
      return data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}
