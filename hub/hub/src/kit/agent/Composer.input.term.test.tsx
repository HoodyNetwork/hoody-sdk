// Composer.term's handle tells 'input' listeners on every edit the person makes (the dock claims its draft this way, as
// a textarea's input event on the web), and never on a value the host writes.
import { expect, test } from 'bun:test';
import { useEffect, useRef, useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { Composer } from './Composer';

const seen = { edits: 0, setDraft: null as ((v: string) => void) | null };

function Harness() {
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLTextAreaElement | null>(null);
  seen.setDraft = setDraft;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const own = () => { seen.edits++; };
    el.addEventListener('input', own);
    return () => el.removeEventListener('input', own);
  }, []);
  return (
    <Box dir="column" width={80} height={12} justify="end">
      <Composer draft={draft} setDraft={setDraft} inputRef={ref} placeholder="Message" max={8000} canSend={false}
        onSend={() => {}} notes={[]} attachments={[]} onRemoveAttachment={() => {}} flash={false} onTyping={() => {}} stop={null} slash={null} />
    </Box>
  );
}

test('typing tells the input listeners; a host write does not', async () => {
  const t = await drawTest(<FocusRoot><Harness /></FocusRoot>, { width: 80, height: 12 });
  await t.settle();
  t.mockInput.pressTab();
  await t.settle();
  await t.mockInput.typeText('ab');
  await t.settle();
  expect(seen.edits).toBeGreaterThanOrEqual(1);
  const after = seen.edits;
  seen.setDraft!('written by the host');
  await t.settle();
  expect(seen.edits).toBe(after);
  t.mockInput.pressBackspace();
  await t.settle();
  expect(seen.edits).toBeGreaterThan(after);
});
