// Vitest: Delete Bot when the link list is empty. The API lists a computer's Bot URLs to its project's owner alone and gives
// anyone else (a collaborator) an empty list, never a refusal. An empty list is "no link" only for the owner: for anyone else
// the Bot would be deleted and the owner's public link left up, a link no page of theirs shows. So the flow reads the
// computer's project first and stops (BOT_LINK_OWNER_ONLY) when it names another owner; a list with rows needs no such read.
import { answers, bootFixtureCore, capture, outcomeOf, reply, type FixtureRequest } from '@core';
import { beforeEach, describe, expect, it } from 'vitest';
import { ROUTES, deleteBotFlow, registerTargets } from './data';

const BOT = { botKey: 'c-atlas~global~chief', uid: 'u-1' };
const other = { id: 'bu_other', label: 'bu_other', url: 'https://bu_other.x.test', status: 'active', computer_id: 'c-atlas', bot: { realm: 'global', id: 'scout', uid: 'u-2' } };
const list = (rows: unknown[]) => answers.ok({ data: { bot_urls: rows, next_cursor: null } });
// The computer's project (p-1), owned by the account this page acts for.
const ownProject = () => answers.ok({ data: { id: 'p-1', user_id: capture().account } });
type Answer = Parameters<typeof reply>[1];

let sent: Array<{ name: string; path: string }>;
function boot(o: { urlList?: Answer; project?: Answer; remove?: Answer } = {}) {
  sent = [];
  const rec = (name: 'urlList' | 'project' | 'remove', answer: Answer) =>
    reply(ROUTES[name], (req: FixtureRequest) => {
      sent.push({ name, path: req.path });
      return typeof answer === 'function' ? answer(req) : answer;
    });
  bootFixtureCore({ rules: [rec('urlList', o.urlList ?? list([])), rec('project', o.project ?? ownProject), rec('remove', o.remove ?? answers.ok({}))] });
}
const names = () => sent.map((s) => s.name);
const caught = async (p: Promise<unknown>): Promise<{ code?: string; status?: number }> => p.then(() => { throw new Error('it did not stop'); }, (e) => e as { code?: string; status?: number });

describe('Delete Bot with an empty link list', () => {
  beforeEach(() => registerTargets([{ id: 'c-atlas', project_id: 'p-1', server_name: 'atlas-srv' }]));

  it('read by the project\'s owner, it is "no link": the project is read, then the Bot is deleted', async () => {
    boot();
    expect(capture().account).toBeTruthy();
    await deleteBotFlow(BOT);
    expect(names()).toEqual(['urlList', 'project', 'remove']);
    expect(sent[1]?.path).toBe('/projects/p-1');
  });

  it('read by someone else (a collaborator), it deletes nothing: only the owner may delete this Bot', async () => {
    boot({ project: answers.ok({ data: { id: 'p-1', user_id: 'f'.repeat(24) } }) });
    const e = await caught(deleteBotFlow(BOT));
    expect(e.code).toBe('BOT_LINK_OWNER_ONLY');
    expect(outcomeOf(e, true)).toBe('failed');
    expect(names()).toEqual(['urlList', 'project']);
  });

  it.each([
    ['fails', answers.refused(500, 'INTERNAL')],
    ['is lost', answers.lost(1)],
    ['names no owner', answers.ok({ data: { id: 'p-1' } })],
  ])('whose project read %s, it is not "no link": nothing is deleted', async (_n, project) => {
    boot({ project });
    expect((await caught(deleteBotFlow(BOT))).code).toBe('BOT_LINK_UNREAD');
    expect(names()).toEqual(['urlList', 'project']);
  });

  it('for a computer whose project is not known, nothing more is read and nothing is deleted', async () => {
    registerTargets([{ id: 'c-atlas', server_name: 'atlas-srv' }]);
    boot();
    expect((await caught(deleteBotFlow(BOT))).code).toBe('BOT_LINK_UNREAD');
    expect(names()).toEqual(['urlList']);
  });

  it('a list with rows (another Bot\'s link here) is read by the owner already: no project read', async () => {
    boot({ urlList: list([other]) });
    await deleteBotFlow(BOT);
    expect(names()).toEqual(['urlList', 'remove']);
  });
});
