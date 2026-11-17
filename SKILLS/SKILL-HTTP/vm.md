> _**HTTP skill · `vm` namespace** · ~6,147 tokens · hoody-sdk v1.0.1_

# `vm` — virtual machines inside a computer: lifecycle, media, snapshots

## Purpose

Runs full virtual machines (QEMU with KVM) inside one computer. A VM is created from a template, a blank disk, an installer image or an imported snapshot, then started, stopped, paused, snapshotted and restored by name. Installer images reach the computer by a resumable upload in parts or by a download from a URL; a snapshot can be exported in parts and imported into another computer. Each VM's changes are pushed live over Server-Sent Events.

## When to use

- Run an operating system that is not the computer's own, such as Windows or another Linux distribution
- Install an OS from an ISO image, uploaded in parts or downloaded from a URL
- Keep restore points of a stopped VM and roll back to one
- Move a VM between computers by exporting a snapshot and importing it elsewhere
- Watch VM state changes as they happen instead of polling

## When NOT to use

- Running a program or a shell inside the computer itself → see `terminal`, `exec`
- Snapshots of the whole computer's filesystem → see `api` (computer snapshots)
- Seeing a VM's screen: a VM created with `display` renders on that X display, which the display kit serves → see `display`

## Prerequisites

- A computer with the `hoody-vm` service.
- KVM: the service never falls back to software emulation. Read `GET /api/v1/vm/capabilities` first: with `kvm_present: false` no VM can launch, and a start that reaches launch is refused with `KvmUnavailable` (a start refused earlier, for a wrong state or a full share quota, answers with that error instead).

## Capability URL

`https://{projectId}-{computerId}-vm-{n}.{server}.computers.hoody.com`, with every path under `/api/v1/vm`. One VM service runs per computer, so `n` is normally `1`. → See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Check the host, then create a VM and wait for it

