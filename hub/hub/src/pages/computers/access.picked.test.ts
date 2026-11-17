// "Only people or keys I pick", the pure part: which documents are the drawer's own entries, the steps
// that add or remove one (group, its programs, then everyone else kept out, last), what a fresh read proves still
// missing, the key link, and made secrets.
import { describe, expect, it } from 'vitest';
import { type AccessRules, bodyFor, modeOf, rulesFrom, snapshotOf, summaryOf } from './parts/access.logic';
import { addSteps, entriesOf, entryGroup, finishSteps, KEY_PARAM, keyLink, makeSecret, peopleOf, remainingSteps, removeSteps, runSteps, type Step, type StepAnswer, stepDone, stepKey, stepVerdict } from './parts/access.picked';

const doc = (d: Record<string, unknown>): AccessRules => rulesFrom({ data: { file_version: 3, project: 'a'.repeat(24), ...d } })!;
const PERSON = { type: 'password', username: 'ana', password: 'x'.repeat(64), algorithm: 'sha256', salt: 's' };
const KEY = { type: 'token', param: KEY_PARAM, value: 'k' };
const MY_IP = { type: 'ip', range: '198.51.100.7/32' };
// Rules without the "Only my IP" address group: an add is the group, its programs, then everyone else kept out.
const OPEN = doc({ groups: {}, permissions: {}, default: 'allow' });

