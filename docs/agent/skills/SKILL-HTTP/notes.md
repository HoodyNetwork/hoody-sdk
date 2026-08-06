> _**HTTP skill · `notes` namespace** · ~11,039 tokens · hoody-sdk v1.0.0-beta.12_

# `notes` — Collaborative notebooks, hierarchical nodes, documents, databases

## Purpose

Per-container notebooks of hierarchical nodes (sections, pages, channels, messages, databases, records) with rich-text bodies, comments, reactions, versions, collaborators, TUS attachments, WS mutation feed.

## When to use

Section→page wikis; typed `database`/`record` nodes; comments/reactions/versions/collaborators; TUS attachments; WS-driven UI.

## When NOT to use

SQL/KV → `sqlite`, container fs → `files`, desktop notifs → `notifications`, cross-container identity → `api`, scheduled writes → `cron`.

## Prerequisites

- `notebookId` per call; first `GET /api/v1/notes/me` auto-provisions notebook+user from `?username=` (default `user`).
- HTTP/raw fetch supports `X-Idempotency-Key` for retry-safe creates. **Most generated SDK service methods do NOT expose per-call request headers** (`requestOptions` has no `headers` field), so idempotency-keyed retries on those must use raw `fetch()` against the kit URL. **The exception is `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append`, which accepts the key as `options.XIdempotencyKey`** — so the recommended document-writing path is fully retry-safe from the SDK. Export `ticket` is HTML-export-only.
- **Writing a document needs editor-or-admin role on the node** — `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`/`PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`/`POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` resolve access via `getNodeAccess` and reject viewers/read-only collaborators with `403`. Documents attach only to `page` and `record` nodes (the node types that declare a `documentSchema`); `message`/`channel`/`database` nodes do not support documents.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

1. **Write a page (RECOMMENDED: append)** — the simplest, most reliable way to put content into a note. First get a page node id (use the auto-provisioned `Home` section: `GET /api/v1/notes/notebooks/{notebookId}/nodes` `type:"section"` → pick `Home` → `POST /api/v1/notes/notebooks/{notebookId}/nodes` `type:"page"`, `parentId:<sectionId>`, `attributes:{name}`). Then `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` with `{text:"…", type:"paragraph"|"heading1"|…}` (one block from plain text) OR `{blocks:[{type,content,attrs}]}` (batch). **The server assigns each block's `id`, `parentId`, and `index`** — you never compute fractional indices or block ids, which is the part agents get wrong with `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`. Creates the document if absent; pass `X-Idempotency-Key` (SDK `options.XIdempotencyKey`) for safe retries. See §Examples 1–2.
2. **Bootstrap identity + notebook** — `GET /api/v1/notes/me` → `{userId,username,role,notebookId}` (auto-provisions a notebook + `Home` section + starter pages). `GET /api/v1/notes/notebooks`/`create`/`get` open to any non-`none` member; `update`/`delete` are owner-gated.
3. **Build a structured document with `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`** — use this only when you need full control over layout/ordering (append cannot create lists, tables, or nested blocks). `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` OVERWRITES the whole document; `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` shallow-merges at the TOP level only (submitting `content.blocks` REPLACES the entire blocks map — it does NOT merge per-block). The body is `{content:{type:"rich_text",blocks:{<id>:<block>}}}`. **Use the real `EditorNodeTypes` strings and the `attrs` key, and remember container blocks (lists/tasks/blockquote/table cells) hold their text in a CHILD `paragraph` block** — see §Examples 0 (block-model cheat-sheet) and 3.
4. **Database CRUD** — `POST /api/v1/notes/notebooks/{notebookId}/nodes` `type:"database"`; then `POST /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`/`GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`/`GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/search`/`PATCH /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` (merges `fields`)/`DELETE /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}`. Page with `page`/`count` on `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records` (count max 100). ⚠ SDK-only: the auto-pagination helpers (listIterator / listAll) are misconfigured upstream — they send `limit`/`offset` while the route accepts `page`/`count`; prefer manual paged list loops.
5. **Comments + versions** — `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators` (`admin`/`editor`/`collaborator`/`viewer`). `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments` (top-level, anchored, or reply); `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}`/`delete`/`POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/resolve` accept optional `expectedVersion` for optimistic concurrency. `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions`/`list`/`get`/`POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}/restore`.
6. **TUS upload + download** — `POST /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` for `fileId`; `PATCH /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` `PATCH`+`Upload-Offset`; `HEAD /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` `HEAD` returns resume offset; `DELETE /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` cancels. `GET /api/v1/notes/notebooks/{notebookId}/files`, `GET /api/v1/notes/notebooks/{notebookId}/files/{fileId}`.

## Quirks & gotchas

