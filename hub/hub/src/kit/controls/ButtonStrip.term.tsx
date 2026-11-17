// A secondary strip in the terminal: the quiet header actions in one row, a faint │ between neighbours (the web's one
// shared line), each button keeping its own focus stop and press. Buttons read the strip from context as on the web.
// Approximation: separators go between the children given (null, false and '' dropped); a child element that itself
// renders nothing still gets its separator.
import { Children, createContext, Fragment, isValidElement, useContext } from 'react';
import type * as Web from './ButtonStrip';
import { Box, Text } from '../../term/prim';

export type { ButtonStripProps } from './ButtonStrip';

const StripContext = createContext(false);

export const useInButtonStrip: typeof Web.useInButtonStrip = () => useContext(StripContext);

export const StripScopeReset: typeof Web.StripScopeReset = ({ children }) => <StripContext.Provider value={false}>{children}</StripContext.Provider>;

export const ButtonStrip: typeof Web.ButtonStrip = ({ label, children }) => {
  // toArray already drops null, undefined and booleans.
  const items = Children.toArray(children).filter((c) => c !== '');
  return (
    <Box dir="row" shrink={0} align="center" sem={{ role: 'group', name: label }}>
      <StripContext.Provider value>
        {items.map((c, i) => (
          <Fragment key={isValidElement(c) && c.key !== null ? c.key : i}>
            {i > 0 && <Text colour="line"> │ </Text>}
            {c}
          </Fragment>
        ))}
      </StripContext.Provider>
    </Box>
  );
};
