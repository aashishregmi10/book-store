// Serves the IndexNow key file so search engines can verify ownership.
// The same value must be set as INDEXNOW_KEY on the backend (which sends pings).
export const dynamic = "force-static";

export function GET() {
  const key = process.env.NEXT_PUBLIC_INDEXNOW_KEY || "";
  return new Response(key, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
