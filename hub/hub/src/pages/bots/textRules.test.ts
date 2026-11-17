// Vitest: the Bot role and instructions rules the forms check before a send, as the Bot's agent applies them
// (the agent's own checks: role over 1000 characters and instructions over 4000 characters, with a
// control character or with an invisible format character are each a 400 bad_request).
import { describe, expect, it } from 'vitest';
import { BOT_INSTRUCTIONS_MAX, BOT_ROLE_MAX, instructionsProblem, roleTooLong } from './textRules';

describe('a Bot role', () => {
  it('is fine up to 1000 characters, counted after trimming and by character, not by UTF-16 unit', () => {
    expect(roleTooLong('')).toBe(false);
    expect(roleTooLong('a'.repeat(BOT_ROLE_MAX))).toBe(false);
    expect(roleTooLong(`  ${'a'.repeat(BOT_ROLE_MAX)}\n`)).toBe(false);
    expect(roleTooLong('😀'.repeat(BOT_ROLE_MAX))).toBe(false);
  });
  it('is too long from 1001 characters', () => {
    expect(roleTooLong('a'.repeat(BOT_ROLE_MAX + 1))).toBe(true);
    expect(roleTooLong('😀'.repeat(BOT_ROLE_MAX + 1))).toBe(true);
  });
});

describe('Bot instructions', () => {
  it('are fine when empty, at 4000 characters, and with line breaks and tabs', () => {
    expect(instructionsProblem('')).toBeNull();
    expect(instructionsProblem('a'.repeat(BOT_INSTRUCTIONS_MAX))).toBeNull();
    expect(instructionsProblem(` ${'a'.repeat(BOT_INSTRUCTIONS_MAX)} `)).toBeNull();
    expect(instructionsProblem('Reply in short sentences.\n\tUse lists.\r\nBe kind.')).toBeNull();
    expect(instructionsProblem('😀'.repeat(BOT_INSTRUCTIONS_MAX))).toBeNull();
  });
  it('are too long from 4001 characters; a Windows line break counts once, as the agent counts it', () => {
    expect(instructionsProblem('a'.repeat(BOT_INSTRUCTIONS_MAX + 1))).toBe('too_long');
    expect(instructionsProblem(`${'a'.repeat(BOT_INSTRUCTIONS_MAX - 1)}\r\n`)).toBeNull();
    expect(instructionsProblem(`${'a'.repeat(BOT_INSTRUCTIONS_MAX - 2)}\r\nbc`)).toBe('too_long');
  });
  it('name a control character that is no line break or tab', () => {
    expect(instructionsProblem('a\u0000b')).toBe('control');
    expect(instructionsProblem('a\u001bb')).toBe('control');
    expect(instructionsProblem('a\u007fb')).toBe('control');
  });
  it('name an invisible format character (a zero-width joiner, a byte order mark)', () => {
    expect(instructionsProblem('a‍b')).toBe('invisible');
    expect(instructionsProblem('﻿hello')).toBe('invisible');
  });
  it('say the control character first when both are there, as the agent does', () => {
    expect(instructionsProblem('a‍b\u0000')).toBe('control');
  });
});
