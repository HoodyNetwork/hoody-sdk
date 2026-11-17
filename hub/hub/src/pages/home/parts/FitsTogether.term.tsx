// "How Hoody fits together" in the terminal: a numbered list, one idea per item, the number in front of its name and
// the words below it. The web's icon mark with its number badge (placed at -7px) and the arrows between steps have no
// cell form: the badge fell outside its mark and the words were laid out wider than their row ("The menu at the" lost
// "top"), so the terminal draws the plain order instead.
import { CHAT_SLOTS, ChatNames, useStrings } from '@kit';
import { Box, Text } from '@term/prim';
import strings from '../strings.en.json';
import type * as Web from './FitsTogether';

const IDEAS = ['realms', 'computers', 'on', 'bots'] as const;
/** The step's number as an ordered list draws it. */
const ordinal = (i: number): string => `${i + 1}.`;

export const FitsTogether: typeof Web.FitsTogether = ({ titleKey, headingId }) => {
  const t = useStrings(strings);
  return (
    <Box dir="column" gap={1} shrink={0}>
      <Text colour="muted" bold sem={{ role: 'heading', level: 2, id: headingId }}>{t(titleKey).toUpperCase()}</Text>
      <Box dir="column" gap={1} shrink={0} sem={{ role: 'list', labelledBy: headingId }}>
        {IDEAS.map((id, i) => (
          <Box key={id} dir="row" gap={1} shrink={0} sem={{ role: 'listitem' }}>
            <Text colour="muted" sem={{ hidden: true }}>{ordinal(i)}</Text>
            <Box dir="column" grow={1} shrink={1} minWidth={0}>
              <Text bold>{t(`intro.${id}`)}</Text>
              <Text colour="muted"><ChatNames text={t(`intro.${id}.body`, CHAT_SLOTS)} /></Text>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
};
