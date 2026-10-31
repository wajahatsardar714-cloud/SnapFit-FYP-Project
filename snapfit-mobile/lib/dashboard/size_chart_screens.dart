import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/format.dart';
import '../core/toast.dart';
import '../core/json.dart';
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/ui.dart';

const categoryOptions = ['tops', 'bottoms', 'dresses', 'footwear', 'outerwear'];
const _genderOptions = ['male', 'female', 'unisex'];
const _pageSize = 10;

const measurementFields = [
  ('chest', 'Chest'),
  ('waist', 'Waist'),
  ('hip', 'Hip'),
  ('shoulderWidth', 'Shoulder Width'),
  ('torsoLength', 'Torso Length'),
  ('inseam', 'Inseam'),
];

class SizeChartsScreen extends StatefulWidget {
  const SizeChartsScreen({super.key});

  @override
  State<SizeChartsScreen> createState() => _SizeChartsScreenState();
}

class _SizeChartsScreenState extends State<SizeChartsScreen> {
  List<dynamic> _charts = const [];
  Map _pagination = const {'page': 1, 'totalPages': 1, 'total': 0};
  String _category = '';
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load(1);
  }

  Future<void> _load(int page) async {
    setState(() => _loading = true);
    try {
      final res = await context.read<ApiClient>().get(
        '/charts',
        query: {'page': page, 'limit': _pageSize, 'category': _category},
      );
      if (!mounted) return;
      setState(() {
        _charts = asList(res['charts']);
        _pagination = (res['pagination'] as Map?) ?? _pagination;
      });
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load size charts'), kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _delete(Map chart) async {
    final ok = await confirmAction(
      context,
      title: 'Delete this size chart?',
      message: '"${chart['name']}" will be marked inactive and hidden from product mapping.',
      confirmLabel: 'Yes, delete',
    );
    if (!ok || !mounted) return;
    try {
      await context.read<ApiClient>().delete('/charts/${chart['_id']}');
      showToast('Size chart deleted', kind: ToastKind.success);
      await _load((_pagination['page'] as num? ?? 1).toInt());
    } catch (e) {
      showToast(errorMessage(e, 'Failed to delete size chart'), kind: ToastKind.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final page = (_pagination['page'] as num? ?? 1).toInt();
    final totalPages = (_pagination['totalPages'] as num? ?? 1).toInt();
    return PageBody(
      onRefresh: () => _load(page),
      children: [
        PageIntro(
          title: 'Size Charts',
          description: 'Manage the size charts used for fit recommendations.',
          actions: [
            SnapButton(
              label: 'Product Mapping',
              variant: ButtonVariant.secondary,
              onPressed: () => context.go('/dashboard/product-mapping'),
            ),
            SnapButton(
              label: 'Create New Chart',
              icon: LucideIcons.plus,
              onPressed: () => context.go('/dashboard/size-charts/new'),
            ),
          ],
        ),
        gap16,
        SnapSelect<String>(
          label: 'Category',
          value: _category,
          options: {'': 'All categories', for (final o in categoryOptions) o: capitalize(o)},
          onChanged: (v) {
            setState(() => _category = v ?? '');
            _load(1);
          },
        ),
        gap16,
        if (_loading)
          const PageLoader()
        else if (_charts.isEmpty)
          EmptyState(
            icon: LucideIcons.ruler,
            title: _category.isNotEmpty ? 'No charts match this category.' : 'No size charts yet.',
            action: _category.isNotEmpty
                ? SnapButton(
                    label: 'Clear filter',
                    variant: ButtonVariant.secondary,
                    size: ButtonSize.sm,
                    onPressed: () {
                      setState(() => _category = '');
                      _load(1);
                    },
                  )
                : SnapButton(
                    label: 'Create your first size chart',
                    icon: LucideIcons.plus,
                    onPressed: () => context.go('/dashboard/size-charts/new'),
                  ),
          )
        else
          for (final chart in _charts) ...[_ChartCard(chart as Map, onDelete: () => _delete(chart)), gap12],
        if (totalPages > 1) ...[
          gap4,
          Row(
            children: [
              Expanded(
                child: Text(
                  'Page $page of $totalPages (${_pagination['total']} total)',
                  style: snapText(size: 13, color: c.mutedForeground),
                ),
              ),
              SnapButton(
                label: 'Prev',
                icon: LucideIcons.chevronLeft,
                variant: ButtonVariant.secondary,
                size: ButtonSize.sm,
                onPressed: page <= 1 ? null : () => _load(page - 1),
              ),
              const SizedBox(width: 8),
              SnapButton(
                label: 'Next',
                variant: ButtonVariant.secondary,
                size: ButtonSize.sm,
                onPressed: page >= totalPages ? null : () => _load(page + 1),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

class _ChartCard extends StatelessWidget {
  const _ChartCard(this.chart, {required this.onDelete});

  final Map chart;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final active = chart['isActive'] == true;
    final details = [
      capitalize('${chart['category'] ?? ''}'),
      chart['gender'] == null || chart['gender'] == '' ? '—' : capitalize('${chart['gender']}'),
      '${asList(chart['sizes']).length} sizes',
    ].join(' · ');
    return SnapCard(
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${chart['name']}',
                  style: snapText(size: 15, weight: FontWeight.w600, color: c.foreground),
                ),
                gap4,
                Text(details, style: snapText(size: 13, color: c.mutedForeground)),
                gap8,
                SnapBadge(
                  active ? 'Active' : 'Inactive',
                  variant: active ? BadgeVariant.success : BadgeVariant.neutral,
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Edit ${chart['name']}',
            icon: Icon(LucideIcons.pencil, size: 18, color: c.link),
            onPressed: () => context.go('/dashboard/size-charts/${chart['_id']}/edit'),
          ),
          IconButton(
            tooltip: 'Delete ${chart['name']}',
            icon: Icon(LucideIcons.trash2, size: 18, color: active ? c.danger : c.muted),
            onPressed: active ? onDelete : null,
          ),
        ],
      ),
    );
  }
}

/// One size row in the editor. [id] keeps its fields attached to it when an
/// earlier size is removed.
class _SizeForm {
  _SizeForm(this.id, {this.label = '', Map<String, (String, String)>? ranges})
    : ranges = ranges ?? {for (final (key, _) in measurementFields) key: ('', '')};

  final int id;
  String label;
  final Map<String, (String min, String max)> ranges;
}

class SizeChartEditorScreen extends StatefulWidget {
  const SizeChartEditorScreen({super.key, this.chartId});

  /// Set when editing an existing chart.
  final String? chartId;

  @override
  State<SizeChartEditorScreen> createState() => _SizeChartEditorScreenState();
}

class _SizeChartEditorScreenState extends State<SizeChartEditorScreen> {
  var _nextId = 0;
  String _name = '';
  String _category = '';
  String _gender = '';
  String _unit = 'cm';
  late List<_SizeForm> _sizes = [_SizeForm(_nextId++), _SizeForm(_nextId++)];
  late bool _loading = widget.chartId != null;
  bool _saving = false;
  bool _touched = false;
  String _formError = '';

  bool get _isEdit => widget.chartId != null;

  @override
  void initState() {
    super.initState();
    if (_isEdit) _load();
  }

  Future<void> _load() async {
    try {
      final res = await context.read<ApiClient>().get('/charts/${widget.chartId}');
      final chart = res['chart'] as Map;
      if (!mounted) return;
      setState(() {
        _name = '${chart['name'] ?? ''}';
        _category = '${chart['category'] ?? ''}';
        _gender = '${chart['gender'] ?? ''}';
        _unit = '${chart['unit'] ?? 'cm'}';
        _sizes = [
          for (final size in asList(chart['sizes']))
            _SizeForm(
              _nextId++,
              label: '${size['label'] ?? ''}',
              ranges: {
                for (final (key, _) in measurementFields)
                  key: ('${size['measurements']?[key]?['min'] ?? ''}', '${size['measurements']?[key]?['max'] ?? ''}'),
              },
            ),
        ];
        _loading = false;
      });
    } catch (e) {
      showToast(errorMessage(e, 'Failed to load size chart'), kind: ToastKind.error);
      if (mounted) context.go('/dashboard/size-charts');
    }
  }

  ({String? name, String? category, String? sizesLength, List<Map<String, String>> sizes}) get _errors {
    final sizes = <Map<String, String>>[];
    for (final size in _sizes) {
      final e = <String, String>{};
      if (size.label.trim().isEmpty) e['label'] = 'Label is required';
      for (final (key, _) in measurementFields) {
        final (min, max) = size.ranges[key]!;
        if (min.isEmpty && max.isEmpty) continue;
        if (min.isEmpty || max.isEmpty) {
          e[key] = 'Both min and max are required';
        } else if ((num.tryParse(min) ?? 0) < 0) {
          e[key] = 'Min cannot be negative';
        } else if ((num.tryParse(max) ?? 0) <= (num.tryParse(min) ?? 0)) {
          e[key] = 'Max must be greater than min';
        }
      }
      sizes.add(e);
    }
    return (
      name: _name.trim().isEmpty ? 'Chart name is required' : null,
      category: _category.isEmpty ? 'Category is required' : null,
      sizesLength: _sizes.length < 2 ? 'At least 2 sizes are required' : null,
      sizes: sizes,
    );
  }

  Future<void> _submit() async {
    final errors = _errors;
    setState(() => _touched = true);
    final invalid =
        errors.name != null ||
        errors.category != null ||
        errors.sizesLength != null ||
        errors.sizes.any((s) => s.isNotEmpty);
    if (invalid) {
      setState(() => _formError = 'Please fix the highlighted errors below.');
      showToast('Please fix the highlighted errors', kind: ToastKind.error);
      return;
    }
    final payload = {
      'name': _name.trim(),
      'category': _category,
      if (_gender.isNotEmpty) 'gender': _gender,
      'unit': _unit,
      'sizes': [
        for (final size in _sizes)
          {
            'label': size.label.trim(),
            'measurements': {
              for (final (key, _) in measurementFields)
                if (size.ranges[key]!.$1.isNotEmpty && size.ranges[key]!.$2.isNotEmpty)
                  key: {'min': num.parse(size.ranges[key]!.$1), 'max': num.parse(size.ranges[key]!.$2)},
            },
          },
      ],
    };
    setState(() {
      _saving = true;
      _formError = '';
    });
    final api = context.read<ApiClient>();
    try {
      if (_isEdit) {
        await api.put('/charts/${widget.chartId}', payload);
        showToast('Size chart updated', kind: ToastKind.success);
      } else {
        await api.post('/charts', payload);
        showToast('Size chart created', kind: ToastKind.success);
      }
      if (mounted) context.go('/dashboard/size-charts');
    } catch (e) {
      final errorsList = errorBody(e)?['errors'];
      final list = errorsList is List ? errorsList.join(' • ') : null;
      final message = list ?? errorMessage(e, 'Failed to save size chart');
      if (mounted) setState(() => _formError = message);
      showToast(list != null ? 'Please fix the errors below' : message, kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    if (_loading) return const PageLoader();
    final errors = _errors;
    final activeKeys = measurementFields
        .where((f) => _sizes.any((s) => s.ranges[f.$1]!.$1.isNotEmpty && s.ranges[f.$1]!.$2.isNotEmpty))
        .toList();

    return Column(
      children: [
        Expanded(
          child: PageBody(
            children: [
              PageIntro(title: _isEdit ? 'Edit Size Chart' : 'Create Size Chart'),
              if (_formError.isNotEmpty) ...[gap16, SnapAlert(variant: AlertVariant.danger, description: _formError)],
              gap16,
              SectionCard(
                title: 'Basic info',
                child: Column(
                  children: [
                    SnapField(
                      label: 'Chart Name',
                      initialValue: _name,
                      error: _touched ? errors.name : null,
                      onChanged: (v) => setState(() => _name = v),
                    ),
                    gap16,
                    SnapSelect<String>(
                      label: 'Category',
                      value: _category,
                      error: _touched ? errors.category : null,
                      options: {'': 'Select a category', for (final o in categoryOptions) o: capitalize(o)},
                      onChanged: (v) => setState(() => _category = v ?? ''),
                    ),
                    gap16,
                    SnapSelect<String>(
                      label: 'Gender',
                      value: _gender,
                      options: {'': 'Not specified', for (final o in _genderOptions) o: capitalize(o)},
                      onChanged: (v) => setState(() => _gender = v ?? ''),
                    ),
                    gap16,
                    SnapSelect<String>(
                      label: 'Unit',
                      value: _unit,
                      options: const {'cm': 'Centimeters (cm)', 'inches': 'Inches'},
                      onChanged: (v) => setState(() => _unit = v ?? 'cm'),
                    ),
                  ],
                ),
              ),
              gap16,
              SectionCard(
                title: 'Sizes',
                trailing: _touched && errors.sizesLength != null
                    ? Text(errors.sizesLength!, style: snapText(size: 12, color: c.danger))
                    : null,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var i = 0; i < _sizes.length; i++) ...[
                      _SizeEditor(
                        key: ValueKey(_sizes[i].id),
                        index: i,
                        size: _sizes[i],
                        unit: _unit,
                        errors: _touched ? errors.sizes[i] : const {},
                        canRemove: _sizes.length > 2,
                        onChanged: () => setState(() {}),
                        onRemove: () => setState(() => _sizes.removeAt(i)),
                      ),
                      gap12,
                    ],
                    Align(
                      alignment: Alignment.centerLeft,
                      child: SnapButton(
                        label: 'Add Size',
                        icon: LucideIcons.plus,
                        variant: ButtonVariant.ghost,
                        size: ButtonSize.sm,
                        onPressed: () => setState(() => _sizes.add(_SizeForm(_nextId++))),
                      ),
                    ),
                  ],
                ),
              ),
              gap16,
              SectionCard(
                title: 'Preview',
                child: activeKeys.isEmpty
                    ? Text(
                        'Add measurements above to see a preview.',
                        style: snapText(size: 14, color: c.mutedForeground),
                      )
                    : SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: DataTable(
                          columnSpacing: 20,
                          headingTextStyle: snapText(size: 11, weight: FontWeight.w500, color: c.mutedForeground),
                          dataTextStyle: snapText(size: 14, color: c.foreground),
                          columns: [
                            const DataColumn(label: Text('SIZE')),
                            for (final (_, label) in activeKeys)
                              DataColumn(label: Text('${label.toUpperCase()} ($_unit)')),
                          ],
                          rows: [
                            for (var i = 0; i < _sizes.length; i++)
                              DataRow(
                                cells: [
                                  DataCell(
                                    Text(
                                      _sizes[i].label.isEmpty ? '#${i + 1}' : _sizes[i].label,
                                      style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
                                    ),
                                  ),
                                  for (final (key, _) in activeKeys)
                                    DataCell(
                                      Text(
                                        _sizes[i].ranges[key]!.$1.isNotEmpty && _sizes[i].ranges[key]!.$2.isNotEmpty
                                            ? '${_sizes[i].ranges[key]!.$1}–${_sizes[i].ranges[key]!.$2}'
                                            : '—',
                                      ),
                                    ),
                                ],
                              ),
                          ],
                        ),
                      ),
              ),
            ],
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: c.background,
            border: Border(top: BorderSide(color: c.border)),
          ),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: SafeArea(
            top: false,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                SnapButton(
                  label: 'Cancel',
                  variant: ButtonVariant.secondary,
                  onPressed: _saving ? null : () => context.go('/dashboard/size-charts'),
                ),
                const SizedBox(width: 12),
                SnapButton(label: _isEdit ? 'Save changes' : 'Create chart', loading: _saving, onPressed: _submit),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _SizeEditor extends StatelessWidget {
  const _SizeEditor({
    super.key,
    required this.index,
    required this.size,
    required this.unit,
    required this.errors,
    required this.canRemove,
    required this.onChanged,
    required this.onRemove,
  });

  final int index;
  final _SizeForm size;
  final String unit;
  final Map<String, String> errors;
  final bool canRemove;
  final VoidCallback onChanged;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: c.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              SizedBox(
                width: 160,
                child: SnapField(
                  label: 'Size Label',
                  hint: 'e.g. S, M, L',
                  initialValue: size.label,
                  error: errors['label'],
                  onChanged: (v) {
                    size.label = v;
                    onChanged();
                  },
                ),
              ),
              const Spacer(),
              IconButton(
                tooltip: 'Remove size ${index + 1}',
                icon: Icon(LucideIcons.trash2, size: 18, color: canRemove ? c.danger : c.muted),
                onPressed: canRemove ? onRemove : null,
              ),
            ],
          ),
          for (final (key, label) in measurementFields) ...[
            gap12,
            Text(
              '$label ($unit)',
              style: snapText(size: 14, weight: FontWeight.w500, color: c.foreground),
            ),
            gap4,
            Row(
              children: [
                Expanded(
                  child: _RangeInput(
                    hint: 'min',
                    label: '$label minimum',
                    value: size.ranges[key]!.$1,
                    error: errors[key] != null,
                    onChanged: (v) {
                      size.ranges[key] = (v, size.ranges[key]!.$2);
                      onChanged();
                    },
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Text('to', style: snapText(size: 12, color: c.mutedForeground)),
                ),
                Expanded(
                  child: _RangeInput(
                    hint: 'max',
                    label: '$label maximum',
                    value: size.ranges[key]!.$2,
                    error: errors[key] != null,
                    onChanged: (v) {
                      size.ranges[key] = (size.ranges[key]!.$1, v);
                      onChanged();
                    },
                  ),
                ),
              ],
            ),
            if (errors[key] != null) ...[gap4, Text(errors[key]!, style: snapText(size: 12, color: c.danger))],
          ],
        ],
      ),
    );
  }
}

class _RangeInput extends StatelessWidget {
  const _RangeInput({
    required this.hint,
    required this.label,
    required this.value,
    required this.error,
    required this.onChanged,
  });

  final String hint;
  final String label;
  final String value;
  final bool error;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Semantics(
      label: label,
      child: TextFormField(
        initialValue: value,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        style: snapText(size: 14, color: c.foreground),
        decoration: InputDecoration(
          hintText: hint,
          enabledBorder: error
              ? OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide(color: c.danger),
                )
              : null,
        ),
        onChanged: onChanged,
      ),
    );
  }
}
