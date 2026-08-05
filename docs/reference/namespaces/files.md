# `files` — 127 methods

**Version:** 1.0.0-beta.11
**Accessor:** `client.files`

```typescript
import * as files from 'hoody-sdk/files';
```

---

## `client.files.archives` (8 methods)

### `downloadAsZip`

**GET** `/{directory}?zip`

Download directory as ZIP

```typescript
client.files.archives.downloadAsZip(directory: string, options?: { zip: "" }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `directory` | `string` | Yes | path |  |
| `zip` | `""` | Yes | query |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody files downloads zip`

---

### `extract`

**GET** `/{archive}?extract`

Extract archive

```typescript
client.files.archives.extract(archive: string, options?: { extract: string; dest?: string }): Promise<FilesArchivesExtractResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `archive` | `string` | Yes | path |  |
| `extract` | `string` | Yes | query | Empty for full extraction; path for selective (e.g. "src/" or "lib/") |
| `dest` | `string` | No | query | Destination directory name (default: archive name) |

**Returns:** `FilesArchivesExtractResponse`

**CLI:** `hoody files extractions create`

---

### `extractFile`

**GET** `/{archive}?extract_file`

Extract file from archive

```typescript
client.files.archives.extractFile(archive: string, options?: { extract: string; dest?: string }): Promise<FilesArchivesExtractFileResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `archive` | `string` | Yes | path | Path to archive file |
| `extract` | `string` | Yes | query | Path of the file or directory inside the archive to extract (e.g. "src/" or "lib/") |
| `dest` | `string` | No | query | Destination directory name (default: archive name) |

**Returns:** `FilesArchivesExtractFileResponse`

**CLI:** `hoody files extractions extract-file`

---

### `getHistory`

**GET** `/?extraction_history`

Extraction history

```typescript
client.files.archives.getHistory(options?: { extraction_history: "" }): Promise<FilesArchivesGetHistoryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `extraction_history` | `""` | Yes | query |  |

**Returns:** `FilesArchivesGetHistoryResponse`

**CLI:** `hoody files extractions history`

---

### `listActive`

**GET** `/?extractions`

List active extractions

```typescript
client.files.archives.listActive(options?: { extractions: "" }): Promise<FilesArchivesListActiveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `extractions` | `""` | Yes | query |  |

**Returns:** `FilesArchivesListActiveResponse`

**CLI:** `hoody files extractions active`

---

### `listGlobal`

**GET** `/api/v1/extractions`

List active extractions

```typescript
client.files.archives.listGlobal(): Promise<FilesArchivesListGlobalResponse>
```

**Returns:** `FilesArchivesListGlobalResponse`

**CLI:** `hoody files extractions all`

---

### `preview`

**GET** `/{archive}?preview`

Preview archive contents or read file