- **Use the real block `type` strings and the `attrs` key — wrong values store silently but render blank.** Valid block types are the `EditorNodeTypes` values: `paragraph`, `heading1`/`heading2`/`heading3`, `blockquote`, `bulletList`, `listItem`, `orderedList`, `taskList`, `taskItem`, `codeBlock`, `horizontalRule`, `table`/`tableRow`/`tableHeader`/`tableCell`, `page`, `file`, `folder`, `tempFile`, `drawing`, `grid`, plus the editor-extension blocks `embed` (block) and inline `mention`/`hardBreak`. There is NO `code`, `bullet_list_item`, or `quote` type, and block attributes live under `attrs` (NOT `props`); code language is `attrs.language`, a task's done-state is `attrs.checked`. The block schema is loose (`type:z.string()`, `attrs:z.record`), so a bad `type`/`props` is accepted with `200` and stored — the CRDT bridge validates with `safeParse` but writes the ORIGINAL object, persisting the junk key — the editor then has no renderer for it and the block shows blank. (A later full rewrite that omits the bad key reconciles it away.)
- **Container blocks hold NO direct text — their text lives in a CHILD `paragraph` block.** Only `paragraph`/`heading1-3`/`codeBlock` (and the text-less `horizontalRule`) are leaf blocks that carry `content:[{type:'text',text}]` directly. For `listItem`, `taskItem`, `blockquote`, `tableCell`, `tableHeader` you MUST add a child `paragraph` block whose `parentId` is the container's id; putting text directly on the container makes it render empty. See §Examples 0 and 3 for the exact nesting.
- **Prefer `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` for adding content; it does NOT create the node.** Append server-assigns `id`/`parentId`/`index` and creates the document row if missing, but `404`s if the node is absent and `400`s for node types without a `documentSchema` (only `page`/`record`) — so create/find the page first. It rejects client-supplied `id`/`parentId`/`index` and reserved `attrs` keys (`id`,`parentId`,`index`,`type`,`__proto__`,`constructor`,`prototype`), accepts only `{type:'text'}` leaves (no inline `mention`/image), the `{text}` form does NOT split newlines (one literal block), and it caps at 100 blocks / 512 KiB per call. Appendable types: `paragraph`, `heading1-3`, `codeBlock`, `horizontalRule` (containers and `file` are rejected).
- **`PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` has no block/byte cap** (only the Fastify 10 MB body limit) and requires the node to exist, creating the document row if it has none; the 100-block / 512 KiB caps are append-only.
- **`POST /api/v1/notes/notebooks/{notebookId}/nodes` with schema-invalid `attributes` for a KNOWN type returns `500 unknown`, not `400`** — `YDoc.update()` throws on the attribute `safeParse` before the create transaction's try/catch (unknown type / missing parent → `400`; permission/`canCreate` → `403`). A page needs `attributes.name` + `parentId` and cannot be root-level; a manually-created `section` must include `attributes.collaborators` with the creator as `admin` and is root-only — easiest is to reuse the auto-provisioned `Home` section.
- `notebookAuthenticator` re-anchors identity to URL `notebookId`; one bearer reaches any notebook the username joined.
- Cross-client convergence is **mutation-stream-driven** via the `POST /api/v1/notes/notebooks/{notebookId}/mutations` route + WS feed: each mutation type (`document.update`, `node.*`, etc.) is dispatched server-side to a SQL-backed lib function. `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`/`PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` are last-writer-wins JSON overlays on top of the same store; two concurrent PATCHes will clobber each other unless drivers coordinate via the WS mutation feed.
- `identity.get?username=&role=` creates user+notebook and runs `initializeNotebookContent`. Priority Bearer → `ticket` → `?username=&role=`; invalid Bearer = 401 even with fallback. **Without any of the three, requests default to username `user` (NOT to a previously seen `?username=alex` query)** — re-pass `?username=` on every unauthenticated call, or attach Bearer / `ticket`. Username lowercased `/^[a-zA-Z0-9_-]+$/` 1–32. `role` ∈ `owner|admin|collaborator|guest|none`; `none` → `notebook_no_access`.
- **`Readonly` notebook gates writes only** — read endpoints still serve through; write routes (mutations, document.put/patch, record-create, etc.) are rejected with `403 notebook_readonly`.
- `X-Idempotency-Key` replay returns saved response; same key+different payload → 409.
- `PATCH /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` merges `fields`; access runs through `getNodeAccess(notebookId, databaseId, userId)`, which resolves your role from the `collaborations` row on the notebook **root** node, then walks the database's full ancestor chain and returns `403` if any ancestor is a private `section`, or a `channel` whose `attributes.collaborators` map omits you (notebook owner/admin bypasses the privacy walk). A root collaboration alone is therefore NOT sufficient. TUS validates `notebookId`/`fileId` against generated-id regex; free-form id → 400 `file_not_found`.
- `documents.get?output=html` needs single-use export `ticket` on `GET .../document`. `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` overwrites; `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` top-level spreads the request body over current content — submitting `content.blocks` REPLACES the blocks map, it does not merge per-block. For per-block CRDT merging use the `POST /api/v1/notes/notebooks/{notebookId}/mutations` WS feed instead. `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}`/`delete`/`POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/resolve` accept optional `expectedVersion`.
- `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/search` matches against record names AND field values (not just names).
- Text filter operators in `databases.list?filters=`: `is_equal_to` / `is_not_equal_to` / `contains` / `does_not_contain` / `starts_with` / `ends_with` / `is_empty` / `is_not_empty`. The bare `is` is NOT a valid operator — use `is_equal_to`; the bare `not_contains` is NOT either — use `does_not_contain`.
- TUS chunk uploads: `PATCH /api/v1/notes/notebooks/{n}/files/{id}/tus` is the byte-transfer call — send the raw chunk as the request body with `Upload-Offset`/`Tus-Resumable` headers (e.g. via `@tus/client`). SDK-only: the generated tusUploadChunk method takes no chunk-body or Upload-Offset parameter, so drop to raw `@tus/client`/`fetch` for the actual byte transfer.

