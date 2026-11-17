// Settings > Helpers, what each kind of helper runs on, every option shown. The Bot's own model is never passed to a helper (the
// agent's own rule):
// a Hoody-model helper runs on the tier Routing picks, else the model its agent names, else the AI helper's model, else Hoody Free;
// a Claude Code helper runs on the model picked here, else this computer's Claude Code default. The fields are the page's Helpers form
// (the footer saves them with the rest of the section); nothing here sends anything. Every part draws kit setting rows, for the
// SettingGroup its caller puts around them.
import { providers } from '@core';
import type { ReactNode } from 'react';
import { Band, Combobox, PickerPanel, SegmentedControl, Select, SettingRow, Switch, TextButton, followPageLink, useGo, usePageLink, useStrings, type Option, type PickerItem } from '@kit';
import { ROUTE_THINKING, specLabel, WORKER_EFFORTS, type HelperAgents, type ModelRow, type RouteThinking, type WorkerEffort } from '../data';
import type { RoutingForm } from '../logic';
import strings from '../strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;

/** A model's name as this page lists it: its row's label, else the spec without its provider. */
const nameOf = (models: readonly ModelRow[], spec: string): string => models.find((m) => m.spec === spec)?.label || specLabel(spec);

/**
 * The models a tier may run on: the computer's own models, never an ensemble (the agent refuses those), the held one kept
 * when unlisted. A row listed only because another field holds it (heldOnly) is not offered here.
 */
function tierOptions(models: readonly ModelRow[], held: string): Option[] {
  const rows = models.filter((m) => m.source !== 'fusion' && !m.spec.startsWith('fusion/') && (!m.heldOnly || m.spec === held));
  const out: Option[] = rows.map((m) => ({ value: m.spec, label: m.label || specLabel(m.spec), group: m.providerLabel || m.provider }));
  if (held && !out.some((o) => o.value === held)) out.unshift({ value: held, label: nameOf(models, held) });
  return out;
}

interface TierProps {
  tier: 'light' | 'heavy';
  form: RoutingForm;
  onChange: (f: RoutingForm) => void;
  models: readonly ModelRow[];
  disabled: boolean;
  /** The field a refused save named, or the reason the form cannot be sent. */
  problem: { tier: 'light' | 'heavy' | null; field: 'model' | 'thinking' | 'mode' | 'fusion' } | undefined;
  t: T;
}

function Tier({ tier, form, onChange, models, disabled, problem, t }: TierProps) {
  const v = form[tier];
  const row = models.find((m) => m.spec === v.model);
  // Thinking is offered for a model the catalogue marks as reasoning; a setting already held stays editable so it can be taken away. The catalogue does not say which
  // levels each model takes, so the list is the agent's whole vocabulary and a level the model refuses comes back as the field's own refusal (routing.<tier>.thinking).
  const thinking = row?.reasoning === true || v.thinking !== '';
  const mine = problem?.tier === tier ? problem.field : undefined;
  const modelError = mine === 'model' ? (v.model.trim() === '' ? t('routing.pickModel') : t('routing.refused.model')) : mine === 'fusion' ? t('routing.noFusion') : undefined;
  return (
    <>
      <SettingRow label={t(`routing.${tier}`)}>
        <Combobox
          aria-label={t(`routing.${tier}`)}
          options={tierOptions(models, v.model)}
          value={v.model || undefined}
          placeholder={t('routing.choose')}
          emptyText={t('routing.noModels')}
          isDisabled={disabled}
          errorMessage={modelError}
          // A new model starts on its own default thinking: a level the old model took may be one the new one refuses (as the AI page's effort).
          onChange={(model) => onChange({ ...form, [tier]: { model, thinking: model === v.model ? v.thinking : '' } })}
        />
      </SettingRow>
      {thinking && (
        <SettingRow label={t(`routing.${tier}.thinking`)}>
          <Select<RouteThinking>
            aria-label={t(`routing.${tier}.thinking`)}
            options={ROUTE_THINKING.map((x) => ({ value: x, label: t(x === '' ? 'routing.thinking.default' : `routing.thinking.${x}`) }))}
            value={v.thinking}
            isDisabled={disabled}
            errorMessage={mine === 'thinking' ? t('routing.refused.thinking') : undefined}
            onChange={(th) => onChange({ ...form, [tier]: { ...v, thinking: th } })}
          />
        </SettingRow>
      )}
    </>
  );
}

/** The Combobox value of "the agent's own choice" (a model spec always holds a '/', so it never collides). */
const OWN_MODEL = 'own';

interface PickProps {
  models: readonly ModelRow[];
  model: string;
  thinking: RouteThinking;
  onChange: (v: { model: string; thinking: RouteThinking }) => void;
  disabled: boolean;
  /** The field a refused save named. */
  refused: 'model' | 'thinking' | undefined;
}

