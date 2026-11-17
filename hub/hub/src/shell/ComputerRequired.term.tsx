// ComputerRequired in a terminal: the web's states and words (ComputerRequired.shared.tsx). It differs from the web
// file only in the inline host, which the web draws as a plain block and the terminal as a column box.
import type * as Web from './ComputerRequired';
import { PageFrame } from '@kit/layouts/Layouts';
import { PageHeader } from '@kit/layouts/PageHeader';
import { useComputerRequiredContent } from './ComputerRequired.shared';
import { Box } from '../term/prim';

export type { ComputerRequiredProps } from './ComputerRequired.shared';

export const ComputerRequired: typeof Web.ComputerRequired = (props) => {
  const content = useComputerRequiredContent(props);
  if (props.inline) {
    return (
      <Box dir="column">
        {props.top}
        {content}
      </Box>
    );
  }
  return (
    <PageFrame>
      <PageHeader {...props.header} />
      {props.top}
      {content}
    </PageFrame>
  );
};
