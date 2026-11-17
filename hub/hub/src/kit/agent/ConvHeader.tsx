// ConvHeader: the conversation's header. The title; a meta line that always says where the chat runs (computer · realm, then the
// folder; on a phone the agent is left to Details, and on the narrowest the folder too); the model chip (the chat's model, one
// press to where model and thinking are switched); the capability line (what this chat can do, in the host's words); the status
// pill when it says something; and the buttons: back to the list on a small frame, Details, and the host's own actions.
// Nothing here is guessed: the model chip and the capability line are drawn only from what the host read. The context in use is
// not drawn: no host reports it yet.
// Needs-you is the accent everywhere; paused is warn.
import type { ReactNode } from 'react';
import { providers } from '@core';
import { Button, IconButton } from '../controls/Button';
import { Link, TextButton } from '../controls/Link';
import { StatusPill, Tag, type Tone } from '../data/Display';
import { useStrings } from '../strings';
import { clean, scrubSecrets } from './code';
import type { ConvMeta } from './source';
import { isSmall, type SizeClass } from './useSizeClass';
import strings from './ConvHeader.strings.en.json';
import s from './ConvHeader.module.css';

const TONE: Record<ConvMeta['status'], Tone> = { loading: 'neutral', idle: 'neutral', running: 'info', needs: 'accent', paused: 'warn', closed: 'neutral', unreachable: 'warn' };

/** Whether the status pill says something the frame does not: an idle or loading chat draws none (its transcript says it). On a
 *  phone running and needs-you are said by the pinned working and Needs-you bars, so only the states no bar names are drawn. */
const pillShown = (status: ConvMeta['status'], size: SizeClass): boolean =>
  status !== 'idle' && status !== 'loading' && (size !== 'xs' || (status !== 'running' && status !== 'needs'));

/** What this chat can do, said once under where it runs. The words are the host's (it knows the agent and its tools). */
export interface ConvCapability {
  /** The kind of chat in two or three words ("Chat only", "Works on atlas"). */
  tag: string;
  /** One sentence: what it can and cannot do. */
  text: string;
  /** Opens the host's own control where this is changed. */
  onChange?: () => void;
}

/** The chat's model as the host read it. */
export interface ConvModel {
  /** The model as the agent reports it (a picker spec); the header names it by the one rule, providers.modelNameOf. */
  spec: string;
  /** The computer's catalogue, for the model's public name; null = not readable (named by the spec alone). */
  catalogue: providers.Catalogue | null;
}

export interface ConvHeaderProps {
  size: SizeClass;
  title: string | null;
  meta: ConvMeta | undefined;
  detailsOpen: boolean;
  onDetails: () => void;
  /** Below 840 the conversation has a way back to the list. */
  onBack?: () => void;
  /** The host's own buttons (Add to Board, the ⋯ menu). */
  actions?: ReactNode;
  /** The capability line; absent while the host does not know (nothing is guessed). */
  capability?: ConvCapability | null;
  /** The model chip; absent while the host does not know the model. */
  model?: ConvModel | null;
  /** The chip's press: the host's own way to switch the model or how hard it thinks (Details › Session). Without it the chip
   *  is not drawn. */
  onModel?: () => void;
}

export function ConvHeader({ size, title, meta, detailsOpen, onDetails, onBack, actions, capability, model, onModel }: ConvHeaderProps) {
  const t = useStrings(strings);
  // Keys hidden first, then cleaned and bounded, as Details shows the same fields.
  const text = (x: string, max: number): string => clean(scrubSecrets(x), max).text;
  const modelName = model ? text(providers.modelNameOf(model.spec, model.catalogue, t('head.model.unnamed')), 80) : '';
  const shown = title && title.trim() ? text(title, 140) : t('head.untitled');
  const folder = meta?.folder ? text(meta.folder, 160) : '';
  const place = meta ? `${text(meta.computer, 80)} · ${text(meta.realm, 80)}` : '';
  return (
    <header className={s.head} data-size={size}>
      {isSmall(size) && onBack && <IconButton icon="arrow-left" label={t('head.back')} onPress={onBack} className={s.back} />}
      <div className={s.text}>
        {/* One line: a long title is cut, and the whole of it is the tooltip. */}
        <h2 className={s.title} translate="no" title={shown}>{shown}</h2>
        {/* Where it runs, then the model chip at the end of the same row (one header row less than a chip on its own row). */}
        {(meta || (model && onModel)) && (
          <div className={s.where}>
            {meta && (
              <ul className={s.meta} aria-label={t('head.meta')}>
                <li translate="no">{place}</li>
                {folder && <li className={s.folder} translate="no">{folder}</li>}
                {meta.agent && <li className={s.opt} translate="no">{meta.agentHref ? <Link href={meta.agentHref}>{text(meta.agent, 80)}</Link> : text(meta.agent, 80)}</li>}
                {meta.model && !(model && onModel) && <li className={s.opt} translate="no">{text(meta.model, 80)}</li>}
              </ul>
            )}
            {model && onModel && (
              <Button variant="ghost" size="xs" icon="hoody-ai" literal shrink className={s.model} onPress={onModel} aria-label={t('head.model', { name: modelName })}>
                {modelName}
              </Button>
            )}
          </div>
        )}
        {capability && (
          <p className={s.cap} data-capability>
            <Tag>{capability.tag}</Tag>
            <span className={s.capText}>{capability.text}</span>
            {capability.onChange && <TextButton onPress={capability.onChange}>{t('head.change')}</TextButton>}
          </p>
        )}
      </div>
      <div className={s.actions}>
        {meta && pillShown(meta.status, size) && <StatusPill tone={TONE[meta.status]} dot={meta.status === 'running' || meta.status === 'needs'}>{t(`head.status.${meta.status}` as 'head.status.idle')}</StatusPill>}
        {actions}
        <IconButton data-details-toggle icon="panel-right" label={detailsOpen ? t('head.detailsClose') : t('head.details')} pressed={detailsOpen} onPress={onDetails} />
      </div>
    </header>
  );
}
