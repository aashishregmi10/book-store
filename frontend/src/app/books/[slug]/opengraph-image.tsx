import { ImageResponse } from "next/og";
import { apiGetOrNull } from "@/lib/api";
import type { BookDetail } from "@/lib/types";
import { npr } from "@/lib/format";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Book at Books Temple Nepal";

interface BookResp {
  book: BookDetail;
}

/**
 * Covers are stored as WebP, and Satori — the renderer behind next/og — has no
 * WebP decoder. It does not throw: it logs "Unsupported image type: image/webp",
 * leaves an empty box where the cover should be, and returns a valid PNG. So
 * every shared book link was showing a card with a blank space beside the title.
 *
 * backend/scripts/build-og-covers.js writes a JPEG sibling of each cover for
 * this one consumer. Anything that is not one of our own R2 covers — the few
 * still on the dead Cloudinary host, Open Library seeds in dev — is left alone
 * and simply does not render, which is the same outcome as before.
 */
function ogCover(url?: string): string | undefined {
  if (!url || !url.includes("/covers/") || !url.endsWith(".webp")) return undefined;
  return url.replace(/\.webp$/, "-og.jpg");
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await apiGetOrNull<BookResp>(`/books/${slug}`);
  const book = data?.book;
  const cover = ogCover(book?.coverImage?.secureUrl);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(135deg, #eaf2fb 0%, #dbe9f7 100%)",
          padding: 64,
          gap: 48,
          fontFamily: "Georgia, serif",
        }}
      >
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            width={336}
            height={504}
            style={{ objectFit: "cover", borderRadius: 12, boxShadow: "0 20px 40px rgba(21,35,59,0.25)" }}
          />
        )}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 32, fontWeight: 700, color: "#1d76bc" }}>Books Temple</span>
            <span style={{ fontSize: 18, letterSpacing: 6, color: "#6b7c92" }}>NEPAL</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 58, lineHeight: 1.05, color: "#15233b" }}>{book?.title || "A good book"}</div>
            <div style={{ fontSize: 30, color: "#6b7c92", marginTop: 16 }}>{book?.author || ""}</div>
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, color: "#1d76bc" }}>{book ? npr(book.price) : ""}</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
