import { ImageResponse } from "next/og";
import { apiGetOrNull } from "@/lib/api";
import type { Genre, BookCardData, Paged } from "@/lib/types";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Genre at Books Temple Nepal";

interface GenreResp extends Paged<BookCardData> {
  genre: Genre;
}

export default async function Image({ params }: { params: Promise<{ genre: string }> }) {
  const { genre: slug } = await params;
  const data = await apiGetOrNull<GenreResp>(`/genres/${slug}`);
  const name = data?.genre?.name || "Books";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #eaf2fb 0%, #dbe9f7 100%)",
          padding: 72,
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontSize: 36, fontWeight: 700, color: "#1d76bc" }}>Books Temple</span>
          <span style={{ fontSize: 20, letterSpacing: 8, color: "#6b7c92" }}>NEPAL</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 30, letterSpacing: 4, color: "#6b7c92", textTransform: "uppercase" }}>Best in Nepal</div>
          <div style={{ fontSize: 80, lineHeight: 1.05, color: "#15233b", marginTop: 8 }}>{name} books</div>
        </div>
        <div style={{ fontSize: 28, color: "#6b7c92" }}>NPR prices · Cash on delivery · All seven provinces</div>
      </div>
    ),
    { ...size }
  );
}
