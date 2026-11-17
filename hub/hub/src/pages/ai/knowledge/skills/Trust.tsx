// AI → Knowledge → Skills, one skill's trust. Trust is its own action, apart from
// on/off (the switch in List.tsx never touches it, and nothing here touches on/off). Trusting opens a confirm that lists what the
// skill brings (where from, files, the commands it runs, the tools it asks for) and names the effect before anything is sent;
// stopping trust has its own confirm too. The confirm reviews a copy of the skill taken when it opened: if the list shows the
// skill differently by the time of the press, nothing is sent and the confirm shows the new copy to review again. A grant of a
// skill whose files had not changed carries verify_unchanged, so the agent refuses it if the files changed since install.
// Sent once; a lost answer is "may have gone through" with Check again until a fresh list shows it (C9), never sent again on
// its own. The state is one SettingRow: its pill and sentence, the action at the row's end, the outcome under it.
import { Button, CodeBlock, ConfirmDialog, Facts, Outcome, SettingGroup, SettingRow, Stack, StatusPill, useStrings, type Tone } from '@kit';
import { refusal } from '@core';
import { useState } from 'react';
import type { SkillsAt } from './data';
import type { SkillRow, TrustState } from './logic';
import listStrings from './strings.en.json';
import strings from './trust.strings.en.json';
import { canTrust, relDirOf, useTrust } from './trust';

const TRUST_TONE: Record<TrustState, Tone> = { local: 'neutral', trusted: 'ok', untrusted: 'warn', changed: 'danger' };

/** What the confirm reviewed: the fields the effect sentence and the lists are made of. */
type Reviewed = Pick<SkillRow, 'id' | 'name' | 'trust' | 'from' | 'files' | 'commands' | 'allowedTools' | 'model'>;
const reviewedOf = (r: SkillRow): Reviewed => ({
  id: r.id, name: r.name, trust: r.trust, from: r.from, files: [...r.files], commands: [...r.commands], allowedTools: [...r.allowedTools], model: r.model,
});
const sameReview = (a: Reviewed, b: Reviewed): boolean => JSON.stringify(a) === JSON.stringify(b);
/** The action still fits the skill: a grant only while it is not trusted, a stop only while it is. */
const fits = (kind: 'grant' | 'revoke', r: SkillRow): boolean =>
  canTrust(r) && (kind === 'grant' ? r.trust === 'untrusted' || r.trust === 'changed' : r.trust === 'trusted');

type Ask = { kind: 'grant' | 'revoke'; seen: Reviewed; moved: boolean; at: SkillsAt };
const samePlace = (a: SkillsAt, b: SkillsAt): boolean => a.realm === b.realm && a.target.container.id === b.target.container.id;

