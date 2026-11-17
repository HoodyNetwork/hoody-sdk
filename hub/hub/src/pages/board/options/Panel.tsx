// The per-program Options drawer of a tile (a full-screen sheet on phones, kit Drawer).
//
// Contract, in plain words:
//   - Opens with the tile's view and kept options as a draft; nothing is sent or kept before Save. Save hands
//     onSave the cleaned {view, params} (draft.ts saveDraft) and closes; the Board applies it as one undo step and
//     re-keys a running frame once. The footer line says so before Save.
//   - Save is aria-disabled, never natively disabled: with nothing changed its tooltip says so; with an invalid
//     field the tooltip names the place, and a press opens that section and focuses the first invalid field.
//   - Sections are an accordion, one open at a time; on open the first section with a change is open, else the
//     first. Advanced is last and starts collapsed (unless it is the only change). Ctrl/⌘ Enter saves.
//   - Dirty close (×, Esc, scrim, Cancel, Back) asks first: the kit Drawer guard.
//   - Catalogue loading: skeleton; failed: ErrorState with Try again, no Save. Stale saved options: notice band.
//   - A terminal tile shows its Shell row first (ShellRow): it is not an option, Save does not touch it.
import { ActionMenu, Band, Button, Disclosure, Drawer, DrawerCancel, ErrorState, SegmentedControl, Select, SettingGroup, SettingRow, Skeleton, StatusPill, Tag, TextButton, TextField, Tooltip, cx, useIsPhone } from '@kit';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { EmbedValue } from '../embed/build';
import type { Catalog, TileProgram } from '../embed/catalog';
import {
  catView, changedIn, errorPlaces, errorsOf, openDraft, opensFields, opensOptional, resetDraft, sameSaved, saveDraft, setOptions, shownSections, staleIds, validParams, seedDraft, withView,
  rowEnabled, type Draft, type FieldError, type Saved,
} from './draft';
import { PANELS } from './model';
import { Preview } from './Preview';
import type { ShellTarget } from '../parts/shellChange';
import { ShellRow } from './ShellRow';
import { FieldRow, OptionRow, hasKey, useT, type RowCtx, type TT } from './Rows';
import s from './options.module.css';

export interface OptionsPanelProps {
  readonly isOpen: boolean;
  onOpenChange(open: boolean): void;
  /** The trimmed catalogue; null while it loads. */
  readonly cat: Catalog | null;
  /** The catalogue failed to load (shows Try again). */
  readonly catFailed?: boolean;
  onRetry?(): void;
  readonly program: TileProgram;
  /** "terminal-2" (with "(2)" for a duplicate-session tile). */
  readonly tileName: string;
  readonly computerName: string;
  /** Opens the computer on Computers (the board passes followPageLink); null or absent draws its name as plain text. */
  onOpenComputer?: (() => void) | null;
  /** The tile's saved view and options. */
  readonly view?: string;
  readonly params?: Readonly<Record<string, EmbedValue>>;
  /** Option ids the Board's load already removed from params (TileRef.dropped): shown as stale like params'. */
  readonly dropped?: readonly string[];
  /** What the Board sets when the tile keeps nothing (tileInfo boardDefaults): the preview draws it, never the draft. */
  readonly defaults?: Readonly<Record<string, EmbedValue>>;
  /** The tile shows a running frame (Save reloads it); else Save applies when it next opens. */
  readonly running: boolean;
  onSave(next: Saved): void;
  /** A terminal tile's shell: the Shell row shows what it runs and Change (onChange, null for an ssh tile)
   *  opens the tile's Change shell dialog. */
  readonly shell?: { readonly target: ShellTarget; readonly onChange: (() => void) | null } | null;
}

/** The preview's options: the Board defaults under what the draft sets (an unset draft value leaves the default). */
function previewParams(defaults: Readonly<Record<string, EmbedValue>> | undefined, params: Readonly<Record<string, EmbedValue>>): Record<string, EmbedValue> {
  const out: Record<string, EmbedValue> = { ...defaults };
  for (const [id, v] of Object.entries(params)) if (v !== undefined) out[id] = v;
  return out;
}

/** A fresh draft on every open (the drawer's state is keyed by the open count). */
export function OptionsPanel(props: OptionsPanelProps) {
  const [gen, setGen] = useState(0);
  const [wasOpen, setWasOpen] = useState(props.isOpen);
  if (props.isOpen !== wasOpen) {
    setWasOpen(props.isOpen);
    if (props.isOpen) setGen((g) => g + 1);
  }
  return <PanelDrawer key={gen} {...props} />;
}

function listText(t: TT, names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return t('panel.and', { a: names.slice(0, -1).join(', '), b: names[names.length - 1] as string });
}

