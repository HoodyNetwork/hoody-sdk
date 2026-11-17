// What the "Get a computer" drawer may send. check(form,
// servers) returns the exact POST /projects/:id/computers body or the field errors. A field is in the
// body only when the person changed it from the API's default, so an untouched form sends
// {name, server_id, color}: the colour was preselected at random and shown, so it is sent as shown. The image
// is the API's default (Debian 13) and is never sent. The rules mirror the API's and refuse nothing it accepts.
import { utf8Bytes as utf8 } from '@core/pure';
import { countryFlag, formatStorage, normalizeHexColor } from '@kit';
import { serverFull } from './logic';
import { checkSshKey } from './ssh-logic';
import type { Computer, Server } from './types';

const HEX24 = /^[0-9a-f]{24}$/;
export const LIMITS = { name: 100, comment: 16000, envEntries: 256, envKey: 128, envValue: 4096 } as const;
// The whole map (the API's env rule): compact JSON bytes and the rendered block's bytes, each at most 4,608.
const ENV_TOTAL_MAX = 4608;
const BLOCK_FIXED = 97;
const ENV_KEY = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const ENV_FORBIDDEN = new Set(
  ('LD_PRELOAD LD_LIBRARY_PATH LD_AUDIT LD_DEBUG LD_PROFILE LD_BIND_NOW LD_TRACE_LOADED_OBJECTS PATH HOME SHELL USER LOGNAME USERNAME ' +
    'SUDO_COMMAND SUDO_USER SUDO_UID SUDO_GID SSH_AUTH_SOCK SSH_AGENT_PID DISPLAY XAUTHORITY DBUS_SESSION_BUS_ADDRESS IFS CDPATH ENV BASH_ENV BASH_FUNC_ ' +
    'PYTHONPATH PYTHONSTARTUP PERL5LIB PERL5OPT RUBYLIB RUBYOPT NODE_OPTIONS NODE_PATH CLASSPATH JAVA_TOOL_OPTIONS _JAVA_OPTIONS GCONV_PATH GETCONF_DIR ' +
    'HOSTALIASES LOCALDOMAIN RESOLV_HOST_CONF RES_OPTIONS TMPDIR TMP TEMP http_proxy https_proxy ftp_proxy no_proxy HTTP_PROXY HTTPS_PROXY FTP_PROXY NO_PROXY ALL_PROXY').split(' '),
);
const trim = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const wellFormed = (s: string): boolean => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

export interface CreateForm {
  name: string;
  suggestion: string;
  server: string;
  project: string;
  ssh: string;
  comment: string;
  color: string;
  /** The colour preselected when the form opened: sent, but not a change. */
  colorStart: string;
  hoodyKit: boolean;
  devKit: boolean;
  devKitTouched: boolean;
  ai: boolean;
  ramdisk: boolean;
  autostart: boolean;
  kvm: boolean;
  env: string;
  realms: readonly string[];
  hostRealm?: string;
}

export const DEFAULT_FORM: CreateForm = {
  name: '', suggestion: '', server: '', project: '', ssh: '', comment: '', color: '', colorStart: '',
  hoodyKit: true, devKit: true, devKitTouched: false, ai: true, ramdisk: true, autostart: true, kvm: false,
  env: '', realms: [],
};

export interface EnvError {
  line: number;
  code: string;
  key: string | null;
}

