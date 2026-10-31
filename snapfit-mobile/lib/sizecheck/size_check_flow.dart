import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/json.dart';
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/ui.dart';
import 'camera_capture.dart';
import 'size_result.dart';

const _maxFileBytes = 10 * 1024 * 1024;
const _minHeightCm = 100;
const _maxHeightCm = 230;
// Size and try-on in one call: one upload, billed as one request. The backend
// only renders the try-on for try-on-ready products.
const _includeTryOn = true;

const _stepTitles = {
  _Step.form: 'Find your size',
  _Step.loading: 'Analyzing your photo',
  _Step.result: 'Your size',
  _Step.error: "We couldn't check your size",
};

const _fitOptions = {'fitted': 'Fitted', 'regular': 'Regular', 'loose': 'Loose'};

enum _Step { form, loading, result, error }

enum _InputMode { camera, upload }

/// Height in cm (one decimal), or null when nothing has been entered.
double? heightToCm({required bool metric, required String cm, required String feet, required String inches}) {
  if (metric) return double.tryParse(cm);
  if (feet.isEmpty && inches.isEmpty) return null;
  final total = (double.tryParse(feet) ?? 0) * 30.48 + (double.tryParse(inches) ?? 0) * 2.54;
  return (total * 10).round() / 10;
}

String heightError(double? height) {
  if (height == null) return 'Please enter your height.';
  if (height < _minHeightCm || height > _maxHeightCm) {
    return 'Height must be between 100 and 230 cm (3 ft 4 in – 7 ft 6 in).';
  }
  return '';
}

/// How the flow reaches the recommend endpoint: the merchant's API key (the
/// public widget), or the signed-in super admin's session on the demo route.
class RecommendTarget {
  const RecommendTarget.apiKey(String this.apiKey, {required this.productId}) : endpoint = '/recommend';

  const RecommendTarget.session({required this.endpoint, required this.productId}) : apiKey = null;

  final String? apiKey;
  final String endpoint;
  final String productId;
}

/// The shopper widget's dialog (the web's SnapFitWidget + WidgetDialog) as a
/// full-screen page: take or upload a photo, height and fit, then the size,
/// measurements and try-on.
class SizeCheckFlow extends StatefulWidget {
  const SizeCheckFlow({super.key, required this.target});

  final RecommendTarget target;

  static Future<void> open(BuildContext context, RecommendTarget target) =>
      Navigator.of(context)
          .push(MaterialPageRoute(fullscreenDialog: true, builder: (_) => SizeCheckFlow(target: target)));

  @override
  State<SizeCheckFlow> createState() => _SizeCheckFlowState();
}

class _SizeCheckFlowState extends State<SizeCheckFlow> {
  _Step _step = _Step.form;
  _InputMode? _mode;
  XFile? _photo;
  List<XFile> _frames = const [];
  String _formError = '';
  bool _metric = true;
  final _cm = TextEditingController();
  final _feet = TextEditingController();
  final _inches = TextEditingController();
  bool _heightTouched = false;
  String _fit = 'regular';
  Map<String, dynamic>? _result;
  Map<String, dynamic>? _tryOn;
  String _errorMessage = '';
  List<dynamic> _poseChecks = const [];
  String? _feedback;
  CancelToken? _cancel;

  @override
  void dispose() {
    _cm.dispose();
    _feet.dispose();
    _inches.dispose();
    _cancel?.cancel();
    super.dispose();
  }

  double? get _height => heightToCm(metric: _metric, cm: _cm.text, feet: _feet.text, inches: _inches.text);

  void _clearPhoto() => setState(() {
    _photo = null;
    _frames = const [];
  });

  void _resetFlow() {
    _cm.clear();
    _feet.clear();
    _inches.clear();
    setState(() {
      _step = _Step.form;
      _mode = null;
      _photo = null;
      _frames = const [];
      _formError = '';
      _heightTouched = false;
      _fit = 'regular';
      _result = null;
      _tryOn = null;
      _errorMessage = '';
      _poseChecks = const [];
      _feedback = null;
    });
  }

  /// Back from the result (or an error) to the form, keeping the photo and
  /// answers so the shopper can adjust them and check again.
  void _backToForm() => setState(() {
    _step = _Step.form;
    _feedback = null;
  });

