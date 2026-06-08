import { ImageResponse } from "next/og";
import { apiGetOrNull } from "@/lib/api";
import type { BookDetail } from "@/lib/types";
import { npr } from "@/lib/format";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Book at PageTurn Nepal";

interface BookResp {
  book: BookDetail;
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await apiGetOrNull<BookResp>(`/books/${slug}`);
  const book = data?.book;

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
        {book?.coverImage?.secureUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={book.coverImage.secureUrl}
            alt=""
            width={336}
            height={504}
            style={{ objectFit: "cover", borderRadius: 12, boxShadow: "0 20px 40px rgba(21,35,59,0.25)" }}
          />
        )}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 32, fontWeight: 700, color: "#1c5fa6" }}>PageTurn</span>
            <span style={{ fontSize: 18, letterSpacing: 6, color: "#6b7c92" }}>NEPAL</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 58, lineHeight: 1.05, color: "#15233b" }}>{book?.title || "A good book"}</div>
            <div style={{ fontSize: 30, color: "#6b7c92", marginTop: 16 }}>{book?.author || ""}</div>
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, color: "#1c5fa6" }}>{book ? npr(book.price) : ""}</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