/** KEY=value per line; blank lines and # lines are skipped. A value is exactly what follows the first = on its line. */
export function parseEnv(text: string): { vars: Record<string, string>; count: number; errors: EnvError[] } {
  const vars: Record<string, string> = Object.create(null) as Record<string, string>;
  const errors: EnvError[] = [];
  let count = 0;
  let blockBytes = 0;
  const rows = text.split(/\r\n|\n|\r/);
  rows.forEach((raw, i) => {
    const line = trim(raw);
    if (!line || line.startsWith('#')) return;
    const eq = raw.indexOf('=');
    const key = trim(eq < 0 ? raw : raw.slice(0, eq));
    const val = eq < 0 ? null : raw.slice(eq + 1);
    let code: string | null = null;
    if (val === null) code = 'envNoEquals';
    else if (!key || !ENV_KEY.test(key)) code = 'envKeyShape';
    else if (utf8(key) > LIMITS.envKey) code = 'envKeyLong';
    else if (/^HOODY_/i.test(key)) code = 'envKeyReserved';
    else if (ENV_FORBIDDEN.has(key) || /^LD_/i.test(key)) code = 'envKeyForbidden';
    else if (key in vars) code = 'envDuplicate';
    else if (val === '') code = 'envValueEmpty';
    else if (val.includes('#')) code = 'envValueHash';
    else if (val.includes('\0')) code = 'envValueNul';
    else if (!wellFormed(val)) code = 'envValueUnicode';
    else if (utf8(val) > LIMITS.envValue) code = 'envValueLong';
    if (code || val === null) {
      errors.push({ line: i + 1, code: code ?? 'envNoEquals', key: key || null });
      return;
    }
    vars[key] = val;
    count++;
    blockBytes += utf8(key) + utf8(val) + 4;
  });
  if (count > LIMITS.envEntries && !errors.length) errors.push({ line: 0, code: 'envTooMany', key: null });
  if (!errors.length && count) {
    const json = utf8(JSON.stringify(vars));
    if (json > ENV_TOTAL_MAX || blockBytes + BLOCK_FIXED > ENV_TOTAL_MAX) errors.push({ line: 0, code: 'envTooBig', key: null });
  }
  return { vars, count, errors };
}

/** The name that will be sent: what was typed, else the suggestion, else 'rand' (the API's word for "make one up"). */
export function nameOf(form: Pick<CreateForm, 'name' | 'suggestion'>): { name: string; auto: boolean } {
  const typed = trim(form.name);
  if (typed) return { name: typed, auto: false };
  const sug = trim(form.suggestion);
  return sug ? { name: sug, auto: true } : { name: 'rand', auto: true };
}

function devKitSent(form: CreateForm): boolean {
  return form.devKitTouched && form.devKit !== form.hoodyKit;
}

export function extraRealms(form: Pick<CreateForm, 'realms' | 'hostRealm'>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of form.realms) {
    if (HEX24.test(r) && r !== form.hostRealm && !seen.has(r)) {
      seen.add(r);
      out.push(r);
    }
  }
  return out;
}

/** The option ids that differ from the defaults (for the collapsed summary). */
export function changed(form: CreateForm): string[] {
  const out: string[] = [];
  if (trim(form.ssh)) out.push('ssh');
  if (trim(form.comment)) out.push('comment');
  if ((normalizeHexColor(form.color) ?? trim(form.color)) !== (normalizeHexColor(form.colorStart) ?? trim(form.colorStart))) out.push('color');
  if (!form.hoodyKit) out.push('hoodyKit');
  if (devKitSent(form)) out.push('devKit');
  if (!form.ai) out.push('ai');
  if (!form.ramdisk) out.push('ramdisk');
  if (!form.autostart) out.push('autostart');
  if (form.kvm) out.push('kvm');
  if (trim(form.env)) out.push('env');
  if (extraRealms(form).length) out.push('realms');
  return out;
}

export type CreateCheck =
  | { ok: true; body: Record<string, unknown>; name: string; auto: boolean }
  | { ok: false; errors: Record<string, string>; envErrors: EnvError[] };

export function check(form: CreateForm, servers: readonly Pick<Server, 'id' | 'free'>[]): CreateCheck {
  const errors: Record<string, string> = {};
  const n = nameOf(form);
  if (!/^[A-Za-z0-9_-]{3,100}$/.test(n.name)) errors.name = 'name';
  // The API reads `rand` in any case as "make a name up": a typed or suggested `rand` would make a computer under another
  // name, which a read-back of the sent name never finds. Only nameOf's own fallback (nothing typed, no suggestion) sends it.
  else if (n.name.toLowerCase() === 'rand' && !(n.auto && !trim(form.suggestion))) errors.name = 'nameReserved';
  const sv = servers.find((x) => String(x.id) === String(form.server));
  if (!sv) errors.server = 'server';
  const ssh = trim(form.ssh) ? checkSshKey(form.ssh) : null;
  if (ssh && !ssh.ok) errors.ssh = `ssh_${ssh.code}`;
  if (Array.from(form.comment).length > LIMITS.comment) errors.comment = 'commentLong';
  const col = normalizeHexColor(form.color);
  if (trim(form.color) && !col) errors.color = 'color';
  if (form.kvm && sv?.free) errors.kvm = 'kvmFree';
  const env = parseEnv(form.env);
  if (env.errors.length) errors.env = env.errors[0]?.code ?? 'env';
  if (Object.keys(errors).length || !sv) return { ok: false, errors, envErrors: env.errors };

  const body: Record<string, unknown> = { name: n.name, server_id: String(sv.id) };
  if (ssh?.ok) body.ssh_public_key = ssh.key;
  if (trim(form.comment)) body.comment = form.comment;
  if (col) body.color = col;
  if (!form.hoodyKit) body.hoody_kit = false;
  if (devKitSent(form)) body.dev_kit = form.devKit;
  if (!form.ai) body.ai = false;
  if (!form.ramdisk) body.ramdisk = false;
  if (!form.autostart) body.autostart = false;
  if (form.kvm) body.kvm = true;
  if (env.count) body.environment_vars = env.vars;
  const rs = extraRealms(form);
  if (rs.length) body.realm_ids = rs;
  return { ok: true, body, name: n.name, auto: n.auto };
}

