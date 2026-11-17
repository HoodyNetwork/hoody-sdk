// SystemSteps and ExamplePicker: the browser's
// own system first, one step read with the picker, at most one code block masked on screen and copied whole, the
// prerequisite and extras only for their system; an example picker that shows only the chosen code, kept in the URL
// with `param`.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExamplePicker, SystemSteps, systemOfAgent, type SystemStep } from './Steps';

let written: string[] = [];
beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (s: string) => (written.push(s), Promise.resolve()) } });
});
afterEach(() => vi.restoreAllMocks());

const asAgent = (userAgent: string, maxTouchPoints = 0) => {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  vi.spyOn(navigator, 'maxTouchPoints', 'get').mockReturnValue(maxTouchPoints);
};

async function inRouter(Component: () => ReactElement, at = '/') {
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: [at] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
  return router;
}

const SECRET = 'https://abc-SECRET.example.test';
const SYSTEMS: SystemStep[] = [
  { id: 'mac', label: 'Mac', step: 'Open Finder.' },
  { id: 'windows', label: 'Windows', step: 'Open File Explorer.', need: 'Needs the WebClient service.' },
  {
    id: 'linux',
    label: 'Linux',
    step: 'Open a terminal.',
    code: { label: 'Mount on Linux', lang: 'shell', lines: [{ caption: 'Mount', code: 'mount https://abc-••••.example.test', copy: `mount ${SECRET}` }] },
    more: <button type="button">Linux extra</button>,
  },
  { id: 'phone', label: 'Phone', step: 'Use a WebDAV app.' },
];

