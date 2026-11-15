import { API_BASE } from "@/lib/api";

export const revalidate = 86400;
export const maxDuration = 60;

const FEED_URL = `${API_BASE}/feed/products.xml`;
const R2_COVERS_HOST = "pub-42418bf059814fca83907788f2d769f1.r2.dev";
const IMAGE_HOST = process.env.NEXT_PUBLIC_IMAGE_HOST || "https://images.bookstemple.com";
const RETRY_DELAY_MS = 1000;
const UPSTREAM_TIMEOUT_MS = 25_000;

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (character) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

function rewriteR2CoverHosts(xml: string) {
  const imageOrigin = new URL(IMAGE_HOST);
  if (imageOrigin.protocol !== "https:" || imageOrigin.pathname !== "/" || imageOrigin.search || imageOrigin.hash) {
    throw new Error("NEXT_PUBLIC_IMAGE_HOST must be an HTTPS origin");
  }

  return xml.replace(/(<g:image_link>)([\s\S]*?)(<\/g:image_link>)/g, (tag, open, encodedUrl, close) => {
    try {
      const imageUrl = new URL(encodedUrl.replace(/&amp;/g, "&"));
      if (
        imageUrl.protocol !== "https:" ||
        imageUrl.hostname !== R2_COVERS_HOST ||
        !imageUrl.pathname.startsWith("/covers/") ||
        !imageUrl.pathname.endsWith(".webp")
      ) {
        return tag;
      }

      imageUrl.host = imageOrigin.host;
      return `${open}${escapeXml(imageUrl.toString())}${close}`;
    } catch {
      return tag;
    }
  });
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET() {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(FEED_URL, {
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        headers: {
          Accept: "application/xml",
          ...(process.env.INTERNAL_API_KEY
            ? { "x-internal-key": process.env.INTERNAL_API_KEY }
            : {}),
        },
      });

      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Merchant feed API returned ${response.status}`);
      }

      const xml = await response.text();
      if (!xml.trimStart().startsWith("<?xml")) {
        throw new Error("Merchant feed API returned an invalid XML response");
      }

      return new Response(rewriteR2CoverHosts(xml), {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
        },
      });
    } catch (error) {
      lastError = error;
      if (attempt === 0) await wait(RETRY_DELAY_MS);
    }
  }

  console.error("Merchant feed API request failed after retry", lastError);
  return new Response("Merchant feed temporarily unavailable", {
    status: 503,
    headers: {
      "Retry-After": "300",
      "Cache-Control": "no-store",
    },
  });
}
