# `files` — 120 methods

**Version:** 1.0.0-beta.15
**Accessor:** `client.files`

```typescript
import * as files from 'hoody-sdk/files';
```

---

## `client.files.archives` (4 methods)

### `extract`

**GET** `/{archive}?extract`

Extract archive

```typescript
client.files.archives.extract(archive: string, options: { extract: string; dest?: string; owner?: string }): Promise<files_ExtractionResult>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `archive` | `string` | Yes | path |  |
| `extract` | `string` | Yes | query | Empty for full extraction; path for selective (e.g. "src/" or "lib/") |
| `dest` | `string` | No | query | Destination directory name (default: archive name) |
| `owner` | `string` | No | query | Create-time owner for newly-created inodes as user[:group] or uid[:gid]. Requires the deployment to have enabled chown, and must resolve to one of the owners it permits; refuses root (uid/gid 0). Absent → the server default create owner. Applies to mkdir/extract/download_from/copy_to. |

**Returns:** `files_ExtractionResult`

**CLI:** `hoody files archives extract`

---

### `extractMember`

**GET** `/{archive}?extract_file`

Extract file from archive

```typescript
client.files.archives.extractMember(archive: string, options: { extract: string; dest?: string; cache?: boolean | number }): Promise<FilesArchivesExtractMemberResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `archive` | `string` | Yes | path | Path to archive file |
| `extract` | `string` | Yes | query | Path of the file or directory inside the archive to extract (e.g. "src/" or "lib/") |
| `dest` | `string` | No | query | Destination directory name (default: archive name) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `FilesArchivesExtractMemberResponse`

**CLI:** `hoody files archives members extract`

---

### `preview`

**GET** `/{archive}?preview`

Preview archive contents or read file

