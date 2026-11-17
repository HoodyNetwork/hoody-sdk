// Ready, the second step of From GitHub, in the terminal. What it shows, its words, its block and its Start are the
// web file's (Ready.tsx); the notes are at its top. Here the two parts always stack (the program, then the install
// box, Start last), as the web does when the pane is narrow. Focus on open: Start takes it itself when the pane asks
// for Start, the program's heading is revealed when it asks for the heading. Escape on the Library button or on Start
// is the Library button; anywhere else it is the surrounding drawer's.
import { agentBaseFor } from '@core';
import { AnatomySection, Band, Button, ComputerMark, ComputerRequired, Facts, LinkButton, Monogram, Row, Stack, StepList, Tag, TextButton, focusSection, followPageLink, useGo, usePageLink, useStrings, type Fact } from '@kit';
import { useEffect } from 'react';
import strings from '../strings.en.json';
import type { LibraryProgram } from './library';
import { repoPath } from './ready';
import { BoardAddButton } from '../../board/links';
import { links as computerLinks } from '../../computers/links';
import type * as Web from './Ready';

export type { ReadyBlock, ReadyProps } from './Ready';

type T = ReturnType<typeof useStrings<typeof strings>>;

export const AgentWayOut: typeof Web.AgentWayOut = ({ on }) => {
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
};

export const BlockActions: typeof Web.BlockActions = ({ b, on }) => {
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
};

/** The two parts' anchors (focusSection finds the heading by them). */
const WHAT = 'gh-ready-what';
const HOW = 'gh-ready-how';

const opensAs = (t: T, p: LibraryProgram): string =>
  p.kind === 'terminal' ? t('gh.ready.opens.terminal') : p.port !== null ? t(`gh.ready.opens.${p.kind}Port`, { port: p.port }) : t(`gh.ready.opens.${p.kind}`);

export const Ready: typeof Web.Ready = ({ repo, program, tint, computer, computerColor, canStart, checking, block, noComputer, onStart, onBack, focus }) => {
  const t = useStrings(strings);
  // Once, when Ready opens (the pane keys it by what it shows). Start takes the focus through its own autoFocus.
  useEffect(() => {
    if (focus === 'heading') focusSection(WHAT);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on open only
  }, []);

  const escape = (e: { key: string; preventDefault: () => void }) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    onBack();
  };

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

  return (
    <Stack gap={3}>
      <Row>
        <Button variant="ghost" icon="arrow-left" onPress={onBack} onKeyDown={escape}>
          {t('gh.toLibrary')}
        </Button>
      </Row>
      <Stack gap={4}>
        <AnatomySection id={WHAT} title={program ? program.name : shownRepo} description={program ? t('gh.ready.tagline', { tagline: program.tagline }) : t('gh.notInLibrary')} note={program ? t('gh.inLibrary') : undefined}>
          <Row gap={2} wrap>
            <Monogram name={program ? program.name : '?'} size="xl" tint={program ? tint : undefined} />
            {program ? <Tag>{t(`gh.lib.kind.${program.kind}`)}</Tag> : null}
            {program && program.port !== null ? <Tag>{t('gh.ready.port', { port: program.port })}</Tag> : null}
            {program ? <Tag>{program.stack}</Tag> : null}
          </Row>
          <Facts items={facts} columns={1} label={t('gh.ready.facts', { name: program ? program.name : shownRepo })} />
        </AnatomySection>
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
                <Button variant="primary" onPress={onStart} isDisabled={!canStart || !!checking} busy={!!checking} fullWidth autoFocus={focus === 'start'} onKeyDown={escape}>
                  {t('gh.start')}
                </Button>
              </Row>
            </>
          )}
        </AnatomySection>
      </Stack>
    </Stack>
  );
};
