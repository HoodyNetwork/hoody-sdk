// Settings > Voice. A Bot holds no voice setting of its own until the person chooses one: the agent's default voices apply, and "Check it works"
// says whether they do. Choosing the models and voice makes it the Bot's own setting; turning that off takes it away again. The form is the
// page's (the footer saves it with the Bot's other settings); this part reads the models and voices and draws the check's verdict, then the
// fields in three groups (Listening, Speaking, Read aloud).
import { Band, Button, Facts, NumberField, OutcomeBanner, Select, SettingGroup, SettingRow, StatusPill, Switch, TextButton, TextField, Verdict, VerdictMark, useStrings, type Fact, type Option } from '@kit';
import { useMemo, type ReactNode } from 'react';
import { useAudioModels, useVoiceCheck, useVoices, type AudioModel, type BotView, type VoiceCheck, type VoiceStage } from '../data';
import { STT_PROMPT_MAX, audioModelParts, checkSummary, languageOf, stageKind, stageWords, voiceDirty, voiceOffLoss, voiceProblem, type VoiceForm } from '../logic';
import strings from '../strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;
const NONE = '__default';

/** Why a model cannot be picked, in words the person reads beside it. */
function unavailableWords(reason: string, t: T): string {
  const why = stageWords({ message: '', reason, code: '' });
  if (why === '') return t('voice.modelUnavailableBare');
  return (strings as Record<string, string>)[`voice.why.${reason}`] ? why : t('voice.modelUnavailable', { why });
}

/** A model's options, grouped by provider; the model the Bot holds stays in the list even if the agent does not offer it now. */
function modelOptions(models: readonly AudioModel[], current: string, t: T): Option[] {
  const opts: Option[] = [{ value: NONE, label: t('voice.noModel') }];
  const seen = new Set<string>();
  for (const m of models) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const { provider, name } = audioModelParts(m.id);
    // An unavailable model: a known reason is a whole sentence that says so already; an unknown reason's bare words keep the "Not available:" lead; no reason reads "Not available".
    opts.push({ value: m.id, label: name, group: provider || undefined, isDisabled: !m.available, description: m.available ? undefined : unavailableWords(m.reason, t) });
  }
  if (current !== '' && !seen.has(current)) opts.push({ value: current, label: audioModelParts(current).name, group: audioModelParts(current).provider || undefined, description: t('voice.modelNotOffered') });
  return opts;
}

/** One stage of the check as a fact's value: whether it works and on which model. */
function StageValue({ stage }: { stage: VoiceStage }) {
  const t = useStrings(strings);
  const model = audioModelParts(stage.model).name;
  const kind = stageKind(stage);
  return (
    <>
      <StatusPill tone={kind === 'ok' ? 'ok' : kind === 'unknown' ? 'warn' : 'danger'}>{kind === 'ok' ? t('voice.stageOk') : kind === 'unknown' ? t('voice.stageUnknown') : t('voice.stageNo')}</StatusPill>
      {model !== '' && <> {model}</>}
    </>
  );
}

/** The verdict's sentence: what the check found, the part that is wrong marked (not ready). Plain JSX around the mark, so every word is read. */
function checkSentence(t: T, canCheck: boolean, checking: boolean, failed: boolean, summary: ReturnType<typeof checkSummary> | undefined): ReactNode {
  if (!canCheck) return t('voice.saveFirst');
  if (checking) return t('voice.checking');
  if (failed) return t('voice.checkFailed');
  if (summary === 'ready') return t('voice.ready');
  if (summary === 'unknown') return t('voice.unknown');
  if (summary === 'notReady')
    return (
      <>
        {t('voice.notReady.start')} <VerdictMark tone="danger">{t('voice.notReady.mark')}</VerdictMark>
        {t('voice.notReady.end')}
      </>
    );
  return t('voice.unchecked');
}

/**
 * What the check says, as the section's verdict: one sentence, each stage as a fact.
 * With edits not saved the result would describe settings the form no longer shows: it waits, and is back when the edits are
 * put back or saved as they were checked.
 */