describe('systemOfAgent', () => {
  it('tells the four systems apart; an iPad that reports a Mac is a phone; Mac when it cannot tell', () => {
    const of = (userAgent: string, maxTouchPoints = 0) => systemOfAgent({ userAgent, maxTouchPoints });
    expect(of('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
    expect(of('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
    expect(of('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)')).toBe('linux');
    expect(of('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('phone');
    expect(of('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('phone');
    expect(of('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('phone');
    expect(of('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('mac');
    expect(of('')).toBe('mac');
    expect(systemOfAgent(undefined)).toBe('mac');
  });
});

describe('SystemSteps', () => {
  it("starts on the browser's own system, its step read with the picker, its code masked on screen and copied whole", async () => {
    asAgent('Mozilla/5.0 (X11; Linux x86_64)');
    render(<SystemSteps label="Your device" systems={SYSTEMS} />);
    const group = screen.getByRole('radiogroup', { name: 'Your device' });
    expect(within(group).getByRole('radio', { name: 'Linux' })).toBeChecked();
    expect(group).toHaveAccessibleDescription('Open a terminal.');
    const code = screen.getByRole('figure', { name: 'Mount on Linux' });
    expect(code).not.toHaveTextContent('SECRET');
    expect(screen.getByRole('button', { name: 'Linux extra' })).toBeInTheDocument();
    await userEvent.click(within(code).getAllByRole('button', { name: /^Copy/ })[0]!);
    await waitFor(() => expect(written.at(-1)).toBe(`mount ${SECRET}`));
  });

  it('another system shows only its own step, need and extras; a system with no code shows no block', async () => {
    asAgent('Mozilla/5.0 (X11; Linux x86_64)');
    render(<SystemSteps label="Your device" systems={SYSTEMS} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Windows' }));
    expect(screen.getByRole('radiogroup', { name: 'Your device' })).toHaveAccessibleDescription('Open File Explorer.');
    expect(screen.getByText('Needs the WebClient service.')).toBeInTheDocument();
    expect(screen.queryByRole('figure', { name: 'Mount on Linux' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Linux extra' })).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: 'Mac' }));
    expect(screen.queryByText('Needs the WebClient service.')).toBeNull();
  });

  it('`first` wins over the browser; a browser system not offered falls back to the first one', () => {
    asAgent('Mozilla/5.0 (X11; Linux x86_64)');
    const { unmount } = render(<SystemSteps label="Your device" systems={SYSTEMS} first="phone" />);
    expect(screen.getByRole('radio', { name: 'Phone' })).toBeChecked();
    unmount();
    render(<SystemSteps label="Your device" systems={SYSTEMS.filter((s) => s.id !== 'linux')} />);
    expect(screen.getByRole('radio', { name: 'Mac' })).toBeChecked();
  });

  it('a controlled choice follows `value` and reports presses', async () => {
    asAgent('Mozilla/5.0 (X11; Linux x86_64)');
    const onChange = vi.fn();
    render(<SystemSteps label="Your device" systems={SYSTEMS} value="mac" onChange={onChange} />);
    expect(screen.getByRole('radio', { name: 'Mac' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Phone' }));
    expect(onChange).toHaveBeenCalledWith('phone');
  });
});

const EXAMPLES = [
  { id: 'shell', name: 'Shell', label: 'Call in Shell', lang: 'shell' as const, lines: [{ code: 'curl https://api.example.test' }] },
  { id: 'js', name: 'JavaScript', label: 'Call in JavaScript', lang: 'js' as const, lines: [{ code: 'await api.list();' }], note: 'Needs the SDK.' },
];

describe('ExamplePicker', () => {
  it('shows only the chosen example, its note under it; one example has no picker', async () => {
    const { unmount } = render(<ExamplePicker label="Language" examples={EXAMPLES} />);
    expect(screen.getByRole('radio', { name: 'Shell' })).toBeChecked();
    expect(screen.getByRole('figure', { name: 'Call in Shell' })).toBeInTheDocument();
    expect(screen.queryByText('Needs the SDK.')).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: 'JavaScript' }));
    expect(screen.queryByRole('figure', { name: 'Call in Shell' })).toBeNull();
    expect(screen.getByRole('figure', { name: 'Call in JavaScript' })).toBeInTheDocument();
    expect(screen.getByText('Needs the SDK.')).toBeInTheDocument();
    unmount();
    render(<ExamplePicker label="Language" examples={EXAMPLES.slice(0, 1)} />);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByRole('figure', { name: 'Call in Shell' })).toBeInTheDocument();
  });

  it('one-command examples keep CodeBlock\'s own forms: `code`, `prompt`, `footer`; a link example is plain for its stated reason', async () => {
    render(
      <ExamplePicker
        label="Way"
        examples={[
          { id: 'cli', name: 'CLI', label: 'Run it', lang: 'shell', code: 'hoody computers', prompt: true, footer: <a href="/ref">Full reference</a> },
          { id: 'url', name: 'Link', label: 'Open it', lang: 'shell', plain: 'a link to open, not code to run', code: 'https://api.example.test/v1/computers' },
        ]}
      />,
    );
    const cli = screen.getByRole('figure', { name: 'Run it' });
    expect(cli).toHaveTextContent('hoody computers');
    // the `$ ` prompt is CodeBlock's own (a class on the line, drawn by CSS, never copied)
    expect(cli.querySelector('pre > span[class*="prompt"]')).not.toBeNull();
    expect(cli.querySelector('[class*="sh_"]')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Full reference' })).toBeInTheDocument();
    await userEvent.click(within(cli).getAllByRole('button', { name: /^Copy/ })[0]!);
    await waitFor(() => expect(written.at(-1)).toBe('hoody computers'));
    await userEvent.click(screen.getByRole('radio', { name: 'Link' }));
    const url = screen.getByRole('figure', { name: 'Open it' });
    expect(url).toHaveTextContent('https://api.example.test/v1/computers');
    // shell colouring is off: the block is plain (the same text shown as shell would colour its command word)
    expect(url.querySelector('[class*="sh_"]')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Full reference' })).toBeNull();
  });

  it('a plain block stays uncoloured even when one of its lines names a language', () => {
    render(
      <ExamplePicker
        label="Way"
        examples={[{ id: 'url', name: 'Link', label: 'Open it', lang: 'shell', plain: 'a link to open, not code to run', lines: [{ caption: 'Open', code: 'curl -fsSL https://x | sh', lang: 'shell' }] }]}
      />,
    );
    const block = screen.getByRole('figure', { name: 'Open it' });
    expect(block).toHaveTextContent('curl -fsSL https://x | sh');
    expect(block.querySelector('[class*="sh_"]')).toBeNull();
  });

  it('with `param` the choice is the URL: read on load, written on a press, the first example leaves it clean', async () => {
    const router = await inRouter(() => <ExamplePicker label="Language" examples={EXAMPLES} param="lang" />, '/?lang=js');
    expect(screen.getByRole('radio', { name: 'JavaScript' })).toBeChecked();
    expect(screen.getByRole('figure', { name: 'Call in JavaScript' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Shell' }));
    await waitFor(() => expect(screen.getByRole('figure', { name: 'Call in Shell' })).toBeInTheDocument());
    expect(router.state.location.search).not.toHaveProperty('lang');
  });
});
