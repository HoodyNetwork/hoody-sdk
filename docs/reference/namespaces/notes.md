# `notes` — 77 methods

**Version:** 1.0.1
**Accessor:** `client.notes`

```typescript
import * as notes from 'hoody-sdk/notes';
```

---

## `client.notes.avatars` (2 methods)

### `download`

**GET** `/api/v1/notes/avatars/{avatarId}`

Download an avatar image

```typescript
client.notes.avatars.download(avatarId: string): Promise<ApiResponse<ArrayBuffer>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `avatarId` | `string` | Yes | path |  |

**Returns:** `ApiResponse<ArrayBuffer>`

**CLI:** `hoody notes avatars download`

---

### `upload`

**POST** `/api/v1/notes/avatars`

Upload an avatar image

```typescript
client.notes.avatars.upload(data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string): Promise<NotesAvatarsUploadResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `Blob \| ArrayBuffer \| Uint8Array \| ReadableStream&lt;Uint8Array&gt; \| string` | Yes | body |  |

**Returns:** `NotesAvatarsUploadResponse`

**CLI:** `hoody notes avatars upload`

---

## `client.notes.collaborators` (4 methods)

### `add`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators`

Add a collaborator

```typescript
client.notes.collaborators.add(notebookId: string, nodeId: string, data: NotesCollaboratorsAddRequest, options?: { idempotencyKey?: string }): Promise<NotesCollaboratorsAddResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesCollaboratorsAddRequest` | Yes | body |  |
| `idempotencyKey` | `string` | No | header | Optional idempotency key, at most 256 characters, such as a random UUID per request. Keys are kept per notebook and user. Repeating a request that succeeded with the same key, path and body returns the stored response without adding the collaborator again. The same key with a different method, path or body returns 409. A request that failed stores nothing, so repeating it runs it again. A repeat sent while the first request is still running waits for it, up to 60 seconds, and is then handled the same way; if the first is still running then, the answer is 409. A longer key is refused with 409. |

**Returns:** `NotesCollaboratorsAddResponse`

**CLI:** `hoody notes collaborators add`

---

### `list`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators`

List collaborators

```typescript
client.notes.collaborators.list(notebookId: string, nodeId: string): Promise<NotesCollaboratorsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |

**Returns:** `NotesCollaboratorsListResponse`

**CLI:** `hoody notes collaborators list`

---

### `remove`

**DELETE** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}`

Remove a collaborator

```typescript
client.notes.collaborators.remove(notebookId: string, nodeId: string, collaboratorId: string): Promise<NotesCollaboratorsRemoveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `collaboratorId` | `string` | Yes | path |  |

**Returns:** `NotesCollaboratorsRemoveResponse`

**CLI:** `hoody notes collaborators remove`

---

### `setRole`

**PATCH** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}`

Update collaborator role

```typescript
client.notes.collaborators.setRole(notebookId: string, nodeId: string, collaboratorId: string, data: NotesCollaboratorsSetRoleRequest): Promise<NotesCollaboratorsSetRoleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `collaboratorId` | `string` | Yes | path |  |
| `data` | `NotesCollaboratorsSetRoleRequest` | Yes | body |  |

**Returns:** `NotesCollaboratorsSetRoleResponse`

**CLI:** `hoody notes collaborators role set`

---

## `client.notes.comments` (11 methods)

### `create`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments`

Create a comment

```typescript
client.notes.comments.create(notebookId: string, nodeId: string, data: NotesCommentsCreateRequest): Promise<NotesCommentsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesCommentsCreateRequest` | Yes | body |  |

**Returns:** `NotesCommentsCreateResponse`

**CLI:** `hoody notes comments create`

---

### `delete`

**DELETE** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}`

Delete a comment

```typescript
client.notes.comments.delete(notebookId: string, nodeId: string, commentId: string, options?: { expectedVersion?: number }): Promise<NotesCommentsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `commentId` | `string` | Yes | path |  |
| `expectedVersion` | `number` | No | query |  |

**Returns:** `NotesCommentsDeleteResponse`

**CLI:** `hoody notes comments delete`

---

### `list`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments`

List comments

```typescript
client.notes.comments.list(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cursor?: string }): Promise<NotesCommentsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cursor` | `string` | No | query | The nextCursor of the previous page. While cursor pagination is turned off (the default), a non-empty cursor returns 409 with code bad_request. While it is on, a non-empty cursor cannot be combined with an offset above 0; that combination or an invalid cursor returns 400 with code bad_request. |

**Returns:** `NotesCommentsListResponse`

**CLI:** `hoody notes comments list`

---

### `listAll`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments`

List comments (collect all pages)

