// A realm asked for by a link: pages never switch the realm, so a page that wants
// the person in another realm (the New realm flow's "Open <name>", the Keys share link) links with
// ?open_realm=<24-hex id> (OPEN_REALM), on any hub route, and the shell switches. The value `all` asks for the All realms
// view (a Global folder's Open Connections: Global shows only there); it goes through the same switch, with no list check.
// - The key is the shell's own. A page's ?realm= (the Computers Realm filter, Bots byRealm) is the page's state: the
//   shell never waits on it and never takes it out of the address (links.spec.ts); it reads it only on the
//   Keys share link (below).
// - Switched to: an id the session can use that is not the realm shown. When the list lacks it (a realm made a moment
//   ago), the list is read once more first. `all` is no list entry: it needs no read, and shown already it is just dropped.
// - Until that ends the page the route shows waits (shell/pageHost.tsx ShownPageWait), so it never renders in the realm
//   left; it mounts once, after. A page kept loaded stays loaded and hidden meanwhile: an id that turns out unknown, or
//   a switch core refuses, leaves it as it was (a switch that happens drops every kept page, as any realm switch does).
// - The param leaves the address (replace: Back never repeats it; the other params and the hash stay) once the realm
//   shown is the one it names: at once when it already is, else after the switch. It is taken out of the address as it
//   is once committed (the history's entry, after any navigation in flight: one replace of that entry, its path,
//   params and hash together), never by writing back the address it read: a page may have changed the address since
//   (the Board drops an Add link at once), and that change stays; with nothing left to remove it
//   navigates nowhere.
//   Otherwise it stays, so a page that acts for the realm a link names (the Keys share link) sees that the realm shown
//   is another one and refuses.
// - The Keys share link (shareRoute) whose page ?realm= (a link made before open_realm) names another realm than the
//   param contradicts itself: its share=1 leaves with the param, so the Keys page opens nothing, whichever realm is
//   shown by the time it reads the link (the realm menu may switch again before the page loads). ?realm= stays.
// - Still unknown, or the list cannot be read: a notice, no switch. A switch core refuses has core's own notice.
// - A pinned token session or a value that is neither a realm id nor exactly `all`: nothing.
// - The newest link owns the work. A newer link, or leaving for a place without the param, cancels the older link's
//   switch in core (it never commits) and ends its wait; an older request neither switches nor gives a notice. A
//   switch started elsewhere meanwhile (the realm menu, even to the same realm) or an account change wins over the
//   link (core's switchRevision moves; its load() falling back from a realm gone does not).
// - A failure is the request's own: coming back to the same link later waits from its first render and tries again.
import { Skeleton } from '@kit/states/States';
import { createUseRealmParam, type BrowserMoves } from './realmParam.shared';

export { OPEN_REALM } from './realmParam.shared';

// A guard that refuses a Back returns the browser to the entry after the router has resolved: the browser's own move
// wakes the check.
const popstate: BrowserMoves = (wake) => {
  window.addEventListener('popstate', wake);
  return () => window.removeEventListener('popstate', wake);
};

/** Whether the page area waits for a realm a link asked for. `shareRoute`: the Keys page's shared tab path, when the
 *  Keys page is served (the place shell/Switchers' share link goes to). */
export const useRealmParam: (shareRoute?: string) => boolean = createUseRealmParam(popstate);

/** What the page area shows while it waits. The switch line (AppShell) is the one announcement, so the skeleton's
 *  own loading status is hidden here. */
export function RealmWait() {
  return (
    <div aria-hidden="true" data-hub-realm-wait="">
      <Skeleton variant="detail" rows={8} />
    </div>
  );
}
