// 전역 naver 타입을 자동 탐색에 의존하지 않고 이 파일에서 명시적으로 불러온다.
/// <reference types="navermaps" />

"use client";

import Script from "next/script";

declare global {
  interface Window {
    // 외부 스크립트가 추가하는 전역 객체를 명시해 에디터에서도 지도 API 타입을 인식하게 한다.
    naver: typeof naver;
  }
}

export default function NaverMap() {
  return (
    <>
      <Script
        src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID}`}
        onReady={() => {
          // 지도 API가 준비된 뒤 생성해야 naver 객체를 사용할 수 있다.
          new window.naver.maps.Map("naver-map", {
            center: new window.naver.maps.LatLng(37.5665, 126.978),
            zoom: 15,
          });
        }}
      />

      {/* 가로폭을 모두 사용하고 높이도 같은 크기로 맞춰 정사각형 지도를 표시한다. */}
      <div id="naver-map" className="aspect-square w-full" />
    </>
  );
}
