// Change with AI / Ask the AI to fix it: describe the change, read what the assistant proposes (what changes, what is
// worth knowing, the checker's verdict), then put it in the editor. Nothing is saved from here: the proposal
// becomes the editor's text and goes through the same check and Save as a hand edit.
// Known secrets in the code are masked before anything is sent and restored byte for byte in the answer.
import { Button, CodeBlock, Drawer, EmptyState, ItemList, Panel, ProblemList, Stack, SubSection, TextField, Verdict, VerdictMark, useStrings } from '@kit';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useValidate } from '../data';
import { changesOf, diff, extract, folderOf, verdictOf, type Verdict as CheckVerdict } from '../logic';
import { detectLiterals, mask, unmask } from '../secrets';
import strings from '../strings.en.json';
import type { CompScripts, Failure, ScriptItem } from '../types';
import { ChangeBanner } from './Bits';
import { askNoteKey, askNoteVars, useAsk, type AskResult } from './useAsk';
import { AgentSignIn, useAgentSignIn } from './AgentSignIn';
import s from './parts.module.css';

export interface AiDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  item: ScriptItem;
  comp: CompScripts;
  /** The editor text now (the caller key is not in it). */
  current: string | null;
  /** The last read of the file failed: the text, if any, is from an earlier read (a failed refetch keeps it), so an empty one
   *  is not known to be the file's. */
  readFailed?: boolean;
  failure: Failure | undefined;
  onUse: (code: string) => void;
}

interface Proposal {
  code: string;
  summary: string;
  warn: 'vanished' | 'duplicated' | null;
}