/**
 * The model new Hoody-model helpers start on when no Routing tier applies, and its thinking ('' = the agent's own choice: the model the
 * helper's agent names, else the AI helper's model). A model that thinks offers its thinking; a held thinking stays editable.
 */
export function HelperModelPick({ models, model, thinking, onChange, disabled, refused }: PickProps) {
  const t = useStrings(strings);
  const row = models.find((m) => m.spec === model);
  const thinks = model !== '' && (row?.reasoning === true || thinking !== '');
  return (
    <>
      <SettingRow label={t('workers.hModel')} help={t('workers.hModel.help')}>
        {(ids) => (
          <Combobox
            aria-label={t('workers.hModel')}
            aria-describedby={ids.helpId}
            // The first option is the agent's own choice (no model sent): picking it takes a held model away.
            options={[{ value: OWN_MODEL, label: t('workers.hModel.own') }, ...tierOptions(models, model)]}
            value={model || OWN_MODEL}
            emptyText={t('routing.noModels')}
            isDisabled={disabled}
            errorMessage={refused === 'model' ? t('workers.refused.hModel') : undefined}
            // A new model starts on its own default thinking, as a Routing tier does.
            onChange={(v) => {
              const m = v === OWN_MODEL ? '' : v;
              onChange({ model: m, thinking: m === model ? thinking : '' });
            }}
          />
        )}
      </SettingRow>
      {thinks && (
        <SettingRow label={t('workers.hThinking')}>
          <Select<RouteThinking>
            aria-label={t('workers.hThinking')}
            options={ROUTE_THINKING.map((x) => ({ value: x, label: t(x === '' ? 'routing.thinking.default' : `routing.thinking.${x}`) }))}
            value={thinking}
            isDisabled={disabled}
            errorMessage={refused === 'thinking' ? t('workers.refused.worker_thinking') : undefined}
            onChange={(th) => onChange({ model, thinking: th })}
          />
        </SettingRow>
      )}
    </>
  );
}

interface HoodyProps {
  /** The helper model and thinking rows, drawn under the words on what helpers run on (absent when the agent does not take them). */
  pick?: ReactNode;
  /** A helper model is picked: the words say it, not the AI helper's model. */
  modelPicked?: boolean;
  /** The realm's agents; undefined while unread, null after a failed read (no model is named then, never a guess). */
  agents: HelperAgents | null | undefined;
  models: readonly ModelRow[];
  routing: RoutingForm;
  onRouting: (f: RoutingForm) => void;
  routingProblem: TierProps['problem'];
  anyAgent: boolean;
  onAnyAgent: (v: boolean) => void;
  picked: readonly string[];
  onPicked: (ids: string[]) => void;
  disabled: boolean;
  /** Routing is drawn by the caller (RoutingSettings, in its own section) and not here. */
  routingElsewhere?: boolean;
}

/** Routing: how a Hoody-model helper's model is chosen (the mode, whose help says what the chosen mode does, and the light and heavy tiers). */
export function RoutingSettings({ routing, onRouting, routingProblem, models, disabled }: Pick<HoodyProps, 'routing' | 'onRouting' | 'routingProblem' | 'models' | 'disabled'>) {
  const t = useStrings(strings);
  return (
    <>
      <SettingRow label={t('routing.mode')} help={t(`routing.mode.${routing.mode}.help`)}>
        {(ids) => (
          <Band
            tone="danger"
            /* noDetails: the words come from the refusal's code and details (routingRefusal); the agent's own text is not shown */
            attach={
              <SegmentedControl<RoutingForm['mode']>
                label={t('routing.mode')}
                aria-describedby={ids.helpId}
                isDisabled={disabled}
                value={routing.mode}
                onChange={(mode) => onRouting({ ...routing, mode })}
                items={(['off', 'suggest', 'auto'] as const).map((m) => ({ id: m, label: t(`routing.mode.${m}`) }))}
              />
            }
          >
            {routingProblem?.field === 'mode' ? t('routing.refused.mode') : undefined}
          </Band>
        )}
      </SettingRow>
      {routing.mode !== 'off' && (
        <>
          <Tier tier="light" form={routing} onChange={onRouting} models={models} disabled={disabled} problem={routingProblem} t={t} />
          <Tier tier="heavy" form={routing} onChange={onRouting} models={models} disabled={disabled} problem={routingProblem} t={t} />
        </>
      )}
    </>
  );
}

