import { describe, expect, it } from 'vitest';
import { makeT } from '../strings';
import { AGENT_CAN_EVERYWHERE, AGENT_HINT_CAN, AGENT_HINT_PAGES, AGENT_HINT_REACH, AGENT_HINT_STARTERS, AGENT_KINDS, AGENT_SETUPS, agentHintScope, agentHintTarget, cliCommand, mainPrompt, starterPrompt, platformHosts, platformText, setupLines, type AgentHintFacts, type AgentHintPage } from './agentHints';
import strings from './AgentHint.strings.en.json';

describe('platformHosts', () => {
  it('hoody.com serves every host itself', () => {
    expect(platformHosts('api.hoody.com')).toEqual({ root: 'hoody.com', api: 'api.hoody.com', install: 'install.hoody.com', sdk: 'sdk.hoody.com', hub: 'hub.hoody.com' });
  });

  it('hoody.com uses its own hosts, its Hub address included', () => {
    expect(platformHosts('api.hoody.com')).toEqual({ root: 'hoody.com', api: 'api.hoody.com', install: 'install.hoody.com', sdk: 'sdk.hoody.com', hub: 'hub.hoody.com' });
  });

  it('a port and upper case do not change the reading', () => {
    expect(platformHosts('api.hoody.com'.toUpperCase() + ':443')).toEqual(platformHosts('api.hoody.com'));
    expect(platformHosts('API.Example.TEST:443').api).toBe('api.example.test');
  });

  it('an unknown api.<domain> keeps its own api host and hoody.com for the rest', () => {
    const h = platformHosts('api.example.net');
    expect(h.api).toBe('api.example.net');
    expect(h.install).toBe('install.hoody.com');
    expect(h.root).toBe('hoody.com');
  });

  it('localhost, a bare domain and junk fall back to hoody.com', () => {
    for (const host of ['localhost:5173', 'hoody.com', '', 'api.', 'api.bad host', 'hub.hoody.com']) expect(platformHosts(host).api).toBe('api.hoody.com');
  });
});

describe('platformText', () => {
  const other = platformHosts('api.hoody.com');

  it('rewrites hoody.com and its api, install, sdk and hub hosts', () => {
    expect(platformText('npx skills add https://hoody.com/SKILLS/SKILL.md', other)).toBe('npx skills add https://hoody.com/SKILLS/SKILL.md');
    expect(platformText('curl -fsSL https://install.hoody.com | sh', other)).toBe('curl -fsSL https://install.hoody.com | sh');
    expect(platformText("baseURL: 'https://api.hoody.com'", other)).toBe("baseURL: 'https://api.hoody.com'");
    expect(platformText('ssh hoody.com', other)).toBe('ssh hoody.com');
    expect(platformText('https://hub.hoody.com', other)).toBe('https://hub.hoody.com');
  });

  it('leaves docs, bots, GitHub and look-alike names alone', () => {
    for (const s of ['https://docs.hoody.com/x', 'https://{label}.hoody.bot/mcp', 'HoodyNetwork/hoody-sdk', 'myhoody.com', 'hoody.company', 'x.hoody.com.evil']) {
      expect(platformText(s, other)).toBe(s);
    }
  });

  it('leaves names that only start with a Hoody host alone (hoody.com.evil.test)', () => {
    for (const s of ['https://hoody.com.evil.test/x', 'https://api.hoody.com.evil.test/x', 'install.hoody.com.x', 'sdk.hoody.com.evil', 'hub.hoody.com.evil', 'hoody.com-x.net']) {
      expect(platformText(s, other)).toBe(s);
    }
  });

  it('still rewrites a host that ends a sentence or a quote', () => {
    expect(platformText('Open hoody.com.', other)).toBe('Open hoody.com.');
    expect(platformText('Use api.hoody.com. Then', other)).toBe('Use api.hoody.com. Then');
    expect(platformText("'https://api.hoody.com'.", other)).toBe("'https://api.hoody.com'.");
    expect(platformText('https://hoody.com/SKILLS/SKILL.md', other)).toBe('https://hoody.com/SKILLS/SKILL.md');
  });

  it('is the identity on hoody.com', () => {
    const com = platformHosts('api.hoody.com');
    expect(platformText('ssh hoody.com && curl https://api.hoody.com', com)).toBe('ssh hoody.com && curl https://api.hoody.com');
  });
});

