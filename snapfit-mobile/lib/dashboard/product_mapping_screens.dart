import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/toast.dart';
import '../core/json.dart';
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/ui.dart';
import 'widget_snippet.dart';

// Matches the backend's mapping.garmentLength values (default regular).
const _garmentLengths = {
  'cropped': ('Cropped', 'ends at the waist'),
  'regular': ('Regular', 'ends at the hips'),
  'long': ('Long', 'ends at mid-thigh'),
};

// Matches the backend's mapping.sleeveLength values (default short).
const _sleeveLengths = {
  'none': ('None', 'Sleeveless'),
  'short': ('Short', 'Half sleeves'),
  'long': ('Long', 'Full sleeves'),
};

/// A mapping's sleeve length as shown to people ("Half sleeves" when missing).
String sleeveLengthLabel(Object? sleeveLength) => (_sleeveLengths[sleeveLength] ?? _sleeveLengths['short']!).$2;

// Matches the backend's mapping.tryOnStatus values.
const _tryOnStatus = {
  'ready': ('Try-on ready', BadgeVariant.success),
  'image_missing': ('Image missing', BadgeVariant.warning),
  'anchors_missing': ('Anchors missing', BadgeVariant.warning),
};

const productImageHint =
    'JPG, PNG or WebP, up to 5MB, at least 400px on the shorter side. A transparent PNG or a plain-background flat-lay works best — try-on removes the background.';

String _anchorPointsPath(Map mapping) => '/dashboard/product-mapping/${mapping['_id']}/anchor-points';

/// The product photo's full URL (the backend stores a path under its origin).
String? productImageUrl(BuildContext context, Object? productImage) {
  if (productImage == null || '$productImage'.isEmpty) return null;
  final path = '$productImage';
  return path.startsWith('http') ? path : '${context.read<ApiClient>().serverOrigin}$path';
}

/// Picks a product photo from the gallery, checking the backend's rules
/// (JPEG, PNG or WebP, 5MB at most). Returns null when cancelled or invalid.
Future<XFile?> pickProductImage() async {
  final file = await ImagePicker().pickImage(source: ImageSource.gallery);
  if (file == null) return null;
  final name = file.name.toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].any(name.endsWith)) {
    showToast('Product images must be JPEG, PNG or WebP.', kind: ToastKind.error);
    return null;
  }
  if (await file.length() > 5 * 1024 * 1024) {
    showToast('Product images must be 5MB or smaller.', kind: ToastKind.error);
    return null;
  }
  return file;
}

Future<MultipartFile> multipartOf(XFile file) => MultipartFile.fromFile(file.path, filename: file.name);

class ProductMappingScreen extends StatefulWidget {
  const ProductMappingScreen({super.key});

  @override
  State<ProductMappingScreen> createState() => _ProductMappingScreenState();
}

class _ProductMappingScreenState extends State<ProductMappingScreen> {
  List<dynamic> _charts = const [];
  List<dynamic> _mappings = const [];
  bool _loading = true;
  final _productId = TextEditingController();
  final _productName = TextEditingController();
  String _sizeChartId = '';
  String _garmentLength = 'regular';
  String _sleeveLength = 'short';
  XFile? _imageFile;
  Map<String, String> _fieldErrors = {};
  String _formError = '';
  bool _submitting = false;
  String? _busyImageId;

