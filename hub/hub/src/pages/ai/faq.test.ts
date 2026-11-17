// Vitest: the AI tab's questions. One list for the whole tab: eighteen questions in a fixed order,
// each answered from its own strings, and the answers keep what the shortened lines on the screens gave up.
import { describe, expect, it } from 'vitest';
import { pageFaq } from './faq';
import { LOOP_CAP } from './auto/loops/logic';
import strings from './strings.en.json';

const IDS = [
  'defaultModel', 'keyKept', 'claudeCode', 'agents', 'skillTrust', 'instructionsMemory', 'autoKinds', 'workflowRuns', 'rulesHooks', 'connections', 'settle',
  'autoRun', 'autoCancel', 'autoUnsure', 'autoNotSent', 'loopChange', 'forkUnconfirmed', 'strictApprovals',
] as const;
const t = (k: keyof typeof strings) => strings[k] as string;

describe('ai pageFaq', () => {
  const { items, byId } = pageFaq(t as never);

  it('lists the eighteen questions in order, each id once, each read from its own strings', () => {
    expect(items.map((i) => i.id)).toEqual([...IDS]);
    for (const i of items) {
      expect(i.q).toBe(strings[`faq.${i.id}.q` as keyof typeof strings]);
      expect(i.a).toBe(strings[`faq.${i.id}.a` as keyof typeof strings]);
    }
  });

  it('byId names the same item objects the list holds', () => {
    for (const id of IDS) expect(byId[id]).toBe(items.find((i) => i.id === id));
  });

  it('every question is a question and every answer is a short plain paragraph', () => {
    for (const i of items) {
      expect(i.q.endsWith('?')).toBe(true);
      expect(i.a.length).toBeGreaterThan(40);
      expect(i.a.length).toBeLessThanOrEqual(600);
      expect(i.a).not.toMatch(/\n|<|\{\{/);
    }
  });

  it('the loops answer states the limit the page counts (auto/loops/logic.ts LOOP_CAP)', () => {
    expect(byId.autoKinds.a).toContain(`at most ${LOOP_CAP} run on a computer`);
  });

  it('the answers claim only what the pages do', () => {
    // models/Default: each default switches only its own users, as its confirm says (impact.helper, impact.bots).
    expect(byId.defaultModel.a).toMatch(/A new default for AI helper and tasks switches your AI helper and tasks; a new default for Bots switches the Bots that follow the default/);
    // core/providers/flows-key: the save asks for a check; a check that cannot answer still saves (Connect done.inconclusive, done.untested).
    // A key is shown unchecked only when an inconclusive or untested check result comes back; a save confirmed after a
    // lost reply (flows-key confirmKey) carries no check result and Connect shows done.saved, so the answer never says
    // the page always tells.
    expect(byId.keyKept.a).toContain(
      "Check and save asks for a check first; if the provider refuses it, nothing is saved. If the check can't finish, or this computer can't check keys, the key is saved and shown as not checked when that result comes back. If the answer is lost, the page can confirm the save by its fingerprint and may call it confirmed without a check.",
    );
    expect(byId.keyKept.a).not.toMatch(/tests the key first|the page says so/);
    // auto/workflows: the list shows the step count; the selected workflow shows steps, inputs and a timeout when set.
    expect(byId.autoKinds.a).toMatch(/Workflows lists each workflow's step count; select one to see its steps and inputs, and its timeout if it has one/);
    // auto/workflows runs: where runs show, and the chats the Hub keeps open for the running ones (runsData.ts, PIN_CAP).
    expect(byId.workflowRuns.a).toContain("A workflow's runs show under it, and All runs lists them all.");
    expect(byId.workflowRuns.a).toContain('a chat waiting for your answer counts as idle');
    expect(byId.workflowRuns.a).toContain('While this page is open, the Hub keeps the chats of up to 8 running workflows open; any more are not kept, and none are once the page is closed.');
  });

  it('the answers keep what the shortened lines gave up', () => {
    // agents/Tools: the second sentence of each no-list line.
    expect(byId.agents.a).toMatch(/Ticking tools replaces that with exactly the ticked ones/);
    expect(byId.agents.a).toMatch(/saves a list of the others/);
    // skills: what an untrusted skill that is on withholds; when its commands run.
    expect(byId.skillTrust.a).toMatch(/its description and instructions are withheld/);
    expect(byId.skillTrust.a).toMatch(/starts off and not trusted/);
    expect(byId.skillTrust.a).toMatch(/Its commands run only after you trust it/);
    // loops: the rest of the old subtitle.
    expect(byId.autoKinds.a).toMatch(/is lost if the agent restarts/);
    expect(byId.autoKinds.a).toMatch(/use Schedules or a TODO/);
    // rules: the second sentence of the section description.
    expect(byId.rulesHooks.a).toMatch(/judged by the safety checker before a tool call runs; guidance and playbooks are advice the agent reads/);
  });

  // The TODO action and loop change lines in the pages are one line each; their
  // full texts are kept here, in five answers, each claim pinned as a whole sentence.
  it('the TODO run answer keeps what the run, approve, claimed and refusal lines gave up', () => {
    const s = (x: string) => expect(byId.autoRun.a).toContain(x);
    s('Run and Approve start a worker on this computer that works on the TODO on its own: nobody is asked anything, so its questions and approval requests are denied.');
    s('It spends model budget.');
    s('While a worker holds the TODO, it is not started again and its proposed runs wait until that run ends; you can cancel the run.');
    s('When the worker is done, the TODO moves to review.');
    s('If the agent refuses, nothing starts: another worker may hold the TODO, or this computer already runs as many as it allows.');
    s('A proposal decided otherwise meanwhile changes nothing.');
  });

  it('the cancel answer keeps what stays, and never tells an unnamed end as this run\'s', () => {
    const s = (x: string) => expect(byId.autoCancel.a).toContain(x);
    s('The worker stops and the TODO goes back to ready; what it already changed stays.');
    s('A run that had already finished moved to review.');
    s("When the TODO shows that a run ended but does not say which, that end may not be this run's, so it is never shown as this cancel's outcome.");
    s('If no run is going when you confirm, nothing is sent.');
  });

  it('the unknown answer says a lost change is never sent again and Check again only reads (C9)', () => {
    const s = (x: string) => expect(byId.autoUnsure.a).toContain(x);
    s("When the answer to a run, approval, cancel or loop change is lost, the Hub can't tell whether it went through, so it never sends it again.");
    s("Check again only reads the TODO or the chat's loops; it never starts another.");
    s('A change it does not show yet may still be on its way.');
    s("Some can never be proved by a read: a worker start the TODO shows may be this run or another, and a loop's run count or end time can't show which request changed it.");
    s('For a lost new loop it lists look-alikes started since you sent it; an empty list does not prove none started.');
  });

  it('the not-sent answer names the read before sending and what makes it send nothing', () => {
    const s = (x: string) => expect(byId.autoNotSent.a).toContain(x);
    s("Right before sending, the page reads the TODO or the chat's loops again.");
    s('If that read fails, if the action is no longer offered, or if what the confirm applies to changed (another run holds the TODO, the proposal was decided, the TODO was edited, the loop is gone), nothing is sent.');
    // Expiry alone never blocks a delete or a timing change (both stay offered on an expired loop).
    expect(byId.autoNotSent.a).not.toMatch(/expire/);
    s("While the TODO or loop can't be read, the confirm button stays off.");
  });

  it('the loop change answer keeps the pause, delete, replace order, the wait for your choice and end time rules', () => {
    const s = (x: string) => expect(byId.loopChange.a).toContain(x);
    s('A paused loop no longer keeps its chat open: if nobody has it open, the agent may close it, ending the loop.');
    s('A missing loop may have ended with its chat.');
    s('Delete stops and removes it; its chat and what earlier runs wrote stay.');
    s("A timing change stops the loop, then starts a new one in the same chat once the old one is gone.");
    s("If the stop's answer was lost or the new one is not started, nothing new runs until you choose to start it.");
    s(`A new loop is refused when its chat is closed or the computer already runs ${LOOP_CAP}.`);
    s('An expired loop restarts with a new end time; an end before its first run is not taken.');
  });

  it('the unconfirmed fork answer covers its six points as whole sentences (a reply is freed only by a Check that blocks or records and clears)', () => {
    const s = (x: string) => expect(byId.forkUnconfirmed.a).toContain(x);
    s("When a fork's answer is lost, the Hub can't tell if the chat was made.");
    s('It keeps the fork as unconfirmed and never sends it again; Fork on that reply checks it.');
    s("Check again doesn't send another fork.");
    s('If it finds the new chat, it opens it when it can; if none was made and Check can block a late one and record that, it frees the reply.');
    s('If the fork ended with no chat to open here and Check can record that, it frees the reply, but the chat may exist: see your chat list.');
    s('Otherwise the row stays.');
    s('Hide only hides the row; the fork still holds its reply.');
    s('At most 8 forks per account wait like this.');
    expect(byId.forkUnconfirmed.a).not.toMatch(/only reads|sends nothing|the reply is freed|can block a late one, it frees/);
  });

  it('the loop form note keeps its link to the loop basics, which already say the cap and the restart (f.memory)', () => {
    expect(byId.autoKinds.a).toMatch(/runs while that chat is open on the computer and is lost if the agent restarts; at most 8 run on a computer/);
  });

  it('the Strict question keeps every word the Strict options would say at length, while the options stay one sentence', () => {
    expect(byId.strictApprovals.a).toBe(
      'Asks before every command, file change or delete, changing web request, computer action, MCP tool that is not read-only, image or notification. Reading, searching and tasks never ask; saving memory and TODO edits do not ask. Helpers, workflow runs, the orchestrator, other CLIs, TODO runs and hook tests are off; your hooks are skipped; MCP servers do not start.',
    );
  });
});
