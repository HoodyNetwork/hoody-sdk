// Named screenshot states of the keys page (`bun run hub:shots --page keys`).
import type { Shots } from "@app/shots.types";

const SEL = "?sel=hdy_9e37.3779b1";
/** `n` opens New key, the name is typed, Enter makes it. */
const MAKE = ["c", "i", "Enter"] as const;

export default [
  { name: "keys", extra: ["390-dark"] },
  { name: "keys-detail", path: SEL },
  { name: "keys-long", state: "long" },
  { name: "keys-all-realms", click: "Show all realms" },
  { name: "keys-empty", state: "empty" },
  { name: "keys-loading", state: "loading" },
  { name: "keys-error", state: "error" },
  { name: "new-key", click: "New key" },
  { name: "new-key-myip", act: [{ click: "New key" }, { click: "role=button[name='Add my IP']" }, { waitFor: "Added" }] },
  {
    name: "new-key-rights",
    click: "New key",
    keys: ["Tab", "Tab", "Tab", "Tab", "Tab", "Tab", "ArrowDown"],
  },
  // "Start from" typed into: the ready-made sets filtered by what was typed, the box empty before.
  {
    name: "new-key-start-from",
    click: "New key",
    keys: [
      "Tab",
      "Tab",
      "Tab",
      "Tab",
      "Tab",
      "Tab",
      "ArrowDown",
      "Tab",
      "d",
      "e",
      "v",
    ],
  },
  { name: "new-key-no-catalogue", state: "noCatalogue", click: "New key" },
  { name: "key-shown-once", click: "New key", keys: [...MAKE] },
  {
    name: "key-pending",
    state: "pendingOps",
    click: "New key",
    keys: [...MAKE],
  },
  {
    name: "key-pending-appeared",
    state: "pendingAppeared",
    click: "New key",
    keys: [...MAKE],
  },
  {
    name: "key-refused",
    state: "failedOps",
    click: "New key",
    keys: [...MAKE],
  },
  {
    name: "key-no-secret",
    state: "noSecret",
    click: "New key",
    keys: [...MAKE],
  },
  { name: "copy-key", path: SEL, click: "Copy with a new secret…" },
  // The inspector's Delete: below 846 px of the page's own width the list's row actions (also "Delete…") stay in the page, hidden.
  {
    name: "delete-key",
    path: SEL,
    click: "role=region[name='Details'] >> role=button[name='Delete…']",
  },
  { name: "pause-unknown", state: "pendingOps", path: SEL, click: "Pause" },
  // Edit: opened as the key is (Save off, "No changes yet"), then with a guarded change (count and the 2FA line).
  { name: "edit-key", path: SEL, click: "role=region[name='Details'] >> role=button[name='Edit…']" },
  {
    name: "edit-key-changed",
    path: SEL,
    act: [
      { click: "role=region[name='Details'] >> role=button[name='Edit…']" },
      { fill: "Name", text: "ci-deploy-2" },
      { click: 'role=dialog >> label:has-text("Never")' },
      { waitFor: "2 changes" },
    ],
  },
  // An edit that may have gone through: held on the row (Check again, a warned Dismiss).
  {
    name: "edit-held",
    state: "editHeld",
    path: SEL,
    act: [
      { click: "role=region[name='Details'] >> role=button[name='Edit…']" },
      { fill: "Name", text: "ci-renamed" },
      { click: "Save changes" },
      { waitFor: "The change may have gone through" },
    ],
  },
  { name: "ssh", path: "/ssh", extra: ["390-dark"] },
  { name: "ssh-none", state: "sshNone", path: "/ssh" },
  { name: "ssh-no-computer", state: "noComputer", path: "/ssh" },
  { name: "ssh-read-realm", state: "sshReadRealm", path: "/ssh" },
  { name: "ssh-read-offline", state: "sshReadOffline", path: "/ssh" },
  { name: "ssh-edit", path: "/ssh", click: "Replace" },
  { name: "ssh-remove", path: "/ssh", click: "Remove…" },
  { name: "shared", state: "shared", path: "/shared" },
  { name: "shared-empty", state: "sharedEmpty", path: "/shared" },
  { name: "shared-truncated", state: "sharedTruncated", path: "/shared" },
  { name: "shared-error", state: "sharedError", path: "/shared" },
  { name: "shared-all-realms", state: "shared", realm: "all", path: "/shared" },
  {
    // The row after the dialog closed on a stop that may have gone through: its note, Dismiss and Check again.
    name: "shared-stop-held-row",
    state: "sharedStopPending",
    path: "/shared",
    act: [
      { click: 'role=button[name="Stop sharing…"] >> nth=0' },
      { click: 'role=alertdialog >> role=button[name="Stop sharing"]' },
      { waitFor: "This may have gone through" },
      { click: 'role=alertdialog >> role=button[name="Cancel"]' },
      { waitFor: "Couldn't confirm it stopped" },
    ],
  },
  {
    name: "share-drawer",
    state: "shared",
    path: "/shared",
    act: [{ click: "Share this realm" }, { waitFor: "3 computers in this realm now" }],
  },
  {
    // Choose with limits: an address and a name (See only, the default), the areas and the limits.
    name: "share-advanced",
    state: "shared",
    path: "/shared",
    act: [
      { click: "Share this realm" },
      { fill: "Only from these addresses", text: "203.0.113.7" },
      { fill: "Who it's for", text: "Alex" },
      { waitFor: "3 computers in this realm now" },
    ],
  },
  {
    // Review of the default: See only, and what they can't do.
    name: "share-review",
    state: "shared",
    path: "/shared",
    act: [
      { click: "Share this realm" },
      { click: 'role=dialog >> role=button[name="Review"]' },
      { waitFor: "They can't" },
    ],
  },
  {
    // Review with tagged rights and the warning. Wide: "Inside computers" ticks the area, then Run commands is
    // taken off again; phones: it opens the folded area, then Run commands is ticked.
    name: "share-review-tags",
    state: "shared",
    path: "/shared",
    act: [
      { click: "Share this realm" },
      { click: 'css=[role=dialog] [slot=trigger]:has-text("Inside computers"), [role=dialog] label:has-text("Inside computers")' },
      { click: 'css=[role=dialog] label:has-text("Run commands")' },
      { click: 'role=dialog >> role=button[name="Review"]' },
      { waitFor: "Check these before you share" },
    ],
  },
  { name: "shared-named", state: "sharedNamed", path: "/shared" },
  // Shares this page manages (one paused) beside ones it does not; then Edit details of the first.
  { name: "shared-managed", state: "sharedManaged", path: "/shared", extra: ["390-dark"] },
  {
    name: "share-edit-details",
    state: "sharedManaged",
    extra: ["390-dark"],
    path: "/shared",
    act: [
      { click: 'role=button[name="More for the Personal share"] >> nth=0' },
      { click: 'role=menuitem[name=/^Edit details/]' },
      { waitFor: "Edit the Personal share" },
    ],
  },
  {
    // The realm's computers could not be listed: the plain sentence of what the share reaches stays next to Try again.
    name: "share-computers-unread",
    state: "shareComputersFailed",
    path: "/shared",
    act: [{ click: "Share this realm" }, { waitFor: "Couldn't list this realm's computers." }],
  },
] satisfies Shots;
