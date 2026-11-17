// Vitest: the programs page's questions. The builder is the one list the page's Questions sections and the single-answer
// links (start time, network ranges, the sandbox panel and editor, the system-program note, the Ports & aliases tab) read: sixteen
// questions in a fixed order, each answered from its own strings; the last eight are the ones about ports and aliases. The answers carry the rules the decision text shares, so a change to a rule is made in both
// places or fails here.
import { DEEP } from 'virtual:hub-search-index';
import { describe, expect, it } from 'vitest';
import { pageFaq } from './faq';
import sbStrings from './sandbox/strings.en.json';
import strings from './strings.en.json';

const PORTS = ['whichPorts', 'hoodyPorts', 'portOrAlias', 'makeAlias', 'aliasStopped', 'whoCanOpen', 'ownDomain', 'httpsPort'] as const;
const IDS = ['whatIsProgram', 'systemPrograms', 'keepOrOnce', 'startDone', 'sandboxLimits', 'sandboxNetwork', 'sandboxApply', 'maybeWentThrough', ...PORTS] as const;
const t = (k: keyof typeof strings) => strings[k] as string;

describe('programs pageFaq', () => {
  const { items, byId } = pageFaq(t as never);

  it('lists the sixteen questions in order, each id once, each read from its own strings', () => {
    expect(items.map((i) => i.id)).toEqual([...IDS]);
    for (const i of items) {
      expect(i.q).toBe(strings[`faq.${i.id}.q` as keyof typeof strings]);
      expect(i.a).toBe(strings[`faq.${i.id}.a` as keyof typeof strings]);
    }
  });

  it('byId names the same item objects the list holds', () => {
    for (const id of IDS) expect(byId[id]).toBe(items.find((i) => i.id === id));
  });

  it('every question is a question and every answer is plain text in short blocks: paragraphs, a list or steps, none a wall of text', () => {
    for (const i of items) {
      expect(i.q.endsWith('?')).toBe(true);
      expect(i.a.length, i.id).toBeGreaterThan(40);
      expect(i.a.length, i.id).toBeLessThanOrEqual(600);
      expect(i.a, i.id).not.toMatch(/<|\{\{|\r|\n{3}|[ \t]\n|\n[ \t]|^\s|\s$/);
      const blocks = i.a.split('\n\n');
      // More than one block, so no answer is one big paragraph; a paragraph is at most 350 characters.
      expect(blocks.length, i.id).toBeGreaterThan(1);
      expect(blocks.length, i.id).toBeLessThanOrEqual(4);
      for (const b of blocks) {
        const lines = b.split('\n');
        const list = lines.every((l) => /^- \S/.test(l)) || lines.every((l) => /^[0-9]\. \S/.test(l));
        // A line break inside a block is a list's or the steps'; a paragraph has none.
        expect(list || lines.length === 1, `${i.id}: ${b}`).toBe(true);
        if (!list) expect(b.length, `${i.id}: ${b}`).toBeLessThanOrEqual(350);
        // Steps count from 1 with no gap.
        if (/^[0-9]\. /.test(lines[0]!)) expect(lines.map((l) => l.slice(0, 2)), i.id).toEqual(lines.map((_, n) => `${n + 1}.`));
      }
    }
  });

  it('the answers keep the risks the decision text states: a system program is stopped only knowingly, a restart interrupts, a change may be sent twice', () => {
    expect(strings.sysHint).toContain('Stop or restart one only if you know why.');
    expect(byId.systemPrograms.a).toContain('Stop or restart one only if you know why.');
    expect(byId.sandboxApply.a).toContain('interrupts whatever it is doing');
    expect(byId.maybeWentThrough.a).toContain('Stop tracking clears the note and releases the held change');
    expect(byId.maybeWentThrough.a).toMatch(/if it did, pressing the action again does it a second time/);
    expect(byId.maybeWentThrough.a).toMatch(/restart's receipt/);
    expect(byId.maybeWentThrough.a).toMatch(/never sends the change again/);
  });

  it('the start rules quoted in startDone are the ones the field and the restart choices state', () => {
    expect(byId.startDone.a).toContain('empty or 0 means 1 second');
    expect(byId.startDone.a).toContain(sbStrings['np.policy.unexpected'].toLowerCase());
    expect(byId.startDone.a).toContain(sbStrings['np.policy.true'].toLowerCase());
    expect(byId.startDone.a).toContain(sbStrings['np.policy.false'].toLowerCase());
    // the field keeps the consequences the person chooses by: the answer repeats them, it does not replace them
    expect(sbStrings['np.startSecs.d']).toContain('Empty or 0 means 1 second');
    expect(sbStrings['np.startSecs.d']).toContain('If it crashes in that time, the start failed.');
    expect(sbStrings['np.startSecs.d']).toContain('the restart setting above decides');
    expect(byId.startDone.a).toContain('If it crashes in that time, the start failed.');
  });

  it('the sandbox answers carry the numbers and the warning the editor shows', () => {
    expect(byId.sandboxLimits.a).toContain('fills empty memory and process limits with 512 MB and 256');
    expect(sbStrings['sb.ed.preset.limits.d']).toContain('Memory 512 MB, 256 processes');
    expect(byId.sandboxNetwork.a).toContain('can shut them out');
    // the exception is the checkbox's, not unconditional
    expect(byId.sandboxNetwork.a).toContain(`"${sbStrings['sb.ed.allowPlatform']}" is on`);
    expect(byId.systemPrograms.a).toContain('When the Hub knows what relies on one');
    expect(byId.systemPrograms.a).not.toMatch(/Each confirm/);
    expect(sbStrings['sb.ed.ingressFrom.d']).toContain('can shut web visitors out');
    expect(byId.keepOrOnce.a).toContain('10 minutes');
  });

  it('a line shortened in the form still has its sentence in the answer, and what the person decides by stays at the field', () => {
    // the name field keeps its uniqueness rule (a constraint belongs where the name is chosen, not only in an optional answer); keepOrOnce says it too
    expect(sbStrings['np.name.d']).toBe('Letters, digits, dots, dashes and underscores. Each program on this computer has its own name.');
    expect(byId.keepOrOnce.a).toContain('each program on this computer has its own name');
    // the two starting points keep their caveat and drop the sentence their own label already says
    expect(sbStrings['sb.ed.preset.noOutgoingTcp.d']).toBe('It can still answer on its own ports. UDP is not covered.');
    expect(byId.sandboxLimits.a).toContain('No outgoing TCP connections (it can still answer on its own ports; UDP is not covered)');
    expect(sbStrings['sb.ed.preset.readOnly.d']).toBe('Add folders it may write to below.');
    expect(byId.sandboxLimits.a).toContain('Read-only files (it can read but not change them; add folders it may write to)');
    // wording only: the start-with-computer help still says it may start when added, and the sandbox disclosure still says to leave it for none
    expect(sbStrings['np.boot.d']).toBe('It may also start when added.');
    expect(byId.keepOrOnce.a).toContain('It may also start as soon as it is added');
    expect(sbStrings['np.sb.d']).toBe("The same choices as the program's Sandbox panel. Leave it as it is for no sandbox.");
    // the Keep it / Run once choice keeps its whole help (radio options are not counted, so nothing there moved)
    expect(sbStrings['np.mode.keep.d']).toContain('Start it when you like, or with the computer.');
    expect(sbStrings['np.mode.once.d']).toContain('its result stays readable for 10 minutes');
  });

  it('the Ports & aliases questions are page questions: in the list and in Jump to, landing on the Running tab\'s Questions', () => {
    for (const id of PORTS) {
      expect(items).toContain(byId[id]);
      expect(DEEP).toContainEqual(expect.objectContaining({ page: 'programs', kind: 'faq', label: byId[id].q, to: `#faq-${id}` }));
    }
    // The record's target is the alias's address (the aliases list's Address, copied without https://), never a column of its own.
    expect(byId.ownDomain.a).toContain("- Point it at the alias's address: the Copy of its row copies exactly that.");
    // The steps as proven: a name under the domain, the proxy off, HTTPS on the first visit with a retry, the record removed first.
    expect(byId.ownDomain.a).toMatch(/for a name under your domain/);
    expect(byId.ownDomain.a).toMatch(/Turn off any DNS proxy and CNAME flattening/);
    expect(byId.ownDomain.a).toMatch(/HTTPS is set up on the first visit; if that visit fails, open it again a minute later/);
    expect(byId.ownDomain.a).toMatch(/delete the DNS record first, then the alias/);
    expect(byId.ownDomain.a).not.toContain('Your domain points to');
  });

  it('the ports answers use the words the tab shows: the Web and Other kinds, "No web address", Create alias, the Hoody kit tag', () => {
    for (const k of ['pa.ports.kind.web', 'pa.ports.kind.other'] as const) expect(byId.whichPorts.a).toContain(`- ${strings[k]}: `);
    expect(byId.whichPorts.a).toContain(`"${strings['pa.ports.noAddress']}"`);
    expect(byId.makeAlias.a).toContain(strings['pa.ports.alias']);
    expect(byId.makeAlias.a).toContain(`${strings['pa.ports.kind.web']} port`);
    // The alias form is on Computers; a page test may not read another page's strings, so its two labels are written out here.
    expect(byId.makeAlias.a).toContain('Choose Make alias.');
    expect(byId.hoodyPorts.a).toContain(`${strings['pa.ports.kit']} tag`);
    expect(byId.whoCanOpen.a).toContain('Permissions tab');
  });

  it('makeAlias states the name rule the alias form states', () => {
    expect(byId.makeAlias.a).toContain('3 to 61 lowercase letters');
    expect(byId.makeAlias.a).toContain('no dash at either end');
  });
});
