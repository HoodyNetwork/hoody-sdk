/**
 * hoodyHomeDir — user-home lookup that actually works under Bun.
 *
 * Bun's `node:os` homedir() uses getpwuid() directly and ignores
 * process.env.HOME. Node's honors $HOME. Tests that override HOME in a
 * beforeEach therefore silently pollute the real ~/ under Bun. By routing
 * every ~/.hoody path through this one helper, tests can isolate with
 * process.env.HOME and the production path is unchanged (the shell sets
 * HOME, so the env-var branch returns the same value homedir() would).
 *
 * Also exports platformEnvHint() — gives the user a copy-pasteable env-var
 * assignment in their current shell syntax (bash/zsh vs PowerShell vs cmd).
 */

import { homedir } from 'node:os';

export function hoodyHomeDir(): string {
  // Use `||` (truthy) not `??` (nullish) so an empty-string HOME also
  // falls through to homedir(). An empty HOME would otherwise resolve
  // `~/.hoody/...` to `.hoody/...` under the current working directory,
  // silently writing sessions into the shell's cwd.
  return process.env.HOME || homedir();
}

/**
 * Return a user-facing snippet to persist an env var in the CURRENT shell.
 * Best-effort shell detection — we only need "probably PowerShell" vs
 * "probably POSIX" vs "probably cmd.exe" to be close enough for a hint.
 *
 *   platformEnvHint('HOODY_CHAT_PRIVATE', '1')
 *     → bash/zsh:   "export HOODY_CHAT_PRIVATE=1   (add to ~/.bashrc or ~/.zshrc)"
 *     → PowerShell: "$env:HOODY_CHAT_PRIVATE=\"1\"   (add to $PROFILE)"
 *     → cmd.exe:    "setx HOODY_CHAT_PRIVATE 1   (permanent across sessions)"
 */
export function platformEnvHint(name: string, value: string): string {
  if (process.platform === 'win32') {
    // PowerShell sets PSModulePath; cmd.exe usually does not.
    if (process.env.PSModulePath) {
      return `$env:${name}="${value}"   (add to $PROFILE)`;
    }
    return `setx ${name} ${value}   (permanent across sessions)`;
  }
  return `export ${name}=${value}   (add to ~/.bashrc or ~/.zshrc)`;
}
