// Ready, the second step of From GitHub: one program, what it is on
// the left and what will happen on the right, with Start on the same screen as what it starts. Nothing is sent before
// Start; the pane (GitHubPane) owns the run, the key in the address (`gh=`) and the way back to the Library.
//   - A library program shows its mark, name, tagline, kind, port and stack, why to pick it, and its facts (the repository,
//     how it opens, what it usually runs with, the licence as GitHub reported it, its project site, its tags), then that
//     Hoody doesn't make, review or update it. A pasted repository shows what is known: a "?" mark, owner/repo, "Not in
//     the library", the repository, and the stronger caution.
//   - No approvals choice here: every approval waits at its gate, where a gate that offers it can be allowed for
//     the rest of this install's session by the person's own press (GitHubPane).
//   - Not ready: a reason the pane already knows (the computer's status before Start, or the run's check
//     refusing after it) stands in the caution's place, in the warning tone, with its actions; Start stays, off while the
//     computer is known not to be ready, or as Try again after a refused check. No computer at all: the install box is the
//     kit's ComputerRequired, inline (no page header of its own), and there is no Start.
//   - Focus: the pane asks for the heading (a card was picked) or Start (Enter on an address) when Ready opens; Escape is
//     the Library button.
//   - Narrow (the pane's own width under 600 px): the program, then the install box, Start last and full width.
import { agentBaseFor, type Target } from '@core';
import { AnatomySection, Band, Button, ComputerMark, ComputerRequired, Facts, LinkButton, Row, Stack, StepList, Tag, TextButton, focusSection, followPageLink, useGo, usePageLink, useStrings, type Fact, type RealmColor } from '@kit';
import { useEffect, useRef } from 'react';
import type { Repo } from '../github';
import strings from '../strings.en.json';
import type { LibraryProgram } from './library';
import { repoPath } from './ready';
import { ProgramMark } from './marks';
import { BoardAddButton } from '../../board/links';
import type { Block } from './run';
import { links as computerLinks } from '../../computers/links';
import g from './github.module.css';

type T = ReturnType<typeof useStrings<typeof strings>>;

/** Why Start can't run now: the sentence, whether it may add that nothing was sent (a check refused after Start),
 *  and its way out. */
export interface ReadyBlock {
  text: string;
  notSent?: boolean;
  /** What the block offers (BlockActions). */
  act: Block;
  /** The computer whose Agent clears an `agent` block. */
  on?: Target | null;
}

/** The way out of a block only the Agent can clear (an update, its sign-in, another account): open the Agent in a new
 *  tab, or put it on the Board. Nothing without a computer or an address for its Agent. */
export function AgentWayOut({ on }: { on: Target | null | undefined }) {
  const t = useStrings(strings);
  const agent = on ? agentBaseFor(on.project, on.container) : '';
  if (!on || !agent) return null;
  return (
    <>
      <LinkButton size="sm" variant="secondary" href={agent} iconEnd="external">
        {t('gh.openAgent')}
      </LinkButton>
      <BoardAddButton computer={on} program="agent" what={t('gh.agent')} />
    </>
  );
}

/** A block's way out, as the run card's BlockView offers it: Open Programs (start its agent), Open Computers (start
 *  the computer, or see what is wrong with it), New computer when the agent doesn't answer, the Agent when only it
 *  can clear the block; nothing for the rest (Start is the Try again). */
export function BlockActions({ b, on }: { b: Block; on?: Target | null }) {
  const t = useStrings(strings);
  const go = useGo();
  const programs = usePageLink('programs');
  const computers = usePageLink('computers');
  return (
    <>
      {b.act === 'agent' ? <AgentWayOut on={on} /> : null}
      {b.act === 'programs' && programs ? <TextButton onPress={() => followPageLink(programs, go)}>{t('gh.openPrograms')}</TextButton> : null}
      {b.act === 'computers' && computers ? <TextButton onPress={() => followPageLink(computers, go)}>{t('gh.openComputers')}</TextButton> : null}
      {/* The create form is a place in the Hub's Computers page; no button when this load hides Computers. */}
      {b.key === 'unreachable' && computers ? (
        <TextButton onPress={() => (computers.kind === 'hub' ? go(computerLinks.create) : followPageLink(computers, go))}>{t('gh.newComputer')}</TextButton>
      ) : null}
    </>
  );
}

export interface ReadyProps {
  repo: Repo;
  /** The library program at this repository, when it is one. */
  program: LibraryProgram | undefined;
  /** The program's category tint (decoration only). */
  tint?: RealmColor | undefined;
  /** The computer it installs on, by name, and its colour mark. */
  computer: string;
  computerColor?: string | null | undefined;
  /** Start can run (a computer and a signed-in account, nothing known against it). */
  canStart: boolean;
  /** The run's checks are out (Start pressed): Start is busy. */
  checking?: boolean;
  /** In the caution's place: why it can't start. */
  block?: ReadyBlock | null;
  /** No computer at all: ComputerRequired in the install box, no Start. */
  noComputer?: boolean;
  onStart: () => void;
  /** Back to the Library (the ghost button and Escape). */
  onBack: () => void;
  narrow: boolean;
  /** Where focus goes when Ready opens: its heading (a card was picked), Start (Enter on an address), or nowhere (a link). */
  focus: 'heading' | 'start' | null;
}

