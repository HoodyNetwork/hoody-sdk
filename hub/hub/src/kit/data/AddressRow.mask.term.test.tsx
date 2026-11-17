// A masked address in an AddressRow never breaks: on the computer's Connect tab at 120x40 the Files
// row, which has one button more than the others, squeezed its address cell and drew "https://" with "••••" on the next
// line. The mask keeps its width; the actions wrap under it.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, Text } from '../../term/prim';
import { AddressList, AddressRow } from './Address';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });
const SECRET = 'https://0123456789abcdef01234567.apps.example.com/x';

test('a crowded row keeps "https://••••" on one line and moves its actions down', async () => {
  t = await drawTest(
    <FocusRoot>
      <AddressList>
        <AddressRow name="Files" url={SECRET} open actions={<Text>[Mount on your device] [Open Files] [Put Files on Board]</Text>} />
      </AddressList>
    </FocusRoot>, { width: 66, height: 6 });
  await t.settle();
  const lines = t.captureCharFrame().split('\n');
  const at = lines.findIndex((l) => l.includes('https://••••'));
  expect(at).toBeGreaterThanOrEqual(0);
  expect(lines[at]).toContain('Files');
  // The actions are on the very next line (no blank rows between the lines of one row).
  expect(lines[at + 1]).toContain('[Mount on your device] [Open Files] [Put Files on Board]');
});
