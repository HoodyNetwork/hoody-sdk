// The one "this page needs a running computer" state: no computer chosen, the chosen one is
// stopped, or reading it failed. Pages that work on the current computer (programs, schedules, apps,
// logs, scripts) render this instead of hand-rolling the three states, so the words, the layout (the
// page's own header in a PageFrame, the state centred under it) and the way out match.
// Open Computers goes through the page links: while this load hides Computers there is no button,
// never a dead route. The states and their words live in ComputerRequired.shared.tsx (the terminal
// draws the same ones, ComputerRequired.term.tsx).
import { PageFrame } from '@kit/layouts/Layouts';
import { PageHeader } from '@kit/layouts/PageHeader';
import { type ComputerRequiredProps, useComputerRequiredContent } from './ComputerRequired.shared';

export type { ComputerRequiredProps } from './ComputerRequired.shared';

export function ComputerRequired(props: ComputerRequiredProps) {
  const { top, className } = props;
  const content = useComputerRequiredContent(props);
  if (props.inline) {
    return (
      <div {...(className ? { className } : {})}>
        {top}
        {content}
      </div>
    );
  }
  return (
    <PageFrame {...(className ? { className } : {})}>
      <PageHeader {...props.header} />
      {top}
      {content}
    </PageFrame>
  );
}
