// The pane's band of unconfirmed forks: this computer and realm's fork records that no chat has replaced yet, with Check again and Hide, hidden ones
// included (labelled), and one line for each other computer and realm of the account that has some. It reads the stored records through kit/agent/forkList
// (no chat's engine), so a fork whose parent is gone, or whose record cannot be read, is still seen and checked here. Nothing is drawn when nothing is pending.
import { ForkPending, useForkList, useGo } from '@kit';
import { chatLink } from '../links';
import type { ChatsAt } from './data';

const RE24 = /^[0-9a-f]{24}$/;

export function ForkList({ at, handle, computerName }: { at: ChatsAt; handle: string; computerName: string }) {
  const go = useGo();
  const one = at.realm === 'global' || RE24.test(at.realm);
  const view = useForkList(handle && one ? { computer: handle, realm: at.realm } : null, handle ? { project: at.target.project.id, id: at.target.container.id, name: computerName, server: at.target.container.server_name } : null);
  if (!view) return null;
  return (
    <ForkPending
      rows={view.rows}
      check={view.check}
      hide={view.hide}
      hidden="label"
      elsewhere={view.elsewhere}
      onOpened={(sid) => { const href = chatLink({ computer: handle, realm: at.realm, sid }); if (href) go(href); }}
    />
  );
}