// ── Scope and prompts ────────────────────
describe('agent hint prompts', () => {
  const t = makeT(strings);
  const PERSONAL = { id: 'f1f1f1f1f1f1f1f1f1f1f1f1', name: 'Personal' };
  const LAB = { id: 'f3f3f3f3f3f3f3f3f3f3f3f3', name: null };
  const ATLAS = { id: 'c0a7150000000000000000a1', name: 'atlas' };
  const inPersonal: AgentHintFacts = { realm: PERSONAL, computer: { computer: ATLAS, realm: PERSONAL } };
  const all: AgentHintFacts = { realm: null, computer: null };
  const target = (page: AgentHintPage, facts: AgentHintFacts) => agentHintTarget(t, agentHintScope(page, facts));
  const main = (page: AgentHintPage, facts: AgentHintFacts, to: 'remote' | 'hoody' = 'remote') => mainPrompt(t, page, target(page, facts), to);
  const starter = (page: AgentHintPage, id: string, facts: AgentHintFacts, to: 'remote' | 'hoody' = 'remote') => starterPrompt(t, page, id, target(page, facts), to);
  const P = '"Personal" (id f1f1f1f1f1f1f1f1f1f1f1f1)';
  const A = '"atlas" (id c0a7150000000000000000a1)';
  const RULES = ['Rules', '- Never show a secret, key or password, in a reply or in a file.', '- Never act on another computer or realm.', '- Ask me before you delete anything or do anything that costs money.'];

  it('the main prompt is a hand-off: skill, target block, stop line, then ask me first, plan, do, report, and the rules', () => {
    expect(main('scripts', inPersonal).split('\n')).toEqual([
      'Use the Hoody skill.',
      '',
      'Target',
      `- Computer: ${A}`,
      `- Realm: ${P}`,
      'If you cannot find this computer in this realm, stop and ask me.',
      '',
      'Steps',
      '1. Ask me what the script should do: what it takes, what it returns, and what to call it. Do nothing else until I answer.',
      '2. Tell me your plan in one line and wait for my OK.',
      '3. Write it in the scripts folder of this computer, then call it once to check that it answers.',
      "4. Give me the script's address and what it answered.",
      '',
      ...RULES,
    ]);
  });

  it('no toy task: every page\'s main prompt asks the person what they want before doing anything', () => {
    for (const page of AGENT_HINT_PAGES) {
      const text = main(page, inPersonal);
      expect(text, page).toMatch(/\n1\. Ask me [^\n]+ Do nothing else until I answer\.\n2\. Tell me your plan in one line and wait for my OK\.\n3\. [^\n]+\n4\. [^\n]+\n/);
      expect(text, page).not.toMatch(/Tokyo|"This week"|http\.server/);
      expect(text.endsWith(RULES.join('\n')), page).toBe(true);
    }
  });

  it('the Hoody Agent gets the same prompt without the skill line, main and starters alike', () => {
    for (const page of AGENT_HINT_PAGES) {
      expect(main(page, inPersonal, 'hoody'), page).toBe(main(page, inPersonal).replace('Use the Hoody skill.\n\n', ''));
      expect(main(page, inPersonal, 'hoody'), page).not.toContain('Hoody skill');
      for (const id of AGENT_HINT_STARTERS[page]) {
        expect(starter(page, id, inPersonal, 'hoody'), `${page}.${id}`).toBe(starter(page, id, inPersonal).replace('Use the Hoody skill.\n', ''));
      }
    }
  });

  it('starters: 2 or 3 per page, one task each, the same target in one line, the rules in one line', () => {
    for (const page of AGENT_HINT_PAGES) {
      expect(AGENT_HINT_STARTERS[page].length, page).toBeGreaterThanOrEqual(2);
      expect(AGENT_HINT_STARTERS[page].length, page).toBeLessThanOrEqual(3);
      for (const id of AGENT_HINT_STARTERS[page]) {
        const lines = starter(page, id, inPersonal).split('\n');
        expect(lines, `${page}.${id}`).toHaveLength(5);
        expect(lines[0]).toBe('Use the Hoody skill.');
        expect(lines[2], `${page}.${id}`).toMatch(/^Task: \S/);
        expect(lines[3]).toBe('First: ask me anything that is unclear, tell me your plan in one line and wait for my OK.');
        expect(lines[4]).toBe(strings['hint.p.rulesLine']);
        expect(strings[`hint.${page}.title.${id}` as keyof typeof strings], `${page}.${id} title`).toBeTruthy();
      }
    }
    expect(starter('scripts', 'failing', inPersonal).split('\n')[1]).toBe(`Target: computer ${A}, realm ${P}. If you cannot find this computer in this realm, stop and ask me.`);
  });

  it('whole table: every main prompt and every starter, on every page, in a realm, in All realms and for both agents, asks first and names a Target', () => {
    const modes: [string, AgentHintFacts][] = [['realm', inPersonal], ['realm, no computer', { realm: PERSONAL, computer: null }], ['all', all]];
    let n = 0;
    for (const page of AGENT_HINT_PAGES) {
      for (const [mode, facts] of modes) {
        for (const to of ['remote', 'hoody'] as const) {
          const m = main(page, facts, to);
          expect(m, `${page} ${mode} ${to} main`).toMatch(/(^|\n)Target\n- Realm: |(^|\n)Target\n- Computer: [^\n]+\n- Realm: /);
          expect(m, `${page} ${mode} ${to} main`).toMatch(/\n1\. Ask me [^\n]+ Do nothing else until I answer\.\n2\. Tell me your plan in one line and wait for my OK\.\n/);
          n++;
          for (const id of AGENT_HINT_STARTERS[page]) {
            const s = starter(page, id, facts, to);
            expect(s, `${page}.${id} ${mode} ${to}`).toMatch(/(^|\n)Target: [^\n]*(realm "|realm id |in all realms)/);
            expect(s, `${page}.${id} ${mode} ${to}`).toMatch(/\nTask: [^\n]+\nFirst: ask me anything that is unclear, tell me your plan in one line and wait for my OK\.\n/);
            n++;
          }
        }
      }
    }
    expect(n).toBe(AGENT_HINT_PAGES.length * 6 + Object.values(AGENT_HINT_STARTERS).flat().length * 6);
  });

  it('every target names its realm by name and full id, or says all realms; a computer by name and full id', () => {
    for (const page of AGENT_HINT_PAGES) {
      expect(main(page, inPersonal), page).toContain(`- Realm: ${P}`);
      expect(main(page, all), page).toContain('- Realm: all realms');
      for (const id of AGENT_HINT_STARTERS[page]) {
        expect(starter(page, id, inPersonal), `${page}.${id}`).toContain(`realm ${P}`);
        expect(starter(page, id, all), `${page}.${id}`).toContain('in all realms');
      }
    }
    for (const page of ['notes', 'scripts', 'bots', 'logs', 'programs'] as const) expect(main(page, inPersonal), page).toContain(`- Computer: ${A}\n- Realm: ${P}\nIf you cannot find this computer in this realm, stop and ask me.`);
  });

  it('keys in a realm: the keys that can act there (realm_ids names it or is empty), never "the whole account"', () => {
    const text = main('keys', inPersonal);
    expect(text).toContain(`- Realm: ${P}\n- Keys: only my API keys that can act in this realm\nAPI keys belong to my account: a key can act in this realm when its realm_ids include f1f1f1f1f1f1f1f1f1f1f1f1 or are empty (no realm limit). Leave every other key alone.\nIf you cannot find this realm, stop and ask me.`);
    expect(text).not.toContain('whole account');
    expect(target('keys', inPersonal).why).toBe(strings['hint.why.keysRealm']);
    // All realms: every key, said so.
    const everyKey = main('keys', all);
    expect(everyKey).toContain('- Realm: all realms\n- Keys: all my API keys, in every realm\n\nSteps');
    expect(target('keys', all).why).toBe(strings['hint.why.keysAll']);
    expect(starter('keys', 'unused', inPersonal).split('\n')[1]).toContain('keys: only my API keys that can act in this realm. API keys belong to my account');
  });

  it('the vault and the computers list follow the realm; All realms names the Global vault and every computer', () => {
    expect(main('vault', inPersonal)).toContain(`- Realm: ${P}\n- Vault: this realm's vault\nIf you cannot find this realm, stop and ask me.`);
    expect(main('vault', all)).toContain('- Realm: all realms\n- Vault: the Global vault (it belongs to no realm)\n\nSteps');
    expect(main('computers', inPersonal)).toContain(`- Realm: ${P}\n- Computers: every computer in this realm\n`);
    expect(main('computers', all)).toContain('- Realm: all realms\n- Computers: every computer, in all realms\n');
    expect(main('bots', { realm: PERSONAL, computer: null })).toContain(`- Realm: ${P}\n- Computers: every computer in this realm\n`);
  });

  it('no computer chosen, or a filter the page cannot name: the agent asks which one first, in the realm shown', () => {
    for (const page of ['notes', 'scripts', 'logs', 'programs'] as const) {
      expect(main(page, { realm: PERSONAL, computer: null }), page).toContain(`- Computer: not chosen yet (ask me which one first)\n- Realm: ${P}\n`);
      expect(main(page, all), page).toContain('- Computer: not chosen yet (ask me which one first)\n- Realm: all realms\n');
    }
    expect(main('bots', { realm: PERSONAL, computer: null, ask: true })).toContain('- Computer: not chosen yet (ask me which one first)');
    expect(main('bots', { ...inPersonal, ask: true })).toContain(`- Computer: ${A}`);
    expect(target('programs', all).why).toBe(strings['hint.why.pick']);
  });

  it('a realm without a nickname and a computer without a name are named by their full ids, never guessed', () => {
    expect(main('computers', { realm: LAB, computer: null })).toContain('- Realm: id f3f3f3f3f3f3f3f3f3f3f3f3 (no name)');
    const bare = main('programs', { realm: null, computer: { computer: { id: ATLAS.id, name: '  ' }, realm: null } });
    expect(bare).toContain(`- Computer: id ${ATLAS.id} (no name)\n- Realm: not one realm (the computer's id names it exactly)\nIf you cannot find this computer, stop and ask me.`);
    expect(target('programs', { realm: null, computer: { computer: ATLAS, realm: null } }).why).toBe(strings['hint.why.computerOnly']);
    expect(main('programs', { realm: LAB, computer: { computer: ATLAS, realm: { id: LAB.id, name: '' } } })).toContain(`- Realm: id ${LAB.id} (no name)`);
  });

  it('the API page: reached with an account key; its prompts take the selected realm, or all realms, and ask first what to do through the API', () => {
    expect(AGENT_HINT_PAGES).toContain('api');
    expect(AGENT_HINT_REACH.api).toBe('account');
    expect(AGENT_HINT_CAN.api).toBe(3);
    expect(main('api', inPersonal)).toContain(`Target\n- Realm: ${P}\n- Computers: every computer in this realm\nIf you cannot find this realm, stop and ask me.\n\nSteps\n1. ${strings['hint.api.ask']}\n`);
    expect(main('api', all)).toContain(`- Realm: all realms\n- Computers: every computer, in all realms\n\nSteps\n1. ${strings['hint.api.ask']}\n`);
    expect(target('api', inPersonal).why).toBe(strings['hint.why.realm']);
    expect(AGENT_HINT_STARTERS.api).toEqual(['find', 'example']);
    expect(starter('api', 'find', all).split('\n')[2]).toBe(`Task: ${strings['hint.api.task.find']}`);
    expect(starter('api', 'example', all).split('\n')[2]).toBe(`Task: ${strings['hint.api.task.example']}`);
    // The words are about the API as a person meets it: no product behind it is named.
    for (const [k, v] of Object.entries(strings)) if (/^(hint|can)\.api\./.test(k)) expect(v, k).not.toMatch(/openapi|swagger|fastify|proxy|\bnode\b/i);
  });

  it('Schedules, Tunnels and Files: each has its lead, its own rows and two starters, and acts on one computer', () => {
    for (const page of ['schedules', 'tunnels', 'files'] as const) {
      expect(AGENT_HINT_PAGES, page).toContain(page);
      expect(AGENT_HINT_REACH[page], page).toBe('computer');
      expect((strings as Record<string, string>)[`hint.${page}.what`], page).toMatch(/^Hoody Agent, or any agent with the Hoody skill, can /);
      expect(AGENT_HINT_CAN[page], page).toBeGreaterThanOrEqual(4);
      expect(AGENT_HINT_STARTERS[page], page).toHaveLength(2);
      expect(main(page, inPersonal), page).toContain(`Target\n- Computer: ${A}\n- Realm: ${P}\n`);
      expect(main(page, { realm: PERSONAL, computer: null }), page).toContain('- Computer: not chosen yet (ask me which one first)');
    }
  });

  it('conformance: every page has its hand-off steps and starter tasks, and no prompt string names a routing node', () => {
    const table = strings as Record<string, string>;
    for (const page of AGENT_HINT_PAGES) {
      for (const s of ['ask', 'do', 'report', 'title.main', 'source']) expect(table[`hint.${page}.${s}`], `${page}.${s}`).toBeTruthy();
      expect(table[`hint.${page}.ask`], page).toMatch(/^Ask me .* Do nothing else until I answer\.$/);
      for (const id of AGENT_HINT_STARTERS[page]) expect(table[`hint.${page}.task.${id}`], `${page}.${id}`).toBeTruthy();
    }
    for (const [k, v] of Object.entries(table)) if (/^hint\.(tgt|stop|thing|why|p|rule)\./.test(k)) expect(v, k).not.toMatch(/server|node|\.last4|handle/i);
  });
});

describe('what an agent can do: the rows', () => {
  const table = strings as Record<string, string>;
  /** A row is one short line: it fits a phone drawer in two lines at most. */
  const ROW_MAX = 90;

  it('every Can do row, a page\'s own or a shared one, is one short line with no full stop', () => {
    const rows: [string, string][] = [];
    for (const page of AGENT_HINT_PAGES) for (let n = 1; n <= AGENT_HINT_CAN[page]; n++) rows.push([`can.${page}.${n}`, table[`can.${page}.${n}`] ?? '']);
    for (const g of AGENT_CAN_EVERYWHERE) for (let n = 1; n <= g.rows; n++) rows.push([`all.${g.id}.${n}`, table[`all.${g.id}.${n}`] ?? '']);
    expect(rows.length).toBeGreaterThan(AGENT_HINT_PAGES.length * 3);
    expect(rows.some(([key]) => key.startsWith('all.'))).toBe(true);
    for (const [key, text] of rows) {
      expect(text, key).toBeTruthy();
      expect(text.length, `${key}: ${text}`).toBeLessThanOrEqual(ROW_MAX);
      expect(text, key).not.toMatch(/\.$/);
      expect(text, key).toMatch(/^[A-Z]/);
    }
  });

  it('no string names a chat app as bare text: a row is plain text, and those names are drawn only with their mark', () => {
    for (const [key, text] of Object.entries(table)) expect(text, key).not.toMatch(/\b(?:telegram|slack|discord)\b/i);
  });

  it('the shared groups are few, each with a title, and their ids are unique', () => {
    expect(AGENT_CAN_EVERYWHERE.length).toBeGreaterThanOrEqual(4);
    expect(AGENT_CAN_EVERYWHERE.length).toBeLessThanOrEqual(6);
    expect(new Set(AGENT_CAN_EVERYWHERE.map((g) => g.id)).size).toBe(AGENT_CAN_EVERYWHERE.length);
    for (const g of AGENT_CAN_EVERYWHERE) expect(table[`all.${g.id}.title`], g.id).toBeTruthy();
  });

  it('no row or lead names an AI provider, and the Computers page has a row for work inside a computer', () => {
    for (const [key, text] of Object.entries(table)) if (/^(can|all|hint\.can)\./.test(key) || /\.what$/.test(key)) expect(text, key).not.toMatch(/openrouter|openai|anthropic|gemini|mistral/i);
    expect(AGENT_HINT_CAN.computers).toBe(5);
    expect(table['can.computers.5']).toMatch(/inside a computer/);
  });
});

describe('agent setup lines', () => {
  // The Set up tab's commands are the Guide's door table (coding agents, AI chats, CLI): one source of words per door.
  it('equal the Guide door lines they stand for, caption by caption', async () => {
    const { doorById } = await import('../../pages/guide/logic');
    const hosts = platformHosts('');
    const door = (id: Parameters<typeof doorById>[0]) =>
      doorById(id).lines.map((l) => (l.kind === 'command' ? { cap: l.cap, text: l.text } : l.kind === 'cli' ? { cap: l.cap, text: cliCommand(l.args, hosts) } : null));
    expect(setupLines('coding', hosts)).toEqual(door('coding'));
    expect(setupLines('chat', hosts)).toEqual(door('ai'));
    expect(setupLines('cli', hosts)).toEqual(door('cli').slice(0, AGENT_SETUPS.cli.length));
  }, 120_000);

  it('point at the platform the Hub runs on', () => {
    const other = platformHosts('api.hoody.com');
    expect(setupLines('coding', other)[0]?.text).toBe('npx skills add https://hoody.com/SKILLS/SKILL.md');
    expect(setupLines('cli', other)[0]?.text).toBe('curl -fsSL https://install.hoody.com | sh');
    for (const kind of AGENT_KINDS) for (const l of setupLines(kind, other)) expect(strings[`hint.setup.cap.${l.cap}` as keyof typeof strings], l.cap).toBeTruthy();
  });
});
