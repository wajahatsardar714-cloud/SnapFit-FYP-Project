// Internal-link helper for content files. Turns one phrase that already appears
// in a paragraph into an inline link (a RichText paragraph: strings and
// { text, to } parts), so the wording stays exactly as written. Throws when the
// phrase isn't in the paragraph, so an edit to either can't silently drop the
// link or change the text.
export function withLink(paragraph, phrase, to) {
  const at = paragraph.indexOf(phrase);
  if (at === -1) throw new Error(`withLink: "${phrase}" is not in the paragraph`);
  return [paragraph.slice(0, at), { text: phrase, to }, paragraph.slice(at + phrase.length)].filter(
    (part) => part !== ''
  );
}
