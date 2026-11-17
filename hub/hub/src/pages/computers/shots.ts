// Named screenshot states of the computers page (`bun run hub:shots --page computers`).
import type { Shots } from '@app/shots.types';

const sel = '?sel=atlas.00a1';

export default [
  { name: 'many', extra: ['390-dark'] },
  // A sign-in that may not restart: the failed computer (ember) shows Restart off, its reason on hover.
  { name: 'no-restart', state: 'noRestart', act: [{ hover: 'role=button[name="Restart"]' }, { waitFor: 'css=[data-hub-reason]' }], extra: ['390-dark'] },
  { name: 'long', state: 'long' },
  { name: 'loading', state: 'loading' },
  { name: 'error', state: 'error' },
  { name: 'limited', state: 'limited' },
  { name: 'empty-invite', state: 'empty' },
  { name: 'empty-provisioning', state: 'emptyProvisioning' },
  { name: 'empty-capacity', state: 'emptyCapacity' },
  { name: 'empty-expired', state: 'emptyExpired' },
  { name: 'empty-reinstalled', state: 'emptyReinstalled' },
  { name: 'empty-reinstalled-server', state: 'emptyReinstalledServer' },
  { name: 'detail-overview', path: sel, extra: ['390-dark'] },
  // Overview: 3 and 30 realms on one line, the list of all 30, and the wide pane (list hidden).
  { name: 'detail-overview-tile-hover', path: sel, act: [{ hover: 'role=button[name=/^Terminal/]' }] },
  { name: 'detail-overview-realms3', state: 'realms3', path: sel, act: [{ hover: 'role=heading[name="Details"]' }] },
  { name: 'detail-overview-realms30', state: 'realms30', path: sel, act: [{ hover: 'role=heading[name="Details"]' }] },
  { name: 'detail-overview-realms-list', state: 'realms30', path: sel, click: 'role=button[name=/^(Show ids|\\+[0-9]+ more): all 30 realms of atlas/]' },
  // List hidden (the \\ shortcut; 768 and 390 have no list beside the detail, so there it opens the 3-realm list).
  { name: 'detail-overview-nolist', state: 'realms3', path: sel, act: [{ waitFor: 'role=heading[name="Details"]' }, { press: 'Backslash' }, { click: 'role=button[name=/^(Show ids|\\+[0-9]+ more): all 3 realms of atlas/]' }] },
  { name: 'detail-overview-stopped', path: '?sel=cedar.00c3' },
  // A computer whose server ended: the band over the Overview, with the date.
  { name: 'detail-overview-expired', state: 'detailExpired', path: sel, extra: ['1350-dark'] },
  { name: 'detail-connect', path: `${sel}&tab=connect`, extra: ['1350-light', '390-dark'] },
  { name: 'detail-run', path: `${sel}&tab=run` },
  { name: 'detail-run-exit-error', state: 'runNonZero', path: `${sel}&tab=run`, click: 'role=textbox[name="Command"]', keys: ['n', 'o', 'p', 'e', 'Enter'] },
  { name: 'detail-run-failed', state: 'runFailed', path: `${sel}&tab=run`, click: 'role=textbox[name="Command"]', keys: ['l', 's', 'Enter'] },
  { name: 'detail-run-unknown', state: 'pendingOps', path: `${sel}&tab=run`, click: 'role=textbox[name="Command"]', keys: ['l', 's', 'Enter'] },
  { name: 'detail-programs', path: `${sel}&tab=programs` },
  { name: 'detail-advanced', path: `${sel}&tab=ports` },
  { name: 'detail-no-realm', state: 'noRealm', realm: 'all', path: sel },
  { name: 'detail-no-realm-note', state: 'noRealm', realm: 'all', path: sel, click: 'role=button[name="What no realm means"]' },
  { name: 'detail-pending', state: 'pendingOps', path: '?sel=cedar.00c3', click: 'Start' },
  { name: 'detail-failed', state: 'failedOps', path: '?sel=cedar.00c3', click: 'Start' },
  { name: 'detail-no-usage', state: 'noUsage', path: sel, click: 'css=label:has-text("Show usage")' },
  { name: 'bulk-bar', act: [{ click: 'css=[data-row-id]' }, { press: 'Escape' }, { press: 'x' }] },
  // The list's Access cell (the column shows at 1920; narrower widths drop it).
  { name: 'list-access-unchecked', state: 'scopeUnknown' },
  { name: 'access-unchecked', state: 'scopeUnknown', path: sel, click: 'role=button[name=/^Access of atlas/]' },
  { name: 'detail-access-unchecked', state: 'scopeUnknown', path: sel, act: [{ hover: 'role=heading[name="Details"]' }] },
  // Get a computer: the plate saying what you get, the computer, where it runs, More options. Then each state of it.
  { name: 'create-drawer', click: 'Get a computer', extra: ['1350-dark'] },
  { name: 'create-all-realms', realm: 'all', click: 'Get a computer' },
  { name: 'create-more', act: [{ click: 'Get a computer' }, { click: 'role=button[name=/^More options/]' }, { hover: 'role=radiogroup[name="Colour"]' }] },
  { name: 'create-more-access', act: [{ click: 'Get a computer' }, { click: 'role=button[name=/^More options/]' }, { click: 'role=button[name="Add variable"]' }, { hover: 'role=button[name="Add variable"]' }] },
  { name: 'create-realms', act: [{ click: 'Get a computer' }, { click: 'role=button[name=/^More options/]' }, { click: 'role=checkbox[name=/^Lab/]' }] },
  // A long realm list: about six rows show inside a frame, the rest scroll in it.
  { name: 'create-many-realms', state: 'createManyRealms', act: [{ click: 'Get a computer' }, { click: 'role=button[name=/^More options/]' }, { hover: 'role=dialog >> role=group[name="Other realms"]' }] },
  { name: 'create-realms-all', realm: 'all', act: [{ click: 'Get a computer' }, { click: 'role=button[name=/^More options/]' }, { click: 'role=checkbox[name=/^Personal/]' }] },
  { name: 'create-kit-off', act: [{ click: 'Get a computer' }, { click: 'role=button[name=/^More options/]' }, { click: 'role=dialog >> [data-sg-row]:has(input[role="switch"]) >> span[aria-hidden="true"]' }, { waitFor: 'role=alertdialog' }] },
  { name: 'create-copy-pick', act: [{ click: 'Get a computer' }, { click: 'role=dialog >> role=radiogroup[name="Start from"] >> text="A copy of one of yours"' }] },
  { name: 'create-copy', act: [{ click: 'Get a computer' }, { click: 'role=dialog >> role=radiogroup[name="Start from"] >> text="A copy of one of yours"' }, { click: 'role=button[name=/Copy from$/]' }, { click: 'role=radio[name=/^cedar/] >> nth=-1' }, { waitFor: 'role=button[name="Make copy"]' }] },
  { name: 'create-new-project', act: [{ click: 'Get a computer' }, { click: 'role=button[name="New project in this realm"]' }, { fill: 'role=textbox[name="New project\'s name"]', text: 'Night jobs' }, { hover: 'role=button[name="Make project"]' }] },
  { name: 'create-no-project', state: 'projectOutsideOnly', click: 'Get a computer' },
  // No computer yet: nothing to copy, so no Start from. Then an account with no server left.
  { name: 'create-first', state: 'emptyCapacity', path: '?get=1' },
  { name: 'create-no-server', state: 'emptyReinstalled', path: '?get=1' },
  // One server full (the form picks another and offers more room), then every server full (nothing can be sent).
  { name: 'create-server-full', state: 'slotsFull', click: 'Get a computer' },
  { name: 'create-no-room', state: 'createNoRoom', click: 'Get a computer' },
  { name: 'create-servers-error', state: 'serversError', click: 'Get a computer' },
  { name: 'create-name-error', act: [{ click: 'Get a computer' }, { fill: 'role=dialog >> role=textbox[name="Name"]', text: 'a!' }, { click: 'role=button[name="Get computer"]' }] },
  { name: 'create-failed', state: 'failedOps', act: [{ click: 'Get a computer' }, { click: 'role=button[name="Get computer"]' }, { waitFor: 'You already have a computer with that name. Pick another name.' }] },
  { name: 'create-held', state: 'pendingOps', act: [{ click: 'Get a computer' }, { click: 'role=button[name="Get computer"]' }] },
  { name: 'row-menu', path: sel, click: 'Actions for atlas' },
  // The SSH key, realms and delete flows open from the computer's menu.
  { name: 'ssh-drawer', path: sel, act: [{ click: 'Actions for atlas' }, { click: 'role=menuitem[name="SSH key…"]' }] },
  { name: 'realms-drawer', path: sel, act: [{ click: 'Actions for atlas' }, { click: 'role=menuitem[name="Realms…"]' }] },
  { name: 'domain-drawer', path: `${sel}&tab=ports`, click: 'role=button[name="Use your own domain"]' },
  { name: 'alias-drawer', path: `${sel}&tab=ports`, click: 'role=table[name="Ports"] >> css=tr:has-text("3000") >> role=button[name="Create alias"]' },
  { name: 'alias-drawer-why', path: `${sel}&tab=ports`, act: [{ click: 'role=table[name="Ports"] >> css=tr:has-text("3000") >> role=button[name="Create alias"]' }, { click: 'role=button[name="Why does the suggested name end in random letters?"]' }] },
  { name: 'delete-confirm', path: sel, act: [{ click: 'Actions for atlas' }, { click: 'role=menuitem[name="Delete…"]' }] },
  { name: 'servers', path: '/servers' },
  { name: 'servers-many', state: 'serversMany', path: '/servers' },
  { name: 'servers-error', state: 'serversError', path: '/servers' },
  { name: 'network-direct', state: 'netDirect', path: `${sel}&tab=network` },
  // A link to the firewall (Permissions tab) lands with its heading just under the sticky header and tab bar.
  { name: 'fw-landing', state: 'netDirect', path: `${sel}&tab=network&at=firewall`, act: [{ waitFor: 'css=:is(tr, [role="row"]):has-text("3306")' }] },
  { name: 'fw-list', state: 'netDirect', path: `${sel}&tab=network`, act: [{ waitFor: 'css=:is(tr, [role="row"]):has-text("3306")' }, { hover: 'role=heading[name="Firewall"]' }] },
  // Internet access: allowed, the confirm before blocking, blocked, and partly blocked.
  { name: 'ni-off', state: 'netDirect', path: `${sel}&tab=network`, act: [{ waitFor: 'role=button[name="Block internet access"]' }, { hover: 'role=heading[name="Internet access"]' }] },
  { name: 'ni-ask', state: 'netDirect', path: `${sel}&tab=network`, act: [{ click: 'role=button[name="Block internet access"]' }, { waitFor: 'role=alertdialog' }] },
  { name: 'ni-on', state: 'netNoInternet', path: `${sel}&tab=network`, act: [{ waitFor: 'role=button[name="Allow internet access"]' }, { hover: 'role=heading[name="Internet access"]' }] },
  { name: 'ni-group', state: 'netNoInternet', path: `${sel}&tab=network`, act: [{ waitFor: 'text=Blocks internet access: 3 rules' }, { hover: 'text=Blocks internet access: 3 rules' }] },
  { name: 'ni-partial', state: 'netNoInternetPartial', path: `${sel}&tab=network`, act: [{ waitFor: 'text=Finish blocking' }, { hover: 'role=heading[name="Internet access"]' }] },
  { name: 'fw-add', state: 'netDirect', path: `${sel}&tab=network`, click: 'role=button[name="Add a rule"]' },
  { name: 'fw-add-myip', state: 'netDirect', path: `${sel}&tab=network`, act: [{ click: 'role=button[name="Add a rule"]' }, { click: 'role=button[name="Add my IP"]' }, { waitFor: 'Added' }] },
  { name: 'fw-presets', state: 'netDirect', path: `${sel}&tab=network`, act: [{ click: 'role=group[name="Firewall"] >> role=button[name="More actions"]' }, { waitFor: 'role=menuitem[name="Block a port…"]' }] },
  { name: 'fw-agent', state: 'netDirect', path: `${sel}&tab=network`, act: [{ click: 'role=button[name=/^Ask the Agent about the firewall/]' }, { fill: 'role=textbox[name=/Tell the Agent/]', text: 'Block outbound mail except to my relay' }] },
  { name: 'access-ask', path: `${sel}&tab=permissions`, act: [{ click: 'role=button[name=/^Ask the Agent about access/]' }, { waitFor: 'role=button[name="Ask the Agent"]' }] },
  // Who can open (the Permissions tab): the verdict over the choice, the address under Only my IP, the new-person form,
  // and rules that come from the project (the verdict, then where they come from).
  { name: 'access-drawer', path: `${sel}&tab=permissions`, act: [{ waitFor: 'role=tabpanel >> role=radiogroup[name="Who can open the programs"]' }] },
  { name: 'access-drawer-myip', path: `${sel}&tab=permissions`, act: [{ click: 'role=tabpanel >> role=radiogroup[name="Who can open the programs"] >> text="Only my IP"' }, { waitFor: 'text=Access rules take IPv4 addresses only.' }] },
  { name: 'access-drawer-person', path: `${sel}&tab=permissions`, act: [{ click: 'role=tabpanel >> role=radiogroup[name="Who can open the programs"] >> text="Only people or keys I pick"' }, { click: 'role=button[name="Add a person"]' }, { waitFor: 'role=dialog[name="New person"]' }] },
  { name: 'access-drawer-project', state: 'useRulesApplied', path: `${sel}&tab=permissions`, act: [{ waitFor: 'role=heading[name="Where these rules come from"]' }] },
  // People and key links with the widest name the form takes (32 letters, no place to break): the name shows whole at
  // every width (it wraps in the column table and in list rows).
  {
    name: 'access-people-long',
    path: '?sel=cedar.00c3&tab=permissions',
    extra: ['1350-light', '1350-dark', '768-dark', '390-dark'],
    act: [
      { click: 'role=tabpanel >> role=radiogroup[name="Who can open the programs"] >> text="Only people or keys I pick"' },
      { click: 'role=button[name="Add a person"]' },
      { fill: 'role=dialog >> role=textbox[name="Name"]', text: 'm'.repeat(32) },
      { click: 'role=dialog >> text="All programs"' },
      { click: 'role=dialog >> role=button[name="Continue"]' },
      { click: 'role=alertdialog >> role=button[name="Add"]' },
      { waitFor: 'role=dialog >> role=button[name="Done"][disabled=false]' },
      { click: 'role=dialog >> role=button[name="Done"]' },
      { waitFor: 'role=tabpanel >> role=table[name="People and key links"]' },
      { hover: 'role=tabpanel >> role=table[name="People and key links"] >> css=[data-row-id]' },
    ],
  },
  // Wide: the toolbar's own button. Tight (768, 390): the toolbar folds it into its menu, so the menu opens first.
  { name: 'list-ask', act: [
    // The rows first: until they are in, the toolbar may still be deciding what folds.
    { waitFor: 'text=borealis' },
    { click: 'css=button:has-text("Ask the Agent"), button[aria-label="View options"]' },
    { click: 'xpath=(//*[@role="menuitem" and contains(normalize-space(.), "Ask the Agent")] | //*[@role="dialog"]//h2)[1]' },
    { waitFor: 'role=button[name="Ask the Agent"]' },
  ] },
  { name: 'fw-delete', state: 'netDirect', path: `${sel}&tab=network`, act: [{ click: 'css=:is(tr, [role="row"]):has-text("3306") >> role=button[name="Row actions"]' }, { click: 'role=menuitem[name=/^Delete/]' }] },
  { name: 'network-how', state: 'netDirect', path: `${sel}&tab=network`, click: 'Use it in your browser' },
  { name: 'network-scripts', state: 'netDirect', path: `${sel}&tab=network`, click: 'For scripts' },
  { name: 'network-how-chrome', state: 'netDirect', path: `${sel}&tab=network`, act: [{ click: 'Use it in your browser' }, { click: 'role=dialog >> role=button[name=/Browser$/]' }, { click: 'role=option[name="Chrome and Edge"]' }] },
  { name: 'network-how-system', state: 'netDirect', path: `${sel}&tab=network`, act: [{ click: 'Use it in your browser' }, { click: 'role=dialog >> role=button[name=/Browser$/]' }, { click: 'role=option[name="Whole computer"]' }] },
  { name: 'network-how-exit', state: 'netDirect', path: `${sel}&tab=network`, act: [{ click: 'Use it in your browser' }, { click: 'role=tab[name="Change the exit"]' }] },
  { name: 'network-change', state: 'netDirect', path: `${sel}&tab=network`, click: 'Use another exit…' },
  { name: 'network-change-proxy', state: 'netDirect', path: `${sel}&tab=network`, act: [{ click: 'Use another exit…' }, { click: 'role=dialog >> role=radiogroup[name="Leave from"] >> text="Your own proxy"' }] },
  { name: 'network-change-computer', state: 'netDirect', path: `${sel}&tab=network`, act: [{ click: 'Use another exit…' }, { click: 'role=dialog >> role=radiogroup[name="Leave from"] >> text="Another computer of yours"' }] },
  { name: 'network-active', state: 'netActive', path: `${sel}&tab=network` },
  { name: 'network-local', state: 'netLocal', path: `${sel}&tab=network` },
  { name: 'network-old', state: 'netOld', path: `${sel}&tab=network` },
  { name: 'network-unavailable', state: 'netUnavailable', path: `${sel}&tab=network` },
  { name: 'network-unnamed', state: 'netUnnamed', path: `${sel}&tab=network` },
  { name: 'network-unreadable', state: 'netReadFailed', path: `${sel}&tab=network` },
  { name: 'network-stopped', state: 'netDirect', path: '?sel=cedar.00c3&tab=network' },
  { name: 'network-via', state: 'netVia', path: `${sel}&tab=network` },
  // The Storage tab, empty, with rows, read-only, and on a stopped computer.
  { name: 'storage-empty', path: `${sel}&tab=storage` },
  { name: 'storage-rows', state: 'storageRows', path: `${sel}&tab=storage` },
  { name: 'storage-limited', state: 'limited', path: `${sel}&tab=storage` },
  { name: 'storage-stopped', path: '?sel=cedar.00c3&tab=storage' },
  // Files waiting to upload, and the drawer listing them (verdict with its facts: files, size, why held).
  { name: 'storage-waiting', state: 'storageWaiting', path: `${sel}&tab=storage` },
  { name: 'storage-held-files', state: 'storageWaiting', path: `${sel}&tab=storage`, act: [{ click: 'css=#storage-waiting [data-row-id] >> role=button[name="Row actions"]' }, { click: 'role=menuitem[name=/^Show files/]' }, { waitFor: 'role=dialog >> text=Why held' }] },
  // The Lab realm (fixture world) holds no computer; add one from another realm.
  { name: 'empty-elsewhere', state: 'emptyElsewhere', realm: 'f3f3f3f3f3f3f3f3f3f3f3f3' },
  { name: 'import-picker', state: 'emptyElsewhere', realm: 'f3f3f3f3f3f3f3f3f3f3f3f3', click: 'Add one you already have' },
  { name: 'import-realms', state: 'emptyElsewhere', realm: 'f3f3f3f3f3f3f3f3f3f3f3f3', act: [{ click: 'role=button[name="Add one you already have"]' }, { click: 'role=radio[name=/atlas/]' }, { click: 'role=button[name="Next"]' }] },
  { name: 'import-down', state: 'emptyElsewhereDown', realm: 'f3f3f3f3f3f3f3f3f3f3f3f3', click: 'Add one you already have' },
  // This realm lists only Home base, but its computers belong to all three projects.
  { name: 'projects-outside', state: 'projectOutside', path: '/projects' },
  // Project permissions > Access rules: the choice is one setting row; Only my IP shows its address under it.
  { name: 'projects-rules-myip', state: 'rulesChangeOpen', path: '/projects', act: [{ click: 'role=button[name="Row actions"] >> nth=0' }, { click: 'role=menuitem[name=/^Permissions/]' }, { click: 'role=tab[name="Access rules"]' }, { click: 'role=dialog >> role=radiogroup[name="Change project rules"] >> text="Only my IP"' }, { waitFor: 'text=Access rules take IPv4 addresses only.' }] },
  { name: 'detail-overview-outside', state: 'projectOutside', path: '?sel=borealis.00b2' },
  // A copy goes into a project of the shown realm; a source project outside it owes a pick, and a realm
  // refusal says what to change.
  { name: 'copy-pick-owed', state: 'projectOutside', path: '?sel=borealis.00b2', act: [{ click: 'Actions for borealis' }, { click: 'role=menuitem[name="Make a copy…"]' }] },
  { name: 'from-pick-owed', state: 'projectOutside', path: '?sel=borealis.00b2&tab=backups', act: [{ click: 'role=table[name="Snapshots"] >> role=button[name="Row actions"] >> nth=0' }, { click: 'role=menuitem[name="New computer from this…"]' }] },
  { name: 'copy-realm-refused', state: 'copyRealmRefused', path: sel, act: [{ click: 'Actions for atlas' }, { click: 'role=menuitem[name="Make a copy…"]' }, { click: 'role=button[name="Make copy"]' }] },
  // No project of this realm for the copy: make one from the Copy drawer, then back to the same Copy.
  { name: 'copy-new-project', state: 'projectOutsideOnly', path: '?sel=borealis.00b2', act: [{ click: 'Actions for borealis' }, { click: 'role=menuitem[name="Make a copy…"]' }] },
  { name: 'copy-new-project-open', state: 'projectOutsideOnly', path: '?sel=borealis.00b2', act: [{ click: 'Actions for borealis' }, { click: 'role=menuitem[name="Make a copy…"]' }, { click: 'role=button[name="New project in this realm"]' }] },
] satisfies Shots;
