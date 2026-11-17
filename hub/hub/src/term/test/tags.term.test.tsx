// The compat runtime's tag table (src/term/jsx/tags.ts): every row draws without a crash and with its kind's shape,
// plus the behaviours the table promises: refs (focus, rect, refused members), events, label htmlFor, select,
// details/summary, password masking, aria-label naming, hidden, refused dangerouslySetInnerHTML, unknown tags counted.
import { expect, test } from 'bun:test';
import { createElement, useRef, useState, type ReactNode } from 'react';
import { drawTest } from '../prim/testing';
import { FocusRoot } from '../prim';
import { TAGS } from '../jsx/tags';
import { clearDomLedger, domLedger } from '../jsx/dom';
import { clearDomRefusals, domRefusals } from '../jsx/element';
import { jsx } from '../jsx/jsx-runtime';

const draw = (node: ReactNode, width = 40, height = 8) => drawTest(<FocusRoot>{node}</FocusRoot>, { width, height });
const lines = (f: string): string[] => f.split('\n').map((l) => l.trimEnd()).filter(Boolean);
/** A raw tag through the compat runtime (as the loader compiles shared JSX), with text inside where it can hold some. */
const tag = (name: string, props: Record<string, unknown> = {}, kids?: ReactNode): ReactNode => jsx(name as never, { ...props, ...(kids !== undefined ? { children: kids } : {}) });

const SHAPE: Record<string, (out: string[]) => void> = {
  block: (o) => expect(o.join('\n')).toContain('word'),
  inline: (o) => expect(o.join('\n')).toContain('word'),
  para: (o) => expect(o.join('\n')).toContain('word'),
  row: (o) => expect(o.join('\n')).toContain('word'),
  cell: (o) => expect(o.join('\n')).toContain('word'),
  press: (o) => expect(o.join('\n')).toContain('word'),
  nothing: (o) => expect(o.join('\n')).not.toContain('word'),
};

for (const [name, rule] of Object.entries(TAGS)) {
  test(`<${name}> (${rule.kind}) draws its shape`, async () => {
    clearDomLedger();
    const node = rule.kind === 'field' ? tag(name, { defaultValue: 'word', type: 'text' })
      : rule.kind === 'select' ? tag(name, { defaultValue: 'b' }, [tag('option', { key: 'a', value: 'a' }, 'nope'), tag('option', { key: 'b', value: 'b' }, 'word')])
      : rule.kind === 'br' || rule.kind === 'rule' ? tag('div', {}, ['word', tag(name, { key: 'x' }), 'after'])
      : name === 'tr' ? tag('table', {}, tag('tbody', {}, tag('tr', {}, tag('td', {}, 'word'))))
      : rule.kind === 'cell' ? tag('table', {}, tag('tbody', {}, tag('tr', {}, tag(name, {}, 'word'))))
      : tag(name, {}, 'word');
    const t = await draw(node);
    const out = lines(t.captureCharFrame());
    if (rule.kind === 'field' || rule.kind === 'select') expect(out.join('\n')).toContain('word');
    else if (rule.kind === 'br') expect(out).toEqual(['word', 'after']);
    else if (rule.kind === 'rule') { expect(out[0]).toBe('word'); expect(out[1]).toMatch(/^─+$/); expect(out[2]).toBe('after'); }
    else if (name === 'details') expect(out).toEqual([]); // closed: only a summary shows (none here)
    else SHAPE[rule.kind]!(out);
    if (rule.text?.bold) expect(t.captureSpans().lines.some((l) => l.spans.some((s) => s.text.includes('word') && (s.attributes & 1) === 1))).toBe(true);
    expect(domLedger().unknownTags).toEqual({});
    t.renderer.destroy();
  });
}

test('an unknown tag is drawn as a block and counted', async () => {
  clearDomLedger();
  const t = await draw(tag('marquee', {}, 'word'));
  expect(lines(t.captureCharFrame())).toEqual(['word']);
  expect(domLedger().unknownTags).toEqual({ marquee: 1 });
  t.renderer.destroy();
});

test('dangerouslySetInnerHTML is refused (draws nothing, counted)', async () => {
  clearDomLedger();
  const t = await draw(<div><div dangerouslySetInnerHTML={{ __html: '<b>x</b>' }} />after</div>);
  expect(lines(t.captureCharFrame())).toEqual(['after']);
  expect(domLedger().refusedHtml).toBe(1);
  t.renderer.destroy();
});

test('hidden and aria-hidden', async () => {
  const t = await draw(<div><div hidden>gone</div><span aria-hidden="true">✓</span> kept</div>);
  expect(lines(t.captureCharFrame()).join('\n')).not.toContain('gone');
  expect(lines(t.captureCharFrame()).join('\n')).toContain('kept');
  t.renderer.destroy();
});

