import { Paragraphs } from '../../components/public/RichText';

/**
 * What each sign-up field is for, on the register page under its buttons
 * (see content/auth.js register.fieldHelp).
 *   lead   sentence introducing the list
 *   items  [{ term, text }] -- one per field
 *   notes  paragraph texts after the list (see RichText)
 */
function RegisterFieldHelp({ lead, items, notes }) {
  return (
    <div className="type-body w-full min-w-0 break-words text-body">
      <p>{lead}</p>
      <ul className="mt-4 space-y-3 border-l-2 border-primary/40 pl-4">
        {items.map(({ term, text }) => (
          <li key={term}>
            <span className="font-semibold text-foreground">{term}:</span> {text}
          </li>
        ))}
      </ul>
      <div className="mt-5 space-y-4">
        <Paragraphs items={notes} />
      </div>
    </div>
  );
}

export default RegisterFieldHelp;