describe('computers: access, only people or keys I pick (pure)', () => {
  it('entry names: lower case words joined by "-", never empty or too long', () => {
    expect(entryGroup('person', 'Ana Lopez')).toBe('hub-person-ana-lopez');
    expect(entryGroup('key', '  Build bot #2 ')).toBe('hub-key-build-bot-2');
    expect(entryGroup('person', 'Zoë')).toBe('hub-person-zoe');
    expect(entryGroup('person', '!!!')).toBeNull();
    expect(entryGroup('key', 'x'.repeat(33))).toBeNull();
  });

  it('the drawer reads its own document as entries, and anything else as not its own', () => {
    const mine = doc({ groups: { 'hub-person-ana': PERSON, 'hub-key-ci': KEY }, permissions: { 'hub-person-ana': { '*': true, logs: true }, 'hub-key-ci': { terminal: true } }, default: 'deny' });
    expect(entriesOf(mine)).toEqual([
      { group: 'hub-person-ana', kind: 'person', name: 'ana', programs: ['*', 'logs'] },
      { group: 'hub-key-ci', kind: 'key', name: 'ci', programs: ['terminal'] },
    ]);
    // Another group, a partial grant, a person named like a key, everyone let in, the addresses off, a hook: not its own.
    expect(entriesOf(doc({ groups: { 'hub-person-ana': PERSON, team: PERSON }, permissions: { 'hub-person-ana': { '*': true }, team: { '*': true } }, default: 'deny' }))).toBeNull();
    expect(entriesOf(doc({ groups: { 'hub-person-ana': PERSON }, permissions: { 'hub-person-ana': { terminal: [1] } }, default: 'deny' }))).toBeNull();
    expect(entriesOf(doc({ groups: { 'hub-key-ana': PERSON }, permissions: { 'hub-key-ana': { '*': true } }, default: 'deny' }))).toBeNull();
    expect(entriesOf(doc({ groups: { 'hub-person-ana': PERSON }, permissions: { 'hub-person-ana': { '*': true } }, default: 'allow' }))).toBeNull();
    expect(entriesOf(doc({ groups: { 'hub-person-ana': PERSON }, permissions: { 'hub-person-ana': { '*': true } }, default: 'deny', enable_proxy: false }))).toBeNull();
    expect(entriesOf(doc({ groups: { 'hub-person-ana': PERSON }, permissions: { 'hub-person-ana': { '*': true } }, default: 'deny', hooks: { terminal: [{}] } }))).toBeNull();
    expect(entriesOf(doc({ groups: {}, permissions: {}, default: 'deny' }))).toBeNull();
    // A rule for a group that isn't there: not its own.
    expect(entriesOf(doc({ groups: { 'hub-person-ana': PERSON }, permissions: { 'hub-person-ana': { '*': true }, ghost: { files: true } }, default: 'deny' }))).toBeNull();
  });

  it('adding: the group, then each program once, then everyone else kept out, last; removing is one step', () => {
    expect(addSteps('hub-key-ci', 'key', ['terminal', 'files', 'terminal'], OPEN)).toEqual([
      { op: 'group', group: 'hub-key-ci', kind: 'key' },
      { op: 'grant', group: 'hub-key-ci', program: 'terminal' },
      { op: 'grant', group: 'hub-key-ci', program: 'files' },
      { op: 'deny' },
    ]);
    expect(removeSteps('hub-key-ci')).toEqual([{ op: 'drop', group: 'hub-key-ci' }]);
  });

  it('a fresh read proves which steps are still missing, in order; nothing a read shows in place is sent again', () => {
    const steps = addSteps('hub-person-ana', 'person', ['*', 'logs'], OPEN);
    const open = doc({ groups: {}, permissions: {}, default: 'allow' });
    expect(remainingSteps(steps, open)).toEqual(steps);
    const half = doc({ groups: { 'hub-person-ana': PERSON }, permissions: { 'hub-person-ana': { '*': true } }, default: 'allow' });
    expect(remainingSteps(steps, half)).toEqual([{ op: 'grant', group: 'hub-person-ana', program: 'logs' }, { op: 'deny' }]);
    const done = doc({ groups: { 'hub-person-ana': PERSON }, permissions: { 'hub-person-ana': { '*': true, logs: true } }, default: 'deny' });
    expect(remainingSteps(steps, done)).toEqual([]);
    // Private already: the last step is in place from the start.
    expect(remainingSteps(steps, doc({ groups: {}, permissions: {}, default: 'deny' })).map((s) => s.op)).toEqual(['group', 'grant', 'grant']);
    // A group of the same name but another kind is not this step in place.
    expect(stepDone({ op: 'group', group: 'hub-person-ana', kind: 'person' }, doc({ groups: { 'hub-person-ana': KEY }, permissions: {}, default: 'deny' }))).toBe(false);
    expect(stepDone({ op: 'drop', group: 'hub-person-ana' }, done)).toBe(false);
    expect(stepDone({ op: 'drop', group: 'hub-person-ana' }, open)).toBe(true);
  });

  it('a step holds names and kinds only, never a password or a key', () => {
    for (const s of [...addSteps('hub-person-ana', 'person', ['*'], OPEN), ...removeSteps('hub-key-ci')]) {
      expect(Object.keys(s).sort()).toEqual(expect.arrayContaining(['op']));
      expect(JSON.stringify(s)).not.toMatch(/password|value|secret|token/i);
    }
  });

  it('a key link: the program address with the key as its parameter, http(s) only', () => {
    expect(keyLink('https://terminal-1.box.example/', 'Kq9')).toBe(`https://terminal-1.box.example/?${KEY_PARAM}=Kq9`);
    expect(keyLink('https://files.box.example/x?y=1', 'a b')).toBe(`https://files.box.example/x?y=1&${KEY_PARAM}=a+b`);
    expect(keyLink('javascript:alert(1)', 'k')).toBeNull();
    expect(keyLink('not a url', 'k')).toBeNull();
  });

  it('made secrets: the length asked, easy-to-read characters, never 64 hex, every character equally likely', () => {
    const s = makeSecret(24);
    expect(s).toHaveLength(24);
    expect(s).toMatch(/^[a-km-zA-HJ-NP-Z2-9]+$/);
    expect(makeSecret(64)).not.toMatch(/^[0-9a-f]{64}$/);
    // Bytes past the last whole alphabet round are skipped, never folded onto the first characters.
    let calls = 0;
    const fake = (n: Uint8Array<ArrayBuffer>) => { calls++; n.fill(calls === 1 ? 255 : 0); return n; };
    expect(makeSecret(4, fake)).toBe('aaaa');
    expect(calls).toBe(2);
  });

  it('a cut add reads as the people choice, unfinished: finishing keeps everyone else out only when every entry opens something', () => {
    const halfway = doc({ groups: { 'hub-person-ana': PERSON }, permissions: { 'hub-person-ana': { terminal: true } }, default: 'allow' });
    expect(peopleOf(halfway)).toEqual({ entries: [{ group: 'hub-person-ana', kind: 'person', name: 'ana', programs: ['terminal'] }], unfinished: true, open: true, myIp: false });
    expect(modeOf(halfway, 'no')).toEqual({ kind: 'people', entries: peopleOf(halfway)!.entries, unfinished: true, open: true, myIp: false });
    expect(finishSteps(halfway)).toEqual([{ op: 'deny' }]);
    // A group with nothing granted yet: only removing it is offered (its programs were never stored).
    const bare = doc({ groups: { 'hub-key-ci': KEY }, permissions: {}, default: 'allow' });
    expect(peopleOf(bare)?.unfinished).toBe(true);
    expect(finishSteps(bare)).toEqual([]);
    expect(finishSteps(doc({ groups: { 'hub-key-ci': KEY }, permissions: {}, default: 'deny' }))).toEqual([]);
    // Everyone else not stated, a foreign group, a project rule: never the people choice.
    expect(peopleOf(doc({ groups: { 'hub-key-ci': KEY }, permissions: { 'hub-key-ci': { files: true } } }))).toBeNull();
    expect(modeOf(doc({ groups: { 'hub-key-ci': KEY, team: MY_IP }, permissions: { 'hub-key-ci': { files: true } }, default: 'deny' }), 'no').kind).toBe('advanced');
    const done = doc({ groups: { 'hub-key-ci': KEY }, permissions: { 'hub-key-ci': { files: true } }, default: 'deny' });
    expect(modeOf(done, 'no')).toMatchObject({ kind: 'people', unfinished: false });
    expect(modeOf(done, 'yes').kind).toBe('advanced');
    expect(finishSteps(done)).toEqual([]);
  });

  it('from Only my IP: the add removes the address group after the programs and before everyone else kept out; a cut one finishes by removing it', () => {
    const mine = doc({ groups: { 'hub-my-ip': MY_IP }, permissions: { 'hub-my-ip': { '*': true, logs: true } }, default: 'deny' });
    expect(modeOf(mine, 'no').kind).toBe('myIp');
    expect(addSteps('hub-key-ci', 'key', ['files'], mine)).toEqual([
      { op: 'group', group: 'hub-key-ci', kind: 'key' },
      { op: 'grant', group: 'hub-key-ci', program: 'files' },
      { op: 'drop', group: 'hub-my-ip' },
      { op: 'deny' },
    ]);
    // Cut after the programs: the people choice, unfinished (never Advanced), and Finish adding removes the address.
    const cut = doc({ groups: { 'hub-my-ip': MY_IP, 'hub-key-ci': KEY }, permissions: { 'hub-my-ip': { '*': true, logs: true }, 'hub-key-ci': { files: true } }, default: 'deny' });
    expect(modeOf(cut, 'no')).toEqual({ kind: 'people', entries: [{ group: 'hub-key-ci', kind: 'key', name: 'ci', programs: ['files'] }], unfinished: true, open: false, myIp: true });
    expect(entriesOf(cut)).toBeNull();
    expect(finishSteps(cut)).toEqual([{ op: 'drop', group: 'hub-my-ip' }]);
    expect(finishSteps(doc({ groups: { 'hub-my-ip': MY_IP, 'hub-key-ci': KEY }, permissions: { 'hub-key-ci': { files: true } }, default: 'allow' }))).toEqual([{ op: 'drop', group: 'hub-my-ip' }, { op: 'deny' }]);
    // Cut before any program: only removing the bare entry is offered.
    expect(finishSteps(doc({ groups: { 'hub-my-ip': MY_IP, 'hub-key-ci': KEY }, permissions: { 'hub-my-ip': { '*': true } }, default: 'deny' }))).toEqual([]);
    // The address group alone, or with a partial grant, or of another kind: never the people choice.
    expect(peopleOf(mine)).toBeNull();
    expect(peopleOf(doc({ groups: { 'hub-my-ip': MY_IP, 'hub-key-ci': KEY }, permissions: { 'hub-my-ip': { terminal: [1] }, 'hub-key-ci': { files: true } }, default: 'deny' }))).toBeNull();
    expect(peopleOf(doc({ groups: { 'hub-my-ip': KEY, 'hub-key-ci': KEY }, permissions: { 'hub-key-ci': { files: true } }, default: 'deny' }))).toBeNull();
  });

  it('leaving the people choice writes a document without the entries (their credentials are dropped, never resent)', () => {
    const two = doc({ groups: { 'hub-person-ana': PERSON, 'hub-key-ci': KEY }, permissions: { 'hub-person-ana': { files: true }, 'hub-key-ci': { files: true } }, default: 'deny' });
    const body = bodyFor(two, modeOf(two, 'no'), { kind: 'private' }, 'b'.repeat(24));
    expect(body).toEqual({ project: 'a'.repeat(24), computer: 'b'.repeat(24), groups: {}, permissions: {}, default: 'deny' });
    expect(JSON.stringify(body)).not.toMatch(/x{64}|"k"|salt/);
  });

  it('the names hub-person and hub-key show in the summary and the Agent snapshot with their kind, never a credential', () => {
    const two = doc({ groups: { 'hub-person-ana': PERSON, 'hub-key-ci': { ...KEY, value: 'TOPSECRETKEY' } }, permissions: { 'hub-person-ana': { files: true }, 'hub-key-ci': { terminal: true } }, default: 'deny' });
    const text = snapshotOf({ name: 'box', rules: two, project: 'no' } as Parameters<typeof snapshotOf>[0]).text;
    expect(text).toContain('group "hub-person-ana": password sign-in; may open: "files"');
    expect(text).toContain('group "hub-key-ci": access token; may open: "terminal"');
    expect(text).toContain('Only people or key links');
    expect(text).not.toMatch(/x{64}|TOPSECRETKEY|"ana"[^:]|salt/);
    expect(JSON.stringify(summaryOf(two, 'no'))).not.toMatch(/x{64}|TOPSECRETKEY/);
  });

  it('a held step is proved only by a newer version: in place → applied, missing → not applied', () => {
    const at = (v: number, d: Record<string, unknown>) => [[{ c1: rulesFrom({ data: { file_version: v, project: 'a'.repeat(24), ...d } }) }]];
    const id = { computer: 'c1', from: 3, op: 'grant', group: 'hub-key-ci', program: 'files' };
    expect(stepVerdict(id, at(3, {}))).toBeUndefined();
    expect(stepVerdict(id, at(4, { groups: { 'hub-key-ci': KEY }, permissions: { 'hub-key-ci': { files: true } } }))).toBe('applied');
    expect(stepVerdict(id, at(4, { groups: { 'hub-key-ci': KEY }, permissions: {} }))).toBe('not_applied');
    expect(stepVerdict(id, [[{ c2: rulesFrom({ data: { file_version: 9 } }) }]])).toBeUndefined();
    expect(stepVerdict({ ...id, from: undefined }, at(9, {}))).toBeUndefined();
    expect(stepVerdict({ computer: 'c1', from: 3, op: 'drop', group: 'hub-key-ci' }, at(4, {}))).toBe('applied');
  });

  it('each step has its own change, and no step names a secret', () => {
    expect(addSteps('hub-person-ana', 'person', ['files'], OPEN).map(stepKey)).toEqual(['accessPerson', 'accessGrant', 'accessDeny']);
    expect(stepKey({ op: 'group', group: 'hub-key-ci', kind: 'key' })).toBe('accessKey');
    expect(removeSteps('hub-key-ci').map(stepKey)).toEqual(['accessDrop']);
  });

  describe('runSteps', () => {
    const v = (n: number, d: Record<string, unknown>) => rulesFrom({ data: { file_version: n, project: 'a'.repeat(24), ...d } })!;
    const empty = v(3, { groups: {}, permissions: {}, default: 'allow' });
    const plan = addSteps('hub-key-ci', 'key', ['files', 'logs'], OPEN);
    // The API as runSteps sees it: each done answer is the stored document one version on (or, `bare`, no document:
    // the API's step answers carry no version); `read` is a fresh read of what is stored.
    function api(cut?: { at: number; answer: StepAnswer }, bare = false) {
      const sent: Array<{ step: Step; from: number }> = [];
      let r = { groups: {} as Record<string, unknown>, permissions: {} as Record<string, Record<string, boolean>>, default: 'allow' };
      let n = 3;
      const send = async (step: Step, from: number): Promise<StepAnswer> => {
        sent.push({ step, from });
        if (cut && sent.length === cut.at) return cut.answer;
        if (from !== n) return { outcome: 'failed', status: 412, code: 'PRECONDITION_FAILED' };
        if (step.op === 'group') r = { ...r, groups: { ...r.groups, [step.group]: step.kind === 'key' ? KEY : PERSON } };
        if (step.op === 'grant') r = { ...r, permissions: { ...r.permissions, [step.group]: { ...r.permissions[step.group], [step.program]: true } } };
        if (step.op === 'deny') r = { ...r, default: 'deny' };
        n += 1;
        return { outcome: 'done', data: bare ? null : v(n, r) };
      };
      const read = async () => v(n, r);
      return { sent, send, read };
    }
    const noRead = async () => null;

    it('sends each missing step once, in order, each against the version the previous answer gave', async () => {
      const a = api();
      const end = await runSteps(plan, empty, a.send, noRead);
      expect(end.kind).toBe('done');
      expect(a.sent).toEqual([
        { step: plan[0], from: 3 }, { step: plan[1], from: 4 }, { step: plan[2], from: 5 }, { step: plan[3], from: 6 },
      ]);
      expect(end.kind === 'done' && entriesOf(end.rules)).toEqual([{ group: 'hub-key-ci', kind: 'key', name: 'ci', programs: ['files', 'logs'] }]);
    });

    it('a lost answer stops the run: that step and every later one stay unsent (core holds it)', async () => {
      for (const answer of [{ outcome: 'pending' } as StepAnswer, { outcome: 'not_sent', code: 'READ_BACK_FIRST' } as StepAnswer, { outcome: 'not_sent', code: 'HELD_BY_OTHER' } as StepAnswer]) {
        const a = api({ at: 2, answer });
        expect(await runSteps(plan, empty, a.send, a.read)).toEqual({ kind: 'held', step: plan[1], from: 4 });
        expect(a.sent).toHaveLength(2);
      }
      const thrown = await runSteps(plan, empty, () => Promise.reject(new Error('x')), noRead);
      expect(thrown).toEqual({ kind: 'held', step: plan[0], from: 3 });
    });

    it('412 is stale, any other refusal is refused; neither sends another step', async () => {
      const s412 = api({ at: 3, answer: { outcome: 'failed', status: 412 } });
      expect(await runSteps(plan, empty, s412.send, s412.read)).toEqual({ kind: 'stale', step: plan[2], answer: { outcome: 'failed', status: 412 } });
      expect(s412.sent).toHaveLength(3);
      const stale = api({ at: 1, answer: { outcome: 'stale' } });
      expect((await runSteps(plan, empty, stale.send, stale.read)).kind).toBe('stale');
      const no = { outcome: 'failed', status: 400, code: 'VALIDATION_ERROR' } as StepAnswer;
      const bad = api({ at: 2, answer: no });
      expect(await runSteps(plan, empty, bad.send, bad.read)).toEqual({ kind: 'refused', step: plan[1], answer: no });
      expect(bad.sent).toHaveLength(2);
      const unsent = api({ at: 1, answer: { outcome: 'not_sent', code: 'OFFLINE' } });
      expect((await runSteps(plan, empty, unsent.send, unsent.read)).kind).toBe('refused');
    });

    it('a done answer that does not show its step (or no document, or no newer version), nor a fresh read after it, ends the run unread', async () => {
      for (const answer of [{ outcome: 'done' } as StepAnswer, { outcome: 'done', data: v(4, { groups: {}, default: 'allow' }) } as StepAnswer, { outcome: 'done', data: v(3, { groups: { 'hub-key-ci': KEY }, default: 'allow' }) } as StepAnswer]) {
        const a = api({ at: 1, answer });
        // The fresh read fails, shows the version the step was sent against, or a newer one without the step.
        for (const read of [noRead, async () => empty, async () => v(4, { groups: {}, permissions: {}, default: 'allow' }), () => Promise.reject(new Error('x'))]) {
          a.sent.length = 0;
          expect(await runSteps(plan, empty, a.send, read)).toEqual({ kind: 'unread', step: plan[0], from: 3 });
          expect(a.sent).toHaveLength(1);
        }
      }
    });

    it('answers without a version (as the API gives): each step goes on from a fresh read newer than the one it was sent against', async () => {
      const a = api(undefined, true);
      const end = await runSteps(plan, empty, a.send, a.read);
      expect(end.kind).toBe('done');
      expect(a.sent).toEqual([
        { step: plan[0], from: 3 }, { step: plan[1], from: 4 }, { step: plan[2], from: 5 }, { step: plan[3], from: 6 },
      ]);
      // The read fails after the second step: the run stops there, unread, sending nothing more.
      const b = api(undefined, true);
      let reads = 0;
      const flaky = async () => (++reads === 2 ? null : b.read());
      expect(await runSteps(plan, empty, b.send, flaky)).toEqual({ kind: 'unread', step: plan[1], from: 4 });
      expect(b.sent).toHaveLength(2);
    });

    it('resumes from a fresh read: only what it shows missing is sent', async () => {
      const halfway = v(7, { groups: { 'hub-key-ci': KEY }, permissions: { 'hub-key-ci': { files: true } }, default: 'allow' });
      const sent: Step[] = [];
      let n = 7;
      const end = await runSteps(plan, halfway, async (step, from) => {
        sent.push(step);
        expect(from).toBe(n);
        n += 1;
        return { outcome: 'done', data: v(n, { groups: { 'hub-key-ci': KEY }, permissions: { 'hub-key-ci': { files: true, logs: true } }, default: step.op === 'deny' ? 'deny' : 'allow' }) };
      }, noRead);
      expect(sent).toEqual([plan[2], plan[3]]);
      expect(end.kind).toBe('done');
      // Nothing missing: nothing sent.
      expect(await runSteps(plan, (end as { rules: AccessRules }).rules, () => { throw new Error('sent'); }, noRead)).toMatchObject({ kind: 'done' });
    });
  });
});
