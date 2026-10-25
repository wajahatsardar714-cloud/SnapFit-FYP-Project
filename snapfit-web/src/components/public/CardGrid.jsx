import { Children } from 'react';

const COLUMN_CLASSES = {
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-2 lg:grid-cols-3',
};

/**
 * Responsive grid for cards (FeatureCard, PricingCard, ...): one column on
 * phones, `columns` from desktop. Each child becomes a list item.
 *   columns    2 | 3 (default 3)
 *   className  extra classes
 */
function CardGrid({ columns = 3, className = '', children }) {
  return (
    <ul role="list" className={`grid grid-cols-1 gap-6 ${COLUMN_CLASSES[columns]} ${className}`}>
      {Children.toArray(children).map((child) => (
        <li key={child.key} className="min-w-0">
          {child}
        </li>
      ))}
    </ul>
  );
}

export default CardGrid;
