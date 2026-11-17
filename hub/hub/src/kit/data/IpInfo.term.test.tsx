import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { IpInfo } from './IpInfo';

const d = { ip: '203.0.113.7', version: 4 as const, city: 'Paris', region: 'Île-de-France', country: 'FR', network: { asn: 'AS64500', name: 'Example Net' }, hosting: true };

test('IpInfo: code, address and place as text; Details opens the rows and marks', async () => {
  const t = await drawTest(<FocusRoot><IpInfo details={d} /></FocusRoot>, { width: 70, height: 14 });
  let f = await t.settle();
  expect(f).toContain('FR 203.0.113.7 · Paris, Île-de-France');
  expect(f).not.toMatch(/\u{1F1EB}/u);
  // Tab to Copy, Tab to Details, Enter.
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  f = await t.settle();
  f = await t.settle();
  expect(f).toContain('AS64500 Example Net');
  expect(f).toContain('Hosting or data center');
  t.renderer.destroy();
});
