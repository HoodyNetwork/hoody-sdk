// Status answers in every shape GET /programs/{id}/sandbox gives (the daemon's openapi SandboxStatus examples and
// its own status read), and /health sandbox objects. Used by the unit tests and the page fixtures.

const RULE = { rule: { family: 'ip', table: 'hoody_daemon', chain: 'hd_12_3f9c1a2b7e4d', expr: [{ match: { op: 'in', left: { ct: { key: 'state' } }, right: ['established', 'related'] } }, { return: null }] } };
const BLOCK = {
  filesystem: { read_only_root: true, writable: ['/hoody/storage/apps/web/data'] },
  network: { bind_ports: [8000], ingress_allow_from: ['203.0.113.0/24'], ingress_rate_limit: '50/s' },
  process: { max_memory: '256M', max_pids: 64 },
};
const EFFECTIVE = { bwrap_argv: ['<sandbox runtime>', '<isolation flags and mounts>', '<opened-at-launch>', '/hoody/storage/apps/web/data', '<program argv>'], scope_argv: ['<process-limit runner>', '<limits: max_memory 256M, max_pids 64>', '<program argv>'] };
const NO_LIVE = { table_present: false, chain: null, rules: [] };

export const UNCONFINED_LINE =
  'a definition of this program may still be running UNCONFINED (reload failed); its firewall records are retained, and its ports stay reserved, until nothing, or only this program\'s own sandboxed process, is measured running under ["web"]';

export const statusSamples = {
  none: { success: true, configured: null, rev: null, effective: null, live: NO_LIVE, firewall: 'none', problems: [] },
  set: { success: true, configured: BLOCK, rev: '3f9c1a2b7e4d', effective: EFFECTIVE, live: { table_present: true, chain: 'hd_12_3f9c1a2b7e4d', rules: [RULE] }, firewall: 'ok', problems: [] },
  limitsOnly: { success: true, configured: { process: { max_memory: '512M', max_pids: 256, private_tmp: true } }, rev: 'a1b2c3d4e5f6', effective: EFFECTIVE, live: NO_LIVE, firewall: 'none', problems: [] },
  restricted: { success: true, configured: { network: { mode: 'restricted', connect_ports: [] } }, rev: 'b1b2c3d4e5f6', effective: EFFECTIVE, live: NO_LIVE, firewall: 'none', problems: [] },
  tmpSized: { success: true, configured: { process: { private_tmp: true, tmp_size: '64M' } }, rev: 'c1b2c3d4e5f6', effective: EFFECTIVE, live: NO_LIVE, firewall: 'none', problems: [] },
  /** A hand-edited block that restricts nothing: stored, but no revision. */
  inactive: { success: true, configured: { network: { ingress_allow_platform: true } }, rev: null, effective: null, live: NO_LIVE, firewall: 'none', problems: [] },
  drainingWithBlock: { success: true, configured: BLOCK, rev: 'a1b2c3d4e5f6', effective: EFFECTIVE, live: { table_present: true, chain: 'hd_12_a1b2c3d4e5f6', rules: [RULE] }, firewall: 'draining', problems: [] },
  /** The block was cleared; the old revision's rules stay until its instances stop. */
  drainingCleared: { success: true, configured: null, rev: null, effective: null, live: { table_present: true, chain: null, rules: [] }, firewall: 'draining', problems: [] },
  /** The block was cleared but an earlier unwrapped definition may still run. */
  unconfinedCleared: { success: true, configured: null, rev: null, effective: null, live: { table_present: true, chain: null, rules: [] }, firewall: 'degraded', problems: [UNCONFINED_LINE] },
  tableMismatch: { success: true, configured: BLOCK, rev: '3f9c1a2b7e4d', effective: EFFECTIVE, live: { table_present: false, chain: 'hd_12_3f9c1a2b7e4d', rules: [] }, firewall: 'degraded', problems: ['live table does not match the committed fingerprint (missing, unreadable, or changed outside the daemon)'] },
  invalid: { success: true, configured: BLOCK, rev: null, effective: null, live: NO_LIVE, firewall: 'degraded', problems: ['policy does not validate: sandbox.filesystem.writable "/hoody/storage/apps/web/data": No such file or directory (os error 2)'] },
  stateUnreadable: { success: true, configured: BLOCK, rev: '3f9c1a2b7e4d', effective: EFFECTIVE, live: NO_LIVE, firewall: 'degraded', problems: ['firewall state unreadable: permission denied'] },
  retirementPending: { success: true, configured: BLOCK, rev: '3f9c1a2b7e4d', effective: EFFECTIVE, live: { table_present: true, chain: 'hd_12_3f9c1a2b7e4d', rules: [RULE] }, firewall: 'degraded', problems: ['active firewall record for revision 0a0b0c0d0e0f does not match the current policy; its retirement is pending'] },
  /** The daemon's invariant broken: problems with firewall ok (read as degraded). */
  brokenInvariant: { success: true, configured: BLOCK, rev: '3f9c1a2b7e4d', effective: EFFECTIVE, live: NO_LIVE, firewall: 'ok', problems: ['something'] },
  malformed: { success: true, configured: 'yes', firewall: 'ok', problems: [] },
} as const;

const HOST_OK = { bwrap: true, nft: true, systemd_run: true, landlock_abi: 6, bwrap_version: '0.12.0', bwrap_tmpfs_size: true, firewall: 'ok' };
export const hostSamples = {
  ok: HOST_OK,
  noBwrap: { ...HOST_OK, bwrap: false, bwrap_version: null },
  noSystemdRun: { ...HOST_OK, systemd_run: false },
  noNft: { ...HOST_OK, nft: false },
  oldLandlock: { ...HOST_OK, landlock_abi: 3 },
  noTmpfsSize: { ...HOST_OK, bwrap_version: '0.9.0', bwrap_tmpfs_size: false },
  fwDegraded: { ...HOST_OK, firewall: 'degraded' },
} as const;

/** GET /programs/{id} answers (no real secret: the values are invented to exercise the scrub). */
export const programSamples = {
  plain: { success: true, program: { id: 7, name: 'web', user: 'hoody', enabled: true, boot: true, lazy_load: false, hoody_kit: false, directory: '/hoody/storage/apps/web', port_range: null, ready_port: 8000, environment: { PORT: '8000', MODE: 'prod' } } },
  badEnv: { success: true, program: { id: 7, name: 'web', user: 'hoody', enabled: true, boot: true, directory: '/hoody/storage/apps/web', ready_port: 8000, environment: { API_TOKEN: 'sk-"FAKE%VALUE', LD_PRELOAD: '/x.so', HOODY_SANDBOX_TEST: '1', 'bad-name': 'v', OK: 'fine' } } },
  root: { success: true, program: { id: 7, name: 'web', user: 'root', enabled: true, boot: true, directory: '/root/web', environment: {} } },
  noPorts: { success: true, program: { id: 7, name: 'job', user: 'hoody', enabled: true, boot: false, lazy_load: false, directory: '/hoody/storage/apps/job', environment: {} } },
  disabled: { success: true, program: { id: 7, name: 'web', user: 'hoody', enabled: false, boot: true, directory: '/hoody/storage/apps/web', ready_port: 8000, environment: {} } },
} as const;
