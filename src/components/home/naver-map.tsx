// 전역 naver 타입을 자동 탐색에 의존하지 않고 이 파일에서 명시적으로 불러온다.
/// <reference types="navermaps" />

"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import type { MapViewport, Toilet } from "@/types/toilet";
import { getFacilityStyle } from "@/lib/toilet-facilities";
import { buildNaverDirectionsLinks } from "@/lib/naver-directions";

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
  position: { lat: number; lng: number; name?: string } | null;
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
    // 검색 위치 주변의 화장실을 여러 곳 비교할 수 있도록 한 단계 넓은 범위에서 시작한다.
    mapRef.current.setZoom(16);

    // 현재 위치와 주소 검색의 아이콘을 바꿀 수 있도록 기존 기준 마커를 하나씩 교체한다.
    markerRef.current?.setMap(null);
    markerRef.current = new window.naver.maps.Marker({
      map: mapRef.current,
      position: point,
      title: position.name ?? "선택한 위치",
      ...(position.name === "현재 위치" && {
        icon: {
          url: "/icons/current-location.svg",
          size: new window.naver.maps.Size(40, 40),
          scaledSize: new window.naver.maps.Size(40, 40),
          anchor: new window.naver.maps.Point(20, 20),
        },
      }),
    });
  }, [position, ready]);

  useEffect(() => {
    // 외부 지도 API의 로딩이 끝나야 좌표 객체와 마커를 안전하게 생성할 수 있다.
    if (!ready || !position || !mapRef.current) return;

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
    let pinnedMarker: naver.maps.Marker | null = null;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    let positionFrame: number | undefined;
    const cancelClose = () => {
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = undefined;
    };
    const closeInfo = () => {
      cancelClose();
      if (positionFrame !== undefined) cancelAnimationFrame(positionFrame);
      positionFrame = undefined;
      hoveredMarker = null;
      pinnedMarker = null;
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
      const showInfo = (pin: boolean) => {
        // 탭으로 연 정보는 이탈 이벤트로 닫지 않고 다른 마커 탭이나 명시적인 닫기를 기다린다.
        cancelClose();
        pinnedMarker = pin ? marker : null;
        const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
          || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent));
        const content = document.createElement("div");
        content.className = "toilet-info-window";
        // 인라인 크기도 모바일에 맞춰 지정해 지도 API가 만든 외부 요소의 크기 영향까지 줄인다.
        content.style.cssText = mobile
          ? "box-sizing:border-box;width:140px;padding:6px;overflow-wrap:anywhere;font-size:11px;color:#111827"
          : "box-sizing:border-box;width:260px;padding:12px;overflow-wrap:anywhere;font-size:13px;color:#111827";
        // 외부 데이터는 HTML로 해석하지 않고 텍스트로 넣어 안전하게 표시한다.
        const name = document.createElement("strong");
        name.className = "toilet-info-name";
        name.textContent = toilet.name;
        const header = document.createElement("div");
        header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px";
        const closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.textContent = "×";
        closeButton.setAttribute("aria-label", "화장실 정보 닫기");
        closeButton.style.cssText = mobile
          ? "min-width:32px;min-height:32px;flex-shrink:0;font-size:20px;cursor:pointer"
          : "min-width:44px;min-height:44px;flex-shrink:0;font-size:24px;cursor:pointer";
        closeButton.addEventListener("click", closeInfo);
        header.append(name, closeButton);
        const address = document.createElement("p");
        address.className = "toilet-info-address";
        address.textContent = toilet.address;
        address.style.cssText = "margin:4px 0;color:#4b5563";
        // 이용 대상은 마커 색상과 지도 범례로 이미 구분되므로 정보창에는 반복해서 표시하지 않는다.
        content.append(header, address);
        // 선택한 검색 위치를 출발점으로 사용해 추가 위치 권한 없이 링크를 바로 연다.
        const links = buildNaverDirectionsLinks(position, toilet, window.location.origin);
        const directionsLinks = document.createElement("div");
        directionsLinks.className = "toilet-info-directions";
        directionsLinks.style.cssText = "display:flex;margin-top:8px";
        const primary = document.createElement("a");
        primary.textContent = "길찾기";
        // 앱 설치 여부와 운영체제에 따른 실패 분기를 없애기 위해 모든 환경에서 웹 길찾기를 연다.
        primary.href = links.web;
        primary.style.cssText = mobile
          ? "display:flex;min-width:0;min-height:36px;flex:1;align-items:center;justify-content:center;padding:3px;border-radius:5px;background:#0f766e;color:white;text-align:center;text-decoration:none"
          : "display:block;padding:10px;border-radius:6px;background:#0f766e;color:white;text-align:center;text-decoration:none";
        primary.target = "_blank";
        primary.rel = "noopener noreferrer";
        primary.addEventListener("click", () => {
          // 외부 지도에서 돌아왔을 때도 선택했던 화장실의 정보창을 유지한다.
          cancelClose();
          pinnedMarker = marker;
        });
        directionsLinks.append(primary);
        content.append(directionsLinks);
        // 정보창 내부의 탭이 지도 빈 곳 클릭으로 처리되지 않도록 전파를 차단한다.
        content.addEventListener("click", (event) => event.stopPropagation());
        content.addEventListener("pointerdown", (event) => event.stopPropagation());
        // PC에서 마커에서 정보창으로 이동해도 닫기 버튼에 도달할 수 있도록 짧게 닫기를 유예한다.
        content.addEventListener("mouseenter", cancelClose);
        content.addEventListener("mouseleave", () => {
          if (!pinnedMarker) closeInfo();
        });
        hoveredMarker = marker;
        infoWindow.setContent(content);
        // 이전 마커에서 아래쪽 배치를 사용했더라도 새 마커는 기본 위쪽 위치에서 다시 계산한다.
        infoWindow.setOptions({ content, pixelOffset: new window.naver.maps.Point(0, -12) });
        infoWindow.open(map, marker);
        if (positionFrame !== undefined) cancelAnimationFrame(positionFrame);
        positionFrame = requestAnimationFrame(() => {
          // 지도 API가 정보창 DOM 크기를 반영한 다음 프레임에 측정해야 0px 오프셋을 피할 수 있다.
          positionFrame = requestAnimationFrame(() => {
            positionFrame = undefined;
            if (hoveredMarker !== marker && pinnedMarker !== marker) return;

            const measuredHeight = infoWindow.getContentElement().getBoundingClientRect().height;
            const infoHeight = Math.max(measuredHeight, mobile ? 88 : 140);
            const markerPoint = map.getProjection().fromCoordToOffset(marker.getPosition());
            // 기본 기준점은 마커 위쪽이므로 정보창 높이와 40px 마커 높이, 여백까지 내려 배치한다.
            if (markerPoint.y < infoHeight + 20) {
              infoWindow.setOptions({
                content,
                pixelOffset: new window.naver.maps.Point(0, infoHeight + 48),
              });
            }
          });
        });
      };
      listeners.push(window.naver.maps.Event.addListener(marker, "mouseover", () => {
        // 터치 브라우저의 합성 호버 대신 click을 사용하고 PC의 실제 호버만 처리한다.
        if (window.matchMedia("(hover: hover) and (pointer: fine)").matches && !pinnedMarker) showInfo(false);
      }));
      listeners.push(window.naver.maps.Event.addListener(marker, "click", (event: naver.maps.PointerEvent) => {
        event.pointerEvent?.stopPropagation();
        // 정보창 하나를 재사용하므로 다른 화장실을 누르면 이전 정보가 새 정보로 교체된다.
        showInfo(true);
      }));
      listeners.push(window.naver.maps.Event.addListener(marker, "mouseout", () => {
        if (hoveredMarker !== marker || pinnedMarker) return;
        cancelClose();
        closeTimer = setTimeout(() => {
          if (hoveredMarker === marker && !pinnedMarker) closeInfo();
        }, 150);
      }));
      return marker;
    });
    // 지도를 조작하는 동안 남아 있는 정보창을 닫아 현재 화면과 정보가 어긋나지 않게 한다.
    listeners.push(window.naver.maps.Event.addListener(map, "dragstart", closeInfo));
    listeners.push(window.naver.maps.Event.addListener(map, "zoom_changed", closeInfo));
    listeners.push(window.naver.maps.Event.addListener(map, "click", closeInfo));
    toiletMarkersRef.current = markers;

    // 이 effect에서 만든 마커를 정리해 데이터 변경이나 화면 해제 시 중복과 누적을 막는다.
    return () => {
      closeInfo();
      listeners.forEach((listener) => window.naver.maps.Event.removeListener(listener));
      markers.forEach((marker) => marker.setMap(null));
      toiletMarkersRef.current = [];
    };
  }, [ready, toilets, position]);

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

      {/* 부모가 배정한 남은 화면 높이를 모두 사용해 모바일에서도 지도 영역을 확보한다. */}
      <div id="naver-map" className="h-full min-h-0 w-full" />
    </>
  );
}
