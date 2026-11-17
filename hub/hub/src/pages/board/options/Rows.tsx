// The field rows of the Options panel: label 160 | control (max 360) | reset ↺,
// one help line under it. One control per catalogue type; every value change goes to the draft only.
import { hasKey } from './Rows.pure';
export { hasKey, useT } from './Rows.pure';
export type { TT } from './Rows.pure';
import type { TT } from './Rows.pure';
import { Button, Checkbox, CodeEditor, ColorPicker, Disclosure, normalizeHexColor, NumberField, RadioGroup, SegmentedControl, Select, SettingGroup, SettingRow, Switch, TextButton, TextField, useIsPhone } from '@kit';
import { Fragment, useId, useState, type ReactNode } from 'react';
import type { EmbedValue } from '../embed/build';
import type { CatParam, CatView, Scalar } from '../embed/catalog';
import { applyQuality, mbitToBits, QUALITY_IDS, partShown, partsOf, partsParams, qualityOf, type Draft, type FieldError, type Part, type Quality } from './draft';
import type { Choice, Row } from './model';
import { TERM_FONTS, TERM_THEMES, fontPreset, themePreset, type TermTheme } from './themes';
import s from './options.module.css';
/** A colour option's swatches: the terminal themes' backgrounds, once each. */
const THEME_BACKGROUNDS: readonly string[] = [...new Set(Object.values(TERM_THEMES).map((th) => normalizeHexColor(th.background) ?? th.background))];
/** What a colour option takes besides a hex colour (the catalogue's backgroundColor): #RGBA, #RRGGBBAA or a CSS
 *  colour name (checked by the browser where it can). */
const cssColourText = (v: string): boolean =>
  /^#(?:[0-9a-f]{4}|[0-9a-f]{8})$/i.test(v) || (/^[a-z]{3,30}$/i.test(v) && (typeof CSS === 'undefined' || typeof CSS.supports !== 'function' || CSS.supports('color', v)));

export interface RowCtx {
  readonly t: TT;
  readonly draft: Draft;
  readonly view: CatView;
  /** Errors to show now (a field shows its error after blur or a Save press). */
  readonly errors: Readonly<Record<string, FieldError>>;
  set(values: Readonly<Record<string, EmbedValue | undefined>>): void;
  /** A control's own parse failure (theme JSON), or null when it parses. */
  bad(id: string, e: FieldError | null): void;
  /** A field was left: its error may show. */
  touch(id: string): void;
}

const UNSET = '__default';
const keyOf = (v: Scalar | null): string => (v === null ? UNSET : String(v));
const errText = (c: RowCtx, id: string): string | undefined => {
  const e = c.errors[id];
  return e ? c.t(e.key, e.vars) : undefined;
};

/** The id of a row's help line, for the control's aria-describedby (undefined when the row has no help). */
export type DescribedBy = string | undefined;

/** The row frame: a field row of the panel's SettingGroup (label and help | control | reset to default). The help
 *  line describes the control (children get its id, and the row's name id for a control the label names). */
export function FieldRow({ id, label, help, changed, onReset, children, c }: { id: string; label: string; help?: ReactNode; changed: boolean; onReset: () => void; children: ReactNode | ((describedBy: DescribedBy, nameId: string) => ReactNode); c: RowCtx }) {
  return (
    <SettingRow data-opt={id} label={label} help={help} reset={{ shown: changed, label: c.t('panel.reset'), onPress: onReset }}>
      {(ids) => (typeof children === 'function' ? children(ids.helpId, ids.nameId) : children)}
    </SettingRow>
  );
}

function help(c: RowCtx, r: Row, disabled: boolean): string | undefined {
  if (disabled) return c.t('panel.needsPage');
  const k = r.key + '.help';
  return hasKey(k) ? c.t(k) : undefined;
}

