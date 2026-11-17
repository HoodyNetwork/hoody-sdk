// Vitest: the Bots fixtures send only what the live adapter (data.ts) can produce, so tests and shots
// never prove a screen on a state no Bot can be in. The agent builds a Bot's list row and its page from one Bot
// (one view), sends a gate without a tool or a helper (pending_gate: session_id, gate_id, type, summary, generation), reads a list's
// "more than listed" from meta.total (none on an empty list, none for a computer whose list was not read), and pauses a Bot at its
// limit only once the turn that spent the last unit has ended. data.ts reads no provider readiness and no capability from the view,
// derives attention only from chat apps, and createBotFlow returns a link wherever it returns a secret. The states no live adapter
// produces are named in FIXTURE_ONLY_STATES, each with why it is kept, and that list is exactly what this file finds.
import { beforeAll, describe, expect, it } from 'vitest';
import type { BotRow, BotView, Channel, Computer, NewBotResult } from './data';
import fixtures, { FIXTURE_ONLY_STATES } from './fixtures';
import { botKey, statusOf } from './logic';
import { specLabel } from './models.logic';
import shots, { LINK_ON } from './shots';

/** The fields of a shot this file reads (@app/shots.types is closed to page tests). */
type Shot = { name: string; state?: string; click?: string; act?: ReadonlyArray<{ click?: string }> };
type State = {
  bots?: { data?: readonly BotRow[] };
  view?: { data?: Readonly<Record<string, BotView>> };
  computers?: { data?: readonly Computer[] };
  channels?: { data?: Readonly<Record<string, { channels: readonly Channel[] }>> };
  createBot?: { outcome?: string; data?: NewBotResult };
};
const states = Object.entries(fixtures.states as unknown as Record<string, State>);

/** The states data.ts cannot produce: a view with readiness, a false capability or an attention it never derives, and a createBot result it never returns. */
const impossible = new Set<string>();

beforeAll(() => {
  for (const [name, st] of states) {
    const rows = st.bots?.data ?? [];
    for (const [key, v] of Object.entries(st.view?.data ?? {})) {
      if (v.provider.ready !== 'unknown' || !v.caps.botExpect || !v.caps.botGateHttp || !v.caps.botTurnCancel) impossible.add(name);
      const channels = st.channels?.data?.[key]?.channels ?? [];
      const chatsWaiting = rows.find((r) => r.key === key)?.chatsWaiting ?? 0;
      for (const a of v.attention) {
        const derivable =
          a.row === 'channels' && ((a.key === 'chatapp' && channels.some((c) => c.state === 'auth_failed' || c.state === 'needs_owner')) || (a.key === 'chatwait' && chatsWaiting > 0));
        if (!derivable) impossible.add(name);
      }
    }
    const made = st.createBot?.data?.state;
    if (st.createBot?.outcome === 'done' && (made === 'keylost' || made === 'nametaken' || made === 'botunknown')) impossible.add(name);
  }
});

