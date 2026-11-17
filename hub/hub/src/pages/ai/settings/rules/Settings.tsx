// Settings → Rules & hooks: the checked rules and the hooks, for ONE place chosen in the bar above both (Place.tsx;
// a bar inside the rules would silently move the hooks with a folder picked there). They share the place because the settings
// chat serves one place at a time. Then the computer's files, folders & accounts switches (Features.tsx, not per place) and the
// folder path rules of the place shown (Where.tsx), under the same one provider: no second settings session.
import type { Target } from '@core';
import { Stack } from '@kit';
import AgentFeatures from './Features';
import { HooksSection } from './Hooks';
import { PlaceBar, PlaceProvider, usePlace } from './Place';
import { RulesSection } from './Rules';
import WhereAgentsWork from './Where';

export function RulesAndHooks({ computer, target, realm }: { computer: string; target: Target; realm: string }) {
  return (
    <PlaceProvider key={`${target.container.id}\u0000${realm}`} target={target} realm={realm}>
      <Stack gap={2}>
        <PlaceBar computer={computer} shared />
      </Stack>
      <RulesSection target={target} realm={realm} />
      <HooksSection computer={computer} />
      <AgentFeatures target={target} realm={realm} selfTrust={false} />
      <PlaceWhere />
    </PlaceProvider>
  );
}

/** The folder path rules of the place the bar shows: One folder's own; This realm, or no folder chosen yet, says to choose one. */
function PlaceWhere() {
  const { target, realm, at } = usePlace();
  return <WhereAgentsWork target={target} realm={realm} folder={at?.cwd ?? null} />;
}
