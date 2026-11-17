// Jump to newest puts the keyboard in the chat box, in the terminal as on the web. The log column (ActivityLog) sits in a
// scroll with the chat box below it, and the box fills the tab's slot as Say does (useChatBoxSlot). Pressing Jump (the
// host's jumpRef) takes the log to its end and the focus to the box. Before, the move searched the page for a text area,
// which the terminal's composer is not: the focus went nowhere once the button left, and the next Tab began at the top.
import { expect, test } from 'bun:test';
import { useRef, useState, type MutableRefObject } from 'react';
import { Composer } from '@kit';
import { drawTest } from '../../../term/prim/testing';
import { Box, FocusRoot, Scroll } from '../../../term/prim';
import { focusedNode, semanticsOf } from '../../../term/prim/semantics';
import type { LogPage, LogRow } from '../data';
import { ActivityLog } from './ActivityTab';
import { ChatBoxProvider, useChatBoxSlot, type ChatBoxHandle } from './chatBox';

const BOX = 'Message the Bot';
const row = (seq: number): LogRow => ({ seq, kind: 'bot', text: `Reply ${seq}`, at: '2026-11-06T10:00:00Z', raw: null, delegateTitle: null, sender: null });
const PAGE: LogPage = { rows: Array.from({ length: 30 }, (_, i) => row(i + 1)), live: 'up_to_date', hasOlder: false, archiveRows: 0 };
const noop = () => undefined;
const jump: MutableRefObject<(() => void) | null> = { current: null };

/** The chat box as Say draws it: the kit Composer, its input in the tab's slot. */
function ChatBox() {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  useChatBoxSlot(() => inputRef.current?.focus({ preventScroll: true }));
  return (
    <Composer draft={draft} setDraft={setDraft} inputRef={inputRef} placeholder={BOX} label={BOX} max={8000} canSend={false}
      onSend={noop} notes={[]} attachments={[]} onRemoveAttachment={noop} flash={false} onTyping={noop} stop={null} slash={null} />
  );
}

/** The tab: the log and the box in one scroll, the slot shared as ActivityTab shares it. */
function Tab() {
  const chatBox = useRef<ChatBoxHandle | null>(null);
  return (
    <Box dir="column" width={80} height={20}>
      <Scroll grow={1} dir="column">
        <ActivityLog page={PAGE} loading={false} error={false} onRetry={noop} onLoadOlder={noop} loadingOlder={false} olderFailed={false}
          hideTasks={false} onHideTasks={noop} jumpRef={jump} chatBox={chatBox} />
        <ChatBoxProvider value={chatBox}><ChatBox /></ChatBoxProvider>
      </Scroll>
    </Box>
  );
}

test('Jump to newest: the log at its end and the keyboard in the chat box', async () => {
  const t = await drawTest(<FocusRoot><Tab /></FocusRoot>, { width: 80, height: 20 });
  try {
    await t.settle();
    expect(jump.current).not.toBeNull();
    expect(focusedNode(semanticsOf(t.renderer))?.name ?? null).not.toBe(BOX);
    jump.current!();
    const f = await t.settle();
    const on = focusedNode(semanticsOf(t.renderer));
    expect(on?.role, f).toBe('textbox');
    expect(on?.name, f).toBe(BOX);
  } finally { t.renderer.destroy(); }
});
