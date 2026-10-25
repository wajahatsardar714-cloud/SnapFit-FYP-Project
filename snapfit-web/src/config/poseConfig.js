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
// Shoulder width uses 2 head-heights -- the figure-drawing canon's broad,
// clothed-shoulder width -- so a real body fills the guide rather than spilling
// out of it. The guide's total height is the middle of the accepted distance
// range, so standing inside it passes the distance check.
export const POSE_GUIDE = Object.freeze({
  headsTall: 8,
  bodyHeightFraction: (POSE_RULES.bodyHeightMin + POSE_RULES.bodyHeightMax) / 2,
  headWidth: 0.75,
  neckLength: 0.3,
  shoulderY: 1.45,
  shoulderWidth: 2,
  waistY: 3.1,
  waistWidth: 1.3,
  hipY: 4,
  hipWidth: 1.75,
  crotchY: 4.25,
  armLength: 3.3,
  armAngleDeg: (POSE_RULES.armAbductionMinDeg + POSE_RULES.armAbductionMaxDeg) / 2,
  upperArmWidth: 0.5,
  forearmWidth: 0.4,
  legLength: 3.75,
  thighWidth: 0.8,
  ankleWidth: 0.4,
  feetApart: 1.05,
});
