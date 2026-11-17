// Vitest: the New realm rules and write engine: ids, names, picker rows, and the engine's
// name-first order, single sends, read-first retries and stops.
import { describe, expect, it } from 'vitest';
import { checkName, engine, freshId, mintId, nextSet, notSeenText, rowsOf, summary, type Io, type WriteResult } from './logic';

const A = 'a'.repeat(24), B = 'b'.repeat(24), C1 = 'c'.repeat(23) + '1', C2 = 'c'.repeat(23) + '2';
const fold = (v: string) => v.toLowerCase();
const validate = (m: Record<string, string>) => { for (const v of Object.values(m)) if (v === 'all') throw new Error('reserved'); return m; };

describe('ids', () => {
  it('mints 24 lower-case hex from the secure source, and nothing without one', () => {
    expect(mintId((b) => b.fill(171))).toBe('ab'.repeat(12));
    expect(mintId()).toMatch(/^[0-9a-f]{24}$/);
    const c = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try { expect(mintId()).toBe(''); } finally { Object.defineProperty(globalThis, 'crypto', { value: c, configurable: true }); }
  });

  it('re-draws on a collision with a known id', () => {
    let n = 0;
    const fill = (b: Uint8Array) => b.fill(n++ === 0 ? 0xaa : 0xbb);
    expect(freshId([A], fill)).toBe(B);
  });
});

describe('names', () => {
  it('refuses an empty name, a broken rule and a name another realm has (folded)', () => {
    expect(checkName('  ', {}, validate, fold)).toMatchObject({ ok: false, reason: 'empty' });
    expect(checkName('all', {}, validate, fold)).toMatchObject({ ok: false, reason: 'rule' });
    expect(checkName('Lab', { [A]: 'lab' }, validate, fold)).toMatchObject({ ok: false, reason: 'taken' });
    expect(checkName(' Clients ', { [A]: 'lab' }, validate, fold)).toEqual({ ok: true, alias: 'Clients' });
  });
});

describe('picker rows', () => {
  it('keeps one row per computer, drops deleting ones and bad ids, sorts by name', () => {
    const rows = rowsOf([
      { id: C2, name: 'zeta', status: 'running', realm_ids: [A, 'bad'] },
      { id: C1, name: 'alpha', status: 'running', project_alias: 'Home', server_name: 'n12' },
      { id: C1, name: 'dup' },
      { id: B, name: 'gone', status: 'deleting' },
      { id: 'nope', name: 'x' },
    ]);
    expect(rows.map((r) => r.name)).toEqual(['alpha', 'zeta']);
    expect(rows[1]?.realms).toEqual([A]);
  });


  it('nextSet keeps every realm the computer has and adds the new one once', () => {
    expect(nextSet([A, B], C1)).toEqual([A, B, C1]);
    expect(nextSet([A, C1], C1)).toEqual([A, C1]);
  });
});

// A fake world: names map, each computer's realms, and the answers to give.
function world(o: { name?: WriteResult[]; write?: Record<string, WriteResult>; readFails?: Set<string>; namesRead?: () => Promise<Record<string, string>>; alive?: () => boolean } = {}) {
  const realms: Record<string, string[]> = { [C1]: [A], [C2]: [] };
  const names: Record<string, string> = {};
  const sends: string[] = [];
  const nameAnswers = o.name ?? [{ outcome: 'done' }];
  const io: Io = {
    setName: async (id, alias) => {
      sends.push('name');
      const r = nameAnswers.shift() ?? { outcome: 'done' };
      if (r.outcome === 'done' || r.outcome === 'unknown') names[id] = alias;
      return r;
    },
    readNames: o.namesRead ?? (async () => ({ ...names })),
    setTint: () => sends.push('tint'),
    readRealms: async (c) => (o.readFails?.has(c) ? null : (realms[c] ?? []).slice()),
    writeRealms: async (c, set) => {
      sends.push(`put:${c}`);
      const r = o.write?.[c] ?? { outcome: 'done' };
      if (r.outcome === 'done' || r.outcome === 'unknown') realms[c] = set;
      return r;
    },
    settleRealms: async (c, _set, how) => { sends.push(`${how}:${c}`); return 'settled' as const; },
    alive: o.alive ?? (() => true),
    refresh: async () => { sends.push('refresh'); },
  };
  return { io, realms, names, sends };
}
const free = () => true;
const pick = [{ id: C1, name: 'alpha', project: '', server: '', status: '', realms: [A] }, { id: C2, name: 'beta', project: '', server: '', status: '', realms: [] }];