export function SkillTrust({ row, at }: { row: SkillRow; at: SkillsAt }) {
  const t = useStrings(strings);
  const tl = useStrings(listStrings);
  const runner = useTrust(at, row.id);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [stop, setStop] = useState(false);
  // The value the last press sent: the done line names it, whatever the list shows while it is re-read.
  const [last, setLast] = useState<boolean | null>(null);
  const held = runner.outcome?.kind === 'pending';
  const locked = runner.busy || held;
  const settable = canTrust(row);

  const confirm = () => {
    if (!ask) return;
    // The top bar moved to another computer or realm: what was reviewed is not what would be sent there.
    if (!samePlace(ask.at, at)) { setAsk(null); return; }
    // The action no longer fits (trusted or untrusted meanwhile, or nothing to set): this confirm is over, nothing is sent.
    if (!fits(ask.kind, row)) { setAsk(null); return; }
    const now = reviewedOf(row);
    // The skill moved since the confirm opened: show the new copy, send nothing. A grant's binding follows the copy shown.
    if (!sameReview(ask.seen, now)) { setAsk({ ...ask, seen: now, moved: true }); return; }
    const relDir = relDirOf(row);
    if (relDir === null) return;
    const trusted = ask.kind === 'grant';
    setAsk(null);
    setLast(trusted);
    void runner.run({ ...at, dir: row.id, rootDir: row.rootDir, relDir, trusted, verify: trusted && ask.seen.trust === 'untrusted' });
  };

  const sent = runner.held as { trusted?: unknown } | null;
  const heldWord = sent && typeof sent.trusted === 'boolean' ? t(sent.trusted ? 'held.grant' : 'held.revoke', { name: row.name }) : undefined;
  const failed = runner.outcome?.kind === 'failed' ? runner.outcome.code : undefined;
  const failedWord = failed === 'not_found' ? t('err.notFound') : failed === 'bad_request' && last === true ? t('err.refusedGrant') : undefined;

  return (
    <SettingGroup title={tl('trust.title')}>
      <SettingRow
        label={<StatusPill tone={TRUST_TONE[row.trust]}>{tl(`trust.${row.trust}`)}</StatusPill>}
        help={tl(`trust.body.${row.trust}`)}
        actions={
          !settable ? undefined : row.trust === 'trusted' ? (
            <Button variant="secondary" isDisabled={locked} onPress={() => setAsk({ kind: 'revoke', seen: reviewedOf(row), moved: false, at })}>{t('revoke.open')}</Button>
          ) : (
            <Button variant="secondary" isDisabled={locked} onPress={() => setAsk({ kind: 'grant', seen: reviewedOf(row), moved: false, at })}>{t('grant.open')}</Button>
          )
        }
        wide
      >
        <Outcome
          outcome={runner.outcome}
          onCheck={held ? runner.check : undefined}
          doneText={t(last === false ? 'done.revoke' : 'done.grant', { name: row.name })}
          detail={held ? (runner.elsewhere ? t('held.elsewhere', { name: row.name }) : heldWord) : failedWord}
          error={refusal(runner.outcome)}
        />
        {held && !runner.elsewhere && (
          <Button size="sm" variant="ghost" onPress={() => setStop(true)}>{t('dismiss')}</Button>
        )}
      </SettingRow>
      <ConfirmDialog
        isOpen={ask !== null}
        onOpenChange={(open) => { if (!open) setAsk(null); }}
        title={t(ask?.kind === 'revoke' ? 'revoke.title' : 'grant.title', { name: row.name })}
        body={ask ? <Review ask={ask} t={t} /> : null}
        confirmLabel={t(ask?.kind === 'revoke' ? 'revoke.confirm' : 'grant.confirm')}
        confirmDisabled={locked}
        onConfirm={confirm}
      />
      <ConfirmDialog
        isOpen={stop}
        onOpenChange={setStop}
        title={t('dismissTitle')}
        body={t('dismissBody')}
        confirmLabel={t('dismiss')}
        onConfirm={() => { setStop(false); void runner.dismiss(); }}
      />
    </SettingGroup>
  );
}

type T = ReturnType<typeof useStrings<typeof strings>>;

/** The confirm's body: what changed (when it moved), the effect, and what the skill brings. */
function Review({ ask, t }: { ask: Ask; t: T }) {
  const s = ask.seen;
  const moved = ask.moved && <p role="alert">{t('grant.moved')}</p>; // inline hint inside the confirm: the reviewed skill changed, nothing was sent (no rejection to detail)
  if (ask.kind === 'revoke') return <>{moved}<p>{t('revoke.effect', { name: s.name })}</p></>;
  const list = (xs: readonly string[]) => (xs.length ? xs.join(', ') : t('none'));
  return (
    <Stack gap={3}>
      {moved}
      {s.trust === 'changed' && <p>{t('grant.changed')}</p>}
      <p>{t(s.commands.length ? 'grant.effectCommands' : 'grant.effect', { name: s.name })}</p>
      {s.commands.length > 0 && <CodeBlock label={t('grant.commands')} code={s.commands.join('\n')} lang="shell" wrap />}
      <Facts
        label={t('grant.facts')}
        items={[
          ...(s.from ? [{ label: t('grant.from'), value: s.from }] : []),
          { label: t('grant.folder'), value: s.id, mono: true },
          { label: t('grant.files'), value: list(s.files) },
          { label: t('grant.tools'), value: list(s.allowedTools) },
          ...(s.model ? [{ label: t('grant.model'), value: s.model, mono: true }] : []),
        ]}
      />
      <p>{t(s.trust === 'changed' ? 'grant.bindNow' : 'grant.bindInstalled')}</p>
    </Stack>
  );
}
