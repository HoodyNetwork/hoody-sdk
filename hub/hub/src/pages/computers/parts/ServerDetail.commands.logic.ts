// The server control commands of one server, read from the API's own answers. No React, no I/O.
// GET /servers/:id/available-commands lists what the person may run on a server (for a customer: only the built-in
// commands, only on a rented bare-metal server with a current rental); POST /servers/:id/execute-command runs one.
// A command that stops the server, or that is not plainly a harmless reading, is warned and confirmed before it is sent.

import { stringOrEmpty as str } from '@core';

type Raw = Record<string, unknown> | undefined;
const obj = (v: unknown): Raw => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

export type FieldKind = 'text' | 'number' | 'boolean' | 'choice';
export interface Field {
  name: string;
  kind: FieldKind;
  /** A number the schema types as an integer: a fraction is not accepted. */
  integer: boolean;
  required: boolean;
  choices: string[];
  /** The schema's own description, when it has one. */
  hint: string;
}
export interface ServerCommand {
  id: string;
  slug: string;
  name: string;
  description: string;
  risk: 'low' | 'medium' | 'high' | 'critical' | '';
  /** Plainly a harmless reading: low risk and no confirmation asked by the API. Everything else is warned. */
  readOnly: boolean;
  /** The spacing the API keeps between two runs of this command (seconds); null: none, or not said. */
  cooldownS: number | null;
  /** The most runs a day the API allows (a whole number above zero); null: no limit, or not said. */
  perDay: number | null;
  fields: Field[];
}
export interface CommandList {
  /** The API's own answer about the server: is_ready (null: not said) and an active rental (null: not said). */
  ready: boolean | null;
  active: boolean | null;
  commands: ServerCommand[];
}

const ID = /^[0-9a-fA-F]{24}$/;
const RISK = new Set(['low', 'medium', 'high', 'critical']);

/** The form fields of a command's parameter schema; null when the schema has a shape this form cannot ask for. */
export function fieldsOf(schema: unknown): Field[] | null {
  if (schema === null || schema === undefined) return [];
  const s = obj(schema);
  if (!s) return null;
  const props = obj(s.properties);
  if (!props) return Array.isArray(s.required) && s.required.length ? null : [];
  const required = Array.isArray(s.required) ? s.required.filter((x): x is string => typeof x === 'string') : [];
  const out: Field[] = [];
  for (const [name, def] of Object.entries(props)) {
    const d = obj(def);
    if (!d) return null;
    const choices = Array.isArray(d.enum) ? d.enum.filter((x): x is string => typeof x === 'string') : [];
    const kind: FieldKind | null = choices.length && Array.isArray(d.enum) && choices.length === d.enum.length ? 'choice' : d.type === 'string' ? 'text' : d.type === 'number' || d.type === 'integer' ? 'number' : d.type === 'boolean' ? 'boolean' : null;
    if (!kind) return null;
    out.push({ name, kind, integer: d.type === 'integer', required: required.includes(name), choices, hint: str(d.description) });
  }
  return required.every((r) => out.some((f) => f.name === r)) ? out : null;
}

/** The commands of the answer; a command whose parameters this form cannot ask for is left out (never sent blind). */
export function commandsOf(raw: unknown): CommandList | null {
  const d = obj(obj(raw)?.data);
  if (!d || !Array.isArray(d.commands)) return null;
  const info = obj(d.server_info);
  const commands: ServerCommand[] = [];
  for (const row of d.commands) {
    const c = obj(row);
    if (!c || !ID.test(str(c.id)) || !str(c.slug)) continue;
    const fields = fieldsOf(c.parameter_schema);
    if (!fields) continue;
    const risk = RISK.has(str(c.risk_level)) ? (str(c.risk_level) as ServerCommand['risk']) : '';
    commands.push({
      id: str(c.id),
      slug: str(c.slug),
      name: str(c.name) || str(c.slug),
      description: str(c.description),
      risk,
      readOnly: risk === 'low' && c.requires_confirmation === false,
      cooldownS: typeof c.cooldown_seconds === 'number' && Number.isFinite(c.cooldown_seconds) && c.cooldown_seconds > 0 ? c.cooldown_seconds : null,
      perDay: typeof c.rate_limit_per_day === 'number' && Number.isInteger(c.rate_limit_per_day) && c.rate_limit_per_day > 0 ? c.rate_limit_per_day : null,
      fields,
    });
  }
  return {
    ready: typeof info?.is_ready === 'boolean' ? info.is_ready : null,
    active: typeof info?.rental_status === 'string' ? info.rental_status === 'active' : null,
    commands,
  };
}

export type Values = Readonly<Record<string, string | boolean>>;

