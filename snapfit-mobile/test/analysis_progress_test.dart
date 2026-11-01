import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapfit_mobile/sizecheck/analysis_progress.dart';
import 'package:snapfit_mobile/theme/app_theme.dart';

Widget _app(Widget child) => MaterialApp(
  theme: buildTheme(Brightness.light),
  home: Scaffold(body: child),
);

void main() {
  testWidgets('moves through the try-on stages and ticks off the steps', (tester) async {
    await tester.pumpWidget(_app(const AnalysisProgress(includesTryOn: true)));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('Measuring you…'), findsOneWidget);
    for (final step in [
      'Finding your pose',
      'Measuring your body',
      'Matching the size chart',
      'Creating your try-on preview',
    ]) {
      expect(find.text(step), findsOneWidget);
    }
    expect(find.text('0 s elapsed'), findsOneWidget);

    for (var i = 0; i < 6; i++) {
      await tester.pump(const Duration(seconds: 1));
    }
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Creating your try-on preview — this can take up to a minute.'), findsOneWidget);
    expect(find.byIcon(Icons.check), findsNothing); // Lucide checks, not Material
    expect(find.text('6 s elapsed'), findsOneWidget);

    // Unmounting stops the timer and the loops.
    await tester.pumpWidget(_app(const SizedBox()));
  });

  testWidgets('leaves the try-on step out when no try-on was asked for', (tester) async {
    await tester.pumpWidget(_app(const AnalysisProgress(includesTryOn: false)));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('Creating your try-on preview'), findsNothing);
    expect(find.text('Matching the size chart'), findsOneWidget);
    await tester.pumpWidget(_app(const SizedBox()));
  });
}