/** The two parts' anchors (focusSection finds the heading by them). */
const WHAT = 'gh-ready-what';
const HOW = 'gh-ready-how';

const opensAs = (t: T, p: LibraryProgram): string =>
  p.kind === 'terminal' ? t('gh.ready.opens.terminal') : p.port !== null ? t(`gh.ready.opens.${p.kind}Port`, { port: p.port }) : t(`gh.ready.opens.${p.kind}`);

export function Ready({ repo, program, tint, computer, computerColor, canStart, checking, block, noComputer, onStart, onBack, narrow, focus }: ReadyProps) {
  const t = useStrings(strings);
  const root = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  // Once, when Ready opens (the pane keys it by what it shows).
  useEffect(() => {
    if (focus === 'start') startRef.current?.focus();
    else if (focus === 'heading') focusSection(WHAT);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on open only
  }, []);
  // Escape, from anywhere inside Ready, is the Library button, never the drawer's close: taken on the way up, before the
  // drawer (which listens through React at the root) hears it.
  const back = useRef(onBack);
  back.current = onBack;
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
      e.preventDefault();
      e.stopPropagation();
      back.current();
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, []);

  const address = `https://github.com/${repoPath(repo)}`;
  const shownRepo = `${repo.owner}/${repo.name}`;
  const facts: Fact[] = program
    ? [
        { label: t('gh.ready.why'), value: program.why, wide: true },
        { label: t('gh.ready.repository'), url: address },
        { label: t('gh.ready.opensAs'), value: opensAs(t, program) },
        { label: t('gh.ready.runWith'), value: program.stack },
        { label: t('gh.ready.licence'), value: program.license === 'custom' ? t('gh.ready.licenceOwn') : t('gh.ready.licenceAs', { licence: program.license }) },
        ...(program.homepage ? [{ label: t('gh.ready.site'), url: program.homepage }] : []),
        ...(program.tags.length ? [{ label: t('gh.ready.tags'), value: <Row gap={1} wrap>{program.tags.map((x) => <Tag key={x}>{x}</Tag>)}</Row> }] : []),
      ]
    : [{ label: t('gh.ready.repository'), url: address }];

  const left = (
    <div className={narrow ? undefined : g.readyWhat}>
      <AnatomySection id={WHAT} title={program ? program.name : shownRepo} description={program ? t('gh.ready.tagline', { tagline: program.tagline }) : t('gh.notInLibrary')} note={program ? t('gh.inLibrary') : undefined}>
        <Row gap={2} wrap>
          <ProgramMark name={program ? program.name : '?'} size="xl" tint={program ? tint : undefined} />
          {program ? <Tag>{t(`gh.lib.kind.${program.kind}`)}</Tag> : null}
          {program && program.port !== null ? <Tag>{t('gh.ready.port', { port: program.port })}</Tag> : null}
          {program ? <Tag>{program.stack}</Tag> : null}
        </Row>
        <Facts items={facts} columns={1} label={t('gh.ready.facts', { name: program ? program.name : shownRepo })} />
      </AnatomySection>
    </div>
  );
  const right = (
    <div className={narrow ? undefined : g.readyHow}>
      <AnatomySection id={HOW} title={t('gh.ready.install')}>
        {noComputer ? null : <Facts items={[{ label: t('gh.ready.installOn'), value: <><ComputerMark color={computerColor} /> {computer}</> }]} columns={1} />}
        <StepList label={t('gh.stepsHow')} groups={[{ where: t('gh.stepsHow'), items: [{ text: t('gh.step.clone') }, { text: t('gh.step.install') }, { text: t('gh.step.start') }] }]} />
        {noComputer ? (
          <ComputerRequired inline state="none" body={t('gh.noComputer')} />
        ) : (
          <>
            {block ? (
              <Band tone="warn" actions={<BlockActions b={block.act} on={block.on} />} /* noDetails: the reason the pane knows (the computer's status, or the run's check), mapped to its sentence; nothing was sent */>
                {block.notSent ? t('gh.blockNotSent', { reason: block.text }) : block.text}
              </Band>
            ) : (
              /* The one caution before Start: a pasted repository gets the stronger one. */
              <Band tone={program ? 'neutral' : 'warn'} /* noDetails: the Hub's own caution about the repo; nothing was sent */>
                {program ? t('gh.ready.caution', { repo: shownRepo, computer }) : t('gh.warning', { repo: shownRepo, computer })}
              </Band>
            )}
            <Row>
              <Button ref={startRef} variant="primary" onPress={onStart} isDisabled={!canStart || !!checking} busy={!!checking} fullWidth>
                {t('gh.start')}
              </Button>
            </Row>
          </>
        )}
      </AnatomySection>
    </div>
  );
  return (
    <div ref={root}>
      <Stack gap={3}>
        <Row>
          <Button variant="ghost" icon="arrow-left" onPress={onBack}>
            {t('gh.toLibrary')}
          </Button>
        </Row>
        {narrow ? (
          <Stack gap={4}>
            {left}
            {right}
          </Stack>
        ) : (
          <Row gap={4} align="start">
            {left}
            {right}
          </Row>
        )}
      </Stack>
    </div>
  );
}