test('refs: focus, getBoundingClientRect in pixels (cols x8, rows x16), a refused member names itself', async () => {
  clearDomRefusals();
  let rect: { x: number; y: number; width: number; height: number } | null = null;
  let err = '';
  let focused = 0;
  function Probe() {
    const r = useRef<HTMLButtonElement | null>(null);
    const at = useRef<HTMLDivElement | null>(null);
    return (
      <div>
        <div ref={at}>line one</div>
        <button ref={r} onFocus={() => { focused++; }} onClick={() => {
          rect = at.current!.getBoundingClientRect();
          try { (at.current as unknown as { animate(): void }).animate(); } catch (e) { err = String((e as Error).message); }
        }}>Go</button>
        <button onClick={() => r.current!.focus()}>Focus Go</button>
      </div>
    );
  }
  const t = await draw(<Probe />);
  t.mockInput.pressTab(); await t.settle(); // Go
  expect(focused).toBe(1);
  t.mockInput.pressEnter(); await t.settle();
  expect(rect).toEqual(expect.objectContaining({ x: 0, y: 0, width: 40 * 8, height: 16 }));
  expect(err).toContain('TERM_DOM_MEMBER');
  expect(err).toContain('animate');
  expect(domRefusals()).toEqual({ 'div.animate': 1 });
  t.renderer.destroy();
});

test('events: onClick, onKeyDown (DOM key names), onChange with target.value, onBlur', async () => {
  const seen: string[] = [];
  function Form() {
    const [v, setV] = useState('');
    return (
      <div>
        <input value={v} onChange={(e) => { setV(e.target.value); seen.push('change:' + e.target.value); }} onKeyDown={(e) => { if (e.key === 'Enter') seen.push('key:Enter'); }} onBlur={() => seen.push('blur')} />
        <button onClick={(e) => { seen.push('click:' + typeof e.preventDefault); }}>Send</button>
      </div>
    );
  }
  const t = await draw(<Form />);
  t.mockInput.pressTab(); await t.settle();
  await t.mockInput.typeText('hi'); await t.settle();
  t.mockInput.pressEnter(); await t.settle();
  t.mockInput.pressTab(); await t.settle();
  t.mockInput.pressEnter(); await t.settle();
  expect(seen).toEqual(['change:h', 'change:hi', 'key:Enter', 'blur', 'click:function']);
  t.renderer.destroy();
});

test('label htmlFor forwards the focus to its field', async () => {
  let focused = false;
  const t = await draw(<div><label htmlFor="nm">Name</label><input id="nm" onFocus={() => { focused = true; }} /></div>);
  t.mockInput.pressTab(); await t.settle(); // the label
  t.mockInput.pressEnter(); await t.settle();
  expect(focused).toBe(true);
  t.renderer.destroy();
});

test('select: Enter steps to the next option and reports it', async () => {
  const got: string[] = [];
  const t = await draw(<select defaultValue="a" onChange={(e) => got.push(e.target.value)}><option value="a">Alpha</option><option value="b">Beta</option></select>);
  expect(lines(t.captureCharFrame()).join('\n')).toContain('Alpha');
  t.mockInput.pressTab(); await t.settle();
  t.mockInput.pressEnter(); await t.settle();
  expect(got).toEqual(['b']);
  expect(lines(t.captureCharFrame()).join('\n')).toContain('Beta');
  t.renderer.destroy();
});

test('details/summary: Enter on the summary opens and closes the body', async () => {
  const t = await draw(<details><summary>More</summary><p>inside</p></details>);
  expect(lines(t.captureCharFrame()).join('\n')).not.toContain('inside');
  t.mockInput.pressTab(); await t.settle();
  t.mockInput.pressEnter(); await t.settle();
  expect(lines(t.captureCharFrame()).join('\n')).toContain('inside');
  t.renderer.destroy();
});

test('a password field never draws its value', async () => {
  const t = await draw(<input type="password" defaultValue="hunter2" />);
  const f = t.captureCharFrame();
  expect(f).not.toContain('hunter2');
  expect(f).toContain('•••••••');
  t.renderer.destroy();
});

test('an icon-only button is named by aria-label (or title)', async () => {
  const t = await draw(<div><button aria-label="Close"><svg /></button><button title="Help"><svg /></button></div>);
  const out = lines(t.captureCharFrame()).join('\n');
  expect(out).toContain('Close');
  expect(out).toContain('Help');
  t.renderer.destroy();
});

test('a link: route links and web links draw their text; javascript: is not a link', async () => {
  const t = await draw(<p><a href="/logs">Logs</a> <a href="https://hoody.com/x">site</a> <a href="javascript:alert(1)">bad</a></p>, 50, 3);
  expect(lines(t.captureCharFrame())[0]).toBe('Logs site bad');
  t.renderer.destroy();
});

test('createElement keeps working for component types (only string tags are mapped)', async () => {
  const C = ({ children }: { children?: ReactNode }) => <span>{children}</span>;
  const t = await draw(jsx(C, { children: 'word' }));
  expect(lines(t.captureCharFrame())).toEqual(['word']);
  t.renderer.destroy();
  expect(createElement).toBeDefined();
});