describe('the Bots fixtures are states the live adapter can produce', () => {
  it('a Bot\'s list row and its page agree on every field both are built from', () => {
    const off: string[] = [];
    for (const [name, st] of states) {
      const views = st.view?.data ?? {};
      for (const r of st.bots?.data ?? []) {
        if (r.key !== botKey(r.computerId, r.realm, r.id)) off.push(`${name}: ${r.id} key ${r.key}`);
        const v = views[r.key];
        if (!v) {
          off.push(`${name}: ${r.id} has no page under ${r.key}`); // the agent builds both from one Bot: a row always has its page
          continue;
        }
        const pairs: Array<[string, unknown, unknown]> = [
          ['name', r.name, v.name],
          ['role', r.role, v.role],
          ['uid', r.uid, v.uid],
          ['model', r.model, v.model],
          ['modelLabel', r.modelLabel, v.modelLabel],
          ['queued', r.queued, v.queued],
          ['status', r.status, statusOf(v)],
          ['chats waiting', r.chatsWaiting > 0, v.attention.some((a) => a.key === 'chatwait')],
        ];
        for (const [field, row, view] of pairs) if (row !== view) off.push(`${name}: ${r.id} ${field} list ${String(row)}, page ${String(view)}`);
      }
    }
    expect(off).toEqual([]);
  });

  it('a held model is labelled as the live adapter labels it (the spec\'s own name, the raw provider id), never a catalogue label', () => {
    const off: string[] = [];
    for (const [name, st] of states) {
      for (const r of st.bots?.data ?? []) if (r.model !== '' && r.modelLabel !== specLabel(r.model)) off.push(`${name}: row ${r.id} ${r.modelLabel}, live ${specLabel(r.model)}`);
      for (const v of Object.values(st.view?.data ?? {})) {
        if (v.model !== '' && v.modelLabel !== specLabel(v.model)) off.push(`${name}: page ${v.id} ${v.modelLabel}, live ${specLabel(v.model)}`);
        const provider = v.model.split('/')[0] ?? '';
        if (v.provider.id !== provider || v.provider.label !== provider) off.push(`${name}: page ${v.id} provider ${v.provider.id}/${v.provider.label}, live ${provider}`);
      }
    }
    expect(off).toEqual([]);
  });

  it('a gate carries no tool and no helper (the agent sends neither)', () => {
    const off: string[] = [];
    for (const [name, st] of states) for (const [key, v] of Object.entries(st.view?.data ?? {})) if (v.gate && (v.gate.tool != null || v.gate.advanced != null)) off.push(`${name}: ${key}`);
    expect(off).toEqual([]);
  });

  it('a Bot paused at its limit runs no turn (the pause follows the turn that spent the last unit)', () => {
    const off: string[] = [];
    for (const [name, st] of states) for (const [key, v] of Object.entries(st.view?.data ?? {})) if (v.pausedAtLimit && v.turnRunning) off.push(`${name}: ${key}`);
    expect(off).toEqual([]);
  });

  it('only a running computer whose list was read has Bots, a paused count or "more than listed"', () => {
    const off: string[] = [];
    for (const [name, st] of states) {
      const computers = st.computers?.data;
      if (!computers) continue;
      const rows = st.bots?.data ?? [];
      const listed = new Set(rows.map((r) => r.computerId));
      const read = new Set(computers.filter((c) => c.state === 'running' && c.listState === 'ok').map((c) => c.id));
      for (const c of computers) {
        if (read.has(c.id)) {
          if (c.hasMore && !listed.has(c.id)) off.push(`${name}: ${c.name} has more than listed and none listed`);
        } else {
          if (c.suspended > 0) off.push(`${name}: ${c.name} has a paused count, its list was not read`);
          if (c.hasMore) off.push(`${name}: ${c.name} has more than listed, its list was not read`);
        }
      }
      for (const r of rows) if (!read.has(r.computerId)) off.push(`${name}: ${r.id} listed from ${r.computerId}, whose list was not read`);
    }
    expect(off).toEqual([]);
  });

  it('a created Bot with a secret has the link the secret belongs to, and a done result has both or neither', () => {
    const off: string[] = [];
    for (const [name, st] of states) {
      const made = st.createBot?.outcome === 'done' ? st.createBot.data : undefined;
      if (!made) continue;
      if (made.secret != null && made.link == null) off.push(`${name}: a secret without a link`);
      if (made.state === 'done' && (made.link == null) !== (made.secret == null)) off.push(`${name}: done with only one of link and secret`);
    }
    expect(off).toEqual([]);
  });

  it('a New Bot shot asks for the link exactly when its result carries one', () => {
    const off: string[] = [];
    let checked = 0;
    for (const shot of shots as readonly Shot[]) {
      const creates = shot.click === 'Create Bot' || (shot.act ?? []).some((a) => 'click' in a && a.click === 'Create Bot');
      if (!creates) continue;
      const name = shot.state ?? fixtures.default;
      const result = (fixtures.states as unknown as Record<string, State>)[name]?.createBot;
      if (result?.outcome !== 'done' || !result.data) continue;
      checked++;
      if ((shot.click === LINK_ON) !== (result.data.link != null)) off.push(`${shot.name}: ${name} result link ${result.data.link != null ? 'present' : 'null'}, shot click ${String(shot.click)}`);
    }
    expect(checked).toBeGreaterThan(0);
    expect(off).toEqual([]);
  });

  it('the states no live adapter produces are named, and no other state is one', () => {
    for (const name of FIXTURE_ONLY_STATES) expect(Object.keys(fixtures.states), name).toContain(name);
    expect([...impossible].sort()).toEqual([...FIXTURE_ONLY_STATES].sort());
  });
});
