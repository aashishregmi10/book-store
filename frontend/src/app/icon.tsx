import { ImageResponse } from "next/og";

// Brand favicon for Search/tabs. Code-generated so it scales crisply and needs
// no binary asset. Palette from /CLAUDE.md (forest green on warm off-white).
// ≥48×48 per Google's favicon guidance — rendered at 512 and downscaled.
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2D5A3D",
          color: "#FAF7F2",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 432,
            height: 432,
            border: "12px solid #FAF7F2",
            borderRadius: 40,
            fontSize: 300,
            fontWeight: 700,
            // Satori has no Cormorant; a serif stack keeps the literary feel.
            fontFamily: "Georgia, 'Times New Roman', serif",
            lineHeight: 1,
            paddingBottom: 24,
          }}
        >
          P
        </div>
      </div>
    ),
    { ...size }
  );
}
