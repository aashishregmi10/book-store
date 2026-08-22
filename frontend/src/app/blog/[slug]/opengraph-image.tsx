import { ImageResponse } from "next/og";
import { apiGetOrNull } from "@/lib/api";
import type { ArticleDetail } from "@/lib/types";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Article at Books Temple Nepal";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await apiGetOrNull<ArticleDetail>(`/articles/${slug}`);

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
          {a?.category && (
            <div style={{ fontSize: 26, letterSpacing: 4, color: "#1d76bc", textTransform: "uppercase" }}>{a.category}</div>
          )}
          <div style={{ fontSize: 64, lineHeight: 1.1, color: "#15233b", marginTop: 12 }}>{a?.title || "Reading guide"}</div>
        </div>
        <div style={{ fontSize: 28, color: "#6b7c92" }}>{a?.author || "Books Temple Editors"} · Books Temple Nepal</div>
      </div>
    ),
    { ...size }
  );
}
