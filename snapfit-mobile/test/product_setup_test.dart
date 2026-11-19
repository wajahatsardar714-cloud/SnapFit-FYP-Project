import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:snapfit_mobile/core/api_client.dart';
import 'package:snapfit_mobile/dashboard/widget_snippet.dart';
import 'package:snapfit_mobile/widgets/ui.dart';

import 'support/harness.dart';

const _charts = {
  'charts': [
    {'_id': 'c1', 'name': 'Tees', 'category': 'tops', 'isActive': true, 'sizes': []},
    {'_id': 'c2', 'name': 'Kurtas', 'category': 'tops', 'isActive': true, 'sizes': []},
  ],
  'pagination': {'total': 2},
};

const _mappings = {
  'mappings': [
    {
      '_id': 'p1',
      'productId': 'SKU-1',
      'productName': 'Kurta',
      'sizeChartId': {'_id': 'c2', 'name': 'Kurtas', 'category': 'tops'},
      'garmentLength': 'long',
      'sleeveLength': 'long',
      'tryOnStatus': 'image_missing',
    },
    {
      '_id': 'p2',
      'productId': 'SKU-2',
      'productName': 'Old tee',
      'productImage': '/uploads/products/p2.png',
      'sizeChartId': {'_id': 'c1', 'name': 'Tees', 'category': 'tops'},
      'tryOnStatus': 'anchors_missing',
    },
  ],
};

/// The Product Mapping page with two charts and two mappings.
Future<TestApp> _openMappings(WidgetTester tester) async {
  final app = await TestApp.create(account: merchant, location: '/dashboard/product-mapping');
  app.backend
    ..on('GET /charts', _charts)
    ..on('GET /products/mappings', _mappings)
    ..on('POST /products/map', {
      'mapping': {'_id': 'p9'},
    });
  await app.pump(tester);
  return app;
}

Finder get _page => find.byType(Scrollable).first;

TextField _field(WidgetTester tester, int index) => tester.widget<TextField>(find.byType(TextField).at(index));

Finder get _searchField => find.widgetWithText(TextFormField, 'Search by product ID or name');

Future<void> _scrollTo(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(finder, 200, scrollable: _page);
  await tester.pumpAndSettle();
}

