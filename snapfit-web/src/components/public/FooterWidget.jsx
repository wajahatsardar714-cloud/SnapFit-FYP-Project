import SmartLink from './SmartLink';

/**
 * One footer column: a heading and a list of links.
 *   title  column heading
 *   links  [{ label, to, live? }] -- `live: false` shows the label as plain text
 */
function FooterWidget({ title, links = [] }) {
  return (
    <div className="min-w-0">
      <h2 className="type-label uppercase tracking-widest text-inverse">{title}</h2>
      <ul className="mt-4 space-y-3 text-[0.9375rem]">
        {links.map((link) => (
          <li key={link.label} className="break-words">
            <SmartLink
              to={link.to}
              live={link.live}
              className="text-inverse-muted underline-offset-4 hover:text-inverse hover:underline"
              plainClassName="text-inverse-muted"
            >
              {link.label}
            </SmartLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default FooterWidget;
