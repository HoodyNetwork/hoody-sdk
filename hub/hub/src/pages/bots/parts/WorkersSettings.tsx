// Settings > Helpers. Which helpers the Bot hands work to: Hoody models, Claude Code, or both, and which one new helpers run on.
// The form is the page's (the footer saves it with the Bot's other settings, fenced by the Bot's uid and revision); this part draws the fields
// as three setting groups (who may work, Hoody models, Claude Code) and says what the agent will do with the choice before it is saved.
import { Band, SegmentedControl, SettingGroup, SettingRow, Switch, Why, useStrings } from '@kit';
import type { ComponentProps } from 'react';
import type { Workers } from '../data';
import { pageFaq } from '../faq';
import { workersBackend, workersProblem, type WorkersForm } from '../logic';
import strings from '../strings.en.json';
import { ClaudeHelpers, HelperModelPick, HoodyHelpers } from './HelperModels';

interface Props {
  /** Whether the agent reports a policy at all. */
  known: boolean;
  /** What the Bot holds (as this form last knew it): the revoke note compares the form with it. */
  base: Workers;
  form: WorkersForm;
  onChange: (f: WorkersForm) => void;
  disabled: boolean;
  /** The words for a refused save (from the agent's code and details). */
  refusal: string | undefined;
  /** The helper-option field a refused save named: the refusal is drawn under the group that holds it, and on the field itself. */
  refusedField?: string;
  /** What Hoody-model helpers run on, Routing and the agents a task may name (drawn while Hoody models are allowed). */
  hoody: Omit<ComponentProps<typeof HoodyHelpers>, 'disabled'>;
  /** Claude Code's models on the Bot's computer (undefined while unread, null after a failed read). */
  claudeModels: ComponentProps<typeof ClaudeHelpers>['models'];
}

type Kind = 'who' | 'llm' | 'acp';

/** The group a refused field belongs to; a refusal that names no helper option is about who may work. */
const groupOf = (field: string | undefined): Kind =>
  field === 'worker_model' || field === 'worker_thinking' ? 'llm' : field === 'worker_delegated_model' || field === 'worker_delegated_effort' || field === 'worker_delegated_agent' ? 'acp' : 'who';

export function WorkersSettings({ known, base, form, onChange, disabled, refusal, refusedField, hoody, claudeModels }: Props) {
  const t = useStrings(strings);
  const { byId } = pageFaq(t);
  const backend = workersBackend(form);
  const both = form.llm && form.acp;
  // Taking Claude Code away while it is what new helpers run on: the agent moves them to Hoody models and keeps the Claude model it holds.
  const revoking = known && base.allowed.includes('acp') && !form.acp;
  // One sentence about a group (a refused save, or a choice that cannot be sent) is a band attached to that group.
  const refusedIn = refusal ? groupOf(refusedField) : undefined;
  const whoSay = refusedIn === 'who' ? refusal : workersProblem(form) !== undefined ? t('workers.none') : undefined;
  return (
    <>
      {/* A refusal or a choice that cannot be sent is a band attached to the group it is about: the group is described by
          it, and it is a polite status (read with the group), not an alert. */}
      <Band
        tone={refusedIn === 'who' ? 'danger' : 'warn'}
        /* noDetails: the words come from the refusal's code and details (workersRefusalKey), or name a choice the form cannot send; the agent's own text is not shown */
        attach={
          <SettingGroup variant="field" title={t('workers.allow')}>
            <SettingRow label={t('workers.allow.llm')} help={t('workers.allow.llm.help')}>
              {(ids) => <Switch labelledBy={ids.nameId} aria-describedby={ids.helpId} isSelected={form.llm} onChange={(v) => onChange({ ...form, llm: v })} isDisabled={disabled || (form.llm && !form.acp)} />}
            </SettingRow>
            <SettingRow label={t('workers.allow.acp')} help={t('workers.allow.acp.help')}>
              {(ids) => <Switch labelledBy={ids.nameId} aria-describedby={ids.helpId} isSelected={form.acp} onChange={(v) => onChange({ ...form, acp: v })} isDisabled={disabled || (form.acp && !form.llm)} />}
            </SettingRow>
            {(both || !disabled || revoking) && (
              <SettingRow label={t('workers.default')} help={revoking ? (base.model !== '' ? `${t('workers.revoke')} ${t('workers.revoke.kept')}` : t('workers.revoke')) : t('workers.applies')}>
                {both ? (
                  <SegmentedControl<'llm' | 'acp'>
                    label={t('workers.default')}
                    isDisabled={disabled}
                    value={backend}
                    onChange={(b) => onChange({ ...form, backend: b })}
                    items={(['llm', 'acp'] as const).map((b) => ({ id: b, label: t(`workers.default.${b}`) }))}
                  />
                ) : disabled ? undefined : (
                  t(form.acp ? 'workers.onlyAcp' : 'workers.onlyLlm')
                )}
              </SettingRow>
            )}
          </SettingGroup>
        }
      >
        {whoSay}
      </Band>
      <Band
        tone="danger"
        /* noDetails: the words come from the refusal's code and details (workersRefusalKey); the agent's own text is not shown */
        attach={
          <SettingGroup variant="field" title={t('workers.llm.title')}>
            {form.llm ? (
              <HoodyHelpers
                {...hoody}
                disabled={disabled}
                modelPicked={base.options !== undefined && form.hModel !== ''}
                pick={
                  base.options && (
                    <HelperModelPick
                      models={hoody.models}
                      model={form.hModel}
                      thinking={form.hThinking}
                      onChange={(v) => onChange({ ...form, hModel: v.model, hThinking: v.thinking })}
                      disabled={disabled}
                      refused={refusedField === 'worker_model' ? 'model' : refusedField === 'worker_thinking' ? 'thinking' : undefined}
                    />
                  )
                }
              />
            ) : (
              <SettingRow label={t('workers.llm.runOnLabel')} help={t('workers.llm.off')} />
            )}
          </SettingGroup>
        }
      >
        {refusedIn === 'llm' ? refusal : undefined}
      </Band>
      <Band
        tone="danger"
        /* noDetails: the words come from the refusal's code and details (workersRefusalKey); the agent's own text is not shown */
        attach={
          <SettingGroup variant="field" title={t('workers.acp.title')}>
            {form.acp ? (
              <ClaudeHelpers
                models={claudeModels}
                value={form.model}
                onChange={(model) => onChange({ ...form, model })}
                disabled={disabled}
                effort={base.options && { value: form.effort, onChange: (effort) => onChange({ ...form, effort }), refused: refusedField === 'worker_delegated_effort' }}
              />
            ) : (
              <SettingRow label={t('workers.model')} help={t('workers.acp.off')} />
            )}
          </SettingGroup>
        }
      >
        {refusedIn === 'acp' ? refusal : undefined}
      </Band>
      <Why question={t('workers.why.q')} faq={{ item: byId.models, label: t('model.more') }}>
        {t('workers.why.a')}
      </Why>
    </>
  );
}
