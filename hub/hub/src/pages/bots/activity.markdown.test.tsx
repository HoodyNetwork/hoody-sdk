// Vitest: the messages on the Activity log are prose. A user's or the Bot's message keeps its paragraphs, lists
// and code, drawn by the kit Prose as React text, never as HTML; secrets stay hidden and control or bidi characters are dropped.
import { renderPage, screen, within } from '@app/testing';
import { Prose } from '@kit';
import { render } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { messageText } from './logic';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const open = () => renderPage(page, { state: 'markdown', path: `/bots?sel=${encodeURIComponent(CHIEF)}` });
const log = async () => within(await screen.findByRole('list', { name: strings['activity.title'] }));
const bubble = async (text: RegExp) => (await (await log()).findAllByText(text))[0]!.closest('li') as HTMLElement;

describe('the text of a message', () => {
  it('keeps its newlines and drops control and bidi characters', () => {
    expect(messageText('one\n\ntwo\nthree')).toBe('one\n\ntwo\nthree');
    expect(messageText('a\u0000b\u0007c‮d⁦e\u001b[31mf\r\ng')).toBe('abcdef\ng');
    expect(messageText(42)).toBe('');
  });
  it('hides a secret, also one split by a control character', () => {
    expect(messageText('key sk-abcdefghijklmnop1234 here')).toBe('key [hidden] here');
    expect(messageText('`sk-abcdefghijklmnop1234`')).toBe('`[hidden]`');
    expect(messageText('sk-abcdef\u0000ghijklmnop1234')).toBe('[hidden]');
  });
  it('a link whose address shows a secret once the browser normalises it is drawn as text', () => {
    for (const url of ['https://sk%2Dabcdefghijklmnop1234.example/setup', 'https://ｓｋ－ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐ１２３４.example/']) {
      const { container, unmount } = render(<Prose text={messageText(`Docs: [CDN setup](${url}) and ${url} too`)} />);
      expect(container.querySelectorAll('a')).toHaveLength(0);
      expect(document.body.innerHTML).not.toContain('abcdefghijklmnop1234');
      unmount();
    }
  });
  it('is cut at its bound with an ellipsis', () => {
    expect(messageText('x'.repeat(5000))).toBe(`${'x'.repeat(4000)}…`);
    expect(messageText('x'.repeat(4000))).toBe('x'.repeat(4000));
    expect(messageText('abcdef', 3)).toBe('abc…');
  });
  it('never cuts through the hidden-secret marker', () => {
    expect(messageText(`${'x'.repeat(3996)} sk-abcdefghijklmnop1234`)).toBe(`${'x'.repeat(3996)} …`);
    expect(messageText(`${'x'.repeat(3991)} sk-abcdefghijklmnop1234 tail`)).toBe(`${'x'.repeat(3991)} [hidden]…`);
    expect(messageText('sk-abcdefghijklmnop1234 tail', 4)).toBe('…');
    expect(messageText(`${'x'.repeat(3999)}\u{1F600}`)).toBe(`${'x'.repeat(3999)}…`);
  });
});

describe('a message on the Activity log', () => {
  it("keeps the Bot's paragraphs", async () => {
    await open();
    const b = await bubble(/Here is yesterday/);
    const paras = b.querySelectorAll('p');
    expect([...paras].map((p) => p.textContent)).toEqual(expect.arrayContaining(['Here is yesterday:', 'What I did:', 'Shall I restart the blog now?']));
  }, 60_000);
  it("keeps a user's line breaks inside the message", async () => {
    await open();
    const b = await bubble(/sum up yesterday/);
    expect(b.querySelector('p')?.textContent).toBe("Can you sum up yesterday's deploys?\nAlso: which ones failed?");
  }, 60_000);
  it('draws a list as a list, and bold as bold', async () => {
    await open();
    const b = await bubble(/Here is yesterday/);
    const lists = within(b).getAllByRole('list');
    expect(lists).toHaveLength(2);
    expect(lists[0]!.tagName).toBe('OL');
    expect(within(lists[0]!).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['shop deployed at 09:12, fine.', 'blog failed: the build ran out of memory.']);
    expect(within(lists[1]!).getAllByRole('listitem')).toHaveLength(2);
    expect([...b.querySelectorAll('strong')].map((x) => x.textContent)).toEqual(['shop', 'blog']);
  }, 60_000);
  it('draws inline code and a fenced block as code', async () => {
    await open();
    const b = await bubble(/Here is yesterday/);
    const inline = [...b.querySelectorAll('p code, li code')].map((x) => x.textContent);
    expect(inline).toEqual(expect.arrayContaining(['2 GB', 'deploy.yml']));
    const pre = b.querySelector('pre');
    expect(pre?.textContent).toContain('memory: 2g');
    expect(b.textContent).not.toContain('```');
  }, 60_000);
  it('still hides a secret', async () => {
    await open();
    const b = await bubble(/The CDN key is/);
    expect(b.textContent).toContain('[hidden]');
    expect(b.textContent).not.toMatch(/sk-live/);
  }, 60_000);
  it('shows HTML-looking text as text, never as HTML', async () => {
    await open();
    const user = await bubble(/The CDN key is/);
    expect(user.textContent).toContain('<b>Sale</b>');
    expect(user.querySelector('b')).toBeNull();
    const bot = await bubble(/Restarted, and I did not keep the key/);
    expect(bot.textContent).toContain('<script>alert(1)</script>');
    expect(bot.querySelector('code')?.textContent).toBe('<b>');
    const l = await screen.findByRole('list', { name: strings['activity.title'] });
    expect(l.querySelectorAll('script, b')).toHaveLength(0);
  }, 60_000);
  it('takes the direction of the message from its own text, not from the sender line above it', async () => {
    await open();
    const b = await bubble(/إعادة تشغيل/);
    expect(b.getAttribute('dir')).toBe('auto');
    expect(b.querySelector('p')?.closest('[dir]')?.getAttribute('dir')).toBe('auto');
    expect(b.querySelector('p')?.closest('[dir]')).not.toBe(b);
  }, 60_000);
});
