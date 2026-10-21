import { redirect } from "next/navigation";

export default function UnknownPage() {
  // 정의된 페이지와 일치하지 않는 경로는 서버에서 홈으로 이동시킨다.
  redirect("/");
}
