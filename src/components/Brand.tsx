export function BrandLogo({ className, height = 38 }: { className?: string; height?: number }) {
  return (
    <img
      className={className}
      src="/brand/vastiqx-logo.svg"
      alt="VastiqX — Design, Vastu, Estimate, Build"
      height={height}
      style={{ height, width: "auto" }}
    />
  );
}

export function BrandMark({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <img
      className={className}
      src="/brand/vastiqx-mark.svg"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.26) }}
    />
  );
}

export function BrandLockup({ size = 34, light = false }: { size?: number; light?: boolean }) {
  return (
    <span className={`brand-lockup ${light ? "light" : ""}`}>
      <BrandMark size={size} />
      <span className="brand-lockup-word">
        Vastiq<span>X</span>
      </span>
    </span>
  );
}
