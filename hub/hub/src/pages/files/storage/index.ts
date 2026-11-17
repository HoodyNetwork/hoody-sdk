// Remote storage, Files' Storage tab and the computer page's (both through ../links.ts): the tab. Its fake
// files-program answers (storageRules) are imported from ./fixtures by the page's fixtures only, so no live import
// reaches a fixture module (the terminal ship build refuses one).
export { StorageTab } from './StorageTab';
export { useDisk } from './data';
