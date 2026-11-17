// ConvHeader.term: the conversation's header in the terminal, in three rows:
//   [Back to chats] Title, cut with an ellipsis ............ ● Running  <host actions>  [Details]
//   atlas · Personal  ~/projects/shop  Reviewer  hoody-ai/hoody-free
//   ──────────────────────────────────────────────────────────────────────────
// The title is one line and gives way first; the status, the host's actions and Details are never cut. The meta line says
// where the chat runs: computer · realm and the folder always (they wrap, they are never cut or dropped), the agent and the
// model only above the small sizes, as on the web. Same words, same cleaning (keys hidden first, then bounded), same roles.
// With the host's model and its press the model is a chip on a row of its own (then the meta line leaves the model out);
// the capability line (tag, sentence, Change) follows, both only from what the host read.
import type * as Web from './ConvHeader';
import { providers } from '@core';
import { Box, Text } from '@term/prim';
import { useKeys } from '@term/kit';
import { Button, IconButton } from '../controls/Button';
import { Link, TextButton } from '../controls/Link';
import { StatusPill, Tag, type Tone } from '../data/Display';
import { useStrings } from '../strings';
import { clean, scrubSecrets } from './code';
import type { ConvMeta } from './source';
import { isSmall } from './useSizeClass';
import strings from './ConvHeader.strings.en.json';

export type { ConvCapability, ConvHeaderProps, ConvModel } from './ConvHeader';

const TONE: Record<ConvMeta['status'], Tone> = { loading: 'neutral', idle: 'neutral', running: 'info', needs: 'accent', paused: 'warn', closed: 'neutral', unreachable: 'warn' };

export const ConvHeader: typeof Web.ConvHeader = ({ size, title, meta, detailsOpen, onDetails, onBack, actions, capability, model, onModel }) => {
  const t = useStrings(strings);
  const text = (x: string, max: number): string => clean(scrubSecrets(x), max).text;
  const shown = title && title.trim() ? text(title, 140) : t('head.untitled');
  const modelName = model ? text(providers.modelNameOf(model.spec, model.catalogue, t('head.model.unnamed')), 80) : '';
  const small = isSmall(size);
  // Esc goes back to the chats, as it closes every other detail (a text field takes its own Esc first, a layer too).
  useKeys((k) => { if (k.name !== 'escape' || k.ctrl || k.meta || !small || !onBack) return false; onBack(); return true; });
  return (
    <Box dir="column" shrink={0} padX={1} border={['bottom']} borderColour="line">
      <Box dir="row" gap={1} shrink={0}>
        {small && onBack && <Box shrink={0}><IconButton icon="arrow-left" label={t('head.back')} onPress={onBack} /></Box>}
        <Box grow={1} shrink={1}><Text bold truncate sem={{ role: 'heading', level: 2 }}>{shown}</Text></Box>
        <Box dir="row" gap={1} shrink={0} align="center">
          {meta && <StatusPill tone={TONE[meta.status]} dot={meta.status === 'running' || meta.status === 'needs'}>{t(`head.status.${meta.status}` as 'head.status.idle')}</StatusPill>}
          {actions}
          <IconButton icon="panel-right" label={detailsOpen ? t('head.detailsClose') : t('head.details')} pressed={detailsOpen} onPress={onDetails} />
        </Box>
      </Box>
      {meta && (
        <Box dir="row" wrap gapX={2} shrink={0} sem={{ role: 'list', name: t('head.meta') }}>
          <Box shrink={1} sem={{ role: 'listitem' }}><Text colour="muted">{`${text(meta.computer, 80)} · ${text(meta.realm, 80)}`}</Text></Box>
          {meta.folder && <Box shrink={1} sem={{ role: 'listitem' }}><Text colour="muted">{text(meta.folder, 160)}</Text></Box>}
          {!small && meta.agent && (
            <Box shrink={1} sem={{ role: 'listitem' }}>
              {meta.agentHref ? <Link href={meta.agentHref}>{text(meta.agent, 80)}</Link> : <Text colour="muted">{text(meta.agent, 80)}</Text>}
            </Box>
          )}
          {!small && meta.model && !(model && onModel) && <Box shrink={1} sem={{ role: 'listitem' }}><Text colour="muted">{text(meta.model, 80)}</Text></Box>}
        </Box>
      )}
      {model && onModel && (
        <Box dir="row" shrink={0}>
          <Button variant="ghost" size="sm" onPress={onModel} aria-label={t('head.model', { name: modelName })}>{modelName}</Button>
        </Box>
      )}
      {capability && (
        <Box dir="row" wrap gapX={1} shrink={0}>
          <Box shrink={0}><Tag>{capability.tag}</Tag></Box>
          <Box shrink={1}><Text colour="muted">{capability.text}</Text></Box>
          {capability.onChange && <Box shrink={0}><TextButton onPress={capability.onChange}>{t('head.change')}</TextButton></Box>}
        </Box>
      )}
    </Box>
  );
};
