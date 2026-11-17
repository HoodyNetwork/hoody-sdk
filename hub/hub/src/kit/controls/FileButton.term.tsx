// FileButton in the terminal: a terminal has no file picker, so the button is a one-line hand-off to the web Hub, where
// the files are chosen (its copy-link key is the one Tab stop). To a reader it is the web's button, named by its label,
// disabled with the reason (the caller's while it is disabled, else that choosing files needs the web Hub). A disabled
// or busy one draws its label faint with the reason instead of the hand-off. `onFiles` is never called here.
import { useRouter } from '@tanstack/react-router';
import type * as Web from './FileButton';
import { Box, Text } from '../../term/prim';
import { Handoff } from '../states/Handoff';
import { useStrings } from '../strings';
import strings from './FileButton.term.strings.en.json';

export type { FileButtonProps } from './FileButton';

export const FileButton: typeof Web.FileButton = ({ label, isDisabled = false, disabledReason, busy }) => {
  // The hand-off names a web address from the current route: outside a router (a bare component harness) there is none.
  const routed = Boolean(useRouter({ warn: false }));
  const webOnly = useStrings(strings)('filebutton.handoffReason');
  const off = isDisabled || busy === true;
  const reason = isDisabled ? disabledReason : webOnly;
  return (
    <Box dir="column" shrink={0} sem={{ role: 'button', name: label, disabled: true, disabledReason: reason, busy: busy || undefined }}>
      {off || !routed ? (
        <Text colour="faint">
          [{busy ? '… ' : ''}{label}]{reason ? <Text colour="muted">{` ${reason}`}</Text> : null}
        </Text>
      ) : (
        <Handoff size="line" what={label.toLowerCase()} reason={webOnly} />
      )}
    </Box>
  );
};
