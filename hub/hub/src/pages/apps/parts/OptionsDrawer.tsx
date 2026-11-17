// Options for one app: extra words, settings (name and a hidden value, never saved) and where it opens.
// The confirm is Open. One form (useOptionsForm), two frames: a drawer (OptionsDrawer; `onBack` when it replaces
// the Launch an app drawer's body, since a drawer never opens a second one) and inline (OptionsPanel, the Board
// picker's panel, which already sits in a dialog).
import { Drawer, EnvRows, FormFooter, RadioGroup, Stack, TextField, useStrings } from '@kit';
import { useRef, useState } from 'react';
import { type EnvRow, type Item, type Opens, options } from '../logic';
import strings from '../strings.en.json';
import s from './parts.module.css';

export interface OptionsDrawerProps {
  item: Item;
  onClose: () => void;
  onOpen: (o: { args: string[]; env: Record<string, string>; opensIn: Opens }) => void;
}

export function OptionsDrawer({ item, onClose, onOpen, onBack }: OptionsDrawerProps & { onBack?: () => void }) {
  const t = useStrings(strings);
  const f = useOptionsForm(item, onOpen);
  return (
    <Drawer overlayId="apps-options" resizeKey="apps-options"
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={t('opt.title', { name: item.name })}
      subtitle={t('opt.subtitle')}
      size="md"
      dirty={f.dirty}
      // The back button names the drawer it returns to, Launch an app.
      {...(onBack ? { onBack, backLabel: t('opt.back') } : {})}
      footer={<FormFooter dirty={f.dirty} submitLabel={t('opt.open')} requireDirty={false} onSubmit={f.submit} onCancel={onBack ?? onClose} />}
    >
      {f.fields}
    </Drawer>
  );
}

/** The same form inline, with its own Open and Cancel (Cancel: back to the list it came from). */
export function OptionsPanel({ item, onClose, onOpen }: OptionsDrawerProps) {
  const t = useStrings(strings);
  const f = useOptionsForm(item, onOpen);
  return (
    <Stack gap={4}>
      <h3 className={s.panelTitle}>{t('opt.title', { name: item.name })}</h3>
      {f.fields}
      {/* The closing row: under a rule, so Open and Cancel end the form and are not one more field of it. */}
      <div className={s.panelFoot} data-panel-foot>
        <FormFooter dirty={f.dirty} submitLabel={t('opt.open')} requireDirty={false} onSubmit={f.submit} onCancel={onClose} />
      </div>
    </Stack>
  );
}

function useOptionsForm(item: Item, onOpen: OptionsDrawerProps['onOpen']) {
  const t = useStrings(strings);
  const [argsText, setArgs] = useState('');
  // Each row keeps its own id: removing one never moves another row's hidden value into its place.
  const [env, setEnv] = useState<Array<EnvRow & { id: number }>>([]);
  const nextId = useRef(0);
  // Hidden values need no wipe of their own here: each SecretInput in the kit rows clears its value through onChange when the
  // place's context ends (kit useWipeOn: route change, page hide, realm switch, sign-out), and the names stay
  // (guarded by page.test).
  const [opens, setOpens] = useState<Opens | undefined>(item.opensIn === 'unknown' ? undefined : item.opensIn);
  const [tried, setTried] = useState(false);

  const checked = options(argsText, env);
  const errors = 'errors' in checked ? checked.errors : [];
  const needsOpens = item.opensIn === 'unknown' && !opens;
  const dirty = argsText !== '' || env.length > 0 || (item.opensIn === 'unknown' ? opens !== undefined : opens !== item.opensIn);

  const submit = () => {
    setTried(true);
    if ('errors' in checked || !opens) return;
    onOpen({ args: checked.args, env: checked.env, opensIn: opens });
  };
  const errAt = (field: 'args' | 'env', index: number) => {
    const e = errors.find((x) => x.field === field && x.index === index);
    return e ? t(`opt.${e.key}` as 'opt.argLong') : undefined;
  };
  const whole = (field: 'args' | 'env') => {
    const e = errors.find((x) => x.field === field && x.index === -1);
    return e ? t(`opt.${e.key}` as 'opt.argMany') : undefined;
  };
  const argError = errors.find((x) => x.field === 'args');
  // The rows' one error line, in the danger tone (kit EnvRows): the whole list's first, else the first row's, named by
  // its place.
  const envRowErr = errors.find((x) => x.field === 'env' && x.index >= 0);
  const envError = tried ? (whole('env') ?? (envRowErr ? t('opt.envErrAt', { n: envRowErr.index + 1, why: errAt('env', envRowErr.index) ?? '' }) : undefined)) : undefined;

  const opensField = (
    <RadioGroup<Opens>
      label={t('opt.opens')}
      description={item.opensIn === 'unknown' ? t('opt.opensNeeded') : t('opt.opensHelp')}
      value={opens}
      onChange={setOpens}
      isRequired={item.opensIn === 'unknown'}
      {...(tried && needsOpens ? { errorMessage: t('opt.opensMissing') } : {})}
      options={[
        { value: 'screen', label: t('opt.opensScreen') },
        { value: 'terminal', label: t('opt.opensTerminal') },
        { value: 'web', label: t('opt.opensWeb') },
      ]}
    />
  );
  // Where it opens leads when Hoody can't tell (the one choice the Open needs), else it closes the form.
  const opensFirst = item.opensIn === 'unknown';
  const fields = (
      <Stack gap={5}>
        {opensFirst && opensField}
        <TextField
          label={t('opt.args')}
          description={t('opt.argsHelp')}
          multiline
          rows={4}
          mono
          value={argsText}
          onChange={setArgs}
          {...(tried && (argError || whole('args')) ? { errorMessage: whole('args') ?? errAt('args', argError?.index ?? -1) ?? '' } : {})}
        />
        {/* The secret boundary: a revealed value (and its name) sits inside [data-secret]. The kit rows
            align every name and value (the editor New program and the new computer share). */}
        <div data-secret>
          <EnvRows
            rows={env.map((r) => ({ id: r.id, key: r.name, value: r.value }))}
            // Functional updates: a page hide wipes every value in one batch, each from the latest rows.
            onEdit={(id, c) => setEnv((cur) => cur.map((x) => (x.id === id ? { ...x, ...(c.key !== undefined ? { name: c.key } : {}), ...(c.value !== undefined ? { value: c.value } : {}) } : x)))}
            onRemove={(id) => setEnv((cur) => cur.filter((x) => x.id !== id))}
            onAdd={() => { const id = nextId.current++; setEnv((cur) => [...cur, { id, name: '', value: '' }]); }}
            label={t('opt.env')}
            description={t('opt.envHelp')}
            labels={{
              key: (n) => t('opt.envName.n', { n }),
              value: (n) => t('opt.envValue.n', { n }),
              remove: (n) => t('opt.removeRow', { n }),
              keyHint: t('opt.name'),
              valueHint: t('opt.value'),
              add: t('opt.add'),
            }}
            errorMessage={envError}
          />
        </div>
        {!opensFirst && opensField}
      </Stack>
  );
  return { fields, dirty, submit };
}
