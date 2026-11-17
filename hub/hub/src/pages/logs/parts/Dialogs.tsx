// The Export dialog (what, format, visitor addresses; progress and the done lines replace the
// body) and the Save-view dialog; both are forms, so both use the kit Dialog.
import { Checkbox, Dialog, OutcomeBanner, RadioGroup, Spinner, TextField, formatNumber } from '@kit';
import { useState } from 'react';
import type { ExportState, Logs, Snapshot, TextLine } from '../controller';
import { isKit } from '../logic';
import type { Format } from '../export';
import s from './Logs.module.css';
import type { T } from './words';

const lineText = (t: T, l: TextLine) => t(l.key as never, l.vars);

export function ExportDialog({ t, snap, logs, isOpen, onClose }: { t: T; snap: Snapshot; logs: Logs; isOpen: boolean; onClose: () => void }) {
  const [format, setFormat] = useState<Format>('txt');
  const [what, setWhat] = useState<'view' | 'all'>('view');
  const [ips, setIps] = useState(false);
  const src = snap.v.source;
  const x: ExportState = snap.exporting;
  const kit = isKit(src);
  const working = x.status === 'working';
  const done = x.status === 'done';
  const close = () => { if (working) logs.cancelExport(); else logs.resetExport(); onClose(); };
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(o) => { if (!o) close(); }}
      title={t('ex.title')}
      primaryLabel={done ? t('act.close') : t('ex.go')}
      busy={working}
      onPrimary={() => { if (done) close(); else logs.startExport({ format, all: what === 'all', ips }); }}
    >
      <div className={s.dialogBody}>
        {x.status === 'idle' || x.status === 'error' ? (
          <>
            {(kit || src === 'changes') && (
              <RadioGroup label={t('ex.what')} value={what} onChange={setWhat} options={[{ value: 'view', label: t('ex.view') }, { value: 'all', label: t('ex.all') }]} />
            )}
            <RadioGroup label={t('ex.format')} value={format} onChange={setFormat} options={[{ value: 'txt', label: t('ex.txt') }, { value: 'jsonl', label: t('ex.jsonl') }]} />
            {kit && <Checkbox label={t('ex.ips')} isSelected={ips} onChange={setIps} />}
            <p className={s.one}>{t(src === 'programs' ? 'ex.sizeProgram' : 'ex.size')}</p>
            {x.status === 'error' && <OutcomeBanner kind="failed" body={t(x.key as never)} />}
          </>
        ) : working ? (
          <Spinner label={t('ex.working', { count: x.rows, n: formatNumber(x.rows) })} />
        ) : (
          <OutcomeBanner kind="done" title={lineText(t, x.lines[0] as TextLine)} body={x.lines.length > 1 ? x.lines.slice(1).map((l) => lineText(t, l)).join(' ') : null} />
        )}
      </div>
    </Dialog>
  );
}

export function SaveViewDialog({ t, logs, isOpen, onClose, onSaved }: { t: T; logs: Logs; isOpen: boolean; onClose: () => void; onSaved: (name: string) => void }) {
  const [name, setName] = useState('');
  const [bad, setBad] = useState<'name' | 'kept' | false>(false);
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(o) => { if (!o) { setName(''); setBad(false); onClose(); } }}
      title={t('v.save')}
      primaryLabel={t('v.saveGo')}
      onPrimary={() => {
        const r = logs.saveView(name);
        if (r !== true) { setBad(r); return; }
        onSaved(name.trim());
        setName('');
        setBad(false);
        onClose();
      }}
    >
      <div className={s.dialogBody}>
        <TextField label={t('v.name')} value={name} onChange={(v) => { setName(v); setBad(false); }} maxLength={40} description={t('v.saveHolds')} errorMessage={bad ? t(bad === 'kept' ? 'v.notKept' : 'v.bad') : undefined} />
      </div>
    </Dialog>
  );
}
