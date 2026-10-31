import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/app_settings.dart';
import '../dashboard/product_mapping_screens.dart' show productImageUrl;
import '../core/json.dart';
import '../sizecheck/size_check_flow.dart';
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/ui.dart';
import 'admin_screens.dart' show merchantPath;

const _tryOnStatus = {
  'ready': ('Try-on ready', BadgeVariant.success),
  'image_missing': ('Image missing', BadgeVariant.warning),
  'anchors_missing': ('Anchors missing', BadgeVariant.warning),
};

/// Runs the real size estimation, measurement and try-on for any merchant's
/// product. Admin session mode needs no API key and uses no quota; API key
/// mode behaves exactly like the merchant's own storefront widget.
class DemoStudioScreen extends StatefulWidget {
  const DemoStudioScreen({super.key, this.merchantId});

  final String? merchantId;

  @override
  State<DemoStudioScreen> createState() => _DemoStudioScreenState();
}

class _DemoStudioScreenState extends State<DemoStudioScreen> {
  List<dynamic>? _merchants;
  bool _merchantsFailed = false;
  late String _merchantId = widget.merchantId ?? '';
  List<dynamic>? _products;
  bool _productsFailed = false;
  String _productId = '';
  bool _adminMode = true;
  late final _apiKey = TextEditingController(text: context.read<AppSettings>().adminDemoApiKey);

  @override
  void initState() {
    super.initState();
    _loadMerchants();
    if (_merchantId.isNotEmpty) _loadProducts();
  }

  @override
  void dispose() {
    _apiKey.dispose();
    super.dispose();
  }

  Future<void> _loadMerchants() async {
    setState(() => _merchantsFailed = false);
    try {
      final res = await context.read<ApiClient>().get('/admin/merchants', query: {'limit': 100});
      if (mounted) setState(() => _merchants = asList(res['merchants']));
    } catch (_) {
      if (mounted) setState(() => _merchantsFailed = true);
    }
  }

  Future<void> _loadProducts() async {
    final id = _merchantId;
    setState(() {
      _products = null;
      _productsFailed = false;
      _productId = '';
    });
    if (id.isEmpty) return;
    try {
      final res = await context.read<ApiClient>().get(merchantPath(id));
      if (!mounted || id != _merchantId) return;
      final products = asList(res['products']);
      setState(() {
        _products = products;
        _productId = products.isEmpty ? '' : '${products.first['productId']}';
      });
    } catch (_) {
      if (mounted) setState(() => _productsFailed = true);
    }
  }

