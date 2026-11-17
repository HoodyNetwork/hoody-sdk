// Advanced: the exact pins (ids in mono), agents with their own model, ensembles (read-only) and the
// guardrail checker. Collapsed by default; every control here saves on its own and is read back.
// A checker change whose outcome is unknown is held by core (../checkerHold.ts), keyed by the project, computer and realm,
// never kept in this component: leaving Settings, a realm switch and back (the section is drawn again) or another tab
// shows "may have gone through" with Check again, and the switch and the model stay off until a read-back shows the change
// or the person stops tracking it after the kit's warning.
import { Combobox, Disclosure, OutcomeBanner, Select, SettingGroup, SettingRow, SettingSwitch, useStrings } from '@kit';
import { useMemo, useState } from 'react';
import { checkChecker, sendChecker, stopChecker, useHeldChecker, type CheckerBody } from '../checkerHold';
import { checkerWireRealm } from '../flows-checker';
import { checkerBanner, checkerChoices, DECIDE, idText, modelLabel, REALM_RE, orderChoices, tk } from '../logic';
import type { ModelAt } from '../modelHold';
import { shownComputer } from '../shownGate';
import strings from '../strings.en.json';
import { useAi } from './ctx';
import { failedUi, pendingUi, type Ui } from './outcome';
import s from './parts.module.css';
import { CodeLeaf } from './raw';

/** Past this many models the checker list is searchable. */
const SEARCH_FROM = 8;

type PickProps = { searchable: boolean; label: string; describedBy?: string; options: Array<{ value: string; label: string; description?: string }>; value: string; onChange: (v: string) => void; isDisabled: boolean };
function CheckerPick({ searchable, label, describedBy, options, value, onChange, isDisabled }: PickProps) {
  return searchable ? (
    <Combobox aria-label={label} aria-describedby={describedBy} options={options} value={value} onChange={onChange} isDisabled={isDisabled} />
  ) : (
    <Select aria-label={label} aria-describedby={describedBy} options={options} value={value} onChange={onChange} isDisabled={isDisabled} />
  );
}

