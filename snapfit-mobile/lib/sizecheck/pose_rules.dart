// The live pose gate: the web app's src/utils/poseValidation.js and the
// POSE_RULES in src/config/poseConfig.js, ported line for line. The AI
// service applies the same rules to every photo (snapfit-ai/app/
// pose_validator.py), so check ids, order and messages stay in sync.
import 'dart:math' as math;

/// One body point, normalised to the upright frame ([0, 1] on both axes).
class Lm {
  const Lm(this.x, this.y, {this.z = 0, this.visibility = 1});

  final double x;
  final double y;
  final double z;
  final double visibility;

  Lm copyWith({double? x, double? y, double? visibility}) =>
      Lm(x ?? this.x, y ?? this.y, z: z, visibility: visibility ?? this.visibility);
}

/// BlazePose's 33 landmarks, in index order (ML Kit uses the same order).
const landmarkNames = [
  'NOSE', 'LEFT_EYE_INNER', 'LEFT_EYE', 'LEFT_EYE_OUTER', 'RIGHT_EYE_INNER', 'RIGHT_EYE', 'RIGHT_EYE_OUTER', //
  'LEFT_EAR', 'RIGHT_EAR', 'MOUTH_LEFT', 'MOUTH_RIGHT', 'LEFT_SHOULDER', 'RIGHT_SHOULDER', 'LEFT_ELBOW', //
  'RIGHT_ELBOW', 'LEFT_WRIST', 'RIGHT_WRIST', 'LEFT_PINKY', 'RIGHT_PINKY', 'LEFT_INDEX', 'RIGHT_INDEX', //
  'LEFT_THUMB', 'RIGHT_THUMB', 'LEFT_HIP', 'RIGHT_HIP', 'LEFT_KNEE', 'RIGHT_KNEE', 'LEFT_ANKLE', //
  'RIGHT_ANKLE', 'LEFT_HEEL', 'RIGHT_HEEL', 'LEFT_FOOT_INDEX', 'RIGHT_FOOT_INDEX',
];

class PoseRules {
  static const visibilityThreshold = 0.5;
  static const requiredLandmarks = [
    'NOSE', 'LEFT_SHOULDER', 'RIGHT_SHOULDER', 'LEFT_ELBOW', 'RIGHT_ELBOW', 'LEFT_WRIST', 'RIGHT_WRIST', //
    'LEFT_HIP', 'RIGHT_HIP', 'LEFT_KNEE', 'RIGHT_KNEE', 'LEFT_ANKLE', 'RIGHT_ANKLE',
  ];
  static const frameMargin = 0.01;
  static const headTopFromNoseFactor = 0.8;
  static const bodyHeightMin = 0.55;
  static const bodyHeightMax = 0.93;
  static const centerTolerance = 0.18;
  static const shoulderHipRatioMin = 1.0;
  static const shoulderHipRatioMax = 2.8;
  static const shoulderTorsoRatioMin = 0.4;
  static const shoulderDepthRatioMax = 0.7;
  static const lineTiltMaxDeg = 8.0;
  static const torsoLeanMaxDeg = 12.0;
  static const elbowAngleMinDeg = 140.0;
  static const armAbductionMinDeg = 8.0;
  static const armAbductionMaxDeg = 60.0;
  static const kneeAngleMinDeg = 150.0;
  static const feetHipRatioMin = 0.4;
  static const feetHipRatioMax = 2.8;
  static const stillnessWindowMs = 700;
  static const stillnessMaxMovement = 0.035;
  static const brightnessMin = 35.0;
  static const brightnessMax = 245.0;
}

/// How often the live detector runs, and how long a pass keeps counting
/// through a jittery frame (the web's DETECTION_INTERVAL_MS / PASS_GRACE_MS).
const detectionIntervalMs = 150;
const passGraceMs = 600;

const _passedLabels = {
  'lighting': 'Lighting looks good',
  'visibility': 'Whole body visible',
  'framing': 'Body inside the frame',
  'distance': 'Good distance from the camera',
  'centered': 'Centred in the frame',
  'facing': 'Facing the camera',
  'level': 'Standing straight',
  'pose': 'Arms and legs in position',
  'stillness': 'Holding still',
};
const _skippedMessage = 'Waiting for your whole body to be visible';