describe('engine', () => {
  it('an empty realm: the name alone is written, then the colour, and it is done', async () => {
    const w = world();
    const s = await engine({ id: B, alias: 'Clients', color: 'teal', rows: [], io: w.io, free }).start();
    expect(w.sends).toEqual(['name', 'tint', 'refresh']);
    expect(summary(s).kind).toBe('empty');
  });

  it('the name goes first, then each computer once with its other realms kept', async () => {
    const w = world();
    const s = await engine({ id: B, alias: 'Clients', color: 'teal', rows: pick, io: w.io, free }).start();
    expect(w.sends).toEqual(['name', `put:${C1}`, `put:${C2}`, 'tint', 'refresh']);
    expect(w.realms[C1]).toEqual([A, B]);
    expect(summary(s)).toMatchObject({ kind: 'ok', saved: 2 });
  });

  it('a refused name sends no computer', async () => {
    const w = world({ name: [{ outcome: 'failed', code: 'ALIAS_INVALID', notSent: true }] });
    const s = await engine({ id: B, alias: 'Clients', color: '', rows: pick, io: w.io, free }).start();
    expect(w.sends).toEqual(['name']);
    expect(summary(s).kind).toBe('nameFailed');
  });

  it('a lost name answer is held; the check only reads and, seeing it there, sends no second name and no computer', async () => {
    const w = world({ name: [{ outcome: 'unknown' }] });
    const e = engine({ id: B, alias: 'Clients', color: '', rows: pick, io: w.io, free });
    expect(summary(await e.start()).kind).toBe('nameUnknown');
    expect(w.sends).toEqual(['name', 'refresh']);
    const s = await e.checkName();
    expect(w.sends.filter((x) => x === 'name' || x.startsWith('put'))).toEqual(['name']);
    expect(summary(s)).toMatchObject({ kind: 'part', waiting: 2 });
    expect(summary(await e.sendComputers()).kind).toBe('ok');
    expect(w.sends.filter((x) => x.startsWith('put'))).toEqual([`put:${C1}`, `put:${C2}`]);
  });

  it('an answered name whose read right after fails is not called made: no computer goes until Check again shows it', async () => {
    let reads = 0;
    const live: Record<string, string> = {};
    const w = world({ namesRead: async () => { reads++; if (reads === 2) throw new Error('down'); return { ...live, ...w.names }; } });
    const e = engine({ id: B, alias: 'Clients', color: 'teal', rows: pick, io: w.io, free });
    const s = await e.start();
    expect(s.name).toMatchObject({ state: 'unknown', code: 'NAME_UNCHECKED' });
    expect(summary(s).kind).toBe('nameUnknown');
    expect(w.sends.filter((x) => x.startsWith('put') || x === 'tint')).toEqual([]);
    expect(e.canCheckName()).toBe(true);
    expect(e.canSendComputers()).toBe(false);
    const c = await e.checkName();
    expect(c.name).toMatchObject({ state: 'saved', code: null });
    expect(e.canSendComputers()).toBe(true);
    expect(w.sends.filter((x) => x === 'name')).toEqual(['name']);
  });

  it('an answered name replaced meanwhile, with the read right after failing: Check again finds it lost, never made', async () => {
    let reads = 0;
    const w = world({ namesRead: async () => { reads++; if (reads === 2) throw new Error('down'); return reads === 1 ? {} : { [A]: 'Other' }; } });
    const e = engine({ id: B, alias: 'Clients', color: '', rows: pick, io: w.io, free });
    await e.start();
    const c = await e.checkName();
    expect(c.name.state).toBe('missing');
    expect(e.canSendComputers()).toBe(false);
    expect(w.sends.filter((x) => x.startsWith('put'))).toEqual([]);
  });

  it('an API refusal of the name keeps its facts for Details; a refusal made here has none', async () => {
    const err = { status: 403, code: 'VAULT_LIMIT_EXCEEDED' };
    const w = world({ name: [{ outcome: 'failed', code: 'VAULT_LIMIT_EXCEEDED', error: err }] });
    const s = await engine({ id: B, alias: 'Clients', color: '', rows: pick, io: w.io, free }).start();
    expect(s.name).toMatchObject({ state: 'failed', code: 'VAULT_LIMIT_EXCEEDED' });
    expect(s.name.error).toBe(err);
    const taken = await engine({ id: B, alias: 'Clients', color: '', rows: pick, io: world().io, free: () => false }).start();
    expect(taken.name.error).toBeUndefined();
  });

  it('the name is checked again just before sending: taken meanwhile, or the names unreadable, sends nothing', async () => {
    const taken = world();
    const e1 = engine({ id: B, alias: 'Clients', color: '', rows: pick, io: taken.io, free: () => false });
    const s1 = await e1.start();
    expect(s1.name).toMatchObject({ state: 'failed', code: 'NAME_TAKEN', notSent: true });
    expect(e1.canSendName()).toBe(false);
    expect(e1.canRestart()).toBe(true);
    const down = world({ namesRead: () => Promise.reject(new Error('down')) });
    const e2 = engine({ id: B, alias: 'Clients', color: '', rows: pick, io: down.io, free });
    expect((await e2.start()).name).toMatchObject({ state: 'failed', code: 'NAMES_UNREAD', notSent: true });
    expect([...taken.sends, ...down.sends]).toEqual([]);
  });

  it('a saved name that another change replaced right after is missing, and only the explicit press sends it again', async () => {
    const w = world();
    let reads = 0;
    w.io.readNames = async () => (++reads === 2 ? {} : { ...w.names });
    const e = engine({ id: B, alias: 'Clients', color: '', rows: pick, io: w.io, free });
    const s = await e.start();
    expect(s.name).toMatchObject({ state: 'missing', code: 'NAME_LOST' });
    expect(w.sends.filter((x) => x.startsWith('put'))).toEqual([]);
    expect(e.canSendName()).toBe(true);
    // The other change really replaced it: the vault no longer holds it.
    delete w.names[B];
    expect(summary(await e.sendName()).kind).toBe('ok');
    expect(w.sends.filter((x) => x === 'name')).toHaveLength(2);
  });

  it('a check whose read fails settles nothing and sends nothing', async () => {
    let reads = 0;
    const w = world({ name: [{ outcome: 'unknown' }], namesRead: () => (++reads === 1 ? Promise.resolve({}) : Promise.reject(new Error('down'))) });
    const e = engine({ id: B, alias: 'Clients', color: '', rows: pick, io: w.io, free });
    await e.start();
    const s = await e.checkName();
    expect(s.name).toMatchObject({ state: 'unknown', unread: true });
    expect(w.sends.filter((x) => x.startsWith('put') || x === 'name')).toEqual(['name']);
  });

  it('while the name is unknown, no second send is offered and a press sends nothing', async () => {
    const w = world({ name: [{ outcome: 'unknown' }] });
    const e = engine({ id: B, alias: 'Clients', color: '', rows: pick, io: w.io, free });
    await e.start();
    expect(e.canSendName()).toBe(false);
    await e.sendName();
    expect(w.sends.filter((x) => x === 'name')).toHaveLength(1);
  });

  it('a computer whose answer and read-back were both lost is offered Check, never a second send', async () => {
    const w = world({ write: { [C2]: { outcome: 'unknown' } } });
    const real = w.io.readRealms;
    let n = 0;
    w.io.readRealms = async (c: string) => (c === C2 && n++ === 1 ? null : real(c));
    const e = engine({ id: B, alias: 'Clients', color: '', rows: pick, io: w.io, free });
    const s = await e.start();
    expect(s.items[1]?.state).toBe('unknown');
    expect(summary(s)).toMatchObject({ kind: 'part', saved: 1, unknown: 1, refused: 0 });
    expect(e.canSendComputers()).toBe(false);
    expect(e.canCheckComputers()).toBe(true);
    await e.sendComputers();
    expect(w.sends.filter((x) => x === `put:${C2}`)).toHaveLength(1);
  });

  it('a computer whose realms moved since shown is not sent to', async () => {
    const w = world();
    w.realms[C2] = [A];
    const s = await engine({ id: B, alias: 'Clients', color: '', rows: pick, io: w.io, free }).start();
    expect(w.sends).not.toContain(`put:${C2}`);
    expect(s.items[1]).toMatchObject({ state: 'changed', shown: [A] });
    expect(summary(s)).toMatchObject({ kind: 'part', refused: 1 });
  });

  it('a failed fresh read sends nothing to that computer; Check only reads, and only the explicit send sends, once', async () => {
    const fails = new Set([C1]);
    const w = world({ readFails: fails });
    const e = engine({ id: B, alias: 'Clients', color: '', rows: pick, io: w.io, free });
    expect((await e.start()).items[0]?.state).toBe('unchecked');
    expect(w.sends).not.toContain(`put:${C1}`);
    fails.clear();
    expect((await e.checkComputers()).items[0]?.state).toBe('missing');
    expect(w.sends).not.toContain(`put:${C1}`);
    const s = await e.sendComputers();
    expect(w.sends.filter((x) => x === `put:${C1}`)).toHaveLength(1);
    expect(s.items[0]?.state).toBe('saved');
  });

  it('a name the check finds missing is sent again only on the explicit press, once', async () => {
    const w = world();
    w.io.setName = (() => {
      const real = w.io.setName;
      let n = 0;
      // The first write's answer is lost and it did not land; the second lands.
      return async (id: string, alias: string) => (n++ === 0 ? (w.sends.push('name'), { outcome: 'unknown' as const }) : real(id, alias));
    })();
    const e = engine({ id: B, alias: 'Clients', color: '', rows: [], io: w.io, free });
    await e.start();
    const m = await e.checkName();
    expect(m.name).toMatchObject({ state: 'missing', out: true });
    // The earlier write may still land after a read without it: not failed, Check stays, and Leave is guarded.
    expect(summary(m).kind).toBe('nameUnknown');
    expect(w.sends.filter((x) => x === 'name')).toHaveLength(1);
    expect(e.canCheckName()).toBe(true);
    const s = await e.sendName();
    expect(w.sends.filter((x) => x === 'name')).toHaveLength(2);
    expect(summary(s).kind).toBe('empty');
  });

  it('another name on this id means the realm was made and renamed since: saved under that name, never written over', async () => {
    const w = world({ name: [{ outcome: 'unknown' }] });
    w.io.setName = async () => (w.sends.push('name'), { outcome: 'unknown' as const });
    let reads = 0;
    w.io.readNames = async () => (++reads === 1 ? {} : { [B]: 'Other' });
    const e = engine({ id: B, alias: 'Clients', color: '', rows: pick, io: w.io, free });
    await e.start();
    const s = await e.checkName();
    expect(s.name).toMatchObject({ state: 'saved', code: 'RENAMED' });
    expect(s.alias).toBe('Other');
    expect(e.canSendName()).toBe(false);
    expect(e.canSendComputers()).toBe(true);
    expect(w.sends.filter((x) => x === 'name')).toHaveLength(1);
  });

  it('a lost name that lands after a check found it missing: Try again finds it and sends nothing again', async () => {
    const w = world({ name: [{ outcome: 'unknown' }] });
    w.io.setName = async () => (w.sends.push('name'), { outcome: 'unknown' as const });
    let reads = 0;
    w.io.readNames = async () => (++reads <= 2 ? {} : { [B]: 'Clients' });
    const e = engine({ id: B, alias: 'Clients', color: '', rows: [], io: w.io, free: (m) => !Object.values(m).includes('Clients') });
    await e.start();
    expect((await e.checkName()).name.state).toBe('missing');
    const s = await e.sendName();
    expect(s.name).toMatchObject({ state: 'saved', code: null });
    expect(w.sends.filter((x) => x === 'name')).toHaveLength(1);
    expect(summary(s).kind).toBe('empty');
  });

  it('a computer that moved is shown with its new set; the explicit send keeps that new set and adds the realm', async () => {
    const w = world();
    w.realms[C2] = [A];
    const e = engine({ id: B, alias: 'Clients', color: '', rows: pick, io: w.io, free });
    expect((await e.start()).items[1]?.state).toBe('changed');
    await e.sendComputers();
    expect(w.realms[C2]).toEqual([A, B]);
    expect(w.sends.filter((x) => x === `put:${C2}`)).toHaveLength(1);
  });

  it('a lost computer answer is unknown; the retry finds it in and sends nothing more', async () => {
    const w = world({ write: { [C2]: { outcome: 'unknown' } } });
    w.io.readRealms = (() => {
      let n = 0;
      const real = w.io.readRealms;
      return async (c: string) => (c === C2 && n++ === 1 ? null : real(c));
    })();
    const e = engine({ id: B, alias: 'Clients', color: '', rows: pick, io: w.io, free });
    expect((await e.start()).items[1]?.state).toBe('unknown');
    const s = await e.checkComputers();
    expect(w.sends.filter((x) => x === `put:${C2}`)).toHaveLength(1);
    expect(s.items[1]?.state).toBe('saved');
    expect(w.sends).toContain(`applied:${C2}`);
  });

  it('a computer write the Realm limit refused is never sent again, and the computers after it are not sent', async () => {
    const w = world();
    w.io.writeRealms = async (c) => { w.sends.push(`put:${c}`); return { outcome: 'failed', code: 'REALM_LIMIT_REACHED' }; };
    const e = engine({ id: B, alias: 'Clients', color: '', rows: pick, io: w.io, free });
    const s = await e.start();
    expect(s.items[0]).toMatchObject({ state: 'failed', code: 'REALM_LIMIT_REACHED' });
    expect(s.items[1]?.state).toBe('waiting');
    expect(e.limitRefused()).toBe(true);
    expect(e.canSendComputers()).toBe(false);
    await e.sendComputers();
    expect(w.sends.filter((x) => x.startsWith('put:'))).toEqual([`put:${C1}`]);
  });

  it('a lost computer answer that did not land: Check shows it missing; Add again dismisses the held send first, then sends once', async () => {
    const w = world();
    w.io.writeRealms = async (c, set) => {
      w.sends.push(`put:${c}`);
      if (c === C2 && w.sends.filter((x) => x === `put:${C2}`).length === 1) return { outcome: 'unknown', hold: 'h1' };
      w.realms[c] = set;
      return { outcome: 'done' };
    };
    const real = w.io.readRealms;
    let n = 0;
    w.io.readRealms = async (c: string) => (c === C2 && ++n === 2 ? null : real(c));
    const e = engine({ id: B, alias: 'Clients', color: '', rows: pick, io: w.io, free });
    expect((await e.start()).items[1]).toMatchObject({ state: 'unknown', hold: 'h1' });
    expect(e.canSendComputers()).toBe(false);
    expect((await e.checkComputers()).items[1]?.state).toBe('missing');
    expect(w.sends.filter((x) => x.startsWith('put:') || x.startsWith('dismiss'))).toEqual([`put:${C1}`, `put:${C2}`]);
    await e.sendComputers();
    expect(w.sends.filter((x) => x.startsWith('put:') || x.startsWith('dismiss'))).toEqual([`put:${C1}`, `put:${C2}`, `dismiss:${C2}`, `put:${C2}`]);
  });

  it('a done write whose read-back lacks the realm is gone (sent, not there now), counted as not added, and Add again is offered', async () => {
    const w = world();
    w.io.writeRealms = async (c) => { w.sends.push(`put:${c}`); return { outcome: 'done' }; };
    const e = engine({ id: B, alias: 'Clients', color: '', rows: pick.slice(0, 1), io: w.io, free });
    const s = await e.start();
    expect(s.items[0]?.state).toBe('gone');
    expect(summary(s)).toMatchObject({ kind: 'part', refused: 1, unknown: 0 });
    expect(e.canSendComputers()).toBe(true);
  });

  it('a dead context stops at once: what is left stays waiting and nothing more is sent', async () => {
    let alive = true;
    const w = world();
    const io = { ...w.io, writeRealms: async (c: string, set: string[]) => { const r = await w.io.writeRealms(c, set); alive = false; return r; } };
    const s = await engine({ id: B, alias: 'Clients', color: '', rows: pick, io: { ...io, alive: () => alive }, free }).start();
    expect(w.sends.filter((x) => x.startsWith('put'))).toEqual([`put:${C1}`]);
    expect(s.items[1]?.state).toBe('waiting');
    expect(summary(s).kind).toBe('stopped');
  });

  it('a lost send read back with the realm but not its exact set: saved, its send kept here (HELD) and still checkable', async () => {
    const w = world({ write: { [C1]: { outcome: 'unknown', hold: 'h1' } } });
    const real = w.io.readRealms;
    let n = 0;
    // The read-back shows the new realm while the realm the computer had is gone.
    w.io.readRealms = async (c: string) => (c === C1 && ++n === 2 ? [B] : real(c));
    const s = await engine({ id: B, alias: 'Clients', color: '', rows: pick.slice(0, 1), io: w.io, free }).start();
    expect(s.items[0]).toMatchObject({ state: 'saved', code: 'HELD', sent: [A, B] });
    expect(w.sends).not.toContain(`applied:${C1}`);
  });

  it('a HELD send: Check only reads and settles it once the exact set shows; nothing is sent again', async () => {
    const w = world({ write: { [C1]: { outcome: 'unknown', hold: 'h1' } } });
    const real = w.io.readRealms;
    let n = 0;
    w.io.readRealms = async (c: string) => (c === C1 && ++n === 2 ? [B] : real(c));
    const e = engine({ id: B, alias: 'Clients', color: '', rows: pick.slice(0, 1), io: w.io, free });
    await e.start();
    expect(e.canCheckComputers()).toBe(true);
    expect(e.canSendComputers()).toBe(false);
    expect(e.canDismissHeld()).toBe(true);
    const s = await e.checkComputers();
    expect(s.items[0]).toMatchObject({ state: 'saved', code: null, sent: null });
    expect(w.sends.filter((x) => x.startsWith('put') || x.startsWith('applied'))).toEqual([`put:${C1}`, `applied:${C1}`]);
    expect(e.canDismissHeld()).toBe(false);
  });

  it('a HELD send is freed only by the explicit Dismiss, which sends nothing', async () => {
    const w = world({ write: { [C1]: { outcome: 'unknown', hold: 'h1' } } });
    const real = w.io.readRealms;
    let n = 0;
    w.io.readRealms = async (c: string) => (c === C1 && n++ >= 1 ? [B] : real(c));
    const e = engine({ id: B, alias: 'Clients', color: '', rows: pick.slice(0, 1), io: w.io, free });
    await e.start();
    expect((await e.checkComputers()).items[0]).toMatchObject({ code: 'HELD', sent: [A, B] });
    const s = await e.dismissHeld();
    expect(s.items[0]).toMatchObject({ state: 'saved', code: null, sent: null });
    expect(w.sends.filter((x) => x.startsWith('put') || x.startsWith('dismiss') || x.startsWith('applied'))).toEqual([`put:${C1}`, `dismiss:${C1}`]);
  });

  for (const [r, code, offered] of [['kept', 'HELD', true], ['other', 'ELSEWHERE', false]] as const) {
    it(`a Dismiss that core answers ${r} keeps the earlier try tracked here (${code})`, async () => {
      const w = world({ write: { [C1]: { outcome: 'unknown', hold: 'h1' } } });
      const real = w.io.readRealms;
      let n = 0;
      w.io.readRealms = async (c: string) => (c === C1 && n++ >= 1 ? [B] : real(c));
      w.io.settleRealms = async (c, _s, how) => { w.sends.push(`${how}:${c}`); return r; };
      const e = engine({ id: B, alias: 'Clients', color: '', rows: pick.slice(0, 1), io: w.io, free });
      await e.start();
      const s = await e.dismissHeld();
      expect(s.items[0]).toMatchObject({ state: 'saved', code, sent: [A, B] });
      expect(e.canDismissHeld()).toBe(offered);
      expect(e.canCheckComputers()).toBe(true);
    });
  }

  it('a refusal left from an earlier try is read again: once the name is free, Try again is offered', async () => {
    const w = world();
    let taken = false;
    w.io.setName = async () => { w.sends.push('name'); return { outcome: 'unknown' as const }; };
    const e = engine({ id: B, alias: 'Clients', color: '', rows: [], io: w.io, free: () => !taken });
    await e.start();
    await e.checkName();
    taken = true;
    expect((await e.sendName()).name).toMatchObject({ code: 'NAME_TAKEN', out: true });
    expect(e.canSendName()).toBe(false);
    // Read again while the name is still another realm's: no invitation to try again.
    expect(notSeenText((await e.checkName()).name)).toBe('name.notSeenTaken');
    taken = false;
    const freed = (await e.checkName()).name;
    expect(freed).toMatchObject({ state: 'missing', code: null, out: true });
    expect(notSeenText(freed)).toBe('name.notSeen');
    expect(e.canSendName()).toBe(true);
    expect(w.sends.filter((x) => x === 'name')).toHaveLength(1);
  });

  it('leaving while Try again reads the names sends nothing and keeps what was shown', async () => {
    let alive = true;
    const w = world();
    w.io.setName = async () => { w.sends.push('name'); return { outcome: 'unknown' as const }; };
    let reads = 0;
    w.io.readNames = async () => { if (++reads === 3) alive = false; return {}; };
    w.io.alive = () => alive;
    const e = engine({ id: B, alias: 'Clients', color: '', rows: [], io: w.io, free });
    await e.start();
    const before = (await e.checkName()).name;
    const s = await e.sendName();
    expect(s.name).toEqual(before);
    expect(w.sends.filter((x) => x === 'name')).toHaveLength(1);
  });

  it('a name write stopped before its PUT because the page was left is not sent, and what was shown stays', async () => {
    let alive = true;
    const w = world();
    let n = 0;
    w.io.setName = async () => {
      w.sends.push('name');
      if (n++ === 0) return { outcome: 'unknown' as const };
      alive = false;
      return { outcome: 'failed' as const, code: 'STOPPED', notSent: true };
    };
    w.io.alive = () => alive;
    const e = engine({ id: B, alias: 'Clients', color: '', rows: [], io: w.io, free });
    await e.start();
    const before = (await e.checkName()).name;
    expect((await e.sendName()).name).toEqual(before);
  });

  it('a lost send that Check finds not there yet stays uncertain: may have been added, Check offered again', async () => {
    const w = world();
    w.io.writeRealms = async (c) => { w.sends.push(`put:${c}`); return { outcome: 'unknown', hold: 'h1' }; };
    const real = w.io.readRealms;
    let n = 0;
    w.io.readRealms = async (c: string) => (++n === 2 ? null : real(c));
    const e = engine({ id: B, alias: 'Clients', color: '', rows: pick.slice(1), io: w.io, free });
    await e.start();
    const s = await e.checkComputers();
    expect(s.items[0]).toMatchObject({ state: 'missing', sent: [B] });
    expect(summary(s)).toMatchObject({ unknown: 1, refused: 0 });
    expect(e.canCheckComputers()).toBe(true);
    expect(e.canSendComputers()).toBe(true);
  });

  it('a failed read with no send behind it counts as not added yet, never as may have been added', async () => {
    const w = world({ readFails: new Set([C1]) });
    const s = await engine({ id: B, alias: 'Clients', color: '', rows: pick.slice(0, 1), io: w.io, free }).start();
    expect(s.items[0]).toMatchObject({ state: 'unchecked', sent: null });
    expect(summary(s)).toMatchObject({ unknown: 0, waiting: 1 });
  });

  it('a done name whose read-back shows another name on this id is saved as renamed, never lost or written again', async () => {
    const w = world();
    let reads = 0;
    w.io.readNames = async () => (++reads === 2 ? { [B]: 'Other' } : {});
    const e = engine({ id: B, alias: 'Clients', color: '', rows: [], io: w.io, free });
    const s = await e.start();
    expect(s.name).toMatchObject({ state: 'saved', code: 'RENAMED' });
    expect(e.canSendName()).toBe(false);
  });

  it('a context that dies while the held send is dismissed sends nothing after', async () => {
    let alive = true;
    const w = world();
    w.io.writeRealms = async (c) => { w.sends.push(`put:${c}`); return { outcome: 'unknown', hold: 'h1' }; };
    const real = w.io.readRealms;
    let n = 0;
    w.io.readRealms = async (c: string) => (++n === 2 ? null : real(c));
    w.io.settleRealms = async (c, _s, how) => { w.sends.push(`${how}:${c}`); if (how === 'dismiss') alive = false; return 'settled' as const; };
    w.io.alive = () => alive;
    const e = engine({ id: B, alias: 'Clients', color: '', rows: pick.slice(1), io: w.io, free });
    await e.start();
    await e.checkComputers();
    await e.sendComputers();
    expect(w.sends.filter((x) => x.startsWith('put') || x.startsWith('dismiss'))).toEqual([`put:${C2}`, `dismiss:${C2}`]);
  });

  it('start runs once', async () => {
    const w = world();
    const e = engine({ id: B, alias: 'Clients', color: '', rows: [], io: w.io, free });
    await Promise.all([e.start(), e.start()]);
    expect(w.sends.filter((x) => x === 'name')).toHaveLength(1);
  });
});
