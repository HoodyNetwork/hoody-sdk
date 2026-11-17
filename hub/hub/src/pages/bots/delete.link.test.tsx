// Vitest: Delete Bot takes the Bot's link (its Bot URL on the Hoody API) down first. The agent's own delete is invisible to
// the API, so a Bot deleted before its link would leave a live link no page shows: the link goes first, each step
// is sent once, and the Bot is deleted only when no link of it is left.
import { answers, bootFixtureCore, outcomeOf, reply, type FixtureRequest } from '@core';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DELETE_BOT_CODES, ROUTES, botLinkIds, deleteBotFlow, registerTargets } from './data';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const KEY = 'c-atlas~global~chief';
const BOT = { botKey: KEY, uid: 'u-1' };
const url = (id: string, bot: Record<string, unknown> | null, computer: string | null = 'c-atlas') => ({ id, label: id, url: `https://${id}.x.test`, status: 'active', computer_id: computer, bot });
const mine = url('bu_mine', { realm: 'global', id: 'chief', uid: 'u-1' });
const other = url('bu_other', { realm: 'global', id: 'scout', uid: 'u-2' });
const list = (rows: unknown[], next: string | null = null) => answers.ok({ data: { bot_urls: rows, next_cursor: next } });
type Answer = Parameters<typeof reply>[1];

let sent: Array<{ name: string; path: string; query: Readonly<Record<string, string>> }>;
const ROWS = [mine, other];
const idOf = (req: FixtureRequest) => req.path.split('/').pop() ?? '';
const removedAnswer = (req: FixtureRequest) => answers.ok({ data: { id: idOf(req), state: 'removed' } });
const rowAnswer = (req: FixtureRequest) => {
  const row = ROWS.find((r) => r.id === idOf(req));
  return row ? answers.ok({ data: row }) : answers.refused(404, 'BOT_URL_NOT_FOUND');
};
function boot(o: { urlList?: Answer; urlGet?: Answer; urlDelete?: Answer; remove?: Answer } = {}) {
  sent = [];
  const rec = (name: 'urlList' | 'urlGet' | 'urlDelete' | 'remove', answer: Answer) =>
    reply(ROUTES[name], (req: FixtureRequest) => {
      sent.push({ name, path: req.path, query: req.query });
      return typeof answer === 'function' ? answer(req) : answer;
    });
  bootFixtureCore({ rules: [rec('urlList', o.urlList ?? list([other, mine])), rec('urlGet', o.urlGet ?? rowAnswer), rec('urlDelete', o.urlDelete ?? removedAnswer), rec('remove', o.remove ?? answers.ok({}))] });
}
const names = () => sent.map((s) => s.name);
const caught = async (p: Promise<unknown>): Promise<{ code?: string; status?: number }> => p.then(() => { throw new Error('it did not stop'); }, (e) => e as { code?: string; status?: number });

