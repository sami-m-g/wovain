import { ImageResponse } from "next/og";

export const size = { height: 180, width: 180 };
export const contentType = "image/png";

const AppleIcon = () =>
  new ImageResponse(
    <div
      style={{
        background: "#3b4cca",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
        padding: 20,
        width: "100%",
      }}
    >
      <div
        style={{
          background: "#f6f7fb",
          borderRadius: 999,
          height: 30,
          width: 30,
        }}
      />
      <div style={{ background: "#ffffff", height: 44, width: "100%" }} />
    </div>,
    size
  );

export default AppleIcon;
