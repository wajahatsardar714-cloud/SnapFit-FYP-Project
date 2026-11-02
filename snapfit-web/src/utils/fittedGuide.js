// The live camera's fitted guide: a body outline drawn on the shopper's own
// detected pose (BlazePose's 33 landmarks), so it follows them -- arms open,
// it opens; they step closer, it grows -- and is as broad or slim as they are.
// Pure geometry plus a canvas painter; the live loop lives in
// useLivePoseDetection. The static PoseGuideOverlay shows until a body is found.
import { primaryInstruction } from './poseValidation';

// Landmark indices (BlazePose order).
const L = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
};

// A point counts for drawing a little below the gate's visibility threshold,
// so a limb that flickers in and out stays drawn.
export const DRAW_VISIBILITY = 0.35;

// Thicknesses as fractions of the shoulder width, a clothed adult's
// proportions; LOOSE puts the outline a little outside the body.
const LOOSE = 1.12;
const WIDTH = {
  neck: 0.3,
  upperArm: 0.34,
  forearm: 0.27,
  hand: 0.22,
  thigh: 0.44,
  shin: 0.31,
  foot: 0.22,
};

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const len = (a) => Math.hypot(a.x, a.y);
const unit = (a) => {
  const l = len(a);
  return l ? { x: a.x / l, y: a.y / l } : { x: 0, y: 1 };
};
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/**
 * The outline's shapes in pixels for one frame, or null without a torso.
 *   landmarks  33 normalised landmarks ({ x, y, visibility })
 *   width, height  the video frame size
 * Shapes: { type: 'line', a, b, width, region } (round-capped), { type:
 * 'ellipse', center, rx, ry, region } and { type: 'polygon', points, region };
 * regions: head | torso | arms | legs.
 */
export function fitBodyShapes(landmarks, { width, height }) {
  if (!Array.isArray(landmarks)) return null;
  const pt = (i) => {
    const lm = landmarks[i];
    return lm && (lm.visibility ?? 1) >= DRAW_VISIBILITY ? { x: lm.x * width, y: lm.y * height } : null;
  };
  const ls = pt(L.LEFT_SHOULDER);
  const rs = pt(L.RIGHT_SHOULDER);
  const lh = pt(L.LEFT_HIP);
  const rh = pt(L.RIGHT_HIP);
  if (!ls || !rs || !lh || !rh) return null;

  const shoulderMid = lerp(ls, rs, 0.5);
  const hipMid = lerp(lh, rh, 0.5);
  const torsoLength = len(sub(hipMid, shoulderMid));
  // Shoulder width sets the scale; a side-on body's narrow shoulders are
  // floored by the torso length so the outline never collapses.
  const s = Math.max(len(sub(ls, rs)), torsoLength * 0.55);
  const across = unit(sub(ls, rs));
  const down = unit(sub(hipMid, shoulderMid));
  const shapes = [];

  // Torso: shoulders, a waist and hips, wider than the joints themselves.
  const shoulderHalf = (s / 2) * LOOSE + s * 0.06;
  const hipHalf = Math.max((len(sub(lh, rh)) / 2) * 1.4, s * 0.4) * LOOSE;
  const waistHalf = ((shoulderHalf + hipHalf) / 2) * 0.86;
  const waistMid = lerp(shoulderMid, hipMid, 0.6);
  const crotch = add(hipMid, mul(down, s * 0.16));
  const side = (mid, half, sign) => add(mid, mul(across, half * sign));
  const top = (p) => sub(p, mul(down, s * 0.04));
  shapes.push({
    type: 'polygon',
    region: 'torso',
    points: [
      top(side(shoulderMid, shoulderHalf, 1)),
      side(waistMid, waistHalf, 1),
      side(hipMid, hipHalf, 1),
      side(crotch, hipHalf * 0.35, 1),
      side(crotch, hipHalf * 0.35, -1),
      side(hipMid, hipHalf, -1),
      side(waistMid, waistHalf, -1),
      top(side(shoulderMid, shoulderHalf, -1)),
    ],
  });

  // Head and neck, from the ears (or the nose) above the shoulders.
  const nose = pt(L.NOSE);
  const le = pt(L.LEFT_EAR);
  const re = pt(L.RIGHT_EAR);
  const headX = le && re ? (le.x + re.x) / 2 : nose ? nose.x : shoulderMid.x;
  const headBase = nose || sub(shoulderMid, mul(down, s * 0.55));
  const rx = s * 0.3 * LOOSE;
  const ry = rx * 1.28;
  const headCenter = { x: headX, y: headBase.y - ry * 0.18 };
  shapes.push({ type: 'line', region: 'head', a: add(headCenter, mul(down, ry * 0.6)), b: shoulderMid, width: s * WIDTH.neck });
  shapes.push({ type: 'ellipse', region: 'head', center: headCenter, rx, ry });

  // Arms and legs: round-capped strokes along the detected bones.
  const limb = (region, from, to, w) => {
    if (from && to) shapes.push({ type: 'line', region, a: from, b: to, width: s * w * LOOSE });
  };
  for (const [shoulder, elbow, wrist] of [
    [ls, pt(L.LEFT_ELBOW), pt(L.LEFT_WRIST)],
    [rs, pt(L.RIGHT_ELBOW), pt(L.RIGHT_WRIST)],
  ]) {
    // The upper arm starts inside the shoulder so it joins the torso smoothly.
    limb('arms', lerp(shoulder, shoulderMid, 0.12), elbow, WIDTH.upperArm);
    limb('arms', elbow, wrist, WIDTH.forearm);
    if (elbow && wrist) limb('arms', wrist, add(wrist, mul(unit(sub(wrist, elbow)), s * 0.16)), WIDTH.hand);
  }
  for (const [hip, knee, ankle, toe] of [
    [lh, pt(L.LEFT_KNEE), pt(L.LEFT_ANKLE), pt(L.LEFT_FOOT_INDEX)],
    [rh, pt(L.RIGHT_KNEE), pt(L.RIGHT_ANKLE), pt(L.RIGHT_FOOT_INDEX)],
  ]) {
    limb('legs', hip, knee, WIDTH.thigh);
    limb('legs', knee, ankle, WIDTH.shin);
    limb('legs', ankle, toe || (ankle && add(ankle, mul(down, s * 0.12))), WIDTH.foot);
  }
  return shapes;
}

