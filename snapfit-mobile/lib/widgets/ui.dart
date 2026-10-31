// The shared UI kit, matching the web app's src/components/ui: Button, Card,
// Badge, Alert, StatCard, form fields, dialogs and page states.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';

enum ButtonVariant { primary, secondary, danger, ghost, admin }

enum ButtonSize { sm, md, lg }

class SnapButton extends StatelessWidget {
  const SnapButton({
    super.key,
    required this.label,
    this.onPressed,
    this.variant = ButtonVariant.primary,
    this.size = ButtonSize.md,
    this.icon,
    this.loading = false,
    this.expand = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final ButtonVariant variant;
  final ButtonSize size;
  final IconData? icon;
  final bool loading;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (bg, fg, border) = switch (variant) {
      ButtonVariant.primary => (c.primary, c.primaryForeground, null),
      ButtonVariant.secondary => (c.surface, c.foreground, c.border),
      ButtonVariant.danger => (c.danger, c.primaryForeground, null),
      ButtonVariant.ghost => (Colors.transparent, c.link, null),
      ButtonVariant.admin => (c.admin, c.adminForeground, null),
    };
    final (padding, fontSize) = switch (size) {
      ButtonSize.sm => (const EdgeInsets.symmetric(horizontal: 12, vertical: 7), 12.0),
      ButtonSize.md => (const EdgeInsets.symmetric(horizontal: 16, vertical: 10), 14.0),
      ButtonSize.lg => (const EdgeInsets.symmetric(horizontal: 20, vertical: 13), 16.0),
    };
    final enabled = onPressed != null && !loading;
    final leading = loading
        ? SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: fg))
        : icon == null
        ? null
        : Icon(icon, size: 16, color: fg);

    final button = Opacity(
      opacity: enabled || loading ? 1 : 0.5,
      child: Material(
        color: bg,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: border == null ? BorderSide.none : BorderSide(color: border),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: enabled ? onPressed : null,
          child: Padding(
            padding: padding,
            child: Row(
              mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (leading != null) ...[leading, const SizedBox(width: 8)],
                Flexible(
                  child: Text(
                    label,
                    textAlign: TextAlign.center,
                    style: snapText(size: fontSize, weight: FontWeight.w600, color: fg),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    return Semantics(button: true, enabled: enabled, child: button);
  }
}

/// A bordered surface card (rounded-xl, border, p-4 on phones).
class SnapCard extends StatelessWidget {
  const SnapCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.color,
    this.borderColor,
    this.borderWidth = 1,
    this.onTap,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? color;
  final Color? borderColor;
  final double borderWidth;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    // A Material surface (not a coloured box), so ink from list tiles and
    // expansion tiles inside the card stays visible.
    return SizedBox(
      width: double.infinity,
      child: Material(
        color: color ?? c.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: borderColor ?? c.border, width: borderWidth),
        ),
        clipBehavior: Clip.antiAlias,
        child: onTap == null
            ? Padding(padding: padding, child: child)
            : InkWell(
                onTap: onTap,
                child: Padding(padding: padding, child: child),
              ),
      ),
    );
  }
}

/// A card with a title row (and optional trailing action) over its body.
class SectionCard extends StatelessWidget {
  const SectionCard({super.key, required this.title, this.subtitle, this.trailing, required this.child});

  final String title;
  final String? subtitle;
  final Widget? trailing;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SnapCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: snapText(size: 15, weight: FontWeight.w600, color: c.foreground),
                      ),
                      if (subtitle != null) ...[
                        const SizedBox(height: 2),
                        Text(subtitle!, style: snapText(size: 13, color: c.mutedForeground)),
                      ],
                    ],
                  ),
                ),
                ?trailing,
              ],
            ),
          ),
          Divider(height: 1, color: c.border),
          Padding(padding: const EdgeInsets.all(16), child: child),
        ],
      ),
    );
  }
}

