import SmartLink from './SmartLink';

const LINK_CLASSES = 'font-semibold text-link underline underline-offset-2 hover:text-primary-hover';

/**
 * Renders one content paragraph's text.
 *   text  a string, or an array of strings and inline links
 *         ({ text, to, live? } -- see SmartLink) for a sentence with a link in it
 */
export function RichText({ text }) {
  if (!Array.isArray(text)) return text;
  return text.map((part, i) =>
    typeof part === 'string' ? (
      part
    ) : (
      <SmartLink key={i} to={part.to} live={part.live} className={LINK_CLASSES}>
        {part.text}
      </SmartLink>
    )
  );
}

/**
 * Content paragraphs as <p> elements.
 *   items      array of paragraph texts (see RichText)
 *   className  classes for each <p>
 */
export function Paragraphs({ items = [], className = '' }) {
  return items.map((text, i) => (
    <p key={i} className={className}>
      <RichText text={text} />
    </p>
  ));
}