```typescript
client.files.archives.preview(archive: string, options?: { preview?: string; contents?: string; cache?: boolean | number }): Promise<FilesArchivesPreviewResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `archive` | `string` | Yes | path | Path to archive file |
| `preview` | `string` | No | query | Empty value lists archive contents; non-empty value reads a specific file from the archive (alias: ?contents) |
| `contents` | `string` | No | query | Alias for ?preview |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `FilesArchivesPreviewResponse`

**CLI:** `hoody files archives preview`

---

### `readMember`

**GET** `/{archive}?view_file`

View file from archive

```typescript
client.files.archives.readMember(archive: string, options: { preview: string; cache?: boolean | number }): Promise<ApiResponse<ArrayBuffer>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `archive` | `string` | Yes | path | Path to archive file |
| `preview` | `string` | Yes | query | Path of the file inside the archive to view (e.g. "src/" or "README.md") |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<ArrayBuffer>`

**CLI:** `hoody files archives members read`

---

## `client.files.backends` (54 methods)

### `createAzureblob`

**POST** `/api/v1/backends/azureblob`

Connect to azureblob backend

```typescript
client.files.backends.createAzureblob(data: FilesBackendsCreateAzureblobRequest): Promise<FilesBackendsCreateAzureblobResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateAzureblobRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateAzureblobResponse`

**CLI:** `hoody files backends azureblob create`

---

### `createAzurefiles`

**POST** `/api/v1/backends/azurefiles`

Connect to azurefiles backend

```typescript
client.files.backends.createAzurefiles(data: FilesBackendsCreateAzurefilesRequest): Promise<FilesBackendsCreateAzurefilesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateAzurefilesRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateAzurefilesResponse`

**CLI:** `hoody files backends azurefiles create`

---

### `createB2`

**POST** `/api/v1/backends/b2`

Connect to b2 backend

```typescript
client.files.backends.createB2(data: FilesBackendsCreateB2Request): Promise<FilesBackendsCreateB2Response>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateB2Request` | Yes | body |  |

**Returns:** `FilesBackendsCreateB2Response`

**CLI:** `hoody files backends b2 create`

---

### `createBox`

**POST** `/api/v1/backends/box`

Connect to box backend

```typescript
client.files.backends.createBox(data: FilesBackendsCreateBoxRequest): Promise<FilesBackendsCreateBoxResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateBoxRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateBoxResponse`

**CLI:** `hoody files backends box create`

---

### `createCloudinary`

**POST** `/api/v1/backends/cloudinary`

Connect to cloudinary backend

```typescript
client.files.backends.createCloudinary(data: FilesBackendsCreateCloudinaryRequest): Promise<FilesBackendsCreateCloudinaryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateCloudinaryRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateCloudinaryResponse`

**CLI:** `hoody files backends cloudinary create`

---

### `createDrive`

**POST** `/api/v1/backends/drive`

Connect to drive backend

```typescript
client.files.backends.createDrive(data: FilesBackendsCreateDriveRequest): Promise<FilesBackendsCreateDriveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateDriveRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateDriveResponse`

**CLI:** `hoody files backends drive create`

---

### `createDropbox`

**POST** `/api/v1/backends/dropbox`

Connect to dropbox backend

```typescript
client.files.backends.createDropbox(data: FilesBackendsCreateDropboxRequest): Promise<FilesBackendsCreateDropboxResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateDropboxRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateDropboxResponse`

**CLI:** `hoody files backends dropbox create`

---

### `createFichier`

**POST** `/api/v1/backends/fichier`

Connect to fichier backend

```typescript
client.files.backends.createFichier(data: FilesBackendsCreateFichierRequest): Promise<FilesBackendsCreateFichierResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateFichierRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateFichierResponse`

**CLI:** `hoody files backends fichier create`

---

### `createFilefabric`

**POST** `/api/v1/backends/filefabric`

Connect to filefabric backend

```typescript
client.files.backends.createFilefabric(data: FilesBackendsCreateFilefabricRequest): Promise<FilesBackendsCreateFilefabricResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateFilefabricRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateFilefabricResponse`

**CLI:** `hoody files backends filefabric create`

---

### `createFilescom`

**POST** `/api/v1/backends/filescom`

Connect to filescom backend

```typescript
client.files.backends.createFilescom(data: FilesBackendsCreateFilescomRequest): Promise<FilesBackendsCreateFilescomResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateFilescomRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateFilescomResponse`

**CLI:** `hoody files backends filescom create`

---

### `createFtp`

**POST** `/api/v1/backends/ftp`

Connect to ftp backend

```typescript
client.files.backends.createFtp(data: FilesBackendsCreateFtpRequest): Promise<FilesBackendsCreateFtpResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateFtpRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateFtpResponse`

**CLI:** `hoody files backends ftp create`

---

### `createGofile`

**POST** `/api/v1/backends/gofile`

Connect to gofile backend

```typescript
client.files.backends.createGofile(data: FilesBackendsCreateGofileRequest): Promise<FilesBackendsCreateGofileResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateGofileRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateGofileResponse`

**CLI:** `hoody files backends gofile create`

---

### `createGoogleCloudStorage`

**POST** `/api/v1/backends/google-cloud-storage`

Connect to google cloud storage backend

```typescript
client.files.backends.createGoogleCloudStorage(data: FilesBackendsCreateGoogleCloudStorageRequest): Promise<FilesBackendsCreateGoogleCloudStorageResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateGoogleCloudStorageRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateGoogleCloudStorageResponse`

**CLI:** `hoody files backends googlecloudstorage create`

---

### `createGooglePhotos`

**POST** `/api/v1/backends/google-photos`

Connect to google photos backend

```typescript
client.files.backends.createGooglePhotos(data: FilesBackendsCreateGooglePhotosRequest): Promise<FilesBackendsCreateGooglePhotosResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateGooglePhotosRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateGooglePhotosResponse`

**CLI:** `hoody files backends googlephotos create`

---

### `createHdfs`

**POST** `/api/v1/backends/hdfs`

Connect to hdfs backend

```typescript
client.files.backends.createHdfs(data: FilesBackendsCreateHdfsRequest): Promise<FilesBackendsCreateHdfsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateHdfsRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateHdfsResponse`

**CLI:** `hoody files backends hdfs create`

---

### `createHidrive`

**POST** `/api/v1/backends/hidrive`

Connect to hidrive backend

```typescript
client.files.backends.createHidrive(data: FilesBackendsCreateHidriveRequest): Promise<FilesBackendsCreateHidriveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateHidriveRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateHidriveResponse`

**CLI:** `hoody files backends hidrive create`

---

### `createHttp`

**POST** `/api/v1/backends/http`

Connect to http backend

```typescript
client.files.backends.createHttp(data: FilesBackendsCreateHttpRequest): Promise<FilesBackendsCreateHttpResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateHttpRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateHttpResponse`

**CLI:** `hoody files backends http create`

---

### `createIclouddrive`

**POST** `/api/v1/backends/iclouddrive`

Connect to iclouddrive backend

```typescript
client.files.backends.createIclouddrive(data: FilesBackendsCreateIclouddriveRequest): Promise<FilesBackendsCreateIclouddriveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateIclouddriveRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateIclouddriveResponse`

**CLI:** `hoody files backends iclouddrive create`

---

### `createImagekit`

**POST** `/api/v1/backends/imagekit`

Connect to imagekit backend

```typescript
client.files.backends.createImagekit(data: FilesBackendsCreateImagekitRequest): Promise<FilesBackendsCreateImagekitResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateImagekitRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateImagekitResponse`

**CLI:** `hoody files backends imagekit create`

---

### `createInternetarchive`

**POST** `/api/v1/backends/internetarchive`

Connect to internetarchive backend

```typescript
client.files.backends.createInternetarchive(data: FilesBackendsCreateInternetarchiveRequest): Promise<FilesBackendsCreateInternetarchiveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateInternetarchiveRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateInternetarchiveResponse`

**CLI:** `hoody files backends internetarchive create`

---

### `createJottacloud`

**POST** `/api/v1/backends/jottacloud`

Connect to jottacloud backend

```typescript
client.files.backends.createJottacloud(data: FilesBackendsCreateJottacloudRequest): Promise<FilesBackendsCreateJottacloudResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateJottacloudRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateJottacloudResponse`

**CLI:** `hoody files backends jottacloud create`

---

### `createKoofr`

**POST** `/api/v1/backends/koofr`

Connect to koofr backend

```typescript
client.files.backends.createKoofr(data: FilesBackendsCreateKoofrRequest): Promise<FilesBackendsCreateKoofrResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateKoofrRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateKoofrResponse`

**CLI:** `hoody files backends koofr create`

---

### `createLinkbox`

**POST** `/api/v1/backends/linkbox`

Connect to linkbox backend

```typescript
client.files.backends.createLinkbox(data: FilesBackendsCreateLinkboxRequest): Promise<FilesBackendsCreateLinkboxResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateLinkboxRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateLinkboxResponse`

**CLI:** `hoody files backends linkbox create`

---

### `createMailru`

**POST** `/api/v1/backends/mailru`

Connect to mailru backend

```typescript
client.files.backends.createMailru(data: FilesBackendsCreateMailruRequest): Promise<FilesBackendsCreateMailruResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateMailruRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateMailruResponse`

**CLI:** `hoody files backends mailru create`

---

### `createMega`

**POST** `/api/v1/backends/mega`

Connect to mega backend

```typescript
client.files.backends.createMega(data: FilesBackendsCreateMegaRequest): Promise<FilesBackendsCreateMegaResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateMegaRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateMegaResponse`

**CLI:** `hoody files backends mega create`

---

### `createNetstorage`

**POST** `/api/v1/backends/netstorage`

Connect to netstorage backend

```typescript
client.files.backends.createNetstorage(data: FilesBackendsCreateNetstorageRequest): Promise<FilesBackendsCreateNetstorageResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateNetstorageRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateNetstorageResponse`

**CLI:** `hoody files backends netstorage create`

---

### `createOnedrive`

**POST** `/api/v1/backends/onedrive`

Connect to onedrive backend

```typescript
client.files.backends.createOnedrive(data: FilesBackendsCreateOnedriveRequest): Promise<FilesBackendsCreateOnedriveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateOnedriveRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateOnedriveResponse`

**CLI:** `hoody files backends onedrive create`

---

### `createOpendrive`

**POST** `/api/v1/backends/opendrive`

Connect to opendrive backend

```typescript
client.files.backends.createOpendrive(data: FilesBackendsCreateOpendriveRequest): Promise<FilesBackendsCreateOpendriveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateOpendriveRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateOpendriveResponse`

**CLI:** `hoody files backends opendrive create`

---

### `createOracleobjectstorage`

**POST** `/api/v1/backends/oracleobjectstorage`

Connect to oracleobjectstorage backend

```typescript
client.files.backends.createOracleobjectstorage(data: FilesBackendsCreateOracleobjectstorageRequest): Promise<FilesBackendsCreateOracleobjectstorageResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateOracleobjectstorageRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateOracleobjectstorageResponse`

**CLI:** `hoody files backends oracleobjectstorage create`

---

### `createPcloud`

**POST** `/api/v1/backends/pcloud`

Connect to pcloud backend

```typescript
client.files.backends.createPcloud(data: FilesBackendsCreatePcloudRequest): Promise<FilesBackendsCreatePcloudResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreatePcloudRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreatePcloudResponse`

**CLI:** `hoody files backends pcloud create`

---

### `createPikpak`

**POST** `/api/v1/backends/pikpak`

Connect to pikpak backend

```typescript
client.files.backends.createPikpak(data: FilesBackendsCreatePikpakRequest): Promise<FilesBackendsCreatePikpakResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreatePikpakRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreatePikpakResponse`

**CLI:** `hoody files backends pikpak create`

---

### `createPixeldrain`

**POST** `/api/v1/backends/pixeldrain`

Connect to pixeldrain backend

```typescript
client.files.backends.createPixeldrain(data: FilesBackendsCreatePixeldrainRequest): Promise<FilesBackendsCreatePixeldrainResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreatePixeldrainRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreatePixeldrainResponse`

**CLI:** `hoody files backends pixeldrain create`

---

### `createPremiumizeme`

**POST** `/api/v1/backends/premiumizeme`

Connect to premiumizeme backend

```typescript
client.files.backends.createPremiumizeme(data: FilesBackendsCreatePremiumizemeRequest): Promise<FilesBackendsCreatePremiumizemeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreatePremiumizemeRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreatePremiumizemeResponse`

**CLI:** `hoody files backends premiumizeme create`

---

### `createProtondrive`

**POST** `/api/v1/backends/protondrive`

Connect to protondrive backend

```typescript
client.files.backends.createProtondrive(data: FilesBackendsCreateProtondriveRequest): Promise<FilesBackendsCreateProtondriveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateProtondriveRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateProtondriveResponse`

**CLI:** `hoody files backends protondrive create`

---

### `createPutio`

**POST** `/api/v1/backends/putio`

Connect to putio backend

```typescript
client.files.backends.createPutio(data: FilesBackendsCreatePutioRequest): Promise<FilesBackendsCreatePutioResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreatePutioRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreatePutioResponse`

**CLI:** `hoody files backends putio create`

---

### `createQingstor`

**POST** `/api/v1/backends/qingstor`

Connect to qingstor backend

```typescript
client.files.backends.createQingstor(data: FilesBackendsCreateQingstorRequest): Promise<FilesBackendsCreateQingstorResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateQingstorRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateQingstorResponse`

**CLI:** `hoody files backends qingstor create`

---

### `createQuatrix`

**POST** `/api/v1/backends/quatrix`

Connect to quatrix backend

```typescript
client.files.backends.createQuatrix(data: FilesBackendsCreateQuatrixRequest): Promise<FilesBackendsCreateQuatrixResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateQuatrixRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateQuatrixResponse`

**CLI:** `hoody files backends quatrix create`

---

### `createS3`

**POST** `/api/v1/backends/s3`

Connect to s3 backend

```typescript
client.files.backends.createS3(data: FilesBackendsCreateS3Request): Promise<FilesBackendsCreateS3Response>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateS3Request` | Yes | body |  |

**Returns:** `FilesBackendsCreateS3Response`

**CLI:** `hoody files backends s3 create`

---

### `createSeafile`

**POST** `/api/v1/backends/seafile`

Connect to seafile backend

```typescript
client.files.backends.createSeafile(data: FilesBackendsCreateSeafileRequest): Promise<FilesBackendsCreateSeafileResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateSeafileRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateSeafileResponse`

**CLI:** `hoody files backends seafile create`

---

### `createSftp`

**POST** `/api/v1/backends/sftp`

Connect to sftp backend

```typescript
client.files.backends.createSftp(data: FilesBackendsCreateSftpRequest): Promise<FilesBackendsCreateSftpResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateSftpRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateSftpResponse`

**CLI:** `hoody files backends sftp create`

---

### `createSharefile`

**POST** `/api/v1/backends/sharefile`

Connect to sharefile backend

```typescript
client.files.backends.createSharefile(data: FilesBackendsCreateSharefileRequest): Promise<FilesBackendsCreateSharefileResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateSharefileRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateSharefileResponse`

**CLI:** `hoody files backends sharefile create`

---

### `createSia`

**POST** `/api/v1/backends/sia`

Connect to sia backend

```typescript
client.files.backends.createSia(data: FilesBackendsCreateSiaRequest): Promise<FilesBackendsCreateSiaResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateSiaRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateSiaResponse`

**CLI:** `hoody files backends sia create`

---

### `createSmb`

**POST** `/api/v1/backends/smb`

Connect to smb backend

```typescript
client.files.backends.createSmb(data: FilesBackendsCreateSmbRequest): Promise<FilesBackendsCreateSmbResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateSmbRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateSmbResponse`

**CLI:** `hoody files backends smb create`

---

### `createSugarsync`

**POST** `/api/v1/backends/sugarsync`

Connect to sugarsync backend

```typescript
client.files.backends.createSugarsync(data: FilesBackendsCreateSugarsyncRequest): Promise<FilesBackendsCreateSugarsyncResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateSugarsyncRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateSugarsyncResponse`

**CLI:** `hoody files backends sugarsync create`

---

### `createSwift`

**POST** `/api/v1/backends/swift`

Connect to swift backend

```typescript
client.files.backends.createSwift(data: FilesBackendsCreateSwiftRequest): Promise<FilesBackendsCreateSwiftResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateSwiftRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateSwiftResponse`

**CLI:** `hoody files backends swift create`

---

### `createUlozto`

**POST** `/api/v1/backends/ulozto`

Connect to ulozto backend

```typescript
client.files.backends.createUlozto(data: FilesBackendsCreateUloztoRequest): Promise<FilesBackendsCreateUloztoResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateUloztoRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateUloztoResponse`

**CLI:** `hoody files backends ulozto create`

---

### `createWebdav`

**POST** `/api/v1/backends/webdav`

Connect to webdav backend

```typescript
client.files.backends.createWebdav(data: FilesBackendsCreateWebdavRequest): Promise<FilesBackendsCreateWebdavResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateWebdavRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateWebdavResponse`

**CLI:** `hoody files backends webdav create`

---

### `createYandex`

**POST** `/api/v1/backends/yandex`

Connect to yandex backend

```typescript
client.files.backends.createYandex(data: FilesBackendsCreateYandexRequest): Promise<FilesBackendsCreateYandexResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateYandexRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateYandexResponse`

**CLI:** `hoody files backends yandex create`

---

### `createZoho`

**POST** `/api/v1/backends/zoho`

Connect to zoho backend

```typescript
client.files.backends.createZoho(data: FilesBackendsCreateZohoRequest): Promise<FilesBackendsCreateZohoResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FilesBackendsCreateZohoRequest` | Yes | body |  |

**Returns:** `FilesBackendsCreateZohoResponse`

**CLI:** `hoody files backends zoho create`

---

### `delete`

**DELETE** `/api/v1/backends/{id}`

Disconnect backend

```typescript
client.files.backends.delete(id: string, options?: { uploads?: "keep" | "discard"; cache?: boolean | number }): Promise<FilesBackendsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `uploads` | `"keep" \| "discard"` | No | query | What becomes of what was written on the backend's mounts and is not uploaded yet: keep uploading it (`keep`) or delete it (`discard`) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `FilesBackendsDeleteResponse`

