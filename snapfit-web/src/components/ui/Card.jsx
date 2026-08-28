import { Children, isValidElement } from 'react';

const PADDING_CLASSES = { sm: 'p-4', md: 'p-6', lg: 'p-8' };

function usesSectionChildren(children) {
  return Children.toArray(children).some(
    (child) => isValidElement(child) && [CardHeader, CardBody, CardFooter].includes(child.type)
  );
}

// Two usage shapes:
//   <Card padding="md">raw content</Card>                     -- padding on the root
//   <Card><Card.Header/><Card.Body/><Card.Footer/></Card>     -- each section brings its
//                                                                  own padding instead
// Card detects the second shape (a direct Header/Body/Footer child) and skips its
// own padding so the sections' border-t/border-b dividers reach the card's edges.
function Card({ padding = 'md', className = '', children, ...rest }) {
  const rootPadding = usesSectionChildren(children) ? '' : PADDING_CLASSES[padding];

  return (
    <div
      className={`overflow-hidden rounded-xl border border-surface-border bg-surface-card shadow-card ${rootPadding} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

function CardHeader({ padding = 'md', className = '', children, ...rest }) {
  return (
    <div className={`border-b border-surface-border ${PADDING_CLASSES[padding]} ${className}`} {...rest}>
      {children}
    </div>
  );
}

function CardBody({ padding = 'md', className = '', children, ...rest }) {
  return (
    <div className={`${PADDING_CLASSES[padding]} ${className}`} {...rest}>
      {children}
    </div>
  );
}

function CardFooter({ padding = 'md', className = '', children, ...rest }) {
  return (
    <div className={`border-t border-surface-border ${PADDING_CLASSES[padding]} ${className}`} {...rest}>
      {children}
    </div>
  );
}

Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;

export default Card;