/**
 * Eases the drawn pose toward the newest detection, so the outline glides
 * between the detector's ~7 updates a second instead of jumping.
 *   alpha  0..1, how far to move this frame (1 = snap to target)
 */
export function smoothLandmarks(previous, target, alpha) {
  if (!target) return previous;
  if (!previous) return target.map((lm) => lm && { ...lm });
  return target.map((lm, i) => {
    const prev = previous[i];
    if (!lm || !prev) return lm && { ...lm };
    return {
      ...lm,
      x: prev.x + (lm.x - prev.x) * alpha,
      y: prev.y + (lm.y - prev.y) * alpha,
      visibility: (prev.visibility ?? 1) + ((lm.visibility ?? 1) - (prev.visibility ?? 1)) * alpha,
    };
  });
}

// Which parts of the outline the shopper's current instruction is about.
const ARM_FIXES = ['Straighten your arms', 'Move your arms slightly away from your body', 'Lower your arms a little'];
const LEG_FIXES = ['Straighten your legs', 'Stand with your feet hip-width apart', 'Bring your feet a little closer together'];

/**
 * The outline's colour per region: all success once the pose passes; the
 * part the current instruction is about in warning; the rest foreground.
 */
export function regionTones(result) {
  const tones = { head: 'foreground', torso: 'foreground', arms: 'foreground', legs: 'foreground' };
  if (!result) return tones;
  if (result.ok) return { head: 'success', torso: 'success', arms: 'success', legs: 'success' };
  const instruction = primaryInstruction(result);
  const failing = result.checks.find((c) => !c.passed && !c.skipped)?.id;
  if (ARM_FIXES.includes(instruction)) tones.arms = 'warning';
  else if (LEG_FIXES.includes(instruction)) tones.legs = 'warning';
  else if (failing === 'level' || failing === 'facing') {
    tones.torso = 'warning';
    tones.head = 'warning';
  }
  return tones;
}

/**
 * Arrows showing which way to move, for the instructions a body part can act
 * out: { at, direction } in pixels (direction a unit vector).
 */