/** One designed row. */
export function OptionRow({ r, c, disabled }: { r: Row; c: RowCtx; disabled: boolean }) {
  const p = c.draft.params;
  const label = c.t(r.key + '.label');
  const ids = 'ids' in r ? r.ids : [r.id];
  const changed = ids.some((id) => p[id] !== undefined);
  // A reset remounts the control, so a control's own view (the theme's JSON editor) goes back with the value.
  const [gen, setGen] = useState(0);
  const reset = () => {
    c.set(Object.fromEntries(ids.map((id) => [id, undefined])));
    for (const id of ids) c.bad(id, null);
    setGen((g) => g + 1);
  };
  const frame = (control: (db: DescribedBy, nameId: string) => ReactNode, o: { noHelp?: boolean } = {}) => (
    <FieldRow id={r.id} label={label} help={o.noHelp ? undefined : help(c, r, disabled)} changed={changed} onReset={reset} c={c}>
      {(db, nameId) => <Fragment key={gen}>{control(db, nameId)}</Fragment>}
    </FieldRow>
  );
  const value = p[r.id];
  switch (r.kind) {
    case 'colour':
      // The kit colour picker: its swatches are the terminal themes' backgrounds; a typed three- or six-digit
      // hex is normalised to #RRGGBB, and #RRGGBBAA or a CSS colour name passes as typed (the program takes all three);
      // Back to default clears it to the theme's. The row's help is the picker's own description (read with its swatches).
      return frame(() => (
        <ColorPicker
          label={label}
          labelHidden
          description={help(c, r, disabled)}
          value={typeof value === 'string' ? value : ''}
          onChange={(v) => { c.set({ [r.id]: v === '' ? undefined : v }); c.touch(r.id); }}
          presets={THEME_BACKGROUNDS}
          accepts={cssColourText}
          isDisabled={disabled}
          errorMessage={errText(c, r.id)}
        />
      ), { noHelp: true });
    case 'text':
      return frame((db) => (
        <TextField
          aria-label={label}
          aria-describedby={db}
          value={typeof value === 'string' ? value : ''}
          onChange={(v) => c.set({ [r.id]: v === '' ? undefined : v })}
          onBlur={() => c.touch(r.id)}
          isDisabled={disabled}
          mono={r.mono}
          placeholder={r.placeholder ? c.t(r.placeholder) : undefined}
          errorMessage={errText(c, r.id)}
        />
      ));
    case 'int':
      return frame((db) => (
        <div className={s.stack}>
          <NumberField
            aria-label={label}
            aria-describedby={db}
            value={typeof value === 'number' ? value : NaN}
            onChange={(n) => { c.set({ [r.id]: Number.isNaN(n) ? undefined : n }); c.touch(r.id); }}
            formatOptions={{ useGrouping: false, maximumFractionDigits: 6 }}
            {...bounds(c.view.params[r.id] as CatParam | undefined)}
            isDisabled={disabled}
            unit={r.unit ? c.t(r.unit) : undefined}
            placeholder={c.t(r.placeholder ?? 'choice.default')}
            errorMessage={errText(c, r.id)}
          />
          {r.quick && (
            <div className={s.quick} role="group" aria-label={c.t('panel.quick')}>
              {r.quick.map((n) => (
                <Button key={n} size="sm" variant="ghost" isDisabled={disabled} onPress={() => c.set({ [r.id]: n })}>
                  {n.toLocaleString('en')}
                </Button>
              ))}
            </div>
          )}
        </div>
      ));
    case 'tri':
      return frame((db) => (
        <SegmentedControl
          label={label}
          aria-describedby={db}
          isDisabled={disabled}
          items={[{ id: 'default', label: c.t('choice.default') }, { id: 'on', label: c.t('choice.on') }, { id: 'off', label: c.t('choice.off') }]}
          value={value === true ? 'on' : value === false ? 'off' : 'default'}
          onChange={(k) => c.set({ [r.id]: k === 'on' ? true : k === 'off' ? false : undefined })}
        />
      ));
    case 'switch':
      return frame(
        (db, nameId) => (
          <Switch
            labelledBy={nameId}
            aria-describedby={db}
            isDisabled={disabled}
            isSelected={value === r.write ? !r.defaultOn : r.defaultOn}
            onChange={(on) => c.set({ [r.id]: on === r.defaultOn ? undefined : r.write })}
          />
        ),
      );
    case 'seg':
    case 'select':
      return frame((db) => <ChoiceControl r={r} c={c} label={label} disabled={disabled} db={db} />);
    case 'termTheme':
      return frame((db) => <ThemeControl c={c} label={label} db={db} />);
    case 'termFont':
      return frame((db) => <FontControl c={c} label={label} db={db} />);
    case 'quality':
      return frame(() => <QualityControl c={c} />, { noHelp: true });
    case 'size':
      return frame((db) => <SizeControl c={c} label={label} db={db} />);
    case 'parts':
      return frame((db) => <PartsControl c={c} label={label} db={db} />);
  }
}

