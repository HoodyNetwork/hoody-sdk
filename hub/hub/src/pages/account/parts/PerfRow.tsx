// Performance mode in This browser: the same per-browser switch as the account menu (kit/perf.ts).
import { SettingRow, Switch, useStrings, usePerf } from '@kit';
import perfStrings from '@kit/perf.strings.en.json';

export function PerfRow() {
  const tp = useStrings(perfStrings);
  const perf = usePerf();
  return (
    <SettingRow label={tp('perf.label')} help={tp('perf.help')}>
      {(ids) => <Switch labelledBy={ids.nameId} aria-describedby={ids.helpId} isSelected={perf.on} onChange={perf.set} />}
    </SettingRow>
  );
}