## Common errors

- `400 bad_request` validation (`details[]`); `400 file_not_found` TUS id regex; `409` PK dupe or idempotency-key reused w/ different payload.
- `403 notebook_no_access`/`notebook_readonly`/`forbidden` (db needs `collaborations` or `canCreate`).
- `404 not_found` — node/file/comment/version missing or `notebook_id` mismatch. `500 unknown` — read-back failed or uncategorized.

## Related namespaces

`files`, `sqlite`, `notifications`, `api`, `exec`

## Examples

Every step in every example was live-tested against a real `notes-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first; bootstrap identity once with `GET /api/v1/notes/me?username=...&role=owner` to auto-provision `notebookId`.

### 0. Block model cheat-sheet — types, the `attrs` key, and container nesting

**Read this before hand-building any `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` body.** A document is
`{ "content": { "type": "rich_text", "blocks": { "<blockId>": <block> } } }`. Each
block is `{ id, type, parentId, index, content?, attrs? }`:

- `type` is one of the real `EditorNodeTypes` strings. There is **no** `code`,
  `bullet_list_item`, `quote`, or `numbered_list_item`. Block attributes live under
  `attrs` (**never** `props`).
- **Leaf blocks** carry text directly in `content`: `paragraph`, `heading1`,
  `heading2`, `heading3`, `codeBlock` (language in `attrs.language`). `horizontalRule`
  is a leaf with no text/content.
- **Container blocks carry NO direct text** — each holds a child `paragraph`:
  `bulletList`/`orderedList` → `listItem` → `paragraph`; `taskList` → `taskItem`
  (`attrs.checked`) → `paragraph`; `blockquote` → `paragraph`; `table` → `tableRow` →
  `tableHeader`/`tableCell` → `paragraph`. The child's `parentId` is the container's id.
- `index` is a lexicographic ordering string per sibling group (server uses
  fractional indexing). For a brand-new document, monotonically increasing strings
  (`a0`,`a1`,`a2`,…) sort correctly. To INSERT between two existing blocks you need a
  key that sorts strictly between them — another reason to prefer append.
- Inline `content` leaves are `{ "type":"text", "text":"…", "marks?":[…] }`. Marks:
  `bold`, `italic`, `strike`, `underline`, `code` (no attrs); `link`
  (`attrs:{href,target,rel}`); `color` (`attrs:{color}`); `highlight`
  (`attrs:{highlight}`); `comment` (`attrs:{commentId}`). `mention` is an inline NODE
  (`{type:'mention',attrs:{id,target}}`), not a mark; `hardBreak`
  (`{type:'hardBreak'}`) forces a line break inside a paragraph.

Leaf blocks (text/code carry `content` directly):

```json
{ "h":  {"id":"h","type":"heading1","parentId":"PAGE","index":"a0","content":[{"type":"text","text":"Runbook"}]},
  "p":  {"id":"p","type":"paragraph","parentId":"PAGE","index":"a1","content":[{"type":"text","text":"Intro with ","marks":[]},{"type":"text","text":"bold","marks":[{"type":"bold"}]}]},
  "c":  {"id":"c","type":"codeBlock","parentId":"PAGE","index":"a2","attrs":{"language":"bash"},"content":[{"type":"text","text":"./deploy.sh prod"}]},
  "hr": {"id":"hr","type":"horizontalRule","parentId":"PAGE","index":"a3"} }