**CLI:** `hoody files backends delete`

---

### `get`

**GET** `/api/v1/backends/{id}`

Get backend details

```typescript
client.files.backends.get(id: string): Promise<FilesBackendsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `FilesBackendsGetResponse`

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

### `test`

**GET** `/api/v1/backends/{id}/test`

Test backend connection

```typescript
client.files.backends.test(id: string): Promise<FilesBackendsTestResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `FilesBackendsTestResponse`

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

## `client.files.downloads` (5 methods)

### `cancel`

**DELETE** `/api/v1/downloads/{id}`

Cancel a running download

```typescript
client.files.downloads.cancel(id: string): Promise<FilesDownloadsCancelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The id listed by GET /api/v1/downloads |

**Returns:** `FilesDownloadsCancelResponse`

**CLI:** `hoody files downloads cancel`

---

### `create`

**GET** `/{directory}?download`

Download file from remote URL

```typescript
client.files.downloads.create(directory: string, options: { download: string; filename?: string; timeout?: integer; owner?: string }): Promise<files_DownloadResult>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `directory` | `string` | Yes | path | Destination directory |
| `download` | `string` | Yes | query | URL to download from |
| `filename` | `string` | No | query | Custom filename for downloaded file |
| `timeout` | `number` | No | query | Download timeout in seconds |
| `owner` | `string` | No | query | Create-time owner for newly-created inodes as user[:group] or uid[:gid]. Requires the deployment to have enabled chown, and must resolve to one of the owners it permits; refuses root (uid/gid 0). Absent → the server default create owner. Applies to mkdir/extract/download_from/copy_to. |

**Returns:** `files_DownloadResult`

**CLI:** `hoody files downloads create`

---

### `list`

**GET** `/api/v1/downloads`

List active downloads

```typescript
client.files.downloads.list(): Promise<FilesDownloadsListResponse>
```

**Returns:** `FilesDownloadsListResponse`

**CLI:** `hoody files downloads list`

---

### `listByDirectory`

**GET** `/{directory}?downloads`

List active downloads

```typescript
client.files.downloads.listByDirectory(directory: string, options: { downloads: ""; cache?: boolean | number }): Promise<FilesDownloadsListByDirectoryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `directory` | `string` | Yes | path |  |
| `downloads` | `""` | Yes | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `FilesDownloadsListByDirectoryResponse`

**CLI:** `hoody files downloads list`

---

### `listHistory`

**GET** `/?download_history`

Download history

```typescript
client.files.downloads.listHistory(options: { download_history: ""; cache?: boolean | number }): Promise<FilesDownloadsListHistoryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `download_history` | `""` | Yes | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `FilesDownloadsListHistoryResponse`

**CLI:** `hoody files downloads history list`

---

## `client.files.extractions` (4 methods)

### `cancel`

**DELETE** `/api/v1/extractions/{id}`

Cancel a running extraction

```typescript
client.files.extractions.cancel(id: string): Promise<FilesExtractionsCancelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | The id listed by GET /api/v1/extractions |

**Returns:** `FilesExtractionsCancelResponse`

**CLI:** `hoody files extractions cancel`

---

### `list`

**GET** `/api/v1/extractions`

List active extractions

```typescript
client.files.extractions.list(): Promise<FilesExtractionsListResponse>
```

**Returns:** `FilesExtractionsListResponse`

**CLI:** `hoody files extractions list`

---

### `listByDirectory`

**GET** `/?extractions`

List active extractions

```typescript
client.files.extractions.listByDirectory(options: { extractions: ""; cache?: boolean | number }): Promise<FilesExtractionsListByDirectoryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `extractions` | `""` | Yes | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `FilesExtractionsListByDirectoryResponse`

---

### `listHistory`

**GET** `/?extraction_history`

Extraction history

```typescript
client.files.extractions.listHistory(options: { extraction_history: ""; cache?: boolean | number }): Promise<FilesExtractionsListHistoryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `extraction_history` | `""` | Yes | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `FilesExtractionsListHistoryResponse`

**CLI:** `hoody files extractions history list`

---

## `client.files` (21 methods)

### `append`

**PUT** `/api/v1/files/append/{path}`

Append data to file

```typescript
client.files.append(path: string, data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string, options?: { owner?: string; cache?: boolean | number; contentType?: 'application/octet-stream' }): Promise<FilesAppendResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | File path |
| `data` | `Blob \| ArrayBuffer \| Uint8Array \| ReadableStream&lt;Uint8Array&gt; \| string` | Yes | body |  |
| `owner` | `string` | No | query | Create-time owner (user[:group]/uid[:gid]) when this append creates a new file. Requires the deployment to have enabled chown and to permit the owner you name; refuses root. Absent → server default. |
| `cache` | `boolean \| number` | No | query |  |
| `contentType` | `'application/octet-stream'` | No | query |  |

**Returns:** `FilesAppendResponse`

**CLI:** `hoody files append`

---

### `chmod`

**PATCH** `/api/v1/files/chmod/{path}`

Change file permissions

