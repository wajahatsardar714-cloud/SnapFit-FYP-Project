import { POSE_RULES } from '../config/poseConfig';

// Pure pose-gate logic shared by every live camera (desktop widget, phone via QR,
// AI test bench). The AI service applies the same rules to uploaded photos in
// snapfit-ai/app/pose_validator.py -- keep check ids, order and messages in sync.

// BlazePose's 33 landmarks, in index order.
export const LANDMARK_NAMES = [
  'NOSE',
  'LEFT_EYE_INNER',
  'LEFT_EYE',
  'LEFT_EYE_OUTER',
  'RIGHT_EYE_INNER',
  'RIGHT_EYE',
  'RIGHT_EYE_OUTER',
  'LEFT_EAR',
  'RIGHT_EAR',
  'MOUTH_LEFT',
  'MOUTH_RIGHT',
  'LEFT_SHOULDER',
  'RIGHT_SHOULDER',
  'LEFT_ELBOW',
  'RIGHT_ELBOW',
  'LEFT_WRIST',
  'RIGHT_WRIST',
  'LEFT_PINKY',
  'RIGHT_PINKY',
  'LEFT_INDEX',
  'RIGHT_INDEX',
  'LEFT_THUMB',
  'RIGHT_THUMB',
  'LEFT_HIP',
  'RIGHT_HIP',
  'LEFT_KNEE',
  'RIGHT_KNEE',
  'LEFT_ANKLE',
  'RIGHT_ANKLE',
  'LEFT_HEEL',
  'RIGHT_HEEL',
  'LEFT_FOOT_INDEX',
  'RIGHT_FOOT_INDEX',
];

const PASSED_LABELS = {
  lighting: 'Lighting looks good',
  visibility: 'Whole body visible',
  framing: 'Body inside the frame',
  distance: 'Good distance from the camera',
  centered: 'Centred in the frame',
  facing: 'Facing the camera',
  level: 'Standing straight',
  pose: 'Arms and legs in position',
  stillness: 'Holding still',
};
const SKIPPED_MESSAGE = 'Waiting for your whole body to be visible';

const FEET = ['LEFT_ANKLE', 'RIGHT_ANKLE', 'LEFT_HEEL', 'RIGHT_HEEL'];
const ARMS = ['LEFT_ELBOW', 'RIGHT_ELBOW', 'LEFT_WRIST', 'RIGHT_WRIST'];
const FEET_EXTENT = ['LEFT_HEEL', 'RIGHT_HEEL', 'LEFT_FOOT_INDEX', 'RIGHT_FOOT_INDEX', 'LEFT_ANKLE', 'RIGHT_ANKLE'];
// Points that must stay put for the stillness check.
const STILLNESS_POINTS = ['NOSE', 'LEFT_SHOULDER', 'RIGHT_SHOULDER', 'LEFT_HIP', 'RIGHT_HIP', 'LEFT_WRIST', 'RIGHT_WRIST', 'LEFT_ANKLE', 'RIGHT_ANKLE'];
const SIDES = ['LEFT', 'RIGHT'];

export function toNamedLandmarks(landmarks) {
  if (!Array.isArray(landmarks)) return landmarks;
  return Object.fromEntries(LANDMARK_NAMES.map((name, i) => [name, landmarks[i]]).filter(([, lm]) => lm));
}

// Normalised coords -> "frame height" units, so angles and distances aren't
// skewed by non-square frames.
const toPoint = (lm, aspect) => ({ x: lm.x * aspect, y: lm.y });
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const degrees = (radians) => (radians * 180) / Math.PI;

function angleBetween(v1, v2) {
  const norm = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (norm === 0) return 0;
  const cos = (v1.x * v2.x + v1.y * v2.y) / norm;
  return degrees(Math.acos(Math.max(-1, Math.min(1, cos))));
}

const vector = (from, to) => ({ x: to.x - from.x, y: to.y - from.y });
const DOWN = { x: 0, y: 1 };
const jointAngle = (a, joint, b) => angleBetween(vector(joint, a), vector(joint, b));
const lineTilt = (a, b) => degrees(Math.atan2(Math.abs(a.y - b.y), Math.abs(a.x - b.x) || 1e-9));

const check = (id, passed, message) => ({ id, passed, message: passed ? PASSED_LABELS[id] : message });

function checkLighting(brightness, rules) {
  if (brightness < rules.brightnessMin) return check('lighting', false, "It's too dark — move somewhere brighter");
  if (brightness > rules.brightnessMax) {
    return check('lighting', false, "It's too bright — avoid strong light behind or in front of you");
  }
  return check('lighting', true);
}