export function AiDrawer({ isOpen, onClose, item, comp, current, readFailed = false, failure, onUse }: AiDrawerProps) {
  const t = useStrings(strings);
  const validate = useValidate();
  // A closed drawer is away from the place: an answer that comes in meanwhile is not claimed (it stays stored for the next view).
  const ask = useAsk(`${comp.id}\u0000${item.path}${isOpen ? '' : '\u0000closed'}`, comp, item.path);
  const [text, setText] = useState('');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [verdict, setVerdict] = useState<CheckVerdict | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Which proposal's review is current: a verdict that comes back for an older proposal (or after the drawer closed) is not shown.
  const seq = useRef(0);
  const failing = item.status === 'failing';
  // Send signs the agent in first when it is signed out and the box is ticked; the ask goes after the proof.
  // The drawer's open lifetime is the sign-in's view: closing it drops a pending ask and the next opening starts ticked.
  const signIn = useAgentSignIn(comp, () => void sendNow(), isOpen ? 'open' : 'closed');

  // A fix starts from what failed; the words are the person's to change.
  useEffect(() => {
    if (!isOpen) {
      seq.current++;
      setProposal(null);
      setVerdict(null);
      setNote(null);
      return;
    }
    setText((prev) => prev || (failing && failure?.error ? t('ai.fixPrefill', { error: failure.error }) : ''));
  }, [isOpen, failing, failure, t]);

  const secrets = useMemo(() => (current ? detectLiterals(current) : []), [current]);

  // The answer becomes a proposal (reviewed before it can be used); anything else says why nothing was proposed.
  // `token` is the drawer's sequence when the ask began: an answer that comes in after the drawer closed or another ask began is
  // not put in front of the person. The hidden values it is put back with come with the answer (`r.values`), as the writer holds
  // them for that very ask in memory (deleted when the ask ends): an answer of an ask this tab holds none for (another tab's, one
  // from before a reload) cannot be put back together, so it is not applied, and it says so.
  const take = async (r: AskResult | null, token: number) => {
    if (!r) return;
    if (seq.current !== token) {
      if (r.outcome === 'done') setNote(t('ai.err.reopened'));
      return;
    }
    if (r.outcome !== 'done' || r.reply === undefined) {
      if (!r.banner && (r.outcome === 'failed' || r.outcome === 'not_sent')) setNote(t(askNoteKey(r.code), askNoteVars(r.code)));
      return;
    }
    const m = r.values as ReturnType<typeof mask> | undefined;
    if (!m || 'error' in m) return setNote(t('ai.err.reopened'));
    const x = extract(r.reply, false, secrets);
    if ('error' in x) return setNote(t(`ai.err.${x.error}` as never));
    const u = unmask(x.code, m.map);
    if (u.unknown.length > 0) return setNote(t('ai.err.unknown'));
    const mine = ++seq.current;
    setProposal({ code: u.text, summary: x.summary, warn: u.vanished.length ? 'vanished' : u.duplicated.length ? 'duplicated' : null });
    const v = await validate.mutateAsync({ code: u.text, exec: folderOf(item.path) }).catch(() => null);
    if (seq.current === mine) setVerdict(verdictOf(v?.data ?? null));
  };

  const send = async () => {
    if (!current || !text.trim()) return;
    await signIn.press();
  };
  const sendNow = async () => {
    if (!current || !text.trim()) return;
    const token = ++seq.current;
    setProposal(null);
    setVerdict(null);
    setNote(null);
    const m = mask(current, secrets);
    if ('error' in m) return setNote(t('ai.err.placeholder'));
    const prompt = `${text.trim()}\n\n${t('ai.codeIntro')}\n\`\`\`ts\n${m.text}\n\`\`\``;
    const r = await ask.ask(prompt, m);
    // A press that found another ask out at its place continued that one and sent nothing of its own: the answer that comes in is
    // of that ask, not of this prompt, so it is not put in front of the person as the answer to it.
    if (r?.joined) {
      if (seq.current === token) {
        if (r.outcome === 'done') setNote(t('ai.err.joined'));
        else if (!r.banner && (r.outcome === 'failed' || r.outcome === 'not_sent')) setNote(t(askNoteKey(r.code), askNoteVars(r.code)));
      }
      return;
    }
    await take(r, token);
  };
  const checkAsk = async () => {
    const token = seq.current;
    await take(await ask.check(), token);
  };

  const changes = useMemo(() => (proposal && current ? changesOf(current, proposal.code) : []), [proposal, current]);
  const d = useMemo(() => (proposal && current ? diff(current, proposal.code) : null), [proposal, current]);
  const stat = d && !('tooBig' in d) ? d : null;
  const usable = proposal !== null && verdict?.verdict === 'ready' && proposal.warn === null;

  return (
    <Drawer resizeKey="scripts-ai-drawer"
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      title={t(failing ? 'ai.titleFix' : 'ai.title')}
      subtitle={t('ai.sub', { name: item.name })}
      size="lg"
      dirty={text.trim() !== '' && proposal === null}
      footer={
        <>
          <Button variant="ghost" onPress={onClose}>
            {t('ai.close')}
          </Button>
          <Button
            variant="primary"
            icon="check"
            isDisabled={!usable}
            onPress={() => {
              if (proposal) onUse(proposal.code);
              onClose();
            }}
          >
            {t('ai.use')}
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        <TextField label={t('ai.ask')} description={secrets.length > 0 ? t('ai.masked', { count: secrets.length }) : t('ai.askBody')} value={text} onChange={setText} multiline rows={4} />
        <AgentSignIn comp={comp} state={signIn} button={t('ai.send')} myself={false} blocked={current === null || (readFailed && !current) ? t('retryWhy.loading') : !current ? t('retryWhy.code') : !text.trim() ? t('retryWhy.words') : ask.locked ? t('retryWhy.asking') : ''} />
        <div className={s.actions}>
          <Button icon="sparkle" busy={ask.busy || signIn.busy} isDisabled={!current || !text.trim() || ask.locked || signIn.busy || !signIn.canPress} onPress={() => void send()}>
            {t('ai.send')}
          </Button>
          {ask.busy ? <Button variant="ghost" onPress={() => void ask.stop()}>{t('ai.stop')}</Button> : null}
        </div>
        <ChangeBanner out={ask.out} what="ask" onDismiss={ask.settle} onCheck={checkAsk} onForce={ask.force} />
        {note ? <p className={s.hint} role="status">{note}{/* one-line live hint */}</p> : null}
        {proposal ? (
          <Panel title={t('ai.proposal')} description={proposal.summary || undefined} className={s.proposal}>
            <Stack gap={3}>
              {/* The checker's word on this proposal, one plate: ready, a fix needed, still checking, or no answer. */}
              <Verdict label={t('review.title')}>
                {verdict === null ? t('ai.checking') : verdict.verdict === 'ready' ? t('review.ready') : verdict.verdict === 'needs_fix' ? <VerdictMark tone="danger">{t('review.needsFix')}</VerdictMark> : t('ai.unchecked')}
              </Verdict>
              {stat ? <span className={s.faint}>{t('code.diffStat', { added: stat.added, removed: stat.removed })}</span> : null}
              {proposal.warn ? <p className={s.hint} role="alert">{t(`ai.warn.${proposal.warn}` as never)}{/* one-line warning beside the proposal */}</p> : null}
              {verdict?.verdict === 'needs_fix' && verdict.errors.length > 0 ? (
                <ProblemList label={t('ai.problems')} problems={verdict.errors.map((e, i) => ({ id: String(i), line: e.line ?? null, message: e.message }))} />
              ) : null}
              {changes.length > 0 ? (
                <SubSection title={t('code.worthKnowing')} state={{ kind: 'ready' }}>
                  <ItemList label={t('code.worthKnowing')} items={changes.map((c) => ({ id: c.code, title: t(`change.${c.code}` as never, { detail: c.detail ?? '' }) }))} />
                </SubSection>
              ) : null}
              {stat ? (
                <div className={s.diff}>
                  <CodeBlock
                    wrap
                    lang="diff"
                    label={t('ai.diff')}
                    code={stat.ops
                      .filter((o) => o.t !== ' ')
                      .slice(0, 80)
                      .map((o) => `${o.t} ${o.line}`)
                      .join('\n')}
                  />
                </div>
              ) : null}
            </Stack>
          </Panel>
        ) : !ask.busy && !note ? (
          <EmptyState size="sm" icon="sparkle" title={t('ai.empty')} body={t('ai.emptyBody')} />
        ) : null}
      </Stack>
    </Drawer>
  );
}
