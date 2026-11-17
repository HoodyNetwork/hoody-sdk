import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeBlock, CopyButton, IdChip, codeLineText, maskId, type CodeLine } from './Ids';

// Read as text (a CSS module import gives class names, not the rules).
const idsCss = readFileSync(path.join(import.meta.dirname, 'Ids.module.css'), 'utf8');

let written: string[] = [];
beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text: string) => (written.push(text), Promise.resolve()) },
  });
});
afterEach(() => vi.useRealTimers());

const press = async (name: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
};

describe('maskId / IdChip', () => {
  it('never shows a full 24-hex id but copies it whole', async () => {
    const id = '6512a0f0c4e3b1d2a0f19c7e';
    expect(maskId(id)).toBe('6512…9c7e');
    render(<IdChip id={id} />);
    expect(screen.queryByText(id)).toBeNull();
    await press('Copy full reference');
    expect(written).toEqual([id]);
  });
});

describe('CodeBlock declares its language', () => {
  it('lang is required: a block with no language does not compile', () => {
    // @ts-expect-error lang is required: every code block states its language ('plain' with a // reason: at the call)
    const el = <CodeBlock label="x" code="x" />;
    expect(el.props).not.toHaveProperty('lang');
  });
});

describe('CodeBlock with lines', () => {
  const lines = [
    { caption: 'Install', code: 'curl -fsSL https://hoody.com/install.sh | sh' },
    { caption: 'Sign in', code: 'hoody login' },
  ];

  it('shows each caption and copies one line or all of them', async () => {
    render(<CodeBlock lang="plain" label="CLI" lines={lines} />);
    expect(screen.getByText('Install')).toBeInTheDocument();
    await press('Copy Sign in');
    await press('Copy all');
    expect(written).toEqual(['hoody login', 'curl -fsSL https://hoody.com/install.sh | sh\nhoody login']);
  });

  it('a placeholder line shows a token, refuses Copy with the reason, and blocks Copy all', async () => {
    const withGap = [...lines, { caption: 'Open the agent', code: ['hoody agent ', { placeholder: 'computer' }] as const }];
    render(<CodeBlock lang="plain" label="CLI" lines={withGap} placeholderReason="Pick a computer first" />);
    expect(screen.getByRole('img', { name: 'Missing: computer' })).toHaveTextContent('computer');
    const refused = screen.getByRole('button', { name: 'Copy Open the agent' });
    expect(refused).toHaveAttribute('aria-disabled', 'true');
    expect(refused).toHaveAccessibleDescription('Pick a computer first');
    await press('Copy Open the agent');
    await press('Copy all');
    expect(written).toEqual([]);
    await press('Copy Install');
    expect(written).toEqual(['curl -fsSL https://hoody.com/install.sh | sh']);
  });

  it('a line can show one text and copy another (masked id shown, full command copied)', async () => {
    render(<CodeBlock lang="plain" label="CLI" lines={[{ caption: 'Open', code: 'hoody open 0a1b…a4b5', copy: 'hoody open 0a1b2c3d4e5f60718293a4b5' }]} />);
    expect(screen.queryByText(/0a1b2c3d/)).toBeNull();
    await press('Copy Open');
    await press('Copy all');
    expect(written).toEqual(['hoody open 0a1b2c3d4e5f60718293a4b5', 'hoody open 0a1b2c3d4e5f60718293a4b5']);
  });

  it('codeLineText joins text parts and is undefined while a placeholder remains', () => {
    expect(codeLineText({ code: ['a ', 'b'] })).toBe('a b');
    expect(codeLineText({ code: ['a ', { placeholder: 'x' }] })).toBeUndefined();
  });

  it('GU-L1: step lines wrap by default (break anywhere), so a long command is never cut at the edge', async () => {
    const long = 'ANTHROPIC_BASE_URL=https://bot.hoody.bot ANTHROPIC_API_KEY="$HOODY_BOT_KEY_WITH_A_VERY_LONG_NAME" claude';
    render(<CodeBlock lang="plain" label="AI apps" lines={[{ caption: 'Use it with Claude Code', code: long }]} />);
    const code = screen.getByText(long);
    expect(code).toHaveClass('wrap');
    expect(code.closest('[tabindex]')).toBeNull();
    await press('Copy Use it with Claude Code');
    await press('Copy all');
    expect(written).toEqual([long, long]);
  });

  it('GU-L1: wrap={false} keeps a step line on one line in a keyboard-scrollable region', () => {
    render(<CodeBlock lang="plain" label="CLI" wrap={false} lines={[{ caption: 'Run', code: 'hoody run x' }]} />);
    const code = screen.getByText('hoody run x');
    expect(code).not.toHaveClass('wrap');
    expect(code).toHaveAttribute('tabindex', '0');
  });

  it('GU-L1: the wrap rule outranks the one-line rule for step lines (CSS order cannot undo it)', () => {
    expect(idsCss).toMatch(/\.stepCode\.wrap\s*\{[^}]*white-space:\s*pre-wrap[^}]*overflow-wrap:\s*anywhere/);
  });

  it('a single block that scrolls is keyboard-focusable; a wrapped one is not', () => {
    const { container, unmount } = render(<CodeBlock lang="plain" code="a very long line" label="Config" />);
    expect(container.querySelector('pre')).toHaveAttribute('tabindex', '0');
    unmount();
    const wrapped = render(<CodeBlock lang="plain" code="a very long line" label="Config" wrap />);
    expect(wrapped.container.querySelector('pre')).not.toHaveAttribute('tabindex');
  });

  it('a placeholder is a neutral chip (hairline, raised surface), never the accent', () => {
    const rule = /\.placeholder\s*\{([^}]*)\}/.exec(idsCss)?.[1] ?? '';
    expect(rule).toMatch(/border:[^;]*solid var\(--hx-line-2\)/);
    expect(rule).toMatch(/background:\s*var\(--hx-raised\)/);
    // Tight to the text around it, so an address reads as one word ("https://bot.hoody.bot").
    expect(rule).toMatch(/padding-inline:\s*var\(--sp-half\)/);
    expect(rule).not.toMatch(/--hx-acc/);
  });

  it('a scrolling block is a named region: the block label, else "Code"', () => {
    const { unmount } = render(<CodeBlock lang="plain" code="a very long line" label="Config" />);
    expect(screen.getByRole('region', { name: 'Config' }).tagName).toBe('PRE');
    unmount();
    render(<CodeBlock lang="plain" code="a very long line" />);
    expect(screen.getByRole('region', { name: 'Code' })).toHaveAttribute('tabindex', '0');
  });

  it('a one-line step scroller is a region named by its caption', () => {
    render(<CodeBlock lang="plain" label="CLI" wrap={false} lines={[{ caption: 'Run', code: 'hoody run x' }, { code: 'hoody ls' }]} />);
    expect(screen.getByRole('region', { name: 'Run' })).toHaveTextContent('hoody run x');
    expect(screen.getByRole('region', { name: 'CLI' })).toHaveTextContent('hoody ls');
  });

  it('a trailing newline shows no extra empty line (and no stray prompt); Copy keeps the text exact', async () => {
    const { container } = render(<CodeBlock lang="plain" code={'one\ntwo\n'} label="Config" prompt />);
    expect(container.querySelectorAll('pre > span')).toHaveLength(2);
    await press('Copy code');
    expect(written).toEqual(['one\ntwo\n']);
  });

  it('a single code block still copies the whole code', async () => {
    render(<CodeBlock lang="plain" code={'one\ntwo'} label="Config" />);
    await press('Copy code');
    expect(written).toEqual(['one\ntwo']);
  });
});

