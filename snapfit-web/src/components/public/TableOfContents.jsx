import { ChevronDown } from 'lucide-react';
import { useLocation } from 'react-router-dom';

/**
 * Collapsible on-page contents (native <details>, collapsed by default). The
 * link for the section in the URL hash is marked current.
 *   title  summary text, e.g. 'Table of contents'
 *   items  [{ id, label }] -- links to the elements with those ids
 */
function TableOfContents({ title, items = [] }) {
  const { hash } = useLocation();
  return (
    <nav aria-label={title}>
      <details className="group rounded-xl border border-border bg-surface shadow-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-5 py-4 sm:px-6 [&::-webkit-details-marker]:hidden">
          <span className="type-h4 text-deep-blue">{title}</span>
          <ChevronDown
            aria-hidden="true"
            focusable="false"
            size={20}
            className="shrink-0 text-link motion-safe:transition-transform motion-safe:duration-200 group-open:rotate-180"
          />
        </summary>
        <ol className="space-y-1 border-t border-border px-3 py-3 sm:px-4">
          {items.map((item) => {
            const current = hash === `#${item.id}`;
            return (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  aria-current={current ? 'location' : undefined}
                  className={`block break-words rounded-lg px-3 py-2 text-[0.9375rem] font-medium transition-colors duration-150 hover:bg-primary-soft hover:text-link ${
                    current ? 'bg-primary-soft text-link' : 'text-body'
                  }`}
                >
                  {item.label}
                </a>
              </li>
            );
          })}
        </ol>
      </details>
    </nav>
  );
}

export default TableOfContents;
