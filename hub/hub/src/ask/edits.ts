// edits.ts: the files a chat's edit tools changed,
// from the tools' own inputs. One function reads a call live (event.tool_call `arguments`) and from history (the
// transcript's tool_use `input`), so a chat shows the same edits while it runs and after a reload.
//
// Rules:
//   - An allowlist per tool: edit_file and edit_minified_file keep the path, old_string, new_string and replace_all;
//     write_file and write_minified_file keep the path and the content's length only (never the content); delete_file
//     keeps the path. A `computer` argument is kept as given. Every other key is dropped. Strings are capped.
//   - MEMORY ONLY: the list and its diffs live in the engine's state and the snapshot's `edits`; they
//     are never stored (no AskRecord, no saved transcript copy, no storage of any kind) and never ride a block or a step,
//     which other code may copy into storage. edits.storage.test.ts pins this.
//   - A call counts once its result says it ran: an error is no edit; an outcome-unknown result is an edit that may have
//     happened (`unsure`); a call with no result yet shows nothing.
//   - The last call on a file decides its row: delete after edit reads deleted, a write after a delete reads written.
//     The same path on another computer is another file.

export type EditVerb = 'edited' | 'written' | 'deleted';
/** One edit tool call, as its input named it. `ok`: null until its result is read. */
export interface Edit {
  readonly id: string;
  readonly verb: EditVerb;
  readonly path: string;
  readonly computer?: string;
  /** edit_file only: the text it replaced and the text it put there (each capped at TEXT_MAX). */
  readonly old?: string;
  readonly new?: string;
  readonly all?: true;
  /** A text was longer than TEXT_MAX: what is kept is its start. */
  readonly cut?: true;
  /** write_file only: the content's length in characters (the content is never kept). */
  readonly size?: number;
  ok: boolean | null;
  unsure?: true;
}

/** One file as the Edits tab and the result row read it: its last kept call. */
export interface FileEdit {
  readonly key: string;
  readonly verb: EditVerb;
  readonly path: string;
  readonly computer?: string;
  readonly old?: string;
  readonly new?: string;
  readonly all?: true;
  readonly cut?: true;
  readonly size?: number;
  readonly unsure?: true;
}

export const TEXT_MAX = 8192;
export const PATH_MAX = 1024;
/** Details > Edits lists the newest this many files; the rest are counted ("And N more not listed"). A turn keeps an edit's
 *  texts only for its newest EDIT_ROWS files (an older file is past every list: later files are newer). */
export const EDIT_ROWS = 500;
/** Calls with no result yet that keep their texts; an older one keeps its file and is marked cut. */
export const EDITS_PENDING = 1000;
/** Entries a turn keeps at all (one per file that ran, and the calls with no result yet). Past it the oldest goes, and a file
 *  that ran is still counted (`lost`), not deduplicated: a turn needs more than this many files for that. */
export const EDITS_KEEP = 20000;

const VERB: Readonly<Record<string, EditVerb>> = {
  edit_file: 'edited', edit_minified_file: 'edited',
  write_file: 'written', write_minified_file: 'written',
  delete_file: 'deleted',
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

const fileKey = (e: Pick<Edit, 'computer' | 'path'>): string => `${e.computer ?? ''}\u0000${e.path}`;

/** A write's length where its content was: a key no wire value can carry (a Symbol), so only withoutContent makes one. */
const SIZE = Symbol('size');

/** A tool call's arguments with a write's content replaced by its length: what logic.ts keeps of a call it holds before its turn
 *  is known (AskState.buffer), so a write's content never stays in the engine's state. */
export function withoutContent(args: unknown): unknown {
  if (!isObj(args) || typeof args.content !== 'string') return args;
  return { ...args, content: { [SIZE]: args.content.length } };
}
const sizeOf = (c: unknown): number | null => (typeof c === 'string' ? c.length : isObj(c) && typeof (c as { [SIZE]?: unknown })[SIZE] === 'number' ? (c as { [SIZE]: number })[SIZE] : null);

/** The edit one tool call names, or null (not an edit tool, or no usable path). */
export function editOf(id: string, name: string, input: unknown): Edit | null {
  const verb = VERB[name];
  if (!verb || !isObj(input)) return null;
  const path = str(input.path) ?? str(input.file_path);
  if (!path || !path.trim() || path.length > PATH_MAX) return null;
  const computer = str(input.computer);
  const base = { id, verb, path, ...(computer ? { computer } : {}), ok: null };
  if (verb === 'edited') {
    const o = str(input.old_string), n = str(input.new_string);
    if (o === null || n === null) return null;
    const cut = o.length > TEXT_MAX || n.length > TEXT_MAX;
    return { ...base, old: o.slice(0, TEXT_MAX), new: n.slice(0, TEXT_MAX), ...(input.replace_all === true ? { all: true as const } : {}), ...(cut ? { cut: true as const } : {}) };
  }
  if (verb === 'written') {
    const n = sizeOf(input.content);
    return n === null ? null : { ...base, size: n };
  }
  return base;
}

const textless = (e: Edit): Edit => {
  if (e.old === undefined && e.new === undefined) return e;
  const { old: _o, new: _n, all: _a, ...rest } = e;
  return { ...rest, cut: true };
};

/** A turn's edit list (logic.ts AskState): one entry per file whose last call ran or may have (its last call in call order), and
 *  every call with no result yet; `lost` counts files that ran and that EDITS_KEEP pushed out. */
export interface TurnEdits {
  edits: Edit[];
  editsLost: number;
  /** Ids of calls that ran and that a later call of their file replaced: a replay of one is not a new call (it would show the
   *  older change as the file's last). The newest EDITS_KEEP only, so only that many later replaced calls can push one out. */
  editsSeen: Set<string>;
  /** Ids of calls that failed: a replay of one is not a new waiting call (it would push a real waiting call's texts out). Kept
   *  apart from editsSeen so failures never push a replaced call out; the newest EDITS_KEEP only. */
  editsFailed: Set<string>;
}

const remember = (set: Set<string>, id: string | undefined): void => {
  if (!id) return;
  set.add(id);
  if (set.size > EDITS_KEEP) set.delete(set.values().next().value as string);
};
const gone = (t: TurnEdits, id: string | undefined): void => remember(t.editsSeen, id);

/** Adds a call to a turn's list; a call already listed by its id is that call seen again (a replay): it keeps its place and the
 *  result already read for it. A call with no result yet always stays until its result (it may fail, and then the call before it
 *  is the file's row); past EDITS_PENDING such calls the oldest drops its texts. Past EDITS_KEEP entries the oldest goes. */
export function addEdit(t: TurnEdits, e: Edit): void {
  const list = t.edits;
  if (e.id && (t.editsSeen.has(e.id) || t.editsFailed.has(e.id))) return;
  const at = e.id ? list.findIndex((x) => x.id === e.id) : -1;
  if (at >= 0) {
    const was = list[at] as Edit;
    const same = was.old === undefined && e.old !== undefined ? textless(e) : e;
    list[at] = was.ok === null ? same : { ...same, ok: was.ok, ...(was.unsure ? { unsure: true as const } : {}) };
    return;
  }
  list.push(e);
  let pending = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const x = list[i] as Edit;
    if (x.ok !== null) continue;
    if (++pending === EDITS_PENDING + 1) { list[i] = textless(x); break; }
  }
  while (list.length > EDITS_KEEP) if ((list.shift() as Edit).ok === true) t.editsLost++;
}