```

Bulleted list — `bulletList → listItem → paragraph` (use `orderedList` for numbered):

```json
{ "bl":  {"id":"bl","type":"bulletList","parentId":"PAGE","index":"a0"},
  "li1": {"id":"li1","type":"listItem","parentId":"bl","index":"a0"},
  "li1p":{"id":"li1p","type":"paragraph","parentId":"li1","index":"a0","content":[{"type":"text","text":"First item"}]},
  "li2": {"id":"li2","type":"listItem","parentId":"bl","index":"a1"},
  "li2p":{"id":"li2p","type":"paragraph","parentId":"li2","index":"a0","content":[{"type":"text","text":"Second item"}]} }
```

Task list (`attrs.checked` on the item) and blockquote:

```json
{ "tl":  {"id":"tl","type":"taskList","parentId":"PAGE","index":"a0"},
  "ti1": {"id":"ti1","type":"taskItem","parentId":"tl","index":"a0","attrs":{"checked":false}},
  "ti1p":{"id":"ti1p","type":"paragraph","parentId":"ti1","index":"a0","content":[{"type":"text","text":"Open task"}]},
  "bq":  {"id":"bq","type":"blockquote","parentId":"PAGE","index":"a1"},
  "bqp": {"id":"bqp","type":"paragraph","parentId":"bq","index":"a0","content":[{"type":"text","text":"Quoted line"}]} }
```

Table — `table → tableRow → tableHeader/tableCell → paragraph`:

```json
{ "tbl": {"id":"tbl","type":"table","parentId":"PAGE","index":"a0"},
  "r1":  {"id":"r1","type":"tableRow","parentId":"tbl","index":"a0"},
  "h1":  {"id":"h1","type":"tableHeader","parentId":"r1","index":"a0"},
  "h1p": {"id":"h1p","type":"paragraph","parentId":"h1","index":"a0","content":[{"type":"text","text":"Col A"}]},
  "r2":  {"id":"r2","type":"tableRow","parentId":"tbl","index":"a1"},
  "c1":  {"id":"c1","type":"tableCell","parentId":"r2","index":"a0"},
  "c1p": {"id":"c1p","type":"paragraph","parentId":"c1","index":"a0","content":[{"type":"text","text":"Val 1"}]} }
```

### 1. Bootstrap identity, create a page, and append the first content (recommended)

**Goal:** stand up a fresh notebook from scratch, attach a page under the auto-created Home section, give it a one-block document.

**Step 1 — bootstrap identity & create notebook.** First call to `GET /api/v1/notes/me` with `?username=&role=` auto-provisions a default notebook + Home section + Welcome page; pass it once per `username`. Then `POST /api/v1/notes/notebooks` for a second, named one.

```bash
KIT="https://${P}-${C}-notes-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/notes/me?username=alex&role=owner" | jq .   # one-time auto-provision
NBID=$(curl -sf -X POST "$KIT/api/v1/notes/notebooks" \
  -H 'Content-Type: application/json' \
  -d '{"name":"team-wiki","description":"engineering docs"}' | jq -r .id)
echo "NBID=$NBID"
```
**Step 2 — find the auto-created Home section and add a page under it.** Every fresh notebook ships with a `section` named `Home`; `POST /api/v1/notes/notebooks/{notebookId}/nodes` with `type:"page"` needs that section as `parentId`. POST returns `201` (NOT 200 — generic retry helpers that only accept 200 will treat success as failure).

```bash
SEC=$(curl -sf "$KIT/api/v1/notes/notebooks/$NBID/nodes?limit=100" \
  | jq -r '.nodes[] | select(.type=="section") | .id' | head -1)
PAGE=$(curl -sf -X POST "$KIT/api/v1/notes/notebooks/$NBID/nodes" \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"page\",\"parentId\":\"$SEC\",\"attributes\":{\"name\":\"Runbook\"}}" \
  | jq -r .id)
```
**Step 3 — append the first content (recommended).** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append`
appends to the END of the page's document and **the server assigns each block's
`id`, `parentId`, and `index`** — so you never compute fractional indices or block
ids. Send EITHER `{text, type?}` (one block from plain text; `type` defaults to
`paragraph`) OR `{blocks:[{type, content?, attrs?}]}` (a batch of flat blocks).
Appendable types are `paragraph`, `heading1`–`heading3`, `codeBlock`,
`horizontalRule` only; containers (lists/tables) need `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` (Example 3).
If the document doesn't exist yet it is created. `X-Idempotency-Key` makes retries
safe.

```bash
# one block from plain text
curl -sf -X POST "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document/append" \
  -H 'Content-Type: application/json' -H "X-Idempotency-Key: runbook-h1" \
  -d '{"type":"heading1","text":"Runbook"}'
# a batch of flat blocks (note codeBlock language goes in attrs)
curl -sf -X POST "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document/append" \
  -H 'Content-Type: application/json' \
  -d '{"blocks":[
        {"type":"paragraph","content":[{"type":"text","text":"Run the deploy script:"}]},
        {"type":"codeBlock","attrs":{"language":"bash"},"content":[{"type":"text","text":"./deploy.sh prod"}]}
      ]}'
```
### 2. Build a structured document with `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` — leaf blocks + a bulleted list

