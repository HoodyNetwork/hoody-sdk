// One accent per view: the pane's New chat is the accent only on Chats, where starting a chat is the main
// action. On Agents, Automations, Knowledge and Settings the screen's own main action holds the accent (Models & keys:
// Connect an account), so New chat there is a plain button.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadFixtures } from '@app/fixtures';
import { cleanup, renderPage, screen, within } from '@app/testing';
import { links } from './links';
import page from './page';
import strings from './strings.en.json';
import paneStrings from './parts/Pane.strings.en.json';
import newChatStrings from './new/NewChat.strings.en.json';
import agentStrings from './agents/strings.en.json';
import wfStrings from './auto/workflows/strings.en.json';
import skillStrings from './knowledge/skills/strings.en.json';

const SLOW = { timeout: 5000 };

beforeAll(async () => {
  await Promise.all([import('./view'), import('./agents/AgentsView'), import('./auto/workflows/List'), import('./knowledge/skills/List'), loadFixtures('ai')]);
}, 120_000);

async function newChatAt(path: string, ready: () => Promise<unknown>) {
  cleanup();
  await renderPage(page, { path });
  await ready();
  const nav = await screen.findByRole('navigation', { name: paneStrings['pane.label'] }, SLOW);
  return within(nav).getByRole('link', { name: paneStrings['pane.newChat'] });
}
const accents = () => [...document.querySelectorAll('[data-variant="primary"]')];

describe("the AI pane's New chat holds the accent only on Chats", () => {
  it('Chats: New chat is the accent', async () => {
    const nc = await newChatAt(links.tab, () => screen.findByRole('heading', { level: 1, name: newChatStrings.title }, SLOW));
    expect(nc.getAttribute('data-variant')).toBe('primary');
  });

  it('Models & keys: Connect an account is the one accent; New chat is a plain button', async () => {
    const nc = await newChatAt(links.list, () => screen.findByText(strings['def.helper'], undefined, SLOW));
    expect(nc.getAttribute('data-variant')).toBe('secondary');
    const acc = accents();
    expect(acc).toHaveLength(1);
    expect(acc[0]!.textContent).toBe(strings['connect.open']);
  });

  const OTHER: Array<[string, string, () => Promise<unknown>]> = [
    ['Agents', links.agents, () => screen.findByRole('heading', { level: 1, name: agentStrings.title }, SLOW)],
    ['Automations', links.workflows, () => screen.findByRole('heading', { level: 1, name: wfStrings['wf.title'] }, SLOW)],
    ['Knowledge', links.skills, () => screen.findByRole('heading', { level: 1, name: skillStrings.title }, SLOW)],
  ];
  it.each(OTHER)('%s: New chat is a plain button', async (_name, path, ready) => {
    const nc = await newChatAt(path, ready);
    expect(nc.getAttribute('data-variant')).toBe('secondary');
  });
});
