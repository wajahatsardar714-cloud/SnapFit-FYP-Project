// Matcher for getByText & co: the paragraph whose whole text is `sentence`,
// even when part of it is an inline link (which splits the text nodes).
export function paragraph(sentence) {
  return (_content, element) => element?.tagName === 'P' && element.textContent === sentence;
}
