// SshKeyHelp's rules with no DOM, shared by SshKeyHelp.tsx (web) and SshKeyHelp.term.tsx (terminal): the systems, the
// first one shown, and the commands per system and key file.

export type KeyOs = 'windows' | 'mac' | 'linux';
export const OSES: readonly KeyOs[] = ['windows', 'mac', 'linux'];

/** The system to show first, from the browser's platform string; Linux when it says nothing useful. */
export function guessKeyOs(platform?: string): KeyOs {
  const p =
    platform ??
    (typeof navigator === 'undefined' ? '' : ((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? ''));
  if (/win/i.test(p)) return 'windows';
  if (/mac|iphone|ipad|ipod/i.test(p)) return 'mac';
  return 'linux';
}

/** The commands for one system and key file. `host` adds the connect command. */
export function sshKeyCommands(os: KeyOs, file: string, host?: string) {
  const win = os === 'windows';
  // Windows paths are quoted: a profile folder with a space would split ssh-keygen's and ssh's arguments.
  const at = (path: string) => (win ? `"$env:USERPROFILE\\${path.replaceAll('/', '\\')}"` : `~/${path}`);
  const dir = at('.ssh');
  const key = at(`.ssh/${file}`);
  const pub = at(`.ssh/${file}.pub`);
  return {
    folder: win ? `New-Item -ItemType Directory -Force ${dir} | Out-Null` : `mkdir -p ${dir}`,
    make: `ssh-keygen -t ed25519 -f ${key} -C ${file}`,
    copy: win ? `Get-Content ${pub} | Set-Clipboard` : os === 'mac' ? `pbcopy < ${pub}` : `cat ${pub}`,
    // The target is the full key path, so a download the browser renamed ("name (1)") still lands under `file`;
    // the source is quoted so such a name can be typed in. Neither command replaces an existing key.
    move: win
      ? `Move-Item -LiteralPath ${at(`Downloads/${file}`)} -Destination ${key}`
      : `mv -n ~/Downloads/"${file}" ${key} && chmod 600 ${key}`,
    // IdentitiesOnly: offer only this key. Without it ssh offers the agent's keys first, and the SSH proxy picks the
    // computer from the first key it accepts, so another key could open a different computer.
    connect: host ? `ssh -i ${key} -o IdentitiesOnly=yes ${host}` : undefined,
    configPath: '~/.ssh/config',
    config: host ? `Host ${host}\n  IdentityFile ~/.ssh/${file}\n  IdentitiesOnly yes` : undefined,
  };
}
