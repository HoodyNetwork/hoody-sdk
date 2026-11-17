// The kit LoadScreen (kit/states/LoadScreen) in the gallery (/_kit?tab=loadscreen): the wait under way with its cards
// rotating and a question under the buttons, every step done, and a step that needs the person (a notice between the plate and the buttons). The steps
// are fixed here; on a page they are what the page read. The buttons do nothing.
import { Button } from '../controls/Button';
import { ItemList } from '../layouts/anatomy/ItemList';
import { AnatomySection } from '../layouts/anatomy/Section';
import { Stack } from '../layouts/Stack';
import { RadioGroup } from '../forms/RadioGroup';
import { Band } from '../states/Band';
import { LoadScreen, type LoadCard, type LoadStage, type LoadStageState } from '../states/LoadScreen';
import { useStrings } from '../strings';
import strings from './loadScreen.strings.en.json';

const noop = () => undefined;

export function LoadScreenTab() {
  const t = useStrings(strings);
  const stages = (b: LoadStageState, c: LoadStageState): LoadStage[] => [
    { id: 'a', label: t('step.a'), state: 'done' },
    { id: 'b', label: t('step.b'), state: b },
    { id: 'c', label: t('step.c'), state: c },
  ];
  const cards: LoadCard[] = [
    { id: 'one', icon: 'computer', title: t('card.one.title'), body: t('card.one.body') },
    { id: 'two', icon: 'files', title: t('card.two.title'), body: t('card.two.body') },
    { id: 'three', icon: 'bot', title: t('card.three.title'), body: t('card.three.body') },
  ];
  return (
    <Stack gap={6}>
      <AnatomySection id="load-busy" title={t('busy.title')} description={t('busy.desc')} state={{ kind: 'ready' }}>
        <LoadScreen
          title={t('head.busy')}
          status={t('status.busy')}
          stages={stages('now', 'next')}
          stagesLabel={t('steps')}
          items={cards}
          itemsLabel={t('cards')}
          nextTitle={t('next.title')}
          nextPending={t('next.pending')}
          actions={<Button variant="secondary" onPress={noop}>{t('skip')}</Button>}
          ask={{
            label: t('ask.label'),
            place: t('ask.place'),
            title: t('ask.title'),
            children: (ids) => (
              <RadioGroup
                aria-labelledby={ids.title}
                options={[
                  { value: 'a', label: t('ask.a') },
                  { value: 'b', label: t('ask.b') },
                ]}
                value="a"
                onChange={noop}
              />
            ),
            actions: <Button onPress={noop}>{t('ask.next')}</Button>,
            note: t('ask.note'),
          }}
        />
      </AnatomySection>
      <AnatomySection id="load-done" title={t('done.title')} state={{ kind: 'ready' }}>
        <LoadScreen
          title={t('head.done')}
          status={t('status.done')}
          stages={stages('done', 'done')}
          stagesLabel={t('steps')}
          items={cards}
          itemsLabel={t('cards')}
          actions={<Button onPress={noop}>{t('open')}</Button>}
          nextTitle={t('next.title')}
          next={
            <ItemList
              label={t('next.label')}
              items={[
                { id: 'a', leading: 'bot', title: t('next.a'), onOpen: noop },
                { id: 'b', leading: 'key', title: t('next.b'), onOpen: noop },
              ]}
            />
          }
        />
      </AnatomySection>
      <AnatomySection id="load-stuck" title={t('stuck.title')} state={{ kind: 'ready' }}>
        <LoadScreen
          title={t('head.stuck')}
          status={t('status.stuck')}
          stages={stages('stuck', 'next')}
          stagesLabel={t('steps')}
          notice={<Band tone="warn">{t('notice')}</Band>}
          actions={<Button variant="secondary" onPress={noop}>{t('retry')}</Button>}
        />
      </AnatomySection>
    </Stack>
  );
}
