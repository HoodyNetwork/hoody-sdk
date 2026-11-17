// The Home card's launch strip in the terminal: one line per program, its name (the press that opens it, with the
// new-tab mark) in a column as wide as the longest name, then its actions, starting at the same column on every line.
// The web's five joined cells each hold three icon buttons. Here those are words ("⧉ copy [QR] [Put Terminal on
// Board]", 35 cells): a fifth of the card cut them at both ends, and the web's narrow rows put each divider after its
// own name. A line too narrow for both puts the actions under the name.
import { CopyButton, Icon, QrButton, TextButton, openOutside, qrReachOf, useStrings } from '@kit';
import { Box, widestCells } from '@term/prim';
import { BoardAddButton } from '../../board/links';
import { subjectOf } from '../data';
import { PROGRAMS, SLUG } from '../logic';
import strings from '../strings.en.json';
import { programUrl } from '../urls';
import type * as Web from './ProgramStrip';

export const ProgramStrip: typeof Web.ProgramStrip = ({ computer: c, running }) => {
  const t = useStrings(strings);
  const names = PROGRAMS.map((p) => t(`program.${p}`));
  // The column: the widest name in cells (a wide character takes two), a space and the one-cell new-tab glyph.
  const nameCells = widestCells(names) + 2;
  return (
    <Box dir="column" shrink={0}>
      {PROGRAMS.map((p, i) => {
        const url = programUrl(c, p);
        const name = names[i]!;
        const open = running && url !== '';
        return (
          <Box key={p} dir="row" wrap gapX={2} shrink={0}>
            <Box dir="row" gapX={1} width={nameCells} shrink={0}>
              <TextButton isDisabled={!open} onPress={() => openOutside(url)}>{name}</TextButton>
              <Icon name="external" tone="muted" />
            </Box>
            {open ? (
              <Box dir="row" gap={1} shrink={0} sem={{ role: 'group', name: t('use.actions', { what: name }) }}>
                <CopyButton text={url} size="md" label={t('copy.what', { what: name })} />
                <QrButton url={url} name={name} size="md" reach={qrReachOf(SLUG[p])} resetKey={c.id} />
                <BoardAddButton computer={subjectOf(c)} program={p} what={name} size="md" />
              </Box>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
};
