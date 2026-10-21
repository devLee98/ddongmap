import Link from "next/link";

export default function ToiletDetailPage({ toiletId }: { toiletId: string }) {
  return (
    <section>
      <h1>공중화장실 상세정보</h1>
      <p>화장실 ID: {toiletId}</p>
      <Link href="/">주변 화장실 찾기</Link>
    </section>
  );
}
