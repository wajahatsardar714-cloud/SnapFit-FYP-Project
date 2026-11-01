import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../dashboard/product_mapping_screens.dart' show productImageUrl;
import '../sizecheck/size_check_flow.dart';
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/ui.dart';

const _tryOnStatus = {
  'ready': ('Try-on ready', BadgeVariant.success),
  'image_missing': ('Image missing', BadgeVariant.warning),
  'anchors_missing': ('Anchors missing', BadgeVariant.warning),
};

/// Runs the real sizing, measurement and try-on pipeline on SnapFit's own demo
/// product (set on the server). It runs on the super admin's session: no API
/// key, nothing billed, and no merchant account is ever chosen or shown.
class DemoStudioScreen extends StatefulWidget {
  const DemoStudioScreen({super.key});

  @override
  State<DemoStudioScreen> createState() => _DemoStudioScreenState();
}

class _DemoStudioScreenState extends State<DemoStudioScreen> {
  Map<String, dynamic>? _product;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final res = await context.read<ApiClient>().get('/admin/demo');
      if (mounted) setState(() => _product = Map<String, dynamic>.from(res['product'] as Map));
    } catch (e) {
      if (mounted) setState(() => _error = errorMessage(e, "Couldn't load the demo product."));
    }
  }

  @override
  Widget build(BuildContext context) {
    final product = _product;
    return PageBody(
      onRefresh: _load,
      children: [
        const PageIntro(
          title: 'Demo studio',
          description: 'Try the real sizing, measurement and try-on pipeline on the demo product. Runs on your admin session: no API key needed and nothing is billed.',
        ),
        gap16,
        if (_error != null)
          LoadError(message: _error!, onRetry: _load)
        else if (product == null)
          const PageLoader()
        else
          _StorePreview(
            product: product,
            onCheck: () => SizeCheckFlow.open(
              context,
              RecommendTarget.session(endpoint: '/admin/demo/recommend', productId: '${product['productId']}'),
            ),
          ),
      ],
    );
  }
}

/// Stands in for a store's product page: always light, like the widget.
class _StorePreview extends StatelessWidget {
  const _StorePreview({required this.product, required this.onCheck});

  final Map<String, dynamic> product;
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
                  height: 260,
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
                      Text('DEMO PRODUCT', style: snapText(size: 12, color: c.mutedForeground, letterSpacing: 0.8)),
                      gap4,
                      Text(
                        name,
                        style: snapText(size: 19, weight: FontWeight.w700, color: c.foreground),
                      ),
                      if (tryOn != null) ...[gap8, SnapBadge(tryOn.$1, variant: tryOn.$2)],
                      gap16,
                      SnapButton(label: 'Check My Size', expand: true, onPressed: onCheck),
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
