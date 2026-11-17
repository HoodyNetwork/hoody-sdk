// Step 1 of New script, "What it does": the description and its examples (the AI way, the
// default), or an idea from the grid, or the choice to write the code. Pure presentation: the flow owns the draft.
import { ActionMenu, AnatomySection, Band, Button, SubSection, SuggestionActions, TextField, useStrings, type MenuGroup } from '@kit';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { TEMPLATES } from '../logic';
import strings from '../strings.en.json';
import s from '../parts/parts.module.css';
import f from './Flow.module.css';
import { focusDescriptionEnd } from '../describeFocus';

import type { Way } from './draft';
import { EXAMPLES } from './examples';

export type { Way };
export { EXAMPLES };
// The "+N more" under the idea grid: ideas the assistant builds, simple ones first, then ones that show what
// a computer's kits do (the browser, phone notifications, storage). None is a ready-made idea, and the button says the
// assistant builds them: choosing one goes to Describe it with its words in the box, kept after what is there, as an
// example does, and nothing is sent. A kit menu, not a dialog of radios: its rows scroll into view under the keys.
export const MORE_IDEAS = [
  { group: 'moreSimple', ids: ['hello', 'myip', 'counter', 'health', 'pick', 'qr'] },
  { group: 'moreFurther', ids: ['shortlinks', 'guestbook', 'translate', 'weather', 'feeds', 'poll'] },
  { group: 'moreHoody', ids: ['screenshot', 'pagewatch', 'price', 'askdb', 'cloud', 'photos'] },
] as const;
export type MoreIdea = (typeof MORE_IDEAS)[number]['ids'][number];
const MORE_COUNT = MORE_IDEAS.reduce((n, g) => n + g.ids.length, 0);
const READY = { kind: 'ready' } as const;

export interface StepWhatProps {
  way: Way;
  onWay: (w: Way) => void;
  description: string;
  onDescription: (v: string) => void;
  /** Why the assistant can't be used here (a strings key), or null. The AI way is then disabled and comes last. */
  aiOff: string | null;
  /** Why ideas can't be used here (a strings key), or null. */
  ideasOff: string | null;
  computer: string;
  idea: string | null;
  onIdea: (name: string) => void;
  /** Continue was pressed with nothing to go on: say what is missing. */
  missing: boolean;
  /** The flow's primary (Ctrl/Cmd+Enter in the description). */
  onSubmit: () => void;
  /** The flow opened on this step: the caret goes to the end of the description, without scrolling. */
  focusOnMount: boolean;
}

/** The example's words after what is there: the text stays as typed, the example follows on a new paragraph (once). */
export function withExample(text: string, words: string): string {
  if (text === '') return words;
  if (text.includes(words)) return text;
  const gap = text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n';
  return `${text}${gap}${words}`;
}

