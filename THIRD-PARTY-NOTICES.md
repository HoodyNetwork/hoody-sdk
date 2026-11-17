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
- Copyright: (c) Paul Miller (https://paulmillr.com); (c) Thomas Pornin
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
- Copyright: (c) TJ Holowaychuk
- Source: https://github.com/tj/commander.js

### engine.io-client
- License: MIT
- Copyright: (c) Guillermo Rauch and Socket.IO contributors
- Source: https://github.com/socketio/socket.io

### libsodium-wrappers-sumo
- License: ISC
- Copyright: (c) Ahmad Ben Mrad, Frank Denis, Ryan Lester
- Source: https://github.com/jedisct1/libsodium.js
- Note: ISC requires preservation of this notice. The library is used by the
  `local-lock` feature (Argon2id KDF + XChaCha20-Poly1305 AEAD).

### semver
- License: ISC
- Copyright: (c) Isaac Z. Schlueter and Contributors
- Source: https://github.com/npm/node-semver

### socket.io-client
- License: MIT
- Copyright: (c) Guillermo Rauch and Socket.IO contributors
- Source: https://github.com/socketio/socket.io

### tweetnacl
- License: Unlicense (public domain dedication)
- Source: https://github.com/dchest/tweetnacl-js

### undici
- License: MIT
- Copyright: (c) Matteo Collina and Undici contributors
- Source: https://github.com/nodejs/undici

### ws
- License: MIT
- Copyright: (c) Einar Otto Stangvik; (c) Arnout Kazemier and contributors; (c) Luigi
  Pinca and contributors
- Source: https://github.com/websockets/ws

### QR Code generator (ported into `lib/qr.ts`)
- License: MIT
- Copyright: (c) Project Nayuki
- Source: https://www.nayuki.io/page/qr-code-generator-library

### rclone (backend and option descriptions)
- License: MIT
- Copyright: (C) 2012 by Nick Craig-Wood http://www.craig-wood.com/nick/
- Source: https://github.com/rclone/rclone
- Note: the descriptions of storage backends and their options, shown in the
  help of the `hoody files backends` commands and in the files HTTP reference
  of the agent skills, are adapted from rclone's backend documentation. No
  rclone code is bundled.

### Bundled through the libraries above

Between them, the browser bundles in `dist/` and the CLI in `cli/dist/` also
carry these dependencies of the libraries above.

| Package | License | Copyright | Source |
|---|---|---|---|
| engine.io-parser, socket.io-parser | MIT | (c) Guillermo Rauch and Socket.IO contributors | https://github.com/socketio/socket.io |
| @socket.io/component-emitter | MIT | (c) Component contributors | https://github.com/socketio/emitter |
| debug | MIT | (c) TJ Holowaychuk, Josh Junon | https://github.com/debug-js/debug |
| ms | MIT | (c) Vercel, Inc. | https://github.com/vercel/ms |
| xmlhttprequest-ssl | MIT | (c) passive.ly LLC | https://github.com/mjwwit/node-XMLHttpRequest |
| libsodium-sumo | ISC | (c) Ahmad Ben Mrad, Frank Denis, Ryan Lester | https://github.com/jedisct1/libsodium.js |

---

## Hoody Hub (`hub/` and `hoody-hub.html`)

The Hub source in `hub/` uses the libraries below, and the build bundles the
parts the Hub imports into the one-file Hub `hoody-hub.html`. If you pass
`hoody-hub.html` on by itself, pass this file on with it.

| Package | License | Copyright | Source |
|---|---|---|---|
| react, react-dom, scheduler, use-sync-external-store | MIT | (c) Meta Platforms, Inc. and affiliates | https://github.com/react/react |
| react-aria, react-aria-components, react-stately, @react-types/shared | Apache-2.0 | (c) Adobe | https://github.com/adobe/react-spectrum |
| @internationalized/date, @internationalized/number, @internationalized/string | Apache-2.0 | (c) Adobe | https://github.com/adobe/react-spectrum |
| @swc/helpers | Apache-2.0 | (c) SWC contributors | https://github.com/swc-project/swc |
| aria-hidden | MIT | (c) Anton Korzunov | https://github.com/theKashey/aria-hidden |
| clsx | MIT | (c) Luke Edwards | https://github.com/lukeed/clsx |
| @tanstack/react-query, @tanstack/query-core | MIT | (c) Tanner Linsley | https://github.com/TanStack/query |
| @tanstack/react-router, @tanstack/router-core, @tanstack/history | MIT | (c) Tanner Linsley | https://github.com/TanStack/router |
| @tanstack/react-table, @tanstack/table-core | MIT | (c) Tanner Linsley | https://github.com/TanStack/table |
| @tanstack/react-virtual, @tanstack/virtual-core | MIT | (c) Tanner Linsley | https://github.com/TanStack/virtual |
| @tanstack/react-store, @tanstack/store | MIT | (c) Tanner Linsley | https://github.com/TanStack/store |
| qrcode | MIT | (c) Ryan Day | https://github.com/soldair/node-qrcode |
| dijkstrajs | MIT | (c) Wyatt Baldwin | https://github.com/tcort/dijkstrajs |
| @noble/hashes | MIT | (c) Paul Miller | https://github.com/paulmillr/noble-hashes |

Fonts: Geist and Geist Mono (The Geist Project Authors) and Oxanium (The
Oxanium Project Authors), SIL Open Font License 1.1. The license texts are in
`hub/public/auth/fonts/LICENSES/`.

The terminal Hub runs a patched build of OpenTUI (MIT), vendored as npm
tarballs in `hub/hub/vendor/opentui/`. Each tarball carries its own license
files, including those of the native library's dependencies.

### Marks and logos

The Hub shows the marks of the products and providers it names: chat apps,
operating systems, coding agents and AI model providers. Each mark is drawn in
one colour from one of the sources below. The source of every mark is named
beside it in the Hub source: `hub/hub/src/kit/icons.tsx`, and
`hub/hub/src/kit/pickers/providerLogos.ts` for the AI model providers.

| Source | License | Copyright | Link |
|---|---|---|---|
| Simple Icons 13.21.0, 16.15.0 and 16.37.0 | CC0-1.0 | none (public domain dedication) | https://github.com/simple-icons/simple-icons |
| Lobe Icons (commit a177c1e) | MIT | (c) 2023 LobeHub | https://github.com/lobehub/lobe-icons |
| Primer Octicons 19.42.0 (the GitHub mark) | MIT | (c) 2026 GitHub Inc. | https://github.com/primer/octicons |
| OpenCode (its own mark) | MIT | (c) 2025 opencode | https://github.com/sst/opencode |

Some marks from Simple Icons keep their owner's own terms:

- The Debian logo: (c) 1999 Software in the Public Interest, Inc., CC BY-SA 3.0
  (https://www.debian.org/logos/).
- The Rocky Linux logo: the Rocky Linux project, CC BY-SA 4.0
  (https://github.com/rocky-linux/branding).
- The Fedora logo: under the Fedora Project's own terms
  (https://docs.fedoraproject.org/en-US/project/brand/).

The Slack mark comes from Slack's brand assets.

Every mark is a trademark of its owner. The Hub shows a mark only to name that
product or provider; this implies no endorsement.

---

## Terminal Hub in the CLI (`cli/dist/hub/`)

The CLI carries the terminal Hub, which `hoody hub` runs from the npm package
on Linux (x86-64 and arm64) with Node 26 or later:

- `hub-term.js`: the terminal Hub. It bundles the Hub's own code (Apache-2.0),
  OpenTUI's `@opentui/core` and `@opentui/react` (MIT, (c) 2025 opentui), and
  the libraries below. It also bundles some libraries named above: react,
  scheduler, use-sync-external-store, react-stately, @internationalized/number,
  @tanstack/history, @tanstack/query-core, @tanstack/react-query,
  @tanstack/react-router, @tanstack/react-store, @tanstack/react-table,
  @tanstack/router-core, @tanstack/store, @tanstack/table-core, qrcode,
  dijkstrajs, @noble/hashes and ws.
- `hub-node.js` (the launcher) and `css-tables-*.json` (the Hub's style
  tables): Hoody's own code and data, Apache-2.0.
- `libopentui-linux-x64.so` and `libopentui-linux-arm64.so`: the native library
  of the patched OpenTUI build in `hub/hub/vendor/opentui/` (MIT, (c) 2025
  opentui), with the components in the second table below.

| Package | License | Copyright | Source |
|---|---|---|---|
| react-reconciler | MIT | (c) Meta Platforms, Inc. and affiliates | https://github.com/facebook/react |
| pngjs | MIT | (c) 2015 Luke Page & Original Contributors; (c) 2012 Kuba Niegowski | https://github.com/lukeapage/pngjs |
| marked | MIT | (c) 2018+ MarkedJS; (c) 2011-2018 Christopher Jeffrey | https://github.com/markedjs/marked |
| Markdown (its license is part of marked's) | BSD-3-Clause | (c) 2004 John Gruber | http://daringfireball.net/ |
| diff | BSD-3-Clause | (c) 2009-2015 Kevin Decker | https://github.com/kpdecker/jsdiff |
| string-width and get-east-asian-width | MIT | (c) Sindre Sorhus | https://github.com/sindresorhus |
| strip-ansi and ansi-regex | MIT | (c) Sindre Sorhus | https://github.com/chalk |
| emoji-regex | MIT | (c) Mathias Bynens | https://github.com/mathiasbynens/emoji-regex |
| bun-ffi-structs | MIT | (c) 2025 Anomaly | https://github.com/anomalyco/bun-ffi-structs |

The native library contains:

| Component | License | Copyright |
|---|---|---|
| Ghostty | MIT | (c) 2024 Mitchell Hashimoto, Ghostty contributors |
| uucode | MIT | (c) 2026 Jacob Sandlund |
| The UTF-8 decoder in uucode | MIT | (c) 2008-2009 Bjoern Hoehrmann |
| lcms2 | MIT | (c) 2023 Marti Maria Saguer |
| libwebp | BSD-3-Clause, with Google's additional patent grant | (c) 2010 Google Inc. |
| stb | MIT or public domain (the Unlicense), as you choose | (c) 2017 Sean Barrett |
| Wuffs | Apache-2.0 | (c) The Wuffs Authors |
| Yoga | MIT | (c) Facebook, Inc. and its affiliates |
| miniaudio | public domain (the Unlicense) or MIT No Attribution, as you choose | (c) 2025 David Reid |
| Zig standard library and compiler runtime | MIT | (c) Zig contributors |
| Unicode Character Database (the tables in uucode) | Unicode-3.0 | (c) 1991-2025 Unicode, Inc. |

Each native package in `hub/hub/vendor/opentui/` carries license files for
OpenTUI (`LICENSE`), Ghostty, uucode, its UTF-8 decoder and the Unicode data
(all in `LICENSE-GHOSTTY`), lcms2, libwebp (`LICENSE-LIBWEBP`, with
`PATENTS-LIBWEBP` and `AUTHORS-LIBWEBP`), stb and Wuffs. Yoga, miniaudio and
the Zig standard library have no file there; their terms are in this file.

---

## License texts

Each package above names its license:

- **MIT** and **ISC**: the texts below. Each applies with the copyright line
  shown for the package above.
- **BSD-3-Clause** and **Unicode-3.0**: each package's own text below, with
  its copyright lines.
- **Apache-2.0**: the license of `hoody-sdk` itself. The full text is the
  `LICENSE` file at the root of this package (and `hub/LICENSE`).
- **SIL Open Font License 1.1**: one text per font family in
  `hub/public/auth/fonts/LICENSES/`.
- **CC BY-SA 3.0** and **CC BY-SA 4.0**:
  https://creativecommons.org/licenses/by-sa/3.0/ and
  https://creativecommons.org/licenses/by-sa/4.0/.
- **CC0-1.0** (Simple Icons) and **the Unlicense** (tweetnacl; one of the two
  choices for stb and miniaudio) place the work in the public domain and ask for
  no notice. **MIT No Attribution** (miniaudio's other choice) asks for none
  either.

After `npm install hoody-sdk`, each runtime dependency of the SDK also carries
its own license file in `node_modules/<name>/`, for the exact version
installed. The Hub's libraries are not installed with the SDK; their texts are
the ones in this section and in `LICENSE`.

### MIT License

```text
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### ISC License

```text
Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR
IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

### BSD 3-Clause License

diff's license (its `LICENSE` file):

```text
BSD 3-Clause License

Copyright (c) 2009-2015, Kevin Decker <kpdecker@gmail.com>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

libwebp's license (`LICENSE-LIBWEBP` in each native package):

```text
Copyright (c) 2010, Google Inc. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

  * Redistributions of source code must retain the above copyright
    notice, this list of conditions and the following disclaimer.

  * Redistributions in binary form must reproduce the above copyright
    notice, this list of conditions and the following disclaimer in
    the documentation and/or other materials provided with the
    distribution.

  * Neither the name of Google nor the names of its contributors may
    be used to endorse or promote products derived from this software
    without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

The Markdown license, part of marked's license file:

```text
Copyright © 2004, John Gruber
http://daringfireball.net/
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
* Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
* Neither the name “Markdown” nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

This software is provided by the copyright holders and contributors “as is” and any express or implied warranties, including, but not limited to, the implied warranties of merchantability and fitness for a particular purpose are disclaimed. In no event shall the copyright owner or contributors be liable for any direct, indirect, incidental, special, exemplary, or consequential damages (including, but not limited to, procurement of substitute goods or services; loss of use, data, or profits; or business interruption) however caused and on any theory of liability, whether in contract, strict liability, or tort (including negligence or otherwise) arising in any way out of the use of this software, even if advised of the possibility of such damage.
```

### Unicode License V3

```text
UNICODE LICENSE V3

COPYRIGHT AND PERMISSION NOTICE

Copyright (c) 1991-2025 Unicode, Inc.

NOTICE TO USER: Carefully read the following legal agreement. BY
DOWNLOADING, INSTALLING, COPYING OR OTHERWISE USING DATA FILES, AND/OR
SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE
TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT
DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.

Permission is hereby granted, free of charge, to any person obtaining a
copy of data files and any associated documentation (the "Data Files") or
software and any associated documentation (the "Software") to deal in the
Data Files or Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, and/or sell
copies of the Data Files or Software, and to permit persons to whom the
Data Files or Software are furnished to do so, provided that either (a)
this copyright and permission notice appear with all copies of the Data
Files or Software, or (b) this copyright and permission notice appear in
associated Documentation.

THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
THIRD PARTY RIGHTS.

IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE
BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES,
OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA
FILES OR SOFTWARE.

Except as contained in this notice, the name of a copyright holder shall
not be used in advertising or otherwise to promote the sale, use or other
dealings in these Data Files or Software without prior written
authorization of the copyright holder.
```
