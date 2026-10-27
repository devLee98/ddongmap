// 전역 naver 타입을 자동 탐색에 의존하지 않고 이 파일에서 명시적으로 불러온다.
/// <reference types="navermaps" />

"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    // 외부 스크립트가 추가하는 전역 객체를 명시해 에디터에서도 지도 API 타입을 인식하게 한다.
    naver: typeof naver;
  }
}

type ToiletMapItem = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

export default function NaverMap({
  position,
  toilets,
  onVisibleToiletsChange,
  highlightedToiletId,
}: {
  position: { lat: number; lng: number } | null;
  toilets: ToiletMapItem[];
  onVisibleToiletsChange: (ids: string[]) => void;
  highlightedToiletId: string | null;
}) {
  // 지도 객체는 화면 상태가 아니므로 ref에 보관해 검색할 때마다 다시 만들지 않는다.
  const mapRef = useRef<naver.maps.Map | null>(null);
  const markerRef = useRef<naver.maps.Marker | null>(null);
  // 화장실 마커는 검색 위치 마커와 별도로 관리하며, ref에 보관해 불필요한 렌더링을 피한다.
  const toiletMarkersRef = useRef<naver.maps.Marker[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // 검색 결과를 먼저 선택했더라도 지도 로딩이 끝나면 해당 위치를 반영한다.
    if (!ready || !position || !mapRef.current) return;
    const point = new window.naver.maps.LatLng(position.lat, position.lng);
    mapRef.current.setCenter(point);
    // 검색 위치 주변의 화장실을 여러 곳 비교할 수 있도록 표시 범위를 넓힌다.
    mapRef.current.setZoom(17);

    // 마커 하나를 재사용해 다른 장소를 선택할 때 이전 마커가 쌓이지 않게 한다.
    if (markerRef.current) {
      markerRef.current.setPosition(point);
    } else {
      markerRef.current = new window.naver.maps.Marker({
        map: mapRef.current,
        position: point,
      });
    }
  }, [position, ready]);

  useEffect(() => {
    // 외부 지도 API의 로딩이 끝나야 좌표 객체와 마커를 안전하게 생성할 수 있다.
    if (!ready || !mapRef.current) return;

    const map = mapRef.current;
    // 동일한 SVG 파일을 재사용하고 중심점을 좌표에 맞춰 검색 위치 핀과 화장실을 구분한다.
    const toiletIcon: naver.maps.ImageIcon = {
      url: "/icons/toilet.svg",
      size: new window.naver.maps.Size(40, 40),
      scaledSize: new window.naver.maps.Size(40, 40),
      anchor: new window.naver.maps.Point(20, 20),
    };
    const markers = toilets.map((toilet) =>
      new window.naver.maps.Marker({
        map,
        position: new window.naver.maps.LatLng(toilet.lat, toilet.lng),
        title: toilet.name,
        icon: toiletIcon,
      }),
    );
    toiletMarkersRef.current = markers;

    // 이 effect에서 만든 마커를 정리해 데이터 변경이나 화면 해제 시 중복과 누적을 막는다.
    return () => {
      markers.forEach((marker) => marker.setMap(null));
      toiletMarkersRef.current = [];
    };
  }, [ready, toilets]);

  useEffect(() => {
    if (!ready) return;

    // 강조는 지도 이동이나 마커 재생성 없이 기존 마커의 아이콘과 겹침 순서만 변경한다.
    toiletMarkersRef.current.forEach((marker, index) => {
      const highlighted = toilets[index].id === highlightedToiletId;
      const size = highlighted ? 48 : 40;
      marker.setIcon({
        url: highlighted ? "/icons/toilet-highlighted.svg" : "/icons/toilet.svg",
        size: new window.naver.maps.Size(size, size),
        scaledSize: new window.naver.maps.Size(size, size),
        anchor: new window.naver.maps.Point(size / 2, size / 2),
      });
      marker.setZIndex(highlighted ? 100 : 0);
    });
  }, [ready, toilets, highlightedToiletId]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;

    const map = mapRef.current;
    let previousIds: string[] | null = null;
    const updateVisibleToilets = () => {
      // 지역명이나 고정 반경 대신 지도 영역으로 판별해 드래그와 확대·축소를 함께 지원한다.
      const bounds = map.getBounds();
      if (!(bounds instanceof window.naver.maps.LatLngBounds)) return;
      const ids = toilets
        .filter((toilet) =>
          bounds.hasLatLng(new window.naver.maps.LatLng(toilet.lat, toilet.lng)),
        )
        .map((toilet) => toilet.id);

      // 목록이 같으면 다시 알리지 않아 지도를 조금 움직였을 때 불필요한 렌더링을 막는다.
      const lastIds = previousIds;
      if (lastIds && ids.length === lastIds.length &&
        ids.every((id, index) => id === lastIds[index])) return;
      previousIds = ids;
      onVisibleToiletsChange(ids);
    };

    // 이동 중 반복되는 이벤트 대신 idle에서 처리하고, 초기 목록도 이동을 기다리지 않고 반영한다.
    const listener = window.naver.maps.Event.addListener(map, "idle", updateVisibleToilets);
    updateVisibleToilets();

    // 재등록이나 화면 해제 시 이벤트를 제거해 중복 실행과 해제 후 상태 갱신을 방지한다.
    return () => window.naver.maps.Event.removeListener(listener);
  }, [ready, toilets, onVisibleToiletsChange]);

  useEffect(() => {
    // 페이지를 떠날 때 지도 이벤트와 마커를 정리한다.
    return () => {
      markerRef.current?.setMap(null);
      mapRef.current?.destroy();
    };
  }, []);

  return (
    <>
      <Script
        src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID}`}
        onReady={() => {
          // 지도 API가 준비된 뒤 생성해야 naver 객체를 사용할 수 있다.
          mapRef.current = new window.naver.maps.Map("naver-map", {
            // 남한 중부를 중심으로 잡아 초기 화면에서 남한 위주로 보여준다.
            center: new window.naver.maps.LatLng(36.3, 127.8),
            zoom: 7,
          });
          setReady(true);
        }}
      />

      {/* 가로폭을 모두 사용하고 높이도 같은 크기로 맞춰 정사각형 지도를 표시한다. */}
      <div id="naver-map" className="aspect-square w-full" />
    </>
  );
}