/** NumberField props from the catalogue: its min and max, and step 1 for an integer (never invented bounds). */
function bounds(p: CatParam | undefined, scale = 1): { minValue?: number; maxValue?: number; step?: number } {
  if (!p) return {};
  return {
    ...(p.min !== undefined ? { minValue: p.min / scale } : {}),
    ...(p.max !== undefined ? { maxValue: p.max / scale } : {}),
    ...(p.type === 'integer' && scale === 1 ? { step: 1 } : {}),
  };
}

function ChoiceControl({ r, c, label, disabled, db }: { r: Row & { choices: readonly Choice[] }; c: RowCtx; label: string; disabled: boolean; db: DescribedBy }) {
  const phone = useIsPhone();
  const v = c.draft.params[r.id];
  const current = keyOf(r.choices.some((x) => x.value === v) ? (v as Scalar) : null);
  const pick = (k: string) => c.set({ [r.id]: r.choices.find((x) => keyOf(x.value) === k)?.value ?? undefined });
  // Segmented with more than 3 choices becomes a select on phones; elsewhere it shows a Select whenever its labels
  // do not fit whole (fullWidth), never cut segments.
  if (r.kind === 'seg' && !(phone && r.choices.length > 3)) {
    return <SegmentedControl label={label} aria-describedby={db} fullWidth isDisabled={disabled} items={r.choices.map((x) => ({ id: keyOf(x.value), label: c.t(x.key) }))} value={current} onChange={pick} />;
  }
  return <Select aria-label={label} aria-describedby={db} isDisabled={disabled} options={r.choices.map((x) => ({ value: keyOf(x.value), label: c.t(x.key), ...(x.swatch ? { swatch: x.swatch } : {}) }))} value={current} onChange={pick} />;
}

const CUSTOM = '__custom';

// A custom terminal theme's colours open the kit colour picker, one per theme colour; the JSON editor stays below
// for keys the pickers do not cover. Each picker's swatches are that colour in the built-in themes.
const MAIN_KEYS = ['foreground', 'background', 'cursor'] as const;
const ANSI_KEYS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'] as const;
type ThemeKey = (typeof MAIN_KEYS)[number] | (typeof ANSI_KEYS)[number];
const THEME_KEYS: readonly ThemeKey[] = [...MAIN_KEYS, ...ANSI_KEYS];
/** A theme colour the program takes: a hex colour, #RRGGBBAA or a CSS colour name (as a colour option). */
const isColour = (v: unknown): boolean => typeof v === 'string' && (normalizeHexColor(v) !== null || cssColourText(v.trim()));
/** The theme row's colour error: a picker holding text that is not a colour, or a theme colour key (from the JSON or
 *  kept from it) whose value is not one. Other keys are the program's and pass as written. */
const colourProblem = (theme: Readonly<Record<string, unknown>> | undefined, held: Readonly<Partial<Record<ThemeKey, string>>>): FieldError | null =>
  Object.keys(held).length > 0 || THEME_KEYS.some((k) => theme !== undefined && k in theme && !isColour(theme[k])) ? { key: 'ttheme.colourBad' } : null;
const swatchesOf = (k: keyof TermTheme): readonly string[] => [...new Set(Object.values(TERM_THEMES).map((th) => normalizeHexColor(th[k]) ?? th[k]))];