/** Settles the newest call with this id from its result as logic.ts resultOf read it (ok, or a failure that may have run). A failed
 *  call leaves the list. A call that ran becomes its file's one entry: a later entry of the file that ran wins over it, else it
 *  replaces the file's earlier one. Then the file now just past the newest EDIT_ROWS drops its texts. */
export function settleEdit(t: TurnEdits, id: string, res: { readonly ok: boolean | null; readonly unknown?: boolean }): void {
  if (!id) return;
  const list = t.edits;
  let i = list.length - 1;
  while (i >= 0 && (list[i] as Edit).id !== id) i--;
  if (i < 0) return;
  const e = list[i] as Edit;
  if (e.ok !== null) return;
  if (!res.ok && !res.unknown) { remember(t.editsFailed, e.id); list.splice(i, 1); return; }
  const k = fileKey(e);
  for (let j = list.length - 1; j > i; j--) {
    const x = list[j] as Edit;
    if (x.ok === true && fileKey(x) === k) { gone(t, e.id); list.splice(i, 1); return; }
  }
  list[i] = res.ok ? { ...e, ok: true } : { ...e, ok: true, unsure: true };
  for (let j = i - 1; j >= 0; j--) {
    const x = list[j] as Edit;
    if (x.ok === true && fileKey(x) === k) { gone(t, x.id); list.splice(j, 1); }
  }
  let ran = 0;
  for (let j = list.length - 1; j >= 0; j--) {
    const x = list[j] as Edit;
    if (x.ok !== true) continue;
    if (++ran === EDIT_ROWS + 1) { list[j] = textless(x); break; }
  }
}

/** Details > Edits from the turns' lists: the newest EDIT_ROWS files, and how many more there are (older files, and files a turn
 *  pushed out past EDITS_KEEP). */
export function editRows(turns: readonly TurnEdits[]): { rows: FileEdit[]; more: number } {
  const all = foldEdits(turns.map((x) => x.edits));
  const rows = all.length > EDIT_ROWS ? all.slice(all.length - EDIT_ROWS) : all;
  return { rows, more: all.length - rows.length + turns.reduce((n, x) => n + x.editsLost, 0) };
}

/** The chat's files, from its turns' calls oldest first: one row per file, its last call that ran (or may have). A later
 *  call that may have run over one that ran keeps the file marked `unsure`. Rows are ordered by their last change. */
export function foldEdits(turns: readonly (readonly Edit[])[]): FileEdit[] {
  const by = new Map<string, FileEdit>();
  for (const list of turns) {
    for (const e of list) {
      if (e.ok !== true) continue;
      const key = fileKey(e);
      by.delete(key);
      by.set(key, {
        key, verb: e.verb, path: e.path,
        ...(e.computer ? { computer: e.computer } : {}),
        ...(e.old !== undefined ? { old: e.old } : {}),
        ...(e.new !== undefined ? { new: e.new } : {}),
        ...(e.all ? { all: true as const } : {}),
        ...(e.cut ? { cut: true as const } : {}),
        ...(e.size !== undefined ? { size: e.size } : {}),
        ...(e.unsure ? { unsure: true as const } : {}),
      });
    }
  }
  return [...by.values()];
}

/** How many files one turn's calls changed (or may have). */
export const turnFiles = (t: TurnEdits): number => foldEdits([t.edits]).length + t.editsLost;
