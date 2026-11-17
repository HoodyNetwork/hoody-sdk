> _**CLI skill · `vm` namespace** · ~5,288 tokens · hoody-sdk v1.0.1_

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
- KVM: the service never falls back to software emulation. Read `hoody vm capabilities get` first: with `kvm_present: false` no VM can launch, and a start that reaches launch is refused with `KvmUnavailable` (a start refused earlier, for a wrong state or a full share quota, answers with that error instead).
- Every `hoody vm` command acts on the computer named by the global `-c <computerId>`, else `HOODY_COMPUTER` / `HOODY_COMPUTER_ID`, else the computer saved in the CLI config. With no computer resolved the CLI refuses before sending anything.

## Capability URL

`https://{projectId}-{computerId}-vm-{n}.{server}.computers.hoody.com`, with every path under `/api/v1/vm`. One VM service runs per computer, so `n` is normally `1`. → See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Check the host, then create a VM and wait for it

Steps:
1. `hoody vm capabilities get` — confirm `kvm_present` and the memory ceiling.
2. `hoody vm templates list` — pick a template id. The other `source` types are `blank`, `iso`, `offline-file`, `vm-disk` (a copy of another VM's disk) and `snapshot-artifact` (an imported snapshot).
3. `hoody vm create` — `name`, `vcpus`, `memory_mib` and `source` are required. With a `snapshot-artifact` source, `bus` (`virtio` or `sata`, the bus the guest was installed on) is required as well. The answer is 202: the create continues in the background.
4. `hoody vm get` — poll until `progress.phase` is `committed` or `failed`. A background failure is in `progress.error`, not in the create call's status. An answer without `progress` (the service restarted since the create) means the VM already exists: read its `state` instead of waiting.

### 2. Start a VM and read a refused start correctly

Steps:
1. `hoody vm start` — answers 200 for most refusals (missing KVM, memory, KVM limits, TPM, audio and display checks, launch failures); a wrong state, an operation in progress, an orphaned VM and a full share quota are 409 / 507 errors instead (see Common errors). If `error` is populated, the start was refused, and the code is at `error.error.code`, even while `state` still reads `Starting`.
2. `hoody vm get` — otherwise poll until `state` is `Running` or `Failed`. A failure that happens after the start was accepted shows as `state: Failed` with a prose `reason` and, when the kit can name the cause, the same nested `error`; a guest that ran and later exited has the `reason` only.
3. `hoody vm stop` asks the guest to power down; `hoody vm stop --force` stops it without waiting.

### 3. Install an OS from an ISO you upload

Steps:
1. `hoody vm isos create` — declare the image by its sha256 and total `bytes`. A `phase: ready` answer means the image is already published. Otherwise compare the returned `bytes` with the declared total: equal means call `hoody vm isos finalize`; fewer means resume at `next_part`. Do not read a missing or present `next_part` as the end of the upload.
2. `hoody vm isos upload` — send the parts in order; every part except the last is exactly `part_size` bytes.
3. `hoody vm isos finalize` — hashes the stored bytes and publishes the image when they match its sha256.
4. `hoody vm create` — with an `iso` source: the image's `sha256` and the size of the new disk in `gib`.

### 4. Fetch an ISO from a URL instead

Steps:
1. `hoody vm osinfo list` — find an installer image and the URL it can be fetched from.
2. `hoody vm isos downloads start` — answers 202 with a download job.
3. `hoody vm isos downloads get` — poll until `state` leaves `running` and `verifying`. `ready` is the only success: create the VM from the job's `sha256`. `failed` (reason in `error`), `cancelled` and `interrupted` are final; start a new download.

### 5. Take, restore and move snapshots

Steps:
1. `hoody vm snapshots create` — the VM must not be running: `Stopped`, or `Failed` after a start that left no process (a `Failed` VM whose guest is still alive is refused with 409 `BadState`). The snapshot holds the disk, the UEFI varstore and the TPM state.
2. `hoody vm snapshots list` — each entry says whether the snapshot fits this VM (`restorable`) and, if not, why (`blocked_reason`). It does not check that the VM is stopped: restoring a running VM is `409`.
3. `hoody vm snapshots restore` — replaces the VM's disk, varstore and TPM state in one step; the VM must not be running (same rule as create).
4. To move a VM: `hoody vm snapshots export create`, then `hoody vm snapshots export get` for every part; on the other computer `hoody vm imports create`, `hoody vm imports upload`, `hoody vm imports finalize`, then create a VM with a `snapshot-artifact` source naming the import's sha256, plus `memory_mib`, `vcpus` and the `bus` the guest was installed on (the artifact records none of them), and a `display` when the artifact has a sound card (it keeps the card but not the display; without one the create is refused with 400 `SpecInvalid`); an artifact with TPM state (every Windows 11 guest) also needs the `--source-duplicate-tpm-identity` flag (the source's `duplicate_tpm_identity`), beside `--source-type snapshot-artifact --source-sha256 <sha256>`, which clones the TPM identity.

