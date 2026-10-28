type Coordinate = { lat: number; lng: number; name?: string };
type Destination = Coordinate & { name: string };

function assertCoordinate(point: Coordinate) {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) ||
    Math.abs(point.lat) >= 85.05112878 || Math.abs(point.lng) > 180) {
    throw new Error("길찾기에 사용할 위치가 올바르지 않습니다.");
  }
}

export function buildNaverDirectionsLinks(start: Coordinate, destination: Destination, appname: string) {
  assertCoordinate(start);
  assertCoordinate(destination);
  // 웹 길찾기 경로에는 위·경도가 아닌 Web Mercator 좌표를 사용한다.
  const webPoint = (point: Coordinate, name: string) => {
    const x = 6378137 * point.lng * Math.PI / 180;
    const y = 6378137 * Math.log(Math.tan(Math.PI / 4 + point.lat * Math.PI / 360));
    return `${x},${y},${encodeURIComponent(name)},,`;
  };
  const startName = start.name || "선택한 위치";
  const web = `https://map.naver.com/p/directions/${webPoint(start, startName)}/${webPoint(destination, destination.name)}/-/walk`;
  // 앱 스킴은 공식 문서의 도보 길찾기 파라미터를 사용하고 한글·특수문자는 인코딩한다.
  const params = new URLSearchParams({
    slat: String(start.lat), slng: String(start.lng), sname: startName,
    dlat: String(destination.lat), dlng: String(destination.lng), dname: destination.name, appname,
  }).toString();
  return {
    web,
    app: `nmap://route/walk?${params}`,
    android: `intent://route/walk?${params}#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;end`,
  };
}

export function getLocationErrorMessage(error: Pick<GeolocationPositionError, "code">) {
  if (error.code === 1) return "현재 위치 사용을 허용해 주세요. 브라우저의 위치 권한 설정에서 변경할 수 있어요.";
  if (error.code === 2) return "현재 위치를 확인할 수 없습니다. 기기의 위치 설정을 확인해 주세요.";
  if (error.code === 3) return "위치 확인 시간이 초과됐습니다. 다시 시도해 주세요.";
  return "현재 위치를 확인하지 못했습니다. 다시 시도해 주세요.";
}
