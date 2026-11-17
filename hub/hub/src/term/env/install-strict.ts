// install-strict.ts: the terminal bundle's first module (entry.ts imports it before preinstall). It installs the strict
// globals in their default mode, so every DOM global, constructors included, throws TermGlobalError in the terminal
// process. It is the one non-test file allowed to import strict-globals.ts (test/conformance.harness.test.ts ALLOWED);
// test/install-strict.test.ts proves it installs the default mode and nothing else.
import { installStrictGlobals } from './strict-globals';

installStrictGlobals();
