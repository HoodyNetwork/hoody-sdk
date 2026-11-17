// The vault's sentences say what the code does: a readable export leaves encrypted values encrypted, a refused read is
// not called a refused change, and a note never points at a control or a list that is not where it is read.
import { describe, expect, it } from 'vitest';
import entrySource from './parts/Entry.tsx?raw';
import importSource from './parts/ImportDialog.tsx?raw';
import strings from './strings.en.json';

describe('vault words: export', () => {
  it('a readable export promises readable values only for those that are not encrypted', () => {
    expect(strings['export.readableDesc']).toBe('Anyone with the file can read every value that is not encrypted.');
    expect(strings['export.readableBody']).toMatch(/as stored/);
    expect(strings['export.readableBody']).not.toMatch(/hold every value in readable form/);
  });
  it('an encrypted export says a value that is already encrypted keeps its own password', () => {
    expect(strings['export.encryptedDesc']).toMatch(/already encrypted keeps its own/);
  });
});

describe('vault words: reading and copying a value', () => {
  it('a refused read says read, never "change"', () => {
    expect(strings['problem.forbiddenRead']).toBe('This login is not allowed to read this value.');
    expect(entrySource).toContain("problem.kind === 'forbidden' ? t('problem.forbiddenRead')");
  });
  it('a refused copy names a control that is still there (the password row closed with the attempt)', () => {
    expect(strings['value.openCopyRefused']).not.toMatch(/Open it/);
    expect(strings['value.openCopyRefused']).toMatch(/Show the value again/);
  });
  it('the FAQ says what Copy copies for an encrypted entry', () => {
    expect(strings['faq.showValue.a']).not.toMatch(/exact stored value/);
    expect(strings['faq.showValue.a']).toMatch(/for an encrypted entry that is the decrypted value/);
  });
});

describe('vault words: notes read inside a drawer or the import', () => {
  it('a held change points at the Vault page, not at a list above the reader', () => {
    expect(strings['held.body']).not.toMatch(/list above/);
    expect(strings['held.body']).toMatch(/on the Vault page/);
  });
  it('the import counts entries, not lines', () => {
    expect(strings['import.rows']).toMatch(/^This has \{\{count\}\} entries to import\./);
  });
  it('an import row whose kept details cannot be sent names no box of the entry editor', () => {
    expect(strings['import.unwritable']).not.toContain(strings['edit.changeMeta']);
    expect(importSource).toContain("end.why === 'unwritable'");
  });
});

describe('vault words: one name, a next step, no inside word', () => {
  it('the empty vault and the menu call the import by one name', () => {
    expect(strings['empty.import']).toBe(strings['action.import']);
  });
  it('the unencrypted hint names the button beside it', () => {
    expect(strings['detail.plainHint']).toMatch(/press Encrypt\.$/);
  });
  it('an entry kept by Hoody tools can still be deleted: the note rules out only replacing its value', () => {
    expect(strings['detail.hoodyNote']).toMatch(/but not replace its value\.$/);
  });
  it('a refusal that sent or saved nothing says what to do next', () => {
    expect(strings['notSent.moved']).toMatch(/then try again\.$/);
    expect(strings['export.stale']).toMatch(/Start the export again/);
    expect(strings['import.nothing']).toMatch(/Paste lines like NAME=value/);
    expect(strings['import.fileUnread']).toMatch(/Choose it again, or paste its lines\.$/);
  });
  it('the export answer does not say "partition"', () => {
    expect(strings['faq.export.a']).not.toMatch(/partition/);
  });
});