**Goal:** lay out a page with a header, prose, a fenced code block, and a 2-item
bulleted list, in one full-document write. Use PUT (not append) when you need
containers or precise ordering. ⚠ Two traps this example fixes: (1) use the REAL type
strings — `codeBlock` (not `code`) with the language under `attrs` (not `props`),
and a `bulletList`→`listItem`→`paragraph` nest (there is no `bullet_list_item`); a
wrong type/`props` is stored silently and renders blank. (2) `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` does
NOT merge by block id — it REPLACES the entire `blocks` map (live-verified). To add to
an existing doc, `GET` the current blocks, mutate locally, `PUT` the union back (or
just use `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append`).

```bash
PAGE=...
B1=$(openssl rand -hex 12); B2=$(openssl rand -hex 12); B3=$(openssl rand -hex 12)
BL=$(openssl rand -hex 12); LI1=$(openssl rand -hex 12); LI1P=$(openssl rand -hex 12)
LI2=$(openssl rand -hex 12); LI2P=$(openssl rand -hex 12)
cat > /tmp/doc.json <<EOF
{"content":{"type":"rich_text","blocks":{
  "$B1":{"id":"$B1","parentId":"$PAGE","index":"a0","type":"heading1","content":[{"type":"text","text":"Deploy Steps"}]},
  "$B2":{"id":"$B2","parentId":"$PAGE","index":"a1","type":"paragraph","content":[{"type":"text","text":"Run the script below, then verify."}]},
  "$B3":{"id":"$B3","parentId":"$PAGE","index":"a2","type":"codeBlock","attrs":{"language":"bash"},"content":[{"type":"text","text":"./deploy.sh prod"}]},
  "$BL":{"id":"$BL","parentId":"$PAGE","index":"a3","type":"bulletList"},
  "$LI1":{"id":"$LI1","parentId":"$BL","index":"a0","type":"listItem"},
  "$LI1P":{"id":"$LI1P","parentId":"$LI1","index":"a0","type":"paragraph","content":[{"type":"text","text":"Smoke-test /healthz"}]},
  "$LI2":{"id":"$LI2","parentId":"$BL","index":"a1","type":"listItem"},
  "$LI2P":{"id":"$LI2P","parentId":"$LI2","index":"a0","type":"paragraph","content":[{"type":"text","text":"Tag the release"}]}
}}}
EOF
curl -sf -X PUT "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document" \
  -H 'Content-Type: application/json' -d @/tmp/doc.json
```
### 3. Update one block's content + reorder by changing `index`

**Goal:** rewrite a paragraph and move it to the top of the page. Because PUT is full-overwrite, you read the current doc, mutate the target block, and write the full map back.

**Step 1 — read current blocks.**

```bash
DOC=$(curl -sf "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document")
echo "$DOC" | jq '.content.blocks | to_entries | map({k:.key,t:.value.type,i:.value.index})'
```
**Step 2 — mutate locally + PUT back.** Set the target block's `index` to a key that sorts FIRST (e.g. prefix `Z` → swap to `9`, or use a fresh small string like `_a0`); rewrite its `content`.

```bash
NEW=$(echo "$DOC" | jq --arg t "Updated intro paragraph (now first)." '
  .content.blocks
  | to_entries
  | map(if .value.type=="paragraph" then .value.index="_a0" | .value.content=[{type:"text",text:$t}] else . end)
  | from_entries
  | {content:{type:"rich_text",blocks:.}}')
curl -sf -X PUT "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document" \
  -H 'Content-Type: application/json' -d "$NEW"
```
### 4. Delete a block + verify ordering survives

**Goal:** drop a single block from the doc. Same overwrite trick — `delete blocks[b3]` locally, PUT remaining map back, then GET to verify the survivors keep their `index` order.

```bash
DOC=$(curl -sf "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document")
NEW=$(echo "$DOC" | jq 'del(.content.blocks["'"$B3"'"]) | {content:{type:"rich_text",blocks:.content.blocks}}')
curl -sf -X PUT "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document" \
  -H 'Content-Type: application/json' -d "$NEW"
curl -sf "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document" \
  | jq '.content.blocks | to_entries | sort_by(.value.index) | map(.value.type)'
```
### 5. Create a database (Tasks) with typed columns + add records

