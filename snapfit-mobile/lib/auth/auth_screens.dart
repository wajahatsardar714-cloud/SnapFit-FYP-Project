import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api_client.dart';
import '../core/app_settings.dart';
import '../core/auth_state.dart';
import '../core/plans.dart';
import '../widgets/logo.dart';
import '../theme/app_theme.dart';
import '../theme/snap_colors.dart';
import '../widgets/ui.dart';

/// Where a merchant asks for a password reset (the website's contact address).
const supportEmail = 'wajahatsardar714@gmail.com';

/// A bare form screen (the web's AuthFormScreen): the logo, then a card with
/// the heading and the form. Always light. The app opens here when signed out.
class AuthFormScreen extends StatelessWidget {
  const AuthFormScreen({super.key, required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: buildTheme(Brightness.light),
      child: Builder(
        builder: (context) {
          final c = context.colors;
          return Scaffold(
            backgroundColor: c.background,
            body: SafeArea(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 32, 16, 32),
                child: Column(
                  children: [
                    const Logo(),
                    const SizedBox(height: 28),
                    Container(
                      constraints: const BoxConstraints(maxWidth: 520),
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        color: c.surface,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: c.border),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Semantics(header: true, child: Text(title, style: TypeScale.h3(c.foreground))),
                          const SizedBox(height: 24),
                          child,
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    const _ServerSettingsLink(),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Mobile only: where the app finds the backend (the PC's address on Wi-Fi).
class _ServerSettingsLink extends StatelessWidget {
  const _ServerSettingsLink();

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return TextButton.icon(
      onPressed: () => showServerSettings(context),
      icon: Icon(LucideIcons.server, size: 16, color: c.mutedForeground),
      label: Text(
        'Server settings',
        style: snapText(size: 13, weight: FontWeight.w600, color: c.mutedForeground),
      ),
    );
  }
}

Future<void> showServerSettings(BuildContext context) {
  final settings = context.read<AppSettings>();
  final controller = TextEditingController(text: settings.apiUrl);
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (context) {
      final c = context.colors;
      return Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Server settings', style: TypeScale.h4(c.foreground)),
            const SizedBox(height: 6),
            Text(
              "The SnapFit backend's API address. On a real phone use your PC's Wi-Fi address, "
              'e.g. http://192.168.1.10:5000/api. The Android emulator uses http://10.0.2.2:5000/api.',
              style: snapText(size: 13, color: c.mutedForeground, height: 1.5),
            ),
            const SizedBox(height: 16),
            SnapField(label: 'API address', controller: controller, keyboardType: TextInputType.url, monospace: true),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: SnapButton(
                    label: 'Reset',
                    variant: ButtonVariant.secondary,
                    expand: true,
                    onPressed: () => controller.text = defaultApiUrl,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: SnapButton(
                    label: 'Save',
                    expand: true,
                    onPressed: () async {
                      await settings.setApiUrl(controller.text);
                      if (context.mounted) Navigator.pop(context);
                    },
                  ),
                ),
              ],
            ),
          ],
        ),
      );
    },
  );
}

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _remember = true;
  bool _submitting = false;
  bool _showPasswordHelp = false;
  String _formError = '';

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) {
      setState(() => _formError = 'Enter your email and password.');
      return;
    }
    setState(() {
      _formError = '';
      _submitting = true;
    });
    try {
      final account = await context.read<AuthState>().login(_email.text.trim(), _password.text, remember: _remember);
      if (mounted) context.go(homePathFor(account));
    } catch (e) {
      if (mounted) setState(() => _formError = errorMessage(e, 'Invalid email or password.'));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthFormScreen(
      title: 'Log In',
      child: Builder(
        builder: (context) {
          final c = context.colors;
          return AutofillGroup(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_formError.isNotEmpty) ...[SnapAlert(variant: AlertVariant.danger, title: _formError), gap24],
                SnapField(
                  label: 'Business email',
                  controller: _email,
                  enabled: !_submitting,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  textInputAction: TextInputAction.next,
                ),
                gap16,
                PasswordField(
                  label: 'Password',
                  controller: _password,
                  enabled: !_submitting,
                  autofillHints: const [AutofillHints.password],
                  onSubmitted: (_) => _submit(),
                ),
                gap12,
                Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    InkWell(
                      onTap: _submitting ? null : () => setState(() => _remember = !_remember),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Checkbox(
                            value: _remember,
                            onChanged: _submitting ? null : (v) => setState(() => _remember = v ?? true),
                          ),
                          Text('Remember me', style: snapText(size: 14, color: c.foreground)),
                        ],
                      ),
                    ),
                    TextButton(
                      onPressed: () => setState(() => _showPasswordHelp = !_showPasswordHelp),
                      child: Text(
                        'Forgot password?',
                        style: snapText(size: 14, weight: FontWeight.w600, color: c.link),
                      ),
                    ),
                  ],
                ),
                if (_showPasswordHelp) ...[
                  gap8,
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      color: c.primarySoft,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: c.primary.withValues(alpha: 0.3)),
                    ),
                    child: const _PasswordHelp(),
                  ),
                ],
                gap16,
                SnapButton(
                  label: _submitting ? 'Logging in...' : 'Log In',
                  size: ButtonSize.lg,
                  loading: _submitting,
                  expand: true,
                  onPressed: _submit,
                ),
                gap16,
                Center(
                  child: TextButton(
                    onPressed: () => context.go('/signup'),
                    child: Text(
                      "Don't have an account? Sign Up",
                      style: snapText(size: 14, weight: FontWeight.w600, color: c.link),
                    ),
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

const _businessTypes = {
  '': 'Select a business type',
  'clothing': 'Clothing',
  'footwear': 'Footwear',
  'accessories': 'Accessories',
};

/// Client-side strength hints only; the backend enforces the 8-character minimum.
final _passwordRules = <(String, bool Function(String))>[
  ('At least 8 characters', (pw) => pw.length >= 8),
  ('At least 1 number', (pw) => RegExp(r'\d').hasMatch(pw)),
  ('At least 1 uppercase letter', (pw) => RegExp('[A-Z]').hasMatch(pw)),
];

class SignUpScreen extends StatefulWidget {
  const SignUpScreen({super.key, this.plan});

  /// A plan preselected by a pricing link (?plan=).
  final String? plan;

  @override
  State<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends State<SignUpScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _businessName = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  final _phone = TextEditingController();
  String _businessType = '';
  late String _plan = isPlanId(widget.plan?.toLowerCase()) ? widget.plan!.toLowerCase() : '';
  Map<String, String> _errors = {};
  bool _submitting = false;
  String _formError = '';

  @override
  void dispose() {
    for (final c in [_name, _email, _businessName, _password, _confirm, _phone]) {
      c.dispose();
    }
    super.dispose();
  }

  Map<String, String> _validate() {
    final errors = <String, String>{};
    if (_name.text.trim().isEmpty) errors['name'] = 'Name is required';
    if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(_email.text.trim())) errors['email'] = 'Enter a valid email';
    if (_password.text.length < 8) errors['password'] = 'Password must be at least 8 characters';
    if (_confirm.text != _password.text) errors['confirmPassword'] = 'Passwords do not match';
    if (_businessName.text.trim().isEmpty) errors['businessName'] = 'Store name is required';
    return errors;
  }

  Future<void> _submit() async {
    final errors = _validate();
    setState(() {
      _formError = '';
      _errors = errors;
    });
    if (errors.isNotEmpty) return;
    setState(() => _submitting = true);
    try {
      await context.read<AuthState>().register({
        'name': _name.text.trim(),
        'email': _email.text.trim(),
        'password': _password.text,
        'businessName': _businessName.text.trim(),
        if (_phone.text.trim().isNotEmpty) 'phone': _phone.text.trim(),
        if (_businessType.isNotEmpty) 'businessType': _businessType,
      });
      // The plan is chosen on plan selection after sign-up, not sent with it.
      if (mounted) context.go(_plan.isEmpty ? '/dashboard' : '$planSelectionPath?plan=$_plan');
    } catch (e) {
      if (mounted) setState(() => _formError = errorMessage(e, 'Registration failed. Please try again.'));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _clearError(String field) {
    if (_errors.containsKey(field)) setState(() => _errors = {..._errors}..remove(field));
  }

  @override
  Widget build(BuildContext context) {
    return AuthFormScreen(
      title: 'Sign Up',
      child: Builder(
        builder: (context) {
          final c = context.colors;
          return AutofillGroup(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_formError.isNotEmpty) ...[SnapAlert(variant: AlertVariant.danger, title: _formError), gap24],
                SnapField(
                  label: 'Full name',
                  controller: _name,
                  error: _errors['name'],
                  enabled: !_submitting,
                  autofillHints: const [AutofillHints.name],
                  onChanged: (_) => _clearError('name'),
                ),
                gap16,
                SnapField(
                  label: 'Business email',
                  controller: _email,
                  error: _errors['email'],
                  enabled: !_submitting,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  onChanged: (_) => _clearError('email'),
                ),
                gap16,
                SnapField(
                  label: 'Store name',
                  controller: _businessName,
                  error: _errors['businessName'],
                  enabled: !_submitting,
                  autofillHints: const [AutofillHints.organizationName],
                  onChanged: (_) => _clearError('businessName'),
                ),
                gap16,
                PasswordField(
                  label: 'Password',
                  controller: _password,
                  error: _errors['password'],
                  enabled: !_submitting,
                  autofillHints: const [AutofillHints.newPassword],
                  onChanged: (_) {
                    _clearError('password');
                    setState(() {});
                  },
                ),
                gap8,
                for (final (label, test) in _passwordRules)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Row(
                      children: [
                        Icon(LucideIcons.check, size: 12, color: test(_password.text) ? c.success : c.muted),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            label,
                            style: snapText(size: 12, color: test(_password.text) ? c.success : c.mutedForeground),
                          ),
                        ),
                      ],
                    ),
                  ),
                gap12,
                SnapField(
                  label: 'Confirm password',
                  controller: _confirm,
                  error: _errors['confirmPassword'],
                  obscureText: true,
                  enabled: !_submitting,
                  onChanged: (_) => _clearError('confirmPassword'),
                ),
                gap16,
                SnapField(
                  label: 'Phone (optional)',
                  controller: _phone,
                  enabled: !_submitting,
                  keyboardType: TextInputType.phone,
                  autofillHints: const [AutofillHints.telephoneNumber],
                ),
                gap16,
                SnapSelect<String>(
                  label: 'Business type',
                  value: _businessType,
                  options: _businessTypes,
                  enabled: !_submitting,
                  onChanged: (v) => setState(() => _businessType = v ?? ''),
                ),
                gap16,
                SnapSelect<String>(
                  label: 'Subscription plan',
                  value: _plan,
                  options: {'': 'Choose later', for (final p in plans) p: formatPlanName(p)},
                  enabled: !_submitting,
                  onChanged: (v) => setState(() => _plan = v ?? ''),
                ),
                gap24,
                SnapButton(
                  label: _submitting ? 'Creating account...' : 'Create account',
                  size: ButtonSize.lg,
                  loading: _submitting,
                  expand: true,
                  onPressed: _submit,
                ),
                gap16,
                Center(
                  child: TextButton(
                    onPressed: () => context.go('/signin'),
                    child: Text(
                      'Already have an account? Log In',
                      style: snapText(size: 14, weight: FontWeight.w600, color: c.link),
                    ),
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

/// "Forgot password?": the same help as the website, with a tappable address.
class _PasswordHelp extends StatefulWidget {
  const _PasswordHelp();

  @override
  State<_PasswordHelp> createState() => _PasswordHelpState();
}

class _PasswordHelpState extends State<_PasswordHelp> {
  final _tap = TapGestureRecognizer()..onTap = () => launchUrl(Uri.parse('mailto:$supportEmail'));

  @override
  void dispose() {
    _tap.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    return Text.rich(
      TextSpan(
        style: snapText(size: 14, color: c.body, height: 1.5),
        children: [
          const TextSpan(text: 'Contact '),
          TextSpan(
            text: supportEmail,
            recognizer: _tap,
            style: snapText(size: 14, weight: FontWeight.w600, color: c.link, decoration: TextDecoration.underline),
          ),
          const TextSpan(text: " from your account email and we'll help you reset your password."),
        ],
      ),
    );
  }
}
