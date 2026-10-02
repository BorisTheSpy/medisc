/**
 * An original cartoon dancer in a dark tux, bow tie and sunglasses, mid horse-dance: knees out,
 * one hand holding the reins, the other swinging a lasso. Animated with the keyframes in index.css.
 */
export function Dancer({ size = 220 }: { size?: number }) {
  return (
    <svg className="dancer" width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
      <g className="dancer-body">
        {/* Legs, knees bowed outward */}
        <g className="dancer-legs">
          <path d="M80 126 L62 150 L68 176" fill="none" stroke="#1b1d26" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M120 126 L138 150 L132 176" fill="none" stroke="#1b1d26" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
          <ellipse cx="64" cy="181" rx="13" ry="6" fill="#0b0c10" />
          <ellipse cx="136" cy="181" rx="13" ry="6" fill="#0b0c10" />
        </g>
        {/* Jacket */}
        <path d="M70 72 Q100 60 130 72 L136 132 L64 132 Z" fill="#2a3b8f" />
        <path d="M86 72 L100 118 L114 72 Z" fill="#f4f1e8" />
        <circle cx="100" cy="95" r="3" fill="#1b1d26" />
        <circle cx="100" cy="108" r="3" fill="#1b1d26" />
        <path d="M92 74 L100 80 L108 74 L104 70 L96 70 Z" fill="#1b1d26" />
        {/* Reins hand, both fists together low in front */}
        <g className="dancer-reins">
          <path d="M72 84 Q78 108 94 112" fill="none" stroke="#2a3b8f" strokeWidth="12" strokeLinecap="round" />
          <circle cx="94" cy="114" r="8" fill="#f3c9a4" />
          <circle cx="104" cy="114" r="8" fill="#f3c9a4" />
        </g>
        {/* Lasso arm */}
        <g className="dancer-lasso">
          <path d="M128 82 Q140 70 148 54" fill="none" stroke="#2a3b8f" strokeWidth="12" strokeLinecap="round" />
          <circle cx="150" cy="50" r="8" fill="#f3c9a4" />
          <ellipse cx="160" cy="34" rx="18" ry="8" fill="none" stroke="#ffb340" strokeWidth="3" />
        </g>
        {/* Head */}
        <circle cx="100" cy="46" r="24" fill="#f3c9a4" />
        <path d="M76 42 Q100 14 124 42 Q112 32 100 34 Q88 32 76 42 Z" fill="#1b1d26" />
        <rect x="80" y="40" width="18" height="10" rx="3" fill="#0b0c10" />
        <rect x="102" y="40" width="18" height="10" rx="3" fill="#0b0c10" />
        <path d="M98 44 L102 44" stroke="#0b0c10" strokeWidth="2" />
        <path d="M90 58 Q100 66 110 58" fill="none" stroke="#1b1d26" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}
