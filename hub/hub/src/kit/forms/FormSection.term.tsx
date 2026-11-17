// Terminal FormSection: a group of fields in a form. The title is a bold line (a field label is plain), the
// description is the muted line under it, then the fields one row apart. A titled section and the closing summary
// draw a rule above themselves; the untitled leading group draws none.
import type * as Web from './FormSection';
import { Box, Text } from '../../term/prim';
import { say } from './termField';

export type { FormSectionProps } from './FormSection';

export const FormSection: typeof Web.FormSection = ({ title, description, kind = 'group', label, children }) => {
  const ruled = Boolean(title) || kind === 'summary';
  return (
    <Box
      dir="column"
      shrink={0}
      gap={1}
      border={ruled ? ['top'] : false}
      borderColour="line"
      sem={{ role: 'group', name: title ?? label, description: typeof description === 'string' ? description : undefined }}
    >
      {title || description ? (
        <Box dir="column" shrink={0}>
          {title ? <Text bold colour="ink">{title}</Text> : null}
          {say(description)}
        </Box>
      ) : null}
      <Box dir="column" shrink={0} gap={kind === 'summary' ? 0 : 1}>
        {children}
      </Box>
    </Box>
  );
};
