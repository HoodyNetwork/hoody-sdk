// The draft box grows with its text, and is measured again when its width changes: a box first laid out narrow (a frame still
// settling, a phone layout switching in) must not keep the height its text had at that width.
import { act, render, screen } from '@testing-library/react';
import { createRef, type RefObject } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Composer, type ComposerProps } from './Composer';
import strings from './Conversation.strings.en.json';

let observed: Array<{ cb: ResizeObserverCallback; el: Element }> = [];
afterEach(() => { observed = []; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Composer draft box height', () => {
  it('is measured again when the box changes width', () => {
    vi.stubGlobal('ResizeObserver', class {
      private cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; }
      observe(el: Element) { observed.push({ cb: this.cb, el }); }
      unobserve() {}
      disconnect() { observed = observed.filter((o) => o.cb !== this.cb); }
    });
    let tall = 176;
    vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(() => tall);
    const p: ComposerProps = {
      draft: '', setDraft: vi.fn(), inputRef: createRef<HTMLTextAreaElement>() as RefObject<HTMLTextAreaElement | null>,
      placeholder: 'Message your agent', max: 4000, canSend: false, onSend: vi.fn(), notes: [], attachments: [],
      onAddFiles: vi.fn(), onRemoveAttachment: vi.fn(), flash: false, onTyping: vi.fn(),
    };
    render(<Composer {...p} />);
    const box = screen.getByRole('textbox', { name: strings['agent.composer'] });
    expect(box.style.height).toBe('176px');
    tall = 22;
    const watch = observed.filter((o) => o.el === box);
    expect(watch.length).toBeGreaterThan(0);
    act(() => { for (const o of watch) o.cb([{ target: box, contentRect: { width: 300 } } as unknown as ResizeObserverEntry], {} as ResizeObserver); });
    expect(box.style.height).toBe('22px');
  });
});
