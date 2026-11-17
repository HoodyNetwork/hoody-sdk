// Whether the open mount is the sample account (`hoody hub --demo`). Set only by app/boot.demo.ts; the shell reads it
// for its one "sample data" line. Its own module so the live entry's graph never holds the demo boot.
let on = false;
export const demoMounted = (): boolean => on;
export function setDemoMounted(v: boolean): void { on = v; }