**Goal:** make a database node with `text`, `number`, `boolean` fields, then create a few records. ⚠ `POST /api/v1/notes/notebooks/{notebookId}/nodes` for `type:"database"` REQUIRES `attributes.fields` populated — without it the kit returns `500` (the attribute `safeParse` throws inside `YDoc.update` before the create transaction's try/catch — a `canCreate` failure would be a `403`). Each field needs `id` (matching `^[a-zA-Z0-9_-]+$`), `type`, `name`, `index`.

```bash
DBID=$(curl -sf -X POST "$KIT/api/v1/notes/notebooks/$NBID/nodes" \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"database\",\"parentId\":\"$SEC\",\"attributes\":{
    \"name\":\"Tasks\",
    \"fields\":{
      \"f_status\":{\"id\":\"f_status\",\"type\":\"text\",\"name\":\"Status\",\"index\":\"a0\"},
      \"f_priority\":{\"id\":\"f_priority\",\"type\":\"number\",\"name\":\"Priority\",\"index\":\"a1\"},
      \"f_done\":{\"id\":\"f_done\",\"type\":\"boolean\",\"name\":\"Done\",\"index\":\"a2\"}
    }
  }}" | jq -r .id)

for i in 1 2 3; do
  curl -sf -X POST "$KIT/api/v1/notes/notebooks/$NBID/databases/$DBID/records" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"Task $i\",\"fields\":{
      \"f_status\":{\"type\":\"text\",\"value\":\"todo\"},
      \"f_priority\":{\"type\":\"number\",\"value\":$i},
      \"f_done\":{\"type\":\"boolean\",\"value\":false}
    }}" >/dev/null
done
```
### 6. Query records — filter + sort

**Goal:** find records with `priority > 1` sorted descending. Both `filters` and `sorts` are JSON-encoded query strings. ⚠ `filters` MUST be a **JSON array** (not an object) of `{ id, type:"field", fieldId, operator, value }`; sending an object returns `400 "filters" query parameter must be a JSON array.` Operators are field-type-specific: numbers use `is_equal_to`/`is_not_equal_to`/`is_greater_than`/`is_less_than`/`is_greater_than_or_equal_to`/`is_less_than_or_equal_to`, text uses `is_equal_to`/`is_not_equal_to`/`contains`/`does_not_contain`/`starts_with`/`ends_with`/`is_empty`/`is_not_empty`, booleans use `is_true`/`is_false`. Sort entries are `{ id, fieldId, direction:"asc"|"desc" }` (also array).

```bash
F='[{"id":"f1","type":"field","fieldId":"f_priority","operator":"is_greater_than","value":1}]'
S='[{"id":"s1","fieldId":"f_priority","direction":"desc"}]'
ENC_F=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$F")
ENC_S=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$S")
curl -sf "$KIT/api/v1/notes/notebooks/$NBID/databases/$DBID/records?filters=$ENC_F&sorts=$ENC_S&count=50" \
  | jq '.records[] | {n:.name, p:.fields.f_priority.value}'
```
A simpler full-text alternative is `databases.search?q=...` — no array shape, just a query string; matches against record `name` AND field values.

### 7. Update a record by id — partial-merge fields

**Goal:** mark Task 1 as done. `PATCH /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` PATCH MERGES `fields` (live-verified: sending only `f_status` + `f_done` left `f_priority` untouched). Each field value must be the typed wrapper `{ type: <type>, value: <v> }` matching the column type.

```bash
RID=$(curl -sf "$KIT/api/v1/notes/notebooks/$NBID/databases/$DBID/records?count=50" \
  | jq -r '.records[] | select(.name=="Task 1") | .id' | head -1)
curl -sf -X PATCH "$KIT/api/v1/notes/notebooks/$NBID/databases/$DBID/records/$RID" \
  -H 'Content-Type: application/json' \
  -d '{"fields":{"f_status":{"type":"text","value":"done"},"f_done":{"type":"boolean","value":true}}}' \
  | jq '.fields'
```
### 8. Bulk import records from a CSV

**Goal:** load a list of imports into the Tasks database in a loop. There is no single-call bulk-create endpoint; loop `POST /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records` per row. ⚠ Records DO NOT auto-deduplicate by `name` — re-running the same import doubles your data. If you need idempotency over HTTP/raw fetch, set the request header `X-Idempotency-Key` to a deterministic per-row key (replay returns the saved response; same key + different payload returns `409`). The **generated SDK service methods do not expose per-call headers**, so idempotency keys must be sent via raw `fetch()` (or `client.api.http.*` low-level if available).

```bash
cat > /tmp/tasks.csv <<EOF
name,priority,status
Migrate DB,2,todo
Update docs,3,todo
Wire CI,1,in-progress
EOF
tail -n +2 /tmp/tasks.csv | while IFS=, read -r name pri stat; do
  KEY=$(echo -n "import-2026-05-07:$name" | sha256sum | cut -d' ' -f1)
  curl -sf -X POST "$KIT/api/v1/notes/notebooks/$NBID/databases/$DBID/records" \
    -H 'Content-Type: application/json' -H "X-Idempotency-Key: $KEY" \
    -d "$(jq -nc --arg n "$name" --argjson p "$pri" --arg s "$stat" \
      '{name:$n, fields:{
         f_priority:{type:"number",value:$p},
         f_status:{type:"text",value:$s},
         f_done:{type:"boolean",value:false}}}')" >/dev/null
done
```
### 9. Export a page to HTML — single-use ticket flow

**Goal:** publish a static HTML snapshot of a page. `documents.get?output=html` requires a single-use export `ticket` (markdown via `?output=md` does NOT — it returns text directly with no ticket). Tickets default to 3 uses and expire in ~2 minutes (live-verified). Anyone with the kit URL + ticket can download until it expires.

**Step 1 — create a ticket.**

```bash
TICKET=$(curl -sf -X POST "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/export-ticket" \
  -H 'Content-Type: application/json' \
  -d '{"output":"html","themeMode":"light","includeComments":"appendix"}' \
  | jq -r .ticket)
```
**Step 2 — fetch the HTML.** Same kit URL; pass `ticket=` in the query.

```bash
curl -sf "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document?output=html&ticket=$TICKET" > /tmp/page.html
# Markdown export — no ticket needed:
curl -sf "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document?output=md" > /tmp/page.md
```
### 10. Tear down — delete the database, then the section (cascade), then the notebook

**Goal:** clean up everything you created. Order matters: deleting a `section` cascades to every descendant page/database/record under it (live-verified — one DELETE on the section emptied the notebook). Then `DELETE /api/v1/notes/notebooks/{notebookId}` removes the notebook itself.

`DELETE /api/v1/notes/notebooks/{notebookId}` returns `200` immediately after soft-deleting the notebook (flips `status` to `Inactive`); the caller must be `owner`. A background `notebook.clean` job then recursively purges child rows asynchronously — re-list via `GET /api/v1/notes/notebooks` to confirm the notebook no longer appears (the list filters out `Inactive` status).

```bash
# delete records
curl -sf "$KIT/api/v1/notes/notebooks/$NBID/databases/$DBID/records?count=100" \
  | jq -r '.records[].id' \
  | while read RID; do
      curl -sf -X DELETE "$KIT/api/v1/notes/notebooks/$NBID/databases/$DBID/records/$RID" >/dev/null
    done
# delete the database node
curl -sf -X DELETE "$KIT/api/v1/notes/notebooks/$NBID/nodes/$DBID" >/dev/null
# cascade-delete by removing the section (drops every page/db underneath)
curl -sf -X DELETE "$KIT/api/v1/notes/notebooks/$NBID/nodes/$SEC" >/dev/null
# notebook delete (returns 200 immediately, soft-delete — see note above)
curl -s  -X DELETE "$KIT/api/v1/notes/notebooks/$NBID" -o /dev/null -w '%{http_code}\n'
# fallback: rename so it's clearly disused
curl -sf -X PATCH "$KIT/api/v1/notes/notebooks/$NBID" \
  -H 'Content-Type: application/json' \
  -d '{"name":"team-wiki-DELETED"}'
```

## Reference

### `avatars` (2) — avatars

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/notes/avatars/{avatarId}` | Download an avatar image |  |
| `POST /api/v1/notes/avatars` | Upload an avatar image |  |

### `collaborators` (4) — collaborators

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators` | Add a collaborator | `body*` |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators` | List collaborators |  |
| `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}` | Remove a collaborator |  |
| `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}` | Update collaborator role | `body*` |

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators` body — `{ collaboratorId*: string, role*: "admin" | "editor" | "collaborator" | "viewer" }`
- `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}` body — `{ role*: "admin" | "editor" | "collaborator" | "viewer" }`