describe('Delete Bot, the live flow', () => {
  beforeEach(() => registerTargets([{ id: 'c-atlas', project_id: 'p-1', server_name: 'atlas-srv' }]));

  it('reads the computer\'s links fresh, removes the Bot\'s link, then deletes the Bot: once each, in that order', async () => {
    boot();
    await deleteBotFlow(BOT);
    expect(names()).toEqual(['urlList', 'urlGet', 'urlDelete', 'remove']);
    expect(sent[0]?.query).toMatchObject({ computer_id: 'c-atlas', limit: '100' });
    expect(sent[1]?.path).toBe('/bot-urls/bu_mine');
    expect(sent[2]?.path).toBe('/bot-urls/bu_mine');
    expect(sent[3]?.query.expect_uid).toBe('u-1');
  });

  it('a Bot without a link is deleted after the read, and no other Bot\'s link is touched', async () => {
    boot({ urlList: list([other]) });
    await deleteBotFlow(BOT);
    expect(names()).toEqual(['urlList', 'remove']);
  });

  it('the link is the Bot\'s by its uid; a link of another computer, or a detached one, is nobody\'s', async () => {
    boot({ urlList: list([url('bu_uid', { realm: 'r2', id: 'renamed', uid: 'u-1' }), url('bu_elsewhere', { realm: 'global', id: 'chief', uid: 'u-9' }, 'c-boreal'), url('bu_detached', null, null), other]) });
    expect(await botLinkIds(BOT)).toEqual(['bu_uid']);
  });

  it('with no uid known, the link is the Bot\'s by its computer, realm and id (what the Link tab shows)', async () => {
    boot({ urlList: list([url('bu_key', { realm: 'global', id: 'chief', uid: 'u-old' }), other]) });
    expect(await botLinkIds({ botKey: KEY, uid: '' })).toEqual(['bu_key']);
  });

  it('a link under the Bot\'s computer, realm and id that names another uid is another Bot\'s: it is not removed and the Bot is not deleted', async () => {
    boot({ urlList: list([url('bu_replacement', { realm: 'global', id: 'chief', uid: 'u-new' })]) });
    expect((await caught(deleteBotFlow(BOT))).code).toBe('BOT_LINK_OTHER');
    expect(names()).toEqual(['urlList']);
  });

  it('reads every page of the list before it decides', async () => {
    boot({ urlList: (req: FixtureRequest) => (req.query.cursor === 'c2' ? list([mine]) : list([other], 'c2')) });
    await deleteBotFlow(BOT);
    expect(names()).toEqual(['urlList', 'urlList', 'urlGet', 'urlDelete', 'remove']);
  });

  it.each([
    ['a refused read', answers.refused(500, 'INTERNAL')],
    ['a lost read', answers.lost(1)],
    ['an answer without the list', answers.ok({ data: {} })],
    ['a list that never ends', list([other], 'again')],
    ['a row without an id', list([{ ...mine, id: undefined }])],
    ['a row whose id is not text', list([{ ...mine, id: 7 }])],
    ['a row that is not a row', list(['bu_mine'])],
    ['a link of this computer that names no Bot', list([url('bu_x', null)])],
    ['a link of this computer whose Bot has no uid field', list([url('bu_x', { realm: 'global', id: 'chief' })])],
    ['an answer without a cursor', answers.ok({ data: { bot_urls: [other] } })],
    ['an empty cursor', answers.ok({ data: { bot_urls: [other], next_cursor: '' } })],
    ['a cursor that is not text', answers.ok({ data: { bot_urls: [other], next_cursor: 3 } })],
  ])('%s is not "no link": nothing is deleted', async (_n, urlList) => {
    boot({ urlList });
    expect((await caught(deleteBotFlow(BOT))).code).toBe('BOT_LINK_UNREAD');
    expect(names().filter((n) => n !== 'urlList')).toEqual([]);
  });

  it('a link removal whose answer was lost may have gone through: the Bot is not deleted and nothing is sent again', async () => {
    boot({ urlDelete: answers.lost(1) });
    const e = await caught(deleteBotFlow(BOT));
    expect(outcomeOf(e, true)).toBe('pending');
    expect(names()).toEqual(['urlList', 'urlGet', 'urlDelete']);
  });

  it('a 5xx on the link removal is unknown too', async () => {
    boot({ urlDelete: answers.pending5xx() });
    expect(outcomeOf(await caught(deleteBotFlow(BOT)), true)).toBe('pending');
    expect(names()).toEqual(['urlList', 'urlGet', 'urlDelete']);
  });

  it('only the project\'s owner removes the link: refused, the Bot is not deleted and the reason is kept', async () => {
    boot({ urlDelete: answers.refused(403, 'BOT_URL_OWNER_ONLY') });
    const e = await caught(deleteBotFlow(BOT));
    expect(e).toEqual({ code: 'BOT_LINK_OWNER_ONLY', status: 403 });
    expect(outcomeOf(e, true)).toBe('failed');
    expect(names()).toEqual(['urlList', 'urlGet', 'urlDelete']);
  });

  it('any other refusal of the link removal keeps the Bot', async () => {
    boot({ urlDelete: answers.refused(429, 'RATE_LIMIT_EXCEEDED') });
    expect(await caught(deleteBotFlow(BOT))).toEqual({ code: 'BOT_LINK_KEPT', status: 429 });
    expect(names()).toEqual(['urlList', 'urlGet', 'urlDelete']);
  });

  it('a link re-pointed to another Bot since the list is not this Bot\'s any more: it is left alone and the Bot is deleted', async () => {
    boot({ urlGet: answers.ok({ data: url('bu_mine', { realm: 'global', id: 'scout', uid: 'u-2' }) }) });
    await deleteBotFlow(BOT);
    expect(names()).toEqual(['urlList', 'urlGet', 'remove']);
  });

  it('a link re-pointed to another computer keeps its uid and is not this Bot\'s any more: left alone, the Bot is deleted', async () => {
    boot({ urlGet: answers.ok({ data: url('bu_mine', { realm: 'global', id: 'chief', uid: 'u-1' }, 'c-boreal') }) });
    await deleteBotFlow(BOT);
    expect(names()).toEqual(['urlList', 'urlGet', 'remove']);
  });

  it('a link gone by the second read (404) is gone: the Bot is deleted', async () => {
    boot({ urlGet: answers.refused(404, 'BOT_URL_NOT_FOUND') });
    await deleteBotFlow(BOT);
    expect(names()).toEqual(['urlList', 'urlGet', 'remove']);
  });

  it.each([
    ['fails', answers.refused(500, 'INTERNAL')],
    ['names another link', answers.ok({ data: other })],
    ['holds no row', answers.ok({})],
    ['names no Bot under this computer', answers.ok({ data: url('bu_mine', null) })],
    ['names a Bot without a uid', answers.ok({ data: url('bu_mine', { realm: 'global', id: 'chief' }) })],
  ])('a second read that %s removes nothing and keeps the Bot', async (_n, urlGet) => {
    boot({ urlGet });
    expect((await caught(deleteBotFlow(BOT))).code).toBe('BOT_LINK_UNREAD');
    expect(names()).toEqual(['urlList', 'urlGet']);
  });

  it.each([
    ['says nothing of the link', answers.ok({ data: {} })],
    ['names another link', answers.ok({ data: { id: 'bu_other', state: 'removed' } })],
    ['does not say removed', answers.ok({ data: { id: 'bu_mine', state: 'active' } })],
  ])('a removal answered 200 that %s is unknown: the Bot is not deleted', async (_n, urlDelete) => {
    boot({ urlDelete });
    expect(outcomeOf(await caught(deleteBotFlow(BOT)), true)).toBe('pending');
    expect(names()).toEqual(['urlList', 'urlGet', 'urlDelete']);
  });

  it('a link that is already gone (404) is gone: the Bot is deleted', async () => {
    boot({ urlDelete: answers.refused(404, 'BOT_URL_NOT_FOUND') });
    await deleteBotFlow(BOT);
    expect(names()).toEqual(['urlList', 'urlGet', 'urlDelete', 'remove']);
  });

  it('the Bot\'s own refusal after its link went says the link is gone and the Bot stays', async () => {
    boot({ remove: answers.refused(412, 'bot_changed') });
    const e = await caught(deleteBotFlow(BOT));
    expect(e).toEqual({ code: 'BOT_LINK_GONE_BOT_KEPT', status: 412 });
    expect(outcomeOf(e, true)).toBe('failed');
  });

  it('the Bot\'s delete that cannot be sent after its link went says so too (the link is gone, the Bot stays)', async () => {
    // The computer loses its server between the two steps: core refuses the agent call unsent.
    boot({ urlDelete: (req: FixtureRequest) => { registerTargets([{ id: 'c-atlas', project_id: 'p-1' }]); return removedAnswer(req); } });
    const e = await caught(deleteBotFlow(BOT));
    expect(names()).toEqual(['urlList', 'urlGet', 'urlDelete']);
    expect(e.code).toBe('BOT_LINK_GONE_BOT_KEPT');
    expect(outcomeOf(e, true)).toBe('failed');
  });

  it('the Bot\'s own refusal with no link removed keeps its own code, and its lost answer stays unknown', async () => {
    // Another Bot's link only: the list is read and holds nothing of this Bot's (an empty one: delete.owner.test.tsx).
    boot({ urlList: list([other]), remove: answers.refused(409, 'uid_mismatch') });
    expect((await caught(deleteBotFlow(BOT))).code).toBe('uid_mismatch');
    boot({ remove: answers.lost(1) });
    expect(outcomeOf(await caught(deleteBotFlow(BOT)), true)).toBe('pending');
  });

  it('every stop has its sentence', () => {
    for (const c of DELETE_BOT_CODES) expect((strings as Record<string, string>)[`danger.delete.${c}`], c).toBeTruthy();
  });
});

