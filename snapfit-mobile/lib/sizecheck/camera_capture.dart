import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/motion.dart';
import 'fitted_guide.dart';
import 'live_pose.dart';
import 'pose_guide.dart';
import 'pose_rules.dart';

/// Extra frames taken right after the photo (the web's EXTRA_CAPTURE_FRAMES):
/// the server combines body landmarks across all of them, which steadies the
/// measurements. At most 4 -- the API rejects more.
const extraCaptureFrames = 4;
const _frameInterval = Duration(milliseconds: 200);
// Once the pose passes, this countdown takes the photo hands-free (the web's
// AUTO_CAPTURE_COUNTDOWN_S).
const _autoCaptureSeconds = 2;
// Without live detection (it failed to start), a self-timer instead.
const _timerSeconds = 5;
// How quickly the drawn outline catches up with a detection, and how long it
// lingers once the body is lost.
const _smoothingMs = 90.0;
const _lostAfterMs = 450;

/// The photo and its extra frames.
typedef CaptureResult = ({XFile photo, List<XFile> frames});

/// Full-screen camera with a live pose guide. Until a body is found it shows
/// a fixed A-pose outline; then a fitted outline follows the shopper (arms,
/// legs, distance), coloured by what to fix, with arrows for arm and feet
/// moves. Once every check passes, a short countdown takes the photo.
class CameraCaptureScreen extends StatefulWidget {
  const CameraCaptureScreen({super.key});

  static Future<CaptureResult?> open(BuildContext context) =>
      Navigator.of(context)
          .push<CaptureResult>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => const CameraCaptureScreen()));

  @override
  State<CameraCaptureScreen> createState() => _CameraCaptureScreenState();
}

