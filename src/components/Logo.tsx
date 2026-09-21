export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-label="Medisc">
      <rect width="64" height="64" rx="14" fill="#1b3f7a" />
      <circle cx="32" cy="30" r="19" fill="#ffb340" />
      <circle cx="32" cy="30" r="10" fill="none" stroke="#1b3f7a" strokeWidth="4" />
      <circle cx="32" cy="30" r="3.5" fill="#1b3f7a" />
      <path d="M15 52h34" stroke="#eef3fa" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