Future<void> _choose(WidgetTester tester, String current, String option) async {
  await tester.ensureVisible(find.text(current));
  await tester.pumpAndSettle();
  await tester.tap(find.text(current));
  await tester.pumpAndSettle();
  await tester.tap(find.text(option).last);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('editing a mapping fills the form and saves the same upsert', (tester) async {
    final app = await _openMappings(tester);

    await _scrollTo(tester, find.byTooltip('Edit mapping for SKU-1'));
    await tester.tap(find.byTooltip('Edit mapping for SKU-1'));
    await tester.pumpAndSettle();

    expect(find.text('Edit mapping'), findsOneWidget);
    expect(find.widgetWithText(SnapButton, 'Save changes'), findsOneWidget);
    expect(find.widgetWithText(SnapButton, 'Cancel edit'), findsOneWidget);
    // The form scrolled back up into view, with the product ID read-only.
    expect(find.text('Edit mapping').hitTestable(), findsOneWidget);
    expect(_field(tester, 0).controller!.text, 'SKU-1');
    expect(_field(tester, 0).enabled, isFalse);
    expect(_field(tester, 1).controller!.text, 'Kurta');
    expect(find.text('Kurtas (tops)'), findsOneWidget);
    expect(find.text('Long — ends at mid-thigh'), findsOneWidget);
    expect(find.text('Long — Full sleeves'), findsOneWidget);

    await tester.enterText(find.byType(TextFormField).at(1), 'Blue Kurta');
    await _choose(tester, 'Long — Full sleeves', 'Short — Half sleeves');
    await tester.ensureVisible(find.widgetWithText(SnapButton, 'Save changes'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(SnapButton, 'Save changes'));
    await settle(tester);

    expect(app.backend.sent('POST /products/map').single.data, {
      'productId': 'SKU-1',
      'productName': 'Blue Kurta',
      'sizeChartId': 'c2',
      'garmentLength': 'long',
      'sleeveLength': 'short',
    });
    expect(find.text('Changes saved'), findsOneWidget);
    expect(find.text('Map a product'), findsOneWidget);
    expect(_field(tester, 0).enabled, isTrue);
  });

  testWidgets('Cancel edit leaves edit mode and clears the form', (tester) async {
    final app = await _openMappings(tester);

    await _scrollTo(tester, find.byTooltip('Edit mapping for SKU-2'));
    await tester.tap(find.byTooltip('Edit mapping for SKU-2'));
    await tester.pumpAndSettle();
    expect(find.text('Tees (tops)'), findsOneWidget);

    await tester.ensureVisible(find.widgetWithText(SnapButton, 'Cancel edit'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(SnapButton, 'Cancel edit'));
    await tester.pumpAndSettle();

    expect(find.text('Map a product'), findsOneWidget);
    expect(find.widgetWithText(SnapButton, 'Map'), findsOneWidget);
    expect(_field(tester, 0).controller!.text, isEmpty);
    expect(_field(tester, 0).enabled, isTrue);
    expect(find.text('Select a size chart'), findsOneWidget);
    expect(app.backend.called('POST /products/map'), isFalse);
  });

  testWidgets('the search field filters mappings by product ID or name', (tester) async {
    await _openMappings(tester);
    await _scrollTo(tester, _searchField);

    await tester.enterText(_searchField, 'KURTA');
    await tester.pumpAndSettle();
    expect(find.text('Kurta'), findsOneWidget);
    expect(find.text('Old tee'), findsNothing);

    await tester.enterText(_searchField, 'sku-2');
    await tester.pumpAndSettle();
    expect(find.text('Kurta'), findsNothing);
    expect(find.text('Old tee'), findsOneWidget);

    await tester.enterText(_searchField, 'hoodie');
    await tester.pumpAndSettle();
    expect(find.text('No mappings match "hoodie".'), findsOneWidget);
    expect(find.text('Old tee'), findsNothing);
  });

  testWidgets('a new mapping keeps the chosen chart and lengths for the next one', (tester) async {
    final app = await _openMappings(tester);

    await tester.enterText(find.byType(TextFormField).at(0), 'SKU-3');
    await tester.enterText(find.byType(TextFormField).at(1), 'Linen shirt');
    await _choose(tester, 'Select a size chart', 'Tees (tops)');
    await _choose(tester, 'Regular — ends at the hips', 'Cropped — ends at the waist');
    await _choose(tester, 'Short — Half sleeves', 'None — Sleeveless');
    await tester.ensureVisible(find.widgetWithText(SnapButton, 'Map'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(SnapButton, 'Map'));
    await settle(tester);

    expect(app.backend.sent('POST /products/map').single.data, {
      'productId': 'SKU-3',
      'productName': 'Linen shirt',
      'sizeChartId': 'c1',
      'garmentLength': 'cropped',
      'sleeveLength': 'none',
    });
    expect(find.text('Product mapped'), findsOneWidget);
    expect(_field(tester, 0).controller!.text, isEmpty);
    expect(_field(tester, 1).controller!.text, isEmpty);
    expect(find.text('Choose a flat-lay photo'), findsOneWidget);
    expect(find.text('Tees (tops)'), findsOneWidget);
    expect(find.text('Cropped — ends at the waist'), findsOneWidget);
    expect(find.text('None — Sleeveless'), findsOneWidget);
  });

  testWidgets('a mapping that is not try-on ready offers its next missing step', (tester) async {
    final app = await _openMappings(tester);
    final picks = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/image_picker'),
      (call) async {
        picks.add(call.method);
        return null; // The merchant cancelled the picker.
      },
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        const MethodChannel('plugins.flutter.io/image_picker'),
        null,
      ),
    );

    // SKU-1 has no image yet: one "Add image" button opens the image picker.
    await _scrollTo(tester, find.widgetWithText(SnapButton, 'Add image'));
    expect(find.text('Add image'), findsOneWidget);
    await tester.tap(find.widgetWithText(SnapButton, 'Add image'));
    await settle(tester);
    expect(picks, ['pickImage']);

    // SKU-2 has an image but no anchor points.
    await _scrollTo(tester, find.widgetWithText(SnapButton, 'Set anchor points'));
    expect(find.text('Place points'), findsNothing);
    // The anchor points screen loads the mappings again; answer without the
    // image so it doesn't try to download it.
    app.backend.on('GET /products/mappings', {
      'mappings': [
        {'_id': 'p2', 'productId': 'SKU-2', 'productName': 'Old tee', 'tryOnStatus': 'anchors_missing'},
      ],
    });
    await tester.tap(find.widgetWithText(SnapButton, 'Set anchor points'));
    await settle(tester);
    expect(currentPath(tester), '/dashboard/product-mapping/p2/anchor-points');
  });

  testWidgets('the product ID has help text and warns when it is already mapped', (tester) async {
    await _openMappings(tester);
    expect(find.text('Use the same product ID or SKU as in your store.'), findsOneWidget);

    await tester.enterText(find.byType(TextFormField).at(0), 'SKU-');
    await tester.pumpAndSettle();
    expect(find.text('This product is already mapped — saving will update it.'), findsNothing);

    await tester.enterText(find.byType(TextFormField).at(0), 'SKU-1 ');
    await tester.pumpAndSettle();
    expect(find.text('This product is already mapped — saving will update it.'), findsOneWidget);

    await tester.tap(find.widgetWithText(SnapButton, 'Edit it instead'));
    await tester.pumpAndSettle();
    expect(find.text('Edit mapping'), findsOneWidget);
    expect(_field(tester, 1).controller!.text, 'Kurta');
    expect(find.text('Kurtas (tops)'), findsOneWidget);
    expect(find.text('This product is already mapped — saving will update it.'), findsNothing);
  });

  testWidgets('Copy widget code copies the docs snippet for that product', (tester) async {
    await _openMappings(tester);
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String?;
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));

    await _scrollTo(tester, find.byTooltip('Edit mapping for SKU-2'));
    await tester.ensureVisible(find.text('Copy widget code').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Copy widget code').last);
    await settle(tester);

    final api = Provider.of<ApiClient>(tester.element(find.byType(Navigator).first), listen: false);
    expect(copied, widgetSnippet(apiUrl: api.baseUrl, productId: 'SKU-2'));
    expect(copied, contains('productId="SKU-2"'));
    expect(copied, contains('apiKey="sk_live_..."'));
    expect(find.text('Widget code copied'), findsOneWidget);
  });

  testWidgets('the docs screen shows the same widget snippet', (tester) async {
    final app = await TestApp.create(account: merchant, location: '/dashboard/docs');
    await app.pump(tester);
    final api = Provider.of<ApiClient>(tester.element(find.byType(Navigator).first), listen: false);
    final snippet = find.text(widgetSnippet(apiUrl: api.baseUrl));
    await tester.scrollUntilVisible(snippet, 400, scrollable: find.byType(Scrollable).first);
    expect(snippet, findsOneWidget);
    expect(widgetSnippet(apiUrl: api.baseUrl), contains('productId="SKU-1029"'));
  });

  group('duplicating a size chart', () {
    const fullChart = {
      'chart': {
        '_id': 'c1',
        'name': 'Tees',
        'category': 'tops',
        'gender': 'male',
        'unit': 'cm',
        'isActive': true,
        'sizes': [
          {
            '_id': 's1',
            'label': 'S',
            'measurements': {
              'chest': {'min': 86, 'max': 91, '_id': 'r1'},
            },
          },
          {
            '_id': 's2',
            'label': 'M',
            'measurements': {
              'chest': {'min': 91, 'max': 97},
            },
          },
        ],
      },
    };

    Future<TestApp> openCharts(WidgetTester tester) async {
      final app = await TestApp.create(account: merchant, location: '/dashboard/size-charts');
      app.backend
        ..on('GET /charts', {
          'charts': [fullChart['chart']],
          'pagination': {'page': 1, 'totalPages': 1, 'total': 1},
        })
        ..on('GET /charts/c1', fullChart);
      await app.pump(tester);
      return app;
    }

    testWidgets('creates "<name> (copy)" and opens it in the editor', (tester) async {
      final app = await openCharts(tester);
      app.backend
        ..on('POST /charts', {
          'chart': {'_id': 'c9'},
        }, status: 201)
        ..on('GET /charts/c9', {
          'chart': {...fullChart['chart']!, '_id': 'c9', 'name': 'Tees (copy)'},
        });

      await tester.tap(find.byTooltip('Duplicate Tees'));
      await settle(tester);

      expect(app.backend.sent('POST /charts').single.data, {
        'name': 'Tees (copy)',
        'category': 'tops',
        'gender': 'male',
        'unit': 'cm',
        'sizes': [
          {
            'label': 'S',
            'measurements': {
              'chest': {'min': 86, 'max': 91},
            },
          },
          {
            'label': 'M',
            'measurements': {
              'chest': {'min': 91, 'max': 97},
            },
          },
        ],
      });
      expect(find.text('Size chart duplicated'), findsOneWidget);
      expect(currentPath(tester), '/dashboard/size-charts/c9/edit');
      expect(find.text('Edit Size Chart'), findsOneWidget);
      expect(find.text('Tees (copy)'), findsOneWidget);
    });

    testWidgets("shows the server's plan-limit message", (tester) async {
      final app = await openCharts(tester);
      const limit = 'Your Small plan allows up to 5 size charts. Upgrade to add more.';
      app.backend.on('POST /charts', {'message': limit}, status: 403);

      await tester.tap(find.byTooltip('Duplicate Tees'));
      await settle(tester);

      expect(find.text(limit), findsOneWidget);
      expect(currentPath(tester), '/dashboard/size-charts');
    });
  });
}
