// preinstall.ts: the first import of the term entry. It installs the terminal env before core evaluates, so core's
// first store, lock or vault call reads the terminal env (its static import closure is pinned by preinstall.term.test.ts).
import { installTermEnv } from './session';

installTermEnv();
