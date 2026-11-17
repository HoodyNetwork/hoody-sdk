// "Your script so far": the side card of the New script wizard's fill-in steps (What, Where, Build / Write / Fill). It
// fills in as the person goes: a row not decided yet names the step that decides it; the address shows from the first
// step as the suggestion the flow made from the description. The head line carries the draft's state. Read-only: every
// value is the flow's draft, so the card is ready when drawn.
import { AnatomySection, Facts, Row, StatusPill, useStrings, type Fact } from '@kit';
import strings from '../strings.en.json';

export type CardState = 'draft' | 'building' | 'notBuilt' | 'ready';

export interface ScriptCardProps {
  state: CardState;
  /** The index of the step shown now (0 = What it does). */
  step: number;
  /** The way: the AI way shows the description, the idea way the idea's name. */
  what: string | null;
  route: string;
  routeOk: boolean;
  computer: string;
  runs: string;
  link: boolean;
  /** Lines of code, or null while there is none (or an idea, which the agent writes). */
  lines: number | null;
  idea: boolean;
}

const READY = { kind: 'ready' } as const;
const TONE = { draft: 'neutral', building: 'info', notBuilt: 'danger', ready: 'ok' } as const;

export function ScriptCard(p: ScriptCardProps) {
  const t = useStrings(strings);
  // Values as nodes: Facts would autolink a string; the description, the name and the route are shown as written.
  const later = (n: number) => <>{t('flow.card.later', { n })}</>;
  const items: Fact[] = [
    ...(p.what ? [{ label: t('flow.rail.what'), value: <>{p.what}</> }] : [{ label: t('flow.rail.what'), value: later(1) }]),
    {
      label: t('flow.card.at'),
      value: p.routeOk ? <>{p.step === 0 ? t('flow.card.suggested', { route: p.route }) : p.route}</> : later(2),
      mono: p.routeOk,
    },
    { label: t('flow.rail.on'), value: p.computer ? <>{p.computer}</> : later(2) },
    { label: t('flow.rail.runs'), value: p.step >= 1 ? <>{p.runs}</> : later(2) },
    { label: t('flow.rail.link'), value: p.step >= 1 ? (p.link ? t('flow.rail.linkOn') : t('flow.rail.linkOff')) : later(2) },
    { label: t('flow.card.code'), value: p.idea ? t('flow.card.idea') : p.lines ? t('flow.card.codeLines', { count: p.lines }) : later(3) },
  ];
  return (
    <AnatomySection id="new-card" title={t('flow.rail.title')} state={READY}>
      <Row>
        <StatusPill tone={TONE[p.state]} dot={p.state === 'building'}>{t(`flow.card.state.${p.state}`)}</StatusPill>
      </Row>
      <Facts layout="spec" columns={1} items={items} />
    </AnatomySection>
  );
}
