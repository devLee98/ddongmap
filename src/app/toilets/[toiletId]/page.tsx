import ToiletDetailPage from "@/components/toilets/toilet-detail-page";

export default async function Page({
  params,
}: {
  params: Promise<{ toiletId: string }>;
}) {
  // URL의 화장실 ID를 화면에 전달하기 위해 비동기 경로 매개변수를 먼저 해제한다.
  const { toiletId } = await params;

  return <ToiletDetailPage toiletId={toiletId} />;
}