### 6. Follow VM events live

Steps:
1. `hoody vm events stream <name>` — one VM's events. The first event is that VM's current `state`. `deleted` ends the stream.
2. `hoody vm events stream` — every VM's events, including VMs created after it opens. There is no opening state: read `hoody vm list` for it, and again after every `resync`.
3. Frames carry no event id and nothing is replayed: after a disconnect, open a new stream. The CLI reconnects by itself, without replay, looking the name up again each time (so it can follow a VM re-created under that name); `--no-reconnect` exits when the stream closes, as after `deleted`.

## Quirks & gotchas

- `os` fills the fields you leave out (an explicit value wins): `windows-11` turns on `secure_boot` and `tpm`, `windows-server` turns on `tpm`, `linux` neither. A `windows-*` preset also changes the default `bus` from `virtio` to `sata` when the computer has no virtio-win driver ISO (`capabilities.provisioning.virtio_win_iso` is `false`). `bus` and `secure_boot` cannot be changed after create.
- A start refused while it is planned still answers 200: the refusal is the populated `error` field, with the code one level deeper than it reads, at `error.error.code`.
- `KvmUnavailable` covers both a missing `/dev/kvm` and one the service cannot open; `kvm_present` is false in both cases.
- A `Failed` VM with no `error` carries only the prose `reason`: a refusal with no typed code, or a guest that reached `Running` and later exited.
- Create answers 202 and continues in the background; its `Location` header is the VM to poll.
- `hoody vm update` needs a VM that is not running (`Stopped`, or `Failed` with no live guest); a running VM is refused with 409 `BadState`, and changes take effect at the next start.
- ISO and import parts are accepted in order only: part n is taken when exactly n × `part_size` bytes are stored, and a replayed part is refused rather than applied twice.
- An unfinished upload keeps its space and is never removed automatically.
- An ISO attached to any VM cannot be deleted (409 `BadState`, naming the VMs).
- Cancelling a download is asynchronous: 204 means the request was accepted, not that the transfer has stopped.
- The per-VM stream follows the VM by `vm_id`, not by name: a new VM created under the same name is not reported on it.
- On the all-VMs stream, `resync` carries no `name`; detect it by `scope`, never by a VM name (`all` is a valid VM name).
- The part number of an ISO or import upload and of an export download is the `--part` flag; the bytes of an upload come from `--input <file>` or stdin, and an export part is saved with `--out-file`.
- The following `hoody vm` commands ask for confirmation before sending: `delete`, `reset`, `stop --force`, `force adopt`, `force markdead`, `snapshots delete`, `snapshots restore`, `snapshots export delete`, `imports delete`, `isos delete`, `isos downloads delete` and `unidentifiedruns force markdead`. Pass `-y` (`--yes`) to skip the prompt, including in unattended use. Without `-y`, the prompt reads stdin; a closed stdin or a timeout before an answer causes an error.

## Common errors