  Future<void> _accept(XFile file, [List<XFile> frames = const []]) async {
    final name = file.name.toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp', '.heic'].any(name.endsWith)) {
      setState(() => _formError = 'Please choose an image file (JPG or PNG).');
      return;
    }
    if (await file.length() > _maxFileBytes) {
      setState(() => _formError = 'This image is too large. Please choose a photo under 10MB.');
      return;
    }
    setState(() {
      _formError = '';
      _photo = file;
      _frames = frames;
    });
  }

  Future<void> _takePhoto() async {
    setState(() {
      _mode = _InputMode.camera;
      _formError = '';
    });
    final capture = await CameraCaptureScreen.open(context);
    if (capture != null) await _accept(capture.photo, capture.frames);
  }

  Future<void> _uploadPhoto() async {
    setState(() {
      _mode = _InputMode.upload;
      _formError = '';
    });
    final file = await ImagePicker().pickImage(source: ImageSource.gallery);
    if (file != null) await _accept(file);
  }

  Future<void> _submit() async {
    final photo = _photo;
    if (photo == null) return;
    final height = _height;
    if (heightError(height).isNotEmpty) {
      setState(() => _heightTouched = true);
      return;
    }
    setState(() => _step = _Step.loading);
    final api = context.read<ApiClient>();
    final target = widget.target;
    _cancel = CancelToken();
    try {
      final form = FormData();
      form.files.add(MapEntry('image', await MultipartFile.fromFile(photo.path, filename: photo.name)));
      for (final frame in _frames) {
        form.files.add(MapEntry('frames', await MultipartFile.fromFile(frame.path, filename: frame.name)));
      }
      form.fields
        ..add(MapEntry('productId', target.productId))
        ..add(MapEntry('userHeight', '$height'))
        ..add(MapEntry('clothingFit', _fit))
        ..add(const MapEntry('includeTryOn', '$_includeTryOn'));

      final res = await api.dio.post(
        target.endpoint,
        data: form,
        cancelToken: _cancel,
        options: Options(
          headers: {if (target.apiKey != null) 'x-api-key': target.apiKey},
          extra: {if (target.apiKey != null) 'noAuth': true},
          // The GPU try-on can take up to a minute.
          receiveTimeout: const Duration(seconds: 150),
          sendTimeout: const Duration(seconds: 60),
          validateStatus: (_) => true,
        ),
      );
      if (!mounted) return;
      final data = res.data is Map ? Map<String, dynamic>.from(res.data as Map) : null;
      final ok = (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300 && data?['success'] == true;
      if (!ok) {
        setState(() {
          _errorMessage = '${data?['message'] ?? 'Something went wrong while analyzing your photo. Please try again.'}';
          _poseChecks = asList(data?['poseChecks']);
          _step = _Step.error;
        });
        return;
      }
      setState(() {
        _result = Map<String, dynamic>.from(data!['recommendation'] as Map);
        _tryOn = data['tryOn'] is Map ? Map<String, dynamic>.from(data['tryOn'] as Map) : null;
        _step = _Step.result;
      });
    } catch (e) {
      if (!mounted || (e is DioException && e.type == DioExceptionType.cancel)) return;
      setState(() {
        _errorMessage = errorMessage(
          e,
          "SnapFit's sizing service is temporarily unavailable. Please try again in a moment.",
        );
        _step = _Step.error;
      });
    }
  }

  void _close() {
    if (_step == _Step.loading) return;
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    // Always light: the widget stands in for a merchant's store page.
    return Theme(
      data: buildTheme(Brightness.light),
      child: Builder(
        builder: (context) {
          final c = context.colors;
          final canGoBack = _step == _Step.result || _step == _Step.error;
          return PopScope(
            canPop: _step != _Step.loading,
            child: Scaffold(
              backgroundColor: c.background,
              appBar: AppBar(
                automaticallyImplyLeading: false,
                titleSpacing: canGoBack ? 4 : 16,
                title: Row(
                  children: [
                    if (canGoBack)
                      TextButton.icon(
                        onPressed: _backToForm,
                        icon: Icon(LucideIcons.arrowLeft, size: 16, color: c.mutedForeground),
                        label: Text(
                          'Back',
                          style: snapText(size: 14, weight: FontWeight.w500, color: c.mutedForeground),
                        ),
                      ),
                    Expanded(child: Text(_stepTitles[_step]!, overflow: TextOverflow.ellipsis)),
                  ],
                ),
                actions: [
                  IconButton(
                    tooltip: 'Close',
                    icon: Icon(LucideIcons.x, size: 18, color: c.mutedForeground),
                    onPressed: _step == _Step.loading ? null : _close,
                  ),
                ],
              ),
              body: SafeArea(
                top: false,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
                  children: [
                    switch (_step) {
                      _Step.form => _buildForm(context),
                      _Step.loading => const _AnalysisProgress(includesTryOn: _includeTryOn),
                      _Step.result => _buildResult(context),
                      _Step.error => _buildError(context),
                    },
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildForm(BuildContext context) {
    final c = context.colors;
    final height = _height;
    final heightMessage = heightError(height);
    final showHeightError = _heightTouched && heightMessage.isNotEmpty;
    final photo = _photo;

    Widget choice(IconData icon, String label, VoidCallback onTap) => Expanded(
      child: SnapCard(
        onTap: onTap,
        padding: const EdgeInsets.symmetric(vertical: 20),
        child: Column(
          children: [
            Icon(icon, size: 22, color: c.mutedForeground),
            gap8,
            Text(
              label,
              style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
            ),
          ],
        ),
      ),
    );

    Widget switchLink(String label, VoidCallback onTap) => Center(
      child: TextButton(
        onPressed: onTap,
        child: Text(
          label,
          style: snapText(
            size: 12,
            weight: FontWeight.w500,
            color: c.mutedForeground,
            decoration: TextDecoration.underline,
          ),
        ),
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          "Take or upload a full-body photo and we'll estimate your best fit.",
          style: snapText(size: 14, color: c.mutedForeground),
        ),
        if (_mode == null) ...[
          gap16,
          Row(
            children: [
              choice(LucideIcons.camera, 'Take a Photo', _takePhoto),
              const SizedBox(width: 12),
              choice(LucideIcons.imagePlus, 'Upload a Photo', _uploadPhoto),
            ],
          ),
        ] else ...[
          gap16,
          SnapCard(
            onTap: _mode == _InputMode.upload ? _uploadPhoto : (photo == null ? _takePhoto : null),
            borderColor: c.border,
            borderWidth: 2,
            child: photo == null
                ? Column(
                    children: [
                      Icon(
                        _mode == _InputMode.camera ? LucideIcons.camera : LucideIcons.imagePlus,
                        size: 28,
                        color: c.mutedForeground,
                      ),
                      gap8,
                      Text(
                        _mode == _InputMode.camera
                            ? 'Tap to open the camera'
                            : 'Tap to choose a photo from your gallery',
                        textAlign: TextAlign.center,
                        style: snapText(size: 14, color: c.mutedForeground),
                      ),
                      gap4,
                      Text('JPG or PNG, up to 10MB', style: snapText(size: 12, color: c.mutedForeground)),
                    ],
                  )
                : Column(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: Image.file(File(photo.path), height: 180, fit: BoxFit.cover),
                      ),
                      gap8,
                      Text(
                        _mode == _InputMode.camera
                            ? (_frames.isEmpty ? 'Photo taken' : 'Photo taken with ${_frames.length} extra frames')
                            : '${photo.name} — tap to change',
                        textAlign: TextAlign.center,
                        style: snapText(size: 12, color: c.mutedForeground),
                      ),
                    ],
                  ),
          ),
          if (_mode == _InputMode.camera && photo != null) switchLink('Retake', _clearPhotoAndRetake),
          if (_mode == _InputMode.camera)
            switchLink('Or upload a photo instead', () {
              _clearPhoto();
              _uploadPhoto();
            })
          else
            switchLink('Or take a photo instead', () {
              _clearPhoto();
              _takePhoto();
            }),
        ],
        if (_formError.isNotEmpty) ...[gap8, Text(_formError, style: snapText(size: 14, color: c.danger))],
        if (_mode != null) ...[
          gap16,
          Row(
            children: [
              Icon(LucideIcons.ruler, size: 16, color: c.foreground),
              const SizedBox(width: 8),
              Text(
                'Height',
                style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
              ),
            ],
          ),
          gap8,
          Row(
            children: [
              Segmented<bool>(
                value: _metric,
                options: const {true: 'cm', false: 'ft/in'},
                onChanged: (v) => setState(() => _metric = v),
              ),
              const SizedBox(width: 12),
              if (_metric)
                SizedBox(width: 110, child: _heightInput(_cm, 'e.g. 178', 'Height in cm', showHeightError))
              else ...[
                SizedBox(width: 72, child: _heightInput(_feet, 'ft', 'Height, feet', showHeightError)),
                const SizedBox(width: 8),
                SizedBox(width: 72, child: _heightInput(_inches, 'in', 'Height, inches', showHeightError)),
              ],
            ],
          ),
          if (showHeightError) ...[gap4, Text(heightMessage, style: snapText(size: 12, color: c.danger))],
          gap16,
          Row(
            children: [
              Icon(LucideIcons.shirt, size: 16, color: c.foreground),
              const SizedBox(width: 8),
              Text(
                'What are you wearing?',
                style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
              ),
            ],
          ),
          gap8,
          Segmented<String>(
            value: _fit,
            options: _fitOptions,
            expand: true,
            onChanged: (v) => setState(() => _fit = v),
          ),
          gap4,
          Text('Fitted clothes give the most accurate size.', style: snapText(size: 12, color: c.mutedForeground)),
          gap24,
          SnapButton(
            label: 'Get My Size',
            size: ButtonSize.lg,
            expand: true,
            onPressed: photo == null ? null : _submit,
          ),
        ],
      ],
    );
  }

  void _clearPhotoAndRetake() {
    _clearPhoto();
    _takePhoto();
  }

  Widget _heightInput(TextEditingController controller, String hint, String label, bool error) {
    final c = context.colors;
    return Semantics(
      label: label,
      child: Focus(
        onFocusChange: (focused) {
          if (!focused) setState(() => _heightTouched = true);
        },
        child: TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          style: snapText(size: 14, color: c.foreground),
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            hintText: hint,
            enabledBorder: error
                ? OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide(color: c.danger),
                  )
                : null,
          ),
        ),
      ),
    );
  }

  Widget _buildResult(BuildContext context) {
    final c = context.colors;
    final result = _result!;
    final hasTryOnView = _tryOn != null && _tryOn!['status'] != 'unavailable';
    final tips = asList(result['photoTips']);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizeResultView(result: result),
        if (hasTryOnView) ...[
          gap24,
          SnapCard(
            child: TryOnPreview(tryOn: _tryOn, originalPath: _photo?.path, size: '${result['size']}'),
          ),
        ],
        gap24,
        Divider(color: c.border),
        gap16,
        Text(
          'How did it fit?',
          textAlign: TextAlign.center,
          style: snapText(size: 12, weight: FontWeight.w500, color: c.mutedForeground),
        ),
        gap8,
        if (_feedback != null)
          Text(
            'Thanks for your feedback!',
            textAlign: TextAlign.center,
            style: snapText(size: 14, color: c.mutedForeground),
          )
        else
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 8,
            children: [
              for (final (key, label) in const [('small', 'Too small'), ('perfect', 'Perfect'), ('large', 'Too large')])
                SnapButton(
                  label: label,
                  variant: ButtonVariant.secondary,
                  size: ButtonSize.sm,
                  onPressed: () => setState(() => _feedback = key),
                ),
            ],
          ),
        gap24,
        SnapButton(
          label: tips.isNotEmpty ? 'Retake photo' : 'Check another photo',
          variant: ButtonVariant.secondary,
          expand: true,
          onPressed: _resetFlow,
        ),
        gap12,
        SnapButton(label: 'Done', expand: true, onPressed: _close),
      ],
    );
  }

  Widget _buildError(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 24),
      child: Column(
        children: [
          Icon(LucideIcons.triangleAlert, size: 28, color: c.warning),
          gap12,
          Text(
            _errorMessage,
            textAlign: TextAlign.center,
            style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
          ),
          if (_poseChecks.length > 1) ...[
            gap12,
            for (final check in _poseChecks)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('•  ', style: snapText(size: 12, color: c.mutedForeground)),
                    Expanded(
                      child: Text('${check['message']}', style: snapText(size: 12, color: c.mutedForeground)),
                    ),
                  ],
                ),
              ),
          ],
          gap24,
          SnapButton(label: 'Try Again', onPressed: () => setState(() => _step = _Step.form)),
        ],
      ),
    );
  }
}

