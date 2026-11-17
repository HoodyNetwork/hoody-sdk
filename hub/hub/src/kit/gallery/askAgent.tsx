// Ask the Agent (kit/widgets/AskAgent) in the gallery (/_kit?tab=pieces): the head action withAskAgent puts in a
// section head and the drawer it opens (AskAgentDrawer), the same ask turned off with its reason, and the step a host
// drawer shows in place of its body (AskAgentButton in the drawer header, AskAgentPanel as the body). kit3.tsx mounts it.
// "Use with your agent" (kit/widgets/AgentHint) sits beside them: its drawer for a REMOTE agent, filled for atlas.
// The gallery asks nothing: Explain answers that the details could not be read (send(null)), and Tell is off with its
// reason, so no press here opens the Ask dock or starts a conversation.
import { useState } from 'react';
import { Button } from '../controls/Button';
import { TextField } from '../forms/fields';
import { AnatomySection } from '../layouts/anatomy/Section';
import { Drawer } from '../overlays/Drawer';
import { useStrings } from '../strings';
import { AgentHint } from '../widgets/AgentHint';
import { AskAgentButton, AskAgentDrawer, AskAgentPanel, useAskAgent, withAskAgent, type AgentQuestion, type UseAskAgentOptions } from '../widgets/AskAgent';
import strings from './askAgent.strings.en.json';

// A sample computer name (gallery only), not translated text.
const SAMPLE_NAME = 'atlas';
// The fixture world's realm Personal and computer atlas, as a page passes them to "Use with your agent" (sample ids).
const SAMPLE_REALM = { id: 'f1f1f1f1f1f1f1f1f1f1f1f1', name: 'Personal' };
const SAMPLE_FACTS = { realm: SAMPLE_REALM, computer: { computer: { id: 'c0a7150000000000000000a1', name: SAMPLE_NAME }, realm: SAMPLE_REALM } };

export function AskAgentPieces() {
  const t = useStrings(strings);
  const [hostOpen, setHostOpen] = useState(false);
  const [name, setName] = useState(SAMPLE_NAME);
  const base: Omit<UseAskAgentOptions, 'askKey'> = {
    subject: t('subject'),
    source: t('source'),
    explain: { run: (send: (q: AgentQuestion | null) => void) => send(null) },
    tell: { label: t('tell'), disabledReason: t('tellOff'), check: () => null },
    reads: t('reads'),
  };
  // The own drawer shows the whole first frame: the request in plain words and what the Agent reads, part by part.
  const own = useAskAgent({
    ...base,
    askKey: 'gallery:ask-agent:drawer',
    request: { title: t('reqTitle'), summary: t('reqSummary'), text: t('reqText') },
    reads: [{ id: 'facts', title: t('partFacts'), text: t('reads') }, { id: 'more', title: t('partMore'), note: t('partMoreNote') }],
    readsNote: t('readsNote'),
  });
  const off = useAskAgent({ ...base, askKey: 'gallery:ask-agent:off', disabledReason: t('offWhy') });
  const step = useAskAgent({ ...base, askKey: 'gallery:ask-agent:step', mode: 'step' });
  const closeHost = () => {
    step.close();
    setHostOpen(false);
  };
  return (
    <>
      <AnatomySection id="ask-agent" title={t('title')} description={t('desc')} actions={withAskAgent({}, own.action)} />
      <AnatomySection id="ask-agent-off" title={t('offTitle')} description={t('offDesc')} actions={withAskAgent({}, off.action)} />
      <AnatomySection
        id="ask-agent-step"
        title={t('stepTitle')}
        description={t('stepDesc')}
        actions={{ secondary: [{ id: 'open-host', label: t('openHost'), icon: 'panel-right', opens: 'dialog', onPress: () => setHostOpen(true) }] }}
      />
      <AnatomySection id="agent-hint" title={t('hintTitle')} description={t('hintDesc')}>
        <AgentHint page="scripts" facts={SAMPLE_FACTS} />
      </AnatomySection>
      <AskAgentDrawer ask={own} />
      <AskAgentDrawer ask={off} />
      <Drawer
        resizeKey="gallery-ask-agent-host"
        overlayId="gallery-ask-agent-host"
        isOpen={hostOpen}
        onOpenChange={(o) => { if (!o) closeHost(); }}
        title={step.isOpen ? step.title : t('hostTitle')}
        size="sm"
        {...(step.isOpen ? { onBack: step.close, backLabel: t('back') } : { actions: <AskAgentButton ask={step} /> })}
        {...(step.isOpen ? { cancel: t('close') } : { primary: <Button variant="primary" onPress={closeHost}>{t('save')}</Button> })}
      >
        <AskAgentPanel ask={step} />
        {step.isOpen ? null : <TextField label={t('name')} value={name} onChange={setName} description={t('nameHelp')} />}
      </Drawer>
    </>
  );
}
