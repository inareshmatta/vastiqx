import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "VastiqX — agentic architecture, Vastu, estimate and build planning";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#f8f4e8"/><path d="M 72 232 C 152 148 302 122 440 194 C 460 205 456 224 434 218 C 314 176 176 194 92 262 C 70 276 56 252 72 232 Z" fill="#78c22d"/><path d="M 116 414 L 256 112 L 396 414 L 338 414 L 256 238 L 174 414 Z" fill="#0b2418"/><path d="M 136 396 L 256 142 L 376 396 L 342 396 L 256 218 L 170 396 Z" fill="#78c22d"/><rect x="216" y="274" width="80" height="76" rx="6" fill="#e7a42a" stroke="#0b2418" stroke-width="7"/><line x1="256" y1="274" x2="256" y2="350" stroke="#0b2418" stroke-width="7"/><line x1="216" y1="312" x2="296" y2="312" stroke="#0b2418" stroke-width="7"/></svg>`;

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(135deg, #f8f4e8 0%, #f2eddf 62%, #e9eedf 100%)",
          padding: 56,
          gap: 40,
          color: "#0b2418",
          fontFamily: "Georgia, serif",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <img src={`data:image/svg+xml;utf8,${encodeURIComponent(markSvg)}`} width={82} height={82} style={{ borderRadius: 18 }} />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 42, fontWeight: 700, letterSpacing: "-1.5px", fontFamily: "Arial, sans-serif" }}>
                Vastiq<span style={{ color: "#3f8f12" }}>X</span>
              </div>
              <div style={{ display: "flex", fontSize: 13, letterSpacing: "3.6px", color: "#6d6a5c", fontFamily: "Arial, sans-serif" }}>
                DESIGN | VASTU | ESTIMATE | BUILD
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 16, letterSpacing: "3px", color: "#3f8f12", fontFamily: "Arial, sans-serif" }}>
              AGENTIC ARCHITECTURE & CONSTRUCTION PLANNING
            </div>
            <div style={{ display: "flex", fontSize: 66, lineHeight: 1.03, letterSpacing: "-2.6px", marginTop: 14, maxWidth: 700 }}>
              From brief to buildable plan.
            </div>
            <div style={{ display: "flex", fontSize: 22, color: "#4e5c50", marginTop: 16, maxWidth: 680, fontFamily: "Arial, sans-serif", lineHeight: 1.45 }}>
              Plans, 3D, elevations, Vastu, area compliance, room-wise cost and materials from one traceable parametric model.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["Typed tool-executed AI", "m2 / ft2 / gaj", "Room sum = built-up", "Gemma 4 via OpenRouter"].map((label) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  border: "1px solid #b9b09b",
                  borderRadius: 999,
                  padding: "7px 13px",
                  fontSize: 14,
                  color: "#173c2a",
                  background: "rgba(255,253,247,0.7)",
                  fontFamily: "Arial, sans-serif",
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            width: 365,
            display: "flex",
            flexDirection: "column",
            background: "#fbf8f0",
            border: "1px solid #d8d0be",
            borderRadius: 22,
            padding: 22,
            boxShadow: "0 20px 60px rgba(24,33,24,0.16)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6d6a5c", fontFamily: "Arial, sans-serif" }}>
            <span>LIVE SHEET · REVISION 12</span>
            <span style={{ color: "#3f8f12" }}>COMPLIANT</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, marginTop: 16, border: "1px solid #d8d0be", borderRadius: 12, padding: 14, gap: 8, background: "#fffdf7" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, height: 88, background: "#d9c3a5", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontFamily: "Arial, sans-serif" }}>LIVING</div>
              <div style={{ width: 112, height: 88, background: "#c98a6a", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontFamily: "Arial, sans-serif" }}>KITCHEN</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ width: 112, height: 74, background: "#8fa8b8", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontFamily: "Arial, sans-serif" }}>BED 1</div>
              <div style={{ width: 94, height: 74, background: "#7fa8a0", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontFamily: "Arial, sans-serif" }}>BATH</div>
              <div style={{ flex: 1, height: 74, background: "#9db3bf", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontFamily: "Arial, sans-serif" }}>BED 2</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, height: 58, background: "#b9d3a6", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontFamily: "Arial, sans-serif" }}>REAR GARDEN</div>
              <div style={{ width: 128, height: 58, background: "#9cc8d6", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontFamily: "Arial, sans-serif" }}>POOL</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6d6a5c", marginTop: 4, fontFamily: "Arial, sans-serif" }}>
              <span>132.8 m2 built-up</span>
              <span>3 bed · 3 bath</span>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontFamily: "Arial, sans-serif" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 11, color: "#6d6a5c", letterSpacing: "1px" }}>ESTIMATE</span>
              <span style={{ fontSize: 24, fontWeight: 700 }}>₹82.4 L</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", textAlign: "right" }}>
              <span style={{ fontSize: 11, color: "#6d6a5c", letterSpacing: "1px" }}>ROOM SUM</span>
              <span style={{ fontSize: 24, fontWeight: 700 }}>118.6 m2</span>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