  /// The mapping being edited in the form, or null when mapping a new product.
  Map? _editing;
  final _formKey = GlobalKey();
  final _search = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _productId.dispose();
    _productName.dispose();
    _search.dispose();
    super.dispose();
  }

  /// The existing mapping with the typed product ID, when mapping a new product.
  Map? get _alreadyMapped {
    if (_editing != null) return null;
    final id = _productId.text.trim();
    if (id.isEmpty) return null;
    return _mappings.cast<Map?>().firstWhere((m) => '${m?['productId']}' == id, orElse: () => null);
  }

  List<dynamic> get _filteredMappings {
    final q = _search.text.trim().toLowerCase();
    if (q.isEmpty) return _mappings;
    return _mappings
        .where(
          (m) =>
              '${m['productId'] ?? ''}'.toLowerCase().contains(q) ||
              '${m['productName'] ?? ''}'.toLowerCase().contains(q),
        )
        .toList();
  }

  /// Fills the form with [mapping] for editing and scrolls up to it.
  void _startEdit(Map mapping) {
    final chartId = '${(mapping['sizeChartId'] as Map?)?['_id'] ?? ''}';
    _productId.text = '${mapping['productId'] ?? ''}';
    _productName.text = '${mapping['productName'] ?? ''}';
    setState(() {
      _editing = mapping;
      _sizeChartId = _charts.any((c) => '${c['_id']}' == chartId) ? chartId : '';
      _garmentLength = _garmentLengths.containsKey(mapping['garmentLength'])
          ? '${mapping['garmentLength']}'
          : 'regular';
      _sleeveLength = _sleeveLengths.containsKey(mapping['sleeveLength']) ? '${mapping['sleeveLength']}' : 'short';
      _imageFile = null;
      _fieldErrors = {};
      _formError = '';
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final target = _formKey.currentContext;
      if (target != null && target.mounted) {
        Scrollable.ensureVisible(target, duration: const Duration(milliseconds: 300));
      }
    });
  }

  Future<void> _copyWidgetCode(Map mapping) async {
    final code = widgetSnippet(apiUrl: context.read<ApiClient>().baseUrl, productId: '${mapping['productId']}');
    await Clipboard.setData(ClipboardData(text: code));
    showToast('Widget code copied', kind: ToastKind.success);
  }

  Future<void> _load() async {
    final api = context.read<ApiClient>();
    try {
      final results = await Future.wait([
        api.get('/charts', query: {'limit': 100}),
        api.get('/products/mappings'),
      ]);
      if (!mounted) return;
      setState(() {
        _charts = asList(results[0]['charts']).where((c) => c['isActive'] == true).toList();
        _mappings = asList(results[1]['mappings']);
      });
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load product mappings'), kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Clears the form. [keepChoices] keeps the chart and lengths, so mapping
  /// several products of the same kind in a row needs fewer taps.
  void _resetForm({bool keepChoices = false}) {
    _productId.clear();
    _productName.clear();
    setState(() {
      if (!keepChoices) {
        _sizeChartId = '';
        _garmentLength = 'regular';
        _sleeveLength = 'short';
      }
      _editing = null;
      _imageFile = null;
      _fieldErrors = {};
      _formError = '';
    });
  }

  Future<void> _submit() async {
    final errors = <String, String>{
      if (_productId.text.trim().isEmpty) 'productId': 'Product ID is required',
      if (_sizeChartId.isEmpty) 'sizeChartId': 'Size chart is required',
    };
    if (errors.isNotEmpty) {
      setState(() {
        _fieldErrors = errors;
        _formError = 'Please fix the highlighted errors below.';
      });
      showToast('Product ID and size chart are required', kind: ToastKind.error);
      return;
    }
    setState(() {
      _fieldErrors = {};
      _formError = '';
      _submitting = true;
    });
    final fields = {
      'productId': _productId.text.trim(),
      'productName': _productName.text.trim(),
      'sizeChartId': _sizeChartId,
      'garmentLength': _garmentLength,
      'sleeveLength': _sleeveLength,
    };
    final image = _imageFile;
    final editing = _editing != null;
    final api = context.read<ApiClient>();
    try {
      final payload = image == null ? fields : FormData.fromMap({...fields, 'image': await multipartOf(image)});
      final res = await api.post('/products/map', payload);
      _resetForm(keepChoices: !editing);
      if (image != null) {
        showToast(
          '${editing ? 'Changes saved' : 'Product mapped'} — now place the 4 anchor points',
          kind: ToastKind.success,
        );
        if (mounted) context.go(_anchorPointsPath(res['mapping'] as Map));
        return;
      }
      showToast(editing ? 'Changes saved' : 'Product mapped', kind: ToastKind.success);
      await _load();
    } catch (e) {
      final message = errorMessage(e, 'Failed to map product');
      if (mounted) setState(() => _formError = message);
      showToast(message, kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _uploadImage(Map mapping) async {
    final file = await pickProductImage();
    if (file == null || !mounted) return;
    setState(() => _busyImageId = '${mapping['_id']}');
    try {
      await context.read<ApiClient>().put(
        '/products/${mapping['_id']}/image',
        FormData.fromMap({'image': await multipartOf(file)}),
      );
      showToast('Image saved — now place the 4 anchor points', kind: ToastKind.success);
      if (mounted) context.go(_anchorPointsPath(mapping));
    } catch (e) {
      showToast(errorMessage(e, 'Failed to upload image'), kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _busyImageId = null);
    }
  }

  Future<void> _removeImage(Map mapping) async {
    setState(() => _busyImageId = '${mapping['_id']}');
    try {
      await context.read<ApiClient>().delete('/products/${mapping['_id']}/image');
      showToast('Image removed', kind: ToastKind.success);
      await _load();
    } catch (e) {
      showToast(errorMessage(e, 'Failed to remove image'), kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _busyImageId = null);
    }
  }

  Future<void> _removeMapping(Map mapping) async {
    final ok = await confirmAction(
      context,
      title: 'Remove this mapping?',
      message: '"${mapping['productId']}" will no longer use a size chart for recommendations.',
      confirmLabel: 'Yes, remove',
    );
    if (!ok || !mounted) return;
    try {
      await context.read<ApiClient>().delete('/products/map/${mapping['_id']}');
      if (_editing?['_id'] == mapping['_id']) _resetForm();
      showToast('Mapping removed', kind: ToastKind.success);
      await _load();
    } catch (e) {
      showToast(errorMessage(e, 'Failed to remove mapping'), kind: ToastKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    if (_loading) return const PageLoader();
    final editing = _editing != null;
    final alreadyMapped = _alreadyMapped;
    final shown = _filteredMappings;
    return PageBody(
      onRefresh: _load,
      children: [
        const PageIntro(
          title: 'Product Mapping',
          description:
              'Link products from your store to a size chart. Product IDs come from your own e-commerce system.',
        ),
        gap16,
        SectionCard(
          key: _formKey,
          title: editing ? 'Edit mapping' : 'Map a product',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_formError.isNotEmpty) ...[SnapAlert(variant: AlertVariant.danger, description: _formError), gap16],
              SnapField(
                label: 'Product ID',
                controller: _productId,
                hint: 'e.g. SKU-1029',
                helper: 'Use the same product ID or SKU as in your store.',
                enabled: !editing,
                error: _fieldErrors['productId'],
                onChanged: (_) => setState(() {}),
              ),
              if (alreadyMapped != null) ...[
                gap8,
                SnapAlert(
                  variant: AlertVariant.warning,
                  description: 'This product is already mapped — saving will update it.',
                  action: SnapButton(
                    label: 'Edit it instead',
                    variant: ButtonVariant.secondary,
                    size: ButtonSize.sm,
                    onPressed: () => _startEdit(alreadyMapped),
                  ),
                ),
              ],
              gap16,
              SnapField(label: 'Product Name (optional)', controller: _productName, hint: 'e.g. Classic Crew Tee'),
              gap16,
              SnapSelect<String>(
                label: 'Size Chart',
                value: _sizeChartId,
                error: _fieldErrors['sizeChartId'],
                options: {
                  '': 'Select a size chart',
                  for (final chart in _charts) '${chart['_id']}': '${chart['name']} (${chart['category']})',
                },
                onChanged: (v) => setState(() => _sizeChartId = v ?? ''),
              ),
              if (_charts.isEmpty) ...[
                gap4,
                Row(
                  children: [
                    Text("You don't have any size charts yet. ", style: snapText(size: 12, color: c.mutedForeground)),
                    GestureDetector(
                      onTap: () => context.go('/dashboard/size-charts/new'),
                      child: Text(
                        'Create one',
                        style: snapText(
                          size: 12,
                          weight: FontWeight.w500,
                          color: c.primary,
                          decoration: TextDecoration.underline,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
              gap16,
              SnapSelect<String>(
                label: 'Garment length',
                value: _garmentLength,
                options: {for (final e in _garmentLengths.entries) e.key: '${e.value.$1} — ${e.value.$2}'},
                onChanged: (v) => setState(() => _garmentLength = v ?? 'regular'),
              ),
              gap4,
              Text(
                "Try-on replaces the shopper's own top down to this length.",
                style: snapText(size: 12, color: c.mutedForeground),
              ),
              gap16,
              SnapSelect<String>(
                label: 'Sleeve length',
                value: _sleeveLength,
                options: {for (final e in _sleeveLengths.entries) e.key: '${e.value.$1} — ${e.value.$2}'},
                onChanged: (v) => setState(() => _sleeveLength = v ?? 'short'),
              ),
              gap4,
              Text(
                "Try-on replaces the shopper's own sleeves down to this length.",
                style: snapText(size: 12, color: c.mutedForeground),
              ),
              gap16,
              const FieldLabel('Product image (optional, for try-on)'),
              InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: () async {
                  final file = await pickProductImage();
                  if (file != null) setState(() => _imageFile = file);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: c.border),
                  ),
                  child: Row(
                    children: [
                      Icon(LucideIcons.imagePlus, size: 18, color: c.muted),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          _imageFile?.name ?? 'Choose a flat-lay photo',
                          overflow: TextOverflow.ellipsis,
                          style: snapText(size: 14, color: c.foreground),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              gap4,
              Text(productImageHint, style: snapText(size: 12, color: c.mutedForeground, height: 1.45)),
              gap16,
              Wrap(
                alignment: WrapAlignment.end,
                spacing: 12,
                runSpacing: 8,
                children: [
                  SnapButton(
                    label: editing ? 'Cancel edit' : 'Cancel',
                    variant: ButtonVariant.secondary,
                    onPressed: _submitting ? null : _resetForm,
                  ),
                  SnapButton(
                    label: editing ? 'Save changes' : 'Map',
                    loading: _submitting,
                    onPressed: _charts.isEmpty ? null : _submit,
                  ),
                ],
              ),
            ],
          ),
        ),
        gap16,
        SectionCard(
          title: 'Existing mappings',
          child: _mappings.isEmpty
              ? Padding(
                  padding: const EdgeInsets.symmetric(vertical: 20),
                  child: Column(
                    children: [
                      Icon(LucideIcons.link2, size: 36, color: c.muted),
                      gap12,
                      Text('No products mapped yet.', style: snapText(size: 14, color: c.mutedForeground)),
                    ],
                  ),
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SnapField(
                      controller: _search,
                      hint: 'Search by product ID or name',
                      textInputAction: TextInputAction.search,
                      suffix: Icon(LucideIcons.search, size: 16, color: c.mutedForeground),
                      onChanged: (_) => setState(() {}),
                    ),
                    gap16,
                    if (shown.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Text(
                          'No mappings match "${_search.text.trim()}".',
                          textAlign: TextAlign.center,
                          style: snapText(size: 14, color: c.mutedForeground),
                        ),
                      ),
                    for (var i = 0; i < shown.length; i++) ...[
                      if (i > 0) Divider(height: 24, color: c.border),
                      _MappingTile(
                        mapping: shown[i] as Map,
                        busy: _busyImageId == '${shown[i]['_id']}',
                        onUpload: () => _uploadImage(shown[i] as Map),
                        onRemoveImage: () => _removeImage(shown[i] as Map),
                        onRemove: () => _removeMapping(shown[i] as Map),
                        onEdit: () => _startEdit(shown[i] as Map),
                        onCopyCode: () => _copyWidgetCode(shown[i] as Map),
                      ),
                    ],
                  ],
                ),
        ),
        gap16,
        SnapCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Your size charts',
                style: snapText(size: 14, weight: FontWeight.w600, color: c.foreground),
              ),
              gap12,
              if (_charts.isEmpty)
                Text('No active size charts yet.', style: snapText(size: 14, color: c.mutedForeground))
              else
                for (final chart in _charts) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: c.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                '${chart['name']}',
                                style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
                              ),
                            ),
                            SnapBadge('${chart['category']}', variant: BadgeVariant.info),
                          ],
                        ),
                        gap4,
                        Text(
                          '${asList(chart['sizes']).length} size${asList(chart['sizes']).length == 1 ? '' : 's'}'
                          '${chart['gender'] != null && chart['gender'] != '' ? ' · ${chart['gender']}' : ''}',
                          style: snapText(size: 12, color: c.mutedForeground),
                        ),
                      ],
                    ),
                  ),
                  gap8,
                ],
            ],
          ),
        ),
      ],
    );
  }
}

