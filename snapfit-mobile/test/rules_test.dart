import 'package:flutter_test/flutter_test.dart';
import 'package:snapfit_mobile/admin/admin_common.dart';
import 'package:snapfit_mobile/core/api_client.dart';
import 'package:snapfit_mobile/core/app_settings.dart';
import 'package:snapfit_mobile/core/auth_state.dart';
import 'package:snapfit_mobile/core/format.dart';
import 'package:snapfit_mobile/core/plans.dart';
import 'package:snapfit_mobile/dashboard/analytics_screen.dart';
import 'package:snapfit_mobile/dashboard/dashboard_home_screen.dart';
import 'package:snapfit_mobile/router.dart';
import 'package:snapfit_mobile/sizecheck/size_check_flow.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  group('plans', () {
    test('formats prices, limits and names like the web app', () {
      expect(formatPlanPrice(29), r'$29/month');
      expect(formatPlanPrice(null), 'Custom');
      expect(formatRequestsLimit(5000), '5,000 requests/month');
      expect(formatRequestsLimit(null), 'Unlimited requests');
      expect(formatChartsLimit(1), '1 size chart');
      expect(formatChartsLimit(null), 'Unlimited size charts');
      expect(formatPlanName('medium'), 'Medium');
      expect(formatPlanName('platinum'), 'Platinum');
      expect(formatPlanName(null), 'None');
    });

    test('is subscribed only while active and before the end date', () {
      final now = DateTime.utc(2026, 10, 31);
      Map<String, dynamic> account(String status, [String? end]) => {
        'subscription': {'status': status, 'endDate': end},
      };
      expect(isSubscribed(account('active'), now), isTrue);
      expect(isSubscribed(account('active', '2026-12-01T00:00:00Z'), now), isTrue);
      expect(isSubscribed(account('active', '2026-10-01T00:00:00Z'), now), isFalse);
      expect(isSubscribed(account('inactive'), now), isFalse);
      expect(isSubscribed(null, now), isFalse);
    });

    test('locks everything but the subscription pages and settings until subscribed', () {
      const unsubscribed = {
        'role': 'merchant',
        'subscription': {'status': 'inactive'},
      };
      expect(isPathLockedFor(unsubscribed, '/dashboard/api-key'), isTrue);
      expect(isPathLockedFor(unsubscribed, '/dashboard'), isTrue);
      expect(isPathLockedFor(unsubscribed, '/dashboard/subscription/plans'), isFalse);
      expect(isPathLockedFor(unsubscribed, '/dashboard/settings'), isFalse);
      expect(isPathLockedFor({'role': 'superadmin'}, '/dashboard/api-key'), isFalse);
    });
  });

  group('router guard', () {
    late AuthState auth;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      auth = AuthState(ApiClient(await AppSettings.load()), store: MemoryTokenStore());
    });

    test('sends a signed-out visitor from the dashboard and admin to sign in', () {
      expect(guard(auth, Uri.parse('/dashboard')), '/signin');
      expect(guard(auth, Uri.parse('/admin/merchants')), '/signin');
      expect(guard(auth, Uri.parse('/pricing')), isNull);
    });

    test('keeps each role in its own area', () {
      auth.merchant = {
        'role': 'merchant',
        'subscription': {'status': 'active'},
      };
      expect(guard(auth, Uri.parse('/admin')), '/dashboard');
      expect(guard(auth, Uri.parse('/dashboard/analytics')), isNull);
      expect(guard(auth, Uri.parse('/signin')), '/dashboard');

      auth.merchant = {'role': 'superadmin'};
      expect(guard(auth, Uri.parse('/dashboard')), '/admin');
      expect(guard(auth, Uri.parse('/admin/audit-log')), isNull);
    });

    test('sends an unsubscribed merchant to plan selection', () {
      auth.merchant = {
        'role': 'merchant',
        'subscription': {'status': 'inactive'},
      };
      expect(guard(auth, Uri.parse('/dashboard/size-charts')), planSelectionPath);
      expect(guard(auth, Uri.parse('/dashboard/subscription')), isNull);
    });
  });

  group('size check', () {
    test('converts feet and inches to cm', () {
      expect(heightToCm(metric: true, cm: '178', feet: '', inches: ''), 178);
      expect(heightToCm(metric: false, cm: '', feet: '5', inches: '10'), 177.8);
      expect(heightToCm(metric: false, cm: '', feet: '', inches: ''), isNull);
    });

    test('accepts heights from 100 to 230 cm', () {
      expect(heightError(null), 'Please enter your height.');
      expect(heightError(99), contains('between 100 and 230 cm'));
      expect(heightError(231), contains('between 100 and 230 cm'));
      expect(heightError(170), isEmpty);
    });
  });

  test('sorts sizes in wearing order, then the rest alphabetically', () {
    final sizes = ['XL', '42', 'S', 'M', 'XS', '38']..sort(compareSizes);
    expect(sizes, ['XS', 'S', 'M', 'XL', '38', '42']);
  });

  test('month trend has no base when last month was empty', () {
    expect(monthTrend(0, 0), isNull);
    expect(monthTrend(5, 0), (pct: 100.0, up: true));
    expect(monthTrend(15, 10), (pct: 50.0, up: true));
    expect(monthTrend(5, 10), (pct: 50.0, up: false));
  });

  test('percentages print like the web app', () {
    expect(formatRatio(0.9), '90%');
    expect(formatRatio(0.8735), '87.4%');
    expect(formatDecimal(50.0), '50');
    expect(formatDecimal(12.5), '12.5');
  });

  test('audit actions read as words', () {
    expect(formatAction('merchant.suspend'), 'Merchant suspend');
    expect(formatAction('apiKeyRegenerated'), 'Api key regenerated');
    expect(formatAction('update_subscription'), 'Update subscription');
    expect(formatUsage({'requestsUsed': 1240, 'requestsLimit': null}), '1,240 / Unlimited');
  });
}
