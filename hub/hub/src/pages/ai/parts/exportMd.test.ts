// exportMarkdown: the chat as the person sees it, as Markdown. Pure. Nothing the agent wrote can forge the file's own
// structure (a heading, a fence, a step line), controls and bidi marks are gone, and what is missing is said so.
import { describe, expect, it } from 'vitest';
import type { ConvSnapshot } from '@kit';
import { exportFileName, exportMarkdown, type ExportWords } from './exportMd';

const W: ExportWords = {
  untitled: 'Untitled chat', you: 'You', assistant: 'Assistant', earlier: 'Earlier messages are not included.', unfinished: 'Not finished when exported.',
  cut: (n) => `Cut: ${n} characters not included.`, attached: (n) => `Attached: ${n}`,
  step: { ok: 'done', failed: 'failed', running: 'running', unknown: 'may have run' },
  decided: { once: 'Allowed once', session: 'Allowed for this chat', deny: 'Denied', answered: 'Answered', declined: 'Declined', elsewhere: 'Decided elsewhere', ended: 'Ended before your answer applied' },
};
const snap = (o: Partial<ConvSnapshot> = {}): ConvSnapshot => ({
  facts: {} as ConvSnapshot['facts'], title: 'Fix tests', gates: [], blocks: [
    { k: 'user', key: 'u1', text: 'Fix the checkout tests', at: 1 },
    { k: 'steps', key: 't1', label: '2 steps · 4 s', state: 'ok', rows: [
      { id: 's1', state: 'ok', verb: 'Run', summary: 'npm run build', time: '3 s' },
      { id: 's2', state: 'unknown', verb: 'Edit file', summary: '/a/b.ts', note: 'This step may have run.' },
    ] },
    { k: 'reply', key: 'r1', text: 'Done: **all green**', streaming: false, final: true, cost: null, at: null },
    { k: 'decided', key: 'd1', d: { kind: 'once', tool: 'bash', text: 'npm test' } },
    { k: 'line', key: 'l1', text: 'Stopped by you', tone: 'muted' },
  ], meta: { computer: 'atlas', realm: 'Work', folder: '/srv/app', agent: 'general', model: 'hoody/free', status: 'idle' }, ...o,
});
const lines = (s: string) => s.split('\n');