class _MappingTile extends StatelessWidget {
  const _MappingTile({
    required this.mapping,
    required this.busy,
    required this.onUpload,
    required this.onRemoveImage,
    required this.onRemove,
    required this.onEdit,
    required this.onCopyCode,
  });

  final Map mapping;
  final bool busy;
  final VoidCallback onUpload;
  final VoidCallback onRemoveImage;
  final VoidCallback onRemove;
  final VoidCallback onEdit;
  final VoidCallback onCopyCode;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final status = _tryOnStatus[mapping['tryOnStatus']] ?? _tryOnStatus['image_missing']!;
    final imageUrl = productImageUrl(context, mapping['productImage']);
    // The next step towards try-on, for a mapping that isn't ready yet.
    final ready = mapping['tryOnStatus'] == 'ready';
    final needsImage = !ready && (imageUrl == null || mapping['tryOnStatus'] == 'image_missing');
    final needsAnchors = !ready && !needsImage;
    final chartName = (mapping['sizeChartId'] as Map?)?['name'];
    final length = (_garmentLengths[mapping['garmentLength']] ?? _garmentLengths['regular']!).$1;
    final sleeves = sleeveLengthLabel(mapping['sleeveLength']);
    Widget link(String label, IconData? icon, VoidCallback? onTap, {Color? color}) => InkWell(
      onTap: busy ? null : onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[Icon(icon, size: 13, color: color ?? c.primary), const SizedBox(width: 4)],
            Text(
              label,
              style: snapText(
                size: 12,
                weight: FontWeight.w500,
                color: color ?? c.primary,
                decoration: TextDecoration.underline,
              ),
            ),
          ],
        ),
      ),
    );
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 56,
          height: 56,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: c.surface2,
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: c.border),
          ),
          child: imageUrl == null
              ? Icon(LucideIcons.imageOff, size: 18, color: c.muted)
              : Image.network(
                  imageUrl,
                  fit: BoxFit.contain,
                  errorBuilder: (_, _, _) => Icon(LucideIcons.imageOff, size: 18, color: c.muted),
                ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${mapping['productId']}',
                style: TextStyle(fontFamily: 'monospace', fontSize: 13, color: c.foreground),
              ),
              const SizedBox(height: 2),
              Text(
                '${mapping['productName'] ?? ''}'.isEmpty ? '—' : '${mapping['productName']}',
                style: snapText(size: 14, color: c.foreground),
              ),
              const SizedBox(height: 2),
              Text.rich(
                TextSpan(
                  style: snapText(size: 12, color: c.mutedForeground),
                  children: [
                    chartName == null
                        ? TextSpan(
                            text: 'Chart deleted',
                            style: snapText(size: 12, color: c.muted),
                          )
                        : TextSpan(text: '$chartName'),
                    TextSpan(text: ' · $length · $sleeves'),
                  ],
                ),
              ),
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  SnapBadge(status.$1, variant: status.$2),
                  if (needsImage)
                    SnapButton(
                      label: 'Add image',
                      icon: LucideIcons.imagePlus,
                      size: ButtonSize.sm,
                      variant: ButtonVariant.secondary,
                      onPressed: busy ? null : onUpload,
                    ),
                  if (needsAnchors)
                    SnapButton(
                      label: 'Set anchor points',
                      icon: LucideIcons.mapPin,
                      size: ButtonSize.sm,
                      variant: ButtonVariant.secondary,
                      onPressed: busy ? null : () => context.go(_anchorPointsPath(mapping)),
                    ),
                ],
              ),
              const SizedBox(height: 4),
              Wrap(
                spacing: 12,
                children: [
                  if (busy)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 4),
                      child: SizedBox(width: 13, height: 13, child: CircularProgressIndicator(strokeWidth: 2)),
                    ),
                  // "Add image" is the next-step button above when it applies.
                  if (!needsImage)
                    link(
                      imageUrl == null ? 'Add image' : 'Replace image',
                      busy ? null : LucideIcons.imagePlus,
                      onUpload,
                    ),
                  if (imageUrl != null && !needsAnchors)
                    link(
                      ready ? 'Edit points' : 'Place points',
                      LucideIcons.mapPin,
                      () => context.go(_anchorPointsPath(mapping)),
                    ),
                  if (imageUrl != null) link('Remove image', null, onRemoveImage, color: c.mutedForeground),
                  link('Copy widget code', LucideIcons.copy, onCopyCode),
                ],
              ),
            ],
          ),
        ),
        Column(
          children: [
            IconButton(
              tooltip: 'Edit mapping for ${mapping['productId']}',
              icon: Icon(LucideIcons.pencil, size: 18, color: c.link),
              onPressed: onEdit,
            ),
            IconButton(
              tooltip: 'Remove mapping for ${mapping['productId']}',
              icon: Icon(LucideIcons.trash2, size: 18, color: c.danger),
              onPressed: onRemove,
            ),
          ],
        ),
      ],
    );
  }
}