```typescript
client.notes.comments.listAll(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cursor?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cursor` | `string` | No | query | The nextCursor of the previous page. While cursor pagination is turned off (the default), a non-empty cursor returns 409 with code bad_request. While it is on, a non-empty cursor cannot be combined with an offset above 0; that combination or an invalid cursor returns 400 with code bad_request. |

**Returns:** `unknown[]`

---

### `listAnchors`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comment-anchors`

List comment anchors

```typescript
client.notes.comments.listAnchors(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cursor?: string }): Promise<NotesCommentsListAnchorsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cursor` | `string` | No | query | The nextCursor of the previous page. A non-empty cursor cannot be combined with an offset above 0; that combination or an invalid cursor returns 400 with code bad_request. While comment anchors are turned off (the default), the endpoint returns 409 with code bad_request whatever the cursor. |

**Returns:** `NotesCommentsListAnchorsResponse`

**CLI:** `hoody notes comments anchors list`

---

### `listAnchorsAll`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comment-anchors`

List comment anchors (collect all pages)

```typescript
client.notes.comments.listAnchorsAll(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cursor?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cursor` | `string` | No | query | The nextCursor of the previous page. A non-empty cursor cannot be combined with an offset above 0; that combination or an invalid cursor returns 400 with code bad_request. While comment anchors are turned off (the default), the endpoint returns 409 with code bad_request whatever the cursor. |

**Returns:** `unknown[]`

---

### `listAnchorsIterator`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comment-anchors`

List comment anchors (async iterator)

```typescript
client.notes.comments.listAnchorsIterator(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cursor?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cursor` | `string` | No | query | The nextCursor of the previous page. A non-empty cursor cannot be combined with an offset above 0; that combination or an invalid cursor returns 400 with code bad_request. While comment anchors are turned off (the default), the endpoint returns 409 with code bad_request whatever the cursor. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listIterator`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments`

List comments (async iterator)

```typescript
client.notes.comments.listIterator(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; cursor?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `cursor` | `string` | No | query | The nextCursor of the previous page. While cursor pagination is turned off (the default), a non-empty cursor returns 409 with code bad_request. While it is on, a non-empty cursor cannot be combined with an offset above 0; that combination or an invalid cursor returns 400 with code bad_request. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `resolve`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/resolve`

Resolve a comment

```typescript
client.notes.comments.resolve(notebookId: string, nodeId: string, commentId: string, data: NotesCommentsResolveRequest): Promise<NotesCommentsResolveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `commentId` | `string` | Yes | path |  |
| `data` | `NotesCommentsResolveRequest` | Yes | body |  |

**Returns:** `NotesCommentsResolveResponse`

**CLI:** `hoody notes comments resolve`

---

### `setAnchor`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/reanchor`

Re-anchor a comment thread

```typescript
client.notes.comments.setAnchor(notebookId: string, nodeId: string, commentId: string, data: NotesCommentsSetAnchorRequest): Promise<NotesCommentsSetAnchorResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `commentId` | `string` | Yes | path |  |
| `data` | `NotesCommentsSetAnchorRequest` | Yes | body |  |

**Returns:** `NotesCommentsSetAnchorResponse`

**CLI:** `hoody notes comments anchors set`

---

### `update`

**PATCH** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}`

Edit a comment

```typescript
client.notes.comments.update(notebookId: string, nodeId: string, commentId: string, data: NotesCommentsUpdateRequest): Promise<NotesCommentsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `commentId` | `string` | Yes | path |  |
| `data` | `NotesCommentsUpdateRequest` | Yes | body |  |

**Returns:** `NotesCommentsUpdateResponse`

**CLI:** `hoody notes comments update`

---

## `client.notes.document` (6 methods)

### `append`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append`

Append blocks to a document

```typescript
client.notes.document.append(notebookId: string, nodeId: string, data: NotesDocumentAppendRequest, options?: { ifMatch?: string; idempotencyKey?: string }): Promise<NotesDocumentAppendResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesDocumentAppendRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | Optional precondition (RFC 9110): write only if the document is still at one of these ETags, as returned in the `ETag` header of a document read or write (a quoted tag, or a comma-separated list of them), or `*` for "the document exists". Otherwise the write is refused with 412 `version_conflict` and nothing changes: read the document again and retry. Without it the write is unconditional: it merges into, or replaces, whatever is stored (last writer wins). An append that repeats an `X-Idempotency-Key` it already completed is answered from the stored response without checking `If-Match` again. |
| `idempotencyKey` | `string` | No | header | Optional idempotency key (max 256 chars). Reusing the same key with an identical request body and node replays the original response; reusing it with a different body or node returns 409. |

**Returns:** `NotesDocumentAppendResponse`

**CLI:** `hoody notes document append`

---

### `createExportTicket`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/export-ticket`

Create secure HTML export ticket

