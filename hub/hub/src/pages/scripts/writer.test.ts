// Vitest on the writing assistant's pure rules (writer.ts): what the agent's report must say before a turn may be sent, what a
// created session must say before one is, what a receipt and a transcript mean. No transport, no React.
import { describe, expect, it } from 'vitest';
import { agentCapsOf, capOn, receiptOf, replyOf, startedProblem, writerState } from './writer';

const R = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const cap = (name: string, supported = true, available = true) => ({ name, supported, available });
// A gateway at the computer-binding contract: session protocol 3 and computer_binding (the writer's create names its computer).
const version = (...caps: Array<ReturnType<typeof cap>>) => ({ api_version: '1', session_protocol_version: 3, capabilities: [cap('computer_binding'), ...caps] });
const READY = { account_id: 'u1', auth_active: true, owner_fingerprint: 'fp1', restriction: 'none' };

describe('what the agent lists', () => {
  it('a capability counts only when it is supported and available', () => {
    expect(capOn(version(cap('script_writer')), 'script_writer')).toBe(true);
    expect(capOn(version(cap('script_writer', true, false)), 'script_writer')).toBe(false);
    expect(capOn(version(cap('script_writer', false, true)), 'script_writer')).toBe(false);
    expect(capOn(version(cap('other')), 'script_writer')).toBe(false);
    expect(capOn(null, 'script_writer')).toBe(false);
    expect(capOn({ capabilities: 'script_writer' }, 'script_writer')).toBe(false);
  });
});

describe('whether the agent may take a writing turn for this account', () => {
  const v = version(cap('script_writer'));
  const v0 = () => version(cap('script_writer'));
  it('is ready only when it lists the capability, is signed in as this account and knows its identity', () => {
    expect(writerState(v, READY, 'u1')).toEqual({ state: 'ready', owner: 'fp1' });
    expect(writerState(v, { ...READY, restriction: 'realms' }, 'u1')).toEqual({ state: 'ready', owner: 'fp1' });
  });
  it('an agent without the capability is old, whatever its login says', () => {
    expect(writerState(version(), READY, 'u1')).toEqual({ state: 'old' });
  });
  it('a gateway that does not bind a create to its computer is old, even with script_writer: protocol below 3, or no computer_binding', () => {
    for (const v of [
      { ...v0(), session_protocol_version: 2 },
      { ...v0(), session_protocol_version: undefined },
      { ...v0(), session_protocol_version: '3' },
      { api_version: '1', session_protocol_version: 3, capabilities: [cap('script_writer')] },
      { api_version: '1', session_protocol_version: 3, capabilities: [cap('script_writer'), cap('computer_binding', true, false)] },
      { api_version: '1', session_protocol_version: 3, capabilities: [cap('script_writer'), cap('computer_binding', false, true)] },
    ]) expect(writerState(v, READY, 'u1')).toEqual({ state: 'old' });
    expect(writerState({ ...v0(), session_protocol_version: 4 }, READY, 'u1')).toEqual({ state: 'ready', owner: 'fp1' });
  });
  it('a signed-out agent, or a rejected login, needs a sign-in', () => {
    expect(writerState(v, { ...READY, auth_active: false }, 'u1')).toEqual({ state: 'login' });
    expect(writerState(v, { ...READY, last_error: { credential_rejected: true } }, 'u1')).toEqual({ state: 'login' });
  });
  it('another account is named before anything else about the login', () => {
    expect(writerState(v, { ...READY, account_id: 'u2' }, 'u1')).toEqual({ state: 'account' });
    expect(writerState(v, { ...READY, account_id: 'u2', auth_active: false }, 'u1')).toEqual({ state: 'account' });
  });
  it('connected alone proves nothing: an unresolved identity or an unreadable restriction is not ready', () => {
    expect(writerState(v, { connected: true, auth_active: true, account_id: 'u1' }, 'u1')).toEqual({ state: 'identity' });
    expect(writerState(v, { ...READY, identity_unavailable: true }, 'u1')).toEqual({ state: 'identity' });
    expect(writerState(v, { ...READY, restriction: 'unknown' }, 'u1')).toEqual({ state: 'identity' });
    expect(writerState(v, { ...READY, account_id: undefined }, 'u1')).toEqual({ state: 'identity' });
    expect(writerState(v, null, 'u1')).toEqual({ state: 'identity' });
    expect(writerState(v, READY, '')).toEqual({ state: 'identity' });
  });
});