```typescript
client.files.chmod(path: string, options: { chmod: string; cache?: boolean | number }): Promise<FilesChmodResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | File or directory path |
| `chmod` | `string` | Yes | query | Octal permission mode (e.g., 755, 644, 0755) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `FilesChmodResponse`

**CLI:** `hoody files chmod`

---

### `chown`

**PATCH** `/api/v1/files/chown/{path}`

Change file ownership

```typescript
client.files.chown(path: string, options: { chown: string; cache?: boolean | number }): Promise<FilesChownResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | File or directory path |
| `chown` | `string` | Yes | query | Owner and optional group (e.g., user:group, user, :group, or UID:GID) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `FilesChownResponse`

**CLI:** `hoody files chown`

---

### `copy`

**POST** `/api/v1/files/copy/{path}`

Copy file or directory

```typescript
client.files.copy(path: string, options: { copy_to: string; overwrite?: "true" | "false"; owner?: string; cache?: boolean | number }): Promise<FilesCopyResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Source file or directory path |
| `copy_to` | `string` | Yes | query | Destination path to copy the file/directory to |
| `overwrite` | `"true" \| "false"` | No | query | Allow overwriting existing destination (default: false) |
| `owner` | `string` | No | query | Create-time owner (user[:group]/uid[:gid]) for newly-created copies. Requires the deployment to have enabled chown and to permit the owner you name; refuses root. Overwritten existing files preserve their owner. Absent → server default. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `FilesCopyResponse`

**CLI:** `hoody files copy`

---

### `delete`

**DELETE** `/api/v1/files/{path}`

Delete file or directory

```typescript
client.files.delete(path: string, options?: { backend?: string; cache?: boolean | number }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `backend` | `string` | No | query | Backend ID for remote file deletion |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody files delete`

---

### `exists`

**HEAD** `/{path}`

Get file metadata

```typescript
client.files.exists(options: { path: string; history?: string; at?: string; revision?: number; diff?: string; from_seq?: number; from_ts?: string; to_seq?: number; to_ts?: string; after_id?: number; limit?: number }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `history` | `string` | No | query | List all revisions of a file. Returns JSON with revisions array, pagination via after_id. Mutually exclusive with at/revision/diff. |
| `at` | `string` | No | query | Read file content at a point in time. Accepts RFC3339 timestamp or Unix milliseconds. Mutually exclusive with history/revision/diff. Composable with ?lines, ?hash, ?base64. |
| `revision` | `number` | No | query | Read file content by stable per-path sequence number. Mutually exclusive with history/at/diff. Composable with ?lines, ?hash, ?base64. |
| `diff` | `string` | No | query | Compute unified diff between two versions. Requires from_seq or from_ts. Optional to_seq or to_ts (defaults to current file). Mutually exclusive with history/at/revision. |
| `from_seq` | `number` | No | query | Source revision seq number for ?diff. Mutually exclusive with from_ts. |
| `from_ts` | `string` | No | query | Source timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with from_seq. |
| `to_seq` | `number` | No | query | Target revision seq number for ?diff. Mutually exclusive with to_ts. Default: current file on disk. |
| `to_ts` | `string` | No | query | Target timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with to_seq. |
| `after_id` | `number` | No | query | Cursor for ?history pagination. Returns entries with id &gt; after_id. |
| `limit` | `number` | No | query | Max entries to return for ?history. |

**Returns:** `any`

**CLI:** `hoody files exists`

---

### `get`

**GET** `/api/v1/files/{path}`

List directory or download file

```typescript
client.files.get(path: string, options?: { backend?: string; hash?: ""; sha256?: ""; base64?: ""; preview?: ""; contents?: ""; stat?: ""; thumbnail?: string; format?: "jpeg" | "png" | "webp" | "gif" | "bmp"; size?: string; width?: number; height?: number; resize?: "fit" | "fill" | "cover" | "exact"; quality?: "low" | "medium" | "high"; blur?: number; grayscale?: ""; bg?: string; q?: string; grep?: string; ignore_case?: boolean; fixed_string?: boolean; glob?: string; context?: number; max_count?: number; max_matches?: number; max_depth?: number; max_filesize?: number; timeout?: number; no_ignore?: boolean; hidden?: boolean; max_results?: number; max_files_scanned?: number; sort?: "mtime" | "name" | "size"; order?: "asc" | "desc"; lines?: string; history?: ""; at?: string; revision?: number; diff?: ""; from_seq?: number; from_ts?: string; to_seq?: number; to_ts?: string; after_id?: number; limit?: number; zip?: ""; Range?: string; IfRange?: string; cache?: boolean | number }): Promise<ApiResponse<ArrayBuffer> | FilesGetResponse>
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
| `thumbnail` | `string` | No | query | Return a processed image (resize, format convert, blur, grayscale), shaped by format, size, width, height, resize, quality, blur, grayscale and bg: the same image as the WebDAV-style /{image}?thumbnail. Only where the deployment enabled thumbnail processing; returns 403 when disabled. |
| `format` | `"jpeg" \| "png" \| "webp" \| "gif" \| "bmp"` | No | query | With thumbnail: output image format |
| `size` | `string` | No | query | With thumbnail: Target box in pixels: WIDTHxHEIGHT, or a single N for an N×N box |
| `width` | `number` | No | query | With thumbnail: target width in pixels |
| `height` | `number` | No | query | With thumbnail: target height in pixels |
| `resize` | `"fit" \| "fill" \| "cover" \| "exact"` | No | query | With thumbnail: How the image meets a target box given by size, or by width and height together: fit (default) keeps the aspect ratio and fits inside the box; fill keeps the aspect ratio, covers the box and centre-crops to exactly WIDTH×HEIGHT; cover keeps the aspect ratio and covers the box, so one side may be larger than the box; exact forces WIDTH×HEIGHT and may distort. With only width or only height, the other side follows the aspect ratio. |
| `quality` | `"low" \| "medium" \| "high"` | No | query | With thumbnail: Resampling filter for resizing: low (box), medium (bilinear, the default) or high (Lanczos3). It does not set compression; q sets JPEG quality. |
| `blur` | `number` | No | query | With thumbnail: Gaussian blur radius |
| `grayscale` | `""` | No | query | With thumbnail: convert to grayscale |
| `bg` | `string` | No | query | With thumbnail: background color for transparent areas |
| `q` | `string` | No | query | Two roles. On a directory (without thumbnail): search the names and paths below it for this text, case-insensitive; at most 512 bytes of UTF-8, measured before and after lowercasing (longer is refused with 400, not truncated); only where the deployment enabled search (403 otherwise). With thumbnail: JPEG quality, 1-100 (default 85); only JPEG output uses it. |
| `grep` | `string` | No | query | Search file/directory contents for regex pattern (or literal if fixed_string=true). Only where the deployment enabled content search. |
| `ignore_case` | `boolean` | No | query | Case-insensitive grep matching |
| `fixed_string` | `boolean` | No | query | Treat grep pattern as literal string, not regex |
| `glob` | `string` | No | query | Without grep, finds files and folders matching this glob (e.g. '**/*.rs', 'src/**/*.{ts,tsx}'); directory paths only, where the deployment enabled search. With grep, the content-search file filter. Only search files matching this glob (ripgrep -g syntax, one pattern per request, at most 1024 bytes). A pattern without '/' matches file names at any depth ('*.rs', '*.{ts,tsx}'). A pattern with a '/' other than a trailing one matches the path relative to the searched folder, and a leading '/' anchors it there ('src/**/*.go'). '*' stays within one folder and '**' crosses folders. A leading '!' excludes instead ('!*_test.go'; '!vendor/' skips every folder named vendor); write '\!' for a literal '!' and '\#' for a leading '#'. Matching is case-sensitive whatever ignore_case says. A positive pattern ending in '/' names folders only and so selects no files; use 'src/**' for everything under a folder. A pattern that is only whitespace or a comment (an unescaped leading '#') is refused. The filter only narrows the search: it never brings back a file that ignore files or the default exclusion of names starting with '.' leave out; no_ignore and hidden do that. Not applied when the path is a single file. Repeating glob in a content search is refused. |
| `context` | `number` | No | query | Number of context lines before/after each grep match |
| `max_count` | `number` | No | query | Max matches per file for grep |
| `max_matches` | `number` | No | query | Total max matches across all files for grep |
| `max_depth` | `number` | No | query | Directory recursion depth for grep |
| `max_filesize` | `number` | No | query | Skip files larger than this (bytes) during grep |
| `timeout` | `number` | No | query | Grep timeout in seconds |
| `no_ignore` | `boolean` | No | query | Also search files excluded by .gitignore (inside a git repository), .ignore, .git/info/exclude and the global git excludes |
| `hidden` | `boolean` | No | query | Also search names starting with '.', which are otherwise skipped unless an ignore file whitelists them. '.git' folders found inside the searched folder are still skipped, and the server's configured hidden paths still apply. Refused with 403 for an account that may only list this path. |
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
| `zip` | `""` | No | query | Download a directory as a streaming zip archive (bare flag, e.g. ?zip). Local directories only (a folder of a remote backend, named with backend, answers 501), and only where the deployment enabled archive downloads (403 otherwise). Same behavior as the WebDAV-style /{directory}?zip. |
| `Range` | `string` | No | header | File download only: ask for part of the file, as 'bytes=first-last', 'bytes=first-' or 'bytes=-suffix_length'. A last position past the end is clamped to the last byte, and a suffix longer than the file selects all of it. One satisfiable range answers 206 with Content-Range; several answer 206 as multipart/byteranges for a local file, while a remote file (with backend) answers 200 with the whole file. Ranges that cannot be satisfied are dropped from a list, and 416 comes only when none is left. A malformed header, another unit or more than 100 ranges is ignored (200, whole file). HEAD ignores Range. |
| `IfRange` | `string` | No | header | File download only: honour Range only if the file still has this ETag, exactly; otherwise answer 200 with the whole file. A date never matches, since two versions saved within the same second share it. A remote file's (with backend) ETag is weak, so with If-Range a remote file is always sent whole. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<ArrayBuffer> | FilesGetResponse`

**CLI:** `hoody files get`

---

### `glob`

**GET** `/api/v1/files/glob/{path}`

Find files by glob pattern

```typescript
client.files.glob(path: string, options: { pattern: string; max_results?: number; max_depth?: number; max_files_scanned?: number; timeout?: number; no_ignore?: boolean; hidden?: boolean; sort?: "mtime" | "name" | "size"; order?: "asc" | "desc"; cache?: boolean | number }): Promise<FilesGlobResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Directory path to search within |
| `pattern` | `string` | Yes | query | Glob pattern (e.g. '**/*.rs', 'src/**/*.{ts,tsx}', '*.md') |
| `max_results` | `number` | No | query | Maximum entries to return |
| `max_depth` | `number` | No | query | Maximum directory recursion depth |
| `max_files_scanned` | `number` | No | query | Maximum filesystem entries to scan |
| `timeout` | `number` | No | query | Search timeout in seconds |
| `no_ignore` | `boolean` | No | query | Also search files excluded by .gitignore (inside a git repository), .ignore, .git/info/exclude and the global git excludes |
| `hidden` | `boolean` | No | query | Also search names starting with '.', which are otherwise skipped unless an ignore file whitelists them. '.git' folders found inside the searched folder are still skipped, and the server's configured hidden paths still apply. Refused with 403 for an account that may only list this path. |
| `sort` | `"mtime" \| "name" \| "size"` | No | query | Sort results by: mtime (modification time), name, or size |
| `order` | `"asc" \| "desc"` | No | query | Sort order. Default: desc for mtime, asc for name/size |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `FilesGlobResponse`

**CLI:** `hoody files glob`

---

### `grep`

**GET** `/api/v1/files/grep/{path}`

Search file contents (grep)

```typescript
client.files.grep(path: string, options: { pattern: string; ignore_case?: boolean; fixed_string?: boolean; glob?: string; context?: number; max_count?: number; max_matches?: number; max_depth?: number; max_filesize?: number; timeout?: number; no_ignore?: boolean; hidden?: boolean; cache?: boolean | number }): Promise<FilesGrepResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | File or directory path to search |
| `pattern` | `string` | Yes | query | Search pattern (regex by default, literal if fixed_string=true) |
| `ignore_case` | `boolean` | No | query | Case-insensitive matching |
| `fixed_string` | `boolean` | No | query | Treat pattern as literal string, not regex |
| `glob` | `string` | No | query | Only search files matching this glob (ripgrep -g syntax, one pattern per request, at most 1024 bytes). A pattern without '/' matches file names at any depth ('*.rs', '*.{ts,tsx}'). A pattern with a '/' other than a trailing one matches the path relative to the searched folder, and a leading '/' anchors it there ('src/**/*.go'). '*' stays within one folder and '**' crosses folders. A leading '!' excludes instead ('!*_test.go'; '!vendor/' skips every folder named vendor); write '\!' for a literal '!' and '\#' for a leading '#'. Matching is case-sensitive whatever ignore_case says. A positive pattern ending in '/' names folders only and so selects no files; use 'src/**' for everything under a folder. A pattern that is only whitespace or a comment (an unescaped leading '#') is refused. The filter only narrows the search: it never brings back a file that ignore files or the default exclusion of names starting with '.' leave out; no_ignore and hidden do that. Not applied when the path is a single file. Repeating glob in a content search is refused. |
| `context` | `number` | No | query | Number of context lines before and after each match |
| `max_count` | `number` | No | query | Maximum matches per file |
| `max_matches` | `number` | No | query | Total maximum matches across all files |
| `max_depth` | `number` | No | query | Maximum directory recursion depth |
| `max_filesize` | `number` | No | query | Skip files larger than this (bytes) |
| `timeout` | `number` | No | query | Search timeout in seconds |
| `no_ignore` | `boolean` | No | query | Also search files excluded by .gitignore (inside a git repository), .ignore, .git/info/exclude and the global git excludes |
| `hidden` | `boolean` | No | query | Also search names starting with '.', which are otherwise skipped unless an ignore file whitelists them. '.git' folders found inside the searched folder are still skipped, and the server's configured hidden paths still apply. Refused with 403 for an account that may only list this path. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `FilesGrepResponse`

**CLI:** `hoody files grep`

---

### `logout`

**LOGOUT** `/{path}`

Clear authentication

```typescript
client.files.logout(path: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |

**Returns:** `ApiResponse<unknown>`

---

### `mkdir`

**POST** `/api/v1/files/{path}`

File operations (mkdir, extract, download, move, copy)

```typescript
client.files.mkdir(path: string, options?: { backend?: string; owner?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `backend` | `string` | No | query | Backend ID, for mkdir only: create the directory on that remote backend. Any other operation with backend is refused with 400 INVALID_PARAMETER. |
| `owner` | `string` | No | query | Create-time owner for newly-created inodes as user[:group] or uid[:gid]. Requires the deployment to have enabled chown, and must resolve to one of the owners it permits; refuses root (uid/gid 0). Absent → the server default create owner. Applies to mkdir/extract/download_from/copy_to. |

**Returns:** `any`

**CLI:** `hoody files mkdir`

---

### `move`

**POST** `/api/v1/files/move/{path}`

Move file or directory

```typescript
client.files.move(path: string, options: { move_to: string; owner?: string; cache?: boolean | number }): Promise<FilesMoveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Source file or directory path |
| `move_to` | `string` | Yes | query | Destination path to move the file/directory to |
| `owner` | `string` | No | query | Create-time owner (user[:group]/uid[:gid]) for newly-created destination PARENT directories. Requires the deployment to have enabled chown and to permit the owner you name; refuses root. The moved inode itself preserves its existing owner. Absent → server default. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `FilesMoveResponse`

**CLI:** `hoody files move`

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
client.files.search(directory: string, options: { q: string; json?: ""; theme?: "oc-1" | "aura" | "ayu" | "carbonfox" | "catppuccin" | "dracula" | "gruvbox" | "monokai" | "nightowl" | "nord" | "onedarkpro" | "shadesofpurple" | "solarized" | "tokyonight" | "vesper"; colorScheme?: "light" | "dark"; font?: "ibm-plex-mono" | "cascadia-code" | "fira-code" | "hack" | "inconsolata" | "intel-one-mono" | "iosevka" | "jetbrains-mono" | "meslo-lgs" | "roboto-mono" | "source-code-pro" | "ubuntu-mono"; fontSize?: number; embedderOrigin?: string; chromeless?: boolean; borderless?: boolean; hideHeader?: boolean; hideSidebar?: boolean; hidePreview?: boolean; hideFooter?: boolean; embedBg?: "transparent"; cache?: boolean | number }): Promise<FilesSearchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `directory` | `string` | Yes | path |  |
| `q` | `string` | Yes | query | Search query (case-insensitive filename match). Maximum 512 BYTES of UTF-8 after form/percent decoding, measured both before and after Unicode lowercasing — lowercasing can change a string's byte length in either direction. Longer queries are rejected with 400; they are not truncated. Note this is a byte limit, not a character limit, so it is deliberately not expressed as `maxLength`. |
| `json` | `""` | No | query | Return JSON format instead of HTML |
| `theme` | `"oc-1" \| "aura" \| "ayu" \| "carbonfox" \| "catppuccin" \| "dracula" \| "gruvbox" \| "monokai" \| "nightowl" \| "nord" \| "onedarkpro" \| "shadesofpurple" \| "solarized" \| "tokyonight" \| "vesper"` | No | query | HTML page only: colour theme of the page. Default oc-1. |
| `colorScheme` | `"light" \| "dark"` | No | query | HTML page only: light or dark colour scheme. Without it the page follows the system setting. |
| `font` | `"ibm-plex-mono" \| "cascadia-code" \| "fira-code" \| "hack" \| "inconsolata" \| "intel-one-mono" \| "iosevka" \| "jetbrains-mono" \| "meslo-lgs" \| "roboto-mono" \| "source-code-pro" \| "ubuntu-mono"` | No | query | HTML page only: monospace font of the editor and listing. |
| `fontSize` | `number` | No | query | HTML page only: editor font size in pixels. Default 14. |
| `embedderOrigin` | `string` | No | query | HTML page only: origin of the page that embeds this one, such as https://app.example.com. The page then accepts theme and layout messages from that origin and tells it when it is ready. Only https origins, and http on localhost or 127.0.0.1, are accepted. |
| `chromeless` | `boolean` | No | query | HTML page only: hide the header, sidebar, preview, footer and borders at once. Each can be turned back on with its own parameter set to false. |
| `borderless` | `boolean` | No | query | HTML page only: hide the page borders. |
| `hideHeader` | `boolean` | No | query | HTML page only: hide the header bar. |
| `hideSidebar` | `boolean` | No | query | HTML page only: hide the sidebar. |
| `hidePreview` | `boolean` | No | query | HTML page only: hide the preview pane. |
| `hideFooter` | `boolean` | No | query | HTML page only: hide the footer. |
| `embedBg` | `"transparent"` | No | query | HTML page only: transparent lets the background of the embedding page show through. |
| `cache` | `boolean \| number` | No | query |  |

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
client.files.touch(path: string, options: { touch: ""; cache?: boolean | number }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | File path to touch |
| `touch` | `""` | Yes | query | Flag to indicate touch operation |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody files touch`

---

### `update`

**PATCH** `/api/v1/files/{path}`

Modify file properties or move/rename

```typescript
client.files.update(path: string, data?: FilesUpdateRequest, options?: { owner?: string; chmod?: string; chown?: string; cache?: boolean | number }): Promise<FilesUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | File path |
| `data` | `FilesUpdateRequest` | No | body |  |
| `owner` | `string` | No | query | Create-time owner (user[:group]/uid[:gid]) for newly-created destination parent directories on a JSON-body move_to. Requires the deployment to have enabled chown and to permit the owner you name; cannot be root. The moved item keeps its own owner. Absent → server default. |
| `chmod` | `string` | No | query | Set file permissions using octal mode value (e.g., ?chmod=755) |
| `chown` | `string` | No | query | Set file ownership (e.g., ?chown=user:group or ?chown=user) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `FilesUpdateResponse`

**CLI:** `hoody files update`

---

### `upload`

**PUT** `/api/v1/files/{path}`

Upload or append file

```typescript
client.files.upload(path: string, data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string, options?: { backend?: string; append?: ""; chmod?: string; owner?: string; cache?: boolean | number; contentType?: 'application/octet-stream' }): Promise<FilesUploadResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `data` | `Blob \| ArrayBuffer \| Uint8Array \| ReadableStream&lt;Uint8Array&gt; \| string` | Yes | body |  |
| `backend` | `string` | No | query | Backend ID for remote upload |
| `append` | `""` | No | query | Append body to end of existing file (create if missing) instead of overwriting |
| `chmod` | `string` | No | query | Permission bits the local file ends with, in octal (`644`, `0600`, `0o755`, `000`), whatever the server's umask; the response echoes them in `mode`. Requires both upload and chmod to be enabled (403 otherwise). setuid, setgid and sticky bits are refused, as are values above 777. Refused with 400 together with `backend` or `append`, and when the path names something other than a regular file (a directory, a pipe, a device, a socket). Every refusal comes before the body is read: nothing is created or changed. |
| `owner` | `string` | No | query | Create-time owner (user[:group]/uid[:gid]) for a newly-created file. Requires the deployment to have enabled chown and to permit the owner you name; refuses root. Overwrites/appends to an existing file preserve its owner. Absent → server default. |
| `cache` | `boolean \| number` | No | query |  |
| `contentType` | `'application/octet-stream'` | No | query |  |

**Returns:** `FilesUploadResponse`

**CLI:** `hoody files upload`

---

### `whoami`

**CHECKAUTH** `/{path}`

Check authentication status

```typescript
client.files.whoami(path: string): Promise<ApiResponse<string>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |

**Returns:** `ApiResponse<string>`

**CLI:** `hoody files whoami`

---

### `writeChunk`

**PATCH** `/{path}`

File operations

```typescript
client.files.writeChunk(path: string, data?: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>): Promise<void>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `data` | `Blob \| ArrayBuffer \| Uint8Array \| ReadableStream&lt;Uint8Array&gt;` | No | body |  |

**Returns:** `void`

**CLI:** `hoody files chunks write`

---

### `zip`

**GET** `/{directory}?zip`

Download directory as ZIP

```typescript
client.files.zip(directory: string, options: { zip: ""; cache?: boolean | number }): Promise<ApiResponse<ArrayBuffer>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `directory` | `string` | Yes | path |  |
| `zip` | `""` | Yes | query |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<ArrayBuffer>`

**CLI:** `hoody files zip`

---

## `client.files.ftp` (1 method)

### `get`

**GET** `/{path}?type=ftp`

Access file via FTP

```typescript
client.files.ftp.get(path: string, options: { type: "ftp"; server: string; user?: string; pass?: string; ftp_secure?: boolean; ftp_passive?: boolean; cache?: boolean | number }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `type` | `"ftp"` | Yes | query |  |
| `server` | `string` | Yes | query |  |
| `user` | `string` | No | query |  |
| `pass` | `string` | No | query |  |
| `ftp_secure` | `boolean` | No | query | Use explicit FTPS (AUTH TLS on the control connection) |
| `ftp_passive` | `boolean` | No | query | Passive mode, the only mode supported: `false` is refused with 400 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody files ftp get`

---

## `client.files.images` (1 method)

### `convert`

**GET** `/{image}?thumbnail`

Process and convert images

```typescript
client.files.images.convert(image: string, options: { thumbnail: ""; format?: "jpeg" | "png" | "webp" | "gif" | "bmp"; size?: string; width?: number; height?: number; resize?: "fit" | "fill" | "cover" | "exact"; quality?: "low" | "medium" | "high"; q?: number; blur?: number; grayscale?: ""; bg?: string; cache?: boolean | number }): Promise<ApiResponse<ArrayBuffer>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `image` | `string` | Yes | path | Path to image file |
| `thumbnail` | `""` | Yes | query | Enable image processing |
| `format` | `"jpeg" \| "png" \| "webp" \| "gif" \| "bmp"` | No | query | Output format (default: jpeg) |
| `size` | `string` | No | query | Target box in pixels: WIDTHxHEIGHT, or a single N for an N×N box (max: 2000×2000) |
| `width` | `number` | No | query | Width in pixels (height auto-calculated) |
| `height` | `number` | No | query | Height in pixels (width auto-calculated) |
| `resize` | `"fit" \| "fill" \| "cover" \| "exact"` | No | query | How the image meets a target box given by size, or by width and height together: fit (default) keeps the aspect ratio and fits inside the box; fill keeps the aspect ratio, covers the box and centre-crops to exactly WIDTH×HEIGHT; cover keeps the aspect ratio and covers the box, so one side may be larger than the box; exact forces WIDTH×HEIGHT and may distort. With only width or only height, the other side follows the aspect ratio. |
| `quality` | `"low" \| "medium" \| "high"` | No | query | Resampling filter for resizing: low (box), medium (bilinear, the default) or high (Lanczos3). It does not set compression; q sets JPEG quality. |
| `q` | `number` | No | query | JPEG quality, 1-100 (higher is better). Only JPEG output uses it: PNG, WebP (lossless), GIF and BMP ignore it. |
| `blur` | `number` | No | query | Gaussian blur radius (0-50) |
| `grayscale` | `""` | No | query | Convert to grayscale/black-and-white |
| `bg` | `string` | No | query | Background color for transparency (hex RGB, e.g., 'ffffff' for white) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<ArrayBuffer>`

**CLI:** `hoody files images convert`

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

### `list`

**GET** `/api/v1/journal`

Query journal entries

```typescript
client.files.journal.list(options?: { path?: string; op?: string; since?: string; limit?: number; after_id?: number; cache?: boolean | number }): Promise<FilesJournalListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | No | query | Filter entries by path prefix |
| `op` | `string` | No | query | Filter by operation type(s), comma-separated (e.g. 'write,delete') |
| `since` | `string` | No | query | Filter entries since timestamp (RFC3339 or Unix ms) |
| `limit` | `number` | No | query | Max entries to return |
| `after_id` | `number` | No | query | Cursor: return entries with id &gt; after_id |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `FilesJournalListResponse`

**CLI:** `hoody files journal list`

---

## `client.files.kit` (2 methods)

### `getHealth`

**GET** `/api/v1/files/health`

Service health check

```typescript
client.files.kit.getHealth(): Promise<FilesHealthCheckResponse>
```

**Returns:** `FilesHealthCheckResponse`

**CLI:** `hoody files health`

---

### `getVersion`

**GET** `/api/v1/version`

Get API version

```typescript
client.files.kit.getVersion(): Promise<FilesKitGetVersionResponse>
```

**Returns:** `FilesKitGetVersionResponse`

**CLI:** `hoody files version`

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

### `delete`

**DELETE** `/api/v1/mounts/{id}`

Unmount filesystem

```typescript
client.files.mounts.delete(id: string, options?: { uploads?: "keep" | "wait" | "discard"; wait_seconds?: number; cache?: boolean | number }): Promise<FilesMountsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |
| `uploads` | `"keep" \| "wait" \| "discard"` | No | query | What becomes of what was written on the mount and is not uploaded yet: keep uploading it (`keep`), the same and wait for it (`wait`), or delete it (`discard`) |
| `wait_seconds` | `number` | No | query | With `uploads=wait` only: the longest the answer waits, in seconds |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `FilesMountsDeleteResponse`

**CLI:** `hoody files mounts delete`

---

### `get`

**GET** `/api/v1/mounts/{id}`

Get mount details

```typescript
client.files.mounts.get(id: string): Promise<FilesMountsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path |  |

**Returns:** `FilesMountsGetResponse`

**CLI:** `hoody files mounts get`

---

### `list`

**GET** `/api/v1/mounts`

List all mounts

```typescript
client.files.mounts.list(options?: { label?: string; cache?: boolean | number }): Promise<FilesMountsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `label` | `string` | No | query | Filter mounts by label. Only mounts with this exact label will be returned. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `FilesMountsListResponse`

**CLI:** `hoody files mounts list`

---

### `update`

**PATCH** `/api/v1/mounts/{id}`

Update mount VFS configuration

```typescript
client.files.mounts.update(id: string, data: FilesMountsUpdateRequest, options?: { switch?: "wait" | "immediate"; cache?: boolean | number }): Promise<FilesMountsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Mount ID |
| `data` | `FilesMountsUpdateRequest` | Yes | body |  |
| `switch` | `"wait" \| "immediate"` | No | query | wait (the default): files closed before the update finish uploading before the switch. immediate: switch at once; those files upload later with the previous settings, and such an upload can replace a newer write made through the new settings. If those files cannot all be checked within 10 seconds, the update answers 409 MOUNT_BUSY and changes nothing. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `FilesMountsUpdateResponse`

**CLI:** `hoody files mounts update`

---

## `client.files.s3` (1 method)

### `get`

**GET** `/{path}?type=s3`

Access file from S3

```typescript
client.files.s3.get(path: string, options: { type: "s3"; server: string; s3_bucket: string; s3_region: string; user?: string; pass?: string; s3_endpoint?: string; cache?: boolean | number }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `type` | `"s3"` | Yes | query |  |
| `server` | `string` | Yes | query | S3 service host. An AWS host (`*.amazonaws.com`) is reached by `s3_region`; any other host is the endpoint of an S3-compatible service (MinIO, DigitalOcean Spaces, ...), unless `s3_endpoint` names one. |
| `s3_bucket` | `string` | Yes | query | S3 bucket name. The path is the object key (or key prefix) within this bucket. |
| `s3_region` | `string` | Yes | query |  |
| `user` | `string` | No | query | Access key ID. Give both `user` and `pass`, or neither for anonymous access to a public bucket. |
| `pass` | `string` | No | query | Secret access key (base64 encoded). Give both `user` and `pass`, or neither. |
| `s3_endpoint` | `string` | No | query | Endpoint of an S3-compatible service (MinIO, etc.), as a host or URL. Takes precedence over `server`. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody files s3 get`

---

## `client.files.ssh` (2 methods)

### `get`

**GET** `/{path}?type=ssh`

Access file via SSH/SFTP

```typescript
client.files.ssh.get(path: string, options: { type: "ssh"; server: string; user: string; pass?: string; key?: string; passphrase?: string; cache?: boolean | number }): Promise<ApiResponse<ArrayBuffer>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `type` | `"ssh"` | Yes | query |  |
| `server` | `string` | Yes | query | Server hostname:port |
| `user` | `string` | Yes | query | SSH username |
| `pass` | `string` | No | query | Password (base64 encoded) |
| `key` | `string` | No | query | Private key in PEM form (base64 encoded) |
| `passphrase` | `string` | No | query | Key passphrase (base64 encoded) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<ArrayBuffer>`

**CLI:** `hoody files ssh get`

---

### `upload`

**PUT** `/{path}?type=ssh`

Upload file via SSH/SFTP

```typescript
client.files.ssh.upload(path: string, data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string, options: { server: string; user: string; pass?: string; key?: string; passphrase?: string; cache?: boolean | number; contentType?: 'application/octet-stream' }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `data` | `Blob \| ArrayBuffer \| Uint8Array \| ReadableStream&lt;Uint8Array&gt; \| string` | Yes | body |  |
| `server` | `string` | Yes | query | Server hostname:port |
| `user` | `string` | Yes | query | SSH username |
| `pass` | `string` | No | query | Password (base64 encoded) |
| `key` | `string` | No | query | Private key in PEM form (base64 encoded) |
| `passphrase` | `string` | No | query | Key passphrase (base64 encoded) |
| `cache` | `boolean \| number` | No | query |  |
| `contentType` | `'application/octet-stream'` | No | query |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody files ssh upload`

---

## `client.files.ui` (1 method)

### `getPage`

**GET** `/{path}`

List directory contents or download file

```typescript
client.files.ui.getPage(path: string, options?: { json?: ""; simple?: ""; sort?: "name" | "mtime" | "size"; order?: "asc" | "desc"; hash?: ""; sha256?: ""; base64?: ""; edit?: ""; view?: ""; download?: "" | "1" | "true"; contentType?: string; history?: ""; at?: string; revision?: number; diff?: ""; from_seq?: number; from_ts?: string; to_seq?: number; to_ts?: string; after_id?: number; limit?: number; theme?: "oc-1" | "aura" | "ayu" | "carbonfox" | "catppuccin" | "dracula" | "gruvbox" | "monokai" | "nightowl" | "nord" | "onedarkpro" | "shadesofpurple" | "solarized" | "tokyonight" | "vesper"; colorScheme?: "light" | "dark"; font?: "ibm-plex-mono" | "cascadia-code" | "fira-code" | "hack" | "inconsolata" | "intel-one-mono" | "iosevka" | "jetbrains-mono" | "meslo-lgs" | "roboto-mono" | "source-code-pro" | "ubuntu-mono"; fontSize?: number; embedderOrigin?: string; chromeless?: boolean; borderless?: boolean; hideHeader?: boolean; hideSidebar?: boolean; hidePreview?: boolean; hideFooter?: boolean; embedBg?: "transparent"; cache?: boolean | number }): Promise<ApiResponse<ArrayBuffer> | FilesUiGetPageResponse>
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
| `view` | `""` | No | query | Open file in a read-only Web UI page: the text is shown with no Save, rename, move or delete. |
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
| `theme` | `"oc-1" \| "aura" \| "ayu" \| "carbonfox" \| "catppuccin" \| "dracula" \| "gruvbox" \| "monokai" \| "nightowl" \| "nord" \| "onedarkpro" \| "shadesofpurple" \| "solarized" \| "tokyonight" \| "vesper"` | No | query | HTML page only: colour theme of the page. Default oc-1. |
| `colorScheme` | `"light" \| "dark"` | No | query | HTML page only: light or dark colour scheme. Without it the page follows the system setting. |
| `font` | `"ibm-plex-mono" \| "cascadia-code" \| "fira-code" \| "hack" \| "inconsolata" \| "intel-one-mono" \| "iosevka" \| "jetbrains-mono" \| "meslo-lgs" \| "roboto-mono" \| "source-code-pro" \| "ubuntu-mono"` | No | query | HTML page only: monospace font of the editor and listing. |
| `fontSize` | `number` | No | query | HTML page only: editor font size in pixels. Default 14. |
| `embedderOrigin` | `string` | No | query | HTML page only: origin of the page that embeds this one, such as https://app.example.com. The page then accepts theme and layout messages from that origin and tells it when it is ready. Only https origins, and http on localhost or 127.0.0.1, are accepted. |
| `chromeless` | `boolean` | No | query | HTML page only: hide the header, sidebar, preview, footer and borders at once. Each can be turned back on with its own parameter set to false. |
| `borderless` | `boolean` | No | query | HTML page only: hide the page borders. |
| `hideHeader` | `boolean` | No | query | HTML page only: hide the header bar. |
| `hideSidebar` | `boolean` | No | query | HTML page only: hide the sidebar. |
| `hidePreview` | `boolean` | No | query | HTML page only: hide the preview pane. |
| `hideFooter` | `boolean` | No | query | HTML page only: hide the footer. |
| `embedBg` | `"transparent"` | No | query | HTML page only: transparent lets the background of the embedding page show through. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<ArrayBuffer> | FilesUiGetPageResponse`

---

## `client.files.uploads` (8 methods)

### `delete`

**DELETE** `/api/v1/pending-uploads/{id}`

Discard a pending upload

```typescript
client.files.uploads.delete(id: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Pending upload ID |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody files uploads delete`

---

### `deleteUnreadable`

**DELETE** `/api/v1/pending-uploads/unreadable/{id}`

Delete an unreadable pending upload

```typescript
client.files.uploads.deleteUnreadable(id: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Pending upload ID |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody files uploads unreadable delete`

---

### `deliver`

**POST** `/api/v1/pending-uploads/{id}/deliver`

Deliver a pending upload

```typescript
client.files.uploads.deliver(id: string, data?: FilesUploadsDeliverRequest): Promise<FilesUploadsDeliverResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Pending upload ID |
| `data` | `FilesUploadsDeliverRequest` | No | body |  |

**Returns:** `FilesUploadsDeliverResponse`

**CLI:** `hoody files uploads deliver`

---

### `download`

**GET** `/api/v1/pending-uploads/{id}/file`

Download a held file

```typescript
client.files.uploads.download(id: string, options?: { path?: string; path_b64?: string; Range?: string; IfRange?: string; cache?: boolean | number }): Promise<ApiResponse<ArrayBuffer>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Pending upload ID |
| `path` | `string` | No | query | A path from the item's files, exactly as listed. Give this or path_b64, not both. |
| `path_b64` | `string` | No | query | A path_b64 from the item's files, exactly as listed. Give this or path, not both. |
| `Range` | `string` | No | header | Ask for part of the held file, as 'bytes=first-last', 'bytes=first-' or 'bytes=-suffix_length', as for a file download. One satisfiable range answers 206 with Content-Range; several answer 206 as multipart/byteranges. Ranges that cannot be satisfied are dropped from a list, and 416 comes only when none is left. A malformed header is ignored (200, whole file). |
| `IfRange` | `string` | No | header | Honour Range only if the held file still has this ETag, exactly; otherwise answer 200 with the whole file. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<ArrayBuffer>`

**CLI:** `hoody files uploads download`

---

### `list`

**GET** `/api/v1/pending-uploads`

List pending uploads

```typescript
client.files.uploads.list(options?: { backend_id?: string; cache?: boolean | number }): Promise<FilesUploadsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `backend_id` | `string` | No | query | Only items of this backend |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `FilesUploadsListResponse`

**CLI:** `hoody files uploads list`

---

### `listFiles`

**GET** `/api/v1/pending-uploads/{id}/files`

List a pending upload's files

```typescript
client.files.uploads.listFiles(id: string, options?: { cursor?: string; limit?: number; cache?: boolean | number }): Promise<FilesUploadsListFilesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Pending upload ID |
| `cursor` | `string` | No | query | next_cursor from the previous page. Omit it for the first page. |
| `limit` | `number` | No | query | Largest number of files on the page |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `FilesUploadsListFilesResponse`

**CLI:** `hoody files uploads files list`

---

### `listUnreadable`

**GET** `/api/v1/pending-uploads/unreadable`

List unreadable pending uploads

```typescript
client.files.uploads.listUnreadable(): Promise<FilesUploadsListUnreadableResponse>
```

**Returns:** `FilesUploadsListUnreadableResponse`

**CLI:** `hoody files uploads unreadable list`

---

### `stop`

**POST** `/api/v1/pending-uploads/{id}/stop`

Stop a running upload

```typescript
client.files.uploads.stop(id: string): Promise<FilesUploadsStopResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Pending upload ID |

**Returns:** `FilesUploadsStopResponse`

**CLI:** `hoody files uploads stop`

---

## `client.files.webdav` (8 methods)

### `copy`

**COPY** `/{path}`

Copy a file

```typescript
client.files.webdav.copy(path: string, options: { Destination: string; Overwrite?: "T" | "F"; cache?: boolean | number }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Source file path |
| `Destination` | `string` | Yes | header | Destination URL for the copy |
| `Overwrite` | `"T" \| "F"` | No | header | T (default) replaces an existing destination; F refuses one, answering 412 and leaving it untouched. A request refused for another reason is answered for that reason instead, whatever this header says: copying or moving a resource onto itself is 403, and so is a source that is not a regular file. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<unknown>`

---

### `get`

**GET** `/{path}?type=webdav`

Access file via WebDAV

```typescript
client.files.webdav.get(path: string, options: { type: "webdav"; server: string; user?: string; pass?: string; webdav_path?: string; cache?: boolean | number }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `type` | `"webdav"` | Yes | query |  |
| `server` | `string` | Yes | query |  |
| `user` | `string` | No | query |  |
| `pass` | `string` | No | query |  |
| `webdav_path` | `string` | No | query | WebDAV endpoint path |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody files webdav get`

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

---

### `getProperties`

**PROPFIND** `/{path}`

Get WebDAV properties

```typescript
client.files.webdav.getProperties(path: string, data?: object, options?: { Depth?: "0" | "1" | "infinity"; cache?: boolean | number }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `data` | `object` | No | body |  |
| `Depth` | `"0" \| "1" \| "infinity"` | No | header | Depth of property retrieval: 0 (resource only), 1 (immediate children), infinity (recursive) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<unknown>`

---

### `lock`

**LOCK** `/{path}`

Lock file (WebDAV compatibility)

```typescript
client.files.webdav.lock(path: string, data?: object, options?: { Depth?: "0" | "infinity"; cache?: boolean | number }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `data` | `object` | No | body |  |
| `Depth` | `"0" \| "infinity"` | No | header |  |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<unknown>`

---

### `move`

**MOVE** `/{path}`

Move or rename file/directory

```typescript
client.files.webdav.move(path: string, options: { Destination: string; Overwrite?: "T" | "F"; cache?: boolean | number }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Source file or directory path |
| `Destination` | `string` | Yes | header | Destination URL for the move |
| `Overwrite` | `"T" \| "F"` | No | header | T (default) replaces an existing destination; F refuses one, answering 412 and leaving it untouched. A request refused for another reason is answered for that reason instead, whatever this header says: copying or moving a resource onto itself is 403, and so is a source that is not a regular file. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<unknown>`

---

### `unlock`

**UNLOCK** `/{path}`

Unlock file (WebDAV compatibility)

```typescript
client.files.webdav.unlock(path: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |

**Returns:** `ApiResponse<unknown>`

---

### `updateProperties`

**PROPPATCH** `/{path}`

Update WebDAV properties

```typescript
client.files.webdav.updateProperties(path: string, data?: object): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path |  |
| `data` | `object` | No | body |  |

**Returns:** `ApiResponse<unknown>`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
