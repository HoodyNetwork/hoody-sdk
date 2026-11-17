> _**SDK skill · `vm` namespace** · ~10,392 tokens · hoody-sdk v1.0.1_

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
- KVM: the service never falls back to software emulation. Read `client.vm.kit.getCapabilities` first: with `kvm_present: false` no VM can launch, and a start that reaches launch is refused with `KvmUnavailable` (a start refused earlier, for a wrong state or a full share quota, answers with that error instead).

## Capability URL

`https://{projectId}-{computerId}-vm-{n}.{server}.computers.hoody.com`, with every path under `/api/v1/vm`. One VM service runs per computer, so `n` is normally `1`. → See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Check the host, then create a VM and wait for it

Steps:
1. `client.vm.kit.getCapabilities` — confirm `kvm_present` and the memory ceiling.
2. `client.vm.templates.list` — pick a template id. The other `source` types are `blank`, `iso`, `offline-file`, `vm-disk` (a copy of another VM's disk) and `snapshot-artifact` (an imported snapshot).
3. `client.vm.vms.create` — `name`, `vcpus`, `memory_mib` and `source` are required. With a `snapshot-artifact` source, `bus` (`virtio` or `sata`, the bus the guest was installed on) is required as well. The answer is 202: the create continues in the background.
4. `client.vm.vms.get` — poll until `progress.phase` is `committed` or `failed`. A background failure is in `progress.error`, not in the create call's status. An answer without `progress` (the service restarted since the create) means the VM already exists: read its `state` instead of waiting.

### 2. Start a VM and read a refused start correctly

Steps:
1. `client.vm.vms.start` — answers 200 for most refusals (missing KVM, memory, KVM limits, TPM, audio and display checks, launch failures); a wrong state, an operation in progress, an orphaned VM and a full share quota are 409 / 507 errors instead (see Common errors). If `error` is populated, the start was refused, and the code is at `error.error.code`, even while `state` still reads `Starting`.
2. `client.vm.vms.get` — otherwise poll until `state` is `Running` or `Failed`. A failure that happens after the start was accepted shows as `state: Failed` with a prose `reason` and, when the kit can name the cause, the same nested `error`; a guest that ran and later exited has the `reason` only.
3. `client.vm.vms.stop` asks the guest to power down; `client.vm.vms.forceStop` stops it without waiting.

### 3. Install an OS from an ISO you upload

Steps:
1. `client.vm.isos.create` — declare the image by its sha256 and total `bytes`. A `phase: ready` answer means the image is already published. Otherwise compare the returned `bytes` with the declared total: equal means call `client.vm.isos.finalize`; fewer means resume at `next_part`. Do not read a missing or present `next_part` as the end of the upload.
2. `client.vm.isos.uploadPart` — send the parts in order; every part except the last is exactly `part_size` bytes.
3. `client.vm.isos.finalize` — hashes the stored bytes and publishes the image when they match its sha256.
4. `client.vm.vms.create` — with an `iso` source: the image's `sha256` and the size of the new disk in `gib`.

### 4. Fetch an ISO from a URL instead

Steps:
1. `client.vm.osinfo.list` — find an installer image and the URL it can be fetched from.
2. `client.vm.isos.downloads.start` — answers 202 with a download job.
3. `client.vm.isos.downloads.get` — poll until `state` leaves `running` and `verifying`. `ready` is the only success: create the VM from the job's `sha256`. `failed` (reason in `error`), `cancelled` and `interrupted` are final; start a new download.

### 5. Take, restore and move snapshots

Steps:
1. `client.vm.snapshots.create` — the VM must not be running: `Stopped`, or `Failed` after a start that left no process (a `Failed` VM whose guest is still alive is refused with 409 `BadState`). The snapshot holds the disk, the UEFI varstore and the TPM state.
2. `client.vm.snapshots.list` — each entry says whether the snapshot fits this VM (`restorable`) and, if not, why (`blocked_reason`). It does not check that the VM is stopped: restoring a running VM is `409`.
3. `client.vm.snapshots.restore` — replaces the VM's disk, varstore and TPM state in one step; the VM must not be running (same rule as create).
4. To move a VM: `client.vm.snapshots.export.create`, then `client.vm.snapshots.export.getPart` for every part; on the other computer `client.vm.imports.create`, `client.vm.imports.uploadPart`, `client.vm.imports.finalize`, then create a VM with a `snapshot-artifact` source naming the import's sha256, plus `memory_mib`, `vcpus` and the `bus` the guest was installed on (the artifact records none of them), and a `display` when the artifact has a sound card (it keeps the card but not the display; without one the create is refused with 400 `SpecInvalid`); an artifact with TPM state (every Windows 11 guest) also needs `duplicate_tpm_identity: true` in the source, which clones the TPM identity.

### 6. Follow VM events live

Steps:
1. `client.vm.events.stream(name)` — one VM's events. The first event is that VM's current `state`. `deleted` ends the stream.
2. `client.vm.events.streamAll` — every VM's events, including VMs created after it opens. There is no opening state: read `client.vm.vms.list` for it, and again after every `resync`.
3. Frames carry no event id and nothing is replayed: after a disconnect, open a new stream.

## Quirks & gotchas

- `os` fills the fields you leave out (an explicit value wins): `windows-11` turns on `secure_boot` and `tpm`, `windows-server` turns on `tpm`, `linux` neither. A `windows-*` preset also changes the default `bus` from `virtio` to `sata` when the computer has no virtio-win driver ISO (`capabilities.provisioning.virtio_win_iso` is `false`). `bus` and `secure_boot` cannot be changed after create.
- `client.vm.console.read` resolves to the console bytes only: the next `cursor` and the gap indicator (`x-hoody-console-gap`: `none`, `truncated` or `run-changed`) are response headers. Read them in a client middleware (`middlewares: [{ onResponse: (ctx) => { cursor = ctx.response.headers.get('x-hoody-console-cursor'); gap = ctx.response.headers.get('x-hoody-console-gap'); return ctx; } }]` in the client config) and pass `cursor` on the next read.
- A start refused while it is planned still answers 200: the refusal is the populated `error` field, with the code one level deeper than it reads, at `error.error.code`.
- `KvmUnavailable` covers both a missing `/dev/kvm` and one the service cannot open; `kvm_present` is false in both cases.
- A `Failed` VM with no `error` carries only the prose `reason`: a refusal with no typed code, or a guest that reached `Running` and later exited.
- Create answers 202 and continues in the background; its `Location` header is the VM to poll.
- `client.vm.vms.update` needs a VM that is not running (`Stopped`, or `Failed` with no live guest); a running VM is refused with 409 `BadState`, and changes take effect at the next start.
- ISO and import parts are accepted in order only: part n is taken when exactly n × `part_size` bytes are stored, and a replayed part is refused rather than applied twice.
- An unfinished upload keeps its space and is never removed automatically.
- An ISO attached to any VM cannot be deleted (409 `BadState`, naming the VMs).
- Cancelling a download is asynchronous: 204 means the request was accepted, not that the transfer has stopped.
- The per-VM stream follows the VM by `vm_id`, not by name: a new VM created under the same name is not reported on it.
- On the all-VMs stream, `resync` carries no `name`; detect it by `scope`, never by a VM name (`all` is a valid VM name).

## Common errors

- Errors share one envelope, `{ error: { code, message, retryable, ... } }`; a deferred start failure is the same envelope nested in the VM's `error`.
- `OperationInProgress` (409): another operation on this VM has not finished, or the VM was just created and is not ready yet; read the VM with `client.vm.vms.get` and retry.
- `Orphaned` (409): the service cannot manage the VM and the guest may still be running. If the message says the run cannot be verified, check the process yourself, then take the run over with `client.vm.vms.forceAdopt`, or, once you have confirmed the guest is gone, record it as dead with `client.vm.vms.forceMarkDead` (accepted only when the VM's disk is no longer locked). If the message says the service has blocked the VM, both calls are refused: resolve the condition the message names, then restart hoody-vm.
- `InsufficientSpace` (507) on start: the VM's shared folder holds more than its `share_quota_bytes`; `need` and `have` give the sizes.
- `PortForwardConflict` (409): a host port is already declared by another VM, running or not.

## Related namespaces

- `display` — shows a VM's screen when the VM was created with a `display` number.
- `files` — move installer images or exported snapshot parts in and out of the computer.
- `api` — computer snapshots and the computer's proxy permissions, which also govern the VM URL.

## Reference

**Accessor:** `client.vm`  |  **Import:** `import * as vm from 'hoody-sdk/vm'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, computerId?, serviceIndex?, serverName? }` (`server` is the older spelling of `serverName`, which wins when both are set), which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are set by the client and are refused with a `TypeError` before the call is sent: configure the token on the client, a kit credential as `kitAuth` on `withComputer()` or the client config (`middlewareContext.kitAuth` replaces the client's `kitAuth` for one call), and use another client for another identity), `cache` (ignored here: only an `api` GET is cached, never a GET to a kit host), `responseIsFinal` (`true`: never sent again once it may have reached the server), `keyedInProgressWait` (`false`: a 409 IDEMPOTENCY_REQUEST_IN_PROGRESS is the answer, not asked again), `redactBodyKeys` (body keys whose values an ApiError shows as [REDACTED]) and `maxResponseBytes` (a response body over this many bytes is refused with code RESPONSE_TOO_LARGE, and reading stops) (no `_realm`: that one is control-plane only). When the signature shows an options object (`options?: object` is one that takes the transport options only), the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`. A signature that shows `_templateVars` itself keeps the argument order it displays. A `wsOptions` argument (WebSocket methods only) accepts just `reconnect`, `connectTimeoutMs` and `transport`; the other transport options (`timeoutMs`, `signal`, …) stay in the request options the signature shows, never in `wsOptions`.

**Reading a method.** A method that shows no **Returns:** returns the response type named after it, the words after `client.` joined in PascalCase plus `Response`: `client.vm.guestAgent.get()` returns `Promise<VmGuestAgentGetResponse>`. `data` is the request body; it has a row only where the row says more than the signature.

**Services** (the ones the notes and examples above call most come first):

- `client.vm.vms`: changeCdrom, create, delete, ejectCdrom, forceAdopt, forceMarkDead, forceStop, get, getDisplay, getLogs, list, pause, pressKeys, reset, resume, start, stop, update
- `client.vm.isos`: create, delete, finalize, get, list, uploadPart
- `client.vm.imports`: create, delete, finalize, get, list, uploadPart
- `client.vm.snapshots`: create, delete, list, restore
- `client.vm.events`: stream, streamAll
- `client.vm.isos.downloads`: delete, get, list, start
- `client.vm.kit`: getCapabilities, getHealth, getMetrics
- `client.vm.snapshots.export`: create, delete, getPart
- `client.vm.console`: read, write
- `client.vm.osinfo`: list
- `client.vm.templates`: list
- `client.vm.guestAgent`: get, getInventory
- `client.vm.unidentifiedRuns`: forceMarkDead, list

**Shared parameters.** A parameter row that repeats is printed once. When a signature shows a parameter that the method's own table does not list, its row is in the "Shared parameters" table of the method's service section when the name is there, else in the table below: same type, wire location, required mark and description. A row in a method's own table always describes that method. An SDK helper (marked as one) has no table and takes nothing from these lists.

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |

### `client.vm.vms` (18) — List, create, inspect, reconfigure and delete VMs, and stream their events

#### `changeCdrom` — Change the disc in a running VM's CD-ROM slot

```typescript
client.vm.vms.changeCdrom(name: string, slot: number, data: VmVmsChangeCdromRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `slot` | `number` | path | Yes | The CD-ROM slot, counted from 0 in the order of the VM's `cdroms`. Slot 0 is the one the VM boots from. |
| `data` | `VmVmsChangeCdromRequest` | body | Yes | Shape: `ChangeCdromRequest` under Body schemas. |

**HTTP:** `PUT /api/v1/vm/vms/{name}/cdroms/{slot}`
**CLI:** `hoody vm cdroms change <name> <slot> --source <source>`

---

#### `create` — Create a VM

```typescript
client.vm.vms.create(data: VmVmsCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `VmVmsCreateRequest` | body | Yes | Shape: `CreateVmRequest` under Body schemas. |

**HTTP:** `POST /api/v1/vm/vms`
**CLI:** `hoody vm create --name <name> --memory-mib <memory-mib> --vcpus <vcpus> --source-type <source-type>`

---

#### `delete` — Delete a VM

```typescript
client.vm.vms.delete(name: string, options?: { force?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `force` | `boolean` | query | No | `force`, `force=true` or `force=1`: delete the VM even if it is running, stopping it first without asking the guest to shut down. Absent, `false` or `0`: a running VM is refused with 409 `BadState`. Any other value is refused with 400 `SpecInvalid`. |

**HTTP:** `DELETE /api/v1/vm/vms/{name}`
**CLI:** `hoody vm delete <name>`

---

#### `ejectCdrom` — Eject the disc from a running VM's CD-ROM slot

```typescript
client.vm.vms.ejectCdrom(name: string, slot: number)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `slot` | `number` | path | Yes | The CD-ROM slot, counted from 0 in the order of the VM's `cdroms`. Slot 0 is the one the VM boots from. |

**HTTP:** `DELETE /api/v1/vm/vms/{name}/cdroms/{slot}`
**CLI:** `hoody vm cdroms eject <name> <slot>`

---

#### `forceAdopt` — Adopt an orphaned VM's run

```typescript
client.vm.vms.forceAdopt(name: string)
```

**HTTP:** `POST /api/v1/vm/vms/{name}/force-adopt`
**CLI:** `hoody vm force adopt <name>`

---

#### `forceMarkDead` — Mark an orphaned VM's run as dead

```typescript
client.vm.vms.forceMarkDead(name: string)
```

**HTTP:** `POST /api/v1/vm/vms/{name}/force-mark-dead`
**CLI:** `hoody vm force markdead <name>`

---

#### `forceStop` — Force a VM to stop

```typescript
client.vm.vms.forceStop(name: string)
```

**HTTP:** `POST /api/v1/vm/vms/{name}/force-stop`
**CLI:** `hoody vm stop <name> --force`

---

#### `get` — Get a VM's state and create progress

```typescript
client.vm.vms.get(name: string)
```

**HTTP:** `GET /api/v1/vm/vms/{name}`
**CLI:** `hoody vm get <name>`

---

#### `getDisplay` — Get the address of a VM's screen as `{name, display, url}`. Always asks for the JSON form: the route's default answer is a 302 redirect to the display page, which this method never returns. `url` is absent when the request did not arrive through the computer's `vm` URL, and for display 0.

```typescript
client.vm.vms.getDisplay(name: string, options?: object)
```

**HTTP:** `GET /api/v1/vm/vms/{name}/display?format=json`
**CLI:** `hoody vm display get <name>`

---

#### `getLogs` — Read the end of a VM's log

```typescript
client.vm.vms.getLogs(name: string, options?: { source?: "console" | "qemu" | "passt" | "swtpm" | "virtiofsd"; tail?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `source` | `"console" \| "qemu" \| "passt" \| "swtpm" \| "virtiofsd"` | query | No | Which log to read. `console` is the guest's serial console output, sanitised per line. `qemu` is the hypervisor's error output. `passt` (networking), `swtpm` (virtual TPM) and `virtiofsd` (shared folder) are the helper processes; read one when `sidecars` in the VM's detail reports it as `degraded`. |
| `tail` | `number` | query | No | Number of lines to return, counted from the end of the log. Values from 10001 through 18446744073709551615 are treated as 10000; a larger value is refused with 400 `SpecInvalid`. |

**HTTP:** `GET /api/v1/vm/vms/{name}/log`
**CLI:** `hoody vm logs get <name>`

---

#### `list` — List VMs

```typescript
client.vm.vms.list(options?: { state?: string; phase?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `state` | `string` | query | No | Comma-separated lifecycle states to keep, case-insensitive, for example `state=running` or `state=Failed,Orphaned`. An unrecognised value is refused with 400 `SpecInvalid` rather than returning an empty list. A VM that has no state yet counts as `Creating`. |
| `phase` | `string` | query | No | Comma-separated storage phases to keep: `committed`, `creating`. An unrecognised value is refused with 400 `SpecInvalid`. |

**HTTP:** `GET /api/v1/vm/vms`
**CLI:** `hoody vm list`

---

#### `pause` — Pause a VM

```typescript
client.vm.vms.pause(name: string)
```

**HTTP:** `POST /api/v1/vm/vms/{name}/pause`
**CLI:** `hoody vm pause <name>`

---

#### `pressKeys` — Press keys in a running VM

```typescript
client.vm.vms.pressKeys(name: string, data: VmVmsPressKeysRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `VmVmsPressKeysRequest` | body | Yes | Shape: `SendKeysRequest` under Body schemas. |

**HTTP:** `POST /api/v1/vm/vms/{name}/keys`
**CLI:** `hoody vm keys press <name> --keys <keys>`

---

#### `reset` — Reset a running VM

```typescript
client.vm.vms.reset(name: string)
```

**HTTP:** `POST /api/v1/vm/vms/{name}/reset`
**CLI:** `hoody vm reset <name>`

---

#### `resume` — Resume a paused VM

```typescript
client.vm.vms.resume(name: string)
```

**HTTP:** `POST /api/v1/vm/vms/{name}/resume`
**CLI:** `hoody vm resume <name>`

---

#### `start` — Start a VM

```typescript
client.vm.vms.start(name: string)
```

**HTTP:** `POST /api/v1/vm/vms/{name}/start`
**CLI:** `hoody vm start <name>`

---

#### `stop` — Stop a VM gracefully

```typescript
client.vm.vms.stop(name: string, data?: VmVmsStopRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `VmVmsStopRequest` | body | No | Shape: `StopVmRequest` under Body schemas. |

**HTTP:** `POST /api/v1/vm/vms/{name}/stop`
**CLI:** `hoody vm stop <name>`

---

#### `update` — Reconfigure a stopped VM

```typescript
client.vm.vms.update(name: string, data: VmVmsUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `VmVmsUpdateRequest` | body | Yes | Shape: `UpdateVmRequest` under Body schemas. |

**HTTP:** `PATCH /api/v1/vm/vms/{name}`
**CLI:** `hoody vm update <name>`

---

### `client.vm.isos` (6) — The installer image store, addressed by SHA-256, with chunked resumable upload

**Shared parameters of `client.vm.isos`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `sha256` | `string` | path | Yes |  |

#### `create` — Begin or resume an installer image upload

```typescript
client.vm.isos.create(sha256: string, data: VmIsosCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `VmIsosCreateRequest` | body | Yes | Shape: `BeginIsoUploadRequest` under Body schemas. |

**HTTP:** `POST /api/v1/vm/isos/{sha256}`
**CLI:** `hoody vm isos create <sha256> --bytes <bytes>`

---

#### `delete` — Delete an installer image

```typescript
client.vm.isos.delete(sha256: string)
```

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/vm/isos/{sha256}`
**CLI:** `hoody vm isos delete <sha256>`

---

#### `finalize` — Verify and publish an installer image

```typescript
client.vm.isos.finalize(sha256: string)
```

**HTTP:** `POST /api/v1/vm/isos/{sha256}/finalize`
**CLI:** `hoody vm isos finalize <sha256>`

---

#### `get` — Get an installer image

```typescript
client.vm.isos.get(sha256: string)
```

**HTTP:** `GET /api/v1/vm/isos/{sha256}`
**CLI:** `hoody vm isos get <sha256>`

---

#### `list` — List installer images

```typescript
client.vm.isos.list()
```

**HTTP:** `GET /api/v1/vm/isos`
**CLI:** `hoody vm isos list`

---

#### `uploadPart` — Upload one part of an installer image

```typescript
client.vm.isos.uploadPart(sha256: string, part: number, data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string, _templateVars?: { projectId?: string; computerId?: string; serviceIndex?: string | number; serverName?: string; server?: string }, requestOptions?: { contentType?: 'application/octet-stream' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `part` | `number` | path | Yes | Zero-based part index. Part n covers bytes [n*part_size, (n+1)*part_size). |

**HTTP:** `PUT /api/v1/vm/isos/{sha256}/parts/{part}`
**CLI:** `hoody vm isos upload <sha256> --part <part>`

---

### `client.vm.imports` (6) — The snapshot import store, addressed by SHA-256: upload an exported snapshot, then create a VM from it

**Shared parameters of `client.vm.imports`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `sha256` | `string` | path | Yes |  |

#### `create` — Begin or resume a snapshot artifact upload

```typescript
client.vm.imports.create(sha256: string, data: VmImportsCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `VmImportsCreateRequest` | body | Yes | Shape: `BeginSnapshotImportRequest` under Body schemas. |

**HTTP:** `POST /api/v1/vm/imports/{sha256}`
**CLI:** `hoody vm imports create <sha256> --bytes <bytes>`

---

#### `delete` — Delete a snapshot artifact

```typescript
client.vm.imports.delete(sha256: string)
```

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/vm/imports/{sha256}`
**CLI:** `hoody vm imports delete <sha256>`

---

#### `finalize` — Verify and publish a snapshot artifact

```typescript
client.vm.imports.finalize(sha256: string)
```

**HTTP:** `POST /api/v1/vm/imports/{sha256}/finalize`
**CLI:** `hoody vm imports finalize <sha256>`

---

#### `get` — Get a snapshot artifact

```typescript
client.vm.imports.get(sha256: string)
```

**HTTP:** `GET /api/v1/vm/imports/{sha256}`
**CLI:** `hoody vm imports get <sha256>`

---

#### `list` — List snapshot artifacts

```typescript
client.vm.imports.list()
```

**HTTP:** `GET /api/v1/vm/imports`
**CLI:** `hoody vm imports list`

---

#### `uploadPart` — Upload one part of a snapshot artifact

```typescript
client.vm.imports.uploadPart(sha256: string, part: number, data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string, _templateVars?: { projectId?: string; computerId?: string; serviceIndex?: string | number; serverName?: string; server?: string }, requestOptions?: { contentType?: 'application/octet-stream' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `part` | `number` | path | Yes | Zero-based part index. Part n covers bytes [n*part_size, (n+1)*part_size). |

**HTTP:** `PUT /api/v1/vm/imports/{sha256}/parts/{part}`
**CLI:** `hoody vm imports upload <sha256> --part <part>`

---

### `client.vm.snapshots` (4) — Capture, list, restore and delete a VM's snapshots, and export them for download

#### `create` — Create a snapshot

```typescript
client.vm.snapshots.create(name: string, data: VmSnapshotsCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `VmSnapshotsCreateRequest` | body | Yes | Shape: `CreateSnapshotRequest` under Body schemas. |

**HTTP:** `POST /api/v1/vm/vms/{name}/snapshots`
**CLI:** `hoody vm snapshots create <name> --label <label>`

---

#### `delete` — Delete a snapshot

```typescript
client.vm.snapshots.delete(name: string, label: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `label` | `string` | path | Yes |  |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/vm/vms/{name}/snapshots/{label}`
**CLI:** `hoody vm snapshots delete <name> <label>`

---

#### `list` — List snapshots

```typescript
client.vm.snapshots.list(name: string)
```

**HTTP:** `GET /api/v1/vm/vms/{name}/snapshots`
**CLI:** `hoody vm snapshots list <name>`

---

#### `restore` — Restore a snapshot

```typescript
client.vm.snapshots.restore(name: string, label: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `label` | `string` | path | Yes |  |

**HTTP:** `POST /api/v1/vm/vms/{name}/snapshots/{label}/restore`
**CLI:** `hoody vm snapshots restore <name> <label>`

---

### `client.vm.events` (2) — Live VM events (SSE)

#### `stream` — Stream one VM's events

```typescript
client.vm.events.stream(name: string, options?: { events?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `events` | `string` | query | No | Comma-separated event kinds to receive: state, progress, sidecar, qmp-error, snapshot, share-quota, monitor-stalled. Omit the parameter to receive all of them; an empty value (`events=` with no kinds) is refused with 400, as is an unknown kind. `deleted` and `resync` are sent whatever this parameter says, and cannot be named here. The opening `state` snapshot is sent regardless; the filter applies to the events after it. |

**Returns:** `Promise<IEventStream<Record<never, string>, ITypedStreamEvent<VmEventsStreamFrames>>>`  |  **HTTP:** `GET /api/v1/vm/vms/{name}/events`
**CLI:** `hoody vm events stream <name>`

---

#### `streamAll` — Stream every VM's events

```typescript
client.vm.events.streamAll(options?: { events?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `events` | `string` | query | No | Comma-separated event kinds to receive: state, progress, sidecar, qmp-error, snapshot, share-quota, monitor-stalled. Omit the parameter to receive all of them; an empty value (`events=` with no kinds) is refused with 400, as is an unknown kind. `deleted` and `resync` are sent whatever this parameter says, and cannot be named here. |

**Returns:** `Promise<IEventStream<Record<never, string>, ITypedStreamEvent<VmEventsStreamAllFrames>>>`  |  **HTTP:** `GET /api/v1/vm/events`
**CLI:** `hoody vm events stream`

---

### `client.vm.isos.downloads` (4) — Download an installer image from a URL into the image store

#### `delete` — Cancel or remove an image download

```typescript
client.vm.isos.downloads.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/vm/isos/downloads/{id}`
**CLI:** `hoody vm isos downloads delete <download>`

---

#### `get` — Get an image download

```typescript
client.vm.isos.downloads.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**HTTP:** `GET /api/v1/vm/isos/downloads/{id}`
**CLI:** `hoody vm isos downloads get <download>`

---

#### `list` — List image downloads

```typescript
client.vm.isos.downloads.list()
```

**HTTP:** `GET /api/v1/vm/isos/downloads`
**CLI:** `hoody vm isos downloads list`

---

#### `start` — Download an installer image from a URL

```typescript
client.vm.isos.downloads.start(data: VmIsosDownloadsStartRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `VmIsosDownloadsStartRequest` | body | Yes | Shape: `StartDownloadRequest` under Body schemas. |

**HTTP:** `POST /api/v1/vm/isos/downloads`
**CLI:** `hoody vm isos downloads start --url <url>`

---

### `client.vm.kit` (3) — Health and metrics

#### `getCapabilities` — Get host capabilities

```typescript
client.vm.kit.getCapabilities()
```

**HTTP:** `GET /api/v1/vm/capabilities`
**CLI:** `hoody vm capabilities get`

---

#### `getHealth` — Check service health

```typescript
client.vm.kit.getHealth()
```

**HTTP:** `GET /api/v1/vm/health`
**CLI:** `hoody vm health`

---

#### `getMetrics` — Get Prometheus metrics

```typescript
client.vm.kit.getMetrics()
```

**Returns:** `Promise<ApiResponse<string>>`  |  **HTTP:** `GET /api/v1/vm/metrics`
**CLI:** `hoody vm metrics`

---

### `client.vm.snapshots.export` (3) — Snapshot exports, downloaded in parts

**Shared parameters of `client.vm.snapshots.export`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `label` | `string` | path | Yes |  |

#### `create` — Export a snapshot

```typescript
client.vm.snapshots.export.create(name: string, label: string)
```

**HTTP:** `POST /api/v1/vm/vms/{name}/snapshots/{label}/export`
**CLI:** `hoody vm snapshots export create <name> <label>`

---

#### `delete` — Release a snapshot export

```typescript
client.vm.snapshots.export.delete(name: string, label: string)
```

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/vm/vms/{name}/snapshots/{label}/export`
**CLI:** `hoody vm snapshots export delete <name> <label>`

---

#### `getPart` — Download one part of a snapshot export

```typescript
client.vm.snapshots.export.getPart(name: string, label: string, part: number)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `part` | `number` | path | Yes | Zero-based part index. The part starts at byte offset `part * part_size`. |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /api/v1/vm/vms/{name}/snapshots/{label}/export/parts/{part}`
**CLI:** `hoody vm snapshots export get <name> <label> --part <part>`

---

### `client.vm.console` (2) — Read from and write to the guest's serial console

#### `read` — Read a VM's serial console

```typescript
client.vm.console.read(name: string, options?: { cursor?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `cursor` | `string` | query | No | The `x-hoody-console-cursor` value from a previous read, to continue where it stopped. Omit it (or send it empty) to start at the beginning of the current run's output. The value is opaque: do not build or edit one. |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /api/v1/vm/vms/{name}/console`
**CLI:** `hoody vm console read <name>`

---

#### `write` — Write to a VM's serial console

```typescript
client.vm.console.write(name: string, data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string, _templateVars?: { projectId?: string; computerId?: string; serviceIndex?: string | number; serverName?: string; server?: string }, requestOptions?: { contentType?: 'application/octet-stream' })
```

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `POST /api/v1/vm/vms/{name}/console`
**CLI:** `hoody vm console write <name>`

---

### `client.vm.osinfo` (1) — The host's operating system database: which install media exist, to choose from before uploading or downloading one

#### `list` — List installable operating systems

```typescript
client.vm.osinfo.list(options?: { arch?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `arch` | `string` | query | No | Architecture to list. Defaults to `x86_64`. `all` lists every architecture, including media this host cannot boot. |

**HTTP:** `GET /api/v1/vm/osinfo`
**CLI:** `hoody vm osinfo list`

---

### `client.vm.templates` (1) — VM templates

#### `list` — List VM templates

```typescript
client.vm.templates.list()
```

**HTTP:** `GET /api/v1/vm/templates`
**CLI:** `hoody vm templates list`

---

### `client.vm.guestAgent` (2) — What the guest agent inside the VM reports about the guest

#### `get` — Check the guest agent

```typescript
client.vm.guestAgent.get(name: string)
```

**HTTP:** `GET /api/v1/vm/vms/{name}/agent`
**CLI:** `hoody vm guestagent get <name>`

---

#### `getInventory` — Get the guest's inventory

```typescript
client.vm.guestAgent.getInventory(name: string)
```

**HTTP:** `GET /api/v1/vm/vms/{name}/agent/inventory`
**CLI:** `hoody vm guestagent inventory get <name>`

---

### `client.vm.unidentifiedRuns` (2) — Runs that still hold capacity (RAM, KVM limits) but cannot be matched to any VM name because their launch record cannot be read

#### `forceMarkDead` — Mark an unidentified run as dead

```typescript
client.vm.unidentifiedRuns.forceMarkDead(run: string, data: VmUnidentifiedRunsForceMarkDeadRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `run` | `string` | path | Yes | The run ID from `GET /unidentified-runs`: 16 lowercase hexadecimal digits, never all zeros. |
| `data` | `VmUnidentifiedRunsForceMarkDeadRequest` | body | Yes | Shape: `ClearUnidentifiedRunRequest` under Body schemas. |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `POST /api/v1/vm/unidentified-runs/{run}/force-mark-dead`
**CLI:** `hoody vm unidentifiedruns force markdead <run> --confirm-run <confirm-run>`

---

#### `list` — List runs that hold memory under no VM name

```typescript
client.vm.unidentifiedRuns.list()
```

**HTTP:** `GET /api/v1/vm/unidentified-runs`
**CLI:** `hoody vm unidentifiedruns list`


### Body schemas

- `CreateVmRequest` — `{ name*: string, source*: DiskSource, memory_mib*: int, vcpus*: int, firmware: "uefi" | "bios"="uefi", bus: "virtio" | "sata"="virtio", display: int | string | "auto", display_id: int | string | "auto", cpu: "portable" | "host"="portable", agent: bool=true, console: bool=true, console_input: bool, audio: "none" | "output"="none", share: bool=false, os: "windows-11" | "windows-server" | "linux", secure_boot: bool=false, disk_bps: int, disk_iops: int, share_quota_bytes: int, ports: PortForward[], autostart: bool=false, tpm: bool, stop_grace_seconds: int }`
- `UpdateVmRequest` — `{ memory_mib: int, vcpus: int, disk_gib: int, display: int | string | "auto" | null, display_id: int | string | "auto" | null, cdroms: (string|null)[], autostart: bool, disk_bps: int|null, disk_iops: int|null, share_quota_bytes: int|null, ports: PortForward[], stop_grace_seconds: int|null }`
  - Every field is optional and an omitted field is left unchanged. At least one field is required: an empty object is refused with 400 `SpecInvalid`. `disk_gib` cannot be combined with any other field; send it in a separate request.
- `StopVmRequest` — `{ grace_seconds: int }`
- `SendKeysRequest` — `{ keys*: ("a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l" | "m" | "n" | "o" | "p" | "q" | "r" | "s" | "t" | "u" | "v" | "w" | "x" | "y" | "z" | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "f1" | "f2" | "f3" | "f4" | "f5" | "f6" | "f7" | "f8" | "f9" | "f10" | "f11" | "f12" | "shift" | "shift_r" | "ctrl" | "ctrl_r" | "alt" | "alt_r" | "meta_l" | "meta_r" | "esc" | "tab" | "ret" | "spc" | "backspace" | "delete" | "insert" | "home" | "end" | "pgup" | "pgdn" | "up" | "down" | "left" | "right" | "caps_lock" | "num_lock" | "scroll_lock" | "sysrq" | "pause" | "menu" | "minus" | "equal" | "bracket_left" | "bracket_right" | "semicolon" | "apostrophe" | "grave_accent" | "backslash" | "comma" | "dot" | "slash" | "less" | "kp_0" | "kp_1" | "kp_2" | "kp_3" | "kp_4" | "kp_5" | "kp_6" | "kp_7" | "kp_8" | "kp_9" | "kp_add" | "kp_subtract" | "kp_multiply" | "kp_divide" | "kp_enter" | "kp_decimal")[], hold_ms: int }`
- `ChangeCdromRequest` — `{ source*: string }`
  - `source` — Absolute path of the disc image to put in the slot, as one entry of `cdroms` in `PATCH /vms/{name}`: it must exist, be a regular file, and not be part of another VM's storage. A file in this VM's shared folder (`share/`) is allowed. Opened as a raw image, never probed for a format.
- `CreateSnapshotRequest` — `{ label*: string }`
- `BeginIsoUploadRequest` — `{ bytes*: int }`
- `StartDownloadRequest` — `{ url*: string, sha256: string }`
  - `sha256` — The vendor's SHA-256 checksum, lowercase hex, if you have one. When present, the fetched bytes must hash to it or nothing is published. When absent, the bytes are published under whatever they hash to and the job reports `verification: "tofu"`.
- `BeginSnapshotImportRequest` — `{ bytes*: int }`
- `ClearUnidentifiedRunRequest` — `{ confirm_run*: string }`
  - `confirm_run` — Must equal `{run}` in the path. Naming the run twice guards against clearing the wrong one
- `DiskSource` — `{ type*: "template", id*: string } | { type*: "blank", gib*: int } | { type*: "iso", gib*: int, sha256: string, path: string } (exactly one of: sha256 | path required) | { type*: "offline-file", path*: string } | { type*: "vm-disk", name*: string } | { type*: "snapshot-artifact", sha256*: string, duplicate_tpm_identity: bool=false }`
  - The disk to create the VM from. A tagged union on `type`: each variant has its own required fields and rejects the others.
- `PortForward` — `{ proto: "tcp" | "udp"="tcp", host*: int, guest*: int }`
  - `host` — … Host ports are shared by every VM in the computer: a port already declared by another VM, even a stopped one, is refused with 409 `PortForwardConflict`. Must be at or above `capabilities.unprivileged_port_start` (1024 when that is `null`): a lower port is refused with 400 `SpecInvalid` by create and `PATCH`, and each start re-checks it against the current value, refusing the start with `SpecInvalid` in the VM's `error`.

