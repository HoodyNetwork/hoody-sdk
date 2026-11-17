// Coding agents (agents.ts), as a catalogue: each agent's own mark, its name, who makes it, its badge and Open; no
// command lines. An agent the badge or Open finds not installed links to its maker's install
// page (AgentGuide, also under "not installed" in the launcher's result). Open asks the
// computer's system source for the agent's program and opens only the row of exactly that name (agents.ts
// programOf), through the launcher's one send (useApps launch, that candidate in a terminal), so the C9 hold, the
// result panel and the Apps list are the ones every launch has. No exact row: "not installed", nothing sent; no
// answer: "couldn't check", nothing sent. While the list is shown each agent's program is read once for its badge
// (agentBadge: Installed, Not installed, Checking…, Couldn't check); nothing is sent before Open.
import type { Target } from '@core';
import { Button, CardGrid, ExtLink, Icon, Notice, PickCard, StatusPill, useStrings, type Tone } from '@kit';
import type { LauncherCards } from './AppLauncher';
import { useEffect, useRef, useState } from 'react';
import { AGENTS, agentBadge, agentItem, programOf, type Agent, type AgentBadge } from '../agents';
import { useAgentSearch } from '../data';
import s from '../parts/parts.module.css';
import strings from '../strings.en.json';
import type { Apps } from './useApps';
import l from './launch.module.css';

/** An agent's Open while its program is asked for, and what its answer said (installed: it found the program and
 *  opened it), with when that answer came: the newer of it and the list's own read sets the badge. */
type Check = { c: 'checking' } | { c: 'installed' | 'missing' | 'unchecked'; at: number };

const BADGE_TONE: Record<AgentBadge, Tone> = { installed: 'ok', missing: 'neutral', checking: 'neutral', unchecked: 'warn' };

export interface AgentsPaneProps {
  a: Apps;
  target?: Target | null | undefined;
  /** Only these agents (by id), in AGENTS order: the ones the typed words name. */
  only?: readonly string[];
  /** Only the agents whose badge says Installed ("On this computer"). */
  installedOnly?: boolean;
  cards?: LauncherCards | undefined;
}

