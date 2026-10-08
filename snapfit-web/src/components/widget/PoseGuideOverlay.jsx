import { useId } from 'react';
import { POSE_GUIDE } from '../../config/poseConfig';

// Colour comes from the theme via currentColor (the camera viewport is scoped
// to the dark palette, so these are its bright shades).
const STATE_STYLES = {
  searching: { className: 'text-foreground', opacity: 0.75 },
  partial: { className: 'text-warning', opacity: 0.95 },
  aligned: { className: 'text-success', opacity: 1 },
};

const OUTLINE_HEADS = 0.07;

// The figure as simple shapes in head-height units, origin at the top-centre of
// the head, y pointing down. Lines are drawn as thick round-capped strokes.
function buildFigure(g) {
  const rad = (g.armAngleDeg * Math.PI) / 180;
  const shapes = [{ type: 'ellipse', cx: 0, cy: 0.5, rx: g.headWidth / 2, ry: 0.5 }];

  shapes.push({ type: 'line', points: [[0, 0.9], [0, 1 + g.neckLength + 0.2]], width: 0.4 });

  const shoulderHalf = g.shoulderWidth / 2;
  const hipHalf = g.hipWidth / 2;
  shapes.push({
    type: 'polygon',
    points: [
      [-shoulderHalf, g.shoulderY],
      [shoulderHalf, g.shoulderY],
      [g.waistWidth / 2, g.waistY],
      [hipHalf, g.hipY],
      [hipHalf * 0.85, g.crotchY],
      [-hipHalf * 0.85, g.crotchY],
      [-hipHalf, g.hipY],
      [-g.waistWidth / 2, g.waistY],
    ],
  });

  for (const side of [-1, 1]) {
    const shoulder = [side * (shoulderHalf - g.upperArmWidth / 2), g.shoulderY + g.upperArmWidth / 2];
    const along = (fraction) => [
      shoulder[0] + side * Math.sin(rad) * g.armLength * fraction,
      shoulder[1] + Math.cos(rad) * g.armLength * fraction,
    ];
    shapes.push({ type: 'line', points: [shoulder, along(0.45)], width: g.upperArmWidth });
    shapes.push({ type: 'line', points: [along(0.45), along(0.82)], width: g.forearmWidth });
    shapes.push({ type: 'line', points: [along(0.84), along(1)], width: 0.32 });

    const hipX = side * (hipHalf - g.thighWidth / 2);
    const legTop = g.crotchY - 0.35;
    const ankleX = (side * g.feetApart) / 2;
    const ankleY = legTop + g.legLength;
    shapes.push({
      type: 'polygon',
      points: [
        [hipX - g.thighWidth / 2, legTop],
        [hipX + g.thighWidth / 2, legTop],
        [ankleX + g.ankleWidth / 2, ankleY],
        [ankleX - g.ankleWidth / 2, ankleY],
      ],
    });
    shapes.push({ type: 'line', points: [[ankleX, ankleY], [ankleX + side * 0.3, g.headsTall - 0.1]], width: 0.28 });
  }
  return shapes;
}

function Shapes({ shapes, toPx, unit, extra, color }) {
  const pts = (points) => points.map((p) => toPx(p).join(',')).join(' ');
  return shapes.map((shape, i) => {
    const common = { key: i, stroke: color, strokeLinejoin: 'round', strokeLinecap: 'round' };
    if (shape.type === 'ellipse') {
      const [cx, cy] = toPx([shape.cx, shape.cy]);
      return <ellipse {...common} cx={cx} cy={cy} rx={shape.rx * unit} ry={shape.ry * unit} fill={color} strokeWidth={extra * unit} />;
    }
    if (shape.type === 'polygon') {
      return <polygon {...common} points={pts(shape.points)} fill={color} strokeWidth={(0.15 + extra) * unit} />;
    }
    const [[x1, y1], [x2, y2]] = shape.points.map(toPx);
    return <line {...common} x1={x1} y1={y1} x2={x2} y2={y2} fill="none" strokeWidth={(shape.width + extra) * unit} />;
  });
}

// A-pose body outline in standard proportions, sized to the accepted framing
// zone of the live pose gate and drawn in video-pixel space (width x height), so
// a correctly placed person fills it in both portrait and landscape.
// state: 'searching' | 'partial' | 'aligned'.
function PoseGuideOverlay({ width, height, state = 'searching' }) {
  // Frame size in the id too: separate React roots (several widgets on one page)
  // can produce the same useId, and a shared id would borrow the wrong mask.
  const maskId = `pose-guide-${useId().replace(/:/g, '')}-${width}x${height}`;
  if (!width || !height) return null;

  const guide = POSE_GUIDE;
  const unit = (guide.bodyHeightFraction * height) / guide.headsTall;
  const top = (height - guide.bodyHeightFraction * height) / 2;
  const toPx = ([x, y]) => [width / 2 + x * unit, top + y * unit];
  const shapes = buildFigure(guide);
  const { className, opacity } = STATE_STYLES[state] || STATE_STYLES.searching;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      aria-hidden="true"
      data-state={state}
    >
      <defs>
        {/* Outline of the union of all shapes: grown copy minus the plain copy.
            White/black here are mask luminance (show/hide), not colours. */}
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
          <Shapes shapes={shapes} toPx={toPx} unit={unit} extra={OUTLINE_HEADS * 2} color="white" />
          <Shapes shapes={shapes} toPx={toPx} unit={unit} extra={0} color="black" />
        </mask>
      </defs>
      <g opacity={0.12}>
        <Shapes shapes={shapes} toPx={toPx} unit={unit} extra={0} color="currentColor" />
      </g>
      <rect width={width} height={height} fill="currentColor" fillOpacity={opacity} mask={`url(#${maskId})`} />
    </svg>
  );
}

export default PoseGuideOverlay;