```typescript
client.files.archives.preview(archive: string, options?: { preview?: string; contents?: string }): Promise<FilesArchivesPreviewResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `archive` | `string` | Yes | path | Path to archive file |
| `preview` | `string` | No | query | Empty value lists archive contents; non-empty value reads a specific file from the archive (alias: ?contents) |
| `contents` | `string` | No | query | Alias for ?preview |

**Returns:** `FilesArchivesPreviewResponse`

**CLI:** `hoody files archive preview`

---

### `viewFile`

**GET** `/{archive}?view_file`

View file from archive

```typescript
client.files.archives.viewFile(archive: string, options?: { preview: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `archive` | `string` | Yes | path | Path to archive file |
| `preview` | `string` | Yes | query | Path of the file inside the archive to view (e.g. "src/" or "README.md") |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody files archive view`

---

## `client.files.authentication` (2 methods)

### `checkAuth`

**CHECKAUTH** `/{path}`

Check authentication status

```typescript
client.files.authentication.checkAuth(path: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |

**Returns:** `ApiResponse<unknown>`

---

### `logout`

**LOGOUT** `/{path}`

Clear authentication

```typescript
client.files.authentication.logout(path: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |

**Returns:** `ApiResponse<unknown>`

---

## `client.files.backends` (67 methods)

### `connectAlias`

**POST** `/api/v1/backends/alias`

Connect to alias backend

```typescript
client.files.backends.connectAlias(data: FilesBackendsConnectAliasRequest): Promise<FilesBackendsConnectAliasResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectAliasRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectAliasResponse`

**CLI:** `hoody files backends connect alias`

---

### `connectAzureblob`

**POST** `/api/v1/backends/azureblob`

Connect to azureblob backend

```typescript
client.files.backends.connectAzureblob(data: FilesBackendsConnectAzureblobRequest): Promise<FilesBackendsConnectAzureblobResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectAzureblobRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectAzureblobResponse`

**CLI:** `hoody files backends connect azureblob`

---

### `connectAzurefiles`

**POST** `/api/v1/backends/azurefiles`

Connect to azurefiles backend

```typescript
client.files.backends.connectAzurefiles(data: FilesBackendsConnectAzurefilesRequest): Promise<FilesBackendsConnectAzurefilesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectAzurefilesRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectAzurefilesResponse`

**CLI:** `hoody files backends connect azurefiles`

---

### `connectB2`

**POST** `/api/v1/backends/b2`

Connect to b2 backend

```typescript
client.files.backends.connectB2(data: FilesBackendsConnectB2Request): Promise<FilesBackendsConnectB2Response>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectB2Request` | Yes | body |  |

**Returns:** `FilesBackendsConnectB2Response`

**CLI:** `hoody files backends connect b2`

---

### `connectBox`

**POST** `/api/v1/backends/box`

Connect to box backend

```typescript
client.files.backends.connectBox(data: FilesBackendsConnectBoxRequest): Promise<FilesBackendsConnectBoxResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectBoxRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectBoxResponse`

**CLI:** `hoody files backends connect box`

---

### `connectCache`

**POST** `/api/v1/backends/cache`

Connect to cache backend

```typescript
client.files.backends.connectCache(data: FilesBackendsConnectCacheRequest): Promise<FilesBackendsConnectCacheResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectCacheRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectCacheResponse`

**CLI:** `hoody files backends connect cache`

---

### `connectChunker`

**POST** `/api/v1/backends/chunker`

Connect to chunker backend

```typescript
client.files.backends.connectChunker(data: FilesBackendsConnectChunkerRequest): Promise<FilesBackendsConnectChunkerResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectChunkerRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectChunkerResponse`

**CLI:** `hoody files backends connect chunker`

---

### `connectCloudinary`

**POST** `/api/v1/backends/cloudinary`

Connect to cloudinary backend

```typescript
client.files.backends.connectCloudinary(data: FilesBackendsConnectCloudinaryRequest): Promise<FilesBackendsConnectCloudinaryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectCloudinaryRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectCloudinaryResponse`

**CLI:** `hoody files backends connect cloudinary`

---

### `connectCombine`

**POST** `/api/v1/backends/combine`

Connect to combine backend

```typescript
client.files.backends.connectCombine(data: FilesBackendsConnectCombineRequest): Promise<FilesBackendsConnectCombineResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectCombineRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectCombineResponse`

**CLI:** `hoody files backends connect combine`

---

### `connectCompress`

**POST** `/api/v1/backends/compress`

Connect to compress backend

```typescript
client.files.backends.connectCompress(data: FilesBackendsConnectCompressRequest): Promise<FilesBackendsConnectCompressResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectCompressRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectCompressResponse`

**CLI:** `hoody files backends connect compress`

---

### `connectCrypt`

**POST** `/api/v1/backends/crypt`

Connect to crypt backend

```typescript
client.files.backends.connectCrypt(data: FilesBackendsConnectCryptRequest): Promise<FilesBackendsConnectCryptResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectCryptRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectCryptResponse`

**CLI:** `hoody files backends connect crypt`

---

### `connectDrive`

**POST** `/api/v1/backends/drive`

Connect to drive backend

```typescript
client.files.backends.connectDrive(data: FilesBackendsConnectDriveRequest): Promise<FilesBackendsConnectDriveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectDriveRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectDriveResponse`

**CLI:** `hoody files backends connect drive`

---

### `connectDropbox`

**POST** `/api/v1/backends/dropbox`

Connect to dropbox backend

```typescript
client.files.backends.connectDropbox(data: FilesBackendsConnectDropboxRequest): Promise<FilesBackendsConnectDropboxResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectDropboxRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectDropboxResponse`

**CLI:** `hoody files backends connect dropbox`

---

### `connectFichier`

**POST** `/api/v1/backends/fichier`

Connect to fichier backend

```typescript
client.files.backends.connectFichier(data: FilesBackendsConnectFichierRequest): Promise<FilesBackendsConnectFichierResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectFichierRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectFichierResponse`

**CLI:** `hoody files backends connect fichier`

---

### `connectFilefabric`

**POST** `/api/v1/backends/filefabric`

Connect to filefabric backend

```typescript
client.files.backends.connectFilefabric(data: FilesBackendsConnectFilefabricRequest): Promise<FilesBackendsConnectFilefabricResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectFilefabricRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectFilefabricResponse`

**CLI:** `hoody files backends connect filefabric`

---

### `connectFilescom`

**POST** `/api/v1/backends/filescom`

Connect to filescom backend

```typescript
client.files.backends.connectFilescom(data: FilesBackendsConnectFilescomRequest): Promise<FilesBackendsConnectFilescomResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectFilescomRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectFilescomResponse`

**CLI:** `hoody files backends connect filescom`

---

### `connectFtp`

**POST** `/api/v1/backends/ftp`

Connect to ftp backend

```typescript
client.files.backends.connectFtp(data: FilesBackendsConnectFtpRequest): Promise<FilesBackendsConnectFtpResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectFtpRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectFtpResponse`

**CLI:** `hoody files backends connect ftp`

---

### `connectGofile`

**POST** `/api/v1/backends/gofile`

Connect to gofile backend

```typescript
client.files.backends.connectGofile(data: FilesBackendsConnectGofileRequest): Promise<FilesBackendsConnectGofileResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectGofileRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectGofileResponse`

**CLI:** `hoody files backends connect gofile`

---

### `connectGoogleCloudStorage`

**POST** `/api/v1/backends/google-cloud-storage`

Connect to google cloud storage backend

```typescript
client.files.backends.connectGoogleCloudStorage(data: FilesBackendsConnectGoogleCloudStorageRequest): Promise<FilesBackendsConnectGoogleCloudStorageResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectGoogleCloudStorageRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectGoogleCloudStorageResponse`

**CLI:** `hoody files backends connect google-cloud-storage`

---

### `connectGooglePhotos`

**POST** `/api/v1/backends/google-photos`

Connect to google photos backend

```typescript
client.files.backends.connectGooglePhotos(data: FilesBackendsConnectGooglePhotosRequest): Promise<FilesBackendsConnectGooglePhotosResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectGooglePhotosRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectGooglePhotosResponse`

**CLI:** `hoody files backends connect google-photos`

---

### `connectHasher`

**POST** `/api/v1/backends/hasher`

Connect to hasher backend

```typescript
client.files.backends.connectHasher(data: FilesBackendsConnectHasherRequest): Promise<FilesBackendsConnectHasherResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectHasherRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectHasherResponse`

**CLI:** `hoody files backends connect hasher`

---

### `connectHdfs`

**POST** `/api/v1/backends/hdfs`

Connect to hdfs backend

```typescript
client.files.backends.connectHdfs(data: FilesBackendsConnectHdfsRequest): Promise<FilesBackendsConnectHdfsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectHdfsRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectHdfsResponse`

**CLI:** `hoody files backends connect hdfs`

---

### `connectHidrive`

**POST** `/api/v1/backends/hidrive`

Connect to hidrive backend

```typescript
client.files.backends.connectHidrive(data: FilesBackendsConnectHidriveRequest): Promise<FilesBackendsConnectHidriveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectHidriveRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectHidriveResponse`

**CLI:** `hoody files backends connect hidrive`

---

### `connectHttp`

**POST** `/api/v1/backends/http`

Connect to http backend

```typescript
client.files.backends.connectHttp(data: FilesBackendsConnectHttpRequest): Promise<FilesBackendsConnectHttpResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectHttpRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectHttpResponse`

**CLI:** `hoody files backends connect http`

---

### `connectIclouddrive`

**POST** `/api/v1/backends/iclouddrive`

Connect to iclouddrive backend

```typescript
client.files.backends.connectIclouddrive(data: FilesBackendsConnectIclouddriveRequest): Promise<FilesBackendsConnectIclouddriveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectIclouddriveRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectIclouddriveResponse`

**CLI:** `hoody files backends connect iclouddrive`

---

### `connectImagekit`

**POST** `/api/v1/backends/imagekit`

Connect to imagekit backend

```typescript
client.files.backends.connectImagekit(data: FilesBackendsConnectImagekitRequest): Promise<FilesBackendsConnectImagekitResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectImagekitRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectImagekitResponse`

**CLI:** `hoody files backends connect imagekit`

---

### `connectInternetarchive`

**POST** `/api/v1/backends/internetarchive`

Connect to internetarchive backend

```typescript
client.files.backends.connectInternetarchive(data: FilesBackendsConnectInternetarchiveRequest): Promise<FilesBackendsConnectInternetarchiveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectInternetarchiveRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectInternetarchiveResponse`

**CLI:** `hoody files backends connect internetarchive`

---

### `connectJottacloud`

**POST** `/api/v1/backends/jottacloud`

Connect to jottacloud backend

```typescript
client.files.backends.connectJottacloud(data: FilesBackendsConnectJottacloudRequest): Promise<FilesBackendsConnectJottacloudResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectJottacloudRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectJottacloudResponse`

**CLI:** `hoody files backends connect jottacloud`

---

### `connectKoofr`

**POST** `/api/v1/backends/koofr`

Connect to koofr backend

```typescript
client.files.backends.connectKoofr(data: FilesBackendsConnectKoofrRequest): Promise<FilesBackendsConnectKoofrResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectKoofrRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectKoofrResponse`

**CLI:** `hoody files backends connect koofr`

---

### `connectLinkbox`

**POST** `/api/v1/backends/linkbox`

Connect to linkbox backend

```typescript
client.files.backends.connectLinkbox(data: FilesBackendsConnectLinkboxRequest): Promise<FilesBackendsConnectLinkboxResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectLinkboxRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectLinkboxResponse`

**CLI:** `hoody files backends connect linkbox`

---

### `connectLocal`

**POST** `/api/v1/backends/local`

Connect to local backend

```typescript
client.files.backends.connectLocal(data: FilesBackendsConnectLocalRequest): Promise<FilesBackendsConnectLocalResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectLocalRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectLocalResponse`

**CLI:** `hoody files backends connect local`

---

### `connectMailru`

**POST** `/api/v1/backends/mailru`

Connect to mailru backend

```typescript
client.files.backends.connectMailru(data: FilesBackendsConnectMailruRequest): Promise<FilesBackendsConnectMailruResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectMailruRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectMailruResponse`

**CLI:** `hoody files backends connect mailru`

---

### `connectMega`

**POST** `/api/v1/backends/mega`

Connect to mega backend

```typescript
client.files.backends.connectMega(data: FilesBackendsConnectMegaRequest): Promise<FilesBackendsConnectMegaResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectMegaRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectMegaResponse`

**CLI:** `hoody files backends connect mega`

---

### `connectMemory`

**POST** `/api/v1/backends/memory`

Connect to memory backend

```typescript
client.files.backends.connectMemory(data: FilesBackendsConnectMemoryRequest): Promise<FilesBackendsConnectMemoryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectMemoryRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectMemoryResponse`

**CLI:** `hoody files backends connect memory`

---

### `connectNetstorage`

**POST** `/api/v1/backends/netstorage`

Connect to netstorage backend

```typescript
client.files.backends.connectNetstorage(data: FilesBackendsConnectNetstorageRequest): Promise<FilesBackendsConnectNetstorageResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectNetstorageRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectNetstorageResponse`

**CLI:** `hoody files backends connect netstorage`

---

### `connectOnedrive`

**POST** `/api/v1/backends/onedrive`

Connect to onedrive backend

```typescript
client.files.backends.connectOnedrive(data: FilesBackendsConnectOnedriveRequest): Promise<FilesBackendsConnectOnedriveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectOnedriveRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectOnedriveResponse`

**CLI:** `hoody files backends connect onedrive`

---

### `connectOpendrive`

**POST** `/api/v1/backends/opendrive`

Connect to opendrive backend

```typescript
client.files.backends.connectOpendrive(data: FilesBackendsConnectOpendriveRequest): Promise<FilesBackendsConnectOpendriveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectOpendriveRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectOpendriveResponse`

**CLI:** `hoody files backends connect opendrive`

---

### `connectOracleobjectstorage`

**POST** `/api/v1/backends/oracleobjectstorage`

Connect to oracleobjectstorage backend

```typescript
client.files.backends.connectOracleobjectstorage(data: FilesBackendsConnectOracleobjectstorageRequest): Promise<FilesBackendsConnectOracleobjectstorageResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectOracleobjectstorageRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectOracleobjectstorageResponse`

**CLI:** `hoody files backends connect oracleobjectstorage`

---

### `connectPcloud`

**POST** `/api/v1/backends/pcloud`

Connect to pcloud backend

```typescript
client.files.backends.connectPcloud(data: FilesBackendsConnectPcloudRequest): Promise<FilesBackendsConnectPcloudResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectPcloudRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectPcloudResponse`

**CLI:** `hoody files backends connect pcloud`

---

### `connectPikpak`

**POST** `/api/v1/backends/pikpak`

Connect to pikpak backend

```typescript
client.files.backends.connectPikpak(data: FilesBackendsConnectPikpakRequest): Promise<FilesBackendsConnectPikpakResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectPikpakRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectPikpakResponse`

**CLI:** `hoody files backends connect pikpak`

---

### `connectPixeldrain`

**POST** `/api/v1/backends/pixeldrain`

Connect to pixeldrain backend

```typescript
client.files.backends.connectPixeldrain(data: FilesBackendsConnectPixeldrainRequest): Promise<FilesBackendsConnectPixeldrainResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectPixeldrainRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectPixeldrainResponse`

**CLI:** `hoody files backends connect pixeldrain`

---

### `connectPremiumizeme`

**POST** `/api/v1/backends/premiumizeme`

Connect to premiumizeme backend

```typescript
client.files.backends.connectPremiumizeme(data: FilesBackendsConnectPremiumizemeRequest): Promise<FilesBackendsConnectPremiumizemeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectPremiumizemeRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectPremiumizemeResponse`

**CLI:** `hoody files backends connect premiumizeme`

---

### `connectProtondrive`

**POST** `/api/v1/backends/protondrive`

Connect to protondrive backend

```typescript
client.files.backends.connectProtondrive(data: FilesBackendsConnectProtondriveRequest): Promise<FilesBackendsConnectProtondriveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectProtondriveRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectProtondriveResponse`

**CLI:** `hoody files backends connect protondrive`

---

### `connectPutio`

**POST** `/api/v1/backends/putio`

Connect to putio backend

```typescript
client.files.backends.connectPutio(data: FilesBackendsConnectPutioRequest): Promise<FilesBackendsConnectPutioResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectPutioRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectPutioResponse`

**CLI:** `hoody files backends connect putio`

---

### `connectQingstor`

**POST** `/api/v1/backends/qingstor`

Connect to qingstor backend

```typescript
client.files.backends.connectQingstor(data: FilesBackendsConnectQingstorRequest): Promise<FilesBackendsConnectQingstorResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectQingstorRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectQingstorResponse`

**CLI:** `hoody files backends connect qingstor`

---

### `connectQuatrix`

**POST** `/api/v1/backends/quatrix`

Connect to quatrix backend

```typescript
client.files.backends.connectQuatrix(data: FilesBackendsConnectQuatrixRequest): Promise<FilesBackendsConnectQuatrixResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectQuatrixRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectQuatrixResponse`

**CLI:** `hoody files backends connect quatrix`

---

### `connectS3`

**POST** `/api/v1/backends/s3`

Connect to s3 backend

```typescript
client.files.backends.connectS3(data: FilesBackendsConnectS3Request): Promise<FilesBackendsConnectS3Response>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectS3Request` | Yes | body |  |

**Returns:** `FilesBackendsConnectS3Response`

**CLI:** `hoody files backends connect s3`

---

### `connectSeafile`

**POST** `/api/v1/backends/seafile`

Connect to seafile backend

```typescript
client.files.backends.connectSeafile(data: FilesBackendsConnectSeafileRequest): Promise<FilesBackendsConnectSeafileResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectSeafileRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectSeafileResponse`

**CLI:** `hoody files backends connect seafile`

---

### `connectSftp`

**POST** `/api/v1/backends/sftp`

Connect to sftp backend

```typescript
client.files.backends.connectSftp(data: FilesBackendsConnectSftpRequest): Promise<FilesBackendsConnectSftpResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectSftpRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectSftpResponse`

**CLI:** `hoody files backends connect sftp`

---

### `connectSharefile`

**POST** `/api/v1/backends/sharefile`

Connect to sharefile backend

```typescript
client.files.backends.connectSharefile(data: FilesBackendsConnectSharefileRequest): Promise<FilesBackendsConnectSharefileResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectSharefileRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectSharefileResponse`

**CLI:** `hoody files backends connect sharefile`

---

### `connectSia`

**POST** `/api/v1/backends/sia`

Connect to sia backend

```typescript
client.files.backends.connectSia(data: FilesBackendsConnectSiaRequest): Promise<FilesBackendsConnectSiaResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectSiaRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectSiaResponse`

**CLI:** `hoody files backends connect sia`

---

### `connectSmb`

**POST** `/api/v1/backends/smb`

Connect to smb backend

```typescript
client.files.backends.connectSmb(data: FilesBackendsConnectSmbRequest): Promise<FilesBackendsConnectSmbResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectSmbRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectSmbResponse`

**CLI:** `hoody files backends connect smb`

---

### `connectStorj`

**POST** `/api/v1/backends/storj`

Connect to storj backend

```typescript
client.files.backends.connectStorj(data: FilesBackendsConnectStorjRequest): Promise<FilesBackendsConnectStorjResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectStorjRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectStorjResponse`

**CLI:** `hoody files backends connect storj`

---

### `connectSugarsync`

**POST** `/api/v1/backends/sugarsync`

Connect to sugarsync backend

```typescript
client.files.backends.connectSugarsync(data: FilesBackendsConnectSugarsyncRequest): Promise<FilesBackendsConnectSugarsyncResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectSugarsyncRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectSugarsyncResponse`

**CLI:** `hoody files backends connect sugarsync`

---

### `connectSwift`

**POST** `/api/v1/backends/swift`

Connect to swift backend

```typescript
client.files.backends.connectSwift(data: FilesBackendsConnectSwiftRequest): Promise<FilesBackendsConnectSwiftResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectSwiftRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectSwiftResponse`

**CLI:** `hoody files backends connect swift`

---

### `connectTardigrade`

**POST** `/api/v1/backends/tardigrade`

Connect to tardigrade backend

```typescript
client.files.backends.connectTardigrade(data: FilesBackendsConnectTardigradeRequest): Promise<FilesBackendsConnectTardigradeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectTardigradeRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectTardigradeResponse`

**CLI:** `hoody files backends connect tardigrade`

---

### `connectUlozto`

**POST** `/api/v1/backends/ulozto`

Connect to ulozto backend

```typescript
client.files.backends.connectUlozto(data: FilesBackendsConnectUloztoRequest): Promise<FilesBackendsConnectUloztoResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectUloztoRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectUloztoResponse`

**CLI:** `hoody files backends connect ulozto`

---

### `connectUnion`

**POST** `/api/v1/backends/union`

Connect to union backend

```typescript
client.files.backends.connectUnion(data: FilesBackendsConnectUnionRequest): Promise<FilesBackendsConnectUnionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectUnionRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectUnionResponse`

**CLI:** `hoody files backends connect union`

---

### `connectUptobox`

**POST** `/api/v1/backends/uptobox`

Connect to uptobox backend

```typescript
client.files.backends.connectUptobox(data: FilesBackendsConnectUptoboxRequest): Promise<FilesBackendsConnectUptoboxResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectUptoboxRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectUptoboxResponse`

**CLI:** `hoody files backends connect uptobox`

---

### `connectWebdav`

**POST** `/api/v1/backends/webdav`

Connect to webdav backend

```typescript
client.files.backends.connectWebdav(data: FilesBackendsConnectWebdavRequest): Promise<FilesBackendsConnectWebdavResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectWebdavRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectWebdavResponse`

**CLI:** `hoody files backends connect webdav`

---

### `connectYandex`

**POST** `/api/v1/backends/yandex`

Connect to yandex backend

```typescript
client.files.backends.connectYandex(data: FilesBackendsConnectYandexRequest): Promise<FilesBackendsConnectYandexResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectYandexRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectYandexResponse`

**CLI:** `hoody files backends connect yandex`

---

### `connectZoho`

**POST** `/api/v1/backends/zoho`

Connect to zoho backend

```typescript
client.files.backends.connectZoho(data: FilesBackendsConnectZohoRequest): Promise<FilesBackendsConnectZohoResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsConnectZohoRequest` | Yes | body |  |

**Returns:** `FilesBackendsConnectZohoResponse`

**CLI:** `hoody files backends connect zoho`

---

### `disconnect`

**DELETE** `/api/v1/backends/{id}`

Disconnect backend

```typescript
client.files.backends.disconnect(id: string): Promise<FilesBackendsDisconnectResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `FilesBackendsDisconnectResponse`

**CLI:** `hoody files backends disconnect`

---

### `getDetails`

**GET** `/api/v1/backends/{id}`

Get backend details

```typescript
client.files.backends.getDetails(id: string): Promise<FilesBackendsGetDetailsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `FilesBackendsGetDetailsResponse`

**CLI:** `hoody files backends get`

---

### `list`

**GET** `/api/v1/backends`

List all backends

```typescript
client.files.backends.list(): Promise<FilesBackendsListResponse>
```

**Returns:** `FilesBackendsListResponse`

**CLI:** `hoody files backends list`

---

### `testConnection`

**GET** `/api/v1/backends/{id}/test`

Test backend connection

```typescript
client.files.backends.testConnection(id: string): Promise<FilesBackendsTestConnectionResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `FilesBackendsTestConnectionResponse`

**CLI:** `hoody files backends test`

---

### `update`

**PUT** `/api/v1/backends/{id}`

Update backend credentials

```typescript
client.files.backends.update(id: string, data: FilesBackendsUpdateRequest): Promise<FilesBackendsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Backend ID (16-character hex string) |
| `data` | `FilesBackendsUpdateRequest` | Yes | body |  |

**Returns:** `FilesBackendsUpdateResponse`

**CLI:** `hoody files backends update`

---

## `client.files.directories` (1 method)

### `create`

**MKCOL** `/{path}`

Create directory

```typescript
client.files.directories.create(path: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |

**Returns:** `ApiResponse<unknown>`

---

## `client.files.downloads` (4 methods)

### `fetch`

**GET** `/{directory}?download`

Download file from remote URL

```typescript
client.files.downloads.fetch(directory: string, options?: { download: string; filename?: string; timeout?: number }): Promise<FilesDownloadsFetchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `directory` | `string` | Yes | path | Destination directory |
| `download` | `string` | Yes | query | URL to download from |
| `filename` | `string` | No | query | Custom filename for downloaded file |
| `timeout` | `number` | No | query | Download timeout in seconds |

**Returns:** `FilesDownloadsFetchResponse`

**CLI:** `hoody files downloads url`

---

### `getHistory`

**GET** `/?download_history`

Download history

```typescript
client.files.downloads.getHistory(options?: { download_history: "" }): Promise<FilesDownloadsGetHistoryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `download_history` | `""` | Yes | query |  |

**Returns:** `FilesDownloadsGetHistoryResponse`

**CLI:** `hoody files downloads history`

---

### `listActive`

**GET** `/{directory}?downloads`

List active downloads

```typescript
client.files.downloads.listActive(directory: string, options?: { downloads: "" }): Promise<FilesDownloadsListActiveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `directory` | `string` | Yes | path |  |
| `downloads` | `""` | Yes | query |  |

**Returns:** `FilesDownloadsListActiveResponse`

**CLI:** `hoody files downloads active`

---

### `listGlobal`

**GET** `/api/v1/downloads`

List active downloads

```typescript
client.files.downloads.listGlobal(): Promise<FilesDownloadsListGlobalResponse>
```

**Returns:** `FilesDownloadsListGlobalResponse`

**CLI:** `hoody files downloads all`

---

## `client.files` (21 methods)

### `append`

**PUT** `/api/v1/files/append/{path}`

Append data to file

```typescript
client.files.append(path: string, data: object, options?: { owner?: string }): Promise<FilesAppendResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | File path |
| `data` | `object` | Yes | body |  |
| `owner` | `string` | No | query | Create-time owner (user[:group]/uid[:gid]) when this append creates a new file. Requires --allow-chown + allowlist; refuses root. Absent → server default. |

**Returns:** `FilesAppendResponse`

**CLI:** `hoody files append`

---

### `chmod`

**PATCH** `/api/v1/files/chmod/{path}`

Change file permissions

```typescript
client.files.chmod(path: string, options?: { chmod: string }): Promise<FilesChmodResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | File or directory path |
| `chmod` | `string` | Yes | query | Octal permission mode (e.g., 755, 644, 0755) |

**Returns:** `FilesChmodResponse`

**CLI:** `hoody files chmod`

---

### `chown`

**PATCH** `/api/v1/files/chown/{path}`

Change file ownership

```typescript
client.files.chown(path: string, options?: { chown: string }): Promise<FilesChownResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | File or directory path |
| `chown` | `string` | Yes | query | Owner and optional group (e.g., user:group, user,:group, or UID:GID) |

**Returns:** `FilesChownResponse`

**CLI:** `hoody files chown`

---

### `copy`

**POST** `/api/v1/files/copy/{path}`

Copy file or directory

```typescript
client.files.copy(path: string, options?: { copy_to: string; overwrite?: "true" | "false"; owner?: string }): Promise<FilesCopyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Source file or directory path |
| `copy_to` | `string` | Yes | query | Destination path to copy the file/directory to |
| `overwrite` | `"true" \| "false"` | No | query | Allow overwriting existing destination (default: false) |
| `owner` | `string` | No | query | Create-time owner (user[:group]/uid[:gid]) for newly-created copies. Requires --allow-chown + allowlist; refuses root. Overwritten existing files preserve their owner. Absent → server default. |

**Returns:** `FilesCopyResponse`

**CLI:** `hoody files copy`

---

### `delete`

**DELETE** `/api/v1/files/{path}`

Delete file or directory

```typescript
client.files.delete(path: string, options?: { backend?: string }): Promise<FilesDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `backend` | `string` | No | query | Backend ID for remote file deletion |

**Returns:** `FilesDeleteResponse`

**CLI:** `hoody files delete`

---

### `deleteRecursive`

**DELETE** `/{path}`

Delete file or directory

```typescript
client.files.deleteRecursive(path: string): Promise<FilesDeleteRecursiveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Path to file or directory to delete |

**Returns:** `FilesDeleteRecursiveResponse`

**CLI:** `hoody files delete-recursive`

---

### `get`

**GET** `/api/v1/files/{path}`

List directory or download file

```typescript
client.files.get(path: string, options?: { backend?: string; hash?: ""; sha256?: ""; base64?: ""; preview?: ""; contents?: ""; stat?: ""; thumbnail?: string; grep?: string; ignore_case?: boolean; fixed_string?: boolean; glob?: string; context?: number; max_count?: number; max_matches?: number; max_depth?: number; max_filesize?: number; timeout?: number; no_ignore?: boolean; max_results?: number; max_files_scanned?: number; sort?: "mtime" | "name" | "size"; order?: "asc" | "desc"; lines?: string; history?: ""; at?: string; revision?: number; diff?: ""; from_seq?: number; from_ts?: string; to_seq?: number; to_ts?: string; after_id?: number; limit?: number; zip?: "" }): Promise<FilesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | File or directory path |
| `backend` | `string` | No | query | Backend ID for remote file access |
| `hash` | `""` | No | query | Get SHA256 hash of file |
| `sha256` | `""` | No | query | Get SHA256 hash of file (alias for hash) |
| `base64` | `""` | No | query | Get file content as base64 |
| `preview` | `""` | No | query | Preview archive contents (for zip/tar files). Alias: ?contents |
| `contents` | `""` | No | query | Alias for ?preview - list archive contents |
| `stat` | `""` | No | query | Get file/directory metadata (stat) without downloading content |
| `thumbnail` | `string` | No | query | Return a processed image (resize, format convert, blur, grayscale). Requires the service to be started with --allow-thumbnails; returns 403 when disabled. |
| `grep` | `string` | No | query | Search file/directory contents for regex pattern (or literal if fixed_string=true). Requires --allow-grep. |
| `ignore_case` | `boolean` | No | query | Case-insensitive grep matching |
| `fixed_string` | `boolean` | No | query | Treat grep pattern as literal string, not regex |
| `glob` | `string` | No | query | Find files matching glob pattern (e.g. '**/*.rs', 'src/**/*.{ts,tsx}'). Requires --allow-search. Directory paths only. |
| `context` | `number` | No | query | Number of context lines before/after each grep match |
| `max_count` | `number` | No | query | Max matches per file for grep |
| `max_matches` | `number` | No | query | Total max matches across all files for grep |
| `max_depth` | `number` | No | query | Directory recursion depth for grep |
| `max_filesize` | `number` | No | query | Skip files larger than this (bytes) during grep |
| `timeout` | `number` | No | query | Grep timeout in seconds |
| `no_ignore` | `boolean` | No | query | Bypass.gitignore filtering during grep |
| `max_results` | `number` | No | query | Max entries returned for glob search |
| `max_files_scanned` | `number` | No | query | Max filesystem entries scanned during glob search |
| `sort` | `"mtime" \| "name" \| "size"` | No | query | Sort glob results by: mtime (default), name, or size |
| `order` | `"asc" \| "desc"` | No | query | Sort order for glob results. Default: desc for mtime, asc for name/size |
| `lines` | `string` | No | query | Extract specific lines from a file. Formats: '10-50' (range, 1-indexed inclusive), '100' (single line), '-20' (last 20 lines / tail), '50-' (line 50 to end). Returns text/plain with X-Line-Range header. X-Total-Lines header included when naturally known (scan reached EOF). Max 100,000 lines or 64MB per request. |
| `history` | `""` | No | query | List all revisions of a file. Returns JSON with revisions array, pagination via after_id. Mutually exclusive with at/revision/diff. |
| `at` | `string` | No | query | Read file content at a point in time. Accepts RFC3339 timestamp or Unix milliseconds. Mutually exclusive with history/revision/diff. Composable with ?lines, ?hash, ?base64. |
| `revision` | `number` | No | query | Read file content by stable per-path sequence number. Mutually exclusive with history/at/diff. Composable with ?lines, ?hash, ?base64. |
| `diff` | `""` | No | query | Compute unified diff between two versions. Requires from_seq or from_ts. Optional to_seq or to_ts (defaults to current file). Mutually exclusive with history/at/revision. |
| `from_seq` | `number` | No | query | Source revision seq number for ?diff. Mutually exclusive with from_ts. |
| `from_ts` | `string` | No | query | Source timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with from_seq. |
| `to_seq` | `number` | No | query | Target revision seq number for ?diff. Mutually exclusive with to_ts. Default: current file on disk. |
| `to_ts` | `string` | No | query | Target timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with to_seq. |
| `after_id` | `number` | No | query | Cursor for ?history pagination. Returns entries with id &gt; after_id. |
| `limit` | `number` | No | query | Max entries to return for ?history. |
| `zip` | `""` | No | query | Download a directory as a streaming zip archive (bare flag, e.g. ?zip). Local directories only; requires --allow-archive. Same behavior as the WebDAV-style /{directory}?zip. |

**Returns:** `FilesGetResponse`

**CLI:** `hoody files get`

---

### `getMetadata`

**HEAD** `/{path}`

Get file metadata

```typescript
client.files.getMetadata(path: string, options?: { history?: ""; at?: string; revision?: number; diff?: ""; from_seq?: number; from_ts?: string; to_seq?: number; to_ts?: string; after_id?: number; limit?: number }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `history` | `""` | No | query | List all revisions of a file. Returns JSON with revisions array, pagination via after_id. Mutually exclusive with at/revision/diff. |
| `at` | `string` | No | query | Read file content at a point in time. Accepts RFC3339 timestamp or Unix milliseconds. Mutually exclusive with history/revision/diff. Composable with ?lines, ?hash, ?base64. |
| `revision` | `number` | No | query | Read file content by stable per-path sequence number. Mutually exclusive with history/at/diff. Composable with ?lines, ?hash, ?base64. |
| `diff` | `""` | No | query | Compute unified diff between two versions. Requires from_seq or from_ts. Optional to_seq or to_ts (defaults to current file). Mutually exclusive with history/at/revision. |
| `from_seq` | `number` | No | query | Source revision seq number for ?diff. Mutually exclusive with from_ts. |
| `from_ts` | `string` | No | query | Source timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with from_seq. |
| `to_seq` | `number` | No | query | Target revision seq number for ?diff. Mutually exclusive with to_ts. Default: current file on disk. |
| `to_ts` | `string` | No | query | Target timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with to_seq. |
| `after_id` | `number` | No | query | Cursor for ?history pagination. Returns entries with id &gt; after_id. |
| `limit` | `number` | No | query | Max entries to return for ?history. |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody files metadata`

---

### `glob`

**GET** `/api/v1/files/glob/{path}`

Find files by glob pattern

```typescript
client.files.glob(path: string, options?: { pattern: string; max_results?: number; max_depth?: number; max_files_scanned?: number; timeout?: number; no_ignore?: boolean; sort?: "mtime" | "name" | "size"; order?: "asc" | "desc" }): Promise<FilesGlobResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Directory path to search within |
| `pattern` | `string` | Yes | query | Glob pattern (e.g. '**/*.rs', 'src/**/*.{ts,tsx}', '*.md') |
| `max_results` | `number` | No | query | Maximum entries to return |
| `max_depth` | `number` | No | query | Maximum directory recursion depth |
| `max_files_scanned` | `number` | No | query | Maximum filesystem entries to scan |
| `timeout` | `number` | No | query | Search timeout in seconds |
| `no_ignore` | `boolean` | No | query | Bypass.gitignore filtering |
| `sort` | `"mtime" \| "name" \| "size"` | No | query | Sort results by: mtime (modification time), name, or size |
| `order` | `"asc" \| "desc"` | No | query | Sort order. Default: desc for mtime, asc for name/size |

**Returns:** `FilesGlobResponse`

**CLI:** `hoody files glob`

---

### `grep`

**GET** `/api/v1/files/grep/{path}`

Search file contents (grep)

```typescript
client.files.grep(path: string, options?: { pattern: string; ignore_case?: boolean; fixed_string?: boolean; glob?: string; context?: number; max_count?: number; max_matches?: number; max_depth?: number; max_filesize?: number; timeout?: number; no_ignore?: boolean }): Promise<FilesGrepResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | File or directory path to search |
| `pattern` | `string` | Yes | query | Search pattern (regex by default, literal if fixed_string=true) |
| `ignore_case` | `boolean` | No | query | Case-insensitive matching |
| `fixed_string` | `boolean` | No | query | Treat pattern as literal string, not regex |
| `glob` | `string` | No | query | Filter files by glob pattern (e.g. '*.rs', '*.{ts,tsx}') |
| `context` | `number` | No | query | Number of context lines before and after each match |
| `max_count` | `number` | No | query | Maximum matches per file |
| `max_matches` | `number` | No | query | Total maximum matches across all files |
| `max_depth` | `number` | No | query | Maximum directory recursion depth |
| `max_filesize` | `number` | No | query | Skip files larger than this (bytes) |
| `timeout` | `number` | No | query | Search timeout in seconds |
| `no_ignore` | `boolean` | No | query | Bypass.gitignore filtering |

**Returns:** `FilesGrepResponse`

**CLI:** `hoody files grep`

---

### `listDirectory`

**GET** `/{path}`

List directory contents or download file

```typescript
client.files.listDirectory(path: string, options?: { json?: ""; simple?: ""; sort?: "name" | "mtime" | "size"; order?: "asc" | "desc"; hash?: ""; sha256?: ""; base64?: ""; edit?: ""; view?: ""; download?: "" | "1" | "true"; contentType?: string; history?: ""; at?: string; revision?: number; diff?: ""; from_seq?: number; from_ts?: string; to_seq?: number; to_ts?: string; after_id?: number; limit?: number }): Promise<FilesListDirectoryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | File or directory path |
| `json` | `""` | No | query | Return JSON format instead of HTML |
| `simple` | `""` | No | query | Return simple text listing |
| `sort` | `"name" \| "mtime" \| "size"` | No | query | Sort by field |
| `order` | `"asc" \| "desc"` | No | query | Sort order |
| `hash` | `""` | No | query | Get SHA256 hash of file (returns plain text hash) |
| `sha256` | `""` | No | query | Get SHA256 hash of file (alias for hash) |
| `base64` | `""` | No | query | Get file content as base64 encoded string |
| `edit` | `""` | No | query | Open file in Web UI editor (requires allow-upload permission) |
| `view` | `""` | No | query | View file in Web UI (read-only mode) |
| `download` | `"" \| "1" \| "true"` | No | query | For file paths only: force browser download (Content-Disposition: attachment). Accepted values: empty (?download), 1, or true. For directory paths, ?download is the URL download-manager operation. |
| `contentType` | `string` | No | query | Override Content-Type header for file downloads |
| `history` | `""` | No | query | List all revisions of a file. Returns JSON with revisions array, pagination via after_id. Mutually exclusive with at/revision/diff. |
| `at` | `string` | No | query | Read file content at a point in time. Accepts RFC3339 timestamp or Unix milliseconds. Mutually exclusive with history/revision/diff. Composable with ?lines, ?hash, ?base64. |
| `revision` | `number` | No | query | Read file content by stable per-path sequence number. Mutually exclusive with history/at/diff. Composable with ?lines, ?hash, ?base64. |
| `diff` | `""` | No | query | Compute unified diff between two versions. Requires from_seq or from_ts. Optional to_seq or to_ts (defaults to current file). Mutually exclusive with history/at/revision. |
| `from_seq` | `number` | No | query | Source revision seq number for ?diff. Mutually exclusive with from_ts. |
| `from_ts` | `string` | No | query | Source timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with from_seq. |
| `to_seq` | `number` | No | query | Target revision seq number for ?diff. Mutually exclusive with to_ts. Default: current file on disk. |
| `to_ts` | `string` | No | query | Target timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with to_seq. |
| `after_id` | `number` | No | query | Cursor for ?history pagination. Returns entries with id &gt; after_id. |
| `limit` | `number` | No | query | Max entries to return for ?history. |

**Returns:** `FilesListDirectoryResponse`

**CLI:** `hoody files dir`

---

### `move`

**POST** `/api/v1/files/move/{path}`

Move file or directory

```typescript
client.files.move(path: string, options?: { move_to: string; owner?: string }): Promise<FilesMoveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Source file or directory path |
| `move_to` | `string` | Yes | query | Destination path to move the file/directory to |
| `owner` | `string` | No | query | Create-time owner (user[:group]/uid[:gid]) for newly-created destination PARENT directories. Requires --allow-chown + --allowed-create-owners; refuses root. The moved inode itself preserves its existing owner. Absent → server default. |

**Returns:** `FilesMoveResponse`

**CLI:** `hoody files move`

---

### `operate`

**POST** `/api/v1/files/{path}`

File operations (mkdir, extract, download, move, copy)

```typescript
client.files.operate(path: string, options?: { backend?: string; mkdir?: ""; extract?: string; dest?: string; download_from?: string; move_to?: string; copy_to?: string; overwrite?: "true" | "false"; owner?: string }): Promise<FilesOperateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `backend` | `string` | No | query |  |
| `mkdir` | `""` | No | query | Create directory |
| `extract` | `string` | No | query | Extract archive. Empty value extracts all; non-empty value is a selective path to extract (e.g. "src/" or "lib/") |
| `dest` | `string` | No | query | Destination directory name for extraction (default: archive name without extension) |
| `download_from` | `string` | No | query | Download file from remote URL |
| `move_to` | `string` | No | query | Move file/directory to destination path |
| `copy_to` | `string` | No | query | Copy file/directory to destination path |
| `overwrite` | `"true" \| "false"` | No | query | Allow overwriting existing destination (for copy) |
| `owner` | `string` | No | query | Create-time owner for newly-created inodes as user[:group] or uid[:gid]. Requires --allow-chown and must resolve to an entry in --allowed-create-owners; refuses root (uid/gid 0). Absent → the server default create owner. Applies to mkdir/extract/download_from/copy_to. |

**Returns:** `FilesOperateResponse`

**CLI:** `hoody files operation`

---

### `patch`

**PATCH** `/{path}`

File operations

```typescript
client.files.patch(path: string, data?: FilesPatchRequest, options?: { XUpdateRange?: "append" }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `data` | `FilesPatchRequest` | No | body |  |
| `XUpdateRange` | `"append"` | No | header | Set to 'append' to append data to the end of the file. Perfect for logs and incremental writes. Example: curl -X PATCH -H 'X-Update-Range: append' --data-binary @data.txt http://server/file.log |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody files patch`

---

### `patchApi`

**PATCH** `/api/v1/files/{path}`

Modify file properties or move/rename

```typescript
client.files.patchApi(path: string, data?: FilesPatchApiRequest, options?: { backend?: string; owner?: string; chmod?: string; chown?: string }): Promise<FilesPatchApiResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | File path |
| `data` | `FilesPatchApiRequest` | No | body |  |
| `backend` | `string` | No | query | Backend ID for remote file operations |
| `owner` | `string` | No | query | Create-time owner (user[:group]/uid[:gid]) for newly-created destination parent directories on a JSON-body move_to. Requires --allow-chown + --allowed-create-owners; cannot be root. The moved item keeps its own owner. Absent → server default. |
| `chmod` | `string` | No | query | Set file permissions using octal mode value (e.g., ?chmod=755) |
| `chown` | `string` | No | query | Set file ownership (e.g., ?chown=user:group or ?chown=user) |

**Returns:** `FilesPatchApiResponse`

**CLI:** `hoody files modify-properties`

---

### `put`

**PUT** `/api/v1/files/{path}`

Upload or append file

```typescript
client.files.put(path: string, data: object, options?: { backend?: string; append?: ""; owner?: string }): Promise<FilesPutResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `data` | `object` | Yes | body |  |
| `backend` | `string` | No | query | Backend ID for remote upload |
| `append` | `""` | No | query | Append body to end of existing file (create if missing) instead of overwriting |
| `owner` | `string` | No | query | Create-time owner (user[:group]/uid[:gid]) for a newly-created file. Requires --allow-chown + --allowed-create-owners; refuses root. Overwrites/appends to an existing file preserve its owner. Absent → server default. |

**Returns:** `FilesPutResponse`

**CLI:** `hoody files put`

---

### `realpath`

**GET** `/api/v1/files/realpath/{path}`

Resolve canonical path (realpath)

```typescript
client.files.realpath(path: string): Promise<FilesRealpathResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | File or directory path to resolve |

**Returns:** `FilesRealpathResponse`

**CLI:** `hoody files realpath`

---

### `search`

**GET** `/{directory}?q`

Search directory

```typescript
client.files.search(directory: string, options?: { q: string; json?: "" }): Promise<FilesSearchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `directory` | `string` | Yes | path |  |
| `q` | `string` | Yes | query | Search query (case-insensitive filename match). Maximum 512 BYTES of UTF-8 after form/percent decoding, measured both before and after Unicode lowercasing — lowercasing can change a string's byte length in either direction. Longer queries are rejected with 400; they are not truncated. Note this is a byte limit, not a character limit, so it is deliberately not expressed as `maxLength`. |
| `json` | `""` | No | query | Return JSON format instead of HTML |

**Returns:** `FilesSearchResponse`

**CLI:** `hoody files search`

---

### `stat`

**GET** `/api/v1/files/stat/{path}`

Get file metadata (stat)

```typescript
client.files.stat(path: string): Promise<FilesStatResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | File or directory path |

**Returns:** `FilesStatResponse`

**CLI:** `hoody files stat`

---

### `touch`

**PUT** `/{path}?touch`

Touch file (create or update mtime)

```typescript
client.files.touch(path: string, options?: { touch: "" }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | File path to touch |
| `touch` | `""` | Yes | query | Flag to indicate touch operation |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody files touch`

---

### `upload`

**PUT** `/{path}`

Upload file

```typescript
client.files.upload(path: string, data: object): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Destination file path |
| `data` | `object` | Yes | body |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody files upload`

---

## `client.files.ftp` (1 method)

### `access`

**GET** `/{path}?type=ftp`

Access file via FTP

```typescript
client.files.ftp.access(path: string, options?: { type: "ftp"; server: string; user?: string; pass?: string; ftp_secure?: boolean; ftp_passive?: boolean }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `type` | `"ftp"` | Yes | query |  |
| `server` | `string` | Yes | query |  |
| `user` | `string` | No | query |  |
| `pass` | `string` | No | query |  |
| `ftp_secure` | `boolean` | No | query | Use FTPS (FTP over TLS) |
| `ftp_passive` | `boolean` | No | query | Use passive mode |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody files access ftp`

---

## `client.files.git` (1 method)

### `fetch`

**GET** `/{path}?type=git`

Fetch file from Git repository

```typescript
client.files.git.fetch(path: string, options?: { type: "git"; url: string; ref?: string; pass?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `type` | `"git"` | Yes | query |  |
| `url` | `string` | Yes | query | Full GitHub/GitLab/Bitbucket URL or repository URL |
| `ref` | `string` | No | query | Branch, tag, or commit (defaults to HEAD or extracted from URL) |
| `pass` | `string` | No | query | Personal Access Token (base64 encoded) for private repos |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody files fetch-from-git`

---

## `client.files.health` (1 method)

### `check`

**GET** `/api/v1/files/health`

Service health check

```typescript
client.files.health.check(): Promise<BrowserHealthCheckResponse>
```

**Returns:** `BrowserHealthCheckResponse`

**CLI:** `hoody files health`

---

## `client.files.images` (1 method)

### `process`

**GET** `/{image}?thumbnail`

Process and convert images

```typescript
client.files.images.process(image: string, options?: { thumbnail: ""; format?: "jpeg" | "png" | "webp" | "gif" | "bmp"; size?: string; width?: number; height?: number; resize?: "fit" | "fill" | "cover" | "exact"; quality?: "low" | "medium" | "high"; q?: number; blur?: number; grayscale?: ""; bg?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `image` | `string` | Yes | path | Path to image file |
| `thumbnail` | `""` | Yes | query | Enable image processing |
| `format` | `"jpeg" \| "png" \| "webp" \| "gif" \| "bmp"` | No | query | Output format (default: jpeg) |
| `size` | `string` | No | query | Width×Height in pixels (max: 2000×2000) |
| `width` | `number` | No | query | Width in pixels (height auto-calculated) |
| `height` | `number` | No | query | Height in pixels (width auto-calculated) |
| `resize` | `"fit" \| "fill" \| "cover" \| "exact"` | No | query | Resize mode: fit (preserve aspect, fit within), fill (exact size, crop), cover (cover area), exact (force dimensions) |
| `quality` | `"low" \| "medium" \| "high"` | No | query | Resize algorithm quality: low (box filter), medium (bilinear), high (Lanczos3) |
| `q` | `number` | No | query | JPEG/WebP quality (1-100, higher is better quality) |
| `blur` | `number` | No | query | Gaussian blur radius (0-50) |
| `grayscale` | `""` | No | query | Convert to grayscale/black-and-white |
| `bg` | `string` | No | query | Background color for transparency (hex RGB, e.g., 'ffffff' for white) |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody files process-image`

---

## `client.files.journal` (3 methods)

### `flush`

**POST** `/api/v1/journal/flush`

Flush journal to disk

```typescript
client.files.journal.flush(): Promise<FilesJournalFlushResponse>
```

**Returns:** `FilesJournalFlushResponse`

**CLI:** `hoody files journal flush`

---

### `getStats`

**GET** `/api/v1/journal/stats`

Get journal statistics

```typescript
client.files.journal.getStats(): Promise<FilesJournalGetStatsResponse>
```

**Returns:** `FilesJournalGetStatsResponse`

**CLI:** `hoody files journal stats`

---

### `query`

**GET** `/api/v1/journal`

Query journal entries

```typescript
client.files.journal.query(options?: { path?: string; op?: string; since?: string; limit?: number; after_id?: number }): Promise<FilesJournalQueryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | No | query | Filter entries by path prefix |
| `op` | `string` | No | query | Filter by operation type(s), comma-separated (e.g. 'write,delete') |
| `since` | `string` | No | query | Filter entries since timestamp (RFC3339 or Unix ms) |
| `limit` | `number` | No | query | Max entries to return |
| `after_id` | `number` | No | query | Cursor: return entries with id &gt; after_id |

**Returns:** `FilesJournalQueryResponse`

**CLI:** `hoody files journal query`

---

## `client.files.mounts` (5 methods)

### `create`

**POST** `/api/v1/mounts`

Create persistent FUSE mount

```typescript
client.files.mounts.create(data: FilesMountsCreateRequest): Promise<FilesMountsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesMountsCreateRequest` | Yes | body |  |

**Returns:** `FilesMountsCreateResponse`

**CLI:** `hoody files mounts create`

---

### `getDetails`

**GET** `/api/v1/mounts/{id}`

Get mount details

```typescript
client.files.mounts.getDetails(id: string): Promise<FilesMountsGetDetailsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `FilesMountsGetDetailsResponse`

**CLI:** `hoody files mounts get`

---

### `list`

**GET** `/api/v1/mounts`

List all mounts

```typescript
client.files.mounts.list(options?: { label?: string }): Promise<FilesMountsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `label` | `string` | No | query | Filter mounts by label. Only mounts with this exact label will be returned. |

**Returns:** `FilesMountsListResponse`

**CLI:** `hoody files mounts list`

---

### `unmount`

**DELETE** `/api/v1/mounts/{id}`

Unmount filesystem

```typescript
client.files.mounts.unmount(id: string): Promise<FilesMountsUnmountResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `FilesMountsUnmountResponse`

**CLI:** `hoody files mounts unmount`

---

### `update`

**PATCH** `/api/v1/mounts/{id}`

Update mount VFS configuration

```typescript
client.files.mounts.update(id: string, data: FilesMountsUpdateRequest): Promise<FilesMountsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Mount ID |
| `data` | `FilesMountsUpdateRequest` | Yes | body |  |

**Returns:** `FilesMountsUpdateResponse`

**CLI:** `hoody files mounts update`

---

## `client.files.s3` (1 method)

### `access`

**GET** `/{path}?type=s3`

Access file from S3

```typescript
client.files.s3.access(path: string, options?: { type: "s3"; server: string; s3_bucket: string; s3_region: string; user?: string; pass?: string; s3_endpoint?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `type` | `"s3"` | Yes | query |  |
| `server` | `string` | Yes | query |  |
| `s3_bucket` | `string` | Yes | query | S3 bucket name |
| `s3_region` | `string` | Yes | query |  |
| `user` | `string` | No | query | AWS Access Key ID |
| `pass` | `string` | No | query | AWS Secret Key (base64 encoded) |
| `s3_endpoint` | `string` | No | query | Custom S3 endpoint for MinIO, etc. |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody files access s3`

---

## `client.files.ssh` (2 methods)

### `access`

**GET** `/{path}?type=ssh`

Access file via SSH/SFTP

```typescript
client.files.ssh.access(path: string, options?: { type: "ssh"; server: string; user: string; pass?: string; key?: string; passphrase?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `type` | `"ssh"` | Yes | query |  |
| `server` | `string` | Yes | query | Server hostname:port |
| `user` | `string` | Yes | query | SSH username |
| `pass` | `string` | No | query | Password (base64 encoded) |
| `key` | `string` | No | query | Private key PEM (base64 encoded) |
| `passphrase` | `string` | No | query | Key passphrase (base64 encoded) |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody files access ssh`

---

### `upload`

**PUT** `/{path}?type=ssh`

Upload file via SSH/SFTP

```typescript
client.files.ssh.upload(path: string, data: object, options?: { server: string; user: string; pass?: string; key?: string; passphrase?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `data` | `object` | Yes | body |  |
| `server` | `string` | Yes | query | Server hostname:port |
| `user` | `string` | Yes | query | SSH username |
| `pass` | `string` | No | query | Password (base64 encoded) |
| `key` | `string` | No | query | Private key PEM (base64 encoded) |
| `passphrase` | `string` | No | query | Key passphrase (base64 encoded) |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody files access ssh-upload`

---

## `client.files.system` (1 method)

### `getApiVersion`

**GET** `/api/v1/version`

Get API version

```typescript
client.files.system.getApiVersion(): Promise<FilesSystemGetApiVersionResponse>
```

**Returns:** `FilesSystemGetApiVersionResponse`

**CLI:** `hoody files version`

---

## `client.files.webdav` (8 methods)

### `access`

**GET** `/{path}?type=webdav`

Access file via WebDAV

```typescript
client.files.webdav.access(path: string, options?: { type: "webdav"; server: string; user?: string; pass?: string; webdav_path?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `type` | `"webdav"` | Yes | query |  |
| `server` | `string` | Yes | query |  |
| `user` | `string` | No | query |  |
| `pass` | `string` | No | query |  |
| `webdav_path` | `string` | No | query | WebDAV endpoint path |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody files access webdav`

---

### `copyResource`

**COPY** `/{path}`

Copy file or directory

```typescript
client.files.webdav.copyResource(path: string, options?: { Destination: string; Depth?: "0" | "infinity" }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Source file or directory path |
| `Destination` | `string` | Yes | header | Destination URL for the copy |
| `Depth` | `"0" \| "infinity"` | No | header | Copy depth: 0 (file only) or infinity (recursive for directories) |

**Returns:** `ApiResponse<unknown>`

---

### `getOptions`

**OPTIONS** `/{path}`

Get allowed methods

```typescript
client.files.webdav.getOptions(path: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody files options`

---

### `lockResource`

**LOCK** `/{path}`

Lock file (WebDAV compatibility)

```typescript
client.files.webdav.lockResource(path: string, data?: object, options?: { Depth?: "0" | "infinity" }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `data` | `object` | No | body |  |
| `Depth` | `"0" \| "infinity"` | No | header |  |

**Returns:** `ApiResponse<unknown>`

---

### `moveResource`

**MOVE** `/{path}`

Move or rename file/directory

```typescript
client.files.webdav.moveResource(path: string, options?: { Destination: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Source file or directory path |
| `Destination` | `string` | Yes | header | Destination URL for the move |

**Returns:** `ApiResponse<unknown>`

---

### `propfindResource`

**PROPFIND** `/{path}`

Get WebDAV properties

```typescript
client.files.webdav.propfindResource(path: string, data?: object, options?: { Depth?: "0" | "1" | "infinity" }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `data` | `object` | No | body |  |
| `Depth` | `"0" \| "1" \| "infinity"` | No | header | Depth of property retrieval: 0 (resource only), 1 (immediate children), infinity (recursive) |

**Returns:** `ApiResponse<unknown>`

---

### `proppatchResource`

**PROPPATCH** `/{path}`

Update WebDAV properties

```typescript
client.files.webdav.proppatchResource(path: string, data?: object): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `data` | `object` | No | body |  |

**Returns:** `ApiResponse<unknown>`

---

### `unlockResource`

**UNLOCK** `/{path}`

Unlock file (WebDAV compatibility)

```typescript
client.files.webdav.unlockResource(path: string, options?: { LockToken: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `LockToken` | `string` | Yes | header | Lock token to release |

**Returns:** `ApiResponse<unknown>`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
