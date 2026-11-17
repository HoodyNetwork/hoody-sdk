import { expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { AddressField, AddressList, AddressRow, webAddress } from './Address';

/** What the terminal was asked to copy: the renderer's OSC 52 call, observed in this test only (nothing logs copies). */
function copies(t: TestTerm): string[] {
  const got: string[] = [];
  (t.renderer as unknown as { copyToClipboardOSC52(s: string): boolean }).copyToClipboardOSC52 = (s) => { got.push(s); return true; };
  return got;
}


const ID = 'abcdef0123456789abcdef01';
const URL1 = `https://p8080-${ID}.containers.example.org/some/long/path/that/goes/on`;

test('a program address shows only its scheme (as the web\'s button), never its id; Copy gives it whole', async () => {
  const t = await drawTest(<FocusRoot><AddressField url={URL1} label="port 8080" /></FocusRoot>, { width: 40, height: 6 });
  const copied = copies(t);
  const f = await t.settle();
  expect(f).not.toContain(ID);
  expect(f).toContain('https://••••');
  // Tab: the address (opens it), then Copy.
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressTab();
  await t.settle();
  t.mockInput.pressEnter();
  await t.settle();
  expect(copied.at(-1)).toBe(URL1);
  t.renderer.destroy();
});

test('rows of a list; an empty address is a dash; webAddress is Link’s rule', async () => {
  const t = await drawTest(<FocusRoot><AddressList><AddressRow name="Terminal" url="https://term.example.org" open /></AddressList><AddressField url="" label="x" /></FocusRoot>, { width: 60, height: 4 });
  const copied = copies(t);
  const f = await t.settle();
  expect(f).toMatch(/Terminal\s+https:\/\/term\.example\.org/);
  expect(f).toContain('—');
  t.renderer.destroy();
  expect(webAddress('ftp://x')).toBe('');
  expect(webAddress('https://a.b/c')).toBe('https://a.b/c');
});

test('actions wider than the row (Computers Connect, Files at 60 cells: five actions, 72 cells) wrap, none past the edge', async () => {
  const { Text } = await import('../../term/prim');
  const acts = ['⧉ copy', '[QR]', '[Mount on your device]', '[Open Files]', '[Put Files on Board]'];
  const t = await drawTest(
    <FocusRoot><AddressList><AddressRow name="Files" url="https://files-0123456789abcdef01234567.example.org" open actions={<>{acts.map((a) => <Text key={a}>{a}</Text>)}</>} /></AddressList></FocusRoot>,
    { width: 58, height: 6 },
  );
  const f = await t.settle();
  for (const a of acts) expect(f).toContain(a);
  t.renderer.destroy();
});
