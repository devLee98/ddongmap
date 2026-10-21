import NaverMap from "./naver-map";

export default function HomePage() {
  return (
    // 배치를 쉽게 파악하고 수정할 수 있도록 검색, 목록, 지도를 위에서 아래로 배치한다.
    <div className="space-y-6 p-4">
      <section aria-label="화장실 검색" className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <input
            aria-label="지역 또는 장소"
            placeholder="지역 또는 장소를 입력하세요"
            className="w-full border p-2"
          />
          <button disabled className="border p-2">
            검색
          </button>
          <button disabled className="border p-2">
            내 위치
          </button>
        </div>
        <p>화면 구성 미리보기입니다. 검색과 위치 기능은 준비 중입니다.</p>
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
        <NaverMap />
      </section>
    </div>
  );
}