function checkVisibility(named, rules) {
  const missing = rules.requiredLandmarks.filter((name) => (named[name]?.visibility ?? 0) < rules.visibilityThreshold);
  if (missing.length === 0) return check('visibility', true);
  if (missing.some((name) => FEET.includes(name))) return check('visibility', false, 'Step back so your feet are visible');
  if (missing.includes('NOSE')) return check('visibility', false, 'Step back so your head is visible');
  if (missing.every((name) => ARMS.includes(name))) {
    return check('visibility', false, 'Keep both arms in view, held slightly away from your body');
  }
  return check('visibility', false, 'Step back so your whole body is in the frame');
}

export function bodyExtent(named, rules = POSE_RULES) {
  const noseY = named.NOSE.y;
  const shoulderY = (named.LEFT_SHOULDER.y + named.RIGHT_SHOULDER.y) / 2;
  const xs = rules.requiredLandmarks.map((name) => named[name].x);
  return {
    headTop: noseY - rules.headTopFromNoseFactor * (shoulderY - noseY),
    feetBottom: Math.max(...FEET_EXTENT.filter((name) => named[name]).map((name) => named[name].y)),
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
  };
}

function checkFraming({ headTop, feetBottom, minX, maxX }, rules) {
  const margin = rules.frameMargin;
  if (headTop < margin) return check('framing', false, "Move back so there's space above your head");
  if (feetBottom > 1 - margin) return check('framing', false, "Step back so there's space below your feet");
  if (minX < margin || maxX > 1 - margin) return check('framing', false, 'Move to the centre so your arms fit in the frame');
  return check('framing', true);
}

function checkDistance({ headTop, feetBottom }, rules) {
  const bodyHeight = feetBottom - headTop;
  if (bodyHeight < rules.bodyHeightMin) return check('distance', false, 'Move closer to the camera');
  if (bodyHeight > rules.bodyHeightMax) return check('distance', false, 'Step back a little');
  return check('distance', true);
}

function checkCentered(named, rules) {
  const hipMidX = (named.LEFT_HIP.x + named.RIGHT_HIP.x) / 2;
  return Math.abs(hipMidX - 0.5) > rules.centerTolerance
    ? check('centered', false, 'Move to the centre of the frame')
    : check('centered', true);
}

function checkFacing(named, p, rules) {
  const shoulderWidth = distance(p.LEFT_SHOULDER, p.RIGHT_SHOULDER);
  const hipWidth = distance(p.LEFT_HIP, p.RIGHT_HIP);
  const torsoLength = distance(midpoint(p.LEFT_SHOULDER, p.RIGHT_SHOULDER), midpoint(p.LEFT_HIP, p.RIGHT_HIP));
  const shoulderWidthX = Math.abs(named.LEFT_SHOULDER.x - named.RIGHT_SHOULDER.x);
  const depthGap = Math.abs((named.LEFT_SHOULDER.z ?? 0) - (named.RIGHT_SHOULDER.z ?? 0));

  const shoulderHipRatio = hipWidth ? shoulderWidth / hipWidth : 0;
  const shoulderTorsoRatio = torsoLength ? shoulderWidth / torsoLength : 0;
  const depthRatio = shoulderWidthX ? depthGap / shoulderWidthX : Infinity;

  const frontal =
    shoulderHipRatio >= rules.shoulderHipRatioMin &&
    shoulderHipRatio <= rules.shoulderHipRatioMax &&
    shoulderTorsoRatio >= rules.shoulderTorsoRatioMin &&
    depthRatio <= rules.shoulderDepthRatioMax;
  return frontal ? check('facing', true) : check('facing', false, 'Turn to face the camera');
}

function checkLevel(p, rules) {
  if (
    lineTilt(p.LEFT_SHOULDER, p.RIGHT_SHOULDER) > rules.lineTiltMaxDeg ||
    lineTilt(p.LEFT_HIP, p.RIGHT_HIP) > rules.lineTiltMaxDeg
  ) {
    return check('level', false, 'Keep your shoulders and hips level');
  }
  const lean = angleBetween(vector(midpoint(p.LEFT_SHOULDER, p.RIGHT_SHOULDER), midpoint(p.LEFT_HIP, p.RIGHT_HIP)), DOWN);
  return lean > rules.torsoLeanMaxDeg ? check('level', false, 'Stand up straight') : check('level', true);
}