enum BadgeVariant { success, danger, warning, info, neutral, admin }

BadgeVariant badgeVariantFrom(String? name) =>
    BadgeVariant.values.firstWhere((v) => v.name == name, orElse: () => BadgeVariant.neutral);

class SnapBadge extends StatelessWidget {
  const SnapBadge(this.label, {super.key, this.variant = BadgeVariant.neutral, this.icon});

  final String label;
  final BadgeVariant variant;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (bg, fg, border) = switch (variant) {
      BadgeVariant.success => (c.successSoft, c.success, c.success.withValues(alpha: 0.3)),
      BadgeVariant.danger => (c.dangerSoft, c.danger, c.danger.withValues(alpha: 0.3)),
      BadgeVariant.warning => (c.warningSoft, c.warning, c.warning.withValues(alpha: 0.3)),
      BadgeVariant.info => (c.primarySoft, c.link, c.primary.withValues(alpha: 0.3)),
      BadgeVariant.neutral => (c.surface2, c.foreground, c.border),
      BadgeVariant.admin => (c.adminSoft, c.admin, c.admin.withValues(alpha: 0.3)),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 12, color: fg), const SizedBox(width: 4)],
          Text(
            label,
            style: snapText(size: 12, weight: FontWeight.w500, color: fg),
          ),
        ],
      ),
    );
  }
}

enum AlertVariant { success, danger, warning, info }

/// A persistent inline banner (top of a form or page), not a toast.
class SnapAlert extends StatelessWidget {
  const SnapAlert({super.key, this.variant = AlertVariant.info, this.title, this.description, this.action});

  final AlertVariant variant;
  final String? title;
  final String? description;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final (bg, fg, icon) = switch (variant) {
      AlertVariant.success => (c.successSoft, c.success, LucideIcons.circleCheck),
      AlertVariant.danger => (c.dangerSoft, c.danger, LucideIcons.circleAlert),
      AlertVariant.warning => (c.warningSoft, c.warning, LucideIcons.triangleAlert),
      AlertVariant.info => (c.primarySoft, c.link, LucideIcons.info),
    };
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: (variant == AlertVariant.info ? c.primary : fg).withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Icon(icon, size: 18, color: fg),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (title != null)
                  Text(
                    title!,
                    style: snapText(size: 14, weight: FontWeight.w500, color: fg),
                  ),
                if (description != null) ...[
                  if (title != null) const SizedBox(height: 2),
                  Text(description!, style: snapText(size: 14, color: fg.withValues(alpha: 0.9), height: 1.45)),
                ],
                if (action != null) ...[const SizedBox(height: 10), action!],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class StatCard extends StatelessWidget {
  const StatCard({super.key, required this.label, required this.value, this.sub, this.badge, this.icon});

  final String label;
  final String value;
  final String? sub;
  final Widget? badge;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SnapCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (icon != null) ...[Icon(icon, size: 16, color: c.mutedForeground), const SizedBox(width: 6)],
              Expanded(
                child: Text(label, style: snapText(size: 13, color: c.mutedForeground)),
              ),
              ?badge,
            ],
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: snapText(size: 22, weight: FontWeight.w600, color: c.foreground),
          ),
          if (sub != null) ...[
            const SizedBox(height: 4),
            Text(sub!, style: snapText(size: 12, color: c.mutedForeground)),
          ],
        ],
      ),
    );
  }
}

/// Two stat cards per row on phones.
class StatGrid extends StatelessWidget {
  const StatGrid({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 600 ? 4 : 2;
        final width = (constraints.maxWidth - 12 * (columns - 1)) / columns;
        return Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [for (final child in children) SizedBox(width: width, child: child)],
        );
      },
    );
  }
}

class FieldLabel extends StatelessWidget {
  const FieldLabel(this.text, {super.key});
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 4),
    child: Text(
      text,
      style: snapText(size: 13, weight: FontWeight.w600, color: context.colors.foreground),
    ),
  );
}