```typescript
client.notes.document.createExportTicket(notebookId: string, nodeId: string, data: NotesDocumentCreateExportTicketRequest): Promise<NotesDocumentCreateExportTicketResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesDocumentCreateExportTicketRequest` | Yes | body |  |

**Returns:** `NotesDocumentCreateExportTicketResponse`

**CLI:** `hoody notes document exporttickets create`

---

### `exportBlock`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/blocks/{blockId}/svg`

Export drawing block as SVG

```typescript
client.notes.document.exportBlock(notebookId: string, nodeId: string, blockId: string, options?: { bg?: string; scale?: number }): Promise<ApiResponse<ArrayBuffer>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `blockId` | `string` | Yes | path |  |
| `bg` | `string` | No | query |  |
| `scale` | `number` | No | query |  |

**Returns:** `ApiResponse<ArrayBuffer>`

**CLI:** `hoody notes document blocks export`

---

### `get`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`

Read a notebook node's document. `output: 'md'` or `'html'` answers the rendered text; otherwise the document object.

```typescript
client.notes.document.get(notebookId: string, nodeId: string, options?: { blockIds?: string; lines?: string; output?: string; includeComments?: string; ticket?: string; ifNoneMatch?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `blockIds` | `string` | No | query |  |
| `lines` | `string` | No | query |  |
| `output` | `string` | No | query |  |
| `includeComments` | `string` | No | query |  |
| `ticket` | `string` | No | query |  |
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `ifNoneMatch` | `string` | No | header | Optional (RFC 9110): ETags of copies the caller already holds, or `*`. When the document is still at one of them the JSON output answers 304 with no body. Ignored by the Markdown and HTML outputs. |

**Returns:** `any`

**CLI:** `hoody notes document get`

---

### `set`

**PUT** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`

Create or replace document

```typescript
client.notes.document.set(notebookId: string, nodeId: string, data: NotesDocumentSetRequest, options?: { ifMatch?: string }): Promise<NotesDocumentSetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesDocumentSetRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | Optional precondition (RFC 9110): write only if the document is still at one of these ETags, as returned in the `ETag` header of a document read or write (a quoted tag, or a comma-separated list of them), or `*` for "the document exists". Otherwise the write is refused with 412 `version_conflict` and nothing changes: read the document again and retry. Without it the write is unconditional: it merges into, or replaces, whatever is stored (last writer wins). An append that repeats an `X-Idempotency-Key` it already completed is answered from the stored response without checking `If-Match` again. |

**Returns:** `NotesDocumentSetResponse`

**CLI:** `hoody notes document set`

---

### `update`

**PATCH** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`

Merge document content

```typescript
client.notes.document.update(notebookId: string, nodeId: string, data: NotesDocumentUpdateRequest, options?: { ifMatch?: string }): Promise<NotesDocumentUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesDocumentUpdateRequest` | Yes | body |  |
| `ifMatch` | `string` | No | header | Optional precondition (RFC 9110): write only if the document is still at one of these ETags, as returned in the `ETag` header of a document read or write (a quoted tag, or a comma-separated list of them), or `*` for "the document exists". Otherwise the write is refused with 412 `version_conflict` and nothing changes: read the document again and retry. Without it the write is unconditional: it merges into, or replaces, whatever is stored (last writer wins). An append that repeats an `X-Idempotency-Key` it already completed is answered from the stored response without checking `If-Match` again. |

**Returns:** `NotesDocumentUpdateResponse`

**CLI:** `hoody notes document update`

---

## `client.notes.files` (4 methods)

### `download`

**GET** `/api/v1/notes/notebooks/{notebookId}/files/{fileId}`

Download a file

```typescript
client.notes.files.download(notebookId: string, fileId: string): Promise<ApiResponse<ArrayBuffer>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `fileId` | `string` | Yes | path |  |

**Returns:** `ApiResponse<ArrayBuffer>`

**CLI:** `hoody notes files download`

---

### `list`

**GET** `/api/v1/notes/notebooks/{notebookId}/files`

List all uploaded files

```typescript
client.notes.files.list(notebookId: string, options?: { limit?: number; offset?: number }): Promise<NotesFilesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |

**Returns:** `NotesFilesListResponse`

**CLI:** `hoody notes files list`

---

### `listAll`

**GET** `/api/v1/notes/notebooks/{notebookId}/files`

List all uploaded files (collect all pages)

```typescript
client.notes.files.listAll(notebookId: string, options?: { limit?: number; offset?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/notes/notebooks/{notebookId}/files`

List all uploaded files (async iterator)