export function AdvancedSection() {
  const t = useStrings(strings);
  const { m, api, reload } = useAi();
  const [ui, setUi] = useState<Ui | null>(null);
  const [busy, setBusy] = useState(false);
  const d = m.defaults;
  const chk = m.checker;
  const realm = m.realm;
  const realmSettings = m.caps['jev_realm_settings'] === true;
  const guard = realm ? { realm, realmSettings } : null;
  // The realm the save and its Check again are sent with: Global is sent as 'global' to an agent with per-realm settings
  // (with no realm the call would take the top bar's, and All realms is refused).
  const wire = checkerWireRealm(realm, realmSettings);
  const banner = chk && realm ? checkerBanner(chk, realm, realmSettings) : null;
  const choices = checkerChoices(m.checkerChoices);
  const fusion = m.models.filter((x) => x.source === 'fusion');
  const holdAt = useMemo((): ModelAt | null => (m.computer && m.target && realm ? { project: m.target.project.id, computer: m.computer.id, realm } : null), [m.computer, m.target, realm]);
  const held = useHeldChecker(holdAt);
  // Check again reads only from the computer this render shows (`on`), the one whose hold it draws.
  const on = shownComputer();
  // While this mount's own send runs, the row shows it busy, not held.
  const shown = busy ? null : held;
  const locked = busy || held !== null;

  const apply = async (body: CheckerBody) => {
    // C9: a change that may have gone through is never sent again; Check again (the banner) settles it first.
    if (!guard || !holdAt || locked) return;
    setBusy(true);
    setUi(null);
    const r = await sendChecker(api, holdAt, wire, guard, body, on);
    setBusy(false);
    if (r.state === 'saved') {
      setUi({ kind: 'done', message: t('adv.saved') });
      reload();
    } else if (r.state === 'not_held') setUi({ kind: 'not_sent', message: t('def.notHeld') });
    else if (r.state === 'failed') {
      const out = failedUi(r.err);
      if (out.kind !== 'pending') setUi(out);
    }
    // Anything else (unconfirmed, a lost answer, a context that moved on, another hold of it) is core's hold: the banner.
  };

  const [checking, setChecking] = useState(false);
  // What the last Check again found while the hold stays, for that hold only.
  const [still, setStill] = useState<string | null>(null);
  const check = async (): Promise<boolean> => {
    if (!guard || !shown) {
      reload();
      return false;
    }
    setChecking(true);
    const r = await checkChecker(api, wire, guard, shown, on).finally(() => setChecking(false));
    if (r.state !== 'saved') {
      setStill(shown.id);
      return false;
    }
    setUi(null);
    reload();
    return true;
  };

  const checkerHelp = chk ? (chk.usable === 'yes' ? t('adv.checkerOn') : chk.state === 'disabled' ? t('adv.checkerOff') : t('adv.checkerUnknown')) : undefined;
  return (
    <Disclosure title={t('adv.show')} className={s.advanced}>
      <div>
        <SettingGroup>
          {d && (
            <>
              <SettingRow label={t('adv.helperPin')} help={t('adv.helperPinHint', { agent: d.helper.agent || t('adv.none') })}>
                <CodeLeaf className={`${s.mono} ${s.truncate}`}>{d.helper.model ? idText(d.helper.model) : t('adv.unset')}</CodeLeaf>
              </SettingRow>
              <SettingRow label={t('adv.botPin')} help={t('adv.botPinHint')}>
                <CodeLeaf className={`${s.mono} ${s.truncate}`}>{d.bots.model ? idText(d.bots.model) : t('adv.unset')}</CodeLeaf>
              </SettingRow>
              {d.others.map((o) => (
                <SettingRow key={o.agent} label={t('adv.agentOwn', { agent: o.agent })} help={modelLabel(m.models, o.model)}>
                  <CodeLeaf className={`${s.mono} ${s.truncate}`}>{idText(o.model)}</CodeLeaf>
                </SettingRow>
              ))}
            </>
          )}
          {fusion.length > 0 && (
            <SettingRow label={t('adv.ensembles')} help={t('adv.ensemblesHint')}>
              <span className={s.truncate}>{fusion.map((f) => f.label).join(t('adv.sep'))}</span>
            </SettingRow>
          )}
          {m.loads.checker === 'error' && <SettingRow label={t('adv.checker')} help={t('adv.checkerFailed')} />}
          {/* The checker: its switch, then the model it uses while it is on (a row of its own, the field named by the row). */}
          {chk && m.loads.checker !== 'error' && (chk.enabled !== null && guard && !(banner && !banner.fix) ? (
            <SettingSwitch label={t('adv.checker')} help={checkerHelp} isSelected={chk.enabled} isDisabled={locked} onChange={(v) => void apply({ enabled: v })} />
          ) : (
            <SettingRow label={t('adv.checker')} help={checkerHelp} />
          ))}
          {chk && m.loads.checker !== 'error' && choices.length > 1 && guard && chk.enabled !== false && (
            <SettingRow label={t('adv.checkerModel')}>
              {({ helpId }) => (
                <CheckerPick
                  label={t('adv.checkerModel')}
                  describedBy={helpId || undefined}
                  options={orderChoices(choices).map((c) => (c.spec === DECIDE ? { value: c.spec, label: c.label, description: t('adv.decideDesc') } : { value: c.spec, label: c.label }))}
                  value={chk.model ?? DECIDE}
                  onChange={(v: string) => void apply({ model: v })}
                  isDisabled={locked}
                  searchable={choices.length > SEARCH_FROM}
                />
              )}
            </SettingRow>
          )}
          <SettingRow label={t('adv.accounts')} help={t('adv.accountsHint')}>
            <CodeLeaf className={`${s.mono} ${s.truncate}`}>{(m.accounts ?? []).map((a) => a.id).filter((x) => !REALM_RE.test(x)).join(tk('adv.sep'))}</CodeLeaf>
          </SettingRow>
        </SettingGroup>
        {/* About the checker row: why it cannot change here, how many chats it guards, and its last change. */}
        {banner && banner.kind === 'old' && <p className={`${s.muted} ${s.small}`}>{t('adv.checkerOld')}</p>}
        {banner && banner.kind === 'banner' && !banner.fix && <p className={`${s.muted} ${s.small}`}>{t('adv.checkerNoFix')}</p>}
        {Object.entries(m.guarded).length > 0 && (
          <p className={`${s.muted} ${s.small}`}>{t('adv.guarded', { count: Object.values(m.guarded).reduce((a, b) => a + b, 0) })}</p>
        )}
        {shown ? (
          // Stop tracking is offered only once no request of the change may still be out (core refuses it before).
          <OutcomeBanner kind="pending" body={pendingUi().message} onCheck={check} checking={checking} result={still === shown.id ? t('def.stillNot') : null} onDismiss={shown.inFlight ? undefined : () => void stopChecker(shown)} /* noDetails: a change whose answer never came has no rejection; Check again reads the checker back */ />
        ) : (
          ui && <OutcomeBanner kind={ui.kind} body={ui.message} onDismiss={ui.kind === 'done' ? () => setUi(null) : undefined} />
        )}
      </div>
    </Disclosure>
  );
}