function checkPose(p, rules) {
  if (SIDES.some((s) => jointAngle(p[`${s}_SHOULDER`], p[`${s}_ELBOW`], p[`${s}_WRIST`]) < rules.elbowAngleMinDeg)) {
    return check('pose', false, 'Straighten your arms');
  }
  for (const side of SIDES) {
    const abduction = angleBetween(vector(p[`${side}_SHOULDER`], p[`${side}_WRIST`]), DOWN);
    if (abduction < rules.armAbductionMinDeg) return check('pose', false, 'Move your arms slightly away from your body');
    if (abduction > rules.armAbductionMaxDeg) return check('pose', false, 'Lower your arms a little');
  }
  if (SIDES.some((s) => jointAngle(p[`${s}_HIP`], p[`${s}_KNEE`], p[`${s}_ANKLE`]) < rules.kneeAngleMinDeg)) {
    return check('pose', false, 'Straighten your legs');
  }
  const hipWidth = distance(p.LEFT_HIP, p.RIGHT_HIP);
  const feetRatio = hipWidth ? distance(p.LEFT_ANKLE, p.RIGHT_ANKLE) / hipWidth : 0;
  if (feetRatio < rules.feetHipRatioMin) return check('pose', false, 'Stand with your feet hip-width apart');
  if (feetRatio > rules.feetHipRatioMax) return check('pose', false, 'Bring your feet a little closer together');
  return check('pose', true);
}

// history: [{ time, landmarks }] oldest -> newest, newest being the current frame.
function checkStillness(history, aspect, rules) {
  const latest = history[history.length - 1];
  const windowStart = latest.time - rules.stillnessWindowMs;
  if (history[0].time > windowStart) return check('stillness', false, 'Hold still');

  const reference = toNamedLandmarks(latest.landmarks);
  const recent = history.filter((frame) => frame.time >= windowStart);
  const maxMovement = Math.max(
    ...recent.flatMap((frame) => {
      const named = toNamedLandmarks(frame.landmarks);
      return STILLNESS_POINTS.filter((name) => named[name] && reference[name]).map((name) =>
        distance(toPoint(named[name], aspect), toPoint(reference[name], aspect))
      );
    })
  );
  return maxMovement > rules.stillnessMaxMovement ? check('stillness', false, 'Hold still') : check('stillness', true);
}

/**
 * Evaluates one frame's 33 landmarks (array in BlazePose order, or a
 * { NAME: landmark } map), normalised to [0, 1].
 *
 * options.aspectRatio  frame width / height (default 3:4 portrait)
 * options.brightness   mean luma 0-255; adds the lighting check when given
 * options.history      [{ time, landmarks }] ending with this frame; adds the
 *                      stillness check when given
 *
 * Returns { ok, checks: [{ id, passed, message, skipped? }] }. When body
 * landmarks are missing, the geometric checks are reported as skipped failures.
 */
export function validatePose(landmarks, { aspectRatio = 3 / 4, brightness = null, history = null, rules = POSE_RULES } = {}) {
  const named = toNamedLandmarks(landmarks || []);
  const checks = [];
  if (brightness != null) checks.push(checkLighting(brightness, rules));

  const visibility = checkVisibility(named, rules);
  checks.push(visibility);

  const dependentIds = ['framing', 'distance', 'centered', 'facing', 'level', 'pose', ...(history ? ['stillness'] : [])];
  if (!visibility.passed) {
    dependentIds.forEach((id) => checks.push({ id, passed: false, message: SKIPPED_MESSAGE, skipped: true }));
    return { ok: false, checks };
  }

  const p = Object.fromEntries(Object.entries(named).map(([name, lm]) => [name, toPoint(lm, aspectRatio)]));
  const extent = bodyExtent(named, rules);
  checks.push(
    checkFraming(extent, rules),
    checkDistance(extent, rules),
    checkCentered(named, rules),
    checkFacing(named, p, rules),
    checkLevel(p, rules),
    checkPose(p, rules)
  );
  if (history?.length) checks.push(checkStillness(history, aspectRatio, rules));

  return { ok: checks.every((c) => c.passed), checks };
}

// The single instruction to show the shopper: the first actionable failure.
export function primaryInstruction(result) {
  return result.checks.find((c) => !c.passed && !c.skipped)?.message ?? null;
}

// searching: no full body yet | partial: body found, some checks failing | aligned
export function alignmentState(result) {
  if (!result) return 'searching';
  if (result.ok) return 'aligned';
  const visibility = result.checks.find((c) => c.id === 'visibility');
  return visibility?.passed ? 'partial' : 'searching';
}