function CheckVerdict({ canCheck, checking, failed, result }: { canCheck: boolean; checking: boolean; failed: boolean; result: VoiceCheck | undefined }) {
  const t = useStrings(strings);
  const r = canCheck && !checking && !failed ? result : undefined;
  const summary = r ? checkSummary(r) : undefined;
  // Each stage is a fact; a stage that fails gets its reason as a wide fact under it.
  const stageFacts = (label: string, problem: string, stage: VoiceStage | null | undefined): Fact[] =>
    stage ? [{ label, value: <StageValue stage={stage} /> }, ...(stageKind(stage) === 'failed' ? [{ label: problem, value: stageWords(stage), wide: true }] : [])] : [];
  const stages = [...stageFacts(t('voice.stageListen'), t('voice.problemListen'), r?.stt), ...stageFacts(t('voice.stageSpeak'), t('voice.problemSpeak'), r?.tts)];
  return (
    <div aria-live="polite">
      <Verdict
        label={t('voice.checkLabel')}
        next={summary === 'unknown' ? t('voice.unknownHelp') : undefined}
        facts={stages.length > 0 ? <Facts label={t('voice.checkLabel')} layout="spec" columns={1} items={stages} /> : undefined}
      >
        {checkSentence(t, canCheck, checking, failed, summary)}
      </Verdict>
    </div>
  );
}

