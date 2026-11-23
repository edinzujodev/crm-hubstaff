/** A task board on a stand with four columns (To do, In progress, In review, Done): the login page's picture. */
export function LoginIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 300" className={className} role="img" aria-label="A task board with cards moving from To do to Done">
      {/* floor shadow */}
      <ellipse cx="210" cy="284" rx="170" ry="9" fill="#fff" opacity="0.18" />
      {/* plant */}
      <path d="M44 250c-10-30-6-58 8-78 6 24 4 52-8 78z" fill="#fff" opacity="0.35" />
      <path d="M50 252c4-34 22-56 44-64-6 28-22 50-44 64z" fill="#fff" opacity="0.25" />
      <rect x="34" y="248" width="30" height="34" rx="5" fill="#fff" opacity="0.55" />
      {/* stand */}
      <rect x="146" y="226" width="10" height="56" rx="3" fill="#e4e4e7" />
      <rect x="264" y="226" width="10" height="56" rx="3" fill="#e4e4e7" />
      {/* board */}
      <rect x="92" y="40" width="236" height="190" rx="10" fill="#fff" />
      <rect x="92" y="40" width="236" height="190" rx="10" fill="none" stroke="#d4d4d8" strokeWidth="2" />
      {[["To do", 104], ["In progress", 162], ["In review", 220], ["Done", 278]].map(([label, x]) => (
        <g key={label as string}>
          <text x={(x as number) + 25} y="62" textAnchor="middle" fontSize="9" fontWeight="600" fill="#3f3f46" fontFamily="inherit">
            {label}
          </text>
          <rect x={x as number} y="70" width="50" height="150" rx="5" fill="#f4f4f5" />
        </g>
      ))}
      {/* cards */}
      <rect x="109" y="78" width="40" height="30" rx="4" fill="#27272a" />
      <rect x="109" y="116" width="40" height="30" rx="4" fill="#fbbf24" />
      <rect x="167" y="78" width="40" height="30" rx="4" fill="#8b5cf6" />
      <rect x="167" y="116" width="40" height="22" rx="4" fill="#d4d4d8" />
      <rect x="225" y="78" width="40" height="30" rx="4" fill="#71717a" />
      <rect x="283" y="78" width="40" height="30" rx="4" fill="#34d399" />
      <rect x="283" y="116" width="40" height="30" rx="4" fill="#34d399" opacity="0.7" />
      {/* lines on cards */}
      {[[109, 78], [109, 116], [167, 78], [225, 78], [283, 78], [283, 116]].map(([x, y]) => (
        <g key={`${x}-${y}`} opacity="0.75">
          <rect x={x + 6} y={y + 8} width="24" height="3" rx="1.5" fill="#fff" />
          <rect x={x + 6} y={y + 15} width="16" height="3" rx="1.5" fill="#fff" />
        </g>
      ))}
      {/* check on a done card */}
      <circle cx="318" cy="80" r="9" fill="#fff" />
      <path d="M313.5 80.5l3 3 6-6.5" fill="none" stroke="#10b981" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      {/* card being moved */}
      <g transform="rotate(-8 245 150)">
        <rect x="226" y="132" width="40" height="30" rx="4" fill="#f472b6" />
        <rect x="232" y="140" width="24" height="3" rx="1.5" fill="#fff" opacity="0.8" />
        <rect x="232" y="147" width="16" height="3" rx="1.5" fill="#fff" opacity="0.8" />
      </g>
      <path d="M212 160c8 10 18 12 28 6" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="3 4" strokeLinecap="round" opacity="0.9" />
      {/* side chart */}
      <rect x="344" y="120" width="54" height="72" rx="8" fill="#fff" opacity="0.9" />
      <rect x="354" y="166" width="8" height="16" rx="2" fill="#a1a1aa" />
      <rect x="367" y="152" width="8" height="30" rx="2" fill="#71717a" />
      <rect x="380" y="138" width="8" height="44" rx="2" fill="#18181b" />
    </svg>
  );
}
