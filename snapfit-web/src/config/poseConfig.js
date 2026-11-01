// Live camera + pose-gate settings, in one place.

// Show the camera preview as a mirror (selfie style) or as the camera sees it.
// Captured photos are always saved in true orientation regardless; the pose
// guide and landmark overlay follow the preview either way.
export const MIRROR_PREVIEW = false;

// Pose acceptance rules. Must match snapfit-ai/app/pose_rules.json (the AI
// service applies the same rules to every photo it receives) -- poseConfig.test.js
// fails if the two drift apart. Units:
//   ratios / margins / tolerances / bodyHeight* -> fraction of the frame (or of
//     another body length, per the name)
//   *Deg -> degrees, measured in aspect-corrected pixel space
//   brightness* -> mean luma, 0-255
//   headTopFromNoseFactor -> head top sits this many (nose -> shoulder line)
//     distances above the nose (0.8 ~ top of the skull)
//   shoulderDepthRatioMax -> max shoulder z-difference as a fraction of
//     on-screen shoulder width (BlazePose z shares the x scale)
export const POSE_RULES = Object.freeze({
  visibilityThreshold: 0.5,
  requiredLandmarks: Object.freeze([
    'NOSE',
    'LEFT_SHOULDER',
    'RIGHT_SHOULDER',
    'LEFT_ELBOW',
    'RIGHT_ELBOW',
    'LEFT_WRIST',
    'RIGHT_WRIST',
    'LEFT_HIP',
    'RIGHT_HIP',
    'LEFT_KNEE',
    'RIGHT_KNEE',
    'LEFT_ANKLE',
    'RIGHT_ANKLE',
  ]),
  frameMargin: 0.01,
  headTopFromNoseFactor: 0.8,
  bodyHeightMin: 0.55,
  bodyHeightMax: 0.93,
  centerTolerance: 0.18,
  shoulderHipRatioMin: 1.0,
  shoulderHipRatioMax: 2.8,
  shoulderTorsoRatioMin: 0.4,
  shoulderDepthRatioMax: 0.7,
  lineTiltMaxDeg: 8,
  torsoLeanMaxDeg: 12,
  elbowAngleMinDeg: 140,
  armAbductionMinDeg: 8,
  armAbductionMaxDeg: 60,
  kneeAngleMinDeg: 150,
  feetHipRatioMin: 0.4,
  feetHipRatioMax: 2.8,
  stillnessWindowMs: 700,
  stillnessMaxMovement: 0.035,
  brightnessMin: 35,
  brightnessMax: 245,
});

// How often the live detector runs (ms). ~7 fps is enough for framing feedback
// and a 1 s stillness window, and leaves the main thread free on phones.
export const DETECTION_INTERVAL_MS = 150;

// Once every check passes (stillness included), count down this long, then
// capture automatically.
export const AUTO_CAPTURE_COUNTDOWN_S = 2;

// After a capture passes its recheck, grab this many more frames this far apart
// (~1 s burst). The server takes the per-landmark median across every photo,
// which steadies a single frame's jitter. At most 4: the API rejects more.
export const EXTRA_CAPTURE_FRAMES = 4;
export const FRAME_INTERVAL_MS = 200;

// A pose that just passed stays "passing" through failures shorter than this,
// so one jittery detection frame doesn't reset the countdown.
export const PASS_GRACE_MS = 600;

// Brightness is sampled from a tiny downscale of the video frame.
export const BRIGHTNESS_SAMPLE_SIZE = 32;

// Pose guide silhouette, in head-heights (the classic 8-heads-tall figure).
// Drawn tall and loose so a real, clothed person fills it rather than dwarfing
// it: its height is 80% of the way up the accepted distance range (still
// inside it, so standing in the outline passes the distance check), and its
// widths are a clothed body's, not a figure drawing's.
export const POSE_GUIDE = Object.freeze({
  headsTall: 8,
  bodyHeightFraction: POSE_RULES.bodyHeightMin + (POSE_RULES.bodyHeightMax - POSE_RULES.bodyHeightMin) * 0.8,
  headWidth: 0.8,
  neckLength: 0.3,
  shoulderY: 1.45,
  shoulderWidth: 2.4,
  waistY: 3.1,
  waistWidth: 1.7,
  hipY: 4,
  hipWidth: 2.1,
  crotchY: 4.25,
  armLength: 3.3,
  // Arms a little closer than the middle of the accepted 8-60 degrees, so the
  // taller figure's hands stay inside a narrow portrait frame.
  armAngleDeg: 26,
  upperArmWidth: 0.62,
  forearmWidth: 0.5,
  legLength: 3.75,
  thighWidth: 0.98,
  ankleWidth: 0.5,
  feetApart: 1.3,
});