/** Hoody-model helpers: what they run on now (one line; the section's Why has the rest), Routing (unless the caller draws it), and the agents a task may name. */
export function HoodyHelpers({ pick, modelPicked, agents, models, routing, onRouting, routingProblem, anyAgent, onAnyAgent, picked, onPicked, disabled, routingElsewhere }: HoodyProps) {
  const t = useStrings(strings);
  const go = useGo();
  const aiLink = usePageLink('ai');
  const helperModel = agents ? nameOf(models, agents.helperModel || providers.FREE) : null;
  // Every agent the realm lists, then any ticked one it no longer lists (a tick never vanishes from under the person).
  const agentItems: PickerItem[] = [
    ...(agents?.agents ?? []).map((a) => ({ id: a.name, label: a.name, description: a.model ? nameOf(models, a.model) : t('agents.helperModel') })),
    ...picked.filter((id) => !agents?.agents.some((a) => a.name === id)).map((id) => ({ id, label: id })),
  ];
  // What the list cannot show and what the form cannot send: a warn band attached to the list (it describes the list).
  const listNote = agents === null ? (picked.length === 0 ? `${t('agents.readFailed')} ${t('agents.pickOne')}` : t('agents.readFailed')) : picked.length === 0 ? t('agents.pickOne') : undefined;
  return (
    <>
      <SettingRow
        label={t('workers.llm.runOnLabel')}
        help={modelPicked ? t('workers.llm.runOnPicked') : helperModel !== null ? t('workers.llm.runOn', { model: helperModel }) : t('workers.llm.runOnUnknown')}
        actions={aiLink ? <TextButton onPress={() => followPageLink(aiLink, go)}>{t('workers.llm.aiLink')}</TextButton> : undefined}
      />
      {pick}
      {!routingElsewhere && <RoutingSettings routing={routing} onRouting={onRouting} routingProblem={routingProblem} models={models} disabled={disabled} />}
      <SettingRow label={t('agents.any')} help={t('agents.anyHelp')}>
        {(ids) => <Switch labelledBy={ids.nameId} aria-describedby={ids.helpId} isSelected={anyAgent} onChange={onAnyAgent} isDisabled={disabled} />}
      </SettingRow>
      {!anyAgent && (
        <SettingRow label={t('agents.label')}>
          <Band tone="warn" /* noDetails: a read that failed or a pick the form cannot send, not a rejection */ attach={<PickerPanel label={t('agents.label')} mode="multi" items={agentItems} value={[...picked]} onChange={onPicked} emptyText={t('agents.none')} isDisabled={disabled} />}>
            {listNote}
          </Band>
        </SettingRow>
      )}
    </>
  );
}

interface ClaudeProps {
  /** Claude Code's models on the Bot's computer; undefined while unread, null after a failed read. */
  models: ReadonlyArray<{ id: string; label: string }> | null | undefined;
  value: string;
  onChange: (model: string) => void;
  disabled: boolean;
  /** The helpers' effort and its change; absent when the agent does not take one (the words say where it comes from then). */
  effort?: { value: WorkerEffort; onChange: (e: WorkerEffort) => void; refused: boolean };
}

/** Claude Code helpers: the model they start on ('' is this computer's Claude Code default), and where their effort comes from. */
export function ClaudeHelpers({ models, value, onChange, disabled, effort }: ClaudeProps) {
  const t = useStrings(strings);
  const options: Option[] = [{ value: '', label: t('workers.model.own') }, ...(models ?? []).map((m) => ({ value: m.id, label: m.label }))];
  if (value && !options.some((o) => o.value === value)) options.push({ value, label: value });
  return (
    <>
      <SettingRow label={t('workers.model')} help={t('workers.model.help')}>
        {(ids) => (
          <Band
            tone="warn"
            /* noDetails: the model list is a read that failed, not a rejection; the words say what is kept */
            attach={<Select aria-label={t('workers.model')} aria-describedby={ids.helpId} options={options} value={value} isDisabled={disabled} onChange={onChange} />}
          >
            {models === null ? t('workers.model.read') : undefined}
          </Band>
        )}
      </SettingRow>
      {effort ? (
        <SettingRow label={t('workers.effortPick')} help={t('workers.effortPick.help')}>
          {(ids) => (
            <Select<WorkerEffort>
              aria-label={t('workers.effortPick')}
              aria-describedby={ids.helpId}
              options={WORKER_EFFORTS.map((e) => ({ value: e, label: t(e === '' ? 'workers.effort.own' : `routing.thinking.${e}`) }))}
              value={effort.value}
              isDisabled={disabled}
              errorMessage={effort.refused ? t('workers.refused.worker_delegated_effort') : undefined}
              onChange={effort.onChange}
            />
          )}
        </SettingRow>
      ) : (
        <SettingRow label={t('workers.effortPick')} help={t('workers.effort')} />
      )}
    </>
  );
}
