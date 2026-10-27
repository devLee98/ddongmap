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

export default function NaverMap({
  position,
}: {
  position: { lat: number; lng: number } | null;
}) {
  // 지도 객체는 화면 상태가 아니므로 ref에 보관해 검색할 때마다 다시 만들지 않는다.
  const mapRef = useRef<naver.maps.Map | null>(null);
  const markerRef = useRef<naver.maps.Marker | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // 검색 결과를 먼저 선택했더라도 지도 로딩이 끝나면 해당 위치를 반영한다.
    if (!ready || !position || !mapRef.current) return;
    const point = new window.naver.maps.LatLng(position.lat, position.lng);
    mapRef.current.setCenter(point);
    mapRef.current.setZoom(15);

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
