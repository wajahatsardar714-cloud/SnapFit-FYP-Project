import './sizingMock.css';

const SILHOUETTE =
  'M140 118 L180 118 L206 128 Q214 132 214 142 L218 222 Q218 230 210 230 L204 230 L200 150 L196 150 L194 228 L190 300 L168 300 L162 240 L158 240 L152 300 L130 300 L126 228 L124 150 L120 150 L116 230 L110 230 Q102 230 102 222 L106 142 Q106 132 114 128 Z';
const SHIRT = 'M140 120 Q160 134 180 120 L208 130 L220 160 L202 168 L198 156 L196 210 L124 210 L122 156 L118 168 L100 160 L112 130 Z';

// A measurement line with end ticks; it draws in from its centre.
function MeasureLine({ y, x1, x2, className }) {
  return (
    <g className={`sf-mock-line ${className}`}>
      <path d={`M${x1} ${y} H${x2} M${x1} ${y - 6} V${y + 6} M${x2} ${y - 6} V${y + 6}`} strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

/**
 * Decorative hero art: a phone showing a body silhouette, measurement lines
 * drawing in, a size chip and a shirt changing colour (CSS loop in
 * sizingMock.css, static under reduced motion). Hidden from assistive tech.
 *   labels  { title, chest, waist, size } -- the text drawn in the art
 */
function SizingMock({ labels }) {
  return (
    <svg
      viewBox="0 0 320 400"
      aria-hidden="true"
      focusable="false"
      className="h-auto w-full max-w-[20rem] font-sans"
    >
      <rect x="44" y="8" width="232" height="384" rx="32" className="fill-navy-raised stroke-inverse/20" strokeWidth="2" />
      <rect x="56" y="24" width="208" height="352" rx="20" className="fill-navy" />
      <rect x="140" y="32" width="40" height="6" rx="3" className="fill-inverse/20" />
      <text x="160" y="62" textAnchor="middle" fontSize="12" fontWeight="600" className="fill-inverse-muted">
        {labels.title}
      </text>

      <circle cx="160" cy="94" r="20" className="fill-inverse-accent/30" />
      <rect x="152" y="108" width="16" height="14" className="fill-inverse-accent/30" />
      <path d={SILHOUETTE} className="fill-inverse-accent/30" />
      <path d={SHIRT} className="fill-primary" />
      <path d={SHIRT} className="sf-mock-tryon fill-success" />

      <g className="stroke-inverse">
        <MeasureLine y={150} x1={112} x2={222} className="sf-mock-line-1" />
        <MeasureLine y={194} x1={126} x2={222} className="sf-mock-line-2" />
      </g>
      <g fontSize="12" fontWeight="600" className="sf-mock-label fill-inverse">
        <text x="228" y="154">
          {labels.chest}
        </text>
        <text x="228" y="198">
          {labels.waist}
        </text>
      </g>

      <g className="sf-mock-chip">
        <rect x="64" y="318" width="192" height="34" rx="17" className="fill-primary" />
        <text x="160" y="340" textAnchor="middle" fontSize="13" fontWeight="600" className="fill-inverse">
          {labels.size}
        </text>
      </g>
    </svg>
  );
}

export default SizingMock;
