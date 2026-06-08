import { ImageResponse } from "next/og";

// Apple touch icon (home-screen). Apple masks corners itself, so we fill the
// canvas and inset the bookplate frame. Same palette as icon.tsx.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
            fontSize: 120,
            fontWeight: 700,
            fontFamily: "Georgia, 'Times New Roman', serif",
            lineHeight: 1,
            paddingBottom: 10,
          }}
        >
          P
        </div>
      </div>
    ),
    { ...size }
  );
}