describe('a computer\'s row of what its agent offers', () => {
  const v = version(cap('script_writer'), cap('script_templates'));
  it('the assistant waits for a chosen realm, ideas read only the capability', () => {
    expect(agentCapsOf({ version: v, status: READY, loading: false, account: 'u1', realm: R, guardedDelete: true })).toEqual({ templates: true, writer: true, writerOwner: 'fp1', guardedDelete: true });
    expect(agentCapsOf({ version: v, status: READY, loading: false, account: 'u1', realm: null, guardedDelete: false })).toEqual({ templates: true, writer: false, writerWhy: 'realm', guardedDelete: false });
  });
  it('says why the assistant is not there, and says nothing while the report is still coming', () => {
    expect(agentCapsOf({ version: undefined, status: undefined, loading: true, account: 'u1', realm: R, guardedDelete: false })).toMatchObject({ writer: false, writerWhy: 'loading', templates: false });
    expect(agentCapsOf({ version: version(cap('script_templates')), status: READY, loading: false, account: 'u1', realm: R, guardedDelete: false })).toMatchObject({ writer: false, writerWhy: 'old', templates: true });
    expect(agentCapsOf({ version: undefined, status: undefined, loading: false, account: 'u1', realm: R, guardedDelete: false })).toMatchObject({ writer: false, writerWhy: 'old', templates: false });
  });
});

describe('what a created session must say before a turn is sent to it', () => {
  const want = { realm: R, container: 'c1', owner: 'fp1' };
  const ok = { session_id: 's1', started: { realm_selector: R, computer_id: 'c1', owner_fingerprint: 'fp1', tool_ceiling: 'script-writer' } };
  it('the binding asked for, the owner the agent reported and the script-writer ceiling', () => {
    expect(startedProblem(ok, want)).toBeNull();
  });
  it('a session without the ceiling has every tool: nothing is sent to it', () => {
    const { tool_ceiling: _drop, ...bare } = ok.started;
    expect(startedProblem({ ...ok, started: bare }, want)).toBe('NO_CEILING');
    expect(startedProblem({ ...ok, started: { ...ok.started, tool_ceiling: 'other' } }, want)).toBe('NO_CEILING');
    expect(startedProblem({ ...ok, started: { ...ok.started, tool_ceiling: '' } }, want)).toBe('NO_CEILING');
  });
  it('another realm, computer or owner, or a shape that is not a session, is a binding problem before the ceiling is looked at', () => {
    expect(startedProblem({ ...ok, started: { ...ok.started, realm_selector: 'bbbbbbbbbbbbbbbbbbbbbbb2' } }, want)).toBe('BINDING');
    expect(startedProblem({ ...ok, started: { ...ok.started, computer_id: 'c2' } }, want)).toBe('BINDING');
    expect(startedProblem({ ...ok, started: { ...ok.started, owner_fingerprint: 'fp2' } }, want)).toBe('BINDING');
    expect(startedProblem({ session_id: 's1' }, want)).toBe('BINDING');
    expect(startedProblem({ ...ok, session_id: '../x' }, want)).toBe('BINDING');
    expect(startedProblem(null, want)).toBe('BINDING');
  });
  it('the retired container_id is never identity evidence, alone or beside a matching computer_id (one validator with Ask: checkStarted)', () => {
    const { computer_id: _c, ...bare } = ok.started;
    for (const c of ['c1', 'c9', '', 7, null, {}, []]) {
      expect(startedProblem({ ...ok, started: { ...ok.started, container_id: c } }, want), `both, container_id ${JSON.stringify(c)}`).toBe('BINDING');
      expect(startedProblem({ ...ok, started: { ...bare, container_id: c } }, want), `container_id ${JSON.stringify(c)} alone`).toBe('BINDING');
    }
  });
  it('global is spelled global, exactly: an empty or differently written selector is no match', () => {
    const g = { ...ok, started: { ...ok.started, realm_selector: 'global' } };
    expect(startedProblem(g, { ...want, realm: 'global' })).toBeNull();
    for (const realm_selector of ['', 'GLOBAL', ' global', R]) expect(startedProblem({ ...ok, started: { ...ok.started, realm_selector } }, { ...want, realm: 'global' }), realm_selector).toBe('BINDING');
    expect(startedProblem(g, want)).toBe('BINDING');
  });
  it('a session that does not say its realm and computer is no match: both fields are present on every session the agent starts', () => {
    const { realm_selector: _r, ...noRealm } = ok.started;
    const { computer_id: _c, ...noComputer } = ok.started;
    expect(startedProblem({ ...ok, started: noRealm }, want)).toBe('BINDING');
    expect(startedProblem({ ...ok, started: noComputer }, want)).toBe('BINDING');
    expect(startedProblem({ ...ok, started: { ...ok.started, computer_id: '' } }, want)).toBe('BINDING');
    expect(startedProblem({ ...ok, started: { ...ok.started, computer_id: 1 } }, want)).toBe('BINDING');
    expect(startedProblem({ ...ok, started: { ...ok.started, realm_selector: null } }, want)).toBe('BINDING');
    expect(startedProblem({ ...ok, started: { ...ok.started, realm_selector: 7 } }, want)).toBe('BINDING');
  });
});