export function hintArrows(result, landmarks, { width, height }) {
  if (!result || result.ok || !Array.isArray(landmarks)) return [];
  const instruction = primaryInstruction(result);
  const pt = (i) => landmarks[i] && { x: landmarks[i].x * width, y: landmarks[i].y * height };
  const ls = pt(L.LEFT_SHOULDER);
  const rs = pt(L.RIGHT_SHOULDER);
  if (!ls || !rs) return [];
  const midX = (ls.x + rs.x) / 2;
  const outward = (p) => ({ x: Math.sign(p.x - midX) || 1, y: 0 });
  const arrowsAt = (indices, direction) =>
    indices.map(pt).filter(Boolean).map((at) => ({ at, direction: direction(at) }));

  switch (instruction) {
    case 'Move your arms slightly away from your body':
      return arrowsAt([L.LEFT_WRIST, L.RIGHT_WRIST], outward);
    case 'Lower your arms a little':
      return arrowsAt([L.LEFT_WRIST, L.RIGHT_WRIST], () => ({ x: 0, y: 1 }));
    case 'Stand with your feet hip-width apart':
      return arrowsAt([L.LEFT_ANKLE, L.RIGHT_ANKLE], outward);
    case 'Bring your feet a little closer together':
      return arrowsAt([L.LEFT_ANKLE, L.RIGHT_ANKLE], (p) => ({ x: -outward(p).x, y: 0 }));
    default:
      return [];
  }
}

function traceShape(ctx, shape, extra) {
  if (shape.type === 'line') {
    ctx.lineWidth = shape.width + extra * 2;
    ctx.beginPath();
    ctx.moveTo(shape.a.x, shape.a.y);
    ctx.lineTo(shape.b.x, shape.b.y);
    ctx.stroke();
  } else if (shape.type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(shape.center.x, shape.center.y, shape.rx + extra, shape.ry + extra, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.lineWidth = extra * 2;
    ctx.beginPath();
    shape.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
    if (extra) ctx.stroke();
  }
}

function drawArrow(ctx, { at, direction }, size) {
  const start = add(at, mul(direction, size * 0.6));
  const end = add(start, mul(direction, size * 1.4));
  const normal = { x: -direction.y, y: direction.x };
  ctx.lineWidth = size * 0.28;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(end.x + direction.x * size * 0.3, end.y + direction.y * size * 0.3);
  ctx.lineTo(end.x - direction.x * size * 0.4 + normal.x * size * 0.5, end.y - direction.y * size * 0.4 + normal.y * size * 0.5);
  ctx.lineTo(end.x - direction.x * size * 0.4 - normal.x * size * 0.5, end.y - direction.y * size * 0.4 - normal.y * size * 0.5);
  ctx.closePath();
  ctx.fill();
}

/**
 * Paints the fitted outline: a faint fill of the body and a bright outline
 * around the union of its parts, each part in its region's colour, plus any
 * hint arrows. `colors` maps tone names to CSS colours; `scratch` is a
 * reusable offscreen canvas for the outline.
 */
export function drawFittedGuide(ctx, scratch, { shapes, tones, arrows, colors }) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  if (!shapes) return;
  const outline = Math.max(width, height) / 160;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (scratch) {
    scratch.width = width;
    scratch.height = height;
    const s = scratch.getContext('2d');
    if (s) {
      s.lineCap = 'round';
      s.lineJoin = 'round';
      // Faint body fill: painted solid as one layer, then laid down faintly,
      // so overlapping parts (knees, shoulders) don't stack into darker spots.
      for (const shape of shapes) {
        s.fillStyle = colors[tones[shape.region]];
        s.strokeStyle = s.fillStyle;
        traceShape(s, shape, 0);
      }
      ctx.globalAlpha = 0.14;
      ctx.drawImage(scratch, 0, 0);

      // Outline of the union: each part grown by the outline width in its
      // colour, then the plain parts cut out of it.
      s.clearRect(0, 0, width, height);
      for (const shape of shapes) {
        s.fillStyle = colors[tones[shape.region]];
        s.strokeStyle = s.fillStyle;
        traceShape(s, shape, outline);
      }
      s.globalCompositeOperation = 'destination-out';
      for (const shape of shapes) traceShape(s, shape, 0);
      s.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.95;
      ctx.drawImage(scratch, 0, 0);
      ctx.globalAlpha = 1;
    }
  }

  ctx.fillStyle = colors.warning;
  ctx.strokeStyle = colors.warning;
  for (const arrow of arrows) drawArrow(ctx, arrow, outline * 5);
}