describe('Delete Bot, the confirm', () => {
  const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
  const open = (state: string) => renderPage(page, { state, path: `/bots?sel=${encodeURIComponent(CHIEF)}&do=delete` });

  it('says the link and its keys go with a Bot that has one', async () => {
    await open('idle');
    const dialog = await screen.findByRole('alertdialog', { name: /Delete Chief/ });
    expect(await within(dialog).findByText(strings['danger.delete.whatLink'])).toBeInTheDocument();
  });

  it('says nothing of a link for a Bot the read shows has none', async () => {
    await open('noLink');
    const dialog = await screen.findByRole('alertdialog', { name: /Delete Chief/ });
    expect(await within(dialog).findByText(strings['danger.delete.what'])).toBeInTheDocument();
  });

  it('says "if it has a link" while the links are not read', async () => {
    await open('linkReadFailed');
    const dialog = await screen.findByRole('alertdialog', { name: /Delete Chief/ });
    expect(await within(dialog).findByText(strings['danger.delete.whatLinkMaybe'])).toBeInTheDocument();
  });

  it('a delete stopped at the link says why, keeps the dialog and the Bot', async () => {
    await open('deleteLinkOwnerOnly');
    const dialog = await screen.findByRole('alertdialog', { name: /Delete Chief/ });
    await userEvent.type(within(dialog).getByRole('textbox'), 'Chief');
    await userEvent.click(within(dialog).getByRole('button', { name: strings['danger.deleteGo'] }));
    expect(await within(dialog).findByText(strings['danger.delete.BOT_LINK_OWNER_ONLY'])).toBeInTheDocument();
    expect(screen.getByRole('alertdialog', { name: /Delete Chief/ })).toBeInTheDocument();
  });
});