  void _chooseMerchant(String id) {
    setState(() => _merchantId = id);
    context.go(id.isEmpty ? '/admin/demo' : '/admin/demo?merchantId=$id');
    _loadProducts();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final products = _products;
    final product = products?.cast<Map?>().firstWhere((p) => p?['productId'] == _productId, orElse: () => null);

    Widget modeOption(bool admin, String label, IconData icon) {
      final selected = _adminMode == admin;
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Semantics(
          inMutuallyExclusiveGroup: true,
          checked: selected,
          child: SnapCard(
            onTap: () => setState(() => _adminMode = admin),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            color: selected ? c.adminSoft : null,
            borderColor: selected ? c.admin : null,
            child: Row(
              children: [
                Icon(icon, size: 16, color: selected ? c.admin : c.foreground),
                const SizedBox(width: 8),
                Text(
                  label,
                  style: snapText(
                    size: 14,
                    weight: selected ? FontWeight.w500 : FontWeight.w400,
                    color: selected ? c.admin : c.foreground,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return PageBody(
      children: [
        const PageIntro(
          title: 'Demo studio',
          description: "Try the real sizing, measurement and try-on pipeline on any merchant's product.",
        ),
        gap16,
        SnapCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                '1. Product',
                style: snapText(size: 14, weight: FontWeight.w600, color: c.foreground),
              ),
              gap16,
              if (_merchantsFailed)
                LoadError(message: "Couldn't load merchants.", onRetry: _loadMerchants)
              else if (_merchants == null)
                const PageLoader()
              else ...[
                SnapSelect<String>(
                  label: 'Merchant',
                  value: _merchantId,
                  options: {
                    '': 'Choose a merchant…',
                    for (final m in _merchants!)
                      '${m['_id']}': '${m['businessName']}${m['status'] == 'suspended' ? ' (suspended)' : ''}',
                  },
                  onChanged: (v) => _chooseMerchant(v ?? ''),
                ),
                if (_productsFailed) ...[
                  gap12,
                  const SnapAlert(variant: AlertVariant.danger, description: "Couldn't load this merchant's products."),
                ],
                if (products != null && products.isEmpty) ...[
                  gap12,
                  const SnapAlert(
                    variant: AlertVariant.warning,
                    description: 'This merchant has no mapped products yet.',
                  ),
                ],
                if (products != null && products.isNotEmpty) ...[
                  gap16,
                  SnapSelect<String>(
                    label: 'Product',
                    value: _productId,
                    options: {
                      for (final p in products)
                        '${p['productId']}': '${p['productName'] ?? ''}'.isEmpty
                            ? '${p['productId']}'
                            : '${p['productName']} (${p['productId']})',
                    },
                    onChanged: (v) => setState(() => _productId = v ?? ''),
                  ),
                ],
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
                '2. Authentication',
                style: snapText(size: 14, weight: FontWeight.w600, color: c.foreground),
              ),
              gap16,
              modeOption(true, 'Admin session', LucideIcons.shieldCheck),
              modeOption(false, 'Use an API key instead', LucideIcons.keyRound),
              gap4,
              if (_adminMode)
                Text(
                  "Runs with your admin session: no API key needed and nothing counts against the merchant's quota.",
                  style: snapText(size: 12, color: c.mutedForeground, height: 1.5),
                )
              else ...[
                SnapField(
                  label: 'Merchant API key',
                  controller: _apiKey,
                  hint: 'sk_live_...',
                  monospace: true,
                  onChanged: (v) {
                    context.read<AppSettings>().setAdminDemoApiKey(v.trim());
                    setState(() {});
                  },
                ),
                gap4,
                Text(
                  "Use the selected merchant's key; it is saved on this phone only. Requests count against their quota, exactly like their storefront.",
                  style: snapText(size: 12, color: c.mutedForeground, height: 1.5),
                ),
              ],
            ],
          ),
        ),
        gap16,
        if (product == null)
          const EmptyState(icon: LucideIcons.shirt, title: 'Choose a merchant and product to load the widget.')
        else
          _StorePreview(
            product: product,
            enabled: _adminMode || _apiKey.text.trim().isNotEmpty,
            onCheck: () => SizeCheckFlow.open(
              context,
              _adminMode
                  ? RecommendTarget.session(
                      endpoint: '/admin/demo/recommend?merchantId=${Uri.encodeComponent(_merchantId)}',
                      productId: _productId,
                    )
                  : RecommendTarget.apiKey(_apiKey.text.trim(), productId: _productId),
            ),
          ),
      ],
    );
  }
}

/// Stands in for the merchant's store page: always light, like the widget.
class _StorePreview extends StatelessWidget {
  const _StorePreview({required this.product, required this.enabled, required this.onCheck});

  final Map product;
  final bool enabled;
  final VoidCallback onCheck;

  @override
  Widget build(BuildContext context) {
    final imageUrl = productImageUrl(context, product['productImage']);
    final tryOn = _tryOnStatus[product['tryOnStatus']];
    final name = '${product['productName'] ?? ''}'.isEmpty ? '${product['productId']}' : '${product['productName']}';
    return Theme(
      data: buildTheme(Brightness.light),
      child: Builder(
        builder: (context) {
          final c = context.colors;
          return Container(
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: c.background,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: c.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  height: 240,
                  color: c.surface2,
                  padding: const EdgeInsets.all(16),
                  child: imageUrl == null
                      ? Icon(LucideIcons.shirt, size: 56, color: c.muted)
                      : Image.network(
                          imageUrl,
                          fit: BoxFit.contain,
                          semanticLabel: name,
                          errorBuilder: (_, _, _) => Icon(LucideIcons.shirt, size: 56, color: c.muted),
                        ),
                ),
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${product['productId']}',
                        style: TextStyle(fontFamily: 'monospace', fontSize: 12, color: c.mutedForeground),
                      ),
                      gap4,
                      Text(
                        name,
                        style: snapText(size: 19, weight: FontWeight.w700, color: c.foreground),
                      ),
                      if (tryOn != null) ...[gap8, SnapBadge(tryOn.$1, variant: tryOn.$2)],
                      gap16,
                      SnapButton(label: 'Check My Size', onPressed: enabled ? onCheck : null),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