/// A labelled text field (the web's Input).
class SnapField extends StatelessWidget {
  const SnapField({
    super.key,
    this.label,
    this.controller,
    this.initialValue,
    this.onChanged,
    this.error,
    this.hint,
    this.helper,
    this.keyboardType,
    this.obscureText = false,
    this.enabled = true,
    this.maxLines = 1,
    this.suffix,
    this.autofillHints,
    this.textInputAction,
    this.monospace = false,
    this.inputFormatters,
    this.onSubmitted,
  });

  final String? label;
  final TextEditingController? controller;
  final String? initialValue;
  final ValueChanged<String>? onChanged;
  final String? error;
  final String? hint;
  final String? helper;
  final TextInputType? keyboardType;
  final bool obscureText;
  final bool enabled;
  final int maxLines;
  final Widget? suffix;
  final Iterable<String>? autofillHints;
  final TextInputAction? textInputAction;
  final bool monospace;
  final List<TextInputFormatter>? inputFormatters;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final style = monospace
        ? TextStyle(fontFamily: 'monospace', fontSize: 14, color: enabled ? c.foreground : c.muted)
        : snapText(size: 14, color: enabled ? c.foreground : c.muted);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (label != null) FieldLabel(label!),
        TextFormField(
          controller: controller,
          initialValue: controller == null ? initialValue : null,
          onChanged: onChanged,
          onFieldSubmitted: onSubmitted,
          keyboardType: keyboardType,
          obscureText: obscureText,
          enabled: enabled,
          maxLines: obscureText ? 1 : maxLines,
          autofillHints: autofillHints,
          textInputAction: textInputAction,
          inputFormatters: inputFormatters,
          style: style,
          decoration: InputDecoration(
            hintText: hint,
            errorText: (error?.isEmpty ?? true) ? null : error,
            suffixIcon: suffix,
            fillColor: enabled ? c.surface : c.surface2,
          ),
        ),
        if (helper != null && (error?.isEmpty ?? true)) ...[
          const SizedBox(height: 4),
          Text(helper!, style: snapText(size: 12, color: c.mutedForeground)),
        ],
      ],
    );
  }
}

/// A password field with a show/hide toggle (the web's PasswordInput).
class PasswordField extends StatefulWidget {
  const PasswordField({
    super.key,
    required this.label,
    required this.controller,
    this.error,
    this.enabled = true,
    this.autofillHints,
    this.onChanged,
    this.onSubmitted,
  });

  final String label;
  final TextEditingController controller;
  final String? error;
  final bool enabled;
  final Iterable<String>? autofillHints;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;

  @override
  State<PasswordField> createState() => _PasswordFieldState();
}

class _PasswordFieldState extends State<PasswordField> {
  bool _visible = false;

  @override
  Widget build(BuildContext context) {
    return SnapField(
      label: widget.label,
      controller: widget.controller,
      error: widget.error,
      enabled: widget.enabled,
      obscureText: !_visible,
      autofillHints: widget.autofillHints,
      onChanged: widget.onChanged,
      onSubmitted: widget.onSubmitted,
      suffix: IconButton(
        tooltip: _visible ? 'Hide password' : 'Show password',
        icon: Icon(_visible ? LucideIcons.eyeOff : LucideIcons.eye, size: 18, color: context.colors.mutedForeground),
        onPressed: () => setState(() => _visible = !_visible),
      ),
    );
  }
}

/// A labelled dropdown (the web's Select). [options] maps value -> label.
class SnapSelect<T> extends StatelessWidget {
  const SnapSelect({
    super.key,
    this.label,
    required this.value,
    required this.options,
    required this.onChanged,
    this.enabled = true,
    this.error,
  });

