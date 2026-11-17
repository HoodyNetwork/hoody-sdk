// The Rules & safety fixtures: the bodies they answer are read whole by the page's own decoders,
// every rule and hook is placed, and the hooks list answers only on a settings session that is open, for the folder it was
// opened for.
import { describe, expect, it } from 'vitest';
import type { FixtureRequest } from '@core';
import type { SettingsSessions } from '../connections/fixtures';
import { RULES_BLOCK, ruleHookRules } from './fixtures';
import { canChange, hooksBlockOf, scopeOf } from './hooks';
import { canEdit, placed, rulesBlockOf } from './logic';
import { rulesRoutes } from './routes';

const FOLDER = '/home/ada/projects/shop';
const sessions: SettingsSessions = new Map([['settings-1', undefined], ['settings-2', FOLDER]]);

const answerOf = async (route: unknown, query: Record<string, string> = {}) => {
  const rule = ruleHookRules(sessions).find((r) => r.route === route);
  if (!rule) throw new Error('no fixture rule for the route');
  const req = { query } as unknown as FixtureRequest;
  return (typeof rule.answer === 'function' ? await rule.answer(req) : rule.answer) as { status?: number; body: unknown };
};

describe('Rules & safety fixtures', () => {
  it('getHookRules: a complete user-scope block, every rule placed, the user scope editable', async () => {
    const b = rulesBlockOf((await answerOf(rulesRoutes.get)).body);
    expect(b).not.toBeNull();
    expect(b!.rules.map((r) => r.id)).toEqual(RULES_BLOCK.live.map((r) => r.id));
    expect(b!.rules.every((r) => placed(b!, r) === 'user')).toBe(true);
    expect(canEdit(b!, 'user', undefined)).toEqual({ ok: true });
  });

  it('listHooks on a realm-wide session: the user hooks only, read whole, each changeable, trust acknowledged', async () => {
    const a = await answerOf(rulesRoutes.list, { session_id: 'settings-1' });
    const b = hooksBlockOf(a.body);
    expect(b).not.toBeNull();
    expect(b!.hooks.map((h) => [h.event, scopeOf(b!, h)])).toEqual([['PreToolUse', 'user'], ['PostToolUse', 'user'], ['Stop', 'user']]);
    expect(b!.hooks.map((h) => canChange(b!, h, undefined))).toEqual(Array(3).fill({ ok: true, scope: 'user' }));
    expect(b!.trust.state).toBe('ok');
    expect(rulesBlockOf(a.body)).not.toBeNull();
  });

  it('listHooks on a session opened for a folder: that folder\'s project hook too, saved in its .hoody/settings.json', async () => {
    const b = hooksBlockOf((await answerOf(rulesRoutes.list, { session_id: 'settings-2' })).body);
    expect(b).not.toBeNull();
    const project = b!.hooks.filter((h) => scopeOf(b!, h) === 'project');
    expect(project.map((h) => h.source)).toEqual([`${FOLDER}/.hoody/settings.json`]);
    expect(canChange(b!, project[0]!, FOLDER)).toEqual({ ok: true, scope: 'project' });
    expect(canChange(b!, project[0]!, undefined)).toEqual({ ok: false, why: 'folder' });
  });

  it('listHooks on a session that is not open answers it as gone', async () => {
    for (const sid of ['', 'chat-1', 'settings-3', 'settings-']) expect((await answerOf(rulesRoutes.list, { session_id: sid })).status, sid).toBe(404);
  });
});
