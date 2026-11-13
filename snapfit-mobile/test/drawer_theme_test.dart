import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapfit_mobile/theme/snap_colors.dart';

import 'support/harness.dart';

/// WCAG contrast ratio of two opaque colours.
double contrast(Color a, Color b) {
  final la = a.computeLuminance();
  final lb = b.computeLuminance();
  return (la > lb ? la + 0.05 : lb + 0.05) / (la > lb ? lb + 0.05 : la + 0.05);
}

/// The colour actually painted behind [text] inside the open drawer: the
/// drawer's own surface with every coloured Material between it and the text
/// (a selected item's highlight) laid on top.
Color backgroundBehind(WidgetTester tester, Finder text) {
  final layers = <Color>[];
  tester.element(text).visitAncestorElements((element) {
    final widget = element.widget;
    if (widget is Material && widget.color != null && widget.color!.a > 0) layers.add(widget.color!);
    return widget is! Drawer;
  });
  // Outermost first: the drawer's Material, then the item highlights.
  return layers.reversed.reduce((under, over) => Color.alphaBlend(over, under));
}

Color drawerSurface(WidgetTester tester) =>
    tester.widget<Material>(find.descendant(of: find.byType(Drawer), matching: find.byType(Material)).first).color!;

Future<void> openDrawer(WidgetTester tester) async {
  await tester.tap(find.byTooltip('Open navigation menu'));
  await tester.pumpAndSettle();
  expect(find.byType(Drawer), findsOneWidget);
}

/// Every menu label must read clearly on what is painted behind it.
void expectReadable(WidgetTester tester, List<String> labels, {required Set<String> skip}) {
  for (final label in labels) {
    if (skip.contains(label)) continue;
    final text = find.descendant(of: find.byType(Drawer), matching: find.text(label));
    expect(text, findsOneWidget, reason: label);
    final color = tester.widget<Text>(text).style!.color!;
    final background = backgroundBehind(tester, text);
    expect(background.a, 1.0, reason: '$label sits on an opaque background');
    final ratio = contrast(color, background);
    expect(ratio, greaterThanOrEqualTo(4.5), reason: '"$label" contrast is ${ratio.toStringAsFixed(2)}');
  }
}

const merchantLabels = [
  'Dashboard',
  'Notifications',
  'Subscription',
  'Receipts',
  'API Key',
  'Size Charts',
  'Analytics',
  'Size Check',
  'Docs',
  'Settings',
];
const adminLabels = [
  'Overview',
  'Notifications',
  'Merchants',
  'Announcements',
  'Analytics',
  'Demo Studio',
  'Audit Log',
  'Settings',
];

/// The unread pill on the Notifications item reads clearly on its red fill.
void expectReadablePill(WidgetTester tester, String count) {
  final text = find.descendant(of: find.byType(Drawer), matching: find.text(count));
  expect(text, findsOneWidget, reason: 'the unread pill');
  final color = tester.widget<Text>(text).style!.color!;
  final box = tester.widget<Container>(find.ancestor(of: text, matching: find.byType(Container)).first);
  final fill = (box.decoration! as BoxDecoration).color!;
  expect(fill.a, 1.0);
  final ratio = contrast(color, fill);
  expect(ratio, greaterThanOrEqualTo(4.5), reason: 'pill contrast is ${ratio.toStringAsFixed(2)}');
}

Future<TestApp> merchantApp(bool dark) async {
  final app = await TestApp.create(
    account: merchant,
    location: '/dashboard',
    prefs: {'snapfit-theme': dark ? 'dark' : 'light'},
  );
  app.backend
    ..on('GET /notifications/unread-count', {'unreadCount': 3})
    ..on('GET /analytics/dashboard', {
      'usage': {'requestsUsed': 0, 'requestsLimit': 5000},
      'recommendationsThisMonth': 0,
      'recommendationsLastMonth': 0,
      'averageConfidence': null,
      'totalRecommendations': 0,
    })
    ..on('GET /analytics/usage', {'data': []})
    ..on('GET /analytics/recent', {'recommendations': []})
    ..on('GET /charts', {
      'charts': [],
      'pagination': {'total': 0},
    })
    ..on('GET /products/mappings', {'mappings': []});
  return app;
}

Future<TestApp> adminApp(bool dark) async {
  final app = await TestApp.create(
    account: superAdmin,
    location: '/admin',
    prefs: {'snapfit-theme': dark ? 'dark' : 'light'},
  );
  app.backend.on('GET /notifications/unread-count', {'unreadCount': 4});
  app.backend.on('GET /admin/overview', {
    'totals': {
      'merchants': 3,
      'activeMerchants': 2,
      'suspendedMerchants': 1,
      'recommendations': 40,
      'recommendationsLast30Days': 12,
      'successRate': 0.9,
    },
    'byPlan': {'small': 1, 'medium': 2},
    'daily': [],
    'recentMerchants': [merchant],
  });
  return app;
}

void main() {
  group('dark mode', () {
    testWidgets('the merchant drawer is a solid dark surface with readable items', (tester) async {
      await (await merchantApp(true)).pump(tester);
      await openDrawer(tester);

      expect(Theme.of(tester.element(find.byType(Drawer))).brightness, Brightness.dark);
      expect(drawerSurface(tester), SnapColors.dark.surface);
      // Selected ("Dashboard") and unselected items alike.
      expectReadable(tester, merchantLabels, skip: {});
      expectReadablePill(tester, '3');
    });

    testWidgets('the admin drawer is a solid dark surface with readable items', (tester) async {
      await (await adminApp(true)).pump(tester);
      await openDrawer(tester);

      const c = SnapColors.dark;
      final surface = drawerSurface(tester);
      // The purple admin tint over the dark surface, opaque: the page under
      // the drawer must not show through it.
      expect(surface, c.solid(c.adminSoft));
      expect(surface.a, 1.0);
      expect(surface.computeLuminance(), lessThan(0.05), reason: 'a dark surface');
      expectReadable(tester, adminLabels, skip: {});
      expectReadablePill(tester, '4');
    });
  });

  group('light mode (unchanged)', () {
    testWidgets('the merchant drawer is the white surface with readable items', (tester) async {
      await (await merchantApp(false)).pump(tester);
      await openDrawer(tester);

      expect(drawerSurface(tester), SnapColors.light.surface);
      // The selected item keeps the brand blue on its soft fill, as on the web.
      expectReadable(tester, merchantLabels, skip: {'Dashboard'});
      expectReadablePill(tester, '3');
    });

    testWidgets('the admin drawer keeps its soft purple with readable items', (tester) async {
      await (await adminApp(false)).pump(tester);
      await openDrawer(tester);

      expect(drawerSurface(tester), SnapColors.light.adminSoft);
      expectReadable(tester, adminLabels, skip: {});
      expectReadablePill(tester, '4');
    });
  });
}