function ThemeColours({ c, theme, typed, locked, onPick }: { c: RowCtx; theme: Readonly<Record<string, unknown>> | undefined; typed: Readonly<Partial<Record<ThemeKey, string>>>; locked: boolean; onPick: (k: ThemeKey, v: string) => void }) {
  // While the JSON does not parse the draft keeps its last good theme: a pick then would replace the person's text. The
  // one note above the pickers says so (and otherwise what the swatches are); each colour's group is described by it.
  const noteId = useId();
  const one = (k: ThemeKey) => {
    const v = typed[k] ?? theme?.[k];
    // A named group per colour: its hex field and browser picker (named by the kit alone) say which colour they set.
    return (
      <div key={k} role="group" aria-label={c.t('ttheme.c.' + k)} aria-describedby={noteId}>
        <ColorPicker
          label={c.t('ttheme.c.' + k)}
          value={typeof v === 'string' ? v : ''}
          onChange={(next) => onPick(k, next)}
          presets={swatchesOf(k)}
          accepts={cssColourText}
          isDisabled={locked}
        />
      </div>
    );
  };
  return (
    <div className={s.stack}>
      <p id={noteId} className={s.help}>{c.t(locked ? 'ttheme.fixJson' : 'ttheme.c.swatches')}</p>
      {MAIN_KEYS.map(one)}
      <Disclosure title={c.t('ttheme.ansi')} description={c.t('ttheme.ansiBody')}>
        <div className={s.stack}>{ANSI_KEYS.map(one)}</div>
      </Disclosure>
    </div>
  );
}

function ThemeControl({ c, label, db }: { c: RowCtx; label: string; db: DescribedBy }) {
  const v = c.draft.params.theme;
  const preset = themePreset(v);
  const obj = v && typeof v === 'object' && !Array.isArray(v) ? (v as Readonly<Record<string, unknown>>) : undefined;
  const [custom, setCustom] = useState(v !== undefined && preset === null);
  const [text, setText] = useState(() => (v !== undefined && preset === null ? JSON.stringify(v, null, 2) : '')); // reason: the text a person edits in the kit CodeEditor, parsed back on each change
  // The theme's own problems: JSON that does not parse (it locks the pickers: a pick would replace the person's text), and
  // picker text that is not a colour (kept in its field; the theme row is "to fix" until it is one or emptied).
  const [jsonBroken, setJsonBroken] = useState(false);
  // Picker text that is not a colour, by colour: shown in its field until fixed or emptied, never in the theme.
  const [badColours, setBadColours] = useState<Readonly<Partial<Record<ThemeKey, string>>>>({});
  const current = custom ? CUSTOM : preset ?? UNSET;
  const problem = errText(c, 'theme');
  const options = [
    { value: UNSET, label: c.t('ttheme.default') },
    ...Object.entries(TERM_THEMES).map(([id, th]) => ({ value: id, label: c.t('ttheme.' + id), swatch: [th.background, th.foreground, th.cursor] })),
    { value: CUSTOM, label: c.t('ttheme.custom') },
  ];
  const pick = (k: string) => {
    c.bad('theme', null);
    setJsonBroken(false);
    setBadColours({});
    if (k === CUSTOM) {
      setCustom(true);
      setText(v !== undefined ? JSON.stringify(v, null, 2) : ''); // reason: seeds the CodeEditor with the current theme when Custom is picked
      return;
    }
    setCustom(false);
    c.set({ theme: k === UNSET ? undefined : (TERM_THEMES[k] as unknown as Readonly<Record<string, unknown>> | undefined) });
  };
  const edit = (next: string) => {
    setText(next);
    // The JSON replaces the whole theme, so picker text that was not a colour is gone with it.
    setBadColours({});
    if (next.trim() === '') {
      setJsonBroken(false);
      c.bad('theme', null);
      c.set({ theme: undefined });
      return;
    }
    let parsed: unknown;
    try { parsed = JSON.parse(next); } catch { parsed = undefined; }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      setJsonBroken(false);
      c.bad('theme', colourProblem(parsed as Record<string, unknown>, {}));
      c.set({ theme: parsed as Record<string, unknown> });
    } else {
      setJsonBroken(true);
      c.bad('theme', { key: 'err.json' });
    }
    c.touch('theme');
  };
  // A picked colour joins the theme (an emptied one leaves it; nothing left is the default), and the JSON shows it.
  // A colour error that is only a picker's held text shows in that picker alone; one in the theme (the JSON) shows here.
  const heldOnly = c.errors.theme?.key === 'ttheme.colourBad' && colourProblem(obj, {}) === null;
  const pickColour = (k: ThemeKey, typed: string) => {
    // Spaces alone are an emptied field, as the kit picker shows them.
    const next = typed.trim() === '' ? '' : typed;
    const ok = next === '' || isColour(next);
    const bad = { ...badColours };
    if (ok) delete bad[k];
    else bad[k] = next;
    setBadColours(bad);
    c.touch('theme');
    if (!ok) {
      c.bad('theme', colourProblem(obj, bad));
      return;
    }
    const rest = Object.fromEntries(Object.entries(obj ?? {}).filter(([key]) => key !== k));
    const theme = next === '' ? rest : { ...rest, [k]: next };
    const empty = Object.keys(theme).length === 0;
    c.bad('theme', colourProblem(empty ? undefined : theme, bad));
    setText(empty ? '' : JSON.stringify(theme, null, 2)); // reason: the CodeEditor shows the theme the pickers made
    c.set({ theme: empty ? undefined : theme });
  };
  return (
    <div className={s.stack}>
      <Select aria-label={label} aria-describedby={db} options={options} value={current} onChange={pick} />
      {custom && <ThemeColours c={c} theme={obj} typed={badColours} locked={jsonBroken} onPick={pickColour} />}
      {custom && (
        <div className={s.editor}>
          <CodeEditor label={c.t('ttheme.editor')} value={text} onChange={edit} rows={8} problems={problem && !heldOnly ? [{ line: null, message: problem }] : undefined} />
        </div>
      )}
    </div>
  );
}

