// Error details in the terminal: a "Details" toggle that unfolds the labelled lines in place, with "c Copy details
// for support" (OSC 52; the copied text is exactly the lines, errorText). `button` mode opens the same lines in the kit
// Dialog, as on the web. The Page line links in-app.
import { useState } from 'react';
import type * as Web from './ErrorDetails';
import { Link, TextButton } from '../controls/Link';
import { Dialog } from '../overlays/Dialog';
import { useStrings } from '../strings';
import { Box, Pressable, Text } from '../../term/prim';
import { errorLines, errorSentence, errorText, useErrorInfo } from './errorDetails.pure';
import { useCopyText } from './termCopy';
import stateStrings from './strings.en.json';
import { focusInk } from '@term/kit';

export type { ErrorLine, ErrorDetailsProps } from './ErrorDetails';
export { errorLines, errorText, errorSentence, infoOf, withOutcome, KIND_OUTCOME, pendingFacts, shownKind, useErrorInfo } from './errorDetails.pure';

/** The mapped sentence as a terminal surface shows it: the sentence alone (the words' link is a web hand-off). */
export const errorSentenceNode: typeof Web.errorSentenceNode = (info, opts, t) => errorSentence(info, opts, t);

export const ErrorDetails: typeof Web.ErrorDetails = ({ error, mode = 'disclosure' }) => {
  const t = useStrings(stateStrings);
  const info = useErrorInfo(error);
  const [open, setOpen] = useState(false);
  const [copy, copied] = useCopyText();
  if (!info) return null;
  const lines = errorLines(info, t);
  const w = Math.max(...lines.map((l) => l.label.length));
  const body = (
    <Box dir="column">
      {lines.map((l) => (
        <Box key={l.label} dir="row" gap={1}>
          <Text colour="muted" width={w}>{l.label}</Text>
          {l.href ? <Link href={l.href}>{l.value}</Link> : <Text>{l.value}</Text>}
        </Box>
      ))}
      <Pressable dir="row" alignSelf="start" onPress={() => copy(errorText(info, t))} sem={{ name: t('err.copy') }}
        onKey={(k) => (k.name === 'c' && !k.ctrl && !k.meta ? (copy(errorText(info, t)), true) : false)}>
        {({ focused }) => (
          <Text colour={copied === 'no' ? 'warn' : 'blueText'} {...focusInk(focused)}>
            {copied === 'yes' ? '[✓ Copied]' : copied === 'no' ? '[! Copy failed]' : `[c ${t('err.copy')}]`}
          </Text>
        )}
      </Pressable>
    </Box>
  );
  if (mode === 'button') {
    // As on the web: a "Details" button opening the kit Dialog with the same lines.
    return (
      <>
        <TextButton onPress={() => setOpen(true)}>{t('err.details')}</TextButton>
        <Dialog isOpen={open} onOpenChange={setOpen} title={t('err.detailsTitle')} cancelLabel={t('err.close')} initialFocus="cancel">
          {body}
        </Dialog>
      </>
    );
  }
  return (
    <Box dir="column" shrink={0}>
      <Pressable dir="row" alignSelf="start" onPress={() => setOpen((o) => !o)} sem={{ name: t('err.details'), expanded: open }}>
        {({ focused }) => <Text colour="blueText" {...focusInk(focused)}>{`${open ? '▾' : '▸'} ${t('err.details')}`}</Text>}
      </Pressable>
      {open && <Box pad={{ left: 2 }}>{body}</Box>}
    </Box>
  );
};