describe('CodeBlock colour across a placeholder, and per line (Guide SDK door)', () => {
  const strs = (el: Element) => [...el.querySelectorAll('[class*="hl_str"]')].map((e) => e.textContent);
  const only = () => document.querySelector('code') as HTMLElement;

  it('a placeholder inside a string keeps the string colour on both sides and renders as a placeholder', () => {
    render(<CodeBlock lang="ts" lines={[{ code: ["await h.withComputer('a-", { placeholder: 'computer' }, "-b');"] }]} />);
    expect(strs(only())).toEqual(["'a-", "-b'"]);
    expect(screen.getByRole('img', { name: /computer/ }).className).toMatch(/placeholder/);
    expect(screen.getByRole('img', { name: /computer/ }).closest('[class*="hl_"]')).toBeNull();
    expect(only().textContent).toBe("await h.withComputer('a-computer-b');");
  });

  it('what follows the closing quote is not read as a string', () => {
    render(<CodeBlock lang="ts" lines={[{ code: ["f('", { placeholder: 'computer' }, "'); const a = 1;"] }]} />);
    expect(strs(only())).toEqual(["'", "'"]);
    expect(only().querySelector('[class*="hl_kw"]')?.textContent).toBe('const');
  });

  it('text parts split around a filled-in id read as one string', () => {
    render(<CodeBlock lang="ts" lines={[{ code: ["f('", 'abc', "');"] }]} />);
    expect(strs(only())).toEqual(["'abc'"]);
  });

  it('placeholders at the start, the end and side by side keep their order and lose no text', () => {
    render(<CodeBlock lang="ts" lines={[{ code: [{ placeholder: 'one' }, { placeholder: 'two' }, ' = 1; ', { placeholder: 'three' }] }]} />);
    expect(screen.getAllByRole('img').map((e) => e.textContent)).toEqual(['one', 'two', 'three']);
    expect(only().textContent).toBe('onetwo = 1; three');
  });

  it('a line names its own language; the others keep the block\'s', () => {
    render(<CodeBlock lang="ts" lines={[{ code: 'npm install hoody-sdk', lang: 'shell' }, { code: 'const a = 1;' }]} />);
    const [npm, ts] = [...document.querySelectorAll('code')] as [HTMLElement, HTMLElement];
    expect(npm.querySelector('[class*="sh_cmd"]')?.textContent).toBe('npm');
    expect(npm.querySelector('[class*="hl_"]')).toBeNull();
    expect(ts.querySelector('[class*="hl_kw"]')?.textContent).toBe('const');
    expect(ts.querySelector('[class*="sh_"]')).toBeNull();
  });

  it("a line cannot name 'plain': a plain line sits in a block that says so, with its reason", () => {
    // @ts-expect-error a line's lang excludes 'plain', which would pass std-codelang with no reason
    const line: CodeLine = { code: 'x', lang: 'plain' };
    expect(line.code).toBe('x');
  });

  it('what stands for a placeholder joins nothing around it into a keyword or a number', () => {
    render(<CodeBlock lang="ts" lines={[{ code: ['e', { placeholder: 'one' }, 'port 0', { placeholder: 'two' }, 'ff'] }]} />);
    expect(only().querySelector('[class*="hl_kw"]')).toBeNull();
    expect([...only().querySelectorAll('[class*="hl_num"]')].map((e) => e.textContent)).toEqual(['0']);
  });

  it('a plain block can hold one shell line', () => {
    render(<CodeBlock lang="plain" lines={[{ code: 'https://a.example' }, { code: 'curl https://a.example', lang: 'shell' }]} />); // reason: an address line beside the command under test
    const [address, curl] = [...document.querySelectorAll('code')] as [HTMLElement, HTMLElement];
    expect(address.querySelector('[class*="hl_"], [class*="sh_"]')).toBeNull();
    expect(curl.querySelector('[class*="sh_cmd"]')?.textContent).toBe('curl');
  });

  it('a line in terminal output shows and copies without its escapes, as a whole block does', async () => {
    render(<CodeBlock lang="plain" lines={[{ code: '\u001b[31mred\u001b[0m', lang: 'ansi' }]} />); // reason: the per-line ansi case under test
    expect(only().textContent).toBe('red');
    await press('Copy all');
    expect(written).toEqual(['red']);
  });

  it('Copy gives the same bytes whatever the colour: Copy all joins each line\'s own text, and a masked line its copy', async () => {
    const text = "const box = await hoody.withComputer('abc');\nconst s = \"é\";";
    render(<CodeBlock lang="ts" lines={[{ code: 'npm install hoody-sdk@beta', lang: 'shell' }, { code: ["const box = await hoody.withComputer('", 'a…c', "');"], copy: text }]} />);
    await press('Copy all');
    expect(written).toEqual([`npm install hoody-sdk@beta\n${text}`]);
  });
});

