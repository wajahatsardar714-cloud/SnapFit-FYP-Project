import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Sets <meta name=...> and returns a function that puts the previous value back
// (or removes the tag if this call created it).
function setMetaTag(name, content) {
  let tag = document.head.querySelector(`meta[name="${name}"]`);
  const created = !tag;
  if (created) {
    tag = document.createElement('meta');
    tag.setAttribute('name', name);
    document.head.appendChild(tag);
  }
  const previous = tag.getAttribute('content');
  tag.setAttribute('content', content);
  return () => (created ? tag.remove() : tag.setAttribute('content', previous));
}

// Points <link rel="canonical"> at the page's permalink (no query or hash), so
// search engines index one URL per page; returns an undo like setMetaTag.
function setCanonical(href) {
  const tag = document.createElement('link');
  tag.setAttribute('rel', 'canonical');
  tag.setAttribute('href', href);
  document.head.appendChild(tag);
  return () => tag.remove();
}

/**
 * Sets the document title, meta description (and optionally keywords) and the
 * canonical permalink while the calling page is mounted; the previous values
 * return on unmount.
 *   title        document.title
 *   description  <meta name="description">
 *   keywords     <meta name="keywords">, an array or comma-separated string
 */
export function usePageMeta(title, description, keywords) {
  const keywordList = Array.isArray(keywords) ? keywords.join(', ') : keywords;
  const { pathname } = useLocation();

  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    const restore = [
      description && setMetaTag('description', description),
      keywordList && setMetaTag('keywords', keywordList),
      setCanonical(window.location.origin + pathname),
    ].filter(Boolean);

    return () => {
      document.title = previousTitle;
      restore.forEach((undo) => undo());
    };
  }, [title, description, keywordList, pathname]);
}

/** Component form of usePageMeta, for pages that prefer JSX: <PageMeta title description keywords />. */
function PageMeta({ title, description, keywords }) {
  usePageMeta(title, description, keywords);
  return null;
}

export default PageMeta;
