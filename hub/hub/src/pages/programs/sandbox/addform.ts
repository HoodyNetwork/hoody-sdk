// The New program drawer's form: a program kept on the computer (daemon POST programs/add) or one run once
// (POST quick-start). Only published daemon rules are mirrored (the daemon's openapi ProgramInput,
// EphemeralProgramInput; its rules for program names and commands); what the Hub cannot see (the account exists, a
// port range overlaps another program's) is the daemon's 400, shown as it said it. No React, no I/O.

import { utf8Bytes } from '@core/pure';

export type AddMode = 'keep' | 'once';
export type PortMode = 'none' | 'one' | 'range';
/** The daemon's autorestart words: restart after a failure (exit code other than 0), always, never. */
export type Policy = 'unexpected' | 'true' | 'false';

export interface AddForm {
  mode: AddMode;
  name: string;
  command: string;
  /** The Linux account it runs as. */
  user: string;
  ports: PortMode;
  /** One port (ready_port): the command itself names it; the daemon waits for it to accept a connection. */
  port: string;
  rangeStart: string;
  rangeEnd: string;
  /** How each instance is told its port (port_param); empty: the daemon passes --port. */
  portParam: string;
  policy: Policy;
  /** Start with the computer (boot). A program kept only. */
  boot: boolean;
}

/** The account Hoody computers run your own programs as. */
const DEFAULT_USER = 'user';

export const EMPTY_ADD: AddForm = {
  mode: 'keep', name: '', command: '', user: DEFAULT_USER, ports: 'none', port: '', rangeStart: '', rangeEnd: '',
  portParam: '', policy: 'unexpected', boot: false,
};

/** Switching between keep and run once moves the restart policy to that mode's daemon default, unless the person
 *  chose one themselves. */
export function withMode(f: AddForm, mode: AddMode, policyTouched: boolean): AddForm {
  if (f.mode === mode) return f;
  return { ...f, mode, ...(policyTouched ? {} : { policy: mode === 'keep' ? 'unexpected' : 'false' }) };
}

export type AddField = 'name' | 'command' | 'user' | 'port' | 'rangeStart' | 'rangeEnd' | 'portParam';
export type AddCode =
  | 'required'
  | 'nameChars'
  | 'nameLong'
  | 'nameTaken'
  | 'commandLine'
  | 'userChars'
  | 'portNumber'
  | 'rangeOrder'
  | 'rangeSize'
  | 'paramChars';
export interface AddProblem {
  field: AddField;
  code: AddCode;
}

// The daemon's program name rule: starts with a letter or digit; letters, digits, '.', '-', '_'; 128 at most.
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// The account name rule both inputs publish: a letter or '_', then letters, digits, '_' and '-', maybe a final '$'.
const USER_RE = /^[A-Za-z_][A-Za-z0-9_-]*\$?$/;
// The daemon's port parameter rule: '-' or '--', a letter, then letters, digits, '_' and '-'.
const PARAM_RE = /^--?[A-Za-z][A-Za-z0-9_-]*$/;
const RANGE_MAX = 4096;

function port(v: string): number | null {
  const s = v.trim();
  if (!/^\d{1,5}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= 65535 ? n : null;
}

/** The checks the Hub can make. `taken`: the names of programs the list shows now (a keep's name must be new). */
export function checkAdd(f: AddForm, taken: readonly string[] = []): AddProblem[] {
  const out: AddProblem[] = [];
  const name = f.name.trim();
  if (f.mode === 'keep' && !name) out.push({ field: 'name', code: 'required' });
  else if (name && name.length > 128) out.push({ field: 'name', code: 'nameLong' });
  else if (name && !NAME_RE.test(name)) out.push({ field: 'name', code: 'nameChars' });
  else if (f.mode === 'keep' && name && taken.includes(name)) out.push({ field: 'name', code: 'nameTaken' });
  if (!f.command.trim()) out.push({ field: 'command', code: 'required' });
  else if (/[\n\r\u0000]/.test(f.command)) out.push({ field: 'command', code: 'commandLine' });
  const user = f.user.trim();
  if (!user) out.push({ field: 'user', code: 'required' });
  else if (!USER_RE.test(user) || utf8Bytes(user) > 32) out.push({ field: 'user', code: 'userChars' });
  if (f.mode === 'keep' && f.ports === 'one' && port(f.port) === null) out.push({ field: 'port', code: 'portNumber' });
  if (f.mode === 'keep' && f.ports === 'range') {
    const a = port(f.rangeStart);
    const b = port(f.rangeEnd);
    if (a === null) out.push({ field: 'rangeStart', code: 'portNumber' });
    if (b === null) out.push({ field: 'rangeEnd', code: 'portNumber' });
    if (a !== null && b !== null && b < a) out.push({ field: 'rangeEnd', code: 'rangeOrder' });
    else if (a !== null && b !== null && b - a + 1 > RANGE_MAX) out.push({ field: 'rangeEnd', code: 'rangeSize' });
    if (f.portParam.trim() && !PARAM_RE.test(f.portParam.trim())) out.push({ field: 'portParam', code: 'paramChars' });
  }
  return out;
}

/** The add body (ProgramInput): only what the form shows; everything else keeps the daemon's defaults. */
export function addBody(f: AddForm): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: f.name.trim(),
    command: f.command.trim(),
    user: f.user.trim(),
    autorestart: f.policy,
    boot: f.boot,
  };
  if (f.ports === 'one') body.ready_port = port(f.port);
  if (f.ports === 'range') {
    body.port_range = { start: port(f.rangeStart), end: port(f.rangeEnd) };
    if (f.portParam.trim()) body.port_param = f.portParam.trim();
  }
  return body;
}

/** The run-once body (EphemeralProgramInput): no ports, no boot (a quick-start takes neither). */
export function onceBody(f: AddForm): Record<string, unknown> {
  const name = f.name.trim();
  return { command: f.command.trim(), user: f.user.trim(), autorestart: f.policy, ...(name ? { name } : {}) };
}
