# `vm` — 54 methods

**Version:** 1.0.1
**Accessor:** `client.vm`

```typescript
import * as vm from 'hoody-sdk/vm';
```

---

## `client.vm.console` (2 methods)

### `read`

**GET** `/api/v1/vm/vms/{name}/console`

Read a VM's serial console

```typescript
client.vm.console.read(name: string, options?: { cursor?: string }): Promise<ApiResponse<ArrayBuffer>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |
| `cursor` | `string` | No | query | The `x-hoody-console-cursor` value from a previous read, to continue where it stopped. Omit it (or send it empty) to start at the beginning of the current run's output. The value is opaque: do not build or edit one. |

**Returns:** `ApiResponse<ArrayBuffer>`

**CLI:** `hoody vm console read`

---

### `write`

**POST** `/api/v1/vm/vms/{name}/console`

Write to a VM's serial console

```typescript
client.vm.console.write(name: string, data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |
| `data` | `Blob \| ArrayBuffer \| Uint8Array \| ReadableStream&lt;Uint8Array&gt; \| string` | Yes | body |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody vm console write`

---

## `client.vm.events` (2 methods)

### `stream`

**GET** `/api/v1/vm/vms/{name}/events`

Stream one VM's events

```typescript
client.vm.events.stream(name: string, options?: { events?: string }): Promise<IEventStream<Record<never, string>, ITypedStreamEvent<VmEventsStreamFrames>>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |
| `events` | `string` | No | query | Comma-separated event kinds to receive: state, progress, sidecar, qmp-error, snapshot, share-quota, monitor-stalled. Omit the parameter to receive all of them; an empty value (`events=` with no kinds) is refused with 400, as is an unknown kind. `deleted` and `resync` are sent whatever this parameter says, and cannot be named here. The opening `state` snapshot is sent regardless; the filter applies to the events after it. |

**Returns:** `IEventStream<Record<never, string>, ITypedStreamEvent<VmEventsStreamFrames>>`

**CLI:** `hoody vm events stream`

---

### `streamAll`

**GET** `/api/v1/vm/events`

Stream every VM's events

```typescript
client.vm.events.streamAll(options?: { events?: string }): Promise<IEventStream<Record<never, string>, ITypedStreamEvent<VmEventsStreamAllFrames>>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `events` | `string` | No | query | Comma-separated event kinds to receive: state, progress, sidecar, qmp-error, snapshot, share-quota, monitor-stalled. Omit the parameter to receive all of them; an empty value (`events=` with no kinds) is refused with 400, as is an unknown kind. `deleted` and `resync` are sent whatever this parameter says, and cannot be named here. |

**Returns:** `IEventStream<Record<never, string>, ITypedStreamEvent<VmEventsStreamAllFrames>>`

**CLI:** `hoody vm events stream`

---

## `client.vm.guestAgent` (2 methods)

### `get`

**GET** `/api/v1/vm/vms/{name}/agent`

Check the guest agent

```typescript
client.vm.guestAgent.get(name: string): Promise<VmGuestAgentGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |

**Returns:** `VmGuestAgentGetResponse`

**CLI:** `hoody vm guestagent get`

---

### `getInventory`

**GET** `/api/v1/vm/vms/{name}/agent/inventory`

Get the guest's inventory

```typescript
client.vm.guestAgent.getInventory(name: string): Promise<VmGuestAgentGetInventoryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |

**Returns:** `VmGuestAgentGetInventoryResponse`

**CLI:** `hoody vm guestagent inventory get`

---

## `client.vm.imports` (6 methods)

### `create`

**POST** `/api/v1/vm/imports/{sha256}`

Begin or resume a snapshot artifact upload

```typescript
client.vm.imports.create(sha256: string, data: VmImportsCreateRequest): Promise<VmImportsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `sha256` | `string` | Yes | path |  |
| `data` | `VmImportsCreateRequest` | Yes | body |  |

**Returns:** `VmImportsCreateResponse`

**CLI:** `hoody vm imports create`

---

### `delete`

**DELETE** `/api/v1/vm/imports/{sha256}`

Delete a snapshot artifact

```typescript
client.vm.imports.delete(sha256: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `sha256` | `string` | Yes | path |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody vm imports delete`

---

### `finalize`

**POST** `/api/v1/vm/imports/{sha256}/finalize`

Verify and publish a snapshot artifact

```typescript
client.vm.imports.finalize(sha256: string): Promise<VmImportsFinalizeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `sha256` | `string` | Yes | path |  |

**Returns:** `VmImportsFinalizeResponse`

**CLI:** `hoody vm imports finalize`

---

### `get`

**GET** `/api/v1/vm/imports/{sha256}`

Get a snapshot artifact

```typescript
client.vm.imports.get(sha256: string): Promise<VmImportsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `sha256` | `string` | Yes | path |  |

**Returns:** `VmImportsGetResponse`

**CLI:** `hoody vm imports get`

---

### `list`

**GET** `/api/v1/vm/imports`

List snapshot artifacts

```typescript
client.vm.imports.list(): Promise<VmImportsListResponse>
```

**Returns:** `VmImportsListResponse`

**CLI:** `hoody vm imports list`

---

### `uploadPart`

**PUT** `/api/v1/vm/imports/{sha256}/parts/{part}`

Upload one part of a snapshot artifact

```typescript
client.vm.imports.uploadPart(sha256: string, part: number, data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string): Promise<VmImportsUploadPartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `sha256` | `string` | Yes | path |  |
| `part` | `number` | Yes | path | Zero-based part index. Part n covers bytes [n*part_size, (n+1)*part_size). |
| `data` | `Blob \| ArrayBuffer \| Uint8Array \| ReadableStream&lt;Uint8Array&gt; \| string` | Yes | body |  |

**Returns:** `VmImportsUploadPartResponse`

**CLI:** `hoody vm imports upload`

---

## `client.vm.isos` (6 methods)

### `create`

**POST** `/api/v1/vm/isos/{sha256}`

Begin or resume an installer image upload

```typescript
client.vm.isos.create(sha256: string, data: VmIsosCreateRequest): Promise<VmIsosCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `sha256` | `string` | Yes | path |  |
| `data` | `VmIsosCreateRequest` | Yes | body |  |

**Returns:** `VmIsosCreateResponse`

**CLI:** `hoody vm isos create`

---

### `delete`

**DELETE** `/api/v1/vm/isos/{sha256}`

Delete an installer image

```typescript
client.vm.isos.delete(sha256: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `sha256` | `string` | Yes | path |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody vm isos delete`

---

### `finalize`

**POST** `/api/v1/vm/isos/{sha256}/finalize`

Verify and publish an installer image

```typescript
client.vm.isos.finalize(sha256: string): Promise<VmIsosFinalizeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `sha256` | `string` | Yes | path |  |

**Returns:** `VmIsosFinalizeResponse`

**CLI:** `hoody vm isos finalize`

---

### `get`

**GET** `/api/v1/vm/isos/{sha256}`

Get an installer image

```typescript
client.vm.isos.get(sha256: string): Promise<VmIsosGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `sha256` | `string` | Yes | path |  |

**Returns:** `VmIsosGetResponse`

**CLI:** `hoody vm isos get`

---

### `list`

**GET** `/api/v1/vm/isos`

List installer images

```typescript
client.vm.isos.list(): Promise<VmIsosListResponse>
```

**Returns:** `VmIsosListResponse`

**CLI:** `hoody vm isos list`

---

### `uploadPart`

**PUT** `/api/v1/vm/isos/{sha256}/parts/{part}`

Upload one part of an installer image

```typescript
client.vm.isos.uploadPart(sha256: string, part: number, data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string): Promise<VmIsosUploadPartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `sha256` | `string` | Yes | path |  |
| `part` | `number` | Yes | path | Zero-based part index. Part n covers bytes [n*part_size, (n+1)*part_size). |
| `data` | `Blob \| ArrayBuffer \| Uint8Array \| ReadableStream&lt;Uint8Array&gt; \| string` | Yes | body |  |

**Returns:** `VmIsosUploadPartResponse`

**CLI:** `hoody vm isos upload`

---

## `client.vm.isos.downloads` (4 methods)

### `delete`

**DELETE** `/api/v1/vm/isos/downloads/{id}`

Cancel or remove an image download

```typescript
client.vm.isos.downloads.delete(id: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody vm isos downloads delete`

---

### `get`

**GET** `/api/v1/vm/isos/downloads/{id}`

Get an image download

```typescript
client.vm.isos.downloads.get(id: string): Promise<VmIsosDownloadsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `VmIsosDownloadsGetResponse`

**CLI:** `hoody vm isos downloads get`

---

### `list`

**GET** `/api/v1/vm/isos/downloads`

List image downloads

```typescript
client.vm.isos.downloads.list(): Promise<VmIsosDownloadsListResponse>
```

**Returns:** `VmIsosDownloadsListResponse`

**CLI:** `hoody vm isos downloads list`

---

### `start`

**POST** `/api/v1/vm/isos/downloads`

Download an installer image from a URL

```typescript
client.vm.isos.downloads.start(data: VmIsosDownloadsStartRequest): Promise<VmIsosDownloadsStartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `VmIsosDownloadsStartRequest` | Yes | body |  |

**Returns:** `VmIsosDownloadsStartResponse`

**CLI:** `hoody vm isos downloads start`

---

## `client.vm.kit` (3 methods)

### `getCapabilities`

**GET** `/api/v1/vm/capabilities`

Get host capabilities

```typescript
client.vm.kit.getCapabilities(): Promise<VmKitGetCapabilitiesResponse>
```

**Returns:** `VmKitGetCapabilitiesResponse`

**CLI:** `hoody vm capabilities get`

---

### `getHealth`

**GET** `/api/v1/vm/health`

Check service health

```typescript
client.vm.kit.getHealth(): Promise<VmKitGetHealthResponse>
```

**Returns:** `VmKitGetHealthResponse`

**CLI:** `hoody vm health`

---

### `getMetrics`

**GET** `/api/v1/vm/metrics`

Get Prometheus metrics

```typescript
client.vm.kit.getMetrics(): Promise<ApiResponse<string>>
```

**Returns:** `ApiResponse<string>`

**CLI:** `hoody vm metrics`

---

## `client.vm.osinfo` (1 method)

### `list`

**GET** `/api/v1/vm/osinfo`

List installable operating systems

```typescript
client.vm.osinfo.list(options?: { arch?: string }): Promise<VmOsinfoListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `arch` | `string` | No | query | Architecture to list. Defaults to `x86_64`. `all` lists every architecture, including media this host cannot boot. |

**Returns:** `VmOsinfoListResponse`

**CLI:** `hoody vm osinfo list`

---

## `client.vm.snapshots` (4 methods)

### `create`

**POST** `/api/v1/vm/vms/{name}/snapshots`

Create a snapshot

```typescript
client.vm.snapshots.create(name: string, data: VmSnapshotsCreateRequest): Promise<VmSnapshotsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |
| `data` | `VmSnapshotsCreateRequest` | Yes | body |  |

**Returns:** `VmSnapshotsCreateResponse`

**CLI:** `hoody vm snapshots create`

---

### `delete`

**DELETE** `/api/v1/vm/vms/{name}/snapshots/{label}`

Delete a snapshot

```typescript
client.vm.snapshots.delete(name: string, label: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |
| `label` | `string` | Yes | path |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody vm snapshots delete`

---

### `list`

**GET** `/api/v1/vm/vms/{name}/snapshots`

List snapshots

```typescript
client.vm.snapshots.list(name: string): Promise<VmSnapshotsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |

**Returns:** `VmSnapshotsListResponse`

**CLI:** `hoody vm snapshots list`

---

### `restore`

**POST** `/api/v1/vm/vms/{name}/snapshots/{label}/restore`

Restore a snapshot

```typescript
client.vm.snapshots.restore(name: string, label: string): Promise<VmSnapshotsRestoreResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |
| `label` | `string` | Yes | path |  |

**Returns:** `VmSnapshotsRestoreResponse`

**CLI:** `hoody vm snapshots restore`

---

## `client.vm.snapshots.export` (3 methods)

### `create`

**POST** `/api/v1/vm/vms/{name}/snapshots/{label}/export`

Export a snapshot

```typescript
client.vm.snapshots.export.create(name: string, label: string): Promise<VmSnapshotsExportCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |
| `label` | `string` | Yes | path |  |

**Returns:** `VmSnapshotsExportCreateResponse`

**CLI:** `hoody vm snapshots export create`

---

### `delete`

**DELETE** `/api/v1/vm/vms/{name}/snapshots/{label}/export`

Release a snapshot export

```typescript
client.vm.snapshots.export.delete(name: string, label: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |
| `label` | `string` | Yes | path |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody vm snapshots export delete`

---

### `getPart`

**GET** `/api/v1/vm/vms/{name}/snapshots/{label}/export/parts/{part}`

Download one part of a snapshot export

```typescript
client.vm.snapshots.export.getPart(name: string, label: string, part: number): Promise<ApiResponse<ArrayBuffer>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |
| `label` | `string` | Yes | path |  |
| `part` | `number` | Yes | path | Zero-based part index. The part starts at byte offset `part * part_size`. |

**Returns:** `ApiResponse<ArrayBuffer>`

**CLI:** `hoody vm snapshots export get`

---

## `client.vm.templates` (1 method)

### `list`

**GET** `/api/v1/vm/templates`

List VM templates

```typescript
client.vm.templates.list(): Promise<VmTemplatesListResponse>
```

**Returns:** `VmTemplatesListResponse`

**CLI:** `hoody vm templates list`

---

## `client.vm.unidentifiedRuns` (2 methods)

### `forceMarkDead`

**POST** `/api/v1/vm/unidentified-runs/{run}/force-mark-dead`

Mark an unidentified run as dead

```typescript
client.vm.unidentifiedRuns.forceMarkDead(run: string, data: VmUnidentifiedRunsForceMarkDeadRequest): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `run` | `string` | Yes | path | The run ID from `GET /unidentified-runs`: 16 lowercase hexadecimal digits, never all zeros. |
| `data` | `VmUnidentifiedRunsForceMarkDeadRequest` | Yes | body |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody vm unidentifiedruns force markdead`

---

### `list`

**GET** `/api/v1/vm/unidentified-runs`

List runs that hold memory under no VM name

```typescript
client.vm.unidentifiedRuns.list(): Promise<VmUnidentifiedRunsListResponse>
```

**Returns:** `VmUnidentifiedRunsListResponse`

**CLI:** `hoody vm unidentifiedruns list`

---

## `client.vm.vms` (18 methods)

### `changeCdrom`

**PUT** `/api/v1/vm/vms/{name}/cdroms/{slot}`

Change the disc in a running VM's CD-ROM slot

```typescript
client.vm.vms.changeCdrom(name: string, slot: number, data: VmVmsChangeCdromRequest): Promise<VmVmsChangeCdromResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |
| `slot` | `number` | Yes | path | The CD-ROM slot, counted from 0 in the order of the VM's `cdroms`. Slot 0 is the one the VM boots from. |
| `data` | `VmVmsChangeCdromRequest` | Yes | body |  |

**Returns:** `VmVmsChangeCdromResponse`

**CLI:** `hoody vm cdroms change`

---

### `create`

**POST** `/api/v1/vm/vms`

Create a VM

```typescript
client.vm.vms.create(data: VmVmsCreateRequest): Promise<VmVmsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `VmVmsCreateRequest` | Yes | body |  |

**Returns:** `VmVmsCreateResponse`

**CLI:** `hoody vm create`

---

### `delete`

**DELETE** `/api/v1/vm/vms/{name}`

Delete a VM

```typescript
client.vm.vms.delete(name: string, options?: { force?: boolean }): Promise<VmVmsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |
| `force` | `boolean` | No | query | `force`, `force=true` or `force=1`: delete the VM even if it is running, stopping it first without asking the guest to shut down. Absent, `false` or `0`: a running VM is refused with 409 `BadState`. Any other value is refused with 400 `SpecInvalid`. |

**Returns:** `VmVmsDeleteResponse`

**CLI:** `hoody vm delete`

---

### `ejectCdrom`

**DELETE** `/api/v1/vm/vms/{name}/cdroms/{slot}`

Eject the disc from a running VM's CD-ROM slot

```typescript
client.vm.vms.ejectCdrom(name: string, slot: number): Promise<VmVmsEjectCdromResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |
| `slot` | `number` | Yes | path | The CD-ROM slot, counted from 0 in the order of the VM's `cdroms`. Slot 0 is the one the VM boots from. |

**Returns:** `VmVmsEjectCdromResponse`

**CLI:** `hoody vm cdroms eject`

---

### `forceAdopt`

**POST** `/api/v1/vm/vms/{name}/force-adopt`

Adopt an orphaned VM's run

```typescript
client.vm.vms.forceAdopt(name: string): Promise<VmVmsForceAdoptResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |

**Returns:** `VmVmsForceAdoptResponse`

**CLI:** `hoody vm force adopt`

---

### `forceMarkDead`

**POST** `/api/v1/vm/vms/{name}/force-mark-dead`

Mark an orphaned VM's run as dead

```typescript
client.vm.vms.forceMarkDead(name: string): Promise<VmVmsForceMarkDeadResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |

**Returns:** `VmVmsForceMarkDeadResponse`

**CLI:** `hoody vm force markdead`

---

### `forceStop`

**POST** `/api/v1/vm/vms/{name}/force-stop`

Force a VM to stop

```typescript
client.vm.vms.forceStop(name: string): Promise<VmVmsForceStopResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |

**Returns:** `VmVmsForceStopResponse`

**CLI:** `hoody vm stop`

---

### `get`

**GET** `/api/v1/vm/vms/{name}`

Get a VM's state and create progress

```typescript
client.vm.vms.get(name: string): Promise<VmVmsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |

**Returns:** `VmVmsGetResponse`

**CLI:** `hoody vm get`

---

### `getDisplay`

**GET** `/api/v1/vm/vms/{name}/display`

Get the address of a VM's screen as `{name, display, url}`. Always asks for the JSON form: the route's default answer is a 302 redirect to the display page, which this method never returns. `url` is absent when the request did not arrive through the computer's `vm` URL, and for display 0.

```typescript
client.vm.vms.getDisplay(name: string, options?: object): Promise<vm_VmDisplay>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |

**Returns:** `vm_VmDisplay`

**CLI:** `hoody vm display get`

---

### `getLogs`

**GET** `/api/v1/vm/vms/{name}/log`

Read the end of a VM's log

```typescript
client.vm.vms.getLogs(name: string, options?: { source?: "console" | "qemu" | "passt" | "swtpm" | "virtiofsd"; tail?: number }): Promise<VmVmsGetLogsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |
| `source` | `"console" \| "qemu" \| "passt" \| "swtpm" \| "virtiofsd"` | No | query | Which log to read. `console` is the guest's serial console output, sanitised per line. `qemu` is the hypervisor's error output. `passt` (networking), `swtpm` (virtual TPM) and `virtiofsd` (shared folder) are the helper processes; read one when `sidecars` in the VM's detail reports it as `degraded`. |
| `tail` | `number` | No | query | Number of lines to return, counted from the end of the log. Values from 10001 through 18446744073709551615 are treated as 10000; a larger value is refused with 400 `SpecInvalid`. |

**Returns:** `VmVmsGetLogsResponse`

**CLI:** `hoody vm logs get`

---

### `list`

**GET** `/api/v1/vm/vms`

List VMs

```typescript
client.vm.vms.list(options?: { state?: string; phase?: string }): Promise<VmVmsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `state` | `string` | No | query | Comma-separated lifecycle states to keep, case-insensitive, for example `state=running` or `state=Failed,Orphaned`. An unrecognised value is refused with 400 `SpecInvalid` rather than returning an empty list. A VM that has no state yet counts as `Creating`. |
| `phase` | `string` | No | query | Comma-separated storage phases to keep: `committed`, `creating`. An unrecognised value is refused with 400 `SpecInvalid`. |

**Returns:** `VmVmsListResponse`

**CLI:** `hoody vm list`

---

### `pause`

**POST** `/api/v1/vm/vms/{name}/pause`

Pause a VM

```typescript
client.vm.vms.pause(name: string): Promise<VmVmsPauseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |

**Returns:** `VmVmsPauseResponse`

**CLI:** `hoody vm pause`

---

### `pressKeys`

**POST** `/api/v1/vm/vms/{name}/keys`

Press keys in a running VM

```typescript
client.vm.vms.pressKeys(name: string, data: VmVmsPressKeysRequest): Promise<VmVmsPressKeysResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |
| `data` | `VmVmsPressKeysRequest` | Yes | body |  |

**Returns:** `VmVmsPressKeysResponse`

**CLI:** `hoody vm keys press`

---

### `reset`

**POST** `/api/v1/vm/vms/{name}/reset`

Reset a running VM

```typescript
client.vm.vms.reset(name: string): Promise<VmVmsResetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |

**Returns:** `VmVmsResetResponse`

**CLI:** `hoody vm reset`

---

### `resume`

**POST** `/api/v1/vm/vms/{name}/resume`

Resume a paused VM

```typescript
client.vm.vms.resume(name: string): Promise<VmVmsResumeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |

**Returns:** `VmVmsResumeResponse`

**CLI:** `hoody vm resume`

---

### `start`

**POST** `/api/v1/vm/vms/{name}/start`

Start a VM

```typescript
client.vm.vms.start(name: string): Promise<VmVmsStartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |

**Returns:** `VmVmsStartResponse`

**CLI:** `hoody vm start`

---

### `stop`

**POST** `/api/v1/vm/vms/{name}/stop`

Stop a VM gracefully

```typescript
client.vm.vms.stop(name: string, data?: VmVmsStopRequest): Promise<VmVmsStopResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |
| `data` | `VmVmsStopRequest` | No | body |  |

**Returns:** `VmVmsStopResponse`

**CLI:** `hoody vm stop`

---

### `update`

**PATCH** `/api/v1/vm/vms/{name}`

Reconfigure a stopped VM

```typescript
client.vm.vms.update(name: string, data: VmVmsUpdateRequest): Promise<VmVmsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `name` | `string` | Yes | path | The VM name: lowercase letters, digits and `-`, starting with a letter or digit, at most 63 characters. |
| `data` | `VmVmsUpdateRequest` | Yes | body |  |

**Returns:** `VmVmsUpdateResponse`

**CLI:** `hoody vm update`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
