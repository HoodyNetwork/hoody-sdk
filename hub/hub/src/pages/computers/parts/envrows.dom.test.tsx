// The new computer's environment editor after the kit EnvRows: the same DOM as the page's own editor,
// byte for byte, in every state a person can reach (no rows, rows typed, a row removed, an error line; the form lock is create.picker.test.tsx's).
// GOLD was read from the editor as it was before the extraction, with react-aria's generated
// ids numbered in order of appearance; test-mode CSS modules keep their class names (vite.config.mts non-scoped).
// The 'Add variable' button is the kit's slanted-plate button: its markup in GOLD is the label then the end arrow
// glyph inside the plate (no start icon); everything else is unchanged.
// Every kit text input carries the one field box class (kit/forms/
// fieldBox.module.css .box): GOLD's inputs read class="box input ..."; nothing else changed.
// The fieldset also carries the kit's `titled` class: the legend is drawn as a group title, like the groups above it.
// The legend wears the kit field-label classes (fields.module.css .label .legend; `titled` still
// overrides its look): GOLD's legend reads class="label legend"; nothing else changed.
// Remove keeps the focus (kit EnvRows): after a row is removed the row now in its place takes it, so GOLD.removed's
// first input carries react-aria's data-focused="true"; nothing else changed.
import { describe, expect, it } from 'vitest';
import { render, screen, userEvent, within } from '@app/testing';
import { useState } from 'react';
import strings from '../strings.en.json';
import { EnvEditor } from './EnvEditor';

const interpolate = (s: string, v: Record<string, string | number>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(v[k]));

/** react-aria's ids (useId) differ per render: numbered in order of first appearance. */
function stable(html: string): string {
  const ids = new Map<string, string>();
  return html.replace(/react-aria-_r_[0-9a-z]+_|_r_[0-9a-z]+_|react-aria[0-9]+(?:-[0-9]+)?|:r[0-9a-z]+:/g, (m) => {
    if (!ids.has(m)) ids.set(m, `ID${ids.size}`);
    return ids.get(m) as string;
  });
}

function Host({ error, start = '' }: { error?: string; start?: string }) {
  const [text, setText] = useState(start);
  return (
    <>
      <div data-host>
        <EnvEditor value={text} onChange={setText} error={error} />
        <output data-text>{text}</output>
      </div>
      <button type="button" data-wipe onClick={() => setText('')}>
        wipe
      </button>
    </>
  );
}
const dom = (c: HTMLElement) => stable((c.querySelector('[data-host]') as HTMLElement).innerHTML);

async function typed() {
  const r = render(<Host />);
  const add = screen.getByRole('button', { name: strings['create.envAdd'] });
  await userEvent.click(add);
  await userEvent.click(add);
  await userEvent.type(screen.getByRole('textbox', { name: interpolate(strings['create.envKey'], { n: 1 }) }), 'FOO');
  await userEvent.type(screen.getByLabelText(interpolate(strings['create.envValue'], { n: 1 })), 'bar');
  await userEvent.type(screen.getByRole('textbox', { name: interpolate(strings['create.envKey'], { n: 2 }) }), 'B');
  return r;
}