```typescript
client.notes.files.listIterator(notebookId: string, options?: { limit?: number; offset?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

## `client.notes.files.uploads` (4 methods)

### `cancel`

**DELETE** `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus`

Abort a TUS upload

```typescript
client.notes.files.uploads.cancel(notebookId: string, fileId: string, options: { tusResumable: "1.0.0" }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `fileId` | `string` | Yes | path |  |
| `tusResumable` | `"1.0.0"` | Yes | header | TUS protocol version. Every TUS request must send `1.0.0`: a missing header is refused with 412, any other value with 400. |

**Returns:** `ApiResponse<unknown>`

---

### `create`

**POST** `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus`

Create a resumable (TUS) upload

```typescript
client.notes.files.uploads.create(notebookId: string, fileId: string, options: { tusResumable: "1.0.0"; uploadLength: number; uploadMetadata?: string }): Promise<NotesFilesUploadsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `fileId` | `string` | Yes | path |  |
| `tusResumable` | `"1.0.0"` | Yes | header | TUS protocol version. Every TUS request must send `1.0.0`: a missing header is refused with 412, any other value with 400. |
| `uploadLength` | `number` | Yes | header | Total size of the file in bytes. Must equal the file node's `size` (set when the node was created), which must not exceed the notebook's maximum file size. Upload-Defer-Length is not supported. |
| `uploadMetadata` | `string` | No | header | Optional TUS metadata: comma-separated `key base64(value)` pairs. |

**Returns:** `NotesFilesUploadsCreateResponse`

---

### `getOffset`

**HEAD** `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus`

Check a TUS upload's offset (for resuming)

```typescript
client.notes.files.uploads.getOffset(notebookId: string, fileId: string, options: { tusResumable: "1.0.0" }): Promise<ApiResponse<Record<string, string>>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `fileId` | `string` | Yes | path |  |
| `tusResumable` | `"1.0.0"` | Yes | header | TUS protocol version. Every TUS request must send `1.0.0`: a missing header is refused with 412, any other value with 400. |

**Returns:** `ApiResponse<Record<string, string>>`

---

### `writeChunk`

**PATCH** `/api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus`

Upload a chunk to a TUS upload

```typescript
client.notes.files.uploads.writeChunk(notebookId: string, fileId: string, data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string, options: { tusResumable: "1.0.0"; uploadOffset: number; contentType?: 'application/offset+octet-stream' }): Promise<NotesFilesUploadsWriteChunkResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `fileId` | `string` | Yes | path |  |
| `data` | `Blob \| ArrayBuffer \| Uint8Array \| ReadableStream&lt;Uint8Array&gt; \| string` | Yes | body |  |
| `tusResumable` | `"1.0.0"` | Yes | header | TUS protocol version. Every TUS request must send `1.0.0`: a missing header is refused with 412, any other value with 400. |
| `uploadOffset` | `number` | Yes | header | Offset this chunk starts at: the value the HEAD check (or the previous chunk) returned. |
| `contentType` | `'application/offset+octet-stream'` | No | query |  |

**Returns:** `NotesFilesUploadsWriteChunkResponse`

---

## `client.notes.kit` (2 methods)

### `getCapabilities`

**GET** `/api/v1/notes/capabilities`

Optional features of this server

```typescript
client.notes.kit.getCapabilities(): Promise<NotesKitGetCapabilitiesResponse>
```

**Returns:** `NotesKitGetCapabilitiesResponse`

---

### `getHealth`

**GET** `/api/v1/notes/health`

Service health and runtime info

```typescript
client.notes.kit.getHealth(): Promise<NotesKitGetHealthResponse>
```

**Returns:** `NotesKitGetHealthResponse`

**CLI:** `hoody notes health`

---

## `client.notes.members` (2 methods)

### `invite`

**POST** `/api/v1/notes/notebooks/{notebookId}/users`

Invite users to notebook

```typescript
client.notes.members.invite(notebookId: string, data: NotesMembersInviteRequest): Promise<NotesMembersInviteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `data` | `NotesMembersInviteRequest` | Yes | body |  |

**Returns:** `NotesMembersInviteResponse`

**CLI:** `hoody notes members invite`

---

### `setRole`

**PATCH** `/api/v1/notes/notebooks/{notebookId}/users/{userId}/role`

Update user role

```typescript
client.notes.members.setRole(notebookId: string, userId: string, data: NotesMembersSetRoleRequest): Promise<NotesMembersSetRoleResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `userId` | `string` | Yes | path |  |
| `data` | `NotesMembersSetRoleRequest` | Yes | body |  |

**Returns:** `NotesMembersSetRoleResponse`

**CLI:** `hoody notes members role set`

---

## `client.notes.mutations` (1 method)

### `sync`

**POST** `/api/v1/notes/notebooks/{notebookId}/mutations`

Sync client mutations

```typescript
client.notes.mutations.sync(notebookId: string, data: NotesMutationsSyncRequest): Promise<NotesMutationsSyncResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `data` | `NotesMutationsSyncRequest` | Yes | body |  |

**Returns:** `NotesMutationsSyncResponse`

---

## `client.notes.nodes` (14 methods)

### `create`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes`

Create a node

```typescript
client.notes.nodes.create(notebookId: string, data: NotesNodesCreateRequest, options?: { idempotencyKey?: string }): Promise<NotesNodesCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `data` | `NotesNodesCreateRequest` | Yes | body |  |
| `idempotencyKey` | `string` | No | header | Optional idempotency key (max 256 chars), such as a random UUID per node. Reusing the same key with an identical request body replays the original response instead of creating a second node; reusing it with a different body returns 409. |

**Returns:** `NotesNodesCreateResponse`

**CLI:** `hoody notes nodes create`

---

### `delete`

**DELETE** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}`

Delete a node

```typescript
client.notes.nodes.delete(notebookId: string, nodeId: string): Promise<NotesNodesDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |

**Returns:** `NotesNodesDeleteResponse`

**CLI:** `hoody notes nodes delete`

---

### `get`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}`

Get a node

```typescript
client.notes.nodes.get(notebookId: string, nodeId: string): Promise<NotesNodesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |

**Returns:** `NotesNodesGetResponse`

**CLI:** `hoody notes nodes get`

---

### `list`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes`

List nodes

```typescript
client.notes.nodes.list(notebookId: string, options?: { type?: string; parentId?: string; rootId?: string; limit?: number; offset?: number }): Promise<NotesNodesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `type` | `string` | No | query |  |
| `parentId` | `string` | No | query |  |
| `rootId` | `string` | No | query |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |

**Returns:** `NotesNodesListResponse`

**CLI:** `hoody notes nodes list`

---

### `listAll`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes`

List nodes (collect all pages)

```typescript
client.notes.nodes.listAll(notebookId: string, options?: { type?: string; parentId?: string; rootId?: string; limit?: number; offset?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `type` | `string` | No | query |  |
| `parentId` | `string` | No | query |  |
| `rootId` | `string` | No | query |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |

**Returns:** `unknown[]`

---

### `listChildren`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/children`

List child nodes

```typescript
client.notes.nodes.listChildren(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number }): Promise<NotesNodesListChildrenResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |

**Returns:** `NotesNodesListChildrenResponse`

**CLI:** `hoody notes nodes children list`

---

### `listChildrenAll`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/children`

List child nodes (collect all pages)

```typescript
client.notes.nodes.listChildrenAll(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |

**Returns:** `unknown[]`

---

### `listChildrenIterator`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/children`

List child nodes (async iterator)

```typescript
client.notes.nodes.listChildrenIterator(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listIterator`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes`

List nodes (async iterator)

```typescript
client.notes.nodes.listIterator(notebookId: string, options?: { type?: string; parentId?: string; rootId?: string; limit?: number; offset?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `type` | `string` | No | query |  |
| `parentId` | `string` | No | query |  |
| `rootId` | `string` | No | query |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `listRecent`

**GET** `/api/v1/notes/notebooks/{notebookId}/recent`

List recently changed pages

```typescript
client.notes.nodes.listRecent(notebookId: string, options?: { limit?: number }): Promise<NotesNodesListRecentResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |

**Returns:** `NotesNodesListRecentResponse`

---

### `markOpened`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/opened`

Mark node as opened

```typescript
client.notes.nodes.markOpened(notebookId: string, nodeId: string, data: NotesNodesMarkOpenedRequest, options?: { idempotencyKey?: string }): Promise<NotesNodesMarkOpenedResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesNodesMarkOpenedRequest` | Yes | body |  |
| `idempotencyKey` | `string` | No | header | Optional idempotency key, at most 256 characters, such as a random UUID per request. Keys are kept per notebook and user. Repeating a request that succeeded with the same key, path and body returns the stored response without recording the open again. The same key with a different method, path or body returns 409. A request that failed stores nothing, so repeating it runs it again. A repeat sent while the first request is still running waits for it, up to 60 seconds, and is then handled the same way; if the first is still running then, the answer is 409. A longer key is refused with 409. |

**Returns:** `NotesNodesMarkOpenedResponse`

**CLI:** `hoody notes nodes markopened`

---

### `markSeen`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/seen`

Mark node as seen

```typescript
client.notes.nodes.markSeen(notebookId: string, nodeId: string, data: NotesNodesMarkSeenRequest, options?: { idempotencyKey?: string }): Promise<NotesNodesMarkSeenResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesNodesMarkSeenRequest` | Yes | body |  |
| `idempotencyKey` | `string` | No | header | Optional idempotency key, at most 256 characters, such as a random UUID per request. Keys are kept per notebook and user. Repeating a request that succeeded with the same key, path and body returns the stored response without recording the view again. The same key with a different method, path or body returns 409. A request that failed stores nothing, so repeating it runs it again. A repeat sent while the first request is still running waits for it, up to 60 seconds, and is then handled the same way; if the first is still running then, the answer is 409. A longer key is refused with 409. |

**Returns:** `NotesNodesMarkSeenResponse`

**CLI:** `hoody notes nodes markseen`

---

### `resolve`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/alias/{alias}`

Resolve page by alias

```typescript
client.notes.nodes.resolve(notebookId: string, alias: string): Promise<NotesNodesResolveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `alias` | `string` | Yes | path |  |

**Returns:** `NotesNodesResolveResponse`

**CLI:** `hoody notes nodes resolve`

---

### `update`

**PATCH** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}`

Update a node

```typescript
client.notes.nodes.update(notebookId: string, nodeId: string, data: NotesNodesUpdateRequest): Promise<NotesNodesUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesNodesUpdateRequest` | Yes | body |  |

**Returns:** `NotesNodesUpdateResponse`

**CLI:** `hoody notes nodes update`

---

## `client.notes.notebooks` (6 methods)

### `create`

**POST** `/api/v1/notes/notebooks`

Create a notebook

```typescript
client.notes.notebooks.create(data: NotesNotebooksCreateRequest): Promise<NotesNotebooksCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `NotesNotebooksCreateRequest` | Yes | body |  |

**Returns:** `NotesNotebooksCreateResponse`

**CLI:** `hoody notes notebooks create`

---

### `delete`

**DELETE** `/api/v1/notes/notebooks/{notebookId}`

Delete a notebook

```typescript
client.notes.notebooks.delete(notebookId: string): Promise<NotesNotebooksDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |

**Returns:** `NotesNotebooksDeleteResponse`

**CLI:** `hoody notes notebooks delete`

---

### `export`

**GET** `/api/v1/notes/notebooks/{notebookId}/export`

Export notes as a ZIP

```typescript
client.notes.notebooks.export(notebookId: string, options?: { nodeId?: string; format?: "md" | "html"; attachments?: "true" | "false"; comments?: "none" | "appendix"; themeMode?: "light" | "dark"; dryRun?: "true" | "false" }): Promise<ApiResponse<ArrayBuffer>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | No | query |  |
| `format` | `"md" \| "html"` | No | query |  |
| `attachments` | `"true" \| "false"` | No | query |  |
| `comments` | `"none" \| "appendix"` | No | query |  |
| `themeMode` | `"light" \| "dark"` | No | query |  |
| `dryRun` | `"true" \| "false"` | No | query |  |

**Returns:** `ApiResponse<ArrayBuffer>`

**CLI:** `hoody notes notebooks export`

---

### `get`

**GET** `/api/v1/notes/notebooks/{notebookId}`

Get notebook details

```typescript
client.notes.notebooks.get(notebookId: string): Promise<NotesNotebooksGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |

**Returns:** `NotesNotebooksGetResponse`

**CLI:** `hoody notes notebooks get`

---

### `list`

**GET** `/api/v1/notes/notebooks`

List notebooks

```typescript
client.notes.notebooks.list(): Promise<NotesNotebooksListResponse>
```

**Returns:** `NotesNotebooksListResponse`

**CLI:** `hoody notes notebooks list`

---

### `update`

**PATCH** `/api/v1/notes/notebooks/{notebookId}`

Update notebook settings

```typescript
client.notes.notebooks.update(notebookId: string, data: NotesNotebooksUpdateRequest): Promise<NotesNotebooksUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `data` | `NotesNotebooksUpdateRequest` | Yes | body |  |

**Returns:** `NotesNotebooksUpdateResponse`

**CLI:** `hoody notes notebooks update`

---

## `client.notes` (1 method)

### `whoami`

**GET** `/api/v1/notes/me`

Get current identity

```typescript
client.notes.whoami(): Promise<NotesWhoamiResponse>
```

**Returns:** `NotesWhoamiResponse`

**CLI:** `hoody notes whoami`

---

## `client.notes.reactions` (3 methods)

### `add`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions`

Add a reaction

```typescript
client.notes.reactions.add(notebookId: string, nodeId: string, data: NotesReactionsAddRequest, options?: { idempotencyKey?: string }): Promise<NotesReactionsAddResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `data` | `NotesReactionsAddRequest` | Yes | body |  |
| `idempotencyKey` | `string` | No | header | Optional idempotency key, at most 256 characters, such as a random UUID per request. Keys are kept per notebook and user. Repeating a request that succeeded with the same key, path and body returns the stored response without adding the reaction again. The same key with a different method, path or body returns 409. A request that failed stores nothing, so repeating it runs it again. A repeat sent while the first request is still running waits for it, up to 60 seconds, and is then handled the same way; if the first is still running then, the answer is 409. A longer key is refused with 409. |

**Returns:** `NotesReactionsAddResponse`

**CLI:** `hoody notes reactions add`

---

### `list`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions`

List reactions

```typescript
client.notes.reactions.list(notebookId: string, nodeId: string): Promise<NotesReactionsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |

**Returns:** `NotesReactionsListResponse`

**CLI:** `hoody notes reactions list`

---

### `remove`

**DELETE** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions/{reaction}`

Remove a reaction

```typescript
client.notes.reactions.remove(notebookId: string, nodeId: string, reaction: string): Promise<NotesReactionsRemoveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `reaction` | `string` | Yes | path |  |

**Returns:** `NotesReactionsRemoveResponse`

**CLI:** `hoody notes reactions remove`

---

## `client.notes.records` (8 methods)

### `create`

**POST** `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`

Create a database record

```typescript
client.notes.records.create(notebookId: string, databaseId: string, data?: NotesRecordsCreateRequest, options?: { idempotencyKey?: string }): Promise<NotesRecordsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `databaseId` | `string` | Yes | path |  |
| `data` | `NotesRecordsCreateRequest` | No | body |  |
| `idempotencyKey` | `string` | No | header | Optional idempotency key, at most 256 characters, such as a random UUID per request. Keys are kept per notebook and user. Repeating a request that succeeded with the same key, path and body returns the stored response instead of creating a second record. The same key with a different method, path or body returns 409. A request that failed stores nothing, so repeating it runs it again. A repeat sent while the first request is still running waits for it, up to 60 seconds, and is then handled the same way; if the first is still running then, the answer is 409. A longer key is refused with 409. |

**Returns:** `NotesRecordsCreateResponse`

**CLI:** `hoody notes records create`

---

### `delete`

**DELETE** `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}`

Delete a database record

```typescript
client.notes.records.delete(notebookId: string, databaseId: string, recordId: string): Promise<NotesRecordsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `databaseId` | `string` | Yes | path |  |
| `recordId` | `string` | Yes | path |  |

**Returns:** `NotesRecordsDeleteResponse`

**CLI:** `hoody notes records delete`

---

### `get`

**GET** `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}`

Get a database record

```typescript
client.notes.records.get(notebookId: string, databaseId: string, recordId: string): Promise<NotesRecordsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `databaseId` | `string` | Yes | path |  |
| `recordId` | `string` | Yes | path |  |

**Returns:** `NotesRecordsGetResponse`

**CLI:** `hoody notes records get`

---

### `list`

**GET** `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`

List database records

```typescript
client.notes.records.list(notebookId: string, databaseId: string, options?: { filters?: string; sorts?: string; page?: number; count?: number }): Promise<NotesRecordsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `databaseId` | `string` | Yes | path |  |
| `filters` | `string` | No | query | JSON-encoded array of filters. Each is a field filter { id, type: "field", fieldId, operator, value } or a group { id, type: "group", operator: "and" \| "or", filters }. The fieldId `name` filters on the record name. A filter on a field the database does not have is ignored. |
| `sorts` | `string` | No | query | JSON-encoded array of sorts, applied in order. Each is { id, fieldId, direction: "asc" \| "desc" }. The fieldId `name` sorts by the record name. A sort on a field the database does not have is ignored. |
| `page` | `number` | No | query |  |
| `count` | `number` | No | query |  |

**Returns:** `NotesRecordsListResponse`

**CLI:** `hoody notes records list`

---

### `listAll`

**GET** `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`

List database records (collect all pages)

```typescript
client.notes.records.listAll(notebookId: string, databaseId: string, options?: { filters?: string; sorts?: string; page?: number; count?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `databaseId` | `string` | Yes | path |  |
| `filters` | `string` | No | query | JSON-encoded array of filters. Each is a field filter { id, type: "field", fieldId, operator, value } or a group { id, type: "group", operator: "and" \| "or", filters }. The fieldId `name` filters on the record name. A filter on a field the database does not have is ignored. |
| `sorts` | `string` | No | query | JSON-encoded array of sorts, applied in order. Each is { id, fieldId, direction: "asc" \| "desc" }. The fieldId `name` sorts by the record name. A sort on a field the database does not have is ignored. |
| `page` | `number` | No | query |  |
| `count` | `number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`

List database records (async iterator)

```typescript
client.notes.records.listIterator(notebookId: string, databaseId: string, options?: { filters?: string; sorts?: string; page?: number; count?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `databaseId` | `string` | Yes | path |  |
| `filters` | `string` | No | query | JSON-encoded array of filters. Each is a field filter { id, type: "field", fieldId, operator, value } or a group { id, type: "group", operator: "and" \| "or", filters }. The fieldId `name` filters on the record name. A filter on a field the database does not have is ignored. |
| `sorts` | `string` | No | query | JSON-encoded array of sorts, applied in order. Each is { id, fieldId, direction: "asc" \| "desc" }. The fieldId `name` sorts by the record name. A sort on a field the database does not have is ignored. |
| `page` | `number` | No | query |  |
| `count` | `number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `search`

**GET** `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/search`

Search database records

```typescript
client.notes.records.search(notebookId: string, databaseId: string, options?: { q?: string; exclude?: string }): Promise<NotesRecordsSearchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `databaseId` | `string` | Yes | path |  |
| `q` | `string` | No | query | Text to find in the record name or in any field value (substring match; ASCII letters match in any case). A field value is matched as its JSON text, such as {"type":"string","value":"Q3"}, so a query can also match a field type name. Empty returns all records except those specified in `exclude`. |
| `exclude` | `string` | No | query |  |

**Returns:** `NotesRecordsSearchResponse`

**CLI:** `hoody notes records search`

---

### `update`

**PATCH** `/api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}`

Update a database record

```typescript
client.notes.records.update(notebookId: string, databaseId: string, recordId: string, data?: NotesRecordsUpdateRequest): Promise<NotesRecordsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `databaseId` | `string` | Yes | path |  |
| `recordId` | `string` | Yes | path |  |
| `data` | `NotesRecordsUpdateRequest` | No | body |  |

**Returns:** `NotesRecordsUpdateResponse`

**CLI:** `hoody notes records update`

---

## `client.notes.sockets` (2 methods)

### `connect`

**GET** `/api/v1/notes/sockets/{socketId}`

Open a WebSocket connection

```typescript
client.notes.sockets.connect(socketId: string, _templateVars?: object, requestOptions?: object, wsOptions?: { reconnect?: boolean; connectTimeoutMs?: number; transport?: 'auto' | 'ws' }): Promise<NotesSocketsConnectWebSocket>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `socketId` | `string` | Yes | path |  |
| `wsOptions` | `{ reconnect?: boolean; connectTimeoutMs?: number; transport?: 'auto' \| 'ws' }` | No | path |  |

**Returns:** `NotesSocketsConnectWebSocket`

---

### `create`

**POST** `/api/v1/notes/sockets`

Initialize a WebSocket session

```typescript
client.notes.sockets.create(): Promise<NotesSocketsCreateResponse>
```

**Returns:** `NotesSocketsCreateResponse`

---

## `client.notes.versions` (7 methods)

### `create`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions`

Create a document version snapshot

```typescript
client.notes.versions.create(notebookId: string, nodeId: string): Promise<NotesVersionsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |

**Returns:** `NotesVersionsCreateResponse`

**CLI:** `hoody notes versions create`

---

### `delete`

**DELETE** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}`

Delete a document version

```typescript
client.notes.versions.delete(notebookId: string, nodeId: string, versionId: string): Promise<NotesVersionsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `versionId` | `string` | Yes | path |  |

**Returns:** `NotesVersionsDeleteResponse`

**CLI:** `hoody notes versions delete`

---

### `get`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}`

Get a specific document version

```typescript
client.notes.versions.get(notebookId: string, nodeId: string, versionId: string): Promise<NotesVersionsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `versionId` | `string` | Yes | path |  |

**Returns:** `NotesVersionsGetResponse`

**CLI:** `hoody notes versions get`

---

### `list`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions`

List document versions

```typescript
client.notes.versions.list(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; beforeRevision?: number }): Promise<NotesVersionsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `beforeRevision` | `number` | No | query | Only versions with a lower revision. Pass the lowest revision you already have to get the next page: unlike offset it stays correct while versions are added or deleted. Combines with offset (normally 0). |

**Returns:** `NotesVersionsListResponse`

**CLI:** `hoody notes versions list`

---

### `listAll`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions`

List document versions (collect all pages)

```typescript
client.notes.versions.listAll(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; beforeRevision?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `beforeRevision` | `number` | No | query | Only versions with a lower revision. Pass the lowest revision you already have to get the next page: unlike offset it stays correct while versions are added or deleted. Combines with offset (normally 0). |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions`

List document versions (async iterator)

```typescript
client.notes.versions.listIterator(notebookId: string, nodeId: string, options?: { limit?: number; offset?: number; beforeRevision?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `beforeRevision` | `number` | No | query | Only versions with a lower revision. Pass the lowest revision you already have to get the next page: unlike offset it stays correct while versions are added or deleted. Combines with offset (normally 0). |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `restore`

**POST** `/api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}/restore`

Restore a document version

```typescript
client.notes.versions.restore(notebookId: string, nodeId: string, versionId: string): Promise<NotesVersionsRestoreResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `notebookId` | `string` | Yes | path |  |
| `nodeId` | `string` | Yes | path |  |
| `versionId` | `string` | Yes | path |  |

**Returns:** `NotesVersionsRestoreResponse`

**CLI:** `hoody notes versions restore`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
