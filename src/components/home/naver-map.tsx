// 전역 naver 타입을 자동 탐색에 의존하지 않고 이 파일에서 명시적으로 불러온다.
/// <reference types="navermaps" />

"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import type { MapViewport, Toilet } from "@/types/toilet";
import { getFacilityStyle } from "@/lib/toilet-facilities";

declare global {
  interface Window {
    // 외부 스크립트가 추가하는 전역 객체를 명시해 에디터에서도 지도 API 타입을 인식하게 한다.
    naver: typeof naver;
  }
}

export default function NaverMap({
  position,
  toilets,
  onViewportChange,
  highlightedToiletId,
}: {
  position: { lat: number; lng: number } | null;
  toilets: Toilet[];
  onViewportChange: (viewport: MapViewport | null) => void;
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
    // 정보창 하나를 재사용하고 자동 지도 이동을 막아 마커를 빠르게 오가도 화면을 유지한다.
    const infoWindow = new window.naver.maps.InfoWindow({
      content: "",
      disableAutoPan: true,
      maxWidth: 280,
      borderColor: "#d1d5db",
      backgroundColor: "#ffffff",
      pixelOffset: new window.naver.maps.Point(0, -12),
      zIndex: 200,
    });
    const listeners: naver.maps.MapEventListener[] = [];
    let hoveredMarker: naver.maps.Marker | null = null;
    const closeInfo = () => {
      hoveredMarker = null;
      infoWindow.close();
    };
    // 일반 시설의 이용 대상별 SVG를 사용하며 중심점을 좌표에 맞춘다.
    const markers = toilets.map((toilet) => {
      const marker = new window.naver.maps.Marker({
        map,
        position: new window.naver.maps.LatLng(toilet.lat, toilet.lng),
        title: `${toilet.name} (${getFacilityStyle(toilet).label})`,
        icon: {
          url: getFacilityStyle(toilet).icon,
          size: new window.naver.maps.Size(40, 40),
          scaledSize: new window.naver.maps.Size(40, 40),
          anchor: new window.naver.maps.Point(20, 20),
        },
      });
      // CSV의 이름·주소를 HTML 문자열로 삽입하지 않고 textContent로 넣어 텍스트로만 표시한다.
      listeners.push(window.naver.maps.Event.addListener(marker, "mouseover", () => {
        const content = document.createElement("div");
        content.style.cssText = "padding:12px;max-width:260px;overflow-wrap:anywhere;pointer-events:none;font-size:13px;color:#111827";
        const name = document.createElement("strong");
        name.textContent = toilet.name;
        const address = document.createElement("p");
        address.textContent = toilet.address;
        address.style.cssText = "margin:4px 0;color:#4b5563";
        const facility = document.createElement("p");
        facility.textContent = getFacilityStyle(toilet).label;
        facility.style.margin = "0";
        content.append(name, address, facility);
        hoveredMarker = marker;
        infoWindow.setContent(content);
        infoWindow.open(map, marker);
      }));
      listeners.push(window.naver.maps.Event.addListener(marker, "mouseout", () => {
        // 이전 마커의 늦은 이탈 이벤트가 새 마커의 정보창을 닫지 않도록 대상을 확인한다.
        if (hoveredMarker === marker) closeInfo();
      }));
      return marker;
    });
    // 지도를 조작하는 동안 남아 있는 정보창을 닫아 현재 화면과 정보가 어긋나지 않게 한다.
    listeners.push(window.naver.maps.Event.addListener(map, "dragstart", closeInfo));
    listeners.push(window.naver.maps.Event.addListener(map, "zoom_changed", closeInfo));
    toiletMarkersRef.current = markers;

    // 이 effect에서 만든 마커를 정리해 데이터 변경이나 화면 해제 시 중복과 누적을 막는다.
    return () => {
      closeInfo();
      listeners.forEach((listener) => window.naver.maps.Event.removeListener(listener));
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
        // 호버가 끝나면 공통 초록이 아닌 해당 화장실의 원래 성별 색상으로 복원한다.
        url: highlighted ? "/icons/toilet-highlighted.svg" : getFacilityStyle(toilets[index]).icon,
        size: new window.naver.maps.Size(size, size),
        scaledSize: new window.naver.maps.Size(size, size),
        anchor: new window.naver.maps.Point(size / 2, size / 2),
      });
      marker.setZIndex(highlighted ? 100 : 0);
    });
  }, [ready, toilets, highlightedToiletId]);

  useEffect(() => {
    // 검색 전에는 영역을 전달하지 않아 전국 초기 화면에서 화장실 조회가 발생하지 않는다.
    if (!ready || !position || !mapRef.current) return;

    const map = mapRef.current;
    let previousViewport = "";
    const updateViewport = () => {
      const bounds = map.getBounds();
      if (!(bounds instanceof window.naver.maps.LatLngBounds)) return;
      const sw = bounds.getSW();
      const ne = bounds.getNE();
      const viewport: MapViewport = {
        south: sw.lat(), north: ne.lat(), west: sw.lng(), east: ne.lng(), zoom: map.getZoom(),
      };
      // 동일한 영역에서 반복되는 idle은 건너뛰어 불필요한 상태 갱신을 막는다.
      const key = JSON.stringify(viewport);
      if (key === previousViewport) return;
      previousViewport = key;
      onViewportChange(viewport);
    };

    // 이동이 끝난 시점에만 영역을 조회하고, 화면 크기가 바뀌면 새로운 범위도 반영한다.
    const listeners = [
      window.naver.maps.Event.addListener(map, "idle", updateViewport),
      window.naver.maps.Event.addListener(map, "resize", updateViewport),
    ];
    updateViewport();

    // 재등록이나 화면 해제 시 이벤트를 제거해 중복 실행과 해제 후 상태 갱신을 방지한다.
    return () => listeners.forEach((listener) => window.naver.maps.Event.removeListener(listener));
  }, [ready, position, onViewportChange]);

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
