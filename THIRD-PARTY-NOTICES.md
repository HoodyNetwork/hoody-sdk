# Third-Party Notices

`hoody-sdk` bundles or depends on the following third-party
libraries. This notice satisfies attribution clauses where the upstream
license requires it.

For the exact version installed in your lockfile, run:

```sh
npm ls --omit=dev
```

---

## Bundled / required at runtime

### @noble/ciphers
- License: MIT
- Copyright: (c) Paul Miller (https://paulmillr.com)
- Source: https://github.com/paulmillr/noble-ciphers

### @noble/hashes
- License: MIT
- Copyright: (c) Paul Miller (https://paulmillr.com)
- Source: https://github.com/paulmillr/noble-hashes

### chalk
- License: MIT
- Copyright: (c) Sindre Sorhus
- Source: https://github.com/chalk/chalk

### commander
- License: MIT
- Copyright: (c) TJ Holowaychuk, Google Inc.
- Source: https://github.com/tj/commander.js

### libsodium-wrappers-sumo
- License: ISC
- Copyright: (c) Frank Denis
- Source: https://github.com/jedisct1/libsodium.js
- Note: ISC requires preservation of this notice. The library is used by the
  `local-lock` feature (Argon2id KDF + XChaCha20-Poly1305 AEAD).

### semver
- License: ISC
- Copyright: (c) Isaac Z. Schlueter and Contributors
- Source: https://github.com/npm/node-semver

### socket.io-client
- License: MIT
- Copyright: (c) Guillermo Rauch, Automattic Inc.
- Source: https://github.com/socketio/socket.io-client

### tweetnacl
- License: Unlicense (public domain dedication)
- Source: https://github.com/dchest/tweetnacl-js

### undici
- License: MIT
- Copyright: (c) Matteo Collina and the Node.js contributors
- Source: https://github.com/nodejs/undici

### ws
- License: MIT
- Copyright: (c) Einar Otto Stangvik, Luigi Pinca
- Source: https://github.com/websockets/ws

---

## License texts

Full upstream license texts are available in each dependency's installed
directory under `node_modules/<name>/LICENSE`. Running
`npx license-checker --production --json > licenses.json` produces a machine-
readable copy covering the resolved version set.