### `comments` (7) — comments

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments` | Create a comment | `body*` |
| `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}` | Delete a comment | `?expectedVersion` |
| `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}` | Edit a comment | `body*` |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments` | List comments | `?limit` `?offset` `?cursor` |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comment-anchors` | List comment anchors | `?limit` `?offset` `?cursor` |
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/reanchor` | Re-anchor a comment thread | `body*` |
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/resolve` | Resolve a comment | `body*` |

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments` body — `{ content*: string, parentId: string, anchorBlockId: string, anchor: object }`
- `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}` body — `{ content*: string, expectedVersion: int }`
- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/reanchor` body — `{ anchor*: object, expectedVersion: int }`
- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/resolve` body — `{ expectedVersion: int }`

### `databases` (6) — databases

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records` | Create a database record | `body*` |
| `DELETE /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` | Delete a database record |  |
| `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` | Get a database record |  |
| `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records` | List database records | `?filters` `?sorts` `?page` `?count` |
| `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/search` | Search database records | `?q` `?exclude` |
| `PATCH /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` | Update a database record | `body*` |

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records` body — `{ id: string, name: string="Untitled", avatar: string | null, fields: { [key: string]: any } }`
- `PATCH /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` body — `{ name: string, avatar: string | null, fields: { [key: string]: object } }`