class _CameraCaptureScreenState extends State<CameraCaptureScreen>
    with WidgetsBindingObserver, SingleTickerProviderStateMixin {
  List<CameraDescription> _cameras = const [];
  CameraController? _controller;
  int _cameraIndex = 0;
  String? _error;
  int? _countdown;
  bool _timerIsAuto = false;
  Timer? _timer;
  String? _status;
  bool _capturing = false;

  late final LivePoseTracker _tracker = LivePoseTracker(onPose: _onPose);
  bool _liveDetection = Platform.isAndroid || Platform.isIOS;
  PoseResult? _result;
  List<Lm?>? _target;
  List<Lm?>? _drawn;
  final _drawnNotifier = ValueNotifier<List<Lm?>?>(null);
  int _lastSeenMs = 0;
  late final Ticker _ticker = createTicker(_onTick);
  Duration _lastTick = Duration.zero;
  final _clock = Stopwatch()..start();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _ticker.start();
    _start();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    _ticker.dispose();
    _drawnNotifier.dispose();
    _controller?.dispose();
    _tracker.close();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    if (state == AppLifecycleState.inactive) {
      controller.dispose();
      _controller = null;
    } else if (state == AppLifecycleState.resumed) {
      _open(_cameras[_cameraIndex]);
    }
  }

  Future<void> _start() async {
    try {
      _cameras = await availableCameras();
      if (_cameras.isEmpty) {
        setState(() => _error = 'No camera was found on this device.');
        return;
      }
      _cameraIndex = _cameras.indexWhere((c) => c.lensDirection == CameraLensDirection.back);
      if (_cameraIndex < 0) _cameraIndex = 0;
      await _open(_cameras[_cameraIndex]);
    } on CameraException catch (e) {
      setState(() => _error = _describe(e));
    }
  }

  Future<void> _open(CameraDescription camera) async {
    final previous = _controller;
    final controller = CameraController(
      camera,
      ResolutionPreset.high,
      enableAudio: false,
      // NV21 is what ML Kit reads on Android.
      imageFormatGroup: Platform.isAndroid ? ImageFormatGroup.nv21 : ImageFormatGroup.bgra8888,
    );
    setState(() => _controller = null);
    await previous?.dispose();
    _resetLive();
    try {
      await controller.initialize();
      await controller.setFlashMode(FlashMode.off);
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() {
        _controller = controller;
        _error = null;
      });
      await _startStream(controller, camera);
    } on CameraException catch (e) {
      await controller.dispose();
      if (mounted) setState(() => _error = _describe(e));
    }
  }

  Future<void> _startStream(CameraController controller, CameraDescription camera) async {
    if (!_liveDetection) return;
    try {
      await controller.startImageStream((image) => _tracker.process(image, camera, controller.value.deviceOrientation));
    } catch (_) {
      // No live frames on this device: fall back to the fixed guide and timer.
      if (mounted) setState(() => _liveDetection = false);
    }
  }

  void _resetLive() {
    _tracker.reset();
    _cancelCountdown();
    _result = null;
    _target = null;
    _drawn = null;
    _drawnNotifier.value = null;
  }

  void _onPose(LivePose pose) {
    if (!mounted || _capturing) return;
    _target = pose.landmarks;
    if (pose.landmarks != null) _lastSeenMs = _clock.elapsedMilliseconds;
    final passed = pose.result.ok;
    setState(() => _result = pose.result);
    // Hands-free: a passing pose starts the countdown; losing it cancels.
    if (passed && _countdown == null) {
      _startCountdown(_autoCaptureSeconds, auto: true);
    } else if (!passed && _timerIsAuto) {
      _cancelCountdown();
    }
  }

  /// Every frame: ease the drawn outline toward the newest detection.
  void _onTick(Duration elapsed) {
    final dt = (elapsed - _lastTick).inMicroseconds / 1000;
    _lastTick = elapsed;
    if (_target != null) {
      _drawn = smoothLandmarks(_drawn, _target, reduceMotion(context) ? 1 : 1 - math.exp(-dt / _smoothingMs));
    } else if (_clock.elapsedMilliseconds - _lastSeenMs > _lostAfterMs) {
      _drawn = null;
    }
    if (!identical(_drawn, _drawnNotifier.value)) _drawnNotifier.value = _drawn;
  }

  String _describe(CameraException e) {
    if (e.code.contains('Access') || e.code.contains('Permission')) {
      return 'Camera access was denied. Allow camera access for SnapFit in your phone settings, or upload a photo instead.';
    }
    return "We couldn't open the camera (${e.description ?? e.code}). You can upload a photo instead.";
  }

  void _switchCamera() {
    if (_cameras.length < 2 || _capturing) return;
    _cameraIndex = (_cameraIndex + 1) % _cameras.length;
    _open(_cameras[_cameraIndex]);
  }

  void _startCountdown(int seconds, {required bool auto}) {
    if (_capturing || _countdown != null) return;
    _timerIsAuto = auto;
    setState(() => _countdown = seconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      final next = (_countdown ?? 1) - 1;
      if (next <= 0) {
        timer.cancel();
        setState(() => _countdown = null);
        _capture();
      } else {
        setState(() => _countdown = next);
      }
    });
  }

  void _cancelCountdown() {
    _timer?.cancel();
    _timerIsAuto = false;
    if (_countdown != null && mounted) setState(() => _countdown = null);
  }

  Future<void> _capture() async {
    final controller = _controller;
    if (controller == null || _capturing) return;
    _cancelCountdown();
    setState(() {
      _capturing = true;
      _status = 'Hold still — taking your photo…';
    });
    try {
      if (controller.value.isStreamingImages) await controller.stopImageStream();
      final photo = await controller.takePicture();
      final frames = <XFile>[];
      for (var i = 1; i <= extraCaptureFrames; i++) {
        if (!mounted) return;
        setState(() => _status = 'Hold still — steadying the measurements ($i/$extraCaptureFrames)…');
        await Future<void>.delayed(_frameInterval);
        try {
          frames.add(await controller.takePicture());
        } on CameraException {
          break; // The extra frames only steady the result; the photo is enough.
        }
      }
      if (mounted) Navigator.pop<CaptureResult>(context, (photo: photo, frames: frames));
    } on CameraException catch (e) {
      if (mounted) {
        setState(() {
          _capturing = false;
          _status = null;
          _error = _describe(e);
        });
      }
    }
  }

  /// What to tell the shopper now (the web's LiveCapture status).
  ({String text, Color color}) _statusLine(SnapColors c) {
    if (_status != null) return (text: _status!, color: Colors.white);
    if (_countdown != null) {
      return _timerIsAuto
          ? (text: 'Hold still — taking your photo in $_countdown…', color: c.success)
          : (text: 'Step back into the outline — taking your photo in $_countdown…', color: Colors.white);
    }
    final result = _result;
    if (!_liveDetection || result == null) {
      return (
        text: 'Stand inside the outline: whole body visible, facing the camera, arms slightly away from your body, feet hip-width apart.',
        color: Colors.white,
      );
    }
    if (result.ok) return (text: 'Perfect — hold still', color: c.success);
    if (result.alignment == 'searching' && _drawn == null) {
      return (text: 'Step into the frame so we can see your whole body', color: Colors.white);
    }
    return (text: result.instruction ?? 'Adjust your position', color: c.warning);
  }

  @override
  Widget build(BuildContext context) {
    // The camera view always uses the dark palette's bright shades.
    const c = SnapColors.dark;
    final controller = _controller;
    final status = _statusLine(c);
    final tones = {GuideTone.foreground: Colors.white, GuideTone.warning: c.warning, GuideTone.success: c.success};
    final aligned = _result?.ok == true;
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 4, 4, 0),
              child: Row(
                children: [
                  IconButton(
                    tooltip: 'Close camera',
                    icon: const Icon(LucideIcons.x, color: Colors.white),
                    onPressed: _capturing ? null : () => Navigator.pop(context),
                  ),
                  Expanded(
                    child: Text(
                      'Take a Photo',
                      textAlign: TextAlign.center,
                      style: snapText(size: 16, weight: FontWeight.w600, color: Colors.white),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Switch camera',
                    icon: const Icon(LucideIcons.switchCamera, color: Colors.white),
                    onPressed: _cameras.length > 1 && !_capturing ? _switchCamera : null,
                  ),
                ],
              ),
            ),
            Expanded(
              child: _error != null
                  ? _CameraError(message: _error!, linkColor: c.link)
                  : controller == null
                  ? const Center(child: CircularProgressIndicator(color: Colors.white))
                  : Center(
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        decoration: BoxDecoration(
                          border: Border.all(
                            color: aligned ? c.success : (_result?.alignment == 'partial' ? c.warning : Colors.white24),
                            width: 3,
                          ),
                        ),
                        child: AspectRatio(
                          aspectRatio: 1 / controller.value.aspectRatio,
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              CameraPreview(controller),
                              // The fixed outline shows where to stand until a
                              // body is found; then the fitted one takes over.
                              ValueListenableBuilder<List<Lm?>?>(
                                valueListenable: _drawnNotifier,
                                builder: (context, drawn, _) => Stack(
                                  fit: StackFit.expand,
                                  children: [
                                    AnimatedOpacity(
                                      opacity: drawn == null ? 1 : 0,
                                      duration: const Duration(milliseconds: 300),
                                      child: CustomPaint(
                                        painter: PoseGuidePainter(
                                          color: _countdown != null || _capturing ? c.success : Colors.white,
                                        ),
                                      ),
                                    ),
                                    if (drawn != null)
                                      CustomPaint(
                                        painter: FittedGuidePainter(landmarks: drawn, result: _result, colors: tones),
                                      ),
                                  ],
                                ),
                              ),
                              if (_countdown != null)
                                Center(
                                  child: Container(
                                    width: 96,
                                    height: 96,
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      color: c.overlay.withValues(alpha: 0.55),
                                      shape: BoxShape.circle,
                                    ),
                                    child: Text(
                                      '$_countdown',
                                      style: snapText(size: 44, weight: FontWeight.w700, color: Colors.white),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ),
            ),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Semantics(
                liveRegion: true,
                child: Text(
                  status.text,
                  textAlign: TextAlign.center,
                  style: snapText(size: 14, weight: FontWeight.w500, color: status.color, height: 1.45),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  if (!_liveDetection)
                    _RoundAction(
                      icon: _countdown != null ? LucideIcons.x : LucideIcons.timer,
                      label: _countdown != null ? 'Cancel' : '${_timerSeconds}s timer',
                      onTap: controller == null || _capturing
                          ? null
                          : (_countdown != null ? _cancelCountdown : () => _startCountdown(_timerSeconds, auto: false)),
                    )
                  else
                    const SizedBox(width: 64),
                  Semantics(
                    button: true,
                    label: 'Capture',
                    child: GestureDetector(
                      onTap: controller == null || _capturing ? null : _capture,
                      child: Container(
                        width: 76,
                        height: 76,
                        padding: const EdgeInsets.all(5),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: aligned ? c.success : Colors.white, width: 4),
                        ),
                        child: Container(
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: _capturing ? c.success : Colors.white,
                          ),
                          child: _capturing
                              ? const Padding(
                                  padding: EdgeInsets.all(18),
                                  child: CircularProgressIndicator(strokeWidth: 3, color: Colors.white),
                                )
                              : null,
                        ),
                      ),
                    ),
                  ),
                  _RoundAction(
                    icon: LucideIcons.switchCamera,
                    label: 'Flip',
                    onTap: _cameras.length > 1 && !_capturing ? _switchCamera : null,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CameraError extends StatelessWidget {
  const _CameraError({required this.message, required this.linkColor});

  final String message;
  final Color linkColor;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(LucideIcons.cameraOff, color: Colors.white70, size: 36),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: snapText(size: 14, color: Colors.white),
            ),
            const SizedBox(height: 16),
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(
                'Upload a photo instead',
                style: snapText(size: 14, weight: FontWeight.w600, color: linkColor),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RoundAction extends StatelessWidget {
  const _RoundAction({required this.icon, required this.label, this.onTap});

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: onTap == null ? 0.4 : 1,
      child: InkWell(
        borderRadius: BorderRadius.circular(40),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: const BoxDecoration(color: Color(0x33FFFFFF), shape: BoxShape.circle),
                child: Icon(icon, color: Colors.white, size: 22),
              ),
              const SizedBox(height: 4),
              Text(label, style: snapText(size: 12, color: Colors.white)),
            ],
          ),
        ),
      ),
    );
  }
}