/** The new computer's SSH key as a create answer states it: 'none' (the answer names no key), 'set' (it names one),
 *  undefined when the answer does not say. Only this word leaves the answer (data.ts create `select`): never the key,
 *  never anything else of the answer (its environment is scrubbed before this reads it). */
export function createdKey(answer: unknown): 'none' | 'set' | undefined {
  const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
  const d = rec(rec(answer)?.data);
  const c = rec(d?.computer) ?? d;
  if (!c || !('ssh_public_key' in c)) return undefined;
  const k = c.ssh_public_key;
  return k === null || k === '' ? 'none' : typeof k === 'string' ? 'set' : undefined;
}

/** A create that sent a key and was answered "created" with none: the API made the computer but did not install the
 *  key (it is already on another computer; the API's own note on that create). */
export function keyNotInstalled(body: Record<string, unknown>, answered: unknown): boolean {
  return typeof body.ssh_public_key === 'string' && body.ssh_public_key !== '' && answered === 'none';
}

/** The server Select's value for "get a new server": never a server id (check() refuses it). */
export const NEW_SERVER = '__new_server';

type T = (key: string, vars?: Record<string, string | number>) => string;
export interface ServerOption {
  value: string;
  label: string;
  description?: string;
  icon?: 'plus';
  isDisabled?: boolean;
}

/**
 * The server choices of a new-computer form, the same wherever a server is picked: active
 * servers with room first, then full ones, disabled, with an upgrade nudge; last, when the market can be reached,
 * "get a new server". The room shown is the API's used/max where it gives one (free and platform servers outside
 * a realm). A dedicated server outside a realm shows how many computers it holds. Inside a realm nothing is
 * shown, since the API and the list only see that realm.
 */
export function serverOptions(
  servers: readonly Server[] | undefined,
  o: { t: T; computers: readonly Pick<Computer, 'server_id'>[] | undefined; inRealm: boolean; market: boolean },
): ServerOption[] {
  const active = (servers ?? []).filter((x) => x.status === 'active' || !x.status);
  const row = (x: Server): ServerOption => {
    const full = serverFull(x);
    const n = !x.cap && !x.free && !o.inRealm && o.computers ? o.computers.filter((c) => c.server_id === x.id).length : null;
    const room = o.inRealm ? null : x.cap ? o.t('server.cap', { used: x.cap.used, max: x.cap.max }) : n !== null ? o.t('create.serverCount', { count: n }) : null;
    const label = [`${countryFlag(x.cc)} ${x.name}`.trim(), x.place ? x.place.split(',')[0] : null, room].filter(Boolean).join(' · ');
    // A size the server does not say is left out, never shown as 0; sizes by the kit's formatStorage.
    const specs = x.cpu === null ? undefined : x.ram === null ? o.t('size.cores', { count: x.cpu }) : o.t('server.specs', { cpu: x.cpu, ram: formatStorage(x.ram) });
    return full ? { value: x.id, label, description: o.t('create.serverFull'), isDisabled: true } : { value: x.id, label, description: specs };
  };
  const out = [...active.filter((x) => !serverFull(x)).map(row), ...active.filter(serverFull).map(row)];
  if (o.market) out.push({ value: NEW_SERVER, label: o.t('create.newServer'), description: o.t('create.newServerHelp'), icon: 'plus' });
  return out;
}
