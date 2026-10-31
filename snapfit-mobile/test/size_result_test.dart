import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:snapfit_mobile/sizecheck/size_result.dart';
import 'package:snapfit_mobile/theme/app_theme.dart';

Map<String, dynamic> _range(String name, num userValue, num min, num max, String status) => {
  'name': name,
  'userValue': userValue,
  'min': min,
  'max': max,
  'status': status,
};

final _result = <String, dynamic>{
  'size': 'M',
  'confidence': 0.82,
  'alternativeSize': 'L',
  'bodyType': 'rectangle',
  'framesUsed': 5,
  'measurements': {
    'chest': {'value': 96, 'unit': 'cm', 'estimated': true},
    'shoulderWidth': {'value': 44, 'unit': 'cm'},
  },
  'sizeComparison': [
    {
      'label': 'S',
      'perMeasurement': [_range('chest', 96, 86, 94, 'above'), _range('shoulderWidth', 44, 40, 43, 'above')],
    },
    {
      'label': 'M',
      'perMeasurement': [_range('chest', 96, 94, 102, 'within'), _range('shoulderWidth', 44, 43, 46, 'within')],
    },
    {
      'label': 'L',
      'perMeasurement': [_range('chest', 96, 102, 110, 'below'), _range('shoulderWidth', 44, 46, 49, 'below')],
    },
    {'label': 'XL', 'perMeasurement': []},
  ],
  'fitNotes': ['Chest is near the top of M; consider L for a looser fit.'],
  'photoTips': [
    {'id': 'dim_light', 'message': 'Your photo is quite dark.'},
  ],
  'warnings': [
    {'id': 'possible_child', 'message': 'This looks like a child.'},
  ],
};

Future<void> _pump(WidgetTester tester, Widget child) => tester.pumpWidget(
  MaterialApp(
    theme: buildTheme(Brightness.light),
    home: Scaffold(body: SingleChildScrollView(child: child)),
  ),
);

void main() {
  testWidgets('shows the size, confidence, neighbouring sizes, notes, tips and warnings', (tester) async {
    await _pump(tester, SizeResultView(result: _result));

    expect(find.text('M'), findsNWidgets(2)); // the size circle and its column
    expect(find.text('82%'), findsOneWidget);
    expect(find.text('Measured from 5 camera frames'), findsOneWidget);
    expect(find.text('BODY TYPE: RECTANGLE'), findsOneWidget);
    // S, M and L around the recommendation; XL is not a neighbour.
    expect(find.text('S'), findsOneWidget);
    expect(find.text('L'), findsWidgets);
    expect(find.text('XL'), findsNothing);
    expect(find.text('94–102'), findsOneWidget);
    expect(find.textContaining('estimated from your photo'), findsOneWidget);
    expect(find.text('Chest is near the top of M; consider L for a looser fit.'), findsOneWidget);
    expect(find.text('This looks like a child.'), findsOneWidget);
    expect(find.text('•  Your photo is quite dark.'), findsOneWidget);
  });

  testWidgets('the try-on preview explains a failed render and hides an unavailable one', (tester) async {
    await _pump(
      tester,
      const TryOnPreview(tryOn: {'status': 'failed', 'message': 'The GPU is busy.'}, originalPath: null, size: 'M'),
    );
    expect(
      find.textContaining("We couldn't create a preview on your photo this time. The GPU is busy."),
      findsOneWidget,
    );

    await _pump(tester, const TryOnPreview(tryOn: {'status': 'unavailable'}, originalPath: null, size: 'M'));
    expect(find.text('See it on you'), findsNothing);
  });

  test('decodes the try-on image from a data URL', () {
    expect(tryOnImage('data:image/png;base64,iVBORw0KGgo='), isA<MemoryImage>());
    expect(tryOnImage('https://example.test/tryon.jpg'), isA<NetworkImage>());
    expect(tryOnImage(null), isNull);
  });
}