const _anchorPoints = [
  ('shoulderLeft', 'Left shoulder'),
  ('shoulderRight', 'Right shoulder'),
  ('hipLeft', 'Left hip'),
  ('hipRight', 'Right hip'),
];

const _defaultPoints = {
  'shoulderLeft': Offset(0.3, 0.18),
  'shoulderRight': Offset(0.7, 0.18),
  'hipLeft': Offset(0.32, 0.55),
  'hipRight': Offset(0.68, 0.55),
};

class AnchorPointsScreen extends StatefulWidget {
  const AnchorPointsScreen({super.key, required this.mappingId});

  final String mappingId;

  @override
  State<AnchorPointsScreen> createState() => _AnchorPointsScreenState();
}

class _AnchorPointsScreenState extends State<AnchorPointsScreen> {
  Map? _mapping;
  XFile? _imageFile;
  final Map<String, Offset> _points = Map.of(_defaultPoints);
  bool _saving = false;
  bool _dragging = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await context.read<ApiClient>().get('/products/mappings');
      final found = asList(res['mappings'])
          .cast<Map?>()
          .firstWhere((m) => m?['_id'] == widget.mappingId, orElse: () => null);
      if (!mounted) return;
      if (found == null) {
        showToast('Product mapping not found', kind: ToastKind.error);
        context.go('/dashboard/product-mapping');
        return;
      }
      final anchors = found['anchorPoints'];
      setState(() {
        _mapping = found;
        if (anchors is Map) {
          for (final (key, _) in _anchorPoints) {
            final p = anchors[key];
            if (p is Map) _points[key] = Offset((p['x'] as num).toDouble(), (p['y'] as num).toDouble());
          }
        }
      });
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load product mapping'), kind: ToastKind.error);
    }
  }

  Future<void> _pick() async {
    final file = await pickProductImage();
    if (file != null) setState(() => _imageFile = file);
  }

  Future<void> _save() async {
    final mapping = _mapping;
    if (_imageFile == null && mapping?['productImage'] == null) {
      showToast('Upload a product image first', kind: ToastKind.error);
      return;
    }
    setState(() => _saving = true);
    try {
      final form = FormData.fromMap({
        if (_imageFile != null) 'image': await multipartOf(_imageFile!),
        'anchorPoints': jsonEncode({
          for (final e in _points.entries) e.key: {'x': e.value.dx, 'y': e.value.dy},
        }),
      });
      if (!mounted) return;
      final res = await context.read<ApiClient>().put('/products/${widget.mappingId}/anchor-points', form);
      if (!mounted) return;
      setState(() {
        _mapping = res['mapping'] as Map? ?? _mapping;
        _imageFile = null;
      });
      showToast('Anchor points saved', kind: ToastKind.success);
    } catch (e) {
      showToast(errorMessage(e, 'Failed to save anchor points'), kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final mapping = _mapping;
    if (mapping == null) return const PageLoader();
    final colors = [c.primary, c.warning, c.success, c.danger];
    final networkUrl = productImageUrl(context, mapping['productImage']);
    final ImageProvider? image = _imageFile != null
        ? FileImage(File(_imageFile!.path))
        : networkUrl != null
        ? NetworkImage(networkUrl)
        : null;
    final name = '${mapping['productName'] ?? ''}'.isEmpty ? mapping['productId'] : mapping['productName'];

    return ListView(
      physics: _dragging ? const NeverScrollableScrollPhysics() : null,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        PageIntro(
          title: 'Anchor Points',
          description:
              "$name — place the 4 points where they land on this product's flat-lay photo. These are used to warp the product image onto a customer's photo for the size-preview overlay.",
        ),
        gap16,
        if (image == null)
          InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: _pick,
            child: Container(
              padding: const EdgeInsets.all(32),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: c.border, width: 2),
              ),
              child: Column(
                children: [
                  Icon(LucideIcons.imagePlus, size: 28, color: c.muted),
                  gap8,
                  Text('Tap to upload a product flat-lay photo', style: snapText(size: 14, color: c.foreground)),
                  gap4,
                  Text(
                    productImageHint,
                    textAlign: TextAlign.center,
                    style: snapText(size: 12, color: c.mutedForeground),
                  ),
                ],
              ),
            ),
          )
        else ...[
          Container(
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: c.surface2,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: c.border),
            ),
            child: Stack(
              children: [
                Image(image: image, width: double.infinity, fit: BoxFit.fitWidth),
                Positioned.fill(
                  child: LayoutBuilder(
                    builder: (context, box) => Stack(
                      children: [
                        for (var i = 0; i < _anchorPoints.length; i++)
                          _AnchorMarker(
                            position: Offset(
                              _points[_anchorPoints[i].$1]!.dx * box.maxWidth,
                              _points[_anchorPoints[i].$1]!.dy * box.maxHeight,
                            ),
                            color: colors[i],
                            label: _anchorPoints[i].$2,
                            onDragState: (dragging) => setState(() => _dragging = dragging),
                            onMove: (delta) => setState(() {
                              final key = _anchorPoints[i].$1;
                              final p = _points[key]!;
                              _points[key] = Offset(
                                (p.dx + delta.dx / box.maxWidth).clamp(0.0, 1.0),
                                (p.dy + delta.dy / box.maxHeight).clamp(0.0, 1.0),
                              );
                            }),
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          gap12,
          Wrap(
            spacing: 16,
            runSpacing: 6,
            children: [
              for (var i = 0; i < _anchorPoints.length; i++)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(color: colors[i], shape: BoxShape.circle),
                    ),
                    const SizedBox(width: 6),
                    Text(_anchorPoints[i].$2, style: snapText(size: 12, color: c.mutedForeground)),
                  ],
                ),
            ],
          ),
          gap8,
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: _pick,
              child: Text(
                'Replace photo',
                style: snapText(
                  size: 14,
                  weight: FontWeight.w500,
                  color: c.primary,
                  decoration: TextDecoration.underline,
                ),
              ),
            ),
          ),
        ],
        gap16,
        Wrap(
          spacing: 12,
          runSpacing: 8,
          children: [
            SnapButton(label: 'Save anchor points', loading: _saving, onPressed: image == null ? null : _save),
            SnapButton(
              label: 'Back',
              variant: ButtonVariant.secondary,
              onPressed: () => context.go('/dashboard/product-mapping'),
            ),
          ],
        ),
      ],
    );
  }
}

/// A draggable coloured dot. Touching it stops the page scrolling so the drag
/// moves the point instead.
class _AnchorMarker extends StatelessWidget {
  const _AnchorMarker({
    required this.position,
    required this.color,
    required this.label,
    required this.onMove,
    required this.onDragState,
  });

  final Offset position;
  final Color color;
  final String label;
  final ValueChanged<Offset> onMove;
  final ValueChanged<bool> onDragState;

  static const _hit = 44.0;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Positioned(
      left: position.dx - _hit / 2,
      top: position.dy - _hit / 2,
      child: Semantics(
        label: label,
        child: Listener(
          onPointerDown: (_) => onDragState(true),
          onPointerMove: (e) => onMove(e.delta),
          onPointerUp: (_) => onDragState(false),
          onPointerCancel: (_) => onDragState(false),
          child: SizedBox(
            width: _hit,
            height: _hit,
            child: Center(
              child: Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  color: color,
                  shape: BoxShape.circle,
                  border: Border.all(color: c.primaryForeground, width: 2),
                  boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 3)],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