describe('CopyButton (kit gaps from the page scan)', () => {
  it('withLabel is the kit\'s ghost Button with the copy icon and the label in one row, anywhere', () => {
    render(<CopyButton text="x" label="address" withLabel />);
    const btn = screen.getByRole('button', { name: 'address' });
    expect(btn).toHaveAttribute('data-variant', 'ghost');
    expect(btn).toHaveClass('button', 'ghost', 'sm');
    expect(btn).toHaveTextContent(/^address$/);
    expect(btn.querySelector('svg')).not.toBeNull();
  });

  it('getValue is read at press time, so a secret never sits in the element tree', async () => {
    let secret = 'first';
    const { container } = render(<CopyButton getValue={() => secret} label="Copy token" />);
    secret = 'hk_live_9f8e7d';
    expect(container.innerHTML).not.toContain('hk_live');
    await press('Copy token');
    expect(written).toEqual(['hk_live_9f8e7d']);
  });

  it('a getValue that has nothing (null) copies nothing and does not claim success', async () => {
    render(<CopyButton getValue={() => null} label="Copy token" />);
    await press('Copy token');
    expect(written).toEqual([]);
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't copy");
  });

  it('a getValue that throws reads as a failed copy, never an error out of the press', async () => {
    render(
      <CopyButton
        getValue={() => {
          throw new Error('gone');
        }}
        label="Copy token"
      />,
    );
    await press('Copy token');
    expect(written).toEqual([]);
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't copy");
  });

  it('two quick presses: the last press decides what shows, even when the first answers later', async () => {
    const answers: Array<(ok: boolean) => void> = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => new Promise<void>((ok, no) => answers.push((v) => (v ? ok() : no(new Error('denied'))))) },
    });
    render(<CopyButton text="x" label="Copy link" />);
    await press('Copy link');
    await press('Copy link');
    await act(async () => answers[1]?.(true));
    await act(async () => answers[0]?.(false));
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard');
  });

  it('isDisabled refuses the press', async () => {
    render(<CopyButton text="x" label="Copy link" isDisabled />);
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeDisabled();
    await press('Copy link');
    expect(written).toEqual([]);
  });

  it('size md is the regular control size', () => {
    render(<CopyButton text="x" label="Copy" size="md" />);
    const btn = screen.getByRole('button', { name: 'Copy' });
    expect(btn).toHaveClass('button', 'iconOnly', 'ghost');
    expect(btn, 'md is the kit default size: no sm class').not.toHaveClass('sm');
  });
});