const GOLD: Record<string, string> = {
  empty: "<fieldset class=\"envEditor titled\"><legend class=\"label legend\">Environment variables</legend><p class=\"help\">Values are kept secret and masked as you type.</p><div><button data-variant=\"secondary\" data-glyph=\"\" data-words=\"\" class=\"button secondary sm\" data-rac=\"\" type=\"button\" tabindex=\"0\" data-react-aria-pressable=\"true\" id=\"ID0\"><span class=\"label\" data-btn-label=\"\">Add variable</span><span class=\"glyph\" aria-hidden=\"true\" data-glyph-mark=\"\"><svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" class=\"px pxSmooth stroke\" aria-hidden=\"true\" focusable=\"false\" data-px=\"arrow\" data-px-mirror=\"\"><path d=\"m9 5 7 7-7 7\"></path></svg></span></button></div></fieldset><output data-text=\"true\"></output>",
  typed: "<fieldset class=\"envEditor titled\"><legend class=\"label legend\">Environment variables</legend><p class=\"help\">Values are kept secret and masked as you type.</p><div class=\"envRow\"><div class=\"field\" data-rac=\"\"><div class=\"control\"><input aria-label=\"Variable 1 name\" autocomplete=\"off\" placeholder=\"NAME\" spellcheck=\"false\" tabindex=\"0\" id=\"ID0\" class=\"box input mono\" data-rac=\"\" type=\"text\" value=\"FOO\" title=\"\"></div></div><div class=\"field\" data-rac=\"\"><div class=\"control\"><input aria-label=\"Variable 1 value\" autocomplete=\"new-password\" placeholder=\"value\" spellcheck=\"false\" tabindex=\"0\" id=\"ID1\" class=\"box input mono inputWithAction\" data-secret-input=\"\" data-1p-ignore=\"true\" data-lpignore=\"true\" data-bwignore=\"true\" data-form-type=\"other\" data-rac=\"\" type=\"password\" value=\"bar\" title=\"\"><button class=\"button iconOnly ghost sm inputAction\" data-rac=\"\" type=\"button\" tabindex=\"0\" data-react-aria-pressable=\"true\" aria-label=\"Show what you typed\" id=\"ID2\"><svg viewBox=\"0 0 24 24\" class=\"icon md stroke\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z\"></path></svg></button></div></div><button class=\"button iconOnly ghost sm\" data-rac=\"\" type=\"button\" tabindex=\"0\" data-react-aria-pressable=\"true\" aria-label=\"Remove variable 1\" id=\"ID3\"><svg viewBox=\"0 0 24 24\" class=\"icon md stroke\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3\"></path></svg></button></div><div class=\"envRow\"><div class=\"field\" data-rac=\"\"><div class=\"control\"><input aria-label=\"Variable 2 name\" autocomplete=\"off\" placeholder=\"NAME\" spellcheck=\"false\" tabindex=\"0\" id=\"ID4\" class=\"box input mono\" data-rac=\"\" type=\"text\" value=\"B\" title=\"\" data-hovered=\"true\" data-focused=\"true\"></div></div><div class=\"field\" data-rac=\"\"><div class=\"control\"><input aria-label=\"Variable 2 value\" autocomplete=\"new-password\" placeholder=\"value\" spellcheck=\"false\" tabindex=\"0\" id=\"ID5\" class=\"box input mono inputWithAction\" data-secret-input=\"\" data-1p-ignore=\"true\" data-lpignore=\"true\" data-bwignore=\"true\" data-form-type=\"other\" data-rac=\"\" type=\"password\" value=\"\" title=\"\"><button class=\"button iconOnly ghost sm inputAction\" data-rac=\"\" type=\"button\" tabindex=\"0\" data-react-aria-pressable=\"true\" aria-label=\"Show what you typed\" id=\"ID6\"><svg viewBox=\"0 0 24 24\" class=\"icon md stroke\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z\"></path></svg></button></div></div><button class=\"button iconOnly ghost sm\" data-rac=\"\" type=\"button\" tabindex=\"0\" data-react-aria-pressable=\"true\" aria-label=\"Remove variable 2\" id=\"ID7\"><svg viewBox=\"0 0 24 24\" class=\"icon md stroke\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3\"></path></svg></button></div><div><button data-variant=\"secondary\" data-glyph=\"\" data-words=\"\" class=\"button secondary sm\" data-rac=\"\" type=\"button\" tabindex=\"0\" data-react-aria-pressable=\"true\" id=\"ID8\"><span class=\"label\" data-btn-label=\"\">Add variable</span><span class=\"glyph\" aria-hidden=\"true\" data-glyph-mark=\"\"><svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" class=\"px pxSmooth stroke\" aria-hidden=\"true\" focusable=\"false\" data-px=\"arrow\" data-px-mirror=\"\"><path d=\"m9 5 7 7-7 7\"></path></svg></span></button></div></fieldset><output data-text=\"true\">FOO=bar\nB=</output>",
  removed: "<fieldset class=\"envEditor titled\"><legend class=\"label legend\">Environment variables</legend><p class=\"help\">Values are kept secret and masked as you type.</p><div class=\"envRow\"><div class=\"field\" data-rac=\"\"><div class=\"control\"><input aria-label=\"Variable 1 name\" autocomplete=\"off\" placeholder=\"NAME\" spellcheck=\"false\" tabindex=\"0\" id=\"ID0\" class=\"box input mono\" data-rac=\"\" type=\"text\" value=\"B\" title=\"\" data-focused=\"true\"></div></div><div class=\"field\" data-rac=\"\"><div class=\"control\"><input aria-label=\"Variable 1 value\" autocomplete=\"new-password\" placeholder=\"value\" spellcheck=\"false\" tabindex=\"0\" id=\"ID1\" class=\"box input mono inputWithAction\" data-secret-input=\"\" data-1p-ignore=\"true\" data-lpignore=\"true\" data-bwignore=\"true\" data-form-type=\"other\" data-rac=\"\" type=\"password\" value=\"\" title=\"\"><button class=\"button iconOnly ghost sm inputAction\" data-rac=\"\" type=\"button\" tabindex=\"0\" data-react-aria-pressable=\"true\" aria-label=\"Show what you typed\" id=\"ID2\"><svg viewBox=\"0 0 24 24\" class=\"icon md stroke\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z\"></path></svg></button></div></div><button class=\"button iconOnly ghost sm\" data-rac=\"\" type=\"button\" tabindex=\"0\" data-react-aria-pressable=\"true\" aria-label=\"Remove variable 1\" id=\"ID3\"><svg viewBox=\"0 0 24 24\" class=\"icon md stroke\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3\"></path></svg></button></div><div><button data-variant=\"secondary\" data-glyph=\"\" data-words=\"\" class=\"button secondary sm\" data-rac=\"\" type=\"button\" tabindex=\"0\" data-react-aria-pressable=\"true\" id=\"ID4\"><span class=\"label\" data-btn-label=\"\">Add variable</span><span class=\"glyph\" aria-hidden=\"true\" data-glyph-mark=\"\"><svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" class=\"px pxSmooth stroke\" aria-hidden=\"true\" focusable=\"false\" data-px=\"arrow\" data-px-mirror=\"\"><path d=\"m9 5 7 7-7 7\"></path></svg></span></button></div></fieldset><output data-text=\"true\">B=</output>",
  error: "<fieldset class=\"envEditor titled\"><legend class=\"label legend\">Environment variables</legend><p class=\"help\">Values are kept secret and masked as you type.</p><p class=\"envError\" role=\"alert\">Use NAME=value.</p><div><button data-variant=\"secondary\" data-glyph=\"\" data-words=\"\" class=\"button secondary sm\" data-rac=\"\" type=\"button\" tabindex=\"0\" data-react-aria-pressable=\"true\" id=\"ID0\"><span class=\"label\" data-btn-label=\"\">Add variable</span><span class=\"glyph\" aria-hidden=\"true\" data-glyph-mark=\"\"><svg viewBox=\"0 0 24 24\" width=\"14\" height=\"14\" class=\"px pxSmooth stroke\" aria-hidden=\"true\" focusable=\"false\" data-px=\"arrow\" data-px-mirror=\"\"><path d=\"m9 5 7 7-7 7\"></path></svg></span></button></div></fieldset><output data-text=\"true\"></output>",
};

