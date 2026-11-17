// The drafty-panel kit pieces in the gallery (/_kit?tab=pieces #panel-steps): a StepList of two
// places (In the chat app with its Open link, Back here with a control at a row's end), an inline CodeLine in a row, a long
// row and a row with a note, a closed Why that ends with its FAQ link, and Facts as a spec sheet; then a Verdict with its
// one marked phrase and its segments, a state Verdict (the ink plate) with its CutFrame edge hook, a calm
// Verdict with no progress, a Track with every state (done, now in warn, later and optional, wait, unknown) whose open
// step holds the StepList, and a flat Track. kit3.tsx mounts it; kit/data/StepList.spec.ts and kit/data/Track.spec.ts
// read it.
import { Button } from '../controls/Button';
import { Facts, Tag } from '../data/Display';
import { CodeLine } from '../data/Ids';
import { StepList } from '../data/StepList';
import { Track, TrackStep } from '../data/Track';
import { AnatomySection } from '../layouts/anatomy/Section';
import { Why } from '../layouts/Why';
import { Verdict, VerdictMark } from '../states/Verdict';
import { useStrings } from '../strings';
import strings from './drafty.strings.en.json';

/** Gallery-only: the bot handle and the command the rows use. */
const BOT = '@shop_atlas_bot';
/** Gallery-only: a value too long for a phone row, so its CodeLine ends in an ellipsis. */
const CNAME = 'shop-atlas-7f3c9a.edge-routes.example-hosting.net';

export function DraftyPieces() {
  const t = useStrings(strings);
  const bold = (text: string) => {
    const [before, word, after] = text.split('**');
    return (
      <>
        {before}
        <strong>{word}</strong>
        {after}
      </>
    );
  };
  const steps = (
    <StepList
      label={t('steps.label')}
      groups={[
        {
          where: t('where.app'),
          open: { label: t('open.botfather'), url: 'https://t.me/BotFather' },
          items: [
            {
              id: 'send',
              text: (
                <>
                  {t('s.send')} <CodeLine value="/setprivacy" copyLabel={t('codeline.label')} />
                </>
              ),
            },
            {
              id: 'pick',
              text: (
                <>
                  {t('s.pick')} <CodeLine value={BOT} />
                </>
              ),
            },
            { id: 'disable', text: bold(t('s.disable')), note: t('s.disable.note') },
          ],
        },
        {
          where: t('where.here'),
          items: [
            { id: 'check', text: t('s.check'), act: <Button size="sm">{t('s.check.act')}</Button> },
            {
              id: 'record',
              text: (
                <>
                  {t('s.record')} <CodeLine value={CNAME} />
                </>
              ),
            },
            { id: 'long', text: t('s.long') },
          ],
        },
      ]}
    />
  );
  return (
    <AnatomySection id="panel-steps" title={t('title')} state={{ kind: 'ready' }}>
      <div data-specimen="verdict">
        <Verdict
          label={t('verdict.label')}
          count={t('verdict.count')}
          segments={['done', 'done', 'limited', 'done', 'optional', 'unknown']}
          next={t('verdict.next')}
        >
          {t('verdict.s1')}
          <VerdictMark tone="warn">{t('verdict.mark')}</VerdictMark>
          {t('verdict.s2')}
        </Verdict>
      </div>
      <div data-specimen="verdict-state">
        <Verdict tone="state" label={t('state.label')} count={t('state.count')} segments={['blocking', 'done', 'todo', 'todo', 'optional']} next={t('state.next')}>
          {t('state.s1')}
          <VerdictMark tone="danger">{t('state.mark')}</VerdictMark>
          {t('state.s2')}
        </Verdict>
        {/* The CutFrame edge hook, with the values the state plate gives it. */}
        <Facts
          layout="spec"
          label={t('hook.label')}
          items={[
            { label: t('hook.name'), value: '--cut-edge', mono: true },
            { label: t('hook.default'), value: 'var(--hx-panel-line)', mono: true },
            { label: t('hook.state'), value: 'var(--hx-verdict-edge)', mono: true },
            { label: t('hook.light'), value: t('hook.light.v') },
            { label: t('hook.dark'), value: t('hook.dark.v') },
          ]}
        />
      </div>
      <div data-specimen="verdict-calm">
        <Verdict label={t('calm.label')}>{t('calm.s')}</Verdict>
      </div>
      <div data-specimen="track">
        <Track label={t('track.label')}>
          <TrackStep id="connect" state="done" name={t('t.connect')} result={t('t.connect.r')} />
          <TrackStep id="owner" state="done" name={t('t.owner')} result={t('t.owner.r')} />
          <TrackStep
            id="privacy"
            state="now"
            tone="warn"
            optional
            name={t('t.privacy')}
            why={t('t.privacy.why')}
            tags={<Tag tone="warn">{t('t.privacy.tag')}</Tag>}
            foot={{
              say: t('t.privacy.say'),
              primary: <Button variant="primary">{t('t.privacy.primary')}</Button>,
              secondary: <Button variant="ghost">{t('t.privacy.later')}</Button>,
            }}
          >
            <StepList
              label={t('t.steps.label')}
              groups={[
                {
                  where: t('where.app'),
                  open: { label: t('open.botfather'), url: 'https://t.me/BotFather' },
                  items: [
                    {
                      id: 'send',
                      text: (
                        <>
                          {t('s.send')} <CodeLine value="/setprivacy" />
                        </>
                      ),
                    },
                    { id: 'disable', text: bold(t('s.disable')), note: t('s.disable.note') },
                  ],
                },
                { where: t('where.here'), items: [{ id: 'restart', text: t('t.steps.restart'), note: t('t.steps.restart.note') }] },
              ]}
            />
          </TrackStep>
          <TrackStep id="group" state="done" name={t('t.group')} result={t('t.group.r')} />
          <TrackStep id="home" state="later" optional name={t('t.home')} why={t('t.home')} />
          <TrackStep id="reach" state="unknown" name={t('t.reach')} />
          <TrackStep id="answer" state="wait" name={t('t.answer')} />
        </Track>
      </div>
      <div data-specimen="track-flat">
        <Track label={t('flat.label')} flat defaultOpen="run">
          <TrackStep id="what" state="done" name={t('f.what')} result={t('f.what.r')} />
          <TrackStep
            id="run"
            state="now"
            name={t('f.run')}
            why={t('f.run.why')}
            foot={{ say: t('f.run.say'), primary: <Button variant="primary">{t('f.run.primary')}</Button> }}
          />
        </Track>
      </div>
      <div data-specimen="step-list">{steps}</div>
      <div data-specimen="why">
        <Why question={t('why.q')} faq={{ item: { id: 'groupPrivacy', q: t('why.faq.q'), a: t('why.faq.a') }, label: t('why.faq.label') }}>
          {t('why.a')}
        </Why>
      </div>
      <div data-specimen="facts-spec">
        <Facts
          layout="spec"
          label={t('facts.label')}
          items={[
            { label: t('f.handle'), value: BOT, mono: true, copy: BOT },
            { label: t('f.mode'), value: t('f.mode.v') },
            { label: t('f.people'), value: t('f.people.v') },
            { label: t('f.created'), value: t('f.created.v') },
            { label: t('f.token'), value: t('f.token.v') },
          ]}
        />
      </div>
    </AnatomySection>
  );
}