/** The parameters to send from what was typed; `missing` names the required fields still empty or not a number. */
export function paramsOf(fields: readonly Field[], values: Values): { params: Record<string, string | number | boolean>; missing: string[] } {
  const params: Record<string, string | number | boolean> = {};
  const missing: string[] = [];
  for (const f of fields) {
    const v = values[f.name];
    if (f.kind === 'boolean') {
      params[f.name] = v === true;
      continue;
    }
    const text = typeof v === 'string' ? v.trim() : '';
    if (!text) {
      if (f.required) missing.push(f.name);
      continue;
    }
    if (f.kind === 'number') {
      const n = Number(text);
      if (!Number.isFinite(n) || (f.integer && !Number.isInteger(n))) missing.push(f.name);
      else params[f.name] = n;
    } else if (f.kind === 'choice' && !f.choices.includes(text)) missing.push(f.name);
    else params[f.name] = text;
  }
  return { params, missing };
}

/** What one run sends: a harmless reading waits for its output; anything else is accepted and left to run (a command
 *  that stops the host would cut a waiting connection, which reads as an unknown outcome for no reason). */
export function requestBody(cmd: Pick<ServerCommand, 'id' | 'readOnly'>, params: Record<string, string | number | boolean>): Record<string, unknown> {
  return { command_id: cmd.id, parameters: params, wait: cmd.readOnly };
}

export interface RunVars {
  serverId: string;
  /** The rental the run was started from; kept in the identity only (no read depends on it). */
  rentalId: string;
  serverName: string;
  commandId: string;
  commandName: string;
  slug: string;
  readOnly: boolean;
  params: Record<string, string | number | boolean>;
}

/** What a held run keeps (never the parameters: they could hold a secret). */
export interface RunIdentity {
  serverId: string;
  rentalId: string;
  serverName: string;
  commandName: string;
  slug: string;
  readOnly: boolean;
}
export const identityOf = (v: RunVars): RunIdentity => ({ serverId: v.serverId, rentalId: v.rentalId, serverName: v.serverName, commandName: v.commandName, slug: v.slug, readOnly: v.readOnly });

export interface RunResult {
  /** True: the API accepted it and it runs on its own (no output yet). */
  accepted: boolean;
  status: string;
  output: string;
  exitCode: number | null;
}
export function resultOf(raw: unknown, waited: boolean): RunResult | null {
  const d = obj(obj(raw)?.data);
  if (!d) return null;
  const code = d.exit_code;
  return { accepted: !waited, status: str(d.status), output: str(d.output), exitCode: typeof code === 'number' && Number.isFinite(code) ? code : null };
}

/*
 * No automatic proof. Nothing the page can read says what became of a run whose answer was lost: a server's uptime or boot
 * time can lag behind the server (the API may answer from an earlier reading), and a restart by
 * someone else just before the press looks the same as this one. So a held run is never freed by a read: Check again only
 * refreshes the usage shown, and the person's warned Dismiss (naming the command and the server) is the one way out.
 */

export type RefusalKind = 'cooldown' | 'limit' | 'notReady' | 'generic';
/** Why a definite refusal (nothing was run), by what core hands the page: the HTTP status and the API's own code. A 429
 *  and the 409 codes of the rate limits are "too often"; the wait is only ever the one the API named (a 429's
 *  retry_after), never a guess. */
export function refusalOf(code: string | undefined, status: number | undefined): RefusalKind {
  const c = code ?? '';
  if (/COOLDOWN/.test(c)) return 'cooldown';
  if (status === 429 || /RATE_?LIMIT/.test(c)) return 'limit';
  return /NOT_READY/.test(c) ? 'notReady' : 'generic';
}

/** A span the API states exactly (a cooldown), split into whole hours, minutes and seconds with no rounding and no upper
 *  limit, largest first, zero parts left out: 61 is 1 minute 1 second, 90000 is 25 hours. Not a whole number above
 *  zero: null (said nowhere rather than said wrong). */
export function spanParts(seconds: unknown): { unit: 'seconds' | 'minutes' | 'hours'; count: number }[] | null {
  if (typeof seconds !== 'number' || !Number.isInteger(seconds) || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const sec = seconds % 60;
  const out: { unit: 'seconds' | 'minutes' | 'hours'; count: number }[] = [];
  if (h) out.push({ unit: 'hours', count: h });
  if (m) out.push({ unit: 'minutes', count: m });
  if (sec) out.push({ unit: 'seconds', count: sec });
  return out;
}

/** A wait the API named, in whole seconds, as the largest unit it fills (rounded up: "try again in" is never early).
 *  Not a number, below zero or over a day: not shown at all. */
export function waitParts(seconds: unknown): { unit: 'seconds' | 'minutes' | 'hours'; count: number } | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0 || seconds > 86_400) return null;
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 60) return { unit: 'seconds', count: s };
  if (s < 3600) return { unit: 'minutes', count: Math.ceil(s / 60) };
  return { unit: 'hours', count: Math.ceil(s / 3600) };
}
