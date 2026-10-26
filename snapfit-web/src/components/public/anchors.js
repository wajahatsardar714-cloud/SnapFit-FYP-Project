import { createContext, useContext } from 'react';

// Deep links: every section, step, card, prose subsection and FAQ question
// gets a stable id built from its heading, so a URL like
// /guide#troubleshooting-common-issues-the-api-request-fails opens right there.

// "Can I Use SnapFit on a Custom Website?" -> "can-i-use-snapfit-on-a-custom-website"
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// The enclosing Section's id, so items in different sections never share one.
export const SectionIdContext = createContext(null);

// Returns a function giving the anchor id for an item heading in this section.
export function useAnchorId() {
  const sectionId = useContext(SectionIdContext);
  return (title) => (sectionId ? `${sectionId}-${slugify(title)}` : slugify(title));
}
