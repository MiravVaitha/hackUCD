import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon for iOS, which does not use SVG icons. */
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
          background: "#0a1120",
        }}
      >
        <svg width="132" height="132" viewBox="0 0 64 64">
          <path
            d="M32 9 13 15.7v14.4c0 11.3 7.6 20.8 19 25.6 11.4-4.8 19-14.3 19-25.6V15.7L32 9Z"
            fill="#0f7b5f"
          />
          <path
            d="M27.2 35.4h-1.9a5.4 5.4 0 0 1 0-10.8h4.8a5.4 5.4 0 0 1 5.2 4M36.8 28.6h1.9a5.4 5.4 0 0 1 0 10.8h-4.8a5.4 5.4 0 0 1-5.2-4"
            fill="none"
            stroke="#ffffff"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    size,
  );
}
