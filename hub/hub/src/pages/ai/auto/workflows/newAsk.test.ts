import { ASK_MAX_TEXT } from '@kit';
import { describe, expect, it } from 'vitest';
import { firstMessage, roomFor, WORKFLOW_AGENT } from './newAsk';

describe('firstMessage', () => {
  it('keeps the words whole, inside spaces and new lines included', () => {
    const words = 'Run the tests,\n  then  tell me.';
    expect(firstMessage(words).endsWith(`What it should do: ${words}`)).toBe(true);
  });
  it('trims only the outer space', () => {
    expect(firstMessage('  run it \n')).toBe(firstMessage('run it'));
    expect(firstMessage('  run it \n').endsWith('run it')).toBe(true);
  });
  it('carries the name rule, so a save never replaces a workflow', () => {
    expect(firstMessage('x')).toContain("under a name that isn't taken");
    expect(firstMessage('x')).not.toMatch(/list_workflows|expected_absent|upsert_workflow/);
  });
  it('names the shipped agent', () => { expect(WORKFLOW_AGENT).toBe('workflow-editor'); });
});

describe('roomFor', () => {
  it('counts the whole first message against what a chat takes', () => {
    const fit = 'x'.repeat(ASK_MAX_TEXT - firstMessage('').length);
    expect(roomFor(fit)).toBe(0);
    expect(roomFor(`${fit}x`)).toBe(-1);
  });
  it('counts a character outside the basic plane as one', () => {
    expect(roomFor('\u{1F600}')).toBe(roomFor('x'));
  });
});
