// gate-slot.ts: a runner inside a held test slot takes no second one (check.ts web-scenarios).
import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { inGateSlot, slotBase, slotEnv, slotLine, validSlotBase } from './gate-slot';

const cmd = ['bash', 'scripts/term/vitest-narrow.sh', 'hub/src/x.test.ts'];
const yes = () => true;
const quiet = () => {};
const none = () => undefined;

test('a held slot (HUB_GATE_SLOT_HELD=1) runs the command directly', () => {
  expect(inGateSlot(cmd, { HUB_GATE_SLOT_HELD: '1' }, () => 3, yes, '/s/slot', quiet)).toEqual(cmd);
});
test('a slot base: one of the six slots, 300 s wait, one line naming it', () => {
  const said: string[] = [];
  expect(inGateSlot(cmd, {}, () => 3, yes, '/s/slot', (l) => said.push(l))).toEqual(['flock', '-w', '300', '/s/slot.3.lock', ...cmd]);
  expect(said).toEqual(['gate-slot: slots /s/slot.<0-5>.lock']);
  expect(inGateSlot(cmd, { HUB_GATE_SLOTS: '/x/slot', HUB_GATE_SLOT_HELD: '0' }, () => 0, yes, slotBase({ HUB_GATE_SLOTS: '/x/slot' }, none), quiet)).toEqual(['flock', '-w', '300', '/x/slot.0.lock', ...cmd]);
});
test('no slots (neither env nor host file) or no slot directory: no lock, and the line says so', () => {
  const said: string[] = [];
  expect(inGateSlot(cmd, {}, () => 1, yes, slotBase({}, none), (l) => said.push(l))).toEqual(cmd);
  expect(inGateSlot(cmd, {}, () => 1, () => false, '/nowhere/slot', (l) => said.push(l))).toEqual(cmd);
  expect(said).toEqual([slotLine(undefined), slotLine(undefined)]);
  expect(slotLine(undefined)).toBe('gate-slot: no slots');
});
test('the base: HUB_GATE_SLOTS first, else the host file\'s first line; one check for both, nothing trimmed (as netns.sh)', () => {
  expect(slotBase({ HUB_GATE_SLOTS: '/e/slot' }, () => '/f/slot\n')).toBe('/e/slot');
  expect(slotBase({}, () => '/f/slot\n')).toBe('/f/slot');
  expect(slotBase({ HUB_GATE_SLOTS: '' }, () => '/f/slot')).toBe('/f/slot');
  expect(slotBase({}, none)).toBeUndefined();
  for (const bad of ['', 'rel/slot', '/a/../slot', '/a..b/slot', '/a b/slot', '/f/slot ', ' /f/slot', '/f/slot\r', '\n/f/slot', '/' + 'x'.repeat(1024)]) {
    expect(validSlotBase(bad.split('\n')[0]!)).toBe(false);
    expect(() => slotBase({}, () => bad)).toThrow('gate-slot: refused: invalid slot base in ~/.config/hoody-hub-term/gate-slots');
    if (bad) expect(() => slotBase({ HUB_GATE_SLOTS: bad }, none)).toThrow('gate-slot: refused: invalid slot base in HUB_GATE_SLOTS');
  }
  expect(validSlotBase('/' + 'x'.repeat(1023))).toBe(true);
});
test('no built-in slot path: gate-slot.ts, gate-slot.sh and netns.sh name none; netns.sh reads the host file before env -i', () => {
  for (const f of ['gate-slot.ts', 'gate-slot.sh', 'netns.sh']) expect(fs.readFileSync(path.join(import.meta.dir, f), 'utf8')).not.toContain('.gate-slot');
  const n = fs.readFileSync(path.join(import.meta.dir, 'netns.sh'), 'utf8');
  const read = n.indexOf('/.config/hoody-hub-term/gate-slots');
  expect(read).toBeGreaterThan(0);
  expect(read).toBeLessThan(n.lastIndexOf('exec /usr/bin/env -i'));
  expect(n).toContain('export HUB_GATE_SLOTS=');
  // the same check for the env value and the file line (validSlotBase): pinned by its three rules
  expect(n).toContain('*..*|*[!A-Za-z0-9_./@+,=~-]*');
  expect(n).toContain('[ "${#gsv}" -le 1024 ]');
  expect(n).toContain('gss=HUB_GATE_SLOTS; gsv="$HUB_GATE_SLOTS"');
  expect(n).not.toMatch(/gsv="\$\{gsv/); // nothing trimmed
});
test('the slot holder marks its children', () => {
  expect(slotEnv({ A: '1' })).toEqual({ A: '1', HUB_GATE_SLOT_HELD: '1' });
});
test('check.ts web-scenarios uses it and marks its vitest; gate-slot.sh exports the marker; the marker survives childEnv', async () => {
  const c = fs.readFileSync(path.join(import.meta.dir, 'check.ts'), 'utf8');
  expect(c).toContain('inGateSlot(narrow, env)');
  expect(c).toContain('slotEnv(');
  expect(c).not.toMatch(/'flock', '-w', '300'/);
  expect(fs.readFileSync(path.join(import.meta.dir, 'gate-slot.sh'), 'utf8')).toContain('export HUB_GATE_SLOT_HELD=1');
  const { childEnv } = await import('./child-env');
  expect(childEnv({}, { HUB_GATE_SLOT_HELD: '1' }).HUB_GATE_SLOT_HELD).toBe('1');
});
