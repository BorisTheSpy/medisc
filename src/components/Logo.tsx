export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-label="Medisc">
      <circle cx="32" cy="32" r="30" fill="#E9A83A" />
      <circle cx="32" cy="32" r="18" fill="none" stroke="#1B3F7A" strokeWidth="5" />
      <circle cx="32" cy="32" r="6" fill="#1B3F7A" />
      <path d="M12 44 L52 44" stroke="#1B3F7A" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
