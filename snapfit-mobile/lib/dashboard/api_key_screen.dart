import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/app_settings.dart';
import '../core/toast.dart';
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/ui.dart';

const _placeholderKey = 'sk_live_a1b2c3d4...x9y0';

class ApiKeyScreen extends StatefulWidget {
  const ApiKeyScreen({super.key});

  @override
  State<ApiKeyScreen> createState() => _ApiKeyScreenState();
}

class _ApiKeyScreenState extends State<ApiKeyScreen> {
  String? _apiKey;
  bool _isFullKey = false;
  bool _loading = true;
  bool _working = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await context.read<ApiClient>().get('/merchant/api-key');
      if (mounted) {
        setState(() {
          _apiKey = res['apiKey'] as String?;
          _isFullKey = false;
        });
      }
    } catch (e) {
      if (statusOf(e) == 404) {
        if (mounted) setState(() => _apiKey = null);
      } else {
        showToast(errorMessage(e, 'Failed to load API key'), kind: ToastKind.error);
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _issue({required bool regenerate}) async {
    if (regenerate) {
      final ok = await confirmAction(
        context,
        title: 'Regenerate API key?',
        message: 'Regenerating creates a brand new key and immediately invalidates your current one. Any integrations using the old key will stop working until you update them.',
        confirmLabel: 'Yes, regenerate',
      );
      if (!ok || !mounted) return;
    }
    setState(() => _working = true);
    try {
      final res = await context.read<ApiClient>().post('/merchant/api-key/${regenerate ? 'regenerate' : 'generate'}');
      if (!mounted) return;
      setState(() {
        _apiKey = res['apiKey'] as String?;
        _isFullKey = true;
      });
      showToast(regenerate ? 'API key regenerated' : 'API key generated', kind: ToastKind.success);
    } catch (e) {
      showToast(
        errorMessage(e, regenerate ? 'Failed to regenerate API key' : 'Failed to generate API key'),
        kind: ToastKind.error,
      );
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _copy(String text) async {
    await Clipboard.setData(ClipboardData(text: text));
    showToast('Copied to clipboard', kind: ToastKind.success);
  }

  /// Mobile: saves a freshly shown full key for the Size Check screen.
  Future<void> _useForSizeCheck(String key) async {
    final settings = context.read<AppSettings>();
    await settings.setDemoConfig(apiKey: key, productId: settings.demoProductId);
    showToast('Saved for Size Check', kind: ToastKind.success);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final apiBase = context.read<ApiClient>().baseUrl;
    final key = _apiKey;
    return PageBody(
      onRefresh: _load,
      children: [
        const PageIntro(title: 'API Key', description: 'Use this key to authenticate requests to the SnapFit API.'),
        gap16,
        SnapCard(
          child: _loading
              ? const PageLoader()
              : key == null
              ? Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Column(
                    children: [
                      Icon(LucideIcons.keyRound, size: 32, color: c.muted),
                      gap12,
                      Text(
                        "You haven't generated an API key yet.",
                        textAlign: TextAlign.center,
                        style: snapText(size: 14, color: c.mutedForeground),
                      ),
                      gap16,
                      SnapButton(
                        label: 'Generate API Key',
                        loading: _working,
                        onPressed: () => _issue(regenerate: false),
                      ),
                    ],
                  ),
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (_isFullKey) ...[
                      const SnapAlert(
                        variant: AlertVariant.warning,
                        description: "Copy this key now — you won't be able to see the full key again.",
                      ),
                      gap12,
                    ],
                    const FieldLabel('Live API Key'),
                    Row(
                      children: [
                        Expanded(
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                            decoration: BoxDecoration(
                              color: c.surface,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: c.border),
                            ),
                            child: SelectableText(
                              key,
                              style: TextStyle(fontFamily: 'monospace', fontSize: 13, color: c.foreground),
                            ),
                          ),
                        ),
                        IconButton(
                          tooltip: 'Copy API key',
                          icon: Icon(LucideIcons.copy, size: 18, color: c.link),
                          onPressed: () => _copy(key),
                        ),
                      ],
                    ),
                    gap16,
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        SnapButton(
                          label: 'Regenerate key',
                          icon: LucideIcons.refreshCw,
                          variant: ButtonVariant.secondary,
                          size: ButtonSize.sm,
                          onPressed: _working ? null : () => _issue(regenerate: true),
                        ),
                        if (_isFullKey)
                          SnapButton(
                            label: 'Use for Size Check',
                            icon: LucideIcons.scanLine,
                            variant: ButtonVariant.secondary,
                            size: ButtonSize.sm,
                            onPressed: () => _useForSizeCheck(key),
                          ),
                      ],
                    ),
                  ],
                ),
        ),
        gap24,
        Text(
          'Quick start',
          style: snapText(size: 14, weight: FontWeight.w600, color: c.foreground),
        ),
        gap4,
        Text(
          'Pass your key in the x-api-key header when calling POST $apiBase/recommend.',
          style: snapText(size: 14, color: c.mutedForeground, height: 1.5),
        ),
        gap16,
        CodeBlock(
          label: 'cURL',
          'curl -X POST $apiBase/recommend \\\n'
          '  -H "x-api-key: ${key ?? _placeholderKey}" \\\n'
          '  -F "image=@photo.jpg" \\\n'
          '  -F "productId=12345"',
        ),
        gap16,
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton(
            onPressed: () => context.go('/dashboard/docs'),
            child: Text(
              'View full documentation, code examples, and a live tester',
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
    );
  }
}
