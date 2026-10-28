type RateLimitOptions = {
  scope: string;
  limit: number;
  windowMs: number;
};

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastCleanup = 0;

function getClientAddress(request: Request) {
  // 배포 플랫폼이 전달하는 첫 번째 원본 주소를 사용하고 로컬 환경은 하나의 주소로 묶는다.
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "local";
}

export function enforceRateLimit(request: Request, options: RateLimitOptions) {
  const now = Date.now();
  // 만료된 키를 주기적으로 제거해 장시간 실행되는 Node 서버에서 메모리가 계속 늘지 않게 한다.
  if (now - lastCleanup > options.windowMs) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
    lastCleanup = now;
  }

  const key = `${options.scope}:${getClientAddress(request)}`;
  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 1, resetAt: now + options.windowMs }
    : { ...current, count: current.count + 1 };
  buckets.set(key, bucket);

  if (bucket.count <= options.limit) return null;

  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return Response.json(
    { message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "Cache-Control": "no-store",
      },
    },
  );
}