export function VoiceSettings({ bot, form, onChange, disabled, refusal }: { bot: BotView; form: VoiceForm; onChange: (f: VoiceForm) => void; disabled: boolean; refusal: string | undefined }) {
  const t = useStrings(strings);
  const stt = useAudioModels(bot.key, 'stt', form.custom);
  const tts = useAudioModels(bot.key, 'tts', form.custom);
  const voices = useVoices(bot.key, form.custom ? form.tts : '');
  const set = (p: Partial<VoiceForm>) => onChange({ ...form, ...p });
  const sttOpts = useMemo(() => modelOptions(stt.models ?? [], form.stt, t), [stt.models, form.stt, t]);
  const ttsOpts = useMemo(() => modelOptions(tts.models ?? [], form.tts, t), [tts.models, form.tts, t]);
  const voiceOpts = useMemo((): Option[] => {
    const opts: Option[] = [{ value: NONE, label: t('voice.firstVoice') }];
    for (const v of voices.voices ?? []) opts.push({ value: v.id, label: v.id });
    if (form.voice !== '' && !(voices.voices ?? []).some((v) => v.id === form.voice)) opts.push({ value: form.voice, label: form.voice, description: t('voice.modelNotOffered') });
    return opts;
  }, [voices.voices, form.voice, t]);
  const problem = voiceProblem(form);
  const lang = languageOf(form.language);
  const modelsFailed = form.custom && (stt.isError || tts.isError);
  // Turned off while the Bot holds its own settings: a save sends none (speech null), so say what else goes with them.
  const loss = form.custom ? null : voiceOffLoss(bot.speech.config);
  const canCheck = !voiceDirty(form, bot.speech.config);
  const check = useVoiceCheck(bot.key, bot.speech.config);
  const cantTell = canCheck && !check.checking && !check.failed && check.result !== undefined && checkSummary(check.result) === 'unknown';

  return (
    <>
      <CheckVerdict canCheck={canCheck} checking={check.checking} failed={check.failed} result={check.result} />
      <SettingGroup label={t('voice.title')}>
        <SettingRow
          label={t('voice.runLabel')}
          actions={
            <>
              {cantTell && <TextButton onPress={check.run}>{t('voice.checkAgain')}</TextButton>}
              <Button variant="secondary" onPress={check.run} busy={check.checking} isDisabled={!canCheck}>
                {t('voice.check')}
              </Button>
            </>
          }
        />
        <SettingRow label={t('voice.custom')} help={form.custom ? t('voice.customOn') : t('voice.customOff')}>
          {(ids) => (
            <Band
              tone="warn"
              /* noDetails: a warning about what a save would remove, not a rejection */
              attach={<Switch labelledBy={ids.nameId} aria-describedby={ids.helpId} isSelected={form.custom} onChange={(on) => set({ custom: on })} isDisabled={disabled} />}
            >
              {loss ? (
                <>
                  {t(loss.prompt && loss.limits ? 'voice.offLoses.both' : loss.prompt ? 'voice.offLoses.prompt' : 'voice.offLoses.limits')}
                  {loss.speechOff && <> {t('voice.offLoses.speech')}</>}
                  {loss.listenOff && <> {t('voice.offLoses.listen')}</>}
                </>
              ) : undefined}
            </Band>
          )}
        </SettingRow>
      </SettingGroup>
      {refusal && <OutcomeBanner kind="failed" /* noDetails: the words come from the refusal's code and details (voiceRefusalKey); the agent's own text is not shown */ title={refusal} body={null} />}
      {form.custom && (
        <>
          {modelsFailed && (
            <Band
              tone="danger"
              size="table"
              /* noDetails: the model reads are queries; the words say they could not be loaded and offer Try again */
              actions={
                <TextButton
                  onPress={() => {
                    void stt.refetch();
                    void tts.refetch();
                  }}
                >
                  {t('voice.tryAgain')}
                </TextButton>
              }
            >
              {t('voice.modelsFailed')}
            </Band>
          )}
          <SettingGroup variant="field" title={t('voice.stageListen')}>
            <SettingRow label={t('voice.listenModel')} help={t('voice.listenHelp')}>
              {(ids) => (
                <Select aria-label={t('voice.listenModel')} aria-describedby={ids.helpId} options={sttOpts} value={form.stt === '' ? NONE : form.stt} onChange={(v) => set({ stt: v === NONE ? '' : v })} isDisabled={disabled || stt.models === undefined} placeholder={t('voice.loading')} />
              )}
            </SettingRow>
            {form.stt !== '' && (
              <SettingRow label={t('voice.prompt')} help={t('voice.promptHelp')}>
                {(ids) => (
                  <TextField
                    aria-label={t('voice.prompt')}
                    aria-describedby={ids.helpId}
                    multiline
                    rows={2}
                    value={form.sttPrompt}
                    onChange={(v) => set({ sttPrompt: v })}
                    isDisabled={disabled}
                    errorMessage={problem === 'prompt' ? t('voice.promptBad', { max: String(STT_PROMPT_MAX) }) : undefined}
                  />
                )}
              </SettingRow>
            )}
            <SettingRow label={t('voice.language')} help={t('voice.languageHelp')}>
              {(ids) => (
                <TextField
                  aria-label={t('voice.language')}
                  aria-describedby={ids.helpId}
                  value={form.language}
                  onChange={(v) => set({ language: v })}
                  isDisabled={disabled}
                  errorMessage={problem === 'language' && lang !== '' ? t('voice.languageBad') : undefined}
                />
              )}
            </SettingRow>
          </SettingGroup>
          <SettingGroup variant="field" title={t('voice.stageSpeak')}>
            <SettingRow label={t('voice.speakModel')} help={t('voice.speakHelp')}>
              {(ids) => (
                <Select aria-label={t('voice.speakModel')} aria-describedby={ids.helpId} options={ttsOpts} value={form.tts === '' ? NONE : form.tts} onChange={(v) => set({ tts: v === NONE ? '' : v, voice: '', speed: null })} isDisabled={disabled || tts.models === undefined} placeholder={t('voice.loading')} />
              )}
            </SettingRow>
            {form.tts !== '' &&
              (voices.voices !== undefined && voices.voices.length === 0 ? (
                <SettingRow label={t('voice.voice')} help={t('voice.voiceFreeHelp')}>
                  {(ids) => <TextField aria-label={t('voice.voice')} aria-describedby={ids.helpId} value={form.voice} onChange={(v) => set({ voice: v })} isDisabled={disabled} />}
                </SettingRow>
              ) : (
                <SettingRow label={t('voice.voice')}>
                  <Select aria-label={t('voice.voice')} options={voiceOpts} value={form.voice === '' ? NONE : form.voice} onChange={(v) => set({ voice: v === NONE ? '' : v })} isDisabled={disabled || voices.voices === undefined} placeholder={voices.isError ? t('voice.voicesFailed') : t('voice.loading')} />
                </SettingRow>
              ))}
            {form.tts !== '' && (
              <SettingRow label={t('voice.speed')} help={t('voice.speedHelp')}>
                {(ids) => (
                  <NumberField
                    aria-label={t('voice.speed')}
                    aria-describedby={ids.helpId}
                    value={form.speed ?? Number.NaN}
                    onChange={(v) => set({ speed: Number.isFinite(v) ? v : null })}
                    minValue={0}
                    step={0.1}
                    placeholder={t('voice.speedDefault')}
                    isDisabled={disabled}
                    errorMessage={problem === 'speed' ? t('voice.speedBad') : undefined}
                  />
                )}
              </SettingRow>
            )}
          </SettingGroup>
          <SettingGroup title={t('voice.readAloud')}>
            <SettingRow label={t('voice.speakWakes')} help={t('voice.speakWakesHelp')}>
              {(ids) => <Switch labelledBy={ids.nameId} aria-describedby={ids.helpId} isSelected={form.speakWakes} onChange={(v) => set({ speakWakes: v })} isDisabled={disabled} />}
            </SettingRow>
            <SettingRow label={t('voice.speakGates')} help={t('voice.speakGatesHelp')}>
              {(ids) => <Switch labelledBy={ids.nameId} aria-describedby={ids.helpId} isSelected={form.speakGates} onChange={(v) => set({ speakGates: v })} isDisabled={disabled} />}
            </SettingRow>
          </SettingGroup>
        </>
      )}
    </>
  );
}
