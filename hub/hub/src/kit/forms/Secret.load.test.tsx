// SecretField `load`, `dropOnHide`, `empty`, `json` and copyWhenRead.
// Without these props the field behaves as before (forms.test.tsx keeps its SecretField cases unchanged).
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { type ReactElement, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { capture, holdSecret, type HeldSecret } from '@core';
import { boot } from '@core/test/env';
import { CodeBlock } from '../data/Ids';
import { SecretField, copyWhenRead, type CopyAttempt } from './Secret';

const VALUE = 'example-secret-value';
const JSON_VALUE = '{"id":12345678901234567890,"tags":["a","b"],"nested":{"ok":true}}';
let written: string[] = [];

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
  written = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text: string) => (written.push(text), Promise.resolve()) },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, 'ClipboardItem');
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

async function inRouter(Component: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}
const press = async (el: Element) => {
  await act(async () => {
    fireEvent.click(el);
  });
};
const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));
const html = () => document.body.innerHTML;
const hold = (v: string): HeldSecret => holdSecret(v, capture())!;

interface Harness {
  reading?: boolean;
  disabled?: boolean;
  empty?: string;
  value?: string;
  copy?: () => Promise<CopyAttempt>;
  onWipe?: () => void;
  json?: boolean;
}
/** A page as the vault uses the field: it holds nothing until the eye, and drops its held value on onWipe. */
const page = { held: null as HeldSecret | null, set: (_h: HeldSecret | null) => undefined as void };
function Page({ reading = false, disabled, empty, value = VALUE, copy = async () => ({ wrote: true }), onWipe, json }: Harness) {
  const [held, setHeld] = useState<HeldSecret | null>(null);
  page.held = held;
  page.set = setHeld;
  return (
    <SecretField
      label="Value"
      held={held}
      once={false}
      format="text"
      description="Hiding the value removes it from this page."
      onRead={() => setHeld(hold(value))}
      onReadCopy={copy}
      isReading={reading}
      isReadDisabled={disabled}
      dropOnHide
      emptyText={empty}
      json={json}
      showLabel="Show value"
      hideLabel="Hide value"
      copyLabel="Copy value"
      readingLabel="Reading…"
      onWipe={() => {
        onWipe?.();
        setHeld(null);
      }}
    />
  );
}

