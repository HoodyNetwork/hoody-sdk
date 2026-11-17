// Named screenshot states of the Files page (`bun run hub:shots --page files`). Each renders its own case.
import type { ActStep, Shots } from '@app/shots.types';

const A = '?a=atlas.00a1';
const ADA = `${A}&ap=%2Fhome%2Fada`;
// Steps scoped to the left pane and to one row.
const NEW = { click: 'role=region[name="Left pane"] >> role=button[name="New folder"]' } as const;
const menu = (row: string, item: string) => [
  { click: `role=region[name="Left pane"] >> role=row[name=/${row}/] >> role=button[name=/Row actions/]` },
  { click: `role=menuitem[name="${item}"]` },
] as const;
const DIALOG = { waitFor: 'css=[role=dialog], [role=alertdialog]' } as const;
// A row's menu (rows are matched by text: selectable rows have no accessible name in the browser).
const roMenu = (row: string) => [
  { click: `role=region[name="Left pane"] >> tr:has-text("${row}") >> role=button[name=/Row actions/]` },
] as const;
const FIND = { click: 'role=region[name="Left pane"] >> role=button[name="Find"]' } as const;
// Pane A's Show switch set to Icons at every width: in its toolbar, or in its View options menu when the toolbar is
// tight (390). Each step clicks whichever of two targets is there (`internal:or`, what locator.or() compiles to); at
// a width with the switch in the toolbar the second step clicks the already-checked Icons radio again, a no-op.
const LEFT = 'role=region[name="Left pane"]';
const either = (a: string, b: string) => `${a} >> internal:or=${JSON.stringify(b)}`;
const ICONS = [
  { click: either(`${LEFT} >> role=radio[name="Icons"]`, `${LEFT} >> role=button[name="View options"]`) },
  { click: either('role=menuitemradio[name="Icons"]', `${LEFT} >> role=radio[name="Icons"]`) },
] as const;
const FIND_GO = { click: 'role=dialog >> role=button[name="Find"]' } as const;
// Both panes on atlas, the left on the item's folder, the right on the destination.
const TWO = (ap: string, bp: string) => `${A}&ap=${encodeURIComponent(ap)}&b=atlas.00a1&bp=${encodeURIComponent(bp)}`;
// Download from link is in the pane bar's More menu.
const MORE = { click: `${LEFT} >> role=button[name="More"s]` } as const;
// A Download from a link shot on atlas's tmp: open the dialog, type the link, then the shot's own steps. A
// helper call, not a .map() over tuples: shell/tabInset.spec reads shots.ts with a small evaluator that has no methods.
const link = (name: string, state: string, rest: readonly ActStep[]) => ({
  name, state, path: `${A}&ap=%2Ftmp`,
  act: [MORE, { click: 'role=menuitem[name="Download from link"]' }, DIALOG, { fill: 'role=dialog >> role=textbox[name="Link"]', text: 'https://downloads.example/big.iso' }, ...rest],
});
export default [
  { name: 'top', path: A },
  { name: 'two-panes', extra: ['1024-light', '1440-dock'], path: `${A}&ap=%2Fsrv%2Fapp&b=atlas.00a1&bp=%2Fsrv` },
  // One pane is the default; the One pane / Two panes toggle with Two panes picked, then pane B kept while one shows.
  { name: 'view-toggle', path: `${A}&ap=%2Fsrv%2Fapp`, act: [{ click: 'role=radio[name="Two panes"]' }, { waitFor: 'role=region[name="Right pane"]' }] },
  { name: 'view-one', path: `${A}&ap=%2Fsrv%2Fapp&b=atlas.00a1&bp=%2Fsrv&panes=one` },
  { name: 'view-two', path: `${A}&ap=%2Fhome%2Fada&panes=two` },
  // The pane's Show switch set to Icons (the folder grid); a tile picked with its row menu open
  // (`.`, the same menu as right click); Icons in pane A beside a list in pane B.
  { name: 'icons', path: ADA, act: [...ICONS, { waitFor: 'css=table[class*="icons"]' }] },
  { name: 'icons-menu', path: ADA, act: [...ICONS, { click: 'role=region[name="Left pane"] >> tr:has-text("notes.txt") >> [title="notes.txt"]' }, { press: '.' }, { waitFor: 'role=menuitem[name=/Rename/]' }] },
  { name: 'icons-two', path: `${ADA}&b=atlas.00a1&bp=%2Fsrv%2Fapp`, act: [...ICONS, { waitFor: 'css=table[class*="icons"]' }] },
  { name: 'many', path: `${A}&ap=%2Fsrv%2Fmedia` },
  { name: 'odd-names', path: `${A}&ap=%2Fhome%2Fada` },
  // The deepest folder that opens, with its child marked; then the child itself, which is not read.
  { name: 'deep-row', path: `${A}&ap=%2Fsrv%2Fa%2Fb%2Fc%2Fd%2Fe%2Ff%2Fg` },
  { name: 'too-deep', path: `${A}&ap=%2Fsrv%2Fa%2Fb%2Fc%2Fd%2Fe%2Ff%2Fg%2Fh` },
  { name: 'alias', path: `${A}&ap=%2Fcopy` },
  { name: 'bad-path', path: `${A}&ap=%2Fsrv%2F..%2F..` },
  { name: 'other-realm', path: '?a=borealis.00b2' },
  { name: 'empty-folder', path: `${A}&ap=%2Ftmp` },
  { name: 'no-match', path: `${A}&aq=zzzz` },
  { name: 'gone', path: `${A}&ap=%2Fnope` },
  { name: 'refused', path: `${A}&ap=%2Froot` },
  { name: 'stopped', path: '?a=cedar.00c3' },
  { name: 'paused', path: '?a=fjord.00f6' },
  { name: 'starting', realm: 'all', path: '?a=dune.00d4' },
  { name: 'attention', realm: 'all', path: '?a=ember.00e5' },
  // The right pane before a computer is picked; side=b shows it on a phone (panes=two: one pane is the default).
  { name: 'pick', path: `${A}&ap=%2Fsrv&panes=two&side=b` },
  // The right pane's computer picker open (the kit ComputerPicker; a sheet on a phone).
  { name: 'pick-open', path: `${A}&ap=%2Fsrv&b=atlas.00a1&side=b`, act: [{ click: 'role=button[name=/^atlas .* Right pane: computer$/]' }, { waitFor: 'role=dialog' }] },
  { name: 'error', state: 'error', path: A },
  { name: 'unreadable', state: 'notJson', path: A },
  { name: 'loading', state: 'loading', path: A },
  { name: 'access', state: 'access', path: A },
  // A 403 while the computer list can't say whether access rules are set: no cause is named.
  { name: 'denied', state: 'rulesUnknown', path: A },
  // One entry the Hub can't read makes the listing unreadable (never a shorter list or an empty folder).
  { name: 'bad-entry', state: 'badEntry', path: ADA },
  { name: 'top-hidden', state: 'rootOdd', path: A },
  // 'rules' (403 with access rules) reads exactly like 'access' by design: page.test.tsx covers it, no shot.
  { name: 'too-big', state: 'tooBig', path: A },
  { name: 'no-address', state: 'noAddress', path: A },
  { name: 'none', state: 'none' },
  { name: 'list-error', state: 'listError' },
  // Changes on one computer.
  { name: 'new-folder', path: ADA, act: [NEW, DIALOG] },
  { name: 'name-taken', path: ADA, act: [NEW, { fill: 'role=textbox[name="Name"]', text: 'notes.txt' }] },
  { name: 'rename', path: ADA, act: [...menu('notes\\.txt', 'Rename'), DIALOG] },
  { name: 'rename-protected', path: ADA, act: [...menu('hosts-link', 'Rename'), { fill: 'role=textbox[name="Name"]', text: 'hosts-old' }, { waitFor: 'text=Type hosts-link to rename it' }] },
  // The Mount on your device panel (address, copy, one step per system, the key line).
  { name: 'mount', extra: ['768-dark'], path: A, act: [{ click: 'role=region[name="Left pane"] >> role=button[name="Mount"s]' }, { waitFor: 'role=dialog' }] },
  { name: 'delete-file', path: ADA, act: [...menu('notes\\.txt', 'Delete'), { waitFor: 'text=There is no trash: this can\'t be undone.' }] },
  { name: 'delete-folder', path: ADA, act: [...menu('projects', 'Delete'), { waitFor: 'text=Type projects to confirm' }] },
  { name: 'delete-protected', path: ADA, act: [...menu('hosts-link', 'Delete'), { waitFor: 'text=Type hosts-link to confirm' }] },
  { name: 'delete-holds-storage', path: A, act: [...menu('\\bsrv\\b', 'Delete'), { waitFor: 'text=Close it in Storage first' }] },
  { name: 'delete-no-storage-list', state: 'mountsDown', path: ADA, act: [...menu('projects', 'Delete'), { waitFor: 'text=folders can\'t be deleted now' }] },
  { name: 'delete-selected', path: ADA, act: [
    // Picked from the keyboard, the one way that works at every width (list rows show no checkboxes until selecting).
    // A click on notes.txt opens its preview and leaves the row focused; Escape closes the preview, Space picks the
    // row, three rows up is the projects folder (folders first), Space picks it too.
    { click: 'role=region[name="Left pane"] >> tr:has-text("notes.txt") >> text=notes.txt' },
    DIALOG,
    { press: 'Escape' },
    { press: 'Space' },
    { press: 'ArrowUp' },
    { press: 'ArrowUp' },
    { press: 'ArrowUp' },
    { press: 'Space' },
    { click: 'role=region[name="Left pane"] >> role=button[name="Delete selected"]' },
    { waitFor: 'text=Type 2 items to confirm' },
  ] },
  { name: 'create-pending', path: ADA, act: [NEW, { fill: 'role=textbox[name="Name"]', text: 'lost' }, { click: 'role=button[name="Create"]' }, { waitFor: 'text=This may have gone through >> nth=0' }] },
  { name: 'held-pending', state: 'heldSlow', path: ADA, act: [NEW, { fill: 'role=textbox[name="Name"]', text: 'lost' }, { click: 'role=button[name="Create"]' }, { waitFor: 'text=This may have gone through >> nth=0' }, { press: 'Escape' }, { waitFor: 'text=Making the folder lost may have gone through.' }] },
  { name: 'changes-off', state: 'tokenRead', path: ADA, act: [{ waitFor: 'text=Changes are turned off in this Hub session.' }] },
  // Read-only actions (preview, find, the row menu's links).
  { name: 'ro-menu-file', extra: ['1024-light'], path: `${A}&ap=%2Fsrv%2Fapp`, act: [...roMenu('server.js'), { waitFor: 'role=menuitem[name=/Open in editor/]' }] },
  { name: 'ro-menu-folder', path: `${A}&ap=%2Fsrv`, act: [...roMenu('media'), { waitFor: 'role=menuitem[name=/Download as .zip/]' }] },
  { name: 'ro-preview-text', extra: ['1024-light'], path: `${A}&ap=%2Fsrv%2Fapp`, act: [...roMenu('package.json'), { click: 'role=menuitem[name=/Preview/]' }, { waitFor: 'text=1.4.2' }] },
  // A JavaScript file and a shell script in colour (package.json above shows JSON's).
  { name: 'ro-preview-js', extra: ['768-dark'], path: `${A}&ap=%2Fsrv%2Fapp`, act: [...roMenu('server.js'), { click: 'role=menuitem[name=/Preview/]' }, { waitFor: 'text=createServer' }] },
  { name: 'ro-preview-sh', extra: ['768-dark'], path: `${A}&ap=%2Fhome%2Fada%2Fprojects%2Fsite`, act: [...roMenu('deploy.sh'), { click: 'role=menuitem[name=/Preview/]' }, { waitFor: 'text=rsync' }] },
  { name: 'ro-preview-off', path: `${A}&ap=%2Fsrv%2Fmedia`, act: [...roMenu('photo-001.jpg'), { click: 'role=menuitem[name=/Preview/]' }, { waitFor: 'text=Pictures can\'t be previewed on this computer' }] },
  { name: 'ro-preview-why', state: 'apiFolder', path: `${A}&ap=%2Fapi%2Fv1`, act: [...roMenu('readme.txt'), { click: 'role=menuitem[name=/Preview/]' }, { waitFor: 'text=Open in viewer is off' }] },
  { name: 'ro-find', extra: ['1024-light'], path: `${A}&ap=%2Fhome`, act: [FIND, { fill: 'role=searchbox[name="Name or part of a path"]', text: 'a' }, FIND_GO, { waitFor: 'text=ada/projects/README.md' }] },
  { name: 'ro-find-top', path: A, act: [FIND, { waitFor: 'role=dialog >> role=list[name="Folders to find in"]' }] },
  { name: 'ro-find-top-in', path: A, act: [FIND, { click: 'role=dialog >> role=button[name="Find in /home"]' }, { fill: 'role=searchbox[name="Name or part of a path"]', text: 'a' }, FIND_GO, { waitFor: 'text=ada/projects/README.md' }] },
  { name: 'ro-find-off', state: 'findOff', path: `${A}&ap=%2Fsrv`, act: [FIND, { fill: 'role=searchbox[name="Name or part of a path"]', text: 'app' }, FIND_GO, { waitFor: 'text=Search is turned off' }] },
  // Copy / Move to the other side, both panes on atlas (left: the item's folder, right: the destination).
  { name: 'transfer-menu', path: TWO('/home/ada', '/home/ada'), act: [...roMenu('notes.txt'), { waitFor: 'text=The other side shows this same folder. >> nth=0' }] },
  { name: 'copy-file', extra: ['1024-light'], path: TWO('/home/ada', '/tmp'), act: [...roMenu('notes.txt'), { click: 'role=menuitem[name=/^Copy to the other side/]' }, DIALOG] },
  { name: 'copy-taken', state: 'copyTaken', path: TWO('/home/ada', '/tmp'), act: [
    ...roMenu('notes.txt'), { click: 'role=menuitem[name=/^Copy to the other side/]' }, { waitFor: 'text=nothing is replaced' },
  ] },
  { name: 'copy-not-made', state: 'transferNone', path: TWO('/home/ada', '/tmp'), act: [...roMenu('notes.txt'), { click: 'role=menuitem[name=/^Copy to the other side/]' }, { click: 'role=dialog >> role=button[name="Copy"]' }, { waitFor: 'text=It wasn\'t copied' }] },
  { name: 'copy-left-out', state: 'copyBecameFolder', path: TWO('/home/ada', '/tmp'), act: [...roMenu('notes.txt'), { click: 'role=menuitem[name=/^Copy to the other side/]' }, { click: 'role=dialog >> role=button[name="Copy"]' }, { waitFor: 'text=had become a folder' }] },
  { name: 'held-not-made', state: 'transferNoneFlaky', path: TWO('/home/ada', '/tmp'), act: [...roMenu('report.pdf'), { click: 'role=menuitem[name=/^Move to the other side/]' }, { click: 'role=dialog >> role=button[name="Move"]' }, { waitFor: 'text=This may have gone through >> nth=0' }, { press: 'Escape' }, { click: 'role=button[name=/Check again/] >> nth=0' }, { waitFor: 'text=It wasn\'t moved' }] },
  { name: 'copy-held', state: 'transferLost', path: TWO('/home/ada', '/tmp'), act: [...roMenu('notes.txt'), { click: 'role=menuitem[name=/^Copy to the other side/]' }, { click: 'role=dialog >> role=button[name="Copy"]' }, { waitFor: 'text=This may have gone through >> nth=0' }, { press: 'Escape' }, { waitFor: 'text=Copying notes.txt to /tmp/notes.txt may have gone through. >> nth=0' }] },
  // A folder copy walks the folder first; a cut copy says what is missing. An older files program (no skipped
  // list) is not read at all.
  { name: 'copy-folder', path: TWO('/home/ada', '/tmp'), act: [...roMenu('projects'), { click: 'role=menuitem[name=/^Copy to the other side/]' }, { waitFor: 'text=projects holds 4 items' }] },
  { name: 'folder-old-program', state: 'oldFiles', path: TWO('/home/ada', '/tmp'), act: [{ waitFor: 'text=The files program sent an answer the Hub can\'t read >> nth=0' }] },
  { name: 'copy-folder-part', state: 'folderCut', path: TWO('/home/ada', '/tmp'), act: [...roMenu('projects'), { click: 'role=menuitem[name=/^Copy to the other side/]' }, { waitFor: 'text=projects holds 4 items' }, { click: 'role=dialog >> role=button[name="Copy"]' }, { waitFor: 'role=dialog >> text=When checked, 3 items' }] },
  { name: 'move-places', path: TWO('/srv/media', '/tmp'), act: [...roMenu('photo-001.jpg'), { click: 'role=menuitem[name=/^Move to the other side/]' }, { waitFor: 'text=can\'t be done in one step' }] },
  { name: 'move-protected', path: TWO('/home/ada', '/tmp'), act: [...roMenu('hosts-link'), { click: 'role=menuitem[name=/^Move to the other side/]' }, { waitFor: 'text=Type hosts-link to move it' }] },
  // Several selected items copied to the other side (picked from the keyboard, as delete-selected): the
  // plan with a Keep-both name, and a run stopped at the item whose answer was lost.
  { name: 'several-plan', state: 'copyTaken', path: TWO('/home/ada', '/tmp'), act: [
    { click: 'role=region[name="Left pane"] >> tr:has-text("notes.txt") >> text=notes.txt' }, DIALOG, { press: 'Escape' },
    { press: 'Space' }, { press: 'ArrowDown' }, { press: 'Space' },
    { click: 'role=region[name="Left pane"] >> role=button[name="Copy to the other side"]' }, { waitFor: 'text=notes.txt → notes-1.txt' },
  ] },
  { name: 'several-held', state: 'secondLost', path: TWO('/home/ada', '/tmp'), act: [
    { click: 'role=region[name="Left pane"] >> tr:has-text("notes.txt") >> text=notes.txt' }, DIALOG, { press: 'Escape' },
    { press: 'Space' }, { press: 'ArrowUp' }, { press: 'Space' }, { press: 'ArrowDown' }, { press: 'ArrowDown' }, { press: 'Space' },
    { click: 'role=region[name="Left pane"] >> role=button[name="Copy to the other side"]' }, DIALOG,
    { click: 'role=dialog >> role=button[name="Copy"]' }, { waitFor: 'text=may have gone through, so nothing after it was sent' },
  ] },
  // A realm with more than 100 computers (atlas is on page 2 of the list).
  { name: 'list-page-two', state: 'pages', path: `${A}&ap=%2Fsrv`, act: [{ waitFor: 'text=app' }] },
  { name: 'list-still-reading', state: 'pagesSlow', path: `${A}&ap=%2Fsrv`, act: [{ waitFor: "text=Still reading this realm's computers." }] },
  { name: 'list-page-unread', state: 'pagesFailed', path: `${A}&ap=%2Fsrv`, act: [{ waitFor: "text=Part of the list of computers couldn't be read." }] },
  { name: 'list-capped', state: 'pagesCapped', path: `${A}&ap=%2Fsrv`, act: [{ waitFor: 'text=Files reads the first 1,000 computers' }] },
  { name: 'list-read-in-parts', state: 'pages', path: '/files?a=nowhere.0000', act: [{ waitFor: 'text=is read in parts' }] },
  // Download from a link: the dialog, a running download, one whose answer was lost, one that failed.
  link('link-dialog', 'many', [{ waitFor: 'role=dialog' }]),
  link('link-running', 'linkRunning', [{ click: 'role=dialog >> role=button[name="Download"]' }, { waitFor: 'text=Downloading big.iso into tmp' }]),
  link('link-held', 'linkLost', [{ click: 'role=dialog >> role=button[name="Download"]' }, { waitFor: 'text=may have been accepted' }]),
  link('link-ended', 'linkFails', [{ click: 'role=dialog >> role=button[name="Download"]' }, { waitFor: 'text=The download of big.iso into tmp failed.' }]),
  // The Transfers tab, quiet and with a link download running.
  { name: 'transfers-quiet', path: `${A}&ap=%2Ftmp&tab=transfers`, act: [{ waitFor: 'text=Nothing is moving on atlas.' }] },
  { name: 'transfers-running', state: 'linkRunning', path: `${A}&ap=%2Ftmp`, act: [
    MORE, { click: 'role=menuitem[name="Download from link"]' }, DIALOG, { fill: 'role=dialog >> role=textbox[name="Link"]', text: 'https://downloads.example/big.iso' },
    { click: 'role=dialog >> role=button[name="Download"]' }, { click: 'role=tab[name="Transfers"]' }, { waitFor: 'text=big.iso → tmp' },
  ] },
  // Use from your PC: the choice of a way, then that way's steps. The folder on the PC (the default) from the top and
  // scrolled to its mount lines; the network drive; a PC folder into the computer; from code.
  { name: 'pc', path: `${A}&ap=%2Fsrv%2Fapp&tab=pc`, act: [{ waitFor: 'text=Put atlas\'s files on your PC' }], extra: ['1350-light', '390-dark'] },
  { name: 'pc-mount', path: `${A}&ap=%2Fsrv%2Fapp&tab=pc`, act: [{ waitFor: 'text=Put atlas\'s files on your PC' }, { hover: 'text=More lines: background' }], extra: ['1350-light', '390-dark'] },
  { name: 'pc-drive', path: `${A}&ap=%2Fsrv%2Fapp&tab=pc&way=drive`, act: [{ waitFor: 'text=Open atlas\'s files as a network drive' }], extra: ['1350-light', '390-dark'] },
  { name: 'pc-share', path: `${A}&ap=%2Fsrv%2Fapp&tab=pc&way=share`, act: [{ waitFor: 'text=Put a PC folder into atlas' }, { hover: 'text=Stop sharing' }], extra: ['1350-light', '390-dark'] },
  { name: 'pc-code', path: `${A}&ap=%2Fsrv%2Fapp&tab=pc&way=code`, act: [{ waitFor: 'text=Mount from your code' }, { hover: 'text=Mount from your code' }], extra: ['1350-light', '390-dark'] },
  // A session that cannot change files: the read-only line first (scrolled to the mount lines, where it differs).
  { name: 'pc-readonly', state: 'tokenRead', path: `${A}&ap=%2Fsrv%2Fapp&tab=pc`, act: [{ waitFor: 'text=Put atlas\'s files on your PC' }, { hover: 'text=More lines: background' }] },
  // Shared folders under the Storage tab, behind the sharesUi flag (?fxshares=1, fixture builds only). The
  // shares state joins atlas and cedar (shares/fixtures.ts shareRules): one share in each state, and one the other way.
  // Add storage: the key form, a sign-in storage's open step (Drive: the retiring shared app as its warning),
  // and OneDrive's steps through an rclone config.
  { name: 'storage-connect-keys', path: `${A}&tab=storage&fxshares=1`, act: [{ click: 'role=button[name="Add storage"]' }, { waitFor: 'role=dialog >> text=Where your keys go' }] },
  ...(['Google Drive', 'Microsoft OneDrive'] as const).map((prov) => ({
    name: `storage-connect-${prov === 'Google Drive' ? 'drive' : 'onedrive'}`,
    path: `${A}&tab=storage&fxshares=1`,
    act: [
      { click: 'role=button[name="Add storage"]' },
      { fill: 'role=dialog >> role=combobox[name="Storage"]', text: prov },
      { click: `role=option[name="${prov}"]` },
      { waitFor: 'role=dialog >> text=Get a token with rclone' },
    ],
  })),
  { name: 'storage-shares-rows', state: 'shares', path: `${A}&tab=storage&fxshares=1`, act: [{ waitFor: 'text=This computer shares' }] },
  { name: 'storage-shares-all', state: 'shares', path: `${A}&tab=storage&fxshares=1`, act: [{ waitFor: 'text=This computer shares' }, { click: 'role=radio[name="All my computers"]' }, { waitFor: 'text=Every shared folder' }] },
  { name: 'storage-shares-stopped', state: 'shares', path: '?a=cedar.00c3&tab=storage&fxshares=1', act: [{ waitFor: 'text=Shared with this computer' }] },
  // Shared folders, the changes: Share a folder (the folder given by a row's "Share with another computer…"; read and write with its
  // warning), the question before Stop sharing, and a change whose answer was lost (sharesHeld: held, Check again).
  { name: 'storage-shares-new', state: 'shares', path: `${A}&tab=storage&fxshares=1&share=%2Fsrv%2Fapp`, act: [{ waitFor: 'role=dialog[name="Share a folder"] >> text=Share with' }] },
  { name: 'storage-shares-new-rw', state: 'shares', path: `${A}&tab=storage&fxshares=1&share=%2Fsrv%2Fapp`, act: [{ waitFor: 'role=dialog[name="Share a folder"] >> text=Share with' }, { click: 'role=dialog >> role=radio[name="Read and write"]' }, { waitFor: 'text=can change and delete' }] },
  { name: 'storage-shares-stop', state: 'shares', path: `${A}&tab=storage&fxshares=1`, act: [{ waitFor: 'text=This computer shares' }, { click: 'role=row[name=/srv\\/data/] >> role=button[name="Row actions"]' }, { click: 'role=menuitem[name="Stop sharing…"]' }, { waitFor: 'text=Stop sharing /srv/data?' }] },
  { name: 'storage-shares-held', state: 'sharesHeld', path: `${A}&tab=storage&fxshares=1`, act: [{ waitFor: 'text=This computer shares' }, { click: 'role=row[name=/srv\\/data/] >> role=button[name="Row actions"]' }, { click: 'role=menuitem[name="Stop sharing…"]' }, { click: 'role=button[name="Stop sharing"]' }, { waitFor: 'text=may have gone through' }] },
] satisfies Shots;
