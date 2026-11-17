// The chat's approval mode in the gallery (/_kit?tab=pieces, alone with &part=approval; &am=confirm opens the confirm, so a
// shot frames it without clicks): the composer chip (kit/agent/ApprovalMode) in every state the approvals read can give, a
// working sample whose menu changes a local read at once, and the Allow everything confirm (AllowEverythingConfirm) the
// host draws beside the view. Nothing is sent anywhere: save and the host's switch only change the sample's own read.
import type { agent } from '@core';
import { useEffect, useMemo, useState } from 'react';
import { AllowEverythingConfirm, ApprovalMode, type ApprovalModeProps } from '../agent/ApprovalMode';
import type { ApprovalData } from '../agent/useApproval';
import { AnatomySection } from '../layouts/anatomy/Section';
import { Row } from '../layouts/Stack';
import { useSearchParam } from '../nav';
import { useStrings } from '../strings';
import strings from './approvalMode.strings.en.json';

const READ: agent.Approval = { mode: 'default', strict: false, revision: 3, yolo: false };
const noop = () => undefined;
const data = (key: string, o: Partial<ApprovalData>): ApprovalData => ({
  phase: 'done', approval: READ, error: null, change: null, running: false, key, ops: 0, reads: 0,
  active: () => false, retry: noop, save: noop, check: async () => true, ...o,
});
// One chip per state: Ask every time, Ask when needed, Allow everything, set by the computer, unread, still reading.
const STATES: readonly ApprovalData[] = [
  data('gallery:am:always', { approval: { ...READ, mode: 'always', strict: true } }),
  data('gallery:am:default', {}),
  data('gallery:am:everything', { approval: { ...READ, yolo: true } }),
  data('gallery:am:locked', { approval: { ...READ, mode: 'locked' } }),
  data('gallery:am:unknown', { approval: null, phase: 'failed' }),
  data('gallery:am:reading', { approval: null, phase: 'loading' }),
];
const LIVE_KEY = 'gallery:am:live';

export function ApprovalModePieces() {
  const t = useStrings(strings);
  const [am] = useSearchParam('am');
  const [read, setRead] = useState<agent.Approval>(READ);
  const [askFor, setAskFor] = useState<string | null>(null);
  useEffect(() => { if (am === 'confirm') setAskFor(LIVE_KEY); }, [am]);
  const live = useMemo(() => data(LIVE_KEY, {
    approval: read,
    save: (c: agent.ApprovalChange) => { if (c.field === 'mode') setRead((r) => ({ ...r, mode: c.value, strict: c.value === 'always' })); },
  }), [read]);
  // The host's switch of Allow everything: the sample's read shows it at once.
  const setYolo = (want: boolean) => { setRead((r) => ({ ...r, yolo: want })); return true; };
  const still: Pick<ApprovalModeProps, 'busy' | 'setAskFor' | 'onSent'> = { busy: false, setAskFor: noop, onSent: noop };
  return (
    <>
      <AnatomySection id="approval-mode" title={t('chipTitle')} description={t('chipDesc')} state={{ kind: 'ready' }}>
        <Row gap={3} wrap>
          {STATES.map((d) => <ApprovalMode key={d.key} data={d} setYolo={() => false} {...still} />)}
        </Row>
      </AnatomySection>
      <AnatomySection
        id="approval-mode-live"
        title={t('liveTitle')}
        description={t('liveDesc')}
        state={{ kind: 'ready' }}
        actions={{ secondary: [{ id: 'open-confirm', label: t('openConfirm'), opens: 'dialog', onPress: () => setAskFor(LIVE_KEY) }] }}
      >
        <Row gap={3} wrap>
          <ApprovalMode data={live} setYolo={setYolo} busy={false} setAskFor={setAskFor} onSent={noop} />
        </Row>
      </AnatomySection>
      <AllowEverythingConfirm data={live} setYolo={setYolo} computer={t('computer')} askFor={askFor} setAskFor={setAskFor} onSent={noop} />
    </>
  );
}