export function AgentsPane({ a, target, only, installedOnly, cards }: AgentsPaneProps) {
  const t = useStrings(strings);
  const asks = useAgentSearch(AGENTS.map((x) => x.exe), target, { enabled: true });
  // Checks belong to one computer: keyed by it and the agent, and all of them end when the computer changes, so
  // another computer's "not installed" or a press still asking there never shows here.
  const keyOf = (id: string) => `${a.cid ?? ''}|${id}`;
  const [checks, setChecks] = useState<Record<string, Check | undefined>>({});
  // The tiles view: the agent pressed last, whose answer (not installed, couldn't check) shows under the grid.
  const [sel, setSel] = useState<string | null>(null);
  const mark = (k: string, c?: Check) => setChecks((m) => ({ ...m, [k]: c }));
  const answered = (k: string, c: 'installed' | 'missing' | 'unchecked') => mark(k, { c, at: Date.now() });
  // The presses still asking (read at the press: two presses before a render send one check).
  const asking = useRef(new Set<string>());
  // An answer read after the pane closed or the computer changed (even back again) opens nothing: the press belonged
  // to that view of that computer.
  const cid = useRef(a.cid);
  cid.current = a.cid;
  const epoch = useRef(0);
  const seen = useRef(a.cid);
  useEffect(() => {
    if (seen.current === a.cid) return;
    seen.current = a.cid;
    epoch.current++;
    asking.current.clear();
    setChecks({});
  }, [a.cid]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);

  async function open(x: Agent, i: number) {
    const k = keyOf(x.id);
    if (asking.current.has(k)) return;
    asking.current.add(k);
    const at = { epoch: epoch.current, cid: cid.current };
    mark(k, { c: 'checking' });
    const r = await asks[i]?.refetch().catch(() => undefined);
    if (!alive.current || epoch.current !== at.epoch || cid.current !== at.cid) return;
    asking.current.delete(k);
    const read = r && !r.error ? r.data : undefined;
    const c = read && !read.failed ? programOf(x, read.rows) : undefined;
    if (c) {
      answered(k, 'installed');
      return void a.latest.current.launch(agentItem(x, c), { opensIn: 'terminal' });
    }
    // Only a whole answer says the program is not there; a source that failed, warmed up, answered in part or warned may
    // not have looked everywhere.
    answered(k, !read || read.failed || read.partial || read.warming || read.warned ? 'unchecked' : 'missing');
  }

  if (cards) {
    const shown = AGENTS.map((x, i) => {
      const check = checks[keyOf(x.id)];
      const r = asks[i];
      const pressed = check && (check.c === 'checking' || check.at >= Math.max(r?.dataUpdatedAt ?? 0, r?.errorUpdatedAt ?? 0)) ? check.c : undefined;
      return { x, i, pressed, badge: (pressed ?? agentBadge(x, r)) as AgentBadge | null };
    }).filter((v) => !(only && !only.includes(v.x.id)) && !(installedOnly && v.badge !== 'installed'));
    const told = shown.find((v) => v.x.id === sel && (v.pressed === 'missing' || v.pressed === 'unchecked' || v.badge === 'missing'));
    return (
      <>
      <CardGrid
        className={cards.grid}
        label={t('agents.tab')}
        items={shown}
        keyOf={(v) => v.x.id}
        textOf={(v) => v.x.name}
        onPick={(k) => { const v = shown.find((y) => y.x.id === k); if (v) { setSel(v.x.id); void open(v.x, v.i); } }}
        renderCard={(v) => (
          <PickCard
            title={v.x.name}
            mark={cards.mark(v.x.mark)}
            end={v.badge ? <StatusPill tone={BADGE_TONE[v.badge]} dot>{t(`agents.badge.${v.badge}`)}</StatusPill> : undefined}
            note={t(v.x.about)}
            isSelected={told?.x.id === v.x.id}
          />
        )}
      />
      {told ? (
        <Notice level={told.pressed === 'unchecked' ? 'warn' : 'calm'}>
          {t(told.pressed === 'unchecked' ? 'agents.unchecked' : 'agents.notInstalled', { name: told.x.name })} {told.badge === 'missing' || told.pressed === 'missing' ? <AgentGuide a={a} x={told.x} /> : null}
        </Notice>
      ) : null}
      </>
    );
  }

  return (
    <>
      <ul className={l.list} aria-label={t('agents.tab')}>
        {AGENTS.map((x, i) => {
          const check = checks[keyOf(x.id)];
          const r = asks[i];
          // A press answer stands until the list's read brings a newer one (then its line goes too).
          const pressed = check && (check.c === 'checking' || check.at >= Math.max(r?.dataUpdatedAt ?? 0, r?.errorUpdatedAt ?? 0)) ? check.c : undefined;
          const c = pressed;
          const badge: AgentBadge | null = pressed ?? agentBadge(x, r);
          if ((only && !only.includes(x.id)) || (installedOnly && badge !== 'installed')) return null;
          return (
            <li key={x.id} className={l.agent}>
              <div className={l.agentHead}>
                <Icon name={x.mark} size="lg" tone="ink" />
                <span className={l.rowText}>
                  <span className={l.agentTitle}>
                    <h3 className={l.agentName}>{x.name}</h3>
                    {badge ? (
                      <StatusPill tone={BADGE_TONE[badge]} dot {...(badge === 'unchecked' ? { tip: t('agents.badge.uncheckedTip') } : {})}>
                        {t(`agents.badge.${badge}`)}
                      </StatusPill>
                    ) : null}
                  </span>
                  <span className={l.rowMeta}>{t(x.about)}</span>
                </span>
                <Button size="sm" variant="row" busy={c === 'checking'} onPress={() => void open(x, i)}>
                  {t('act.open')}
                </Button>
              </div>
              {c === 'missing' || c === 'unchecked' ? (
                <p className={s.note} role="status" /* reason: a one-line answer to this card's Open; the install page link is just below */>
                  {t(c === 'missing' ? 'agents.notInstalled' : 'agents.unchecked', { name: x.name })}
                </p>
              ) : null}
              {badge === 'missing' ? <AgentGuide a={a} x={x} /> : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** The link to an agent's install page on its maker's site, in a new tab (also under "not installed" in the launcher's
 *  result). No command is shown: the maker's page has the current steps. */
export function AgentGuide({ a, x }: { a: Pick<Apps, 't'>; x: Agent }) {
  return (
    <span className={l.rowMeta}>
      <ExtLink url={x.guide}>{a.t('agents.guide', { name: x.name })}</ExtLink>
    </span>
  );
}