  final String? label;
  final T value;
  final Map<T, String> options;
  final ValueChanged<T?> onChanged;
  final bool enabled;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (label != null) FieldLabel(label!),
        DropdownButtonFormField<T>(
          initialValue: options.containsKey(value) ? value : null,
          isExpanded: true,
          dropdownColor: c.surface,
          icon: Icon(LucideIcons.chevronDown, size: 16, color: c.mutedForeground),
          style: snapText(size: 14, color: c.foreground),
          decoration: InputDecoration(errorText: error, fillColor: enabled ? c.surface : c.surface2),
          items: [
            for (final e in options.entries)
              DropdownMenuItem<T>(
                value: e.key,
                child: Text(e.value, overflow: TextOverflow.ellipsis),
              ),
          ],
          onChanged: enabled ? onChanged : null,
        ),
      ],
    );
  }
}

/// A two- or three-way segmented control (the widget's cm/ft and fit toggles).
class Segmented<T> extends StatelessWidget {
  const Segmented({
    super.key,
    required this.value,
    required this.options,
    required this.onChanged,
    this.expand = false,
  });

  final T value;
  final Map<T, String> options;
  final ValueChanged<T> onChanged;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    Widget item(T key, String label) {
      final active = key == value;
      final child = Semantics(
        button: true,
        selected: active,
        child: InkWell(
          borderRadius: BorderRadius.circular(5),
          onTap: () => onChanged(key),
          child: Container(
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(color: active ? c.primary : null, borderRadius: BorderRadius.circular(5)),
            child: Text(
              label,
              style: snapText(
                size: 12,
                weight: FontWeight.w500,
                color: active ? c.primaryForeground : c.mutedForeground,
              ),
            ),
          ),
        ),
      );
      return expand ? Expanded(child: child) : child;
    }

    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        border: Border.all(color: c.border),
        borderRadius: BorderRadius.circular(7),
      ),
      child: Row(
        mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
        children: [for (final e in options.entries) item(e.key, e.value)],
      ),
    );
  }
}

/// A centred spinner for a page that is loading.
class PageLoader extends StatelessWidget {
  const PageLoader({super.key});

  @override
  Widget build(BuildContext context) => const Center(
    child: Padding(padding: EdgeInsets.all(40), child: CircularProgressIndicator()),
  );
}

/// A page that failed to load, with a retry.
class LoadError extends StatelessWidget {
  const LoadError({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: SnapAlert(
        variant: AlertVariant.danger,
        title: message,
        action: onRetry == null
            ? null
            : SnapButton(label: 'Try again', size: ButtonSize.sm, variant: ButtonVariant.secondary, onPressed: onRetry),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, this.description, this.action});

  final IconData icon;
  final String title;
  final String? description;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return SnapCard(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 32),
      child: Column(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(color: c.primarySoft, shape: BoxShape.circle),
            child: Icon(icon, color: c.primary, size: 22),
          ),
          const SizedBox(height: 12),
          Text(
            title,
            textAlign: TextAlign.center,
            style: snapText(size: 15, weight: FontWeight.w600, color: c.foreground),
          ),
          if (description != null) ...[
            const SizedBox(height: 4),
            Text(
              description!,
              textAlign: TextAlign.center,
              style: snapText(size: 13, color: c.mutedForeground, height: 1.5),
            ),
          ],
          if (action != null) ...[const SizedBox(height: 16), action!],
        ],
      ),
    );
  }
}

/// A dashboard page's heading: title, description and optional actions.
class PageIntro extends StatelessWidget {
  const PageIntro({super.key, required this.title, this.description, this.actions = const []});

  final String title;
  final String? description;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: snapText(size: 22, weight: FontWeight.w700, color: c.foreground, height: 1.25),
        ),
        if (description != null) ...[
          const SizedBox(height: 4),
          Text(description!, style: snapText(size: 14, color: c.mutedForeground, height: 1.5)),
        ],
        if (actions.isNotEmpty) ...[const SizedBox(height: 12), Wrap(spacing: 8, runSpacing: 8, children: actions)],
      ],
    );
  }
}