const _feet = ['LEFT_ANKLE', 'RIGHT_ANKLE', 'LEFT_HEEL', 'RIGHT_HEEL'];
const _arms = ['LEFT_ELBOW', 'RIGHT_ELBOW', 'LEFT_WRIST', 'RIGHT_WRIST'];
const _feetExtent = ['LEFT_HEEL', 'RIGHT_HEEL', 'LEFT_FOOT_INDEX', 'RIGHT_FOOT_INDEX', 'LEFT_ANKLE', 'RIGHT_ANKLE'];
const _stillnessPoints = [
  'NOSE',
  'LEFT_SHOULDER',
  'RIGHT_SHOULDER',
  'LEFT_HIP',
  'RIGHT_HIP',
  'LEFT_WRIST',
  'RIGHT_WRIST',
  'LEFT_ANKLE',
  'RIGHT_ANKLE', //
];
const _sides = ['LEFT', 'RIGHT'];

class PoseCheck {
  const PoseCheck(this.id, this.passed, this.message, {this.skipped = false});

  final String id;
  final bool passed;
  final String message;
  final bool skipped;
}

class PoseResult {
  const PoseResult(this.checks);

  final List<PoseCheck> checks;

  bool get ok => checks.every((c) => c.passed);

  /// The single instruction to show: the first actionable failure.
  String? get instruction {
    for (final c in checks) {
      if (!c.passed && !c.skipped) return c.message;
    }
    return null;
  }

  /// The id of that first actionable failure.
  String? get failingId {
    for (final c in checks) {
      if (!c.passed && !c.skipped) return c.id;
    }
    return null;
  }

  /// searching: no full body yet | partial: body found, some checks failing | aligned
  String get alignment {
    if (ok) return 'aligned';
    final visibility = checks.where((c) => c.id == 'visibility').firstOrNull;
    return visibility?.passed == true ? 'partial' : 'searching';
  }
}

/// One frame's landmarks with the time they were seen, for the stillness check.
typedef PoseFrame = ({int timeMs, List<Lm?> landmarks});

PoseCheck _check(String id, bool passed, [String message = '']) =>
    PoseCheck(id, passed, passed ? _passedLabels[id]! : message);

Map<String, Lm> _named(List<Lm?> landmarks) => {
  for (var i = 0; i < landmarks.length && i < landmarkNames.length; i++)
    if (landmarks[i] != null) landmarkNames[i]: landmarks[i]!,
};

typedef _P = ({double x, double y});

_P _toPoint(Lm lm, double aspect) => (x: lm.x * aspect, y: lm.y);
_P _mid(_P a, _P b) => (x: (a.x + b.x) / 2, y: (a.y + b.y) / 2);
double _dist(_P a, _P b) => math.sqrt(math.pow(a.x - b.x, 2) + math.pow(a.y - b.y, 2));
double _deg(double r) => r * 180 / math.pi;
_P _vec(_P from, _P to) => (x: to.x - from.x, y: to.y - from.y);
const _P _down = (x: 0, y: 1);

double _angleBetween(_P v1, _P v2) {
  final norm = math.sqrt(v1.x * v1.x + v1.y * v1.y) * math.sqrt(v2.x * v2.x + v2.y * v2.y);
  if (norm == 0) return 0;
  return _deg(math.acos(((v1.x * v2.x + v1.y * v2.y) / norm).clamp(-1.0, 1.0)));
}

double _jointAngle(_P a, _P joint, _P b) => _angleBetween(_vec(joint, a), _vec(joint, b));

double _lineTilt(_P a, _P b) {
  final dx = (a.x - b.x).abs();
  return _deg(math.atan2((a.y - b.y).abs(), dx == 0 ? 1e-9 : dx));
}

PoseCheck _checkLighting(double brightness) {
  if (brightness < PoseRules.brightnessMin) return _check('lighting', false, "It's too dark — move somewhere brighter");
  if (brightness > PoseRules.brightnessMax) {
    return _check('lighting', false, "It's too bright — avoid strong light behind or in front of you");
  }
  return _check('lighting', true);
}

