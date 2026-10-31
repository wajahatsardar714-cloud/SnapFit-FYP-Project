import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import 'pose_guide.dart';

/// Extra frames taken right after the photo (the web's EXTRA_CAPTURE_FRAMES):
/// the server combines body landmarks across all of them, which steadies the
/// measurements. At most 4 -- the API rejects more.
const extraCaptureFrames = 4;
const _frameInterval = Duration(milliseconds: 200);
const _timerSeconds = 5;

/// The photo and its extra frames.
typedef CaptureResult = ({XFile photo, List<XFile> frames});

/// Full-screen camera with the A-pose guide. The shutter takes the photo now;
/// the timer gives the shopper [_timerSeconds] seconds to step back into the
/// guide first (the phone's take on the web's hands-free auto-capture).
class CameraCaptureScreen extends StatefulWidget {
  const CameraCaptureScreen({super.key});

  static Future<CaptureResult?> open(BuildContext context) =>
      Navigator.of(context)
          .push<CaptureResult>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => const CameraCaptureScreen()));

  @override
  State<CameraCaptureScreen> createState() => _CameraCaptureScreenState();
}

class _CameraCaptureScreenState extends State<CameraCaptureScreen> with WidgetsBindingObserver {
  List<CameraDescription> _cameras = const [];
  CameraController? _controller;
  int _cameraIndex = 0;
  String? _error;
  int? _countdown;
  Timer? _timer;
  String? _status;
  bool _capturing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _start();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    _controller?.dispose();
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
    final controller = CameraController(camera, ResolutionPreset.high, enableAudio: false);
    setState(() => _controller = null);
    await previous?.dispose();
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
    } on CameraException catch (e) {
      await controller.dispose();
      if (mounted) setState(() => _error = _describe(e));
    }
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

  void _startTimer() {
    if (_capturing || _countdown != null) return;
    setState(() => _countdown = _timerSeconds);
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

  void _cancelTimer() {
    _timer?.cancel();
    setState(() => _countdown = null);
  }

  Future<void> _capture() async {
    final controller = _controller;
    if (controller == null || _capturing) return;
    setState(() {
      _capturing = true;
      _status = 'Hold still — taking your photo…';
    });
    try {
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

  @override
  Widget build(BuildContext context) {
    // The camera view always uses the dark palette's bright shades.
    const c = SnapColors.dark;
    final controller = _controller;
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
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(LucideIcons.cameraOff, color: Colors.white70, size: 36),
                            const SizedBox(height: 12),
                            Text(
                              _error!,
                              textAlign: TextAlign.center,
                              style: snapText(size: 14, color: Colors.white),
                            ),
                            const SizedBox(height: 16),
                            TextButton(
                              onPressed: () => Navigator.pop(context),
                              child: Text(
                                'Upload a photo instead',
                                style: snapText(size: 14, weight: FontWeight.w600, color: c.link),
                              ),
                            ),
                          ],
                        ),
                      ),
                    )
                  : controller == null
                  ? const Center(child: CircularProgressIndicator(color: Colors.white))
                  : Center(
                      child: AspectRatio(
                        aspectRatio: 1 / controller.value.aspectRatio,
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            CameraPreview(controller),
                            CustomPaint(
                              painter: PoseGuidePainter(
                                color: _countdown != null || _capturing ? c.success : Colors.white,
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
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Text(
                _status ??
                    (_countdown != null
                        ? 'Step back into the outline — taking your photo in $_countdown…'
                        : 'Stand inside the outline: whole body visible, facing the camera, arms slightly away from your body, feet hip-width apart.'),
                textAlign: TextAlign.center,
                style: snapText(size: 13, color: Colors.white, height: 1.45),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _RoundAction(
                    icon: _countdown != null ? LucideIcons.x : LucideIcons.timer,
                    label: _countdown != null ? 'Cancel' : '${_timerSeconds}s timer',
                    onTap: controller == null || _capturing ? null : (_countdown != null ? _cancelTimer : _startTimer),
                  ),
                  Semantics(
                    button: true,
                    label: 'Capture',
                    child: GestureDetector(
                      onTap: controller == null || _capturing || _countdown != null ? null : _capture,
                      child: Container(
                        width: 76,
                        height: 76,
                        padding: const EdgeInsets.all(5),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 4),
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
