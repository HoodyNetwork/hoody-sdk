// IpAllowlistField.term: the web component's observable behaviours, each held here.
//  - a mono TextField with label, description, the example placeholder; typing calls onChange with an updater
//  - "Add my IP" reads the address: a public IPv4 is appended ("✓ Added" + the address)
//  - already listed: "Already in the list:" + address, list unchanged
//  - IPv6: "This list takes IPv4 only, and your address is IPv6:" + address, never added
//  - private: "Your address looks private…", never added
//  - a failed or malformed read: "Couldn't read your address. Type it in instead.", nothing shown
//  - locked (or a Form lock): typing and the button do nothing; a read that lands after a lock began is dropped
//  - readIpFrom: a failed refetch is null even over an earlier answer
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import type { IpDetails } from '../data/IpInfo';
import { IpAllowlistField, readIpFrom } from './IpAllowlistField';
import { myIpOutcome, withMyIp } from './IpAllowlistField.pure';

const W = { width: 90, height: 12 };
const v4 = (ip: string): IpDetails => ({ ip, version: 4 }) as IpDetails;
let setLock: (b: boolean) => void = () => {};

function P({ initial = '', read, got = [] }: { initial?: string; read: () => Promise<IpDetails | null>; got?: string[] }) {
  const [v, setV] = useState(initial);
  const [locked, l] = useState(false);
  setLock = l;
  return (
    <FocusRoot>
      <IpAllowlistField label="Allowed IPs" description="Only these addresses may use the key." value={v} onChange={(up) => setV((cur) => { const n = up(cur); got.push(n); return n; })} readIp={read} locked={locked} />
    </FocusRoot>
  );
}

const press = async (t: TestTerm) => {
  t.mockInput.pressTab();
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  await t.settle();
  await new Promise((r) => setTimeout(r, 10));
  return t.settle();
};

test('pure: outcomes and the focused insert', async () => {
  expect(myIpOutcome(null, '').note).toBe('failed');
  expect(myIpOutcome(v4('1.2.3.4/24'), '').note).toBe('failed');
  expect(myIpOutcome({ ip: '2001:db8::1', version: 6 } as IpDetails, '').note).toBe('v6');
  expect(myIpOutcome(v4('10.0.0.1'), '').note).toBe('private');
  expect(myIpOutcome(v4('203.0.113.9'), '203.0.113.9').note).toBe('have');
  expect(myIpOutcome(v4('203.0.113.9'), '').note).toBe('added');
  expect(withMyIp('198.51', '203.0.113.9', true)).toBe('203.0.113.9, 198.51');
  const q = { refetch: async () => ({ isError: true, data: v4('203.0.113.9') }) };
  expect(await readIpFrom(q)()).toBeNull();
});

test('frame; typing; Add my IP appends a public IPv4', async () => {
  const got: string[] = [];
  const t = await drawTest(<P read={async () => v4('203.0.113.9')} got={got} />, W);
  let f = t.captureCharFrame();
  expect(f).toContain('Allowed IPs');
  expect(f).toContain('Only these addresses may use the key.');
  expect(f).toContain('203.0.113.7, 198.51.100.0/24');
  expect(f).toContain('Add my IP');
  t.mockInput.pressTab();
  await t.mockInput.typeText('198.51.100.1');
  await t.settle();
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  await t.settle();
  await new Promise((r) => setTimeout(r, 10));
  f = await t.settle();
  expect(f).toContain('✓ Added 203.0.113.9');
  expect(got.at(-1)).toBe('198.51.100.1, 203.0.113.9');
  t.renderer.destroy();
});

test('already listed, IPv6, private, failed: shown, never added', async () => {
  const cases: Array<[IpDetails | null, string, string]> = [
    [v4('203.0.113.9'), 'Already in the list: 203.0.113.9', '203.0.113.9'],
    [{ ip: '2001:db8::1', version: 6 } as IpDetails, 'IPv6: 2001:db8::1 (IPv6)', '203.0.113.9'],
    [v4('192.168.1.4'), 'looks private', '203.0.113.9'],
    [null, "Couldn't read your address. Type it in instead.", '203.0.113.9'],
  ];
  for (const [me, line, start] of cases) {
    const got: string[] = [];
    const t = await drawTest(<P initial={start} read={async () => me} got={got} />, W);
    const f = await press(t);
    expect(f).toContain(line);
    expect(got).toEqual([]);
    t.renderer.destroy();
  }
});

test('locked: no typing, no press; a read landing after a lock began is dropped', async () => {
  const got: string[] = [];
  let answer: (v: IpDetails) => void = () => {};
  let asked = 0;
  const t = await drawTest(<P read={() => { asked++; return new Promise((r) => { answer = r; }); }} got={got} />, W);
  t.mockInput.pressTab();
  t.mockInput.pressTab();
  t.mockInput.pressEnter();
  await t.settle();
  setLock(true);
  await t.settle();
  expect(asked).toBe(1);
  answer(v4('203.0.113.9'));
  await new Promise((r) => setTimeout(r, 10));
  let f = await t.settle();
  expect(f).not.toContain('Added');
  expect(f).toContain('Allowed IPs (unavailable)');
  setLock(false);
  await t.settle();
  t.mockInput.pressTab();
  await t.mockInput.typeText('1');
  f = await t.settle();
  expect(got).toEqual(['1']);
  t.renderer.destroy();
});
