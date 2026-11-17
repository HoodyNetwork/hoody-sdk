// The composer's "/" menu, its pure part: when the menu shows and which commands match. The commands come from
// the host (the agent's own report: its skills, and the built-ins the Hub reads as capabilities); the kit knows none of them.
// A command may carry its group (the menu draws a header at each group's first row, groups in the host's order), an
// argument hint, a note on what it opens, and `run`: a command the host carries out itself (a Hub action, never text for the agent).

/** One command the "/" menu offers. `name` without its "/". */
export interface SlashCommand {
  name: string;
  /** One line about it, as the agent wrote it; '' for none. */
  description: string;
  /** A skill the agent does not trust yet: still offered (the agent decides what it runs), with its mark. */
  untrusted?: boolean;
  /** The header it is listed under ("Conversation", "Skills"); rows of one group stay together, groups in the host's order. Absent:
   *  or '': no header (a list with no group at all looks as before). */
  group?: string;
  /** What may follow the name, as shown ("<turn>", "[turn]", "<interval> <prompt>"); '' or absent for none. A command with a hint
   *  is picked into the draft so the words can be typed; one without a hint and with `run` runs at the pick. */
  hint?: string;
  /** A short line on what the command opens in the Hub ("Opens the TODO form"), drawn at the row's end. */
  opens?: string;
  /** The host carries it out itself: called with the words after the name (trimmed, '' for none) at the pick (no hint) or when the
   *  draft "/name words" is sent; the draft then empties and nothing is sent. Answer false to let the text go to the agent as
   *  typed instead (a form the host does not handle). A false answer comes before any effect (it only declines). A declined pick is
   *  sent once as "/name" under the usual rule (only when the chat can take it; otherwise "/name " is written for the words) and
   *  is never run again; a declined typed command is sent as typed, likewise. */
  run?: (args: string) => boolean | void;
  /** Never listed, only carried out when typed and sent (a command the menu does not offer, whose text must not reach the agent). */
  hidden?: boolean;
}
/** What the host knows of the commands now. `reading`: a list is still being read (what is known so far shows); `failed`: it
 *  could not be read (the built-ins still show). */
export interface ComposerSlash {
  items: readonly SlashCommand[];
  reading?: boolean;
  failed?: boolean;
  /** Called each time the menu opens: a host reads its list only once someone asks for it (nothing is read for a chat whose
   *  menu never opens). */
  open?: () => void;
}

/** The text after the "/" while the whole draft is one command being typed ("/", "/com"); null for anything else. */
export function slashQuery(plain: string): string | null {
  const m = /^\/(\S*)$/u.exec(plain);
  return m ? (m[1] as string) : null;
}

/** The commands for `query`, group by group in the host's order of first appearance (a group with no match drops out): in each,
 *  names that start with it first, then names that hold it; case is ignored; the host's order kept. Hidden commands never match. */
export function slashMatches(items: readonly SlashCommand[], query: string): SlashCommand[] {
  const q = query.toLowerCase();
  const groups = new Map<string, { starts: SlashCommand[]; holds: SlashCommand[] }>();
  for (const c of items) {
    if (c.hidden) continue;
    const key = c.group || '';
    let g = groups.get(key);
    if (!g) { g = { starts: [], holds: [] }; groups.set(key, g); }
    const n = c.name.toLowerCase();
    if (n.startsWith(q)) g.starts.push(c);
    else if (n.includes(q)) g.holds.push(c);
  }
  return [...groups.values()].flatMap((g) => [...g.starts, ...g.holds]);
}

/** The host command a sent draft names: "/name" or "/name words" on its own (the whole draft, one line or more after the words),
 *  matched to a command with `run` by its exact name; null for anything else. `args` is the words after the name, trimmed. */
export function slashRunOf(items: readonly SlashCommand[], plain: string): { cmd: SlashCommand; args: string } | null {
  const m = /^\/([^\s/]+)(?:\s+([\s\S]*))?$/u.exec(plain.trimEnd());
  if (!m) return null;
  const cmd = items.find((c) => c.run && c.name === m[1]);
  return cmd ? { cmd, args: (m[2] ?? '').trim() } : null;
}
