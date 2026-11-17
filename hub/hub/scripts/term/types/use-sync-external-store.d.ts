// Local declaration of the one export loader-cjs.term.test.tsx calls (the package ships CommonJS with no types and
// the tree has no @types/use-sync-external-store). Signature as React's shim documents it.
declare module 'use-sync-external-store/shim/with-selector' {
  export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => Snapshot,
    getServerSnapshot: undefined | null | (() => Snapshot),
    selector: (snapshot: Snapshot) => Selection,
    isEqual?: (a: Selection, b: Selection) => boolean,
  ): Selection;
}
