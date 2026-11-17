// New realm name errors say which rule a name breaks, in the words Rename realms uses (shell rename.*): a reserved word (named),
// too long, hidden or control characters, never one general "This name can't be used".
import { beforeEach, describe, expect, it } from 'vitest';
import { foldRealmAlias, validateRealmAliases } from '@core';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { resetRealmsWorld } from './fixtures';
import { checkName } from './logic';
import page from './page';
import strings from './strings.en.json';

const T = 8000;
const check = (v: string) => checkName(v, {}, validateRealmAliases, foldRealmAlias);

beforeEach(() => resetRealmsWorld());

describe('realms: name rules', () => {
  it('keeps the rule core names, and the reserved word', () => {
    expect(check('Global')).toMatchObject({ ok: false, reason: 'reserved', word: 'global' });
    expect(check('x'.repeat(65))).toMatchObject({ ok: false, reason: 'length' });
    expect(check('a\u0007b')).toMatchObject({ ok: false, reason: 'control' });
    expect(check('x'.repeat(64))).toEqual({ ok: true, alias: 'x'.repeat(64) });
    // A throw with no reason core knows stays the general rule.
    expect(checkName('Lab', {}, () => { throw new Error('other'); }, foldRealmAlias)).toMatchObject({ ok: false, reason: 'rule' });
  });

  // The sentences are written out here (the same words as Rename realms, shell rename.*), never read from the strings
  // table the page uses, so a wrong string fails.
  it('the page shows the exact rule broken: the reserved word, the length limit, a control character', async () => {
    await renderPage(page, { path: '/realms/new' });
    const field = await screen.findByLabelText(strings['name.label'], undefined, { timeout: T });
    const next = screen.getByRole('button', { name: strings.next });
    await waitFor(() => expect(next).toBeEnabled(), { timeout: T });
    const general = "This name can't be used. Pick another one.";
    await userEvent.type(field, 'Global');
    await userEvent.click(next);
    expect(await screen.findByText('\u201cglobal\u201d is a word the Hub uses. Pick another name.', undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.queryByText(general)).toBeNull();
    await userEvent.clear(field);
    await userEvent.click(field);
    await userEvent.paste('x'.repeat(65));
    expect(await screen.findByText('Names can be up to 64 characters.', undefined, { timeout: T })).toBeInTheDocument();
    await userEvent.clear(field);
    await userEvent.click(field);
    await userEvent.paste('a\u0007b');
    expect(await screen.findByText("Names can't contain hidden or control characters.", undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.queryByText(general)).toBeNull();
  });
});