describe('a turn\'s receipt', () => {
  it('ended means one of the four terminal states; the code of one that did not complete is the agent\'s own', () => {
    expect(receiptOf({ turn_id: 't1', state: 'completed' })).toEqual({ turnId: 't1', state: 'completed', ended: true, code: 'completed' });
    expect(receiptOf({ turn_id: 't1', state: 'failed', error_code: 'provider_error' })).toMatchObject({ ended: true, code: 'provider_error' });
    expect(receiptOf({ turn_id: 't1', state: 'cancelled' })).toMatchObject({ ended: true, code: 'cancelled' });
    expect(receiptOf({ turn_id: 't1', state: 'interrupted', effects_may_have_occurred: true })).toMatchObject({ ended: true, code: 'interrupted' });
    expect(receiptOf({ turn_id: 't1', state: 'accepted' })).toMatchObject({ ended: false });
    expect(receiptOf({ turn_id: 't1', state: 'dispatched' })).toMatchObject({ ended: false });
  });
  it('a code that is not a plain word is not shown, and a shape that is not a receipt is nothing', () => {
    expect(receiptOf({ turn_id: 't1', state: 'failed', error_code: 'a b <script>' })?.code).toBe('failed');
    expect(receiptOf({ turn_id: 't 1', state: 'failed' })).toBeNull();
    expect(receiptOf({ turn_id: 't1' })).toBeNull();
    expect(receiptOf([])).toBeNull();
    expect(receiptOf(null)).toBeNull();
  });
});