describe('SecretField load', () => {
  it('unread: a masked box, no value, the eye reads and then shows at once (no second press)', async () => {
    await inRouter(() => <Page />);
    expect(screen.getByText('Not read yet')).toBeInTheDocument();
    expect(html()).not.toContain(VALUE);
    expect(screen.queryByText('It is no longer shown here.')).toBeNull();
    await press(screen.getByRole('button', { name: 'Show value' }));
    expect(html()).toContain(VALUE);
    expect(screen.getByRole('button', { name: 'Hide value' })).toBeInTheDocument();
  });

  it('eye-off drops the value (onWipe) and goes back to the unread box, never the "no longer shown" box', async () => {
    const onWipe = vi.fn();
    await inRouter(() => <Page onWipe={onWipe} />);
    await press(screen.getByRole('button', { name: 'Show value' }));
    const h = page.held!;
    await press(screen.getByRole('button', { name: 'Hide value' }));
    expect(h.dropped).toBe(true);
    expect(onWipe).toHaveBeenCalledTimes(1);
    expect(html()).not.toContain(VALUE);
    expect(screen.getByText('Not read yet')).toBeInTheDocument();
    expect(screen.queryByText('It is no longer shown here.')).toBeNull();
    expect(screen.getByText('Hiding the value removes it from this page.')).toBeInTheDocument();
  });

  it('the tab going to the background drops it, not only masks it', async () => {
    await inRouter(() => <Page />);
    await press(screen.getByRole('button', { name: 'Show value' }));
    const h = page.held!;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(h.dropped).toBe(true);
    expect(html()).not.toContain(VALUE);
    expect(screen.getByText('Not read yet')).toBeInTheDocument();
  });

  it('reading: the eye is a spinner and both buttons are off', async () => {
    await inRouter(() => <Page reading />);
    expect(screen.getByRole('status', { name: 'Reading…' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show value' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy value' })).toBeDisabled();
    expect(screen.getByRole('group', { name: 'Value' })).toHaveAttribute('aria-busy', 'true');
  });

  it('disabled: both buttons off, no spinner', async () => {
    await inRouter(() => <Page disabled />);
    expect(screen.getByRole('button', { name: 'Show value' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Copy value' })).toBeDisabled();
    expect(screen.queryByRole('status', { name: 'Reading…' })).toBeNull();
  });

  it('empty: the box says so and offers no button', async () => {
    await inRouter(() => <Page empty="This entry has no value." />);
    expect(screen.getByText('This entry has no value.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show value' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy value' })).toBeNull();
  });

  it('a refused copy shows the note in the unread box; nothing to copy shows none; the next attempt clears it', async () => {
    let answer: CopyAttempt = { wrote: false, reason: 'refused' };
    await inRouter(() => <Page copy={async () => answer} />);
    await press(screen.getByRole('button', { name: 'Copy value' }));
    await flush();
    expect(screen.getAllByText("Couldn't copy. Show it and copy it by hand.").length).toBeGreaterThan(0);
    expect(screen.getByText('Not read yet')).toBeInTheDocument();
    answer = { wrote: false, reason: 'none' };
    await press(screen.getByRole('button', { name: /Copy value|Couldn't copy/ }));
    await flush();
    expect(screen.queryAllByText("Couldn't copy. Show it and copy it by hand.")).toHaveLength(0);
  });

  it('a slower, earlier attempt never overwrites the latest one', async () => {
    let first!: (a: CopyAttempt) => void;
    const answers = [new Promise<CopyAttempt>((r) => (first = r)), Promise.resolve<CopyAttempt>({ wrote: true })];
    await inRouter(() => <Page copy={() => answers.shift()!} />);
    await press(screen.getByRole('button', { name: 'Copy value' }));
    await press(screen.getByRole('button', { name: 'Copy value' }));
    await flush();
    await act(async () => first({ wrote: false, reason: 'refused' }));
    await flush();
    expect(screen.queryAllByText("Couldn't copy. Show it and copy it by hand.")).toHaveLength(0);
  });

  it('Copy while shown copies the exact stored value from the held secret', async () => {
    const copy = vi.fn(async (): Promise<CopyAttempt> => ({ wrote: true }));
    await inRouter(() => <Page copy={copy} />);
    await press(screen.getByRole('button', { name: 'Show value' }));
    await press(screen.getByRole('button', { name: 'Copy value' }));
    await flush();
    expect(written).toEqual([VALUE]);
    expect(copy).not.toHaveBeenCalled();
  });
});

describe('SecretField json', () => {
  it('a JSON value shows formatted in a scroll region with no copy of its own; Copy writes the exact stored text', async () => {
    await inRouter(() => <Page value={JSON_VALUE} json />);
    expect(html()).not.toContain('12345678901234567890');
    await press(screen.getByRole('button', { name: 'Show value' }));
    const region = screen.getByRole('region', { name: 'Value' });
    expect(region.textContent).toBe('{\n  "id": 12345678901234567890,\n  "tags": [\n    "a",\n    "b"\n  ],\n  "nested": {\n    "ok": true\n  }\n}');
    expect(region).toHaveAttribute('tabindex', '0');
    expect(within(region.closest('figure')!).queryByRole('button')).toBeNull();
    await press(screen.getByRole('button', { name: 'Copy value' }));
    await flush();
    expect(written).toEqual([JSON_VALUE]);
  });

  it('Raw shows the stored text as it is; a new read goes back to Formatted', async () => {
    await inRouter(() => <Page value={JSON_VALUE} json />);
    await press(screen.getByRole('button', { name: 'Show value' }));
    await press(screen.getByRole('radio', { name: 'Raw' }));
    expect(screen.getByRole('region', { name: 'Value' }).textContent).toBe(JSON_VALUE);
    await press(screen.getByRole('button', { name: 'Hide value' }));
    expect(screen.queryByRole('radio', { name: 'Raw' })).toBeNull();
    await press(screen.getByRole('button', { name: 'Show value' }));
    expect(screen.getByRole('radio', { name: 'Formatted' })).toBeChecked();
  });

  it('too deep: shown as stored with the line, no switch; Copy still the exact text', async () => {
    const deep = `${'['.repeat(10_000)}0${']'.repeat(10_000)}`;
    await inRouter(() => <Page value={deep} json />);
    await press(screen.getByRole('button', { name: 'Show value' }));
    expect(screen.getByText('Shown as stored: too large or too deeply nested to format here.')).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Raw' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Value' }).textContent).toBe(deep);
    await press(screen.getByRole('button', { name: 'Copy value' }));
    await flush();
    expect(written).toEqual([deep]);
  });

  it('a scalar or plain text stays plain, with no switch', async () => {
    await inRouter(() => <Page value='"just a string"' json />);
    await press(screen.getByRole('button', { name: 'Show value' }));
    expect(screen.getByText('"just a string"')).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Raw' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Value' })).toBeNull();
  });

  it('masked, nothing about the structure shows', async () => {
    await inRouter(() => <Page value={JSON_VALUE} json />);
    expect(html()).not.toContain('"tags"');
    expect(screen.queryByRole('radio')).toBeNull();
  });
});

describe('copyWhenRead', () => {
  class FakeItem {
    constructor(readonly items: Record<string, Promise<Blob>>) {}
  }
  function withItem(write: (items: FakeItem[]) => Promise<void>) {
    Object.defineProperty(globalThis, 'ClipboardItem', { configurable: true, writable: true, value: FakeItem });
    const spy = vi.fn(write);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: spy, writeText: vi.fn() } });
    return spy;
  }
  const blobText = (b: Blob) => new Promise<string>((r) => {
    const fr = new FileReader();
    fr.onload = () => r(String(fr.result));
    fr.readAsText(b);
  });

  it('the write is called before it returns, with a pending promise of the text (Safari keeps the press)', async () => {
    let release!: (v: string | null) => void;
    let resolved = false;
    const write = withItem(async (items) => {
      await items[0]!.items['text/plain'];
    });
    const p = copyWhenRead(() => new Promise<string | null>((r) => (release = r)).then((v) => ((resolved = true), v)));
    expect(write).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(false);
    expect(write.mock.calls[0]![0]![0]).toBeInstanceOf(FakeItem);
    release('exact bytes');
    expect(await p).toEqual({ wrote: true });
    expect(await blobText(await write.mock.calls[0]![0]![0]!.items['text/plain']!)).toBe('exact bytes');
  });

  it('nothing to copy (null, or the read failed) is `none`, never a refusal', async () => {
    withItem(async (items) => {
      await items[0]!.items['text/plain'];
    });
    expect(await copyWhenRead(async () => null)).toEqual({ wrote: false, reason: 'none' });
    expect(await copyWhenRead(() => Promise.reject(new Error('read failed')))).toEqual({ wrote: false, reason: 'none' });
  });

  it('valid text the clipboard refuses is `refused`', async () => {
    withItem(async (items) => {
      await items[0]!.items['text/plain'];
      throw new Error('NotAllowedError');
    });
    expect(await copyWhenRead(async () => 'text')).toEqual({ wrote: false, reason: 'refused' });
  });

  it('handoff runs in the step that hands the text over: false is `none` and no text reaches the clipboard (both modes)', async () => {
    const blobs: Array<Promise<Blob>> = [];
    withItem(async (items) => {
      blobs.push(items[0]!.items['text/plain']!);
      await items[0]!.items['text/plain'];
    });
    let late = true;
    const order: string[] = [];
    // A cancel queued after the text is read but before the helper hands it over (the gap a page cannot close itself).
    const read = async () => {
      queueMicrotask(() => {
        order.push('cancel');
        late = false;
      });
      return 'secret text';
    };
    expect(await copyWhenRead(read, () => (order.push('handoff'), late))).toEqual({ wrote: false, reason: 'none' });
    expect(order).toEqual(['cancel', 'handoff']);
    expect(await blobs.at(-1)!.then(() => 'handed', () => null)).toBeNull();
    expect(await copyWhenRead(async () => 'ok', () => true)).toEqual({ wrote: true });
    Reflect.deleteProperty(globalThis, 'ClipboardItem');
    const writeText = vi.fn(async (_t: string) => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    late = true;
    order.length = 0;
    expect(await copyWhenRead(read, () => (order.push('handoff'), late))).toEqual({ wrote: false, reason: 'none' });
    expect(order).toEqual(['cancel', 'handoff']);
    expect(writeText).not.toHaveBeenCalled();
    expect(await copyWhenRead(async () => 'ok', () => true)).toEqual({ wrote: true });
    expect(writeText).toHaveBeenCalledWith('ok');
  });

  it('without ClipboardItem: reads first, then writeText; a refusal there is `refused`', async () => {
    const writeText = vi.fn(async (_t: string) => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    expect(await copyWhenRead(async () => 'plain')).toEqual({ wrote: true });
    expect(writeText).toHaveBeenCalledWith('plain');
    writeText.mockRejectedValueOnce(new Error('no'));
    expect(await copyWhenRead(async () => 'plain')).toEqual({ wrote: false, reason: 'refused' });
    expect(await copyWhenRead(async () => null)).toEqual({ wrote: false, reason: 'none' });
  });
});

describe('CodeBlock maxHeight and noCopy', () => {
  it('maxHeight makes a focusable named region even when wrapped; noCopy drops its Copy', async () => {
    await inRouter(() => <CodeBlock code="a\nb" label="Output" lang="plain" maxHeight="md" wrap noCopy />);
    expect(screen.getByRole('region', { name: 'Output' })).toHaveAttribute('tabindex', '0');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('without them a block keeps its Copy', async () => {
    await inRouter(() => <CodeBlock code="a" label="Output" lang="plain" />);
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument();
  });
});