function PanelDrawer(props: OptionsPanelProps) {
  const { isOpen, onOpenChange, cat, catFailed, onRetry, program, tileName, computerName, onOpenComputer, running, onSave } = props;
  const t = useT();
  const phone = useIsPhone();
  const panel = PANELS[program];
  const [initial, setInitial] = useState<Draft | null>(() => (cat ? openDraft(cat, program, props.view, props.params) : null));
  const [draft, setDraft] = useState<Draft | null>(() => (cat && initial ? seedDraft(cat, program, initial) : initial));
  if (cat && !initial) {
    const d = openDraft(cat, program, props.view, props.params);
    setInitial(d);
    setDraft(seedDraft(cat, program, d));
  }
  const [bad, setBad] = useState<Record<string, FieldError>>({});
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [tried, setTried] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const v = cat && draft ? catView(cat, program, draft.view) : null;
  const sections = draft ? shownSections(program, v, draft.params) : [];
  const errors = cat && draft ? errorsOf(cat, program, draft, bad) : {};
  const places = draft ? errorPlaces(program, v, draft, errors) : [];
  const changed = cat && draft ? changedIn(cat, program, draft) : {};
  const stale = useMemo(() => (cat ? [...new Set([...(props.dropped ?? []), ...staleIds(cat, program, props.view, props.params)])] : []), [cat, program, props.view, props.params, props.dropped]);
  const saved = cat && draft ? saveDraft(cat, program, draft) : null;
  const dirty = !!(cat && draft && initial && saved && !sameSaved(saved, saveDraft(cat, program, initial)));
  const canSave = dirty || (stale.length > 0 && !!saved);

  const [open, setOpen] = useState<string | null>(() => {
    if (!cat || !initial) return null;
    const ch = changedIn(cat, program, initial);
    const secs = shownSections(program, catView(cat, program, initial.view), initial.params);
    return (secs.find((x) => ch[x.section.id]) ?? secs.find((x) => x.section.id !== 'advanced'))?.section.id ?? null;
  });

  const shownErrors: Record<string, FieldError> = {};
  const opensIdSet = new Set(opensFields(program, draft?.view).map((f) => f.id));
  for (const [id, e] of Object.entries(errors)) if (tried || touched.has(id) || opensIdSet.has(id)) shownErrors[id] = e;

  const sectionName = (id: string) => t('section.' + id);
  const errorCount = places.reduce((n, x) => n + x.ids.length, 0);
  const saveReason = errorCount > 0 ? t('panel.saveFix', { count: errorCount, places: listText(t, places.map((x) => sectionName(x.place))) }) : !canSave ? t('panel.saveNothing') : null;

  const focusFirst = (place: string, id: string) => {
    if (place !== 'opens') setOpen(place);
    window.requestAnimationFrame(() => {
      const row = bodyRef.current?.querySelector(`[data-opt="${CSS.escape(id)}"]`);
      (row?.querySelector<HTMLElement>('input, textarea, [contenteditable="true"]') ?? row?.querySelector<HTMLElement>('button'))?.focus();
    });
  };

  const save = () => {
    if (!cat || !draft || !saved) return;
    if (errorCount > 0) {
      setTried(true);
      const first = places[0];
      if (first) focusFirst(first.place, first.ids[0] as string);
      return;
    }
    if (!canSave) return;
    onSave(saved);
    onOpenChange(false);
  };

  const ctx: RowCtx | null = draft && v
    ? {
        t,
        draft,
        view: v,
        errors: shownErrors,
        set: (values) => setDraft((d) => (d ? setOptions(d, values) : d)),
        bad: (id, e) => setBad((b) => {
          if (!e && !b[id]) return b;
          const next = { ...b };
          if (e) next[id] = e;
          else delete next[id];
          return next;
        }),
        touch: (id) => setTouched((x) => (x.has(id) ? x : new Set([...x, id]))),
      }
    : null;

  // Reset all remounts the rows, so a control's own view (the theme's JSON editor) goes back with the values.
  const [resets, setResets] = useState(0);
  const resetAll = () => {
    setDraft(resetDraft(program));
    setBad({});
    setResets((n) => n + 1);
  };

  const line = !running ? t('panel.footLater', { name: tileName }) : program === 'files' || program === 'code' ? t('panel.footReloadWork', { name: tileName }) : t('panel.footReload', { name: tileName });

  const footer = ctx ? (
    <div className={s.foot}>
      <p className={s.footLine}>{line}</p>
      <div className={s.footRow}>
        {!phone && (
          <Button variant="ghost" onPress={resetAll}>
            {t('panel.resetAll')}
          </Button>
        )}
        <span className={s.grow} />
        <DrawerCancel />
        {saveReason ? (
          <Tooltip content={saveReason}>
            <Button variant="primary" aria-disabled="true" onPress={save}>
              {t('panel.save')}
            </Button>
          </Tooltip>
        ) : (
          <Button variant="primary" onPress={save}>
            {t('panel.save')}
          </Button>
        )}
      </div>
    </div>
  ) : undefined;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !saveReason) {
      e.preventDefault();
      save();
    }
  };

  return (
    <Drawer resizeKey="board-panel"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="md"
      title={t('panel.title', { name: tileName })}
      subtitle={
        onOpenComputer ? (
          <>
            {t('panel.subtitleName', { name: tileName })}{' '}
            <TextButton aria-label={t('panel.openComputer', { computer: computerName })} onPress={onOpenComputer}>
              {computerName}
            </TextButton>
          </>
        ) : (
          t('panel.subtitle', { name: tileName, computer: computerName })
        )
      }
      dirty={dirty}
      cancel={ctx ? undefined : true}
      footer={footer}
      actions={ctx && phone ? <ActionMenu label={t('panel.more')} items={[{ id: 'reset', label: t('panel.resetAll'), onAction: resetAll }]} /> : undefined}
    >
      {!ctx || !draft || !v ? (
        catFailed ? <ErrorState title={t('panel.loadFailed')} onRetry={onRetry} /> : <Skeleton rows={5} />
      ) : (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Ctrl/⌘ Enter from any field saves; the fields stay the interactive elements
        <div ref={bodyRef} className={cx(s.body, phone && s.sheet)} onKeyDown={onKeyDown}>
          {stale.length > 0 && <Band tone="warn" size="table">{t('panel.stale')}</Band>}
          {program === 'terminal' && props.shell && <ShellRow target={props.shell.target} onChange={props.shell.onChange} />}
          {panel.preview && <Preview params={previewParams(props.defaults, validParams(draft.params, errors))} t={t} />}
          {panel.opens && (
            <div className={s.opens}>
              <SettingGroup variant="field">
              <OpensControl c={ctx} program={program} onView={(view) => setDraft((d) => (d && cat ? withView(cat, program, d, view) : d))} phone={phone} />
              {opensFields(program, draft.view).map((f) => {
                const value = draft.params[f.id];
                const optional = opensOptional(v, f.id);
                const e = shownErrors[f.id];
                const helpKey = f.key + '.help';
                return (
                  <FieldRow key={draft.view + f.id} id={f.id} label={t(f.key + '.label')} help={hasKey(helpKey) ? t(helpKey) : undefined} changed={value !== undefined} onReset={() => ctx.set({ [f.id]: undefined })} c={ctx}>
                    {(db) => (
                    <TextField
                      aria-label={t(f.key + '.label')}
                      aria-describedby={db}
                      mono
                      isRequired={!optional}
                      value={typeof value === 'string' ? value : ''}
                      placeholder={hasKey(f.key + '.placeholder') ? t(f.key + '.placeholder') : undefined}
                      onChange={(x) => ctx.set({ [f.id]: x === '' ? undefined : x })}
                      onBlur={() => ctx.touch(f.id)}
                      errorMessage={e ? t(e.key, e.vars) : undefined}
                    />
                    )}
                  </FieldRow>
                );
              })}
              </SettingGroup>
            </div>
          )}
          <div className={s.sections}>
            {sections.map(({ section, rows }) => {
              const fix = places.find((x) => x.place === section.id)?.ids.length ?? 0;
              const n = changed[section.id] ?? 0;
              return (
                <Disclosure
                  key={section.id}
                  className={s.section}
                  title={sectionName(section.id)}
                  description={fix > 0 ? <StatusPill tone="danger">{t('panel.toFix', { count: fix })}</StatusPill> : n > 0 ? <Tag>{t('panel.changed', { count: n })}</Tag> : undefined}
                  isExpanded={open === section.id}
                  onExpandedChange={(x) => setOpen(x ? section.id : null)}
                >
                  <SettingGroup variant="field">
                    {rows.map((r) => (
                      <OptionRow key={`${resets}:${r.id}`} r={r} c={ctx} disabled={!rowEnabled(r, draft.params)} />
                    ))}
                  </SettingGroup>
                </Disclosure>
              );
            })}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function OpensControl({ c, program, onView, phone }: { c: RowCtx; program: TileProgram; onView: (view: string) => void; phone: boolean }) {
  const opens = PANELS[program].opens ?? [];
  const label = c.t('panel.opens');
  const current = c.draft.view ?? opens[0]?.view;
  const helpKey = `${program}.view.${current}.help`;
  return (
    <SettingRow data-opt="view" label={label} help={hasKey(helpKey) ? c.t(helpKey) : undefined}>
      {({ helpId: db }) =>
        phone && opens.length > 3 ? (
          <Select aria-label={label} aria-describedby={db} options={opens.map((o) => ({ value: o.view, label: c.t(o.key) }))} value={current} onChange={onView} />
        ) : (
          <SegmentedControl label={label} aria-describedby={db} fullWidth items={opens.map((o) => ({ id: o.view, label: c.t(o.key) }))} value={current} onChange={onView} />
        )
      }
    </SettingRow>
  );
}