function FontControl({ c, label, db }: { c: RowCtx; label: string; db: DescribedBy }) {
  const v = c.draft.params.fontFamily;
  const preset = fontPreset(v);
  const [custom, setCustom] = useState(v !== undefined && preset === null);
  const current = custom ? CUSTOM : preset ?? UNSET;
  const options = [
    { value: UNSET, label: c.t('tfont.system'), description: c.t('tfont.system.desc') },
    ...Object.entries(TERM_FONTS)
      .map(([id, family]) => ({ value: id, label: c.t('tfont.' + id), sample: { fontFamily: family } }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    { value: CUSTOM, label: c.t('tfont.custom') },
  ];
  return (
    <div className={s.stack}>
      <Select
        aria-label={label}
        aria-describedby={db}
        options={options}
        value={current}
        onChange={(k) => {
          setCustom(k === CUSTOM);
          if (k !== CUSTOM) c.set({ fontFamily: k === UNSET ? undefined : TERM_FONTS[k] });
        }}
      />
      {custom && (
        <TextField
          aria-label={c.t('tfont.list')}
          aria-describedby={db}
          mono
          value={typeof v === 'string' ? v : ''}
          placeholder={c.t('tfont.placeholder')}
          onChange={(x) => c.set({ fontFamily: x === '' ? undefined : x })}
          onBlur={() => c.touch('fontFamily')}
          errorMessage={errText(c, 'fontFamily')}
        />
      )}
    </div>
  );
}

const ENCODINGS: readonly Choice[] = [{ value: null, key: 'enc.webp' }, { value: 'auto', key: 'enc.auto' }, { value: 'jpeg', key: 'enc.jpeg' }, { value: 'png', key: 'enc.png' }, { value: 'rgb', key: 'enc.rgb' }];
/** What the two encodings that change behaviour do (catalogue: encoding's public description). */
const ENC_DESC: Readonly<Record<string, string>> = { 'enc.webp': 'enc.webp.desc', 'enc.auto': 'enc.auto.desc' };
/** quality_mode's catalogue enum; Default leaves it to the viewer (auto). */
const QUALITY_MODES: readonly Choice[] = [{ value: null, key: 'choice.default' }, { value: 'auto', key: 'qmode.auto' }, { value: 'best', key: 'qmode.best' }, { value: 'reduced', key: 'qmode.reduced' }];

function QualityControl({ c }: { c: RowCtx }) {
  const p = c.draft.params;
  const matched = qualityOf(p);
  const [picked, setPicked] = useState<Quality | null>(null);
  // Custom stays picked until another card is chosen; otherwise the card follows the values.
  const q: Quality = picked === 'custom' ? 'custom' : matched;
  const choose = (next: Quality) => {
    setPicked(next);
    // Every quality id is named, unset ones as undefined, so a card also clears values the draft already holds.
    if (next !== 'custom') { const to = applyQuality({ ...c.draft, params: {} }, next).params; c.set(Object.fromEntries(QUALITY_IDS.map((id) => [id, to[id]]))); }
  };
  const enc = p.encoding;
  const bw = p.bandwidth_limit;
  return (
    <div className={s.quality}>
      <RadioGroup
        variant="cards"
        className={s.cards}
        aria-label={c.t('display.quality.label')}
        value={q}
        onChange={choose}
        options={(['sharp', 'smooth', 'low', 'custom'] as const).map((id) => ({ value: id, label: c.t('quality.' + id), description: c.t(`quality.${id}.desc`) }))}
      />
      <TextButton onPress={() => choose('custom')}>{c.t('quality.fineTune')}</TextButton>
      {q === 'custom' && (
        <div className={s.fine}>
        <SettingGroup variant="field" label={c.t('quality.fineTune')}>
          <SubRow c={c} id="encoding" label={c.t('display.encoding.label')} help={c.t('display.encoding.help')}>
            {(db) => (
            <Select
              aria-label={c.t('display.encoding.label')}
              aria-describedby={db}
              options={ENCODINGS.map((x) => {
                const desc = ENC_DESC[x.key];
                return { value: keyOf(x.value), label: c.t(x.key), ...(desc ? { description: c.t(desc) } : {}) };
              })}
              value={keyOf(ENCODINGS.some((x) => x.value === enc) ? (enc as Scalar) : null)}
              onChange={(k) => c.set({ encoding: ENCODINGS.find((x) => keyOf(x.value) === k)?.value ?? undefined })}
            />
            )}
          </SubRow>
          <SubRow c={c} id="video" label={c.t('display.video.label')} help={c.t('display.video.help')}>
            {(db) => (
            <SegmentedControl
              label={c.t('display.video.label')}
              aria-describedby={db}
              items={[{ id: 'default', label: c.t('choice.default') }, { id: 'on', label: c.t('choice.on') }, { id: 'off', label: c.t('choice.off') }]}
              value={p.video === true ? 'on' : p.video === false ? 'off' : 'default'}
              onChange={(k) => c.set({ video: k === 'on' ? true : k === 'off' ? false : undefined })}
            />
            )}
          </SubRow>
          <SubRow c={c} id="bandwidth_limit" label={c.t('display.bandwidth.label')} help={c.t('display.bandwidth.help')}>
            {(db) => (
            <NumberField
              aria-label={c.t('display.bandwidth.label')}
              aria-describedby={db}
              value={typeof bw === 'number' ? bw / 1e6 : NaN}
              onChange={(n) => { c.set({ bandwidth_limit: mbitToBits(n) }); c.touch('bandwidth_limit'); }}
              formatOptions={{ useGrouping: false, maximumFractionDigits: 6 }}
              {...bounds(c.view.params.bandwidth_limit as CatParam | undefined, 1e6)}
              unit={c.t('unit.mbit')}
              errorMessage={errText(c, 'bandwidth_limit')}
            />
            )}
          </SubRow>
          <SubRow c={c} id="quality_mode" label={c.t('display.qualityMode.label')} help={c.t('display.qualityMode.help')}>
            {(db) => (
            <Select
              aria-label={c.t('display.qualityMode.label')}
              aria-describedby={db}
              options={QUALITY_MODES.map((x) => ({ value: keyOf(x.value), label: c.t(x.key) }))}
              value={keyOf(QUALITY_MODES.some((x) => x.value === p.quality_mode) ? (p.quality_mode as Scalar) : null)}
              onChange={(k) => c.set({ quality_mode: QUALITY_MODES.find((x) => keyOf(x.value) === k)?.value ?? undefined })}
            />
            )}
          </SubRow>
          <SubRow c={c} id="quality" label={c.t('display.qualityFixed.label')} help={c.t('display.qualityFixed.help')}>
            {(db) => (
            <NumberField
              aria-label={c.t('display.qualityFixed.label')}
              aria-describedby={db}
              value={typeof p.quality === 'number' ? p.quality : NaN}
              onChange={(n) => { c.set({ quality: Number.isNaN(n) ? undefined : n }); c.touch('quality'); }}
              formatOptions={{ useGrouping: false, maximumFractionDigits: 6 }}
              {...bounds(c.view.params.quality as CatParam | undefined)}
              placeholder={c.t('choice.default')}
              errorMessage={errText(c, 'quality')}
            />
            )}
          </SubRow>
        </SettingGroup>
        </div>
      )}
    </div>
  );
}

/** A row inside a group row (Fine-tune): same frame, its own reset. */
function SubRow({ c, id, label, help: helpText, children }: { c: RowCtx; id: string; label: string; help?: string; children: ReactNode | ((db: DescribedBy) => ReactNode) }) {
  return (
    <FieldRow id={id} label={label} help={helpText} changed={c.draft.params[id] !== undefined} onReset={() => c.set({ [id]: undefined })} c={c}>
      {children}
    </FieldRow>
  );
}

function SizeControl({ c, label, db }: { c: RowCtx; label: string; db: DescribedBy }) {
  const p = c.draft.params;
  const set = p.override_width !== undefined;
  const [fixed, setFixed] = useState(set);
  const isFixed = fixed || set;
  // Each field carries its own option id, so Save's press can focus the one that needs fixing.
  const field = (id: 'override_width', k: string) => (
    <div data-opt={id}>
      <TextField
        label={c.t(k)}
        aria-describedby={db}
        mono
        value={typeof p[id] === 'string' ? (p[id] as string) : ''}
        placeholder={c.t('size.placeholder')}
        onChange={(v) => c.set({ [id]: v === '' ? undefined : v })}
        onBlur={() => c.touch(id)}
        errorMessage={errText(c, id)}
      />
    </div>
  );
  return (
    <div className={s.stack}>
      <SegmentedControl
        label={label}
        aria-describedby={db}
        items={[{ id: 'fit', label: c.t('size.fit') }, { id: 'fixed', label: c.t('size.fixed') }]}
        value={isFixed ? 'fixed' : 'fit'}
        onChange={(k) => {
          setFixed(k === 'fixed');
          if (k === 'fit') c.set({ override_width: undefined });
        }}
      />
      {isFixed && (
        field('override_width', 'size.width')
      )}
    </div>
  );
}

function PartsControl({ c, label, db }: { c: RowCtx; label: string; db: DescribedBy }) {
  const offered = partsOf(c.view);
  const p = c.draft.params;
  const ticked = new Set(offered.filter((part) => partShown(p, part)));
  const writeAll = (next: Set<Part>) => c.set({ chromeless: undefined, hideHeader: undefined, hideSidebar: undefined, hidePreview: undefined, hideFooter: undefined, borderless: undefined, ...partsParams(offered, next) });
  return (
    <div className={s.stack}>
      <Switch label={c.t('parts.minimal')} aria-describedby={db} isSelected={ticked.size === 0} onChange={(on) => writeAll(on ? new Set() : new Set(offered))} />
      <div className={s.checks} role="group" aria-label={label} aria-describedby={db}>
        {offered.map((part) => (
          <Checkbox
            key={part}
            label={c.t('parts.' + part)}
            isSelected={ticked.has(part)}
            onChange={(on) => {
              const next = new Set(ticked);
              if (on) next.add(part);
              else next.delete(part);
              writeAll(next);
            }}
          />
        ))}
      </div>
    </div>
  );
}
