// ForkPending: the band of unconfirmed forks. A fork whose answer was lost stays a stored record that blocks its reply until a Check proves what
// became of it; this shows those records, one line each, with Check again and Hide. It is presentational: the host gives the rows and the two actions, and
// a Check that finds the new chat hands its id to `onOpened`. Tone and actions never depend on the words of an outcome, which are only shown.
// Hide is display only (the record still blocks its reply); a hidden row appears only where the host asks for it (`hidden: 'label'`, the AI page's list).
// A Check that ENDS the fork (nothing made, gone, unconfirmed, no longer tracked) drops the record, so its row leaves with the host's next read: that result is
// said in a toast, which outlives the row and the band; an outcome that keeps the row (`unknown`) is said on the row itself.
// With `faqItem` (the AI tab's forkUnconfirmed question, given by the host: the kit cannot read a page's FAQ), each row that can be checked ends with a
// FaqLink to it, and so does the toast of a fork that is gone or can't be confirmed.
import { useState } from 'react';
import { Button } from '../controls/Button';
import { TextButton } from '../controls/Link';
import { FaqLink, type FaqItem } from '../layouts/Faq';
import { useListPane } from '../layouts/pane';
import { Band } from '../states/Band';
import { showToast } from '../states/Toast';
import { useStrings } from '../strings';
import type { ForkElsewhereCount } from './forkList';
import { forkNow } from './forkNow';
import type { ForkOutcome, ForkRowView } from './source';
import strings from './ForkPending.strings.en.json';

export interface ForkPendingProps {
  rows: readonly ForkRowView[];
  /** Checks the fork of create key k1. */
  check(k1: string): Promise<ForkOutcome>;
  /** Hides a row. Absent: no Hide. */
  hide?(k1: string): Promise<boolean>;
  /** A Check that found the new chat. */
  onOpened?(sid: string): void;
  /** `omit`: hidden rows are not shown (a chat's band). `label`: they are, labelled Hidden (the AI page's list). */
  hidden?: 'omit' | 'label';
  /** The unconfirmed forks of other computers and realms of the account, one line each. */
  elsewhere?: readonly ForkElsewhereCount[];
  /** The question that explains unconfirmed forks. Absent: rows and toasts carry no link. */
  faqItem?: FaqItem;
}

export function ForkPending({ rows, check, hide, onOpened, hidden = 'omit', elsewhere = [], faqItem }: ForkPendingProps) {
  const t = useStrings(strings);
  const flush = Boolean(useListPane().rail);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [said, setSaid] = useState<Readonly<Record<string, string>>>({});
  const shown = rows.filter((x) => hidden === 'label' || !x.hidden);
  const press = (k1: string, title: string) => {
    setBusy((b) => new Set(b).add(k1));
    void check(k1).then((raw) => {
      const o = forkNow(raw);
      if (o.k === 'opened') onOpened?.(o.sid);
      else if (o.k === 'refused') {
        const lost = o.reason === 'gone' || o.reason === 'unconfirmed';
        showToast({ title: t('fp.result', { title }), body: o.words, tone: lost ? 'warn' : 'info', faq: lost && faqItem ? { item: faqItem, label: t('fp.more') } : undefined });
      }
      else setSaid((x) => ({ ...x, [k1]: o.words }));
    }, () => undefined).finally(() => setBusy((b) => { const n = new Set(b); n.delete(k1); return n; }));
  };
  if (shown.length === 0 && elsewhere.length === 0) return null;
  return (
    <>
      {shown.map((x) => {
        const title = x.bad || x.parent === null ? t('fp.titleBad') : x.turn === null ? t('fp.titleWhole') : t('fp.title', { n: String(x.turn + 1) });
        const checking = busy.has(x.k1);
        const line = x.mine ? t('fp.making') : checking ? t('fp.checking') : (said[x.k1] ?? t('fp.unconfirmed'));
        const actions = x.mine ? undefined : (
          <>
            <Button size="sm" variant="secondary" isDisabled={checking} onPress={() => press(x.k1, title)}>{t('fp.check')}</Button>
            {hide && !x.hidden && <TextButton onPress={() => { void hide(x.k1); }}>{t('fp.hide')}</TextButton>}
          </>
        );
        return (
          <Band key={x.k1} flush={flush} tone="warn" icon="warn" actions={actions}>
            {title} · {x.hidden ? `${t('fp.hidden')} · ` : ''}{line}
            {faqItem && !x.mine && <> <FaqLink item={faqItem}>{t('fp.more')}</FaqLink></>}
          </Band>
        );
      })}
      {elsewhere.map((e) => (
        <Band key={`${e.computer}|${e.realm}`} flush={flush} tone="neutral">{t('fp.elsewhere', { computer: e.computer, realm: e.realm, n: String(e.n) })}</Band>
      ))}
    </>
  );
}
