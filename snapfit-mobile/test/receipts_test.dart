import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapfit_mobile/receipts/receipt_screens.dart';
import 'package:snapfit_mobile/widgets/ui.dart';

import 'support/harness.dart';

Map<String, dynamic> receiptFixture(String id, String number, {String status = 'issued', num total = 99}) => {
  '_id': id,
  'number': number,
  'status': status,
  'reason': 'plan_selected',
  'issuedAt': '2026-11-13T10:00:00.000Z',
  'merchant': {'businessName': 'Shop', 'name': 'Sam Shop', 'email': 'shop@test.com', 'phone': '0300 1234567'},
  'plan': 'medium',
  'planName': 'Medium',
  'periodStart': '2026-11-13T10:00:00.000Z',
  'periodEnd': '2026-12-13T10:00:00.000Z',
  'currency': 'USD',
  'amount': total,
  'taxRate': 0,
  'taxAmount': 0,
  'total': total,
  'priceNote': null,
  'paymentMethod': 'Demo (no charge)',
  'voidedAt': status == 'void' ? '2026-11-14T10:00:00.000Z' : null,
};

void main() {
  late List<(List<int>, String)> saved;
  setUp(() {
    saved = [];
    receiptPdfSaver = (bytes, name) async => saved.add((bytes, name));
  });
  tearDown(() => receiptPdfSaver = saveAndShareReceiptPdf);

  testWidgets('lists receipts with totals and status, and opens one', (tester) async {
    final app = await TestApp.create(account: merchant, location: '/dashboard/receipts');
    app.backend
      ..on('GET /receipts', {
        'receipts': [
          receiptFixture('r2', 'SF-2026-000013', total: 29),
          receiptFixture('r1', 'SF-2026-000012', status: 'void'),
        ],
      })
      ..on('GET /receipts/r2', {'receipt': receiptFixture('r2', 'SF-2026-000013', total: 29)});
    await app.pump(tester);

    expect(find.text('SF-2026-000013'), findsOneWidget);
    expect(find.text('SF-2026-000012'), findsOneWidget);
    expect(find.text('\$29.00'), findsOneWidget);
    expect(find.text('Issued'), findsOneWidget);
    expect(find.text('Void'), findsOneWidget);

    await tester.tap(find.text('SF-2026-000013'));
    await tester.pumpAndSettle();
    expect(currentPath(tester), '/dashboard/receipts/r2');
    expect(find.text('BILLED TO'), findsOneWidget);
    expect(find.text('SnapFit Medium plan'), findsOneWidget);
    expect(find.text('Demo (no charge)'), findsOneWidget);
    expect(find.text('VOID'), findsNothing);
  });

  testWidgets('a receipt shows the billing details, totals and downloads its PDF', (tester) async {
    final app = await TestApp.create(account: merchant, location: '/dashboard/receipts/r1');
    app.backend
      ..on('GET /receipts/r1', {'receipt': receiptFixture('r1', 'SF-2026-000012')})
      ..on('GET /receipts/r1/pdf', 'PDF');
    await app.pump(tester);

    expect(find.text('SF-2026-000012'), findsOneWidget);
    expect(find.text('Shop'), findsOneWidget);
    expect(find.text('0300 1234567'), findsOneWidget);
    expect(find.text('Total'), findsOneWidget);
    expect(find.text('\$99.00'), findsNWidgets(3)); // line, subtotal, total
    expect(find.text('Tax (0%)'), findsOneWidget);
    expect(find.text('Paid'), findsNothing);

    await tester.ensureVisible(find.widgetWithText(SnapButton, 'Download PDF'));
    await tester.tap(find.widgetWithText(SnapButton, 'Download PDF'));
    await settle(tester);

    expect(app.backend.called('GET /receipts/r1/pdf'), isTrue);
    expect(saved, hasLength(1));
    expect(saved.single.$2, 'SnapFit-receipt-SF-2026-000012.pdf');
    expect(saved.single.$1, isNotEmpty);
  });

  testWidgets('a void receipt carries the VOID banner and stamp', (tester) async {
    final app = await TestApp.create(account: merchant, location: '/dashboard/receipts/r1');
    app.backend.on('GET /receipts/r1', {'receipt': receiptFixture('r1', 'SF-2026-000012', status: 'void')});
    await app.pump(tester);

    expect(find.text('VOID'), findsNWidgets(2));
    expect(find.textContaining('This receipt was voided on November 14, 2026'), findsOneWidget);
  });

  testWidgets('an unsubscribed merchant can still read receipts', (tester) async {
    final app = await TestApp.create(account: unsubscribedMerchant, location: '/dashboard/receipts');
    app.backend.on('GET /receipts', {'receipts': []});
    await app.pump(tester);

    expect(currentPath(tester), '/dashboard/receipts');
    expect(find.text('No receipts yet'), findsOneWidget);
  });

  testWidgets('the admin sees a merchant\'s receipts, downloads and voids one', (tester) async {
    final app = await TestApp.create(account: superAdmin, location: '/admin/merchants/m1');
    app.backend
      ..on('GET /admin/merchants/m1', {
        // A capped plan: the test font is wide, and "0 / Unlimited" beside
        // "Requests used" would not fit the usage row.
        'merchant': {
          ...merchant,
          'subscription': {...(merchant['subscription']! as Map), 'requestsUsed': 5, 'requestsLimit': 500},
        },
        'apiKeyPreview': null,
        'sizeCharts': [],
        'products': [],
        'recentRecommendations': [],
      })
      ..onRequest('GET /admin/receipts', (r) {
        expect(r.queryParameters['merchantId'], 'm1');
        return FakeResponse({
          'receipts': [receiptFixture('r1', 'SF-2026-000012')],
        });
      })
      ..on('GET /admin/receipts/r1/pdf', 'PDF')
      ..on('POST /admin/receipts/r1/void', {'receipt': receiptFixture('r1', 'SF-2026-000012', status: 'void')});
    await app.pump(tester);

    final number = find.text('SF-2026-000012');
    await tester.scrollUntilVisible(number, 300, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    expect(find.text('Receipts (1)', findRichText: true), findsOneWidget);

    await tester.ensureVisible(find.widgetWithText(SnapButton, 'PDF'));
    await tester.tap(find.widgetWithText(SnapButton, 'PDF'));
    await settle(tester);
    expect(app.backend.called('GET /admin/receipts/r1/pdf'), isTrue);
    expect(saved.single.$2, 'SnapFit-receipt-SF-2026-000012.pdf');

    await tester.tap(find.widgetWithText(SnapButton, 'Void'));
    await tester.pumpAndSettle();
    expect(find.text('Void receipt SF-2026-000012?'), findsOneWidget);
    await tester.tap(find.widgetWithText(SnapButton, 'Void receipt'));
    await settle(tester);

    expect(app.backend.called('POST /admin/receipts/r1/void'), isTrue);
    expect(find.widgetWithText(SnapButton, 'Void'), findsNothing);
    expect(find.text('Void'), findsOneWidget); // the badge
  });
}
