// The Board page: /board is the realm's active Board; /board/open/<handle>/<program>-<n>
// is one program full-area, /board/open/<handle>/port-<n> and /board/open/<handle>/script/<route> one port or script. A new core generation (realm or account switch) remounts the page, so every frame of
// the old set unloads and nothing of it shows under the new one.
// With the realm's keep-loaded choice on (Boards menu) the shell keeps the page loaded and hidden
// while the person is on another page (useKeepPage): frames keep running and do not reload on return.
import { useCore } from '@core';
import { CanvasPage, useKeepPage, useStrings, useSubPath } from '@kit';
import { useKeepLoaded } from './data';
import { parseView } from './links';
import { BoardView } from './parts/BoardView';
import { ProgramView } from './parts/ProgramView';
import strings from './strings.en.json';

export default function BoardPage() {
  const { gen } = useCore();
  useKeepPage(useKeepLoaded());
  return <BoardRoute key={gen} />;
}

function BoardRoute() {
  const t = useStrings(strings);
  const parts = useSubPath('/board');
  const target = parseView(parts);
  if (target) return <ProgramView target={target} />;
  return (
    <CanvasPage title={t('title')}>
      <BoardView />
    </CanvasPage>
  );
}