### `documents` (6) — documents

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` | Append blocks to a document | `H:X-Idempotency-Key` `body*` |
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/export-ticket` | Create secure HTML export ticket | `body*` |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/blocks/{blockId}/svg` | Export drawing block as SVG | `?bg` `?scale` |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` | Get document content | `?blockIds` `?lines` `?output` `?includeComments` `?ticket` |
| `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` | Merge document content | `body*` |
| `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` | Create or replace document | `body*` |

**Param notes:**

- `X-Idempotency-Key` — Optional idempotency key (max 256 chars). Reusing the same key with an identical request body and node replays the original response; reusing it with a different body or node returns 409.

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` body — `{ text*: string, type: "paragraph" | "heading1" | "heading2" | "heading3" | "codeBlock"="paragraph", attrs: object | null } | { blocks*: object[] }`
- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/export-ticket` body — `{ output: "html"="html", includeComments: "none" | "appendix"="none", includeBackground: bool=true, themeMode: "light" | "dark"="dark", themeId: string | null, themeVariables: { [key: string]: string }, fileName: string }`
- `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` body — `{ content*: { [key: string]: any } }`
- `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` body — `{ content*: { [key: string]: any } }`

### `files` (6) — files

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/notes/notebooks/{notebookId}/files/{fileId}` | Download a file |  |
| `GET /api/v1/notes/notebooks/{notebookId}/files` | List all uploaded files | `?limit` `?offset` |
| `DELETE /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | Abort a TUS upload |  |
| `HEAD /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | Check a TUS upload's offset (for resuming) |  |
| `POST /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | Create a resumable (TUS) upload |  |
| `PATCH /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | Upload a chunk to a TUS upload |  |

### `health` (1) — health

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/notes/health` | Service health and runtime info |  |

### `identity` (1) — identity

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/notes/me` | Get current identity |  |

### `interactions` (2) — interactions

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/opened` | Mark node as opened | `body*` |
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/seen` | Mark node as seen | `body*` |

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/opened` body — `{ openedAt: string }`
- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/seen` body — `{ seenAt: string }`

### `mutations` (1) — mutations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/mutations` | Sync client mutations | `body*` |

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/mutations` body — `{ mutations*: object[] }`

### `nodes` (7) — nodes

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/nodes` | Create a node | `body*` |
| `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}` | Delete a node |  |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}` | Get a node |  |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/alias/{alias}` | Resolve page by alias |  |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes` | List nodes | `?type` `?parentId` `?rootId` `?limit` `?offset` |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/children` | List child nodes | `?limit` `?offset` |
| `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}` | Update a node | `body*` |

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/nodes` body — `{ id: string, type*: string, parentId: string, attributes*: { [key: string]: any } }`
- `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}` body — `{ attributes*: { [key: string]: any } }`

### `notebooks` (5) — notebooks

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks` | Create a notebook | `body*` |
| `DELETE /api/v1/notes/notebooks/{notebookId}` | Delete a notebook |  |
| `GET /api/v1/notes/notebooks/{notebookId}` | Get notebook details |  |
| `GET /api/v1/notes/notebooks` | List notebooks |  |
| `PATCH /api/v1/notes/notebooks/{notebookId}` | Update notebook settings | `body*` |

**Body shapes:**

- `POST /api/v1/notes/notebooks` body — `{ name*: string, description: string | null, avatar: string | null }`
- `PATCH /api/v1/notes/notebooks/{notebookId}` body — `{ name*: string, description: string | null, avatar: string | null }`

### `reactions` (3) — reactions

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions` | Add a reaction | `body*` |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions` | List reactions |  |
| `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions/{reaction}` | Remove a reaction |  |

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions` body — `{ reaction*: string }`

### `sockets` (2) — sockets

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/sockets` | Initialize a WebSocket session |  |
| `GET /api/v1/notes/sockets/{socketId}` | Open a WebSocket connection |  |

### `users` (2) — users

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/users` | Invite users to notebook | `body*` |
| `PATCH /api/v1/notes/notebooks/{notebookId}/users/{userId}/role` | Update user role | `body*` |

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/users` body — `{ users*: ({ username*: string, role*: "owner" | "admin" | "collaborator" | "guest" | "none" })[] }`
- `PATCH /api/v1/notes/notebooks/{notebookId}/users/{userId}/role` body — `{ role*: "owner" | "admin" | "collaborator" | "guest" | "none" }`

### `versions` (5) — versions

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions` | Create a document version snapshot |  |
| `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}` | Delete a document version |  |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}` | Get a specific document version |  |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions` | List document versions | `?limit` `?offset` |
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}/restore` | Restore a document version |  |

