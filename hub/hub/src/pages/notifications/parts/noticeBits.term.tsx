// The notifications page's small pieces in the terminal. A message keeps each line break the person typed; a server
// label is drawn as it is (the terminal draws cells left to right, it has no direction isolate to keep); the tip row
// has no row above it (the web's 8 px is under one row: css-translate units). A link written in a notice is a kit
// Link under the message: an address inside a run of words could only be a terminal hyperlink there, which Tab never
// reaches and Enter never opens.
import { Fragment, type ReactNode } from 'react';
import { Link } from '@kit';
import { Box, Br, Text } from '@term/prim';
import { noticeSegments } from '../logic';
import type * as Web from './noticeBits';

export const plainLines: typeof Web.plainLines = (text) => (
  <Text>
    {text.split('\n').map((l, i) => (
      <Fragment key={i}>
        {i > 0 && <Br />}
        {l}
      </Fragment>
    ))}
  </Text>
);

export const isolated: typeof Web.isolated = (text) => <Text>{text}</Text>;

export const hintRow: typeof Web.hintRow = (hint) => <Box dir="column">{hint}</Box>;

/** One stretch of the message: its line breaks kept (the web's pre-wrap), bold as a bold span. */
const stretch = (text: string, bold: boolean, key: number): ReactNode =>
  text.split('\n').map((l, j) => (
    <Fragment key={`${key}.${j}`}>
      {j > 0 && <Br />}
      {bold && l ? <Text bold>{l}</Text> : l}
    </Fragment>
  ));

export const noticeMessage: typeof Web.noticeMessage = (message) => {
  const segs = noticeSegments(message);
  // The message reads whole, each address where it was written; under it each address once, in the order written,
  // as the control that opens it outside the Hub (kit Link: the host's browser, else copied and shown).
  const links = [...new Map(segs.flatMap((g) => (g.href ? [[g.href, g.text] as const] : []))).entries()];
  return (
    <Box dir="column">
      <Text>{segs.map((g, i) => stretch(g.text, g.bold === true, i))}</Text>
      {links.map(([href, text]) => (
        <Box key={href} dir="row">
          <Link href={href}>{text}</Link>
        </Box>
      ))}
    </Box>
  );
};
