import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/app_settings.dart';
import '../sizecheck/size_check_flow.dart';
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/ui.dart';

/// The web's /demo/size-check page on the phone: the API key and a mapped
/// product ID (remembered on this device), then a stand-in product page with
/// the "Check My Size" widget, exactly as a shopper would use it.
class SizeCheckScreen extends StatefulWidget {
  const SizeCheckScreen({super.key});

  @override
  State<SizeCheckScreen> createState() => _SizeCheckScreenState();
}

class _SizeCheckScreenState extends State<SizeCheckScreen> {
  late final AppSettings _settings = context.read<AppSettings>();
  late final _apiKey = TextEditingController(text: _settings.demoApiKey);
  late final _productId = TextEditingController(text: _settings.demoProductId);

  @override
  void dispose() {
    _apiKey.dispose();
    _productId.dispose();
    super.dispose();
  }

  void _persist() {
    _settings.setDemoConfig(apiKey: _apiKey.text.trim(), productId: _productId.text.trim());
    setState(() {});
  }

  bool get _configured => _apiKey.text.trim().isNotEmpty && _productId.text.trim().isNotEmpty;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return PageBody(
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: c.background,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: c.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'TESTER CONFIG',
                style: snapText(size: 12, weight: FontWeight.w600, color: c.mutedForeground, letterSpacing: 0.8),
              ),
              gap4,
              Text(
                'Fill these in with a real API key and mapped product ID from your dashboard to test the widget below as an external merchant site would.',
                style: snapText(size: 12, color: c.mutedForeground, height: 1.5),
              ),
              gap12,
              SnapField(
                label: 'API Key',
                controller: _apiKey,
                hint: 'sk_live_...',
                monospace: true,
                onChanged: (_) => _persist(),
              ),
              gap4,
              GestureDetector(
                onTap: () => context.go('/dashboard/api-key'),
                child: Text(
                  'The full key is shown once, when you generate or regenerate it on the API Key page.',
                  style: snapText(size: 12, color: c.link, decoration: TextDecoration.underline),
                ),
              ),
              gap12,
              SnapField(
                label: 'Product ID',
                controller: _productId,
                hint: 'prod-123',
                monospace: true,
                onChanged: (_) => _persist(),
              ),
            ],
          ),
        ),
        gap24,
        // A stand-in store product page: always light, like the widget.
        Theme(
          data: buildTheme(Brightness.light),
          child: Builder(
            builder: (context) {
              final l = context.colors;
              return Container(
                clipBehavior: Clip.antiAlias,
                decoration: BoxDecoration(
                  color: l.background,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: l.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Container(
                      height: 220,
                      color: l.surface2,
                      child: Icon(LucideIcons.shirt, size: 64, color: l.muted),
                    ),
                    Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'EVERYDAY ESSENTIALS',
                            style: snapText(size: 12, color: l.mutedForeground, letterSpacing: 0.8),
                          ),
                          gap4,
                          Text(
                            'Classic Crew Neck T-Shirt',
                            style: snapText(size: 22, weight: FontWeight.w700, color: l.foreground),
                          ),
                          gap8,
                          Text(
                            '\$24.00',
                            style: snapText(size: 19, weight: FontWeight.w600, color: l.foreground),
                          ),
                          gap12,
                          Text(
                            'A soft, breathable everyday tee. Not sure which size to order? Use SnapFit to get a personalized recommendation from a photo.',
                            style: snapText(size: 14, color: l.mutedForeground, height: 1.5),
                          ),
                          gap24,
                          Row(
                            children: [
                              Expanded(
                                child: SnapButton(
                                  label: 'Check My Size',
                                  expand: true,
                                  onPressed: _configured
                                      ? () => SizeCheckFlow.open(
                                          context,
                                          RecommendTarget.apiKey(
                                            _apiKey.text.trim(),
                                            productId: _productId.text.trim(),
                                          ),
                                        )
                                      : null,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: SnapButton(
                                  label: 'Add to Cart',
                                  variant: ButtonVariant.secondary,
                                  expand: true,
                                  onPressed: () {},
                                ),
                              ),
                            ],
                          ),
                          if (!_configured) ...[
                            gap8,
                            Text(
                              'Set an API key and product ID to enable this',
                              style: snapText(size: 12, color: l.mutedForeground),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