Steps:
1. `GET /api/v1/vm/capabilities` — confirm `kvm_present` and the memory ceiling.
2. `GET /api/v1/vm/templates` — pick a template id. The other `source` types are `blank`, `iso`, `offline-file`, `vm-disk` (a copy of another VM's disk) and `snapshot-artifact` (an imported snapshot).
3. `POST /api/v1/vm/vms` — `name`, `vcpus`, `memory_mib` and `source` are required. With a `snapshot-artifact` source, `bus` (`virtio` or `sata`, the bus the guest was installed on) is required as well. The answer is 202: the create continues in the background.
4. `GET /api/v1/vm/vms/{name}` — poll until `progress.phase` is `committed` or `failed`. A background failure is in `progress.error`, not in the create call's status. An answer without `progress` (the service restarted since the create) means the VM already exists: read its `state` instead of waiting.

### 2. Start a VM and read a refused start correctly

Steps:
1. `POST /api/v1/vm/vms/{name}/start` — answers 200 for most refusals (missing KVM, memory, KVM limits, TPM, audio and display checks, launch failures); a wrong state, an operation in progress, an orphaned VM and a full share quota are 409 / 507 errors instead (see Common errors). If `error` is populated, the start was refused, and the code is at `error.error.code`, even while `state` still reads `Starting`.
2. `GET /api/v1/vm/vms/{name}` — otherwise poll until `state` is `Running` or `Failed`. A failure that happens after the start was accepted shows as `state: Failed` with a prose `reason` and, when the kit can name the cause, the same nested `error`; a guest that ran and later exited has the `reason` only.
3. `POST /api/v1/vm/vms/{name}/stop` asks the guest to power down; `POST /api/v1/vm/vms/{name}/force-stop` stops it without waiting.

### 3. Install an OS from an ISO you upload

Steps:
1. `POST /api/v1/vm/isos/{sha256}` — declare the image by its sha256 and total `bytes`. A `phase: ready` answer means the image is already published. Otherwise compare the returned `bytes` with the declared total: equal means call `POST /api/v1/vm/isos/{sha256}/finalize`; fewer means resume at `next_part`. Do not read a missing or present `next_part` as the end of the upload.
2. `PUT /api/v1/vm/isos/{sha256}/parts/{part}` — send the parts in order; every part except the last is exactly `part_size` bytes.
3. `POST /api/v1/vm/isos/{sha256}/finalize` — hashes the stored bytes and publishes the image when they match its sha256.
4. `POST /api/v1/vm/vms` — with an `iso` source: the image's `sha256` and the size of the new disk in `gib`.

### 4. Fetch an ISO from a URL instead

Steps:
1. `GET /api/v1/vm/osinfo` — find an installer image and the URL it can be fetched from.
2. `POST /api/v1/vm/isos/downloads` — answers 202 with a download job.
3. `GET /api/v1/vm/isos/downloads/{id}` — poll until `state` leaves `running` and `verifying`. `ready` is the only success: create the VM from the job's `sha256`. `failed` (reason in `error`), `cancelled` and `interrupted` are final; start a new download.

### 5. Take, restore and move snapshots

Steps:
1. `POST /api/v1/vm/vms/{name}/snapshots` — the VM must not be running: `Stopped`, or `Failed` after a start that left no process (a `Failed` VM whose guest is still alive is refused with 409 `BadState`). The snapshot holds the disk, the UEFI varstore and the TPM state.
2. `GET /api/v1/vm/vms/{name}/snapshots` — each entry says whether the snapshot fits this VM (`restorable`) and, if not, why (`blocked_reason`). It does not check that the VM is stopped: restoring a running VM is `409`.
3. `POST /api/v1/vm/vms/{name}/snapshots/{label}/restore` — replaces the VM's disk, varstore and TPM state in one step; the VM must not be running (same rule as create).
4. To move a VM: `POST /api/v1/vm/vms/{name}/snapshots/{label}/export`, then `GET /api/v1/vm/vms/{name}/snapshots/{label}/export/parts/{part}` for every part; on the other computer `POST /api/v1/vm/imports/{sha256}`, `PUT /api/v1/vm/imports/{sha256}/parts/{part}`, `POST /api/v1/vm/imports/{sha256}/finalize`, then create a VM with a `snapshot-artifact` source naming the import's sha256, plus `memory_mib`, `vcpus` and the `bus` the guest was installed on (the artifact records none of them), and a `display` when the artifact has a sound card (it keeps the card but not the display; without one the create is refused with 400 `SpecInvalid`); an artifact with TPM state (every Windows 11 guest) also needs `duplicate_tpm_identity: true` in the source, which clones the TPM identity.

### 6. Follow VM events live

Steps:
1. `GET /api/v1/vm/vms/{name}/events` — one VM's events. The first event is that VM's current `state`. `deleted` ends the stream.
2. `GET /api/v1/vm/events` — every VM's events, including VMs created after it opens. There is no opening state: read `GET /api/v1/vm/vms` for it, and again after every `resync`.
3. Frames carry no event id and nothing is replayed: after a disconnect, open a new stream.

## Quirks & gotchas

- `os` fills the fields you leave out (an explicit value wins): `windows-11` turns on `secure_boot` and `tpm`, `windows-server` turns on `tpm`, `linux` neither. A `windows-*` preset also changes the default `bus` from `virtio` to `sata` when the computer has no virtio-win driver ISO (`capabilities.provisioning.virtio_win_iso` is `false`). `bus` and `secure_boot` cannot be changed after create.
- A start refused while it is planned still answers 200: the refusal is the populated `error` field, with the code one level deeper than it reads, at `error.error.code`.
- `KvmUnavailable` covers both a missing `/dev/kvm` and one the service cannot open; `kvm_present` is false in both cases.
- A `Failed` VM with no `error` carries only the prose `reason`: a refusal with no typed code, or a guest that reached `Running` and later exited.
- Create answers 202 and continues in the background; its `Location` header is the VM to poll.
- `PATCH /api/v1/vm/vms/{name}` needs a VM that is not running (`Stopped`, or `Failed` with no live guest); a running VM is refused with 409 `BadState`, and changes take effect at the next start.
- ISO and import parts are accepted in order only: part n is taken when exactly n × `part_size` bytes are stored, and a replayed part is refused rather than applied twice.
- An unfinished upload keeps its space and is never removed automatically.
- An ISO attached to any VM cannot be deleted (409 `BadState`, naming the VMs).
- Cancelling a download is asynchronous: 204 means the request was accepted, not that the transfer has stopped.
- The per-VM stream follows the VM by `vm_id`, not by name: a new VM created under the same name is not reported on it.
- On the all-VMs stream, `resync` carries no `name`; detect it by `scope`, never by a VM name (`all` is a valid VM name).

## Common errors

- Errors share one envelope, `{ error: { code, message, retryable, ... } }`; a deferred start failure is the same envelope nested in the VM's `error`.
- `OperationInProgress` (409): another operation on this VM has not finished, or the VM was just created and is not ready yet; read the VM with `GET /api/v1/vm/vms/{name}` and retry.
- `Orphaned` (409): the service cannot manage the VM and the guest may still be running. If the message says the run cannot be verified, check the process yourself, then take the run over with `POST /api/v1/vm/vms/{name}/force-adopt`, or, once you have confirmed the guest is gone, record it as dead with `POST /api/v1/vm/vms/{name}/force-mark-dead` (accepted only when the VM's disk is no longer locked). If the message says the service has blocked the VM, both calls are refused: resolve the condition the message names, then restart hoody-vm.
- `InsufficientSpace` (507) on start: the VM's shared folder holds more than its `share_quota_bytes`; `need` and `have` give the sizes.
- `PortForwardConflict` (409): a host port is already declared by another VM, running or not.

## Related namespaces

- `display` — shows a VM's screen when the VM was created with a `display` number.
- `files` — move installer images or exported snapshot parts in and out of the computer.
- `api` — computer snapshots and the computer's proxy permissions, which also govern the VM URL.

## Reference

**Param notes for every section** (a parameter named here means this wherever a row lists it, unless its own section says otherwise):

- `name` — The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters.

### `console` (2) — Read from and write to the guest's serial console

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/vm/vms/{name}/console` | Read a VM's serial console | `?cursor` |
| `POST /api/v1/vm/vms/{name}/console` | Write to a VM's serial console | `body*:application/octet-stream` |

**Param notes:**

- `cursor` — The `x-hoody-console-cursor` value from a previous read, to continue where it stopped. Omit it (or send it empty) to start at the beginning of the current run's output. The value is opaque: do not build or edit one.

### `events` (2) — Live VM events (SSE)

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/vm/vms/{name}/events` | Stream one VM's events | `?events` |
| `GET /api/v1/vm/events` | Stream every VM's events | `?events` |

**Param notes:**

- `events` — Comma-separated event kinds to receive: state, progress, sidecar, qmp-error, snapshot, share-quota, monitor-stalled. Omit the parameter to receive all of them; an empty value (`events=` with no kinds) is refused with 400, as is an unknown kind. `deleted` and `resync` are sent whatever this parameter says, and cannot be named here. The opening `state` snapshot is sent regardless; the filter applies to the events after it. _(on `GET /api/v1/vm/vms/{name}/events`)_
- `events` — Comma-separated event kinds to receive: state, progress, sidecar, qmp-error, snapshot, share-quota, monitor-stalled. Omit the parameter to receive all of them; an empty value (`events=` with no kinds) is refused with 400, as is an unknown kind. `deleted` and `resync` are sent whatever this parameter says, and cannot be named here. _(on `GET /api/v1/vm/events`)_

### `guestAgent` (2) — What the guest agent inside the VM reports about the guest

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/vm/vms/{name}/agent` | Check the guest agent |  |
| `GET /api/v1/vm/vms/{name}/agent/inventory` | Get the guest's inventory |  |

### `imports` (6) — The snapshot import store, addressed by SHA-256: upload an exported snapshot, then create a VM from it

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/vm/imports/{sha256}` | Begin or resume a snapshot artifact upload | `body*:vm_BeginSnapshotImportRequest` |
| `DELETE /api/v1/vm/imports/{sha256}` | Delete a snapshot artifact |  |
| `POST /api/v1/vm/imports/{sha256}/finalize` | Verify and publish a snapshot artifact |  |
| `GET /api/v1/vm/imports/{sha256}` | Get a snapshot artifact |  |
| `GET /api/v1/vm/imports` | List snapshot artifacts |  |
| `PUT /api/v1/vm/imports/{sha256}/parts/{part}` | Upload one part of a snapshot artifact | `body*:application/octet-stream` |

**Param notes:**

- `part` — Zero-based part index. Part n covers bytes [n*part_size, (n+1)*part_size).

### `isos` (6) — The installer image store, addressed by SHA-256, with chunked resumable upload

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/vm/isos/{sha256}` | Begin or resume an installer image upload | `body*:vm_BeginIsoUploadRequest` |
| `DELETE /api/v1/vm/isos/{sha256}` | Delete an installer image |  |
| `POST /api/v1/vm/isos/{sha256}/finalize` | Verify and publish an installer image |  |
| `GET /api/v1/vm/isos/{sha256}` | Get an installer image |  |
| `GET /api/v1/vm/isos` | List installer images |  |
| `PUT /api/v1/vm/isos/{sha256}/parts/{part}` | Upload one part of an installer image | `body*:application/octet-stream` |

**Param notes:**

- `part` — Zero-based part index. Part n covers bytes [n*part_size, (n+1)*part_size).

### `isos.downloads` (4) — Download an installer image from a URL into the image store

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/vm/isos/downloads/{id}` | Cancel or remove an image download |  |
| `GET /api/v1/vm/isos/downloads/{id}` | Get an image download |  |
| `GET /api/v1/vm/isos/downloads` | List image downloads |  |
| `POST /api/v1/vm/isos/downloads` | Download an installer image from a URL | `body*:vm_StartDownloadRequest` |

### `kit` (3) — Health and metrics

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/vm/capabilities` | Get host capabilities |  |
| `GET /api/v1/vm/health` | Check service health |  |
| `GET /api/v1/vm/metrics` | Get Prometheus metrics |  |

### `osinfo` (1) — The host's operating system database: which install media exist, to choose from before uploading or downloading one

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/vm/osinfo` | List installable operating systems | `?arch` |

**Param notes:**

- `arch` — Architecture to list. Defaults to `x86_64`. `all` lists every architecture, including media this host cannot boot.

### `snapshots` (4) — Capture, list, restore and delete a VM's snapshots, and export them for download

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/vm/vms/{name}/snapshots` | Create a snapshot | `body*:vm_CreateSnapshotRequest` |
| `DELETE /api/v1/vm/vms/{name}/snapshots/{label}` | Delete a snapshot |  |
| `GET /api/v1/vm/vms/{name}/snapshots` | List snapshots |  |
| `POST /api/v1/vm/vms/{name}/snapshots/{label}/restore` | Restore a snapshot |  |

### `snapshots.export` (3) — Snapshot exports, downloaded in parts

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/vm/vms/{name}/snapshots/{label}/export` | Export a snapshot |  |
| `DELETE /api/v1/vm/vms/{name}/snapshots/{label}/export` | Release a snapshot export |  |
| `GET /api/v1/vm/vms/{name}/snapshots/{label}/export/parts/{part}` | Download one part of a snapshot export |  |

**Param notes:**

- `part` — Zero-based part index. The part starts at byte offset `part * part_size`.

### `templates` (1) — VM templates

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/vm/templates` | List VM templates |  |

### `unidentifiedRuns` (2) — Runs that still hold capacity (RAM, KVM limits) but cannot be matched to any VM name because their launch record cannot be read

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/vm/unidentified-runs/{run}/force-mark-dead` | Mark an unidentified run as dead | `body*:vm_ClearUnidentifiedRunRequest` |
| `GET /api/v1/vm/unidentified-runs` | List runs that hold memory under no VM name |  |

### `vms` (18) — List, create, inspect, reconfigure and delete VMs, and stream their events

| Method | Summary | Params |
|--------|---------|--------|
| `PUT /api/v1/vm/vms/{name}/cdroms/{slot}` | Change the disc in a running VM's CD-ROM slot | `body*:vm_ChangeCdromRequest` |
| `POST /api/v1/vm/vms` | Create a VM | `body*:vm_CreateVmRequest` |
| `DELETE /api/v1/vm/vms/{name}` | Delete a VM | `?force` |
| `DELETE /api/v1/vm/vms/{name}/cdroms/{slot}` | Eject the disc from a running VM's CD-ROM slot |  |
| `POST /api/v1/vm/vms/{name}/force-adopt` | Adopt an orphaned VM's run |  |
| `POST /api/v1/vm/vms/{name}/force-mark-dead` | Mark an orphaned VM's run as dead |  |
| `POST /api/v1/vm/vms/{name}/force-stop` | Force a VM to stop |  |
| `GET /api/v1/vm/vms/{name}` | Get a VM's state and create progress |  |
| `GET /api/v1/vm/vms/{name}/display` | Open a VM's screen in the browser | `?format` |
| `GET /api/v1/vm/vms/{name}/log` | Read the end of a VM's log | `?source` `?tail` |
| `GET /api/v1/vm/vms` | List VMs | `?state` `?phase` |
| `POST /api/v1/vm/vms/{name}/pause` | Pause a VM |  |
| `POST /api/v1/vm/vms/{name}/keys` | Press keys in a running VM | `body*:vm_SendKeysRequest` |
| `POST /api/v1/vm/vms/{name}/reset` | Reset a running VM |  |
| `POST /api/v1/vm/vms/{name}/resume` | Resume a paused VM |  |
| `POST /api/v1/vm/vms/{name}/start` | Start a VM |  |
| `POST /api/v1/vm/vms/{name}/stop` | Stop a VM gracefully | `body:vm_StopVmRequest` |
| `PATCH /api/v1/vm/vms/{name}` | Reconfigure a stopped VM | `body*:vm_UpdateVmRequest` |

**Param notes:**

- `slot` — The CD-ROM slot, counted from 0 in the order of the VM's `cdroms`. Slot 0 is the one the VM boots from.
- `force` — `force`, `force=true` or `force=1`: delete the VM even if it is running, stopping it first without asking the guest to shut down. Absent, `false` or `0`: a running VM is refused with 409 `BadState`. Any other value is refused with 400 `SpecInvalid`.
- `format` — `json` answers 200 with `{name, display, url}` instead of redirecting. Absent: redirect. Any other value is refused with 400 `SpecInvalid`.
- `source` — Which log to read. `console` is the guest's serial console output, sanitised per line. `qemu` is the hypervisor's error output. `passt` (networking), `swtpm` (virtual TPM) and `virtiofsd` (shared folder) are the helper processes; read one when `sidecars` in the VM's detail reports it as `degraded`.
- `tail` — Number of lines to return, counted from the end of the log. Values from 10001 through 18446744073709551615 are treated as 10000; a larger value is refused with 400 `SpecInvalid`.
- `state` — Comma-separated lifecycle states to keep, case-insensitive, for example `state=running` or `state=Failed,Orphaned`. An unrecognised value is refused with 400 `SpecInvalid` rather than returning an empty list. A VM that has no state yet counts as `Creating`.
- `phase` — Comma-separated storage phases to keep: `committed`, `creating`. An unrecognised value is refused with 400 `SpecInvalid`.


### Body schemas

- `vm_CreateVmRequest` — `{ name*: string, source*: vm_DiskSource, memory_mib*: int, vcpus*: int, firmware: "uefi" | "bios"="uefi", bus: "virtio" | "sata"="virtio", display: int | string | "auto", display_id: int | string | "auto", cpu: "portable" | "host"="portable", agent: bool=true, console: bool=true, console_input: bool, audio: "none" | "output"="none", share: bool=false, os: "windows-11" | "windows-server" | "linux", secure_boot: bool=false, disk_bps: int, disk_iops: int, share_quota_bytes: int, ports: vm_PortForward[], autostart: bool=false, tpm: bool, stop_grace_seconds: int }`
- `vm_UpdateVmRequest` — `{ memory_mib: int, vcpus: int, disk_gib: int, display: int | string | "auto" | null, display_id: int | string | "auto" | null, cdroms: (string|null)[], autostart: bool, disk_bps: int|null, disk_iops: int|null, share_quota_bytes: int|null, ports: vm_PortForward[], stop_grace_seconds: int|null }`
  - Every field is optional and an omitted field is left unchanged. At least one field is required: an empty object is refused with 400 `SpecInvalid`. `disk_gib` cannot be combined with any other field; send it in a separate request.
- `vm_StopVmRequest` — `{ grace_seconds: int }`
- `vm_SendKeysRequest` — `{ keys*: ("a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l" | "m" | "n" | "o" | "p" | "q" | "r" | "s" | "t" | "u" | "v" | "w" | "x" | "y" | "z" | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "f1" | "f2" | "f3" | "f4" | "f5" | "f6" | "f7" | "f8" | "f9" | "f10" | "f11" | "f12" | "shift" | "shift_r" | "ctrl" | "ctrl_r" | "alt" | "alt_r" | "meta_l" | "meta_r" | "esc" | "tab" | "ret" | "spc" | "backspace" | "delete" | "insert" | "home" | "end" | "pgup" | "pgdn" | "up" | "down" | "left" | "right" | "caps_lock" | "num_lock" | "scroll_lock" | "sysrq" | "pause" | "menu" | "minus" | "equal" | "bracket_left" | "bracket_right" | "semicolon" | "apostrophe" | "grave_accent" | "backslash" | "comma" | "dot" | "slash" | "less" | "kp_0" | "kp_1" | "kp_2" | "kp_3" | "kp_4" | "kp_5" | "kp_6" | "kp_7" | "kp_8" | "kp_9" | "kp_add" | "kp_subtract" | "kp_multiply" | "kp_divide" | "kp_enter" | "kp_decimal")[], hold_ms: int }`
- `vm_ChangeCdromRequest` — `{ source*: string }`
  - `source` — Absolute path of the disc image to put in the slot, as one entry of `cdroms` in `PATCH /vms/{name}`: it must exist, be a regular file, and not be part of another VM's storage. A file in this VM's shared folder (`share/`) is allowed. Opened as a raw image, never probed for a format.
- `vm_CreateSnapshotRequest` — `{ label*: string }`
- `vm_BeginIsoUploadRequest` — `{ bytes*: int }`
- `vm_StartDownloadRequest` — `{ url*: string, sha256: string }`
  - `sha256` — The vendor's SHA-256 checksum, lowercase hex, if you have one. When present, the fetched bytes must hash to it or nothing is published. When absent, the bytes are published under whatever they hash to and the job reports `verification: "tofu"`.
- `vm_BeginSnapshotImportRequest` — `{ bytes*: int }`
- `vm_ClearUnidentifiedRunRequest` — `{ confirm_run*: string }`
  - `confirm_run` — Must equal `{run}` in the path. Naming the run twice guards against clearing the wrong one
- `vm_DiskSource` — `{ type*: "template", id*: string } | { type*: "blank", gib*: int } | { type*: "iso", gib*: int, sha256: string, path: string } (exactly one of: sha256 | path required) | { type*: "offline-file", path*: string } | { type*: "vm-disk", name*: string } | { type*: "snapshot-artifact", sha256*: string, duplicate_tpm_identity: bool=false }`
  - The disk to create the VM from. A tagged union on `type`: each variant has its own required fields and rejects the others.
- `vm_PortForward` — `{ proto: "tcp" | "udp"="tcp", host*: int, guest*: int }`
  - `host` — … Host ports are shared by every VM in the computer: a port already declared by another VM, even a stopped one, is refused with 409 `PortForwardConflict`. Must be at or above `capabilities.unprivileged_port_start` (1024 when that is `null`): a lower port is refused with 400 `SpecInvalid` by create and `PATCH`, and each start re-checks it against the current value, refusing the start with `SpecInvalid` in the VM's `error`.
