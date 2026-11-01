import Link from "next/link";
import { BrandLogo } from "@/components/Brand";

export default function NotFound() {
  return (
    <main className="container" style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: "80px 0" }}>
      <div style={{ maxWidth: 560, textAlign: "center" }}>
        <BrandLogo height={52} />
        <p className="eyebrow" style={{ justifyContent: "center", marginTop: 28 }}>404 · sheet not found</p>
        <h1 style={{ fontSize: "clamp(36px, 6vw, 62px)", margin: "12px 0 10px" }}>This drawing is not in the set.</h1>
        <p className="muted" style={{ marginBottom: 22 }}>
          The project or page may have moved. Open the workspace and start from the live demo instead.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <Link className="btn btn-primary" href="/dashboard">Open projects</Link>
          <Link className="btn" href="/">Back home</Link>
        </div>
      </div>
    </main>
  );
}