describe('the new computer environment editor renders exactly as before the kit extraction', () => {
  it('no rows', () => {
    const { container } = render(<Host />);
    expect(dom(container)).toBe(GOLD.empty);
  });

  it('two rows typed, and the text the form keeps', async () => {
    const { container } = await typed();
    expect(dom(container)).toBe(GOLD.typed);
    expect(within(container).getByText((_, el) => el?.hasAttribute('data-text') ?? false).textContent).toBe('FOO=bar\nB=');
  });

  it('a row removed', async () => {
    const { container } = await typed();
    await userEvent.click(screen.getByRole('button', { name: interpolate(strings['create.envRemove'], { n: 1 }) }));
    expect(dom(container)).toBe(GOLD.removed);
  });

  it('a blank row adds nothing to the text the form keeps', async () => {
    const { container } = await typed();
    await userEvent.click(screen.getByRole('button', { name: strings['create.envAdd'] }));
    await userEvent.type(screen.getByRole('textbox', { name: interpolate(strings['create.envKey'], { n: 2 }) }), 'C');
    expect(within(container).getByText((_, el) => el?.hasAttribute('data-text') ?? false).textContent).toBe('FOO=bar\nBC=');
  });

  it('the form wiping its text takes the rows, and their values, with it', async () => {
    const { container } = await typed();
    await userEvent.click(container.querySelector('[data-wipe]') as HTMLElement);
    expect(screen.queryByLabelText(interpolate(strings['create.envValue'], { n: 1 }))).toBeNull();
    expect(dom(container)).toBe(GOLD.empty);
  });

  it('with an error line', () => {
    const { container } = render(<Host error="Use NAME=value." />);
    expect(dom(container)).toBe(GOLD.error);
  });
});