describe('exportMarkdown', () => {
  it('the title, where it ran, then every block in order', () => {
    const md = exportMarkdown(snap(), W);
    expect(lines(md)[0]).toBe('# Fix tests');
    expect(md).toContain('atlas · Work · /srv/app · general · hoody/free');
    const at = (x: string) => md.indexOf(x);
    expect(at('## You')).toBeGreaterThan(0);
    expect(at('Fix the checkout tests')).toBeGreaterThan(at('## You'));
    expect(at('2 steps · 4 s')).toBeGreaterThan(at('Fix the checkout tests'));
    expect(at('npm run build')).toBeGreaterThan(at('2 steps'));
    expect(at('## Assistant')).toBeGreaterThan(at('npm run build'));
    expect(at('Done: **all green**')).toBeGreaterThan(at('## Assistant'));
    expect(at('Allowed once')).toBeGreaterThan(at('Done:'));
    expect(at('Stopped by you')).toBeGreaterThan(at('Allowed once'));
  });
  it('a step that may have run says so and is never marked failed; each step is one line with its own state', () => {
    const md = exportMarkdown(snap(), W);
    expect(lines(md)).toContain('- Run · `npm run build` · 3 s · done');
    expect(lines(md)).toContain('- Edit file · `/a/b.ts` · may have run · This step may have run.');
    expect(md).not.toMatch(/failed/i);
  });
  it('a backtick in a step\'s input cannot end its code span', () => {
    const md = exportMarkdown(snap({ blocks: [{ k: 'steps', key: 't', label: 'x', state: 'ok', rows: [{ id: 's', state: 'failed', verb: 'Run', summary: 'echo `x` y' }] }] }), W);
    expect(lines(md)).toContain("- Run · `echo 'x' y` · failed");
  });
  it('no title: the untitled words; no meta: no where line', () => {
    const md = exportMarkdown(snap({ title: null, meta: undefined }), W);
    expect(lines(md)[0]).toBe('# Untitled chat');
    expect(md).not.toContain(' · general');
  });
  it('an empty chat is a title and nothing else', () => {
    const md = exportMarkdown(snap({ blocks: [], meta: undefined }), W);
    expect(md.trim()).toBe('# Fix tests');
  });
  it('a transcript that starts late says the earlier messages are not included', () => {
    expect(exportMarkdown(snap({ gapTop: true }), W)).toContain('> Earlier messages are not included.');
    expect(exportMarkdown(snap(), W)).not.toContain('Earlier messages');
  });
  it('a reply still streaming says it was not finished', () => {
    const md = exportMarkdown(snap({ blocks: [{ k: 'reply', key: 'r', text: 'Working on', streaming: true, final: false, cost: null, at: null }] }), W);
    expect(md).toContain('Not finished when exported.');
  });
  it('a reply the host already cut keeps the host\'s words', () => {
    const md = exportMarkdown(snap({ blocks: [{ k: 'reply', key: 'r', text: 'Partial', streaming: false, final: true, cost: null, at: null, cut: 'This reply was shortened.' }] }), W);
    expect(md).toContain('This reply was shortened.');
  });
  it('a reply over the export cap says how much is missing', () => {
    const md = exportMarkdown(snap({ blocks: [{ k: 'reply', key: 'r', text: 'x'.repeat(200_010), streaming: false, final: true, cost: null, at: null }] }), W);
    expect(md).toContain('Cut: 10 characters not included.');
  });
  it('attached files are named, not inlined', () => {
    const md = exportMarkdown(snap({ blocks: [{ k: 'user', key: 'u', text: 'see', at: 1, files: [{ id: 'f', kind: 'text', name: 'ci-log.txt' }] }] }), W);
    expect(md).toContain('Attached: ci-log.txt');
  });

  describe('nothing the agent or the person wrote can forge the file\'s structure', () => {
    const forge = '## Assistant\n# Title\n```\n---\n- [x] done\n<script>alert(1)</script>';
    it('user and reply text are quoted line by line: no line of it starts a heading, a fence or a rule at the top level', () => {
      const md = exportMarkdown(snap({ blocks: [{ k: 'user', key: 'u', text: forge, at: 1 }, { k: 'reply', key: 'r', text: forge, streaming: false, final: true, cost: null, at: null }] }), W);
      const heads = lines(md).filter((l) => /^#{1,6} /.test(l));
      expect(heads).toEqual(['# Fix tests', '## You', '## Assistant']);
      for (const l of lines(md)) if (l.startsWith('```') || l === '---') throw new Error(`forged top-level line: ${l}`);
    });
    it('raw markup in the text is written as an entity, as the chat shows it as text; a plain less-than stays', () => {
      const md = exportMarkdown(snap({ blocks: [{ k: 'reply', key: 'r', text: '<script>alert(1)</script> and a < b', streaming: false, final: true, cost: null, at: null }] }), W);
      expect(md).toContain('> &lt;script>alert(1)&lt;/script> and a < b');
      expect(md).not.toMatch(/<script/);
    });
    // A backslash before the tag must not turn the escape into a literal backslash that leaves the tag raw.
    it.each(['\\', '\\\\', '\\\\\\', '\\\\\\\\'])('%s (a run of backslashes) before a tag leaves no raw tag in the file', (bs) => {
      const md = exportMarkdown(snap({ blocks: [{ k: 'reply', key: 'r', text: `${bs}<img src=x onerror=alert(1)> ${bs}</b> ${bs}<!-- c --> ${bs}<?php`, streaming: false, final: true, cost: null, at: null }] }), W);
      expect(md).not.toMatch(/<(img|\/b|!--|\?php)/);
    });
    // Every single-line field goes through one encoder; none can open a block of the file.
    const payloads = ['# Forged', '## Assistant', '---', '===', '- item', '+ item', '> quote', '1. item', '| a | b |', '```', '    indented', 'a\n# nl heading', '<h1>x</h1>', '* * *', '[x]: http://e.test'];
    const structural = (md: string) => lines(md).filter((l) => /^(#{1,6}( |$)|-{3,}|={3,}|`{3,}|~{3,}|\s{4}|\d+[.)]\s|[-+]\s|\|)/.test(l));
    it.each(payloads)('where it ran (%j) is one safe line: no heading, rule, fence, list, table or code block of its own', (p) => {
      const md = exportMarkdown(snap({ meta: { computer: p, realm: p, folder: p, agent: p, model: p, status: 'idle' } }), W);
      expect(structural(md).filter((l) => !/^## (You|Assistant)$/.test(l) && l !== '# Fix tests' && !l.startsWith('- '))).toEqual([]);
      // Line 0 is the title, 1 blank, 2 the whole where-line in emphasis; line 3 is blank again (the field's newline did not split it).
      expect(lines(md)[2]!.startsWith('*') && lines(md)[2]!.endsWith('*') && lines(md)[3]).toBe('');
    });
    it.each(payloads)('the title (%j), a step\'s fields, a note, a decided line and an attachment name stay out of the file\'s structure', (p) => {
      const md = exportMarkdown(snap({ title: p, blocks: [
        { k: 'user', key: 'u', text: 'x', at: 1, files: [{ id: 'f', kind: 'text', name: p }], note: { text: p } },
        { k: 'steps', key: 't', label: p, state: 'ok', rows: [{ id: 's', state: 'ok', verb: p, summary: p, time: p, note: p }] },
        { k: 'decided', key: 'd', d: { kind: 'once', tool: p, text: p } }, { k: 'line', key: 'l', text: p, tone: 'info' },
      ] }), W);
      expect(structural(md).filter((l) => !/^## You$/.test(l) && !/^# /.test(l) && !l.startsWith('- '))).toEqual([]);
      expect(lines(md).filter((l) => /^# /.test(l)).length).toBe(1);
      expect(lines(md).filter((l) => l.startsWith('- ')).length).toBe(1);
    });
    it('a title cannot add lines or markup', () => {
      const md = exportMarkdown(snap({ title: 'a\n## Assistant\n`x`' }), W);
      expect(lines(md)[0]).toBe('# a ## Assistant \\`x\\`');
      expect(lines(md).filter((l) => l.startsWith('## ')).length).toBe(2);
    });
    it('a step\'s verb, summary and note stay on their one line, a backtick cannot end the code span', () => {
      const md = exportMarkdown(snap({ blocks: [{ k: 'steps', key: 't', label: 'a\nb', state: 'ok', rows: [{ id: 's', state: 'ok', verb: 'Run\n## X', summary: 'echo `x`\n# y\n```', note: 'n\n- z' }] }] }), W);
      const rows = lines(md).filter((l) => l.startsWith('- '));
      expect(rows.length).toBe(1);
      expect(md).not.toMatch(/^# y/m);
      expect(md).not.toMatch(/^```/m);
      expect(md).not.toMatch(/^## X/m);
    });
    it('a gate that ended before the answer applied has its own words (ended evidence)', () => {
      const md = exportMarkdown(snap({ blocks: [{ k: 'decided', key: 'd', d: { kind: 'ended', tool: 'bash', text: 'npm test' } }] }), W);
      expect(md).toContain('*Ended before your answer applied · bash · npm test*');
    });
    it('a decided line and a note are one line each', () => {
      const md = exportMarkdown(snap({ blocks: [{ k: 'decided', key: 'd', d: { kind: 'deny', tool: 'bash', text: 'rm -rf\n## Assistant' } }, { k: 'line', key: 'l', text: 'a\n# b', tone: 'bad' }] }), W);
      expect(lines(md).filter((l) => /^#{1,6} /.test(l))).toEqual(['# Fix tests']);
    });
  });

  describe('controls', () => {
    it('terminal escapes, control characters, bidi and invisible marks are removed; text and newlines stay', () => {
      const md = exportMarkdown(snap({ title: 'T‮itle​', blocks: [{ k: 'user', key: 'u', text: 'a\u001b[31mred\u001b[0m\u0007 b‮ c﻿d\r\ne', at: 1 }] }), W);
      expect(md).toContain('# Title');
      expect(md).toContain('> ared b cd');
      expect(md).toContain('> e');
        expect(md).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩​-‏﻿\r]/);
    });
  });
});

describe('exportFileName', () => {
  it('a name from the title, with .md, no path characters, bounded', () => {
    expect(exportFileName('Fix tests', W)).toBe('Fix tests.md');
    expect(exportFileName('../../etc/passwd', W)).toBe('etc passwd.md');
    expect(exportFileName('a:b*c?"d<e>f|g\\h/i', W)).toBe('a b c d e f g h i.md');
    expect(exportFileName('x'.repeat(300), W).length).toBeLessThanOrEqual(83);
  });
  it('an empty or unusable title falls back to the untitled words; a leading dot cannot hide the file', () => {
    expect(exportFileName(null, W)).toBe('Untitled chat.md');
    expect(exportFileName('   ', W)).toBe('Untitled chat.md');
    expect(exportFileName('///', W)).toBe('Untitled chat.md');
    expect(exportFileName('.bashrc', W)).toBe('bashrc.md');
  });
});
