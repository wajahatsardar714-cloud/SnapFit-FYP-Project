/// A JSON value as a list, or empty when it isn't one.
List<dynamic> asList(Object? value) => value is List ? value : const [];