- Errors share one envelope, `{ error: { code, message, retryable, ... } }`; a deferred start failure is the same envelope nested in the VM's `error`.
- `OperationInProgress` (409): another operation on this VM has not finished, or the VM was just created and is not ready yet; read the VM with `hoody vm get` and retry.
- `Orphaned` (409): the service cannot manage the VM and the guest may still be running. If the message says the run cannot be verified, check the process yourself, then take the run over with `hoody vm force adopt`, or, once you have confirmed the guest is gone, record it as dead with `hoody vm force markdead` (accepted only when the VM's disk is no longer locked). If the message says the service has blocked the VM, both calls are refused: resolve the condition the message names, then restart hoody-vm.
- `InsufficientSpace` (507) on start: the VM's shared folder holds more than its `share_quota_bytes`; `need` and `have` give the sizes.
- `PortForwardConflict` (409): a host port is already declared by another VM, running or not.

## Related namespaces

- `display` — shows a VM's screen when the VM was created with a `display` number.
- `files` — move installer images or exported snapshot parts in and out of the computer.
- `api` — computer snapshots and the computer's proxy permissions, which also govern the VM URL.

## Reference

### `hoody vm` (54) — Virtual machines: create, run and snapshot VMs inside the computer

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody vm capabilities get` |  | read | Show the host's capabilities for running VMs, KVM included | `vm.kit.getCapabilities` | `hoody vm capabilities get` |
| `hoody vm cdroms change` |  | write | Change the disc in a running VM's CD-ROM slot | `vm.vms.changeCdrom` | `hoody vm cdroms change my-resource 0 --source <source>` |
| `hoody vm cdroms eject` |  | write | Eject the disc from a running VM's CD-ROM slot | `vm.vms.ejectCdrom` | `hoody vm cdroms eject my-resource 0` |
| `hoody vm console read` |  | read | Read a VM's serial console output | `vm.console.read` | `hoody vm console read my-resource` |
| `hoody vm console write` |  | write | Write to a VM's serial console (bytes from --input or stdin) | `vm.console.write` | `hoody vm console write my-resource --input ./local-file` |
| `hoody vm create` |  | write | Create a VM. Creation runs in the background (202): poll `hoody vm get <name>` for its progress | `vm.vms.create` | `hoody vm create --name my-resource --source-type blank --source-gib 10 --memory-mib 1024 --vcpus 2 --firmware uefi --bus virtio` |
| `hoody vm delete` |  | destructive | Delete a VM | `vm.vms.delete` | `hoody vm delete my-resource --force -y` |
| `hoody vm display get` |  | read | Show the browser address of a VM's screen and its display number. A VM without a display is refused with 409 DisplayNotConfigured | `vm.vms.getDisplay` | `hoody vm display get my-resource` |
| `hoody vm events stream` |  | read | Follow one VM's events live (SSE). The first event is the VM's current state; nothing is replayed on reconnect | `vm.events.stream` | `hoody vm events stream my-resource` |
| `hoody vm events stream` |  | read | Follow every VM's events live (SSE). There is no opening state: read `hoody vm list` for it | `vm.events.streamAll` | `hoody vm events stream` |
| `hoody vm force adopt` |  | destructive | Adopt an orphaned VM's run | `vm.vms.forceAdopt` | `hoody vm force adopt my-resource -y` |
| `hoody vm force markdead` |  | destructive | Mark an orphaned VM's run as dead | `vm.vms.forceMarkDead` | `hoody vm force markdead my-resource -y` |
| `hoody vm get` |  | read | Show one VM: its state, create progress and any start error | `vm.vms.get` | `hoody vm get my-resource` |
| `hoody vm guestagent get` |  | read | Check a VM's guest agent | `vm.guestAgent.get` | `hoody vm guestagent get my-resource` |
| `hoody vm guestagent inventory get` |  | read | Show the guest's inventory, as its guest agent reports it | `vm.guestAgent.getInventory` | `hoody vm guestagent inventory get my-resource` |
| `hoody vm health` |  | read | Check the VM service's health | `vm.kit.getHealth` | `hoody vm health` |
| `hoody vm imports create` |  | write | Begin or resume a snapshot artifact upload under its sha256 and size | `vm.imports.create` | `hoody vm imports create <sha256> --bytes 10` |
| `hoody vm imports delete` |  | destructive | Delete a snapshot artifact or discard an unfinished upload | `vm.imports.delete` | `hoody vm imports delete <sha256> -y` |
| `hoody vm imports finalize` |  | write | Verify and publish a snapshot artifact once every part is uploaded | `vm.imports.finalize` | `hoody vm imports finalize <sha256>` |
| `hoody vm imports get` |  | read | Show one snapshot artifact, or how far its upload has got | `vm.imports.get` | `hoody vm imports get <sha256>` |
| `hoody vm imports list` |  | read | List snapshot artifacts in the import store, both published and still uploading | `vm.imports.list` | `hoody vm imports list --watch 2s` |
| `hoody vm imports upload` |  | write | Upload one part of a snapshot artifact, in order (bytes from --input or stdin) | `vm.imports.uploadPart` | `hoody vm imports upload <sha256> --part 10 --input ./local-file` |
| `hoody vm isos create` |  | write | Begin or resume an installer image upload under its sha256 and size | `vm.isos.create` | `hoody vm isos create <sha256> --bytes 10` |
| `hoody vm isos delete` |  | destructive | Delete an installer image or discard an unfinished upload | `vm.isos.delete` | `hoody vm isos delete <sha256> -y` |
| `hoody vm isos downloads delete` |  | destructive | Cancel a running image download, or remove the record of a finished one | `vm.isos.downloads.delete` | `hoody vm isos downloads delete <id> -y` |
| `hoody vm isos downloads get` |  | read | Show one installer image download and its progress | `vm.isos.downloads.get` | `hoody vm isos downloads get <id>` |
| `hoody vm isos downloads list` |  | read | List installer image downloads | `vm.isos.downloads.list` | `hoody vm isos downloads list --watch 2s` |
| `hoody vm isos downloads start` |  | write | Download an installer image from a URL. Runs in the background (202): poll `hoody vm isos downloads get <id>` | `vm.isos.downloads.start` | `hoody vm isos downloads start --url https://example.com` |
| `hoody vm isos finalize` |  | write | Verify and publish an installer image once every part is uploaded | `vm.isos.finalize` | `hoody vm isos finalize <sha256>` |
| `hoody vm isos get` |  | read | Show one installer image, or how far its upload has got | `vm.isos.get` | `hoody vm isos get <sha256>` |
| `hoody vm isos list` |  | read | List installer images (ISO), both published and still uploading | `vm.isos.list` | `hoody vm isos list --watch 2s` |
| `hoody vm isos upload` |  | write | Upload one part of an installer image, in order (bytes from --input or stdin) | `vm.isos.uploadPart` | `hoody vm isos upload <sha256> --part 10 --input ./local-file` |
| `hoody vm keys press` |  | write | Press keys together in a running VM (up to 8, for example ctrl alt delete) | `vm.vms.pressKeys` | `hoody vm keys press my-resource --keys a --hold-ms 100` |
| `hoody vm list` |  | read | List the VMs in this computer, with their state | `vm.vms.list` | `hoody vm list --state running --watch 2s` |
| `hoody vm logs get` |  | read | Read the end of a VM's log | `vm.vms.getLogs` | `hoody vm logs get my-resource --source console --tail 200` |
| `hoody vm metrics` |  | read | Show the VM service's metrics in the Prometheus text format | `vm.kit.getMetrics` | `hoody vm metrics` |
| `hoody vm osinfo list` |  | read | List installable operating systems and the installer images published for them | `vm.osinfo.list` | `hoody vm osinfo list --arch x86_64` |
| `hoody vm pause` |  | write | Pause a running VM | `vm.vms.pause` | `hoody vm pause my-resource` |
| `hoody vm reset` |  | destructive | Reset a running VM at once, like pressing its reset button (unsaved work in the guest is lost) | `vm.vms.reset` | `hoody vm reset my-resource -y` |
| `hoody vm resume` |  | write | Resume a paused VM | `vm.vms.resume` | `hoody vm resume my-resource` |
| `hoody vm snapshots create` |  | write | Snapshot a VM that is not running: its disk, UEFI varstore and TPM state under a label | `vm.snapshots.create` | `hoody vm snapshots create my-resource --label my-label` |
| `hoody vm snapshots delete` |  | destructive | Delete a snapshot | `vm.snapshots.delete` | `hoody vm snapshots delete my-resource my-label -y` |
| `hoody vm snapshots export create` |  | write | Prepare a snapshot for download as one artifact, fetched in parts | `vm.snapshots.export.create` | `hoody vm snapshots export create my-resource my-label` |
| `hoody vm snapshots export delete` |  | destructive | Release a prepared snapshot export | `vm.snapshots.export.delete` | `hoody vm snapshots export delete my-resource my-label -y` |
| `hoody vm snapshots export get` |  | read | Download one part of a prepared snapshot export (save it with --out-file) | `vm.snapshots.export.getPart` | `hoody vm snapshots export get my-resource my-label --part 10` |
| `hoody vm snapshots list` |  | read | List a VM's snapshots | `vm.snapshots.list` | `hoody vm snapshots list my-resource --watch 2s` |
| `hoody vm snapshots restore` |  | destructive | Roll a VM that is not running back to a snapshot, replacing its disk, UEFI varstore and TPM state | `vm.snapshots.restore` | `hoody vm snapshots restore my-resource my-label -y` |
| `hoody vm start` |  | write | Start a VM. A refused start is reported in the VM's `error` and `reason`: poll `hoody vm get <name>` until it reads Running or Failed | `vm.vms.start` | `hoody vm start my-resource` |
| `hoody vm stop` |  | write | Stop a VM gracefully: ask its guest to power down | `vm.vms.stop` | `hoody vm stop my-resource --grace-seconds 10` |
| `hoody vm stop` |  | destructive | Force a VM to stop without waiting for its guest | `vm.vms.forceStop` | `hoody vm stop my-resource --force -y` |
| `hoody vm templates list` |  | read | List the templates VMs can be created from | `vm.templates.list` | `hoody vm templates list --watch 2s` |
| `hoody vm unidentifiedruns force markdead` |  | destructive | Mark an unidentified run as dead | `vm.unidentifiedRuns.forceMarkDead` | `hoody vm unidentifiedruns force markdead 4f1c9a2e7b3d5a60 --confirm-run 4f1c9a2e7b3d5a60 -y` |
| `hoody vm unidentifiedruns list` |  | read | List VM runs that hold memory under no VM name | `vm.unidentifiedRuns.list` | `hoody vm unidentifiedruns list --watch 2s` |
| `hoody vm update` |  | write | Reconfigure a VM that is not running (memory, CPU count, disk size, display, CD-ROMs, port forwards, autostart, disk limits) | `vm.vms.update` | `hoody vm update my-resource --memory-mib 10 --vcpus 10` |