export function StepWhat(p: StepWhatProps) {
  const t = useStrings(strings);
  // The description's textarea, through the field's own ref (no DOM search, so the terminal's field handle serves too).
  const input = useRef<HTMLTextAreaElement>(null);
  const field = () => input.current;
  useEffect(() => {
    if (!p.focusOnMount || p.way !== 'ai' || p.aiOff) return;
    focusDescriptionEnd(field, { later: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the flow opens on this step
  }, []);
  const take = (words: string) => {
    const next = withExample(p.description, words);
    p.onDescription(next);
    focusDescriptionEnd(field, { at: next.length, later: true });
  };
  // A more idea is described, so it moves to the AI way (its box mounts with the change; the caret goes there next frame).
  const takeMore = (id: MoreIdea) => {
    p.onWay('ai');
    take(t(`more.${id}.fill` as never));
  };
  const more: MenuGroup[] = MORE_IDEAS.map((g) => ({
    id: g.group,
    label: t(`flow.what.${g.group}`),
    items: g.ids.map((id) => ({ id, label: t(`more.${id}` as never), description: t(`more.${id}.body` as never), onAction: () => takeMore(id) })),
  }));
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); p.onSubmit(); }
  };
  const aiCard = (
    <OptionCard
      key="ai"
      title={t('flow.what.aiCard')}
      body={p.aiOff ? t(p.aiOff as never, { computer: p.computer }) : t('flow.what.aiCardBody')}
      on={p.way === 'ai'}
      disabled={!!p.aiOff}
      onPress={() => p.onWay('ai')}
    />
  );
  const ideaCard = <OptionCard key="idea" title={t('flow.what.ideaCard')} body={p.ideasOff ? t(p.ideasOff as never) : t('flow.what.ideaCardBody')} on={p.way === 'idea'} disabled={!!p.ideasOff} onPress={() => p.onWay('idea')} />;
  const writeCard = <OptionCard key="write" title={t('flow.what.writeCard')} body={t('flow.what.writeCardBody')} on={p.way === 'write'} onPress={() => p.onWay('write')} />;
  // The way comes first: the three ways as one row, the chosen one pressed. With the assistant unavailable
  // its card comes last, disabled with its reason, and nothing focuses the dead box.
  const ways = p.aiOff ? [ideaCard, writeCard, aiCard] : [aiCard, ideaCard, writeCard];
  return (
    <AnatomySection
      id="new-what"
      // The examples and the ideas are lists built into the page, never read: always ready.
      state={READY}
      title={t(p.way === 'idea' ? 'flow.what.ideaTitle' : 'flow.what.title')}
      description={t(p.way === 'idea' ? 'flow.what.ideaLead' : p.way === 'write' ? 'flow.what.writeLead' : 'flow.what.lead')}
    >
      <SubSection title={t('flow.what.how')}>
        <div className={f.cards}>{ways}</div>
      </SubSection>
      {p.way === 'ai' && !p.aiOff ? (
        <>
          <div>
            <TextField
              inputRef={input}
              label={t('flow.what.describe')}
              value={p.description}
              onChange={p.onDescription}
              onKeyDown={keys}
              multiline
              rows={4}
              errorMessage={p.missing && !p.description.trim() ? t('flow.what.missing') : undefined}
            />
          </div>
          <SuggestionActions label={t('new.examples')} actions={EXAMPLES.map((id) => ({ id, label: t(`new.ex.${id}` as never), onPress: () => take(t(`new.ex.${id}.fill` as never)) }))} />
        </>
      ) : null}
      {p.way === 'idea' && !p.ideasOff ? (
        <>
          <ul className={s.ideaGrid} role="radiogroup" aria-label={t('new.pickIdea')}>
            {TEMPLATES.map((x) => (
              <li key={x.name}>
                <button type="button" role="radio" aria-checked={p.idea === x.name} className={s.ideaCard} data-on={p.idea === x.name ? 'true' : undefined} onClick={() => p.onIdea(x.name)}>
                  <span className={s.nameMain}>{t(`idea.${x.name}` as never)}</span>
                  <span className={s.faint}>{t(`idea.${x.name}.body` as never)}</span>
                </button>
              </li>
            ))}
          </ul>
          {/* Only with the assistant: every more idea is one it builds. */}
          {p.aiOff ? null : (
            <ActionMenu
              items={more}
              title={t('flow.what.moreTitle')}
              placement="bottom start"
              trigger={<Button size="sm" variant="ghost" iconEnd="chevron-down">{t('flow.what.more', { count: MORE_COUNT })}</Button>}
            />
          )}
          {p.missing && !p.idea ? <Band tone="danger" size="table" /* noDetails: the page's own check, Continue needs an idea first; nothing was sent */>{t('flow.what.pickFirst')}</Band> : null}
        </>
      ) : null}
    </AnatomySection>
  );
}

function OptionCard({ title, body, on, disabled, onPress }: { title: string; body: string; on: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <button type="button" className={f.card} aria-pressed={on} disabled={disabled} data-on={on ? 'true' : undefined} onClick={onPress}>
      <span className={f.cardTitle}>{title}</span>
      <span className={f.cardBody}>{body}</span>
    </button>
  );
}
