// The Logs tab of one VM: the last lines of one of its logs, and a line typed at its console.
//
// - The log is read when the tab opens, when another log is picked (?log=) and on Refresh; never on a timer. Its text is
//   the VM's own: shown as plain text only (logs.ts cleans and bounds it), never as page words or instructions.
// - No log yet (the VM never ran, or that helper did not) is a note, not a failure.
// - The console line is sent once. A line whose answer is not known is held (one per VM, apart from the VM's power
//   changes): Check again reads the console, Stop tracking frees it; the page never sends it again on its own.
import { isFramed, useChangesVersion } from '@core';
import { AnatomySection, CodeBlock, HeldBand, Outcome, SegmentedControl, TextField, useSearchParam, useStrings, type SectionState } from '@kit';
import { useMemo, useState } from 'react';
import { useHost } from '../data';
import type { VmReady } from '../logic';
import { dismissLine, heldInput, readConsole, lineBytes, lineHeldReason, lineProblem, lineRefusal, logSources, sendBlock, useConsoleLine, useVmLog, LOG_TAIL, type LogSource } from '../logs';
import { CONSOLE_WRITE_MAX_BYTES } from '../routes';
import strings from '../strings.en.json';
import { isVmUnsure, useVmUnsure } from './unsure';

export function Logs({ vm }: { vm: VmReady }) {
  const t = useStrings(strings);
  const host = useHost();
  const sources = logSources(vm.spec);
  const [asked] = useSearchParam('log');
  const source: LogSource = (sources as readonly string[]).includes(String(asked ?? '')) ? (asked as LogSource) : sources[0]!;
  const log = useVmLog({ name: vm.name, vmId: vm.vmId, source }, host.state.kind === 'ready');

  const line = useConsoleLine();
  useChangesVersion();
  const held = heldInput(host.target, vm.vmId);
  const [text, setText] = useState('');
  const [checked, setChecked] = useState(false);
  const block = sendBlock(vm, isFramed());
  // The line goes by the VM's name: while the reads disagree on which VM holds it, nothing is sent (parts/unsure.ts).
  const unsure = useVmUnsure(vm.name);
  const problem = lineProblem(text);
  const why = block ? t(`logs.send.${block}`) : unsure ? t('power.why.unread') : held ? t(held.what === 'line' ? 'logs.send.held' : 'logs.send.heldKeys') : problem === 'empty' ? t('logs.send.empty') : undefined;
  const send = async () => {
    if (block || held || problem || line.running || !host.target || !vm.vmId) return;
    setChecked(false);
    if (isVmUnsure(vm.name)) return;
    const r = await line.run({ target: host.target, name: vm.name, vmId: vm.vmId, text });
    if (r.outcome === 'done') {
      setText('');
      if (source === 'console') log.refresh();
    }
  };

  // The read: the first one, a failed one, or the log (none yet is a note on a ready section).
  const state: SectionState = log.loading
    ? { kind: 'loading', rows: 6 }
    : log.failed
      ? { kind: 'failed', error: log.error, onRetry: log.refresh, busy: log.fetching }
      : { kind: 'ready' };
  const shown = log.log;
  const note = log.none ? t('logs.none') : shown && shown.lines.length === 0 ? t('logs.empty') : shown?.cut ? t('logs.cut', { count: LOG_TAIL }) : undefined;
  const items = useMemo(() => sources.map((s) => ({ id: s, label: t(`logs.src.${s}`) })), [sources.join(','), t]); // eslint-disable-line react-hooks/exhaustive-deps
  const reason = line.outcome === 'pending' ? lineHeldReason(line.error) : null;

  return (
    <AnatomySection
      id="vm-logs"
      title={t('logs.title')}
      state={state}
      note={note}
      actions={{ secondary: [{ id: 'logs-refresh', label: t('logs.refresh'), icon: 'reload', onPress: log.refresh, busy: log.fetching }] }}
      notices={
        held ? (
          <HeldBand
            overlayId="vms-logs-held-dismiss"
            text={held.what === 'keys' ? t('logs.heldKeys', { vm: vm.name }) : reason ? `${t('logs.held', { vm: vm.name })} ${t(reason)}` : t('logs.held', { vm: vm.name })}
            readOnly={!held.own}
            elsewhere={null}
            note={checked ? t('logs.held.checked') : undefined}
            dismissBody={t('logs.held.dismissBody')}
            onCheck={async () => { setChecked(false); setChecked(await readConsole({ name: vm.name, vmId: vm.vmId })); }}
            onDismiss={() => dismissLine(held)}
          />
        ) : line.outcome === 'done' ? (
          <Outcome outcome={{ kind: 'done' }} doneText={t('logs.send.done')} />
        ) : line.outcome === 'failed' || line.outcome === 'not_sent' || line.outcome === 'stale' ? (
          <Outcome outcome={{ kind: line.outcome }} detail={line.outcome === 'failed' ? t(lineRefusal(line.error)) : undefined} error={line.error} />
        ) : null
      }
    >
      <SegmentedControl label={t('logs.source')} param="log" value={source} items={items} />
      {shown && shown.lines.length > 0 ? (
        <CodeBlock
          label={t('logs.label', { source: t(`logs.src.${source}`), vm: vm.name })}
          code={shown.lines.join('\n')}
          wrap
          maxHeight="md"
          lang="plain" // reason: text the VM wrote, shown as plain text; colouring could make it read as something else
        />
      ) : null}
      {source === 'console' ? (
        <TextField
          label={t('logs.send.label')}
          description={t('logs.send.help')}
          value={text}
          onChange={setText}
          mono
          errorMessage={problem === 'tooLong' ? t('logs.send.tooLong', { max: CONSOLE_WRITE_MAX_BYTES, n: lineBytes(text) }) : undefined}
          isDisabled={block === 'framed' || block === 'noInput'}
          onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
          action={{ id: 'logs-send', label: t('logs.send.go'), onPress: () => void send(), busy: line.running, ...(why ? { disabledReason: why } : {}) }}
        />
      ) : null}
    </AnatomySection>
  );
}