PoseCheck _checkVisibility(Map<String, Lm> named) {
  final missing = PoseRules.requiredLandmarks
      .where((name) => (named[name]?.visibility ?? 0) < PoseRules.visibilityThreshold)
      .toList();
  if (missing.isEmpty) return _check('visibility', true);
  if (missing.any(_feet.contains)) return _check('visibility', false, 'Step back so your feet are visible');
  if (missing.contains('NOSE')) return _check('visibility', false, 'Step back so your head is visible');
  if (missing.every(_arms.contains)) {
    return _check('visibility', false, 'Keep both arms in view, held slightly away from your body');
  }
  return _check('visibility', false, 'Step back so your whole body is in the frame');
}

({double headTop, double feetBottom, double minX, double maxX}) _bodyExtent(Map<String, Lm> named) {
  final noseY = named['NOSE']!.y;
  final shoulderY = (named['LEFT_SHOULDER']!.y + named['RIGHT_SHOULDER']!.y) / 2;
  final xs = PoseRules.requiredLandmarks.map((name) => named[name]!.x);
  return (
    headTop: noseY - PoseRules.headTopFromNoseFactor * (shoulderY - noseY),
    feetBottom: _feetExtent.where(named.containsKey).map((name) => named[name]!.y).reduce(math.max),
    minX: xs.reduce(math.min),
    maxX: xs.reduce(math.max),
  );
}

PoseCheck _checkFraming(({double headTop, double feetBottom, double minX, double maxX}) e) {
  const margin = PoseRules.frameMargin;
  if (e.headTop < margin) return _check('framing', false, "Move back so there's space above your head");
  if (e.feetBottom > 1 - margin) return _check('framing', false, "Step back so there's space below your feet");
  if (e.minX < margin || e.maxX > 1 - margin) {
    return _check('framing', false, 'Move to the centre so your arms fit in the frame');
  }
  return _check('framing', true);
}

PoseCheck _checkDistance(({double headTop, double feetBottom, double minX, double maxX}) e) {
  final bodyHeight = e.feetBottom - e.headTop;
  if (bodyHeight < PoseRules.bodyHeightMin) return _check('distance', false, 'Move closer to the camera');
  if (bodyHeight > PoseRules.bodyHeightMax) return _check('distance', false, 'Step back a little');
  return _check('distance', true);
}

PoseCheck _checkCentered(Map<String, Lm> named) {
  final hipMidX = (named['LEFT_HIP']!.x + named['RIGHT_HIP']!.x) / 2;
  return (hipMidX - 0.5).abs() > PoseRules.centerTolerance
      ? _check('centered', false, 'Move to the centre of the frame')
      : _check('centered', true);
}

PoseCheck _checkFacing(Map<String, Lm> named, Map<String, _P> p) {
  final shoulderWidth = _dist(p['LEFT_SHOULDER']!, p['RIGHT_SHOULDER']!);
  final hipWidth = _dist(p['LEFT_HIP']!, p['RIGHT_HIP']!);
  final torsoLength = _dist(_mid(p['LEFT_SHOULDER']!, p['RIGHT_SHOULDER']!), _mid(p['LEFT_HIP']!, p['RIGHT_HIP']!));
  final shoulderWidthX = (named['LEFT_SHOULDER']!.x - named['RIGHT_SHOULDER']!.x).abs();
  final depthGap = (named['LEFT_SHOULDER']!.z - named['RIGHT_SHOULDER']!.z).abs();
  final shoulderHipRatio = hipWidth == 0 ? 0 : shoulderWidth / hipWidth;
  final shoulderTorsoRatio = torsoLength == 0 ? 0 : shoulderWidth / torsoLength;
  final depthRatio = shoulderWidthX == 0 ? double.infinity : depthGap / shoulderWidthX;
  final frontal =
      shoulderHipRatio >= PoseRules.shoulderHipRatioMin &&
      shoulderHipRatio <= PoseRules.shoulderHipRatioMax &&
      shoulderTorsoRatio >= PoseRules.shoulderTorsoRatioMin &&
      depthRatio <= PoseRules.shoulderDepthRatioMax;
  return frontal ? _check('facing', true) : _check('facing', false, 'Turn to face the camera');
}