/// Asks to confirm a (usually destructive) action. Resolves to true on confirm.
Future<bool> confirmAction(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'Confirm',
  bool danger = true,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        SnapButton(label: 'Cancel', variant: ButtonVariant.secondary, onPressed: () => Navigator.pop(context, false)),
        SnapButton(
          label: confirmLabel,
          variant: danger ? ButtonVariant.danger : ButtonVariant.primary,
          onPressed: () => Navigator.pop(context, true),
        ),
      ],
    ),
  );
  return result ?? false;
}

/// Label/value rows, e.g. account details.
class DetailRow extends StatelessWidget {
  const DetailRow({super.key, required this.label, required this.value, this.valueWidget});

  final String label;
  final String value;
  final Widget? valueWidget;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 2,
            child: Text(label, style: snapText(size: 13, color: c.mutedForeground)),
          ),
          const SizedBox(width: 12),
          Expanded(
            flex: 3,
            child: Align(
              alignment: Alignment.centerRight,
              child:
                  valueWidget ??
                  Text(
                    value,
                    textAlign: TextAlign.right,
                    style: snapText(size: 13, weight: FontWeight.w500, color: c.foreground),
                  ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Standard scrolling body for a dashboard or admin page.
class PageBody extends StatelessWidget {
  const PageBody({super.key, required this.children, this.onRefresh});

  final List<Widget> children;
  final Future<void> Function()? onRefresh;

  @override
  Widget build(BuildContext context) {
    final list = ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: children,
    );
    return onRefresh == null ? list : RefreshIndicator(onRefresh: onRefresh!, child: list);
  }
}

/// A thin rounded progress bar (usage and confidence bars).
class ProgressBar extends StatelessWidget {
  const ProgressBar({super.key, required this.percent, this.color, this.height = 8});

  /// 0-100.
  final num percent;
  final Color? color;
  final double height;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return ClipRRect(
      borderRadius: BorderRadius.circular(99),
      child: LinearProgressIndicator(
        value: (percent.clamp(0, 100)) / 100,
        minHeight: height,
        backgroundColor: c.surface2,
        color: color ?? c.primary,
      ),
    );
  }
}

/// Monospace code with a Copy button, on a dark panel (the web's CodeBlock).
class CodeBlock extends StatelessWidget {
  const CodeBlock(this.code, {super.key, this.label});

  final String code;
  final String? label;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    // The dark theme's surface-2: code reads light-on-dark in both themes.
    const dark = Color(0xFF242424);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (label != null) ...[
          Text(
            label!.toUpperCase(),
            style: snapText(size: 11, weight: FontWeight.w500, color: c.mutedForeground, letterSpacing: 0.8),
          ),
          const SizedBox(height: 6),
        ],
        Container(
          decoration: BoxDecoration(color: dark, borderRadius: BorderRadius.circular(8)),
          child: Stack(
            children: [
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.fromLTRB(14, 40, 14, 14),
                child: SelectableText(
                  code,
                  style: const TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 12.5,
                    height: 1.55,
                    color: Color(0xFFE5E7EB),
                  ),
                ),
              ),
              Positioned(
                top: 4,
                right: 4,
                child: TextButton.icon(
                  style: TextButton.styleFrom(
                    foregroundColor: const Color(0xFFADADAD),
                    visualDensity: VisualDensity.compact,
                  ),
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: code));
                    ScaffoldMessenger.maybeOf(context)
                        ?.showSnackBar(const SnackBar(content: Text('Copied to clipboard')));
                  },
                  icon: const Icon(LucideIcons.copy, size: 13),
                  label: const Text('Copy', style: TextStyle(fontSize: 12)),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

const gap4 = SizedBox(height: 4);
const gap8 = SizedBox(height: 8);
const gap12 = SizedBox(height: 12);
const gap16 = SizedBox(height: 16);
const gap24 = SizedBox(height: 24);