describe('the assistant\'s answer in the transcript', () => {
  const text = (t: string) => ({ kind: 'text', text: t });
  const user = (t: string) => ({ role: 'user', blocks: [text(t)] });
  const result = { role: 'user', blocks: [{ kind: 'tool_result', output: 'ok' }] };
  it('is the text of the last assistant message that has any, not its thinking, its tool calls or the talk before them', () => {
    const tr = { messages: [
      user('write it'),
      { role: 'assistant', blocks: [text('Let me check.'), { kind: 'tool_use', tool_name: 'hoody_exec_validate', input: {} }] },
      result,
      { role: 'assistant', blocks: [{ kind: 'thinking', text: 'secret thoughts' }, text('Summary: x'), text('```ts\ncode\n```')] },
    ] };
    expect(replyOf(tr)).toEqual({ kind: 'text', text: 'Summary: x\n```ts\ncode\n```' });
  });
  it('a last assistant message with no text falls back to the one before it within the same turn', () => {
    expect(replyOf({ messages: [user('go'), { role: 'assistant', blocks: [text('Summary: a')] }, { role: 'assistant', blocks: [{ kind: 'tool_use' }] }] })).toEqual({ kind: 'text', text: 'Summary: a' });
  });
  it('an assistant with nothing to say after the prompt is "none", not unreadable', () => {
    expect(replyOf({ messages: [user('go'), { role: 'assistant', blocks: [{ kind: 'tool_use' }] }] })).toEqual({ kind: 'none' });
    expect(replyOf({ messages: [user('go'), { role: 'assistant', blocks: [text('   ')] }] })).toEqual({ kind: 'none' });
    expect(replyOf({ messages: [user('go'), { role: 'assistant', blocks: [] }] })).toEqual({ kind: 'none' });
  });
  it('a transcript that reports no completed turn holds only a mid-turn tail: unreadable, never an answer or "none"', () => {
    const tail = [user('go'), { role: 'assistant', blocks: [{ kind: 'tool_use' }] }];
    expect(replyOf({ turns_total: 0, messages: tail })).toEqual({ kind: 'unreadable' });
    expect(replyOf({ turns_total: 0, messages: [user('go'), { role: 'assistant', blocks: [text('Let me check.')] }] })).toEqual({ kind: 'unreadable' });
    expect(replyOf({ turns_total: '1', messages: tail })).toEqual({ kind: 'unreadable' });
    expect(replyOf({ turns_total: 1, messages: tail })).toEqual({ kind: 'none' });
  });
  it('only what follows the last prompt counts: an earlier turn\'s text is never the answer', () => {
    const earlier = [user('first'), { role: 'assistant', blocks: [text('Summary: old')] }];
    expect(replyOf({ messages: [...earlier, user('second')] })).toEqual({ kind: 'unreadable' });
    expect(replyOf({ messages: [...earlier, user('second'), { role: 'assistant', blocks: [{ kind: 'tool_use' }] }] })).toEqual({ kind: 'none' });
    expect(replyOf({ messages: [...earlier, user('second'), { role: 'assistant', blocks: [text('Summary: new')] }] })).toEqual({ kind: 'text', text: 'Summary: new' });
  });
  it('a text block with no text (the agent omits an empty one) is a block with nothing to say, not a malformed one', () => {
    expect(replyOf({ messages: [user('go'), { role: 'assistant', blocks: [{ kind: 'text' }] }] })).toEqual({ kind: 'none' });
    expect(replyOf({ messages: [user('go'), { role: 'assistant', blocks: [{ kind: 'text' }, text('Summary: a')] }] })).toEqual({ kind: 'text', text: 'Summary: a' });
    expect(replyOf({ messages: [user('go'), { role: 'assistant', blocks: [{ kind: 'outcome_claims' }, { kind: 'unknown_future_kind', x: 1 }] }] })).toEqual({ kind: 'none' });
  });
  it('a tool result is not a prompt: the answer after it still belongs to the turn', () => {
    expect(replyOf({ messages: [user('go'), { role: 'assistant', blocks: [{ kind: 'tool_use' }] }, result, { role: 'assistant', blocks: [text('Summary: z')] }] })).toEqual({ kind: 'text', text: 'Summary: z' });
  });
  it('a transcript that is not whole is unreadable: no list, a message that is not one, no prompt, nothing of the assistant yet', () => {
    for (const bad of [
      null, {}, { messages: 'x' }, { messages: {} }, { messages: [null] }, { messages: [7] }, { messages: [[]] },
      { messages: [{ blocks: [] }] }, { messages: [{ role: 1, blocks: [] }] }, { messages: [{ role: 'assistant' }] }, { messages: [{ role: 'assistant', blocks: 'x' }] },
      { messages: [user('go'), { role: 'assistant' }] },
      // a block that is not a block: a message whose blocks cannot be read says nothing about the answer
      { messages: [user('go'), { role: 'assistant', blocks: [null] }] },
      { messages: [user('go'), { role: 'assistant', blocks: [{}] }] },
      { messages: [user('go'), { role: 'assistant', blocks: [{ kind: 7 }] }] },
      { messages: [user('go'), { role: 'assistant', blocks: [{ kind: 'text', text: 7 }] }] },
      { messages: [user('go'), { role: 'assistant', blocks: [text('Summary: a'), 'x'] }] },
      { messages: [{ role: 'user', blocks: [{ kind: 'text', text: 7 }] }, { role: 'assistant', blocks: [text('Summary: a')] }] },
      { messages: [] }, { messages: [{ role: 'assistant', blocks: [text('Summary: a')] }] }, { messages: [user('go')] }, { messages: [user('go'), result] },
    ]) expect(replyOf(bad), JSON.stringify(bad)).toEqual({ kind: 'unreadable' });
  });
});
