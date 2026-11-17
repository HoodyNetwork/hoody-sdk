// Named screenshot states of the guide page (`bun run hub:shots --page guide`).
import type { Shots } from '@app/shots.types';

export default [
  // A #section path opens scrolled to that section on purpose (`scrolled: true`).
  { name: 'top', extra: ['768-dark', '390-dark'] },
  { name: 'connect-cli', path: '?door=cli#connect', scrolled: true },
  { name: 'connect-sdk', path: '?door=sdk#connect', scrolled: true },
  { name: 'connect-ssh', path: '?door=ssh#connect', scrolled: true },
  { name: 'skills', path: '#skills', scrolled: true, extra: ['768-dark'] },
  { name: 'build', path: '#build', scrolled: true, extra: ['768-dark'] },
  { name: 'links', path: '#links', scrolled: true },
  { name: 'bots-models', path: '?bdoor=models#bots', scrolled: true },
  { name: 'tools', path: '#tools', scrolled: true },
  { name: 'keys', path: '#keys', scrolled: true },
  { name: 'look', path: '#look', scrolled: true },
  { name: 'loading', state: 'loading' },
  // At the top: below 1180 px the facts rail (and its error) sits above the sections, off-screen at #connect.
  { name: 'facts-error', state: 'unknown', path: '?door=cli' },
  { name: 'no-computer', state: 'noComputer', path: '?door=cli#connect', scrolled: true },
  { name: 'stopped', state: 'stopped' },
  { name: 'no-ssh', state: 'noSsh', path: '?door=ssh#connect', scrolled: true },
  { name: 'long-name', state: 'longName', path: '#links', scrolled: true },
] satisfies Shots;
