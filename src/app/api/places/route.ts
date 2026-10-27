export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("query")?.trim();

  if (!query) {
    return Response.json(
      { message: "검색어를 입력해주세요." },
      { status: 400 },
    );
  }

  // 인증 정보는 서버에서만 읽어 브라우저에 Secret이 노출되지 않게 한다.
  const clientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return Response.json(
      { message: "검색 API 인증 정보가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  const url = new URL(
    "https://naverapihub.apigw.ntruss.com/search/v1/local",
  );
  url.searchParams.set("query", query);
  url.searchParams.set("display", "5");
  url.searchParams.set("format", "json");

  try {
    // API HUB 전용 인증 헤더를 사용하고 외부 응답 대기 시간을 제한한다.
    const response = await fetch(url, {
      headers: {
        "X-NCP-APIGW-API-KEY-ID": clientId,
        "X-NCP-APIGW-API-KEY": clientSecret,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    // 외부 오류 원문 대신 사용자에게 필요한 오류 메시지만 반환한다.
    if (!response.ok) {
      return Response.json(
        { message: "네이버 장소 검색에 실패했습니다." },
        { status: 502 },
      );
    }

    const data = await response.json();

    return Response.json({ items: data.items });
  } catch {
    // 네트워크 장애와 시간 초과도 JSON으로 반환해 화면에서 처리하게 한다.
    return Response.json(
      { message: "검색 서버에 연결할 수 없습니다." },
      { status: 502 },
    );
  }
}
