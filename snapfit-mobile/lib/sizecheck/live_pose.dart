import 'dart:io';
import 'dart:math' as math;

import 'package:camera/camera.dart';
import 'package:flutter/services.dart';
import 'package:google_mlkit_pose_detection/google_mlkit_pose_detection.dart';

import 'pose_rules.dart';

/// The latest live reading: the landmarks (normalised to the upright,
/// on-screen frame) and the pose gate's verdict on them.
typedef LivePose = ({List<Lm?>? landmarks, PoseResult result});

const _orientations = {
  DeviceOrientation.portraitUp: 0,
  DeviceOrientation.landscapeLeft: 90,
  DeviceOrientation.portraitDown: 180,
  DeviceOrientation.landscapeRight: 270,
};

/// Runs ML Kit pose detection (the same 33 BlazePose landmarks as the web's
/// MediaPipe model) on the camera's live frames, about seven times a second,
/// and checks each with the same rules the web and the AI service use. The
/// landmarks stay on the phone.
class LivePoseTracker {
  LivePoseTracker({required this.onPose});

  final ValueChanged<LivePose> onPose;
  final _detector = PoseDetector(options: PoseDetectorOptions(mode: PoseDetectionMode.stream));
  final _history = <PoseFrame>[];
  final _clock = Stopwatch()..start();
  bool _busy = false;
  int _lastRunMs = -detectionIntervalMs;
  ({int timeMs, PoseResult result})? _lastPass;
  bool _closed = false;

  /// Starts again from a clean gate (camera switch, retake).
  void reset() {
    _history.clear();
    _lastPass = null;
  }

  Future<void> close() async {
    _closed = true;
    await _detector.close();
  }

  /// Feeds one camera frame; skipped while busy or between detections.
  Future<void> process(CameraImage image, CameraDescription camera, DeviceOrientation orientation) async {
    final now = _clock.elapsedMilliseconds;
    if (_busy || _closed || now - _lastRunMs < detectionIntervalMs) return;
    _busy = true;
    _lastRunMs = now;
    try {
      final rotation = _rotation(camera, orientation);
      final input = _inputImage(image, rotation);
      if (input == null) return;
      final poses = await _detector.processImage(input);
      if (_closed) return;
      // The frame as it appears on screen: rotated upright.
      final upright = rotation == InputImageRotation.rotation90deg || rotation == InputImageRotation.rotation270deg
          ? Size(image.height.toDouble(), image.width.toDouble())
          : Size(image.width.toDouble(), image.height.toDouble());
      final mirror = camera.lensDirection == CameraLensDirection.front;
      final landmarks = poses.isEmpty ? null : _normalise(poses.first, upright, mirror: mirror);

      if (landmarks != null) _history.add((timeMs: now, landmarks: landmarks));
      _history.removeWhere((f) => f.timeMs < now - PoseRules.stillnessWindowMs - detectionIntervalMs);
      final result = validatePose(
        landmarks,
        aspectRatio: upright.width / upright.height,
        brightness: _brightness(image),
        history: landmarks == null ? null : _history,
      );
      // Grace period: a brief failure right after a pass keeps reporting it.
      if (result.ok) _lastPass = (timeMs: now, result: result);
      final pass = _lastPass;
      final shown = !result.ok && pass != null && now - pass.timeMs < passGraceMs ? pass.result : result;
      onPose((landmarks: landmarks, result: shown));
    } catch (_) {
      // A frame that fails to convert or detect is skipped; the next one runs.
    } finally {
      _busy = false;
    }
  }

  InputImageRotation? _rotation(CameraDescription camera, DeviceOrientation orientation) {
    if (!Platform.isAndroid) return InputImageRotationValue.fromRawValue(camera.sensorOrientation);
    final compensation = _orientations[orientation] ?? 0;
    final degrees = camera.lensDirection == CameraLensDirection.front
        ? (camera.sensorOrientation + compensation) % 360
        : (camera.sensorOrientation - compensation + 360) % 360;
    return InputImageRotationValue.fromRawValue(degrees);
  }

  InputImage? _inputImage(CameraImage image, InputImageRotation? rotation) {
    if (rotation == null) return null;
    final format = InputImageFormatValue.fromRawValue(image.format.raw);
    if (format == null || image.planes.length != 1) return null;
    final plane = image.planes.first;
    return InputImage.fromBytes(
      bytes: plane.bytes,
      metadata: InputImageMetadata(
        size: Size(image.width.toDouble(), image.height.toDouble()),
        rotation: rotation,
        format: format,
        bytesPerRow: plane.bytesPerRow,
      ),
    );
  }

  /// ML Kit's landmarks are in pixels of the upright frame; the gate wants
  /// [0, 1]. The front camera's preview is mirrored, so its points are too.
  List<Lm?> _normalise(Pose pose, Size upright, {required bool mirror}) {
    return [
      for (final type in PoseLandmarkType.values)
        if (pose.landmarks[type] case final lm?)
          Lm(
            mirror ? 1 - lm.x / upright.width : lm.x / upright.width,
            lm.y / upright.height,
            z: lm.z / upright.width,
            visibility: lm.likelihood,
          )
        else
          null,
    ];
  }

  /// Mean luma (0-255) from a sparse sample of the frame's Y plane (NV21
  /// starts with one byte of luma per pixel).
  double? _brightness(CameraImage image) {
    final bytes = image.planes.first.bytes;
    final pixels = image.width * image.height;
    if (bytes.length < pixels) return null;
    const samples = 1024;
    final step = math.max(1, pixels ~/ samples);
    var total = 0;
    var count = 0;
    for (var i = 0; i < pixels; i += step) {
      total += bytes[i];
      count++;
    }
    return count == 0 ? null : total / count;
  }
}