PoseCheck _checkLevel(Map<String, _P> p) {
  if (_lineTilt(p['LEFT_SHOULDER']!, p['RIGHT_SHOULDER']!) > PoseRules.lineTiltMaxDeg ||
      _lineTilt(p['LEFT_HIP']!, p['RIGHT_HIP']!) > PoseRules.lineTiltMaxDeg) {
    return _check('level', false, 'Keep your shoulders and hips level');
  }
  final lean = _angleBetween(
    _vec(_mid(p['LEFT_SHOULDER']!, p['RIGHT_SHOULDER']!), _mid(p['LEFT_HIP']!, p['RIGHT_HIP']!)),
    _down,
  );
  return lean > PoseRules.torsoLeanMaxDeg ? _check('level', false, 'Stand up straight') : _check('level', true);
}

PoseCheck _checkPose(Map<String, _P> p) {
  if (_sides.any(
    (s) => _jointAngle(p['${s}_SHOULDER']!, p['${s}_ELBOW']!, p['${s}_WRIST']!) < PoseRules.elbowAngleMinDeg,
  )) {
    return _check('pose', false, 'Straighten your arms');
  }
  for (final side in _sides) {
    final abduction = _angleBetween(_vec(p['${side}_SHOULDER']!, p['${side}_WRIST']!), _down);
    if (abduction < PoseRules.armAbductionMinDeg) {
      return _check('pose', false, 'Move your arms slightly away from your body');
    }
    if (abduction > PoseRules.armAbductionMaxDeg) return _check('pose', false, 'Lower your arms a little');
  }
  if (_sides.any((s) => _jointAngle(p['${s}_HIP']!, p['${s}_KNEE']!, p['${s}_ANKLE']!) < PoseRules.kneeAngleMinDeg)) {
    return _check('pose', false, 'Straighten your legs');
  }
  final hipWidth = _dist(p['LEFT_HIP']!, p['RIGHT_HIP']!);
  final feetRatio = hipWidth == 0 ? 0 : _dist(p['LEFT_ANKLE']!, p['RIGHT_ANKLE']!) / hipWidth;
  if (feetRatio < PoseRules.feetHipRatioMin) return _check('pose', false, 'Stand with your feet hip-width apart');
  if (feetRatio > PoseRules.feetHipRatioMax) return _check('pose', false, 'Bring your feet a little closer together');
  return _check('pose', true);
}

PoseCheck _checkStillness(List<PoseFrame> history, double aspect) {
  final latest = history.last;
  final windowStart = latest.timeMs - PoseRules.stillnessWindowMs;
  if (history.first.timeMs > windowStart) return _check('stillness', false, 'Hold still');
  final reference = _named(latest.landmarks);
  var maxMovement = 0.0;
  for (final frame in history.where((f) => f.timeMs >= windowStart)) {
    final named = _named(frame.landmarks);
    for (final name in _stillnessPoints) {
      final a = named[name];
      final b = reference[name];
      if (a == null || b == null) continue;
      maxMovement = math.max(maxMovement, _dist(_toPoint(a, aspect), _toPoint(b, aspect)));
    }
  }
  return maxMovement > PoseRules.stillnessMaxMovement
      ? _check('stillness', false, 'Hold still')
      : _check('stillness', true);
}

/// Evaluates one frame's 33 landmarks (normalised, upright, BlazePose order).
///   aspectRatio  frame width / height
///   brightness   mean luma 0-255; adds the lighting check when given
///   history      frames ending with this one; adds the stillness check
PoseResult validatePose(
  List<Lm?>? landmarks, {
  double aspectRatio = 3 / 4,
  double? brightness,
  List<PoseFrame>? history,
}) {
  final named = _named(landmarks ?? const []);
  final checks = <PoseCheck>[];
  if (brightness != null) checks.add(_checkLighting(brightness));

  final visibility = _checkVisibility(named);
  checks.add(visibility);
  final dependentIds = ['framing', 'distance', 'centered', 'facing', 'level', 'pose', if (history != null) 'stillness'];
  if (!visibility.passed) {
    checks.addAll(dependentIds.map((id) => PoseCheck(id, false, _skippedMessage, skipped: true)));
    return PoseResult(checks);
  }

  final p = {for (final e in named.entries) e.key: _toPoint(e.value, aspectRatio)};
  final extent = _bodyExtent(named);
  checks.addAll([
    _checkFraming(extent),
    _checkDistance(extent),
    _checkCentered(named),
    _checkFacing(named, p),
    _checkLevel(p),
    _checkPose(p),
  ]);
  if (history != null && history.isNotEmpty) checks.add(_checkStillness(history, aspectRatio));
  return PoseResult(checks);
}
