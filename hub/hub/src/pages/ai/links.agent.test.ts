// A chat's agent link: the realm it must carry, and what it refuses.
import { describe, expect, it } from 'vitest';
import { chatAgentLink } from './links';

const R1 = 'a'.repeat(24);
const R2 = 'b'.repeat(24);

describe('chatAgentLink', () => {
  it('the chat\'s realm is the one shown: the plain link', () => {
    expect(chatAgentLink('workflow-editor', R1, R1)).toBe('/ai/agents/workflow-editor');
    expect(chatAgentLink('workflow-editor', 'global', 'global')).toBe('/ai/agents/workflow-editor');
  });
  it('under All realms, or another realm: it takes the chat\'s realm along', () => {
    expect(chatAgentLink('workflow-editor', R1, 'all')).toBe(`/ai/agents/workflow-editor?open_realm=${R1}`);
    expect(chatAgentLink('workflow-editor', R1, R2)).toBe(`/ai/agents/workflow-editor?open_realm=${R1}`);
  });
  it('a Global chat under All realms: no link, no switch reaches Global', () => {
    expect(chatAgentLink('workflow-editor', 'global', 'all')).toBe('');
  });
  it('a session pinned to its view: nothing switches it, so a chat of another realm shows no link; its own realm still links', () => {
    expect(chatAgentLink('workflow-editor', R1, 'all', true)).toBe('');
    expect(chatAgentLink('workflow-editor', R1, R2, true)).toBe('');
    expect(chatAgentLink('workflow-editor', R1, R1, true)).toBe('/ai/agents/workflow-editor');
  });
  it('an odd name stays one path segment', () => {
    expect(chatAgentLink('a/b?c', R1, R1)).toBe('/ai/agents/a%2Fb%3Fc');
  });
  it('a name a link can\'t carry: no link, and nothing throws', () => {
    const odd = `bad${String.fromCharCode(0xd800)}name`;
    expect(chatAgentLink(odd, R1, R1)).toBe('');
    expect(chatAgentLink(odd, R1, 'all')).toBe('');
  });
});
