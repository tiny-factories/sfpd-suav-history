import { ImageResponse } from "next/og";

export const alt = "SFPD Drone Flight Logs — Map of sUAS flight logs from DataSF";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #f5f5f4 0%, #e4e4e7 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 48,
            maxWidth: 900,
          }}
        >
          <div
            style={{
              fontSize: 28,
              color: "#52525b",
              marginBottom: 16,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            San Francisco Police Department
          </div>
          <h1
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: "#171717",
              margin: 0,
              textAlign: "center",
              lineHeight: 1.1,
            }}
          >
            Drone Flight Logs
          </h1>
          <div
            style={{
              width: 120,
              height: 6,
              background: "#1d4ed8",
              borderRadius: 3,
              marginTop: 24,
            }}
          />
          <p
            style={{
              fontSize: 26,
              color: "#52525b",
              marginTop: 32,
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
            Interactive map of sUAS flight logs from DataSF
          </p>
        </div>
      </div>
    ),
    { ...size }
  );
}
