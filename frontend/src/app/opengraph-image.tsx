import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Books Temple Nepal: buy books online in Nepal";

// Branded default social/AI preview card. Per-page (book/genre/article) OG
// images can be added later with their own opengraph-image files.
export default function OpengraphImage() {
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
          <span style={{ fontSize: 40, fontWeight: 700, color: "#1c5fa6" }}>Books Temple</span>
          <span style={{ fontSize: 22, letterSpacing: 8, color: "#6b7c92" }}>NEPAL</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, lineHeight: 1.05, color: "#15233b" }}>Books worth reading,</div>
          <div style={{ fontSize: 76, lineHeight: 1.05, color: "#1c5fa6" }}>delivered across Nepal.</div>
        </div>
        <div style={{ fontSize: 28, color: "#6b7c92" }}>
          NPR prices · Cash on delivery · All seven provinces
        </div>
      </div>
    ),
    { ...size }
  );
}