/// A spinner, the current stage and the seconds elapsed. The try-on can take
/// up to a minute on the GPU, so the copy changes as time passes.
class _AnalysisProgress extends StatefulWidget {
  const _AnalysisProgress({required this.includesTryOn});

  final bool includesTryOn;

  @override
  State<_AnalysisProgress> createState() => _AnalysisProgressState();
}

class _AnalysisProgressState extends State<_AnalysisProgress> {
  final _started = DateTime.now();
  late final Timer _timer;
  int _elapsed = 0;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      setState(() => _elapsed = DateTime.now().difference(_started).inSeconds);
    });
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  String get _message {
    if (!widget.includesTryOn || _elapsed < 5) return 'Measuring you…';
    if (_elapsed < 30) return 'Creating your try-on preview — this can take up to a minute.';
    return 'Almost there — your preview is still rendering…';
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 48),
      child: Column(
        children: [
          SizedBox(width: 32, height: 32, child: CircularProgressIndicator(color: c.foreground, strokeWidth: 3)),
          gap16,
          Semantics(
            liveRegion: true,
            child: Text(
              _message,
              textAlign: TextAlign.center,
              style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
            ),
          ),
          gap4,
          Text(
            '$_elapsed s elapsed',
            style: snapText(size: 12, color: c.mutedForeground, fontFeatures: const [FontFeature.tabularFigures()]),
          ),
        ],
      ),
    );
  }
}
