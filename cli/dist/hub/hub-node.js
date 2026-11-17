var h0 = (e, t, s) => () => {
  if (e)
    try {
      t = e(e = 0);
    } catch (r) {
      s = [r];
    }
  if (s)
    throw s[0];
  return t;
};

// scripts/term/build/hub-cache.ts
import J from "node:fs";
import g0 from "node:os";
import L from "node:path";
function We(e) {
  let t = e.XDG_CACHE_HOME;
  if (t && L.isAbsolute(t))
    return L.join(t, "hoody", "hub");
  let s = e.HOME;
  if (s && L.isAbsolute(s) && s !== "/")
    return L.join(s, ".cache", "hoody", "hub");
  return null;
}
function b0() {
  let e = "";
  try {
    e = J.readFileSync("/proc/self/uid_map", "utf8").trim();
  } catch {
    return -1;
  }
  if (/^0\s+0\s+4294967295$/.test(e))
    return -1;
  try {
    return Number(J.readFileSync("/proc/sys/kernel/overflowuid", "utf8").trim());
  } catch {
    return -1;
  }
}
function v0(e, t = {}) {
  let s = t.user;
  if (s === void 0)
    try {
      s = g0.userInfo().username;
    } catch {
      return !1;
    }
  let r;
  try {
    r = J.readFileSync(t.groupFile ?? "/etc/group", "utf8");
  } catch {
    return !1;
  }
  for (let n of r.split(`
`)) {
    let [o, , a, i = ""] = n.split(":");
    if (a === void 0 || Number(a) !== e || a.trim() === "")
      continue;
    let d = i.split(",").map((u) => u.trim()).filter(Boolean);
    return o === s && d.every((u) => u === s);
  }
  return !1;
}
function qe(e, t, s, r = b0(), n = v0) {
  let o = r, a = /* @__PURE__ */ new Set, i = (l) => {
    for (let c = L.dirname(l);; c = L.dirname(c))
      if (a.add(c), c === L.dirname(c))
        break;
  };
  i(L.resolve(e));
  let d;
  try {
    d = J.realpathSync(e);
  } catch {
    throw new Z("TERM_HUB_CACHE_UNSAFE", "the cache directory cannot be resolved");
  }
  i(d);
  let u = "remove its group and other write permission, or set XDG_CACHE_HOME to a directory only you can change";
  for (let l of a) {
    let c;
    try {
      c = J.statSync(l);
    } catch {
      throw new Z("TERM_HUB_CACHE_UNSAFE", `${l} (above the cache directory) cannot be read`);
    }
    if (t >= 0 && c.uid !== 0 && c.uid !== t && (o < 0 || c.uid !== o))
      throw new Z("TERM_HUB_CACHE_UNSAFE", `${l} (above the cache directory) belongs to another user: set XDG_CACHE_HOME to a directory of your own`);
    if (c.mode & 512)
      continue;
    if (c.mode & 2)
      throw new Z("TERM_HUB_CACHE_UNSAFE", `${l} (above the cache directory) can be changed by other users: ${u}`);
    if (c.mode & 16 && (s < 0 || c.gid !== s || !n(c.gid)))
      throw new Z("TERM_HUB_CACHE_UNSAFE", `${l} (above the cache directory) can be changed by its group: ${u}`);
  }
}
function me(e) {
  for (let t of k0)
    delete e[t];
}
function Xe(e) {
  me(e);
  let t = e[ze];
  if (t === void 0)
    return;
  if (e.BUN_TMPDIR === t)
    delete e.BUN_TMPDIR;
  delete e[ze];
}
var ze = "HOODY_HUB_CACHE", Z, k0;
var be = h0(() => {
  Z = class Z extends Error {
    code;
    constructor(e, t) {
      super(`${e}: ${t}`);
      this.code = e;
      this.name = "HubCacheError";
    }
  };
  k0 = ["OPENTUI_LIB_PATH", "OTUI_ASSET_ROOT"];
});

// scripts/term/build/node-runtime.ts
be();
import Lr from "node:crypto";
import M from "node:fs";
import * as p0 from "node:module";
import Pr from "node:os";
import Fe from "node:path";
import { pathToFileURL as Ur } from "node:url";

// scripts/term/build/hub-main.ts
be();

// scripts/term/build/hub-store-open.ts
import E from "node:fs";
import j from "node:path";

// scripts/term/build/hub-store.ts
import et from "node:crypto";
import U from "node:fs";
import I from "node:path";

// scripts/term/build/node-ffi.ts
function w0(e, t) {
  let s = typeof e === "string" ? e : e instanceof Error ? e.message : "";
  return (typeof t[0] === "string" ? t[0] : t[0]?.type ?? (e instanceof Error ? e.name : void 0)) === "ExperimentalWarning" && /^FFI is an experimental feature/.test(s);
}
function pe() {
  let e = process.getBuiltinModule;
  if (typeof e !== "function")
    return null;
  let t = process.emitWarning;
  process.emitWarning = function(s, ...r) {
    if (w0(s, r))
      return;
    return t.call(process, s, ...r);
  };
  try {
    let s = e.call(process, "node:ffi");
    return s && typeof s.dlopen === "function" ? s : null;
  } catch {
    return null;
  } finally {
    process.emitWarning = t;
  }
}

// scripts/term/build/hub-store.ts
class w extends Error {
  code;
  file;
  constructor(e, t, s) {
    super(`${e}: ${t}`);
    this.code = e;
    this.file = s;
    this.name = "HubStoreError";
  }
}
var S0 = 262144, T0 = 8388608, A0 = 1048576, Je = 448, Ve = 384, E0 = (e, t) => et.createHash("sha256").update(`${e}\x00${t}`).digest("hex").slice(0, 32);
function _e(e, t, s) {
  if (!e || !I.isAbsolute(e) || e === "/")
    return null;
  return I.join(e, ".hoody", "hub", E0(t, s));
}
var x0 = (e) => et.createHash("sha256").update(e).digest("hex").slice(0, 16);
function ve(e) {
  let t = JSON.stringify({ v: 1, n: e.n, t: e.t, key: e.key, op: e.op, value: e.value });
  return `${t.slice(0, -1)},"sum":"${x0(t)}"}
`;
}
function R0(e) {
  let t;
  try {
    t = JSON.parse(e);
  } catch {
    return null;
  }
  if (!t || typeof t !== "object" || Array.isArray(t))
    return null;
  let s = t;
  if (Object.keys(s).join() !== "v,n,t,key,op,value,sum")
    return null;
  if (s.v !== 1 || !Number.isSafeInteger(s.n) || !Number.isSafeInteger(s.t) || typeof s.key !== "string" || s.op !== "set" && s.op !== "del" || typeof s.value !== "string")
    return null;
  let r = { v: 1, n: s.n, t: s.t, key: s.key, op: s.op, value: s.value };
  return ve(r) === e + `
` ? r : null;
}
var N = (e) => {
  throw new w("TERM_STORE_UNSAFE", e);
};
function O0(e, t, s, r) {
  if (!I.isAbsolute(t) || !I.isAbsolute(s) || I.resolve(t) !== t || I.resolve(s) !== s)
    N("the store path is not absolute");
  let n = I.relative(s, t);
  if (!n || n.startsWith("..") || I.isAbsolute(n))
    N("the store is not under the home directory");
  let o = [s];
  for (let a of n.split(I.sep))
    o.push(I.join(o[o.length - 1], a));
  o.forEach((a, i) => {
    let d = null;
    try {
      d = e.lstatSync(a);
    } catch {
      d = null;
    }
    if (!d) {
      if (i === 0)
        N("the home directory is missing");
      try {
        e.mkdirSync(a, { mode: Je });
      } catch (u) {
        if (u.code !== "EEXIST")
          N("a store directory cannot be created");
      }
      ke(e, o[i - 1]), d = e.lstatSync(a);
    }
    if (!d.isDirectory())
      N("an ancestor of the store is not a real directory");
    if (d.uid !== r && d.uid !== 0)
      N("an ancestor of the store belongs to another user");
    if ((d.mode & 18) !== 0)
      N("an ancestor of the store can be written by others");
    if (i === o.length - 1 && (d.uid !== r || (d.mode & 511) !== Je))
      N("the store directory is not private to this user");
  });
}
function ke(e, t) {
  let s = e.openSync(t, U.constants.O_RDONLY | U.constants.O_DIRECTORY | U.constants.O_NOFOLLOW);
  try {
    e.fsyncSync(s);
  } finally {
    e.closeSync(s);
  }
}
function G(e, t, s, r) {
  let n;
  try {
    n = e.openSync(t, s | U.constants.O_NOFOLLOW, Ve);
  } catch (a) {
    let i = a.code;
    if (i === "ENOENT")
      throw a;
    return N(i === "EEXIST" ? "a temporary file of the store already exists" : "a store file cannot be opened as a plain file");
  }
  let o = e.fstatSync(n);
  if (!o.isFile() || o.nlink !== 1 || o.uid !== r || (o.mode & 511) !== Ve)
    e.closeSync(n), N("a store file is not a private plain file of this user");
  return n;
}
function Qe(e, t, s) {
  let r = G(e, t, U.constants.O_RDONLY, s), n;
  try {
    n = e.readFileSync(r, "utf8");
  } finally {
    e.closeSync(r);
  }
  let o = /* @__PURE__ */ new Map, a = !1;
  try {
    let i = JSON.parse(n);
    if (i && i.v === 1 && i.keys && typeof i.keys === "object" && !Array.isArray(i.keys) && Object.keys(i).join() === "v,keys") {
      if (a = Object.values(i.keys).every((d) => typeof d === "string"), a)
        for (let [d, u] of Object.entries(i.keys))
          o.set(d, u);
    }
  } catch {
    a = !1;
  }
  if (!a)
    throw new w("TERM_STORE_CORRUPT", "the stored preferences cannot be read", "store.json");
  return o;
}
function ye(e, t) {
  let s = { ...U, ...t.io }, r = t.uid ?? process.getuid?.() ?? -1, n = t.now ?? Date.now, o = t.pid ?? process.pid, a = U.constants, i = t.limits?.valueMax ?? S0, d = t.limits?.storeMax ?? T0, u = t.limits?.compactAt ?? A0;
  if (r < 0)
    N("this platform has no user ids");
  O0(s, e, t.home, r);
  let l = (m) => I.join(e, m), c = G(s, l("lock"), a.O_RDWR | a.O_CREAT, r), p = !t.tryLock(c), _ = /* @__PURE__ */ new Map;
  try {
    for (let [m, y] of Qe(s, l("store.json"), r))
      _.set(m, y);
  } catch (m) {
    if (m.code !== "ENOENT")
      throw s.closeSync(c), m;
  }
  let g = /* @__PURE__ */ new Map, A = 0, k = 0, F = !1, v = -1, Ze = !1;
  try {
    v = G(s, l("journal.jsonl"), p ? a.O_RDONLY : a.O_RDWR | a.O_APPEND, r);
  } catch (m) {
    if (m.code !== "ENOENT")
      throw s.closeSync(c), m;
    if (!p)
      v = G(s, l("journal.jsonl"), a.O_RDWR | a.O_APPEND | a.O_CREAT | a.O_EXCL, r), Ze = !0;
  }
  if (v >= 0)
    try {
      if (Ze)
        s.fsyncSync(v), ke(s, e);
      let m = s.readFileSync(v, "utf8"), y = m.lastIndexOf(`
`) + 1, b = m.slice(0, y);
      F = y < m.length;
      let S = !0;
      for (let x of b === "" ? [] : b.slice(0, -1).split(`
`)) {
        let T = R0(x);
        if (!T || !S && T.n !== A + 1 || T.n < 1)
          throw new w("TERM_STORE_CORRUPT", "the record of open changes cannot be read", "journal.jsonl");
        if (S = !1, A = T.n, T.op === "set")
          g.set(T.key, T.value);
        else
          g.delete(T.key);
      }
      if (k = Buffer.byteLength(b), F && !p)
        s.ftruncateSync(v, k), s.fsyncSync(v);
    } catch (m) {
      throw s.closeSync(v), s.closeSync(c), m;
    }
  let X = !1, ce = !1, fe = () => {
    if (ce)
      throw new w("TERM_STORE_FAILED", "the store is closed");
    if (p)
      throw new w("TERM_STORE_READ_ONLY", "another Hub is open for this account");
    if (X)
      throw new w("TERM_STORE_FAILED", "an earlier write to the store failed");
  }, ge = (m) => {
    try {
      return m();
    } catch (y) {
      if (X = !0, y instanceof w)
        throw y;
      throw new w("TERM_STORE_FAILED", "a write to the store failed");
    }
  }, Ge = (m, y, b) => {
    if (Buffer.byteLength(y) > i)
      throw new w("TERM_STORE_TOO_LARGE", "a value is too large to keep");
    let S = b + Buffer.byteLength(m);
    for (let [x, T] of g)
      if (x !== m)
        S += Buffer.byteLength(x) + Buffer.byteLength(T);
    for (let [x, T] of _)
      if (x !== m)
        S += Buffer.byteLength(x) + Buffer.byteLength(T);
    if (S > d)
      throw new w("TERM_STORE_TOO_LARGE", "the store is full");
  }, $e = (m, y) => {
    let b = l(`${m}.${o}.tmp`), S = G(s, b, a.O_WRONLY | a.O_CREAT | a.O_EXCL, r), x = Buffer.byteLength(y), T = !1;
    try {
      try {
        if (s.writeSync(S, y) !== x)
          throw new w("TERM_STORE_FAILED", "a write to the store was cut short");
        s.fsyncSync(S);
      } finally {
        s.closeSync(S);
      }
      s.renameSync(b, l(m)), T = !0;
    } finally {
      if (!T)
        try {
          s.unlinkSync(b);
        } catch {}
    }
    return ke(s, e), x;
  }, He = () => {
    let m = A, y = [...g].map(([b, S]) => ve({ v: 1, n: ++m, t: n(), key: b, op: "set", value: S })).join("");
    k = $e("journal.jsonl", y), A = m, s.closeSync(v), v = G(s, l("journal.jsonl"), a.O_RDWR | a.O_APPEND, r);
  }, Ye = (m, y, b) => {
    if (fe(), y === "set")
      Ge(m, b, Buffer.byteLength(b));
    ge(() => {
      let S = ve({ v: 1, n: A + 1, t: n(), key: m, op: y, value: b }), x = s.writeSync(v, S);
      if (x !== Buffer.byteLength(S))
        throw new w("TERM_STORE_FAILED", "a write to the store was cut short");
      if (s.fsyncSync(v), A += 1, k += x, y === "set")
        g.set(m, b);
      else
        g.delete(m);
      if (k > u)
        try {
          He();
        } catch {
          X = !0;
        }
    });
  }, Ke = (m) => {
    ge(() => {
      $e("store.json", JSON.stringify({ v: 1, keys: Object.fromEntries(m) }));
    }), _.clear();
    for (let [y, b] of m)
      _.set(y, b);
  };
  return {
    readOnly: p ? "busy" : null,
    droppedTail: F,
    journalGet: (m) => g.get(m) ?? null,
    journalKeys: () => [...g.keys()],
    journalSet: (m, y) => {
      Ye(m, "set", y);
    },
    journalDel: (m) => {
      if (g.has(m))
        Ye(m, "del", "");
      else
        fe();
    },
    get: (m) => _.get(m) ?? null,
    keys: () => [..._.keys()],
    set(m, y) {
      fe(), Ge(m, y, Buffer.byteLength(y)), Ke(new Map(_).set(m, y));
    },
    del(m) {
      if (fe(), !_.has(m))
        return;
      let y = new Map(_);
      y.delete(m), Ke(y);
    },
    failed: () => X,
    refresh() {
      if (!p || ce)
        return !1;
      let m;
      try {
        m = Qe(s, l("store.json"), r);
      } catch {
        return !1;
      }
      _.clear();
      for (let [y, b] of m)
        _.set(y, b);
      return !0;
    },
    close() {
      if (ce)
        return;
      try {
        if (!p && !X && v >= 0 && k > 0)
          ge(He);
      } catch {}
      if (ce = !0, v >= 0)
        try {
          s.closeSync(v);
        } catch {}
      try {
        s.closeSync(c);
      } catch {}
    }
  };
}
async function we() {
  let e = process.platform === "darwin" ? "libSystem.B.dylib" : "libc.so.6", t = 2, s = 4;
  if (typeof globalThis.Bun < "u") {
    let { dlopen: o } = await import("bun:ffi"), a = o(e, { flock: { args: ["i32", "i32"], returns: "i32" } });
    return (i) => a.symbols.flock(i, 6) === 0;
  }
  let r = pe();
  if (!r)
    throw Error("TERM_HUB_NODE_FFI: no node:ffi in this Node");
  let n = r.dlopen(e, { flock: { arguments: ["i32", "i32"], return: "i32" } }).functions.flock;
  return (o) => n(o, 6) === 0;
}

// scripts/term/build/hub-store-open.ts
var I0 = 3, N0 = /^(store\.json|journal\.jsonl)\.unreadable-(\d+)$/, D0 = /^(store\.json|journal\.jsonl)\.\d+\.tmp$/, tt = (e) => {
  let t = E.openSync(e, E.constants.O_RDONLY | E.constants.O_DIRECTORY);
  try {
    E.fsyncSync(t);
  } finally {
    E.closeSync(t);
  }
};
function M0(e, t, s, r) {
  let n = E.constants, o = -1;
  try {
    if (o = E.openSync(j.join(e, "lock"), n.O_RDWR | n.O_NOFOLLOW), !s(o))
      return null;
    let a = E.readdirSync(e).map((u) => N0.exec(u)).filter((u) => !!u && u[1] === t).sort((u, l) => Number(u[2]) - Number(l[2])).map((u) => u[0]), i = Math.max(0, Math.floor(r()));
    while (E.existsSync(j.join(e, `${t}.unreadable-${i}`)))
      i += 1;
    let d = `${t}.unreadable-${i}`;
    E.renameSync(j.join(e, t), j.join(e, d));
    for (let u of a.slice(0, Math.max(0, a.length - (I0 - 1))))
      try {
        E.unlinkSync(j.join(e, u));
      } catch {}
    return tt(e), d;
  } catch {
    return null;
  } finally {
    if (o >= 0)
      try {
        E.closeSync(o);
      } catch {}
  }
}
function C0(e) {
  let t = !1;
  try {
    for (let s of E.readdirSync(e))
      if (D0.test(s))
        try {
          E.unlinkSync(j.join(e, s)), t = !0;
        } catch {}
    if (t)
      tt(e);
  } catch {}
}
function st(e) {
  let t = e.now ?? Date.now, s = t(), r = _e(e.home, e.apiOrigin, e.uid), n = (a, i = []) => ({ area: null, openedAt: s, notice: { reason: a, dir: r, files: i }, close() {} });
  if (!r || !e.home)
    return n("no-home");
  let o = [];
  for (let a = 0;a < 3; a++) {
    let i;
    try {
      i = ye(r, { home: e.home, tryLock: e.tryLock, now: t, ...e.pid !== void 0 ? { pid: e.pid } : {}, ...e.io ? { io: e.io } : {} });
    } catch (u) {
      if (!(u instanceof w) || u.code !== "TERM_STORE_CORRUPT")
        return n(u instanceof w && u.code === "TERM_STORE_UNSAFE" ? "unsafe" : "failed");
      let l = u.file;
      if (!l || o.some((p) => p.file === l))
        return n("unreadable", l ? [{ file: l, keptAs: null }] : []);
      let c = M0(r, l, e.tryLock, t);
      if (c === null)
        return n("unreadable", [{ file: l, keptAs: null }]);
      o.push({ file: l, keptAs: c });
      continue;
    }
    if (i.readOnly === null)
      C0(r);
    let d = o.length ? { reason: "reset", dir: r, files: o, ...i.readOnly === "busy" ? { busy: !0 } : {} } : i.readOnly === "busy" ? { reason: "busy", dir: r, files: [] } : null;
    return { area: i, openedAt: s, notice: d, close: () => {
      i.close();
    } };
  }
  return n("unreadable");
}
var L0 = { "store.json": "preferences", "journal.jsonl": "the list of changes still open" };
function Te(e) {
  if (!e)
    return null;
  switch (e.reason) {
    case "no-home":
      return "hoody hub: no home directory was found, so nothing is kept between runs and changes are off.";
    case "unsafe":
      return `hoody hub: the saved Hub data in ${e.dir ?? "your home directory"} is not private to you (owner or permissions), so it is not used. Nothing is kept between runs and changes are off.`;
    case "failed":
      return `hoody hub: the saved Hub data in ${e.dir ?? "your home directory"} could not be opened (a disk error, or the disk is full), so it is not used. Nothing is kept between runs and changes are off.`;
    case "busy":
      return "hoody hub: another Hub is open for this account, so changes are off in this one.";
    case "unreadable":
      return `hoody hub: the saved Hub data in ${e.dir ?? "your home directory"} could not be read${e.files.length ? ` (${e.files.map((t) => t.file).join(", ")})` : ""} and was left as it is. Nothing is kept between runs and changes are off. Close any other Hub and start again.`;
    case "reset": {
      let t = e.files.map((o) => L0[o.file]).join(" and "), s = e.files.map((o) => j.join(e.dir ?? "", o.keptAs ?? o.file)).join(", "), r = e.files.some((o) => o.file === "journal.jsonl") ? " A change that was still open when the Hub last closed is no longer listed: check it yourself." : "", n = e.busy ? " Another Hub is open for this account, so changes are off in this one." : "";
      return `hoody hub: the saved ${t} could not be read and started again empty. The old file is kept as ${s}.${r}${n}`;
    }
  }
}
var P0 = {
  "no-home": "Nothing is kept between runs",
  unsafe: "Saved Hub data is not used",
  unreadable: "Saved Hub data could not be read",
  failed: "Saved Hub data could not be opened",
  reset: "Saved Hub data started again empty",
  busy: "Another Hub is open"
};
function rt(e) {
  let t = Te(e);
  if (!e || t === null)
    return null;
  let s = t.replace(/^hoody hub: /, "");
  return { title: P0[e.reason], body: s.charAt(0).toUpperCase() + s.slice(1) };
}
var Se = "term.resume", U0 = /^[a-z][a-z0-9-]{0,31}$/, j0 = /^(?:all|[0-9a-f]{24})$/, nt = (e) => {
  if (!e || typeof e !== "object" || Array.isArray(e))
    return {};
  let t = e;
  return { ...typeof t.page === "string" && U0.test(t.page) ? { page: t.page } : {}, ...typeof t.realmId === "string" && j0.test(t.realmId) ? { realmId: t.realmId } : {} };
};
function at(e) {
  if (!e)
    return {};
  try {
    return nt(JSON.parse(e.get(Se) ?? "null"));
  } catch {
    return {};
  }
}
function ot(e, t) {
  if (!e || e.readOnly !== null || e.failed())
    return !1;
  let s = JSON.stringify(nt(t));
  try {
    if (e.get(Se) !== s)
      e.set(Se, s);
    return !0;
  } catch {
    return !1;
  }
}

// scripts/term/build/hub-main.ts
function B0(e) {
  return { area: e.area, openedAt: e.openedAt, notice: rt(e.notice) };
}
function F0(e, t, s) {
  if (t.ok !== !0)
    return !1;
  try {
    return ot(e.area, { ...t.lastView?.page ? { page: t.lastView.page } : {}, realmId: s });
  } catch {
    return !1;
  }
}
function Z0(e) {
  if ((e.NO_COLOR ?? "") !== "" || e.TERM === "dumb")
    return "mono";
  if (e.HUB_TERM_COLOUR === "truecolor" || e.HUB_TERM_COLOUR === "ansi16" || e.HUB_TERM_COLOUR === "mono")
    return e.HUB_TERM_COLOUR;
  if (e.COLORTERM === "truecolor" || e.COLORTERM === "24bit" || /-(direct|truecolor)$/.test(e.TERM ?? ""))
    return "truecolor";
  return "ansi16";
}
function it(e, t) {
  let s = process, r = e.map((o) => [o, s.listeners(o)]);
  for (let [o, a] of r)
    for (let i of a)
      s.off(o, i);
  for (let o of e)
    s.on(o, t);
  let n = !0;
  return () => {
    if (!n)
      return;
    n = !1;
    for (let o of e)
      s.off(o, t);
    for (let [o, a] of r)
      for (let i of a)
        s.on(o, i);
  };
}
var G0 = ["uncaughtException", "unhandledRejection"];
function $0(e) {
  return it(G0, () => {
    try {
      e();
    } catch {}
  });
}
var dt = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 };
function H0(e) {
  let t = Object.keys(dt).map((s) => it([s], () => {
    try {
      e(s);
    } catch {}
  }));
  return () => {
    for (let s of t)
      s();
  };
}
function Y0(e, t) {
  if (!t && e.reason === "expired")
    return { code: 2, line: "hoody hub: your sign-in has expired. Run `hoody login`, then `hoody hub` again." };
  return null;
}
function K0(e, t) {
  let s = !0, r = (n) => {
    if (s && (typeof n === "string" ? n.includes("\x03") : n.includes(3)))
      t();
  };
  return e.on("data", r), { drawn: () => {
    s = !1;
  }, off: () => {
    s = !1, e.off("data", r);
  } };
}
async function lt(e) {
  let { stdin: t, stdout: s } = process;
  if (!t.isTTY || !s.isTTY)
    return process.stderr.write(`hoody hub: needs an interactive terminal (TERM_HUB_NO_TTY)
`), 2;
  let r = Z0(process.env), n = e.demo ? void 0 : e.store, o = n ? Te(n.notice) : null;
  if (o)
    process.stderr.write(o + `
`);
  let a = new AbortController, i = !1, d = null, u = $0(() => {
    i = !0, a.abort();
  }), l;
  try {
    l = await e.load();
  } catch (g) {
    throw u(), g;
  }
  Xe(process.env);
  let c = null, p = H0((g) => {
    c ??= g, a.abort();
  });
  t.setRawMode(!0);
  let _ = K0(t, () => {
    c ??= "SIGINT", a.abort();
  });
  try {
    let g = await (e.demo ? l.mountDemoHub.bind(l) : l.mountTerminalHub.bind(l))({
      client: await e.client(),
      context: e.context,
      ...e.route ? { route: e.route } : {},
      ...n ? { store: B0(n) } : {},
      io: {
        cells: { write: (k) => {
          _.drawn(), s.write(k);
        } },
        input: { onData: (k) => {
          let F = (v) => k(v.toString("utf8"));
          return t.on("data", F), () => {
            t.off("data", F);
          };
        } },
        size: () => ({ cols: s.columns ?? 80, rows: s.rows ?? 24 }),
        onResize: (k) => (s.on("resize", k), () => {
          s.off("resize", k);
        }),
        colourTier: r
      },
      onSetDefault: e.onSetDefault ?? (async () => {}),
      ...e.webOrigin ? { webOrigin: e.webOrigin } : {},
      signal: a.signal
    });
    if (i) {
      if (g.ok !== !1)
        d = "hoody hub: stopped after an error (TERM_HUB_UNCAUGHT)";
      return g.exitCode || 1;
    }
    if (n)
      F0(n, g, e.context.realmId);
    if (c !== null)
      return 128 + dt[c];
    let A = Y0(g, e.demo === !0);
    if (A)
      return d = A.line, A.code;
    return g.exitCode;
  } catch {
    return process.stderr.write(`hoody hub: could not start (TERM_HUB_MOUNT_REFUSED)
`), 1;
  } finally {
    if (_.off(), p(), u(), t.isTTY)
      try {
        t.setRawMode(!1);
      } catch {}
    if (d)
      process.stderr.write(d + `
`);
    if (t.pause(), n)
      try {
        n.close();
      } catch {}
    if (o)
      process.stderr.write(o + `
`);
  }
}

// scripts/term/build/hub-store-logout.ts
import V0 from "node:fs";

// src/term/env/secret-shaped.ts
var Ae = /(?:\bhdy_[A-Za-z0-9_-]{8,}|\bhbk_[A-Za-z0-9_-]{8,}|\bBearer\s+\S{8,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{16,})/;

// src/term/app/boot-keys.ts
var Ee = "term.boot_keys", ct = 8, z0 = /^[A-Za-z0-9_-]{1,64}$/, W0 = "hub.v3.changes", q0 = "attempt\x02", X0 = "term.direct.boot-token-mint:", xe = (e) => !!e && typeof e === "object" && !Array.isArray(e), J0 = /^hoody-agent auto term [a-z0-9]{10}$/, ft = (e) => xe(e) && Object.keys(e).every((t) => ["id", "alias", "expires_at", "at"].includes(t)) && typeof e.id === "string" && z0.test(e.id) && typeof e.alias === "string" && J0.test(e.alias) && typeof e.expires_at === "string" && e.expires_at.length <= 40 && Number.isFinite(Date.parse(e.expires_at)) && typeof e.at === "number" && Number.isFinite(e.at) && e.at >= 0;
function Re(e) {
  let t;
  try {
    t = e.get(Ee);
  } catch {
    return null;
  }
  if (t === null)
    return [];
  if (Ae.test(t))
    return null;
  let s;
  try {
    s = JSON.parse(t);
  } catch {
    return null;
  }
  return Array.isArray(s) && s.length <= ct && s.every(ft) ? [...s].sort((r, n) => r.at - n.at) : null;
}
function ut(e, t) {
  if (e.readOnly !== null || e.failed() || t.length > ct || !t.every(ft))
    return !1;
  let s = JSON.stringify(t);
  if (Ae.test(s))
    return !1;
  try {
    e.set(Ee, s);
  } catch {
    return !1;
  }
  let r;
  try {
    r = e.get(Ee);
  } catch {
    return !1;
  }
  return r === s;
}
function mt(e) {
  let t;
  try {
    t = e.journalGet(W0);
  } catch {
    return 1;
  }
  if (t === null)
    return 0;
  let s;
  try {
    s = JSON.parse(t);
  } catch {
    return 1;
  }
  if (!Array.isArray(s))
    return 1;
  return s.filter((r) => xe(r) && typeof r.id === "string" && r.id.startsWith(q0) && xe(r.meta) && typeof r.meta.base === "string" && r.meta.base.startsWith(X0)).length;
}
async function pt(e, t, s, r, n = Date.now) {
  if (e !== "rw")
    return { revoked: 0, left: null, ok: !1 };
  let o = Re(t);
  if (o === null)
    return { revoked: 0, left: null, ok: !1 };
  let a = o.filter((d) => Date.parse(d.expires_at) > n());
  if (a.length !== o.length) {
    if (!ut(t, a))
      return { revoked: 0, left: o.length, ok: !1 };
    o = a;
  }
  let i = 0;
  while (o.length > Math.max(0, r)) {
    let d = o[0], u;
    try {
      u = await s(d.id);
    } catch {
      u = "failed";
    }
    if (u !== "gone")
      return { revoked: i, left: o.length, ok: !1 };
    let l = o.slice(1);
    if (!ut(t, l))
      return { revoked: i + 1, left: o.length, ok: !1 };
    o = l, i++;
  }
  return { revoked: i, left: o.length, ok: !0 };
}

// scripts/term/build/hub-store-logout.ts
var B = (e, t = 0, s = 0, r = 0) => ({ state: e, revoked: t, left: s, open: r });
async function _t(e) {
  let t = e.uid ? _e(e.home, e.apiOrigin, e.uid) : null;
  if (!t || !e.home)
    return B("none");
  try {
    V0.lstatSync(t);
  } catch (r) {
    return B(r.code === "ENOENT" ? "none" : "unreadable");
  }
  let s;
  try {
    s = ye(t, { home: e.home, tryLock: e.tryLock, ...e.now ? { now: e.now } : {}, ...e.io ? { io: e.io } : {} });
  } catch {
    return B("unreadable");
  }
  try {
    if (s.readOnly !== null)
      return B("busy", 0, Re(s)?.length ?? 0);
    let r = mt(s), n = await pt("rw", s, e.revoke, 0, e.now);
    if (n.left === null)
      return B("unreadable", 0, 0, r);
    return B(n.ok && n.left === 0 && r === 0 ? "done" : "kept", n.revoked, n.left, r);
  } catch {
    return B("unreadable");
  } finally {
    try {
      s.close();
    } catch {}
  }
}

// scripts/term/build/demo-answers.ts
var f = (e) => new Date(e).toISOString();
var ne = [
  { id: "7a0000000000000000000001", family: "7f0000000000000000000001", title: "Small", label: "Server slice", cents: 600, cpu: 2, ram: 4, disk: 40, computers: 5, snaps: 3, net: 500, aliases: 10, bots: 25, shares: 5, tier: "plus", mult: 2, about: "A first server of your own.", features: ["2 CPU cores", "4 GB memory", "40 GB disk"] },
  { id: "7a0000000000000000000002", family: "7f0000000000000000000002", title: "Medium", label: "Server slice", cents: 1200, cpu: 4, ram: 8, disk: 80, computers: 10, snaps: 5, net: 1000, aliases: 25, bots: 50, shares: 5, tier: "plus", mult: 3, about: "Room for a few busy computers.", features: ["4 CPU cores", "8 GB memory", "80 GB disk"] },
  { id: "7a0000000000000000000003", family: "7f0000000000000000000003", title: "Large", label: "Server slice", cents: 3900, cpu: 8, ram: 32, disk: 320, computers: 25, snaps: 10, net: 1000, aliases: 50, bots: 100, shares: 25, tier: "pro", mult: 5, about: "For teams and heavy workloads.", features: ["8 CPU cores", "32 GB memory", "320 GB disk"] }
], Nt = (e) => ({ cpu_cores: e.cpu, ram_gb: e.ram, disk_limit_gb: e.disk, disk_io_read_mib: 400, disk_io_write_mib: 200, network_limit_mbps: e.net, max_computers: e.computers, snapshots_per_computer: e.snaps, ai_multiplier: e.mult }), yt = () => ({
  requested_locale: "en",
  plans: ne.map((e, t) => ({
    id: e.id,
    family_id: e.family,
    type: "slice",
    sort_order: t + 1,
    price_cents_per_month: e.cents,
    hold_days: 7,
    resources: Nt(e),
    max_proxy_aliases: e.aliases,
    max_bot_urls: e.bots,
    max_storage_shares: e.shares,
    ai_tier: e.tier,
    text: { title: e.title, description: e.about, type_label: e.label, features: e.features },
    text_locales: { title: "en", description: "en", type_label: "en", features: "en" }
  }))
}), ht = (e) => ({ family_id: e.family, title: e.title, type_label: e.label, price_cents_per_month: e.cents, hold_days: 7, resources: Nt(e), max_proxy_aliases: e.aliases, max_bot_urls: e.bots, max_storage_shares: e.shares, ai_tier: e.tier }), Q0 = (e) => [
  { id: "7b0000000000000000000012", plan_id: ne[2].id, state: "active", server_id: "5e0000000000000000000012", server_name: "n12", anchor_day: 10, auto_renew: !0, paid_through: f(e + 1555200000), active_operation_id: null, delete_at: null, created_at: f(e - 6220800000), updated_at: f(e - 1036800000), plan: ht(ne[2]) },
  { id: "7b0000000000000000000007", plan_id: ne[1].id, state: "active", server_id: "5e0000000000000000000007", server_name: "fra-7", anchor_day: 3, auto_renew: !0, paid_through: f(e + 777600000), active_operation_id: null, delete_at: null, created_at: f(e - 4406400000), updated_at: f(e - 1814400000), plan: ht(ne[1]) }
], Oe = (e, t, s, r, n) => ({
  cpu: { model: e, cores: t, threads: t * 2, score: null, score_type: null },
  ram: { capacity_gb: s, type: "ECC DDR4", speed_mhz: 3200 },
  disks: { config: r.map(([o, a]) => ({ count: o, capacity_gb: a, type: "NVMe", interface: "NVMe", model: "Enterprise NVMe" })), total_gb: r.reduce((o, [a, i]) => o + a * i, 0), summary: r.map(([o, a]) => `${o} x ${a} GB NVMe`).join(" + ") },
  network: { bandwidth_mbps: n, bandwidth_formatted: n >= 1000 ? `${n / 1000} Gbps` : `${n} Mbps`, traffic_tb: null, traffic_unlimited: !0 },
  additional: { ipv4_count: 1, ipv6_enabled: !0 }
}), es = (e) => Object.fromEntries(Object.entries(e).map(([t, s]) => [t, { price: s, hold_days: 1, total_first_payment: s }])), Ie = (e) => ({ prices: e, setup_fee: "0.00", setup_fee_cents: 0, price_tiers: es(e) }), ts = () => [
  {
    id: "5e00000000000000000000a1",
    name: "Singapore M",
    country: "SG",
    region: "West Region",
    city: "Jurong",
    datacenter: "SIN-2",
    model: "AMD EPYC 7313P",
    is_vm: !1,
    category: "general",
    featured: !0,
    popularity_rank: 1,
    setup_time_minutes: 30,
    delivery_hours: 0,
    discount: null,
    pricing: Ie({ "30": "79.00", "90": "225.15", "365": "853.20" }),
    specs: Oe("AMD EPYC 7313P", 16, 64, [[2, 960]], 1000)
  },
  {
    id: "5e00000000000000000000a2",
    name: "Frankfurt L",
    country: "DE",
    region: "Hesse",
    city: "Frankfurt",
    datacenter: "FRA-1",
    model: "AMD EPYC 7443P",
    is_vm: !1,
    category: "compute",
    featured: !1,
    popularity_rank: 2,
    setup_time_minutes: 30,
    delivery_hours: 0,
    discount: null,
    pricing: Ie({ "30": "129.00", "90": "367.65", "365": "1393.20" }),
    specs: Oe("AMD EPYC 7443P", 24, 128, [[2, 1920]], 1000)
  },
  {
    id: "5e00000000000000000000a3",
    name: "Tokyo M",
    country: "JP",
    region: "Chiba",
    city: "Inzai",
    datacenter: "TYO-3",
    model: "Intel Xeon E-2388G",
    is_vm: !1,
    category: "general",
    featured: !1,
    popularity_rank: 3,
    setup_time_minutes: 45,
    delivery_hours: 0,
    discount: null,
    pricing: Ie({ "30": "89.00", "90": "253.65", "365": "961.20" }),
    specs: Oe("Intel Xeon E-2388G", 8, 64, [[2, 960]], 1000)
  }
], gt = (e, t, s) => ({
  id: t,
  current: s.current === !0,
  active: !0,
  method: s.method,
  client: s.client,
  client_name: s.name,
  user_agent: s.agent,
  created_at: f(e - s.madeDays * 86400000),
  created_ip: s.ip,
  created_country: s.country,
  last_refreshed_at: f(e - s.seenMin * 60000),
  last_ip: s.ip,
  last_country: s.country,
  expires_at: f(e + 2592000000),
  ended_at: null,
  end_reason: null,
  ended_by_session_id: null,
  ended_by_current: !1,
  auth_tokens_created: { count: 0, tokens: [] }
}), ss = (e) => [
  { id: "8c0000000000000000000001", event: "login", outcome: "success", ip_address: "203.0.113.24", country: "SG", client: "Hoody CLI", created_at: f(e - 720000) },
  { id: "8c0000000000000000000002", event: "login", outcome: "success", ip_address: "203.0.113.24", country: "SG", client: "Firefox on Linux", created_at: f(e - 172800000) },
  { id: "8c0000000000000000000003", event: "two_factor_enabled", outcome: "success", ip_address: "203.0.113.24", country: "SG", client: "Firefox on Linux", created_at: f(e - 3456000000) },
  { id: "8c0000000000000000000004", event: "password_changed", outcome: "success", ip_address: "198.51.100.7", country: "DE", client: "Safari on macOS", created_at: f(e - 8294400000) }
], V = (e, t) => ({ status: "ok", percent_used: e, resets_at: f(t + 86400000 - t % 86400000) }), he = (e, t, s, r, n) => ({
  id: `8e00000000000000000000${t.toString(16).padStart(2, "0")}`,
  event_type: s,
  resource_type: "computer",
  resource_id: "c0a7150000000000000000a1",
  user_id: "64f0ada00000000000000001",
  payload: n,
  realm_ids: ["f1f1f1f1f1f1f1f1f1f1f1f1"],
  created_at: f(e - r * 60000),
  event: s,
  eventId: `8e00000000000000000000${t.toString(16).padStart(2, "0")}`,
  timestamp: f(e - r * 60000),
  data: n,
  cursor: null,
  schema_version: 1,
  change_id: null,
  operation_id: null,
  project_id: "6a0000000000000000000001",
  computer_id: "c0a7150000000000000000a1",
  all_realms: !1,
  visibility: "full",
  cause_event_id: null,
  actor: { kind: "user", id: "64f0ada00000000000000001" },
  ephemeral: !1
}), rs = (e) => [
  he(e, 1, "computer.snapshot.created", 95, { id: "c0a7150000000000000000a1", name: "atlas", snapshot: "before-upgrade" }),
  he(e, 2, "computer.running", 420, { id: "c0a7150000000000000000a1", name: "atlas", status: "running" }),
  he(e, 3, "computer.stopped", 422, { id: "c0a7150000000000000000a1", name: "atlas", status: "stopped" }),
  he(e, 4, "computer.ssh_key.added", 4320, { id: "c0a7150000000000000000a1", name: "atlas" })
], h = (e, t, s) => ({ path: e, match: new RegExp("^" + e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"), data: t, ...s ? { extra: s } : {} }), H = (e, t, s) => ({ path: e, match: new RegExp("^" + e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(":id", "[0-9a-f]{24}") + "$"), data: s, sample: t }), Dt = (e) => new URLSearchParams(e.replace(/#.*$/s, "").split("?")[1] ?? ""), Mt = [
  { n: 1, subject: "My computer is slow since this morning", category: "computers", status: "waiting_user", unread: !0, thread: [
    ["you", 300, `Since about 08:00 UTC atlas takes a long time to open files, and the terminal lags.
Nothing changed on my side.`],
    ["support", 50, `Thanks for the details. A disk on its host was busy with a check, which finished an hour ago.
Could you try again and tell us whether it is back to normal?`]
  ] },
  { n: 2, subject: "How do I put my own domain on a program?", category: "networking", status: "open", unread: !1, thread: [
    ["you", 1560, "I would like shop.example.com to open the web program on atlas. Where do I set that up?"]
  ] },
  { n: 3, subject: "Can one Bot answer in two Telegram groups?", category: "bots", status: "closed", unread: !1, closedMin: 7170, thread: [
    ["you", 8640, "Can one Bot answer in two Telegram groups, or do I need a second Bot?"],
    ["support", 8545, "One Bot can answer in both. Add it to the second group, then let the group in from the Bot's Chat apps tab."],
    ["you", 7180, "That worked, thank you!"]
  ] }
], Me = (e) => `6d1c${e.toString(16).padStart(20, "0")}`, ns = (e, t) => `6d1d${(e * 256 + t).toString(16).padStart(20, "0")}`, Ct = (e, t) => {
  let s = e.thread[0], r = e.thread[e.thread.length - 1];
  return {
    id: Me(e.n),
    subject: e.subject,
    category: e.category,
    status: e.status,
    terminal: !1,
    unread: e.unread,
    created_at: f(t - s[1] * 60000),
    last_message_at: f(t - r[1] * 60000),
    closed_at: e.closedMin === void 0 ? null : f(t - e.closedMin * 60000),
    reopenable: e.status === "closed"
  };
};
function as(e, t) {
  let s = Dt(t), r = s.get("status"), n = Number(s.get("limit") ?? 20);
  return { tickets: Mt.filter((a) => !r || a.status === r).map((a) => Ct(a, e)).slice(0, Number.isInteger(n) && n > 0 ? n : 20), next_cursor: null };
}
function os(e, t) {
  let s = t.replace(/[?#].*$/s, "").split("/")[3], r = Mt.find((a) => Me(a.n) === s);
  if (!r)
    return;
  let n = Number(Dt(t).get("before_seq") ?? 1 / 0), o = r.thread.map(([a, i, d], u) => ({ id: ns(r.n, u + 1), seq: u + 1, from: a, body: d, created_at: f(e - i * 60000) })).filter((a) => a.seq < n).reverse();
  return { ticket: Ct(r, e), messages: o, has_older: !1 };
}
var ae = "6a0000000000000000000002", De = "6a0000000000000000000003", Lt = ["6a0000000000000000000001", ae, De], ie = (e, t) => e.replace(/[?#].*$/s, "").split("/")[t] ?? "", bt = "64f0ada00000000000000002";
function is(e, t) {
  let s = ie(t, 2);
  if (!Lt.includes(s))
    return;
  let r = s === ae ? [{ id: "9a0000000000000000000002", project_id: s, user_id: bt, permission_level: "edit", created_at: f(e - 777600000), updated_at: f(e - 777600000), user: { id: bt, username: "grace", alias: "Grace" } }] : [];
  return { permissions: r, pagination: { total: r.length, page: 1, limit: 100, totalPages: r.length ? 1 : 0 } };
}
var vt = "hub-ip-203-0-113-0-24";
function ds(e, t) {
  let s = ie(t, 2);
  if (!Lt.includes(s))
    return;
  return s === "6a0000000000000000000001" ? { project: s, groups: {}, permissions: {}, default: "allow", enable_proxy: !0, schema_version: 2, file_version: 0, etag: "file:v0" } : { project: s, groups: { [vt]: { type: "ip", range: "203.0.113.0/24" } }, permissions: { [vt]: { "*": !0, logs: !0 } }, default: "deny", enable_proxy: !0, schema_version: 2, file_version: 2, etag: "file:v2" };
}
function ls(e, t) {
  let s = ie(t, 2), r = s === "5e0000000000000000000012" ? "n12" : s === "5e0000000000000000000007" ? "fra-7" : s === "5e0000000000000000000003" ? "ash-3" : null;
  return r ? { commands: [], server_info: { id: s, name: r, is_ready: !0, rental_status: "active" } } : void 0;
}
var D = (e) => Math.round(e * 1073741824), Q = (e, t) => Math.round(e / t * 1000) / 10;
function us(e, t) {
  let s = ie(t, 2), r = { ts: f(e - 4000), cache_age_ms: 4000, stale: !1 };
  if (s === "5e0000000000000000000012")
    return {
      scope: "server",
      ...r,
      uptime_s: 2257200,
      cores: 16,
      load: { 1: 0.82, 5: 0.74, 15: 0.69 },
      cpu: { busy_pct: 9.5 },
      mem: { used_bytes: D(21.3), total_bytes: D(64), pct: Q(21.3, 64) },
      swap: { used_bytes: 0, total_bytes: D(4) },
      storage: { used_bytes: D(312), total_bytes: D(1000), pct: Q(312, 1000) }
    };
  let n = (o, a, i, d, u, l, c) => ({
    scope: "subserver",
    ...r,
    health: "ok",
    cpu: { usage_cores: a, usage_pct: Q(a, o), limit_cores: o },
    mem: { used_bytes: D(d), limit_bytes: D(i), pct: Q(d, i) },
    disk: { used_bytes: D(l), limit_bytes: D(u), pct: Q(l, u) },
    pids: { current: c, max: 8192 },
    io: { read_bytes: D(l / 8), write_bytes: D(l / 20) }
  });
  if (s === "5e0000000000000000000007")
    return n(8, 1.2, 32, 9.6, 500, 140, 412);
  if (s === "5e0000000000000000000003")
    return n(4, 0.3, 8, 2.1, 160, 18, 96);
  return;
}
var cs = [
  [2, "GET", "/api/v1/computers", 200, "cli"],
  [6, "GET", "/api/v1/proxy/aliases", 200, "cli"],
  [11, "GET", "/api/v1/users/auth/me", 200, "cli"],
  [24, "GET", "/api/v1/support/tickets", 200, "web"],
  [38, "GET", "/api/v1/computers/c0a7150000000000000000a1/snapshots", 200, "web"],
  [47, "POST", "/api/v1/proxy/aliases", 409, "web"],
  [96, "POST", "/api/v1/computers/c0a7150000000000000000a1/snapshots", 201, "web"],
  [180, "GET", "/api/v1/projects", 200, "web"],
  [300, "POST", "/api/v1/support/tickets", 201, "web"],
  [1560, "POST", "/api/v1/support/tickets", 201, "web"]
], fs = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0", Pt = (e) => cs.map(([t, s, r, n, o], a) => ({
  id: `8f00000000000000000000${(a + 1).toString(16).padStart(2, "0")}`,
  user_id: "64f0ada00000000000000001",
  realm_id: null,
  method: s,
  path: r,
  status_code: n,
  ip_address: "203.0.113.24",
  user_agent: o === "cli" ? "hoody-cli" : fs,
  created_at: f(e - t * 60000)
})), Ut = [
  [95, "Snapshot of atlas is ready", "The snapshot before-upgrade of atlas is ready. You can restore it from the computer's Snapshots tab.", "SUCCESS", "STATUS_UPDATE"],
  [300, "Computer ember did not start", "ember on fra-7 did not start. Open its logs to see why, then start it again from Computers.", "ERROR", "STATUS_UPDATE"],
  [420, "Computer atlas is running", "atlas started again on n12.", "SUCCESS", "STATUS_UPDATE"],
  [422, "Computer atlas stopped", "atlas was stopped from the Hub.", "INFO", "STATUS_UPDATE"],
  [1200, "Maintenance on fra-7 finished", "fra-7 restarted for maintenance. Its computers were back within ten minutes.", "INFO", "MAINTENANCE"],
  [2880, "Computer harbor is running", "harbor finished being created and is running on ash-3.", "SUCCESS", "STATUS_UPDATE"],
  [4320, "SSH key added to atlas", "A new SSH key can now sign in to atlas.", "INFO", "STATUS_UPDATE"],
  [8640, "Computer fjord paused", "fjord was paused. Resume it from Computers when you need it again.", "INFO", "STATUS_UPDATE"]
], jt = (e) => `4e0d${(e + 1).toString(16).padStart(20, "0")}`, Bt = (e) => Ut.map(([t, s, r, n, o], a) => ({
  id: jt(a),
  title: s,
  message: r,
  severity: n,
  type: o,
  is_public: !1,
  is_global: !1,
  expires_at: null,
  created_at: f(e - t * 60000),
  updated_at: f(e - Math.max(0, t - 10) * 60000),
  is_read: !0,
  read_at: f(e - Math.max(0, t - 10) * 60000)
})), ms = (e) => ({ unread_count: 0, is_capped: !1, unread_cap: 99, latest_id: jt(0), latest_created_at: f(e - Ut[0][0] * 60000), poll_interval_seconds: 300 }), ps = ["k7m2q9xa", "maya-builds"], _s = ["hoody", "admin", "support", "referral", "staff"], ys = ["team", "help"], hs = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b" }, kt = (e) => {
  let t = (r) => r.replace(/[0-9]+$/, ""), s = (r) => r.replace(/[0-9]/g, (n) => hs[n] ?? n);
  return [e, t(e), s(e), t(s(e)), s(t(e)), t(s(t(e)))].filter((r) => r !== "");
}, gs = (e) => {
  let t = kt(e.replace(/-/g, ""));
  return t.some((s) => _s.some((r) => s.includes(r))) || [...t, ...e.split("-").flatMap(kt)].some((s) => ys.includes(s));
};
function bs(e, t) {
  let s = (new URLSearchParams(t.replace(/#.*$/s, "").split("?")[1] ?? "").get("code") ?? "").trim().toLowerCase();
  if (s.length < 4 || s.length > 20 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s))
    return { code: null, valid: !1, available: !1, reason: "REFERRAL_CODE_INVALID" };
  if (gs(s))
    return { code: s, valid: !1, available: !1, reason: "REFERRAL_CODE_RESERVED" };
  let r = ps.includes(s);
  return { code: s, valid: !0, available: !r, reason: r ? "REFERRAL_CODE_TAKEN" : null };
}
var Ft = {
  "github-token": "demo-sample-value-not-a-real-key",
  "deploy.notes": "Deploy from main after review, never Friday.",
  "db-password": '{"_enc":1,"alg":"AES-GCM-256","kdf":"PBKDF2","hash":"SHA-512","iter":600000,"salt":"MaETHXNJifSFMrhX/xguFRP7+jIIPRmBudS+B20my0I=","iv":"VN7p5GGkMMSovKOU","ct":"ypq2fSKUlfJr9FngxnsU1Pa6kOf0CT3+rRlP7O1YgoeOW/iGt6Q=","impl":"webcrypto","rng":"webcrypto"}'
}, vs = Object.freeze([
  h("/wallet/balances", () => ({ general_balance: "42.50", referral_credit: "12.40", referral_credit_owed: "0.00", ai_limit: "10.00", ai_usage: "3.18", ai_remaining: "6.82", ai_reserved: "0.00", ai_usage_status: "live" })),
  h("/wallet/payment-availability", () => ({ card: { enabled: !0, min_usd: 5, max_usd: 2000 }, crypto: { enabled: !0, min_usd: 10, max_usd: 5000 }, ai_credit_fee_bps: 0 })),
  h("/wallet/github-bonus", () => ({ enabled: !1, repo: "", amount_usd: "0.00", github_linked: !1, github_username: null, claimed: !1, identity_claimed_elsewhere: !1, claim: null, hold: null })),
  h("/subserver-plans", yt),
  h("/meta/subserver-plans", yt),
  h("/subserver-subscriptions", Q0, { total: 2, limit: 50, offset: 0 }),
  h("/servers/available", ts),
  h("/offers", () => []),
  h("/rentals", () => []),
  h("/reservations", () => [], { total: 0, limit: 200, offset: 0 }),
  h("/users/me/free-tier-status", () => ({ gate_enabled: !1, unlocked: !0, has_free_server: !0, can_claim: !1, claim_blocked_reason: "already_claimed", signup_code_failed: !1, hold: null })),
  h("/users/me/free-ai-usage", (e) => ({ servers: [{ server: { id: "5e0000000000000000000003", name: "ash-3" }, status: "ok", as_of: f(e - 120000), lanes: { chat: V(34, e), decisions: V(12, e), search: V(8, e), speech: V(0, e), transcription: V(0, e) } }], truncated: !1 })),
  h("/users/auth/me", (e) => ({
    id: "64f0ada00000000000000001",
    username: "ada",
    email: "ada@example.com",
    alias: "Ada",
    is_banned: !1,
    email_verified: !0,
    signup_method: "email",
    avatar_url: null,
    created_at: f(e - 10368000000),
    updated_at: f(e - 3456000000),
    pending_email: null,
    pending_email_expires_at: null,
    email_change_undo_until: null,
    pending_pool_invitations: 0,
    support_reply_email: !0,
    support_reply_email_stored: !1
  })),
  h("/users/auth/2fa/status", (e) => ({ enabled: !0, verified: !0, enabled_at: f(e - 3456000000), backup_codes_remaining: 8, require_for_tokens: !1 })),
  h("/users/auth/sessions", (e) => ({ sessions: [
    gt(e, "8a0000000000000000000001", { current: !0, method: "device", client: "cli", name: "Hoody CLI", agent: "hoody-cli", country: "SG", ip: "203.0.113.24", madeDays: 0, seenMin: 1 }),
    gt(e, "8a0000000000000000000002", { method: "two_factor", client: "web", name: "Firefox on Linux", agent: "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0", country: "SG", ip: "203.0.113.24", madeDays: 2, seenMin: 190 })
  ], next_cursor: null })),
  h("/users/me/security-history", ss, { metadata: { total: 4, page: 1, limit: 100, pages: 1 } }),
  h("/ip", (e) => ({ ip: "203.0.113.24", user_agent: "hoody-cli", headers: {}, referer: "", timestamp: f(e), is_logged: !1, protocol: "https", ip_info: null })),
  h("/bot-urls", () => ({ bot_urls: [], next_cursor: null })),
  h("/bot-urls/suggest-label", () => ({ label: "amber-falcon-river-k7m2q", url: "https://amber-falcon-river-k7m2q.bots.demo.invalid" })),
  h("/events", rs, void 0),
  h("/support/tickets", as),
  H("/support/tickets/:id", `/support/tickets/${Me(1)}`, os),
  h("/abuse-notices", () => [], { pagination: { page: 1, limit: 100, total: 0, has_more: !1 } }),
  H("/projects/:id/permissions", "/projects/6a0000000000000000000001/permissions", is),
  H("/projects/:id/proxy/permissions", "/projects/6a0000000000000000000001/proxy/permissions", ds),
  H("/servers/:id/available-commands", "/servers/5e0000000000000000000012/available-commands", ls),
  H("/rentals/:id/runtime", "/rentals/5e0000000000000000000012/runtime", us),
  H("/computers/:id/proxy/permissions", "/computers/c0a7150000000000000000a1/proxy/permissions", As),
  h("/users/auth/activity", Pt),
  h("/notifications", Bt),
  h("/notifications/summary", ms),
  h("/referrals/me/codes/check", bs)
]), ks = [
  { spec: "hoody-ai/hoody-free", display_name: "Hoody Free" },
  { spec: "hoody-ai/hoody-fast", display_name: "Hoody Fast" }
], ws = ["computer_binding", "gate_envelope", "session_state", "turn_idempotency"];
function Ss(e) {
  switch (e) {
    case "/version":
      return {
        version: "1.0.0",
        api_version: "1",
        supported: ["1"],
        available: ["1"],
        pinned_realm: null,
        session_protocol_version: 3,
        capabilities: ws.map((t) => ({ name: t, supported: !0, available: !0 }))
      };
    case "/health":
      return { status: "ok", service: "hoody-agent" };
    case "/computers":
      return { items: [], meta: { total: 0, page: 1, limit: 1 } };
    case "/acp/agents":
      return { report: { agents: [] } };
    case "/tools":
      return { items: [{ name: "bash", description: "Run a shell command.", read_only: !1 }, { name: "read_file", description: "Read a file.", read_only: !0 }, { name: "edit_file", description: "Change part of a file.", read_only: !1 }], meta: { total: 3 } };
    case "/hoody/auth/status":
      return { auth_active: !0, account_id: "64f0ada00000000000000001", owner_fingerprint: "demo-owner", restriction: "none", identity_unavailable: !1, last_error: null };
    case "/providers":
      return { providers: [{ id: "hoody-ai", prefix: "hoody-ai/", display_name: "Hoody AI", status: { state: "ready", via: "included" } }] };
    case "/models":
      return { models: ks };
    case "/agents":
      return { items: [{ name: "bot", model: "" }, { name: "general", model: "hoody-ai/hoody-free", is_configured_default: !0 }, { name: "researcher", model: "hoody-ai/hoody-fast" }] };
    default:
      return;
  }
}
function Zt(e, t, s) {
  if (e !== "GET")
    return null;
  let r = t.replace(/[?#].*$/s, ""), n = new URLSearchParams(t.replace(/#.*$/s, "").split("?")[1] ?? ""), o = (d, u) => {
    let l = n.get(d);
    return l !== null && l !== u;
  };
  if (r === "/proxy/aliases" && o("computer_id", "c0a7150000000000000000a1"))
    return { statusCode: 200, message: "OK", data: { aliases: [] } };
  if (r === "/vault/keys" && o("realm_id", "f1f1f1f1f1f1f1f1f1f1f1f1"))
    return { statusCode: 200, message: "OK", data: [] };
  if (r === "/vault/keys" && !n.has("realm_id"))
    return { statusCode: 200, message: "OK", data: [{ key: "hoody.realm-aliases", realm_id: "", metadata: null, size_bytes: 113, created_at: f(s - 3456000000), updated_at: f(s - 720000) }] };
  if (r === "/vault/stats" && !n.has("realm_id"))
    return { statusCode: 200, message: "OK", data: { total_keys: 1, total_size_bytes: 113, total_size_mb: 0.00010776519775390625, limit_mb: 50, used_percentage: 0, remaining_mb: 50 } };
  if (r === "/vault/stats" && o("realm_id", "f1f1f1f1f1f1f1f1f1f1f1f1"))
    return { statusCode: 200, message: "OK", data: { total_keys: 0, total_size_bytes: 0, total_size_mb: 0, limit_mb: 50, used_percentage: 0, remaining_mb: 50 } };
  let a = vs.find((d) => d.match.test(r));
  if (!a)
    return null;
  if (a.path === "/events") {
    let d = Date.parse(n.get("start_date") ?? ""), u = Date.parse(n.get("end_date") ?? ""), c = (o("computer_id", "c0a7150000000000000000a1") ? [] : a.data(s, t)).filter((p) => {
      let _ = Date.parse(p.created_at);
      return !(_ < d) && !(_ > u);
    });
    return { statusCode: 200, message: "OK", data: { events: c, pagination: { total: c.length, limit: 200, offset: 0, has_more: !1, next_cursor: null, latest_cursor: null } } };
  }
  if (a.path === "/users/auth/activity") {
    let d = Date.parse(n.get("start_date") ?? ""), u = Date.parse(n.get("end_date") ?? ""), l = Number(n.get("min_status")) || 0, c = (n.get("method") ?? "").toUpperCase(), p = Number(n.get("limit")) || 50, _ = Pt(s).filter((A) => {
      let k = Date.parse(A.created_at);
      return !(k < d) && !(k > u) && A.status_code >= l && (!c || A.method === c);
    });
    return { statusCode: 200, message: "OK", ...{ metadata: { total: _.length, page: 1, limit: p, pages: 1 } }, data: (Number(n.get("page")) || 1) > 1 ? [] : _.slice(0, p) };
  }
  if (a.path === "/notifications") {
    let d = Number(n.get("limit")) || 20, u = Number(n.get("page")) || 1, l = Bt(s).filter((p) => n.get("unread_only") === "true" ? !p.is_read : n.get("read_only") === "true" ? p.is_read : !0);
    return { statusCode: 200, message: "OK", ...{ pagination: { total: l.length, page: u, limit: d, totalPages: Math.ceil(l.length / d), next_cursor: null } }, data: l.slice((u - 1) * d, u * d) };
  }
  let i = a.data(s, t);
  if (i === void 0)
    return null;
  return { statusCode: 200, message: "OK", ...a.extra ?? {}, data: i };
}
var Ts = /^([0-9a-f]{24})-([0-9a-f]{24})-([a-z]+)-(\d+)\.[a-z0-9-]+\.demo\.invalid$/, wt = "f2f2f2f2f2f2f2f2f2f2f2f2", de = "c0a7150000000000000000b2", K = "c0a715000000000000000107", Gt = "c0a715000000000000000118", $t = "c0a7150000000000000000c3", Ht = "c0a7150000000000000000d4", Yt = "c0a7150000000000000000e5", Kt = "c0a7150000000000000000f6", mn = {
  ["c0a7150000000000000000a1"]: "atlas",
  [de]: "borealis",
  [$t]: "cedar",
  [Ht]: "dune",
  [Yt]: "ember",
  [Kt]: "fjord",
  [K]: "granite",
  [Gt]: "harbor"
}, zt = {
  ["c0a7150000000000000000a1"]: { project: "6a0000000000000000000001", version: 3, deny: !0, ranges: ["198.51.100.0/24", "203.0.113.0/24"] },
  [de]: { project: ae, version: 2, ranges: ["192.0.2.0/24"] },
  [$t]: { project: "6a0000000000000000000001", version: 0 },
  [Ht]: { project: De, version: 1, deny: !0, mine: "203.0.113.24" },
  [Yt]: { project: ae, version: 1, proxyOff: !0 },
  [Kt]: { project: "6a0000000000000000000001", version: 0 },
  [K]: { project: ae, version: 2, deny: !0, ranges: ["203.0.113.0/24"] },
  [Gt]: { project: De, version: 1, deny: !0, ranges: ["198.51.100.0/24"] }
}, Wt = (e) => {
  let t = zt[e];
  return t === void 0 ? void 0 : t.version > 0 ? "applied" : "missing";
};
function As(e, t) {
  let s = ie(t, 2), r = zt[s];
  if (!r)
    return;
  let n = {}, o = {}, a = (i, d) => {
    n[i] = { type: "ip", range: d }, o[i] = { "*": !0, logs: !0 };
  };
  if (r.mine)
    a("hub-my-ip", `${r.mine}/32`);
  for (let i of r.ranges ?? [])
    a(`hub-ip-${i.replace(/[./]/g, "-")}`, i);
  return {
    project: r.project,
    computer: s,
    groups: n,
    permissions: o,
    default: r.deny ? "deny" : "inherit",
    ...r.proxyOff ? { enable_proxy: !1 } : {},
    hooks: {},
    schema_version: 2,
    file_version: r.version,
    etag: `file:v${r.version}`
  };
}
var qt = [
  { computer: "c0a7150000000000000000a1", id: "support-desk", uid: "0193a1f0-7c11-4a52-9c1e-5b1a2f3c4d01", realm: "f1f1f1f1f1f1f1f1f1f1f1f1", role: "Answers support mail", session: "s-support-desk", running: !0, atLimit: !1, lastMin: 4, madeDays: 34, instructions: "Answer support mail politely and briefly. Tag anything about refunds for me." },
  { computer: "c0a7150000000000000000a1", id: "release-notes", uid: "0193a1f0-7c11-4a52-9c1e-5b1a2f3c4d02", realm: "f1f1f1f1f1f1f1f1f1f1f1f1", role: "Drafts release notes", session: "s-release-notes", running: !1, atLimit: !1, lastMin: 1560, madeDays: 21, instructions: "Each week, draft release notes from the merged changes and save them in notes/." },
  { computer: de, id: "inbox-triage", uid: "0193a1f0-7c11-4a52-9c1e-5b1a2f3c4d03", realm: wt, role: "Sorts the shared inbox", session: "s-inbox-triage", running: !0, atLimit: !1, lastMin: 12, madeDays: 12, instructions: "Sort the shared inbox into sales, support and other, and flag anything urgent." },
  { computer: K, id: "order-watch", uid: "0193a1f0-7c11-4a52-9c1e-5b1a2f3c4d04", realm: wt, role: "Watches new orders", session: "s-order-watch", running: !1, atLimit: !0, lastMin: 4320, madeDays: 9, instructions: "Watch new orders and tell me when one is paid but not shipped within a day." }
], Xt = (e, t) => ({
  id: e.id,
  uid: e.uid,
  name: e.id,
  role: e.role,
  realm: e.realm,
  model: "hoody-ai/hoody-free",
  session_id: e.session,
  turn_running: e.running,
  queued: 0,
  last_activity: f(t - e.lastMin * 60000),
  autonomy: { used: e.atLimit ? 20 : 3, max: 20 },
  channels: []
}), Es = (e, t) => ({
  ...Xt(e, t),
  instructions: e.instructions,
  yolo: !1,
  guardrails: "",
  guardrail_check: "strict",
  revision: 1,
  routing: { mode: "off" },
  async: !1,
  wait_seconds: 0,
  open_delegates: 0,
  created: f(t - e.madeDays * 86400000)
}), xs = {
  "support-desk": [
    ["user", 180, "Answer the new support mail and tag anything about refunds for me."],
    ["bot", 176, 'Done: 6 messages answered. 2 are tagged "refund" for you to look at.'],
    ["user", 30, "Thanks. Keep the replies short, three sentences at most."],
    ["bot", 4, "Understood. Every reply stays at three sentences or fewer."]
  ],
  "release-notes": [
    ["user", 1566, "Draft the release notes for this week."],
    ["bot", 1560, "The draft is in notes/release-1.4.md: 3 new features and 2 fixes, each with one line."]
  ],
  "inbox-triage": [
    ["user", 120, "Sort what came in this morning."],
    ["bot", 117, "14 messages sorted: 5 sales, 7 support, 2 other. One support message is marked urgent."],
    ["bot", 12, "3 new messages sorted into support."]
  ],
  "order-watch": [
    ["bot", 4360, "Order 1042 is paid and was shipped the same day."],
    ["bot", 4320, "Order 1043 is paid but not shipped after a day. I have reached my limit of actions and wait for you."]
  ]
}, Rs = (e, t) => ({
  items: (xs[e.id] ?? []).map(([s, r, n], o) => ({ seq: o + 1, role: s, text: n, at: f(t - r * 60000) })),
  has_more: !1
}), Os = {
  settings: {},
  effective: { lang: { value: "en", source: "default" }, max_channels: { value: 4, source: "default" }, rate_bot_per_day: { value: 200, source: "default" }, channels_paused: { value: !1, source: "default" } }
};
function Is(e, t, s, r) {
  let n = /^\/bots\/([a-z0-9-]+)(\/[a-z-]+)?$/.exec(t), o = n ? qt.find((a) => a.computer === e && a.id === n[1] && (s === null || s === "all" || s === a.realm)) : void 0;
  if (!n || !o)
    return;
  switch (n[2]) {
    case void 0:
      return Es(o, r);
    case "/log":
      return Rs(o, r);
    case "/archive":
      return { items: [], has_more: !1 };
    case "/delegates":
      return { items: [], meta: { total: 0 } };
    case "/channels":
      return { items: [] };
    case "/channel-settings":
      return Os;
    default:
      return;
  }
}
var St = {
  ["c0a7150000000000000000a1"]: [["Weekly plan", "Work", 12], ["Deploy checklist", "Work", 95], ["Reading list", "Personal", 420], ["Meeting notes: storefront review", "Work", 1560], ["Trip ideas", "Personal", 5760, !1], ["Backup schedule", "Projects", 12960]],
  [de]: [["Staging release notes", "Work", 40], ["Customer feedback", "Work", 300], ["Launch timeline", "Projects", 4320]],
  [K]: [["Order export format", "Work", 180], ["Weekly report outline", "Work", 2880]]
}, Tt = (e) => `0a1b2c3d4e5f6a7b8c9d${e.toString(16).padStart(4, "0")}`, Ns = (e) => `0b${e.slice(2)}`;
function Ds(e, t, s) {
  let r = Ns(e);
  if (t === "/capabilities")
    return { service: "hoody-notes", version: "1", features: ["recent"] };
  if (t === "/me")
    return { userId: "64f0ada00000000000000001", notebookId: r, role: "owner" };
  if (t !== `/notebooks/${r}/recent`)
    return;
  let n = Object.keys(St).indexOf(e) + 1;
  return {
    notebookId: r,
    partial: !1,
    create: { parentId: Tt(n * 256), sectionName: "Work" },
    items: (St[e] ?? []).map(([o, a, i, d], u) => ({ nodeId: Tt(n * 256 + u + 1), name: o, sectionName: a, changedAt: f(s - i * 60000), hasBody: d !== !1 }))
  };
}
var Ms = [
  { computer: "c0a7150000000000000000a1", id: "5c7e0a10-3b1d-4f6a-9d21-0c5b7a9e1f01", name: "Nightly backup", cron: "0 2 * * *", human: "Every day at 02:00", command: "restic backup ~/projects", enabled: !0, lastMin: 420, exit: 0, everyMin: 1440 },
  { computer: K, id: "5c7e0a10-3b1d-4f6a-9d21-0c5b7a9e1f02", name: "Weekly sales report", cron: "0 8 * * 1", human: "Every Monday at 08:00", command: "python3 reports/weekly.py", enabled: !0, lastMin: 4320, exit: 1, everyMin: 10080 },
  { computer: de, id: "5c7e0a10-3b1d-4f6a-9d21-0c5b7a9e1f03", name: "Renew certificates", cron: "30 4 1 * *", human: "On day 1 of every month at 04:30", command: "certbot renew", enabled: !1, lastMin: 31680, exit: 0, everyMin: 43200 }
], Cs = ["entries_all", "next_runs", "history_persisted"], At = (e) => e.lastMin + 43200;
function Ls(e, t, s, r) {
  if (t === "/health")
    return { status: "ok" };
  if (t === "/info")
    return { service: "hoody-cron", features: Cs, utc_offset_seconds: 0 };
  let n = Ms.filter((i) => i.computer === e), o = (i, d = 0) => {
    let u = r - (i.lastMin + d * i.everyMin) * 60000;
    return { run_id: d === 0 ? `r-${i.id.slice(-4)}` : `r-${i.id.slice(-4)}-${d}`, entry_id: i.id, user: "user", status: "finished", started_at: f(u), finished_at: f(u + 42000), exit_code: d === 0 ? i.exit : 0 };
  };
  if (t === "/runs")
    return { runs: n.filter((d) => s.get("entry_id") === null || s.get("entry_id") === d.id).flatMap((d) => Array.from({ length: 20 }, (u, l) => l).filter((u) => d.lastMin + u * d.everyMin < At(d)).map((u) => o(d, u))).sort((d, u) => Date.parse(u.started_at) - Date.parse(d.started_at)).slice(0, Math.min(Math.max(Math.floor(Number(s.get("limit") ?? 100)) || 100, 1), 500)) };
  let a = /^\/users\/user\/entries\/([0-9a-f-]{36})$/.exec(t);
  if (a) {
    let i = n.find((u) => u.id === a[1]);
    if (!i)
      return;
    let d = f(r - At(i) * 60000);
    return {
      id: i.id,
      user: "user",
      revision: i.id.replace(/-/g, "").padEnd(64, "0"),
      name: i.name,
      comment: null,
      schedule: i.cron,
      schedule_human: i.human,
      command: i.command,
      enabled: i.enabled,
      expired: !1,
      expires_at: null,
      created_at: d,
      updated_at: d,
      revision_seen_at: d,
      run_reports: !0,
      tz_override: !1,
      next_runs: i.enabled ? [f(r - i.lastMin * 60000 + i.everyMin * 60000)] : null,
      last_run: o(i)
    };
  }
  if (t !== "/entries")
    return;
  return {
    total: n.length,
    job_lines: 0,
    unreadable_users: [],
    entries: n.map((i) => ({
      type: "managed",
      user: "user",
      id: i.id,
      name: i.name,
      command: i.command,
      schedule: i.cron,
      schedule_human: i.human,
      enabled: i.enabled,
      next_runs: i.enabled ? [f(r - i.lastMin * 60000 + i.everyMin * 60000)] : [],
      last_run: o(i)
    }))
  };
}
var Jt = [
  { computer: "c0a7150000000000000000a1", file: "deploy-site.ts", label: "Deploy site", about: "Builds the site and puts it online." },
  { computer: "c0a7150000000000000000a1", file: "rotate-logs.ts", label: "Rotate logs", about: "Archives old logs." },
  { computer: K, file: "stock-check.ts", label: "Stock check", about: "Counts what is left in the shop." }
], Ce = {
  "deploy-site.ts": [[48, "POST", 200, 11840], [135, "POST", 200, 12310], [330, "POST", 200, 10920], [545, "POST", 200, 13400], [1120, "POST", 200, 11250], [1330, "POST", 200, 12060]],
  "rotate-logs.ts": [[390, "POST", 200, 340]],
  "stock-check.ts": Array.from({ length: 24 }, (e, t) => t === 9 || t === 10 ? [10 + t * 57, "GET", 500, 180 + t, "Error: shop answered 503"] : [10 + t * 57, "GET", 200, 380 + t * 37 % 90])
}, ee = 3600000, Vt = (e) => e >= 500 ? "failed" : e === 401 || e === 403 ? "turned_away" : "ok", Le = (e) => `/${e.file.replace(/\.ts$/, "")}`, Qt = (e, t) => (Ce[e.file] ?? []).map(([s, r, n, o, a], i, d) => ({
  executionId: `exec-${e.file.replace(/\.ts$/, "")}-${d.length - i}`,
  receivedAt: f(t - s * 60000),
  method: r,
  path: Le(e),
  status: n,
  durationMs: o,
  outcome: Vt(n),
  ...a ? { error: a } : {}
})), Et = (e, t) => e.length === 0 ? null : e[Math.ceil(t / 100 * e.length) - 1], xt = (e) => {
  let t = e.map((s) => s[3]).sort((s, r) => s - r);
  return { calls: e.length, failed: e.filter((s) => Vt(s[2]) === "failed").length, p50Ms: Et(t, 50), p95Ms: Et(t, 95) };
};
function Ps(e, t, s) {
  let r = Math.floor(s / ee) * ee - 23 * ee, n = (Ce[e.file] ?? []).filter((a) => s - a[0] * 60000 >= r), o = Array.from({ length: 24 }, (a, i) => {
    let d = r + i * ee;
    return { start: f(d), ...xt(n.filter((u) => s - u[0] * 60000 >= d && s - u[0] * 60000 < d + ee)) };
  });
  return { scriptPath: t, hours: o, totals: xt(n), coverage: { complete: !0, sampled: n.length } };
}
function Us(e, t, s, r) {
  let n = Date.parse(s.get("since") ?? ""), o = Date.parse(s.get("until") ?? ""), a = Qt(e, r), i = a.filter((c) => (s.get("status") !== "failed" || c.outcome === "failed") && !(Date.parse(c.receivedAt) < n) && !(Date.parse(c.receivedAt) > o)), d = s.get("before");
  if (d) {
    let c = i.findIndex((p) => p.executionId === d);
    i = c < 0 ? [] : i.slice(c + 1);
  }
  let u = Math.min(Math.max(Math.floor(Number(s.get("limit") ?? 50)) || 50, 1), 500), l = i.slice(0, u);
  return { scriptPath: t, resolvedPath: `default/1/${e.file}`, executions: l, next: i.length > u ? l[l.length - 1].executionId : null, coverage: { since: a[a.length - 1]?.receivedAt ?? null, logging: "on" } };
}
var js = ["revisions", "history", "env", "executions", "tests", "publishable"], Bs = {
  "deploy-site.ts": { rev: "d3e1a7c09b4f6215", madeDays: 30, savedDays: 2, text: [
    "// @label Deploy site",
    "// @description Builds the site and puts it online.",
    'import { $ } from "bun";',
    "",
    'const SITE = "/home/ada/projects/site";',
    "",
    "export default async function () {",
    "  await $`npm run build`.cwd(SITE);",
    "  await $`cp -r dist/. /srv/app/public/`.cwd(SITE);",
    "  return Response.json({ deployed: true, at: new Date().toISOString() });",
    "}",
    ""
  ].join(`
`) },
  "rotate-logs.ts": { rev: "6a0e9d3b71c4f282", madeDays: 14, savedDays: 14, text: [
    "// @label Rotate logs",
    "// @description Archives old logs.",
    'import { mkdir, readdir, rename, stat } from "node:fs/promises";',
    "",
    'const LOGS = "/var/log";',
    'const ARCHIVE = "/var/log/archive";',
    "const WEEK = 7 * 24 * 60 * 60 * 1000;",
    "",
    "export default async function () {",
    "  await mkdir(ARCHIVE, { recursive: true });",
    "  const archived: string[] = [];",
    "  for (const name of await readdir(LOGS)) {",
    '    if (!name.endsWith(".log")) continue;',
    '    const { mtimeMs } = await stat(LOGS + "/" + name);',
    "    if (Date.now() - mtimeMs < WEEK) continue;",
    '    await rename(LOGS + "/" + name, ARCHIVE + "/" + name);',
    "    archived.push(name);",
    "  }",
    "  return Response.json({ archived });",
    "}",
    ""
  ].join(`
`) },
  "stock-check.ts": { rev: "b85d2f1c6e07a493", madeDays: 20, savedDays: 3, text: [
    "// @label Stock check",
    "// @description Counts what is left in the shop.",
    'const SHOP = "https://shop.example.com/api/products";',
    "",
    "export default async function () {",
    '  const res = await fetch(SHOP, { headers: { authorization: "Bearer " + process.env.SHOP_API_KEY } });',
    '  if (!res.ok) throw new Error("shop answered " + res.status);',
    "  const products: Array<{ name: string; left: number }> = await res.json();",
    "  const low = products.filter((p) => p.left < 5).map((p) => p.name);",
    "  return Response.json({ left: products.reduce((n, p) => n + p.left, 0), low });",
    "}",
    ""
  ].join(`
`) }
}, P = (e, t, s, r, n = null, o = null, a = {}) => ({ key: e, directive: `@${e}`, category: t, type: s, description: r, defaults: { when_omitted: null, runtime: n, sdk_import: o }, ...a }), Ne = [
  P("enabled", "execution", "boolean", "Enable or disable script execution.", !0),
  P("token", "auth", "string|string[]", "Shared secret token for endpoint authentication. Repeatable: a request carrying any listed token passes.", null, null, { repeatable: !0 }),
  P("mode", "execution", "enum", "Execution model for the script.", "serverless", "serverless", { enum_values: ["worker", "serverless"] }),
  P("timeout", "execution", "integer", "Script timeout. A bare number is milliseconds; a unit suffix is honoured (90s, 5m). 0 disables it.", 3600000, 30000, { range: { min: 0, max: 2147483647 } }),
  P("log-level", "logging", "enum", "Logging verbosity.", "standard", "standard", { enum_values: ["none", "minimal", "standard", "full", "debug"] }),
  P("description", "metadata", "string", "Human-readable description for the script."),
  P("label", "metadata", "string", "Short label used for classification/filtering."),
  P("schedule", "execution", "string", "Cron expression (minute hour day month weekday) that also runs the script on a schedule.")
], Fs = {
  schema_version: "1.0.0",
  total_fields: Ne.length,
  parse_window_lines: 30,
  unknown_keys_behavior: "ignored-by-serializer",
  defaults_context: {
    when_omitted: "Value represented when directive is absent from parsed magic comments.",
    runtime: "Effective runtime value applied by hoody-exec when directive is omitted.",
    sdk_import: "Default value written into generated proxy scripts during SDK import."
  },
  categories: Object.fromEntries(["execution", "logging", "cors", "ai", "metadata", "auth", "remote"].map((e) => [e, Ne.filter((t) => t.category === e).map((t) => t.key)])),
  fields: Ne
};
function Rt(e, t) {
  let s = { version: 1, revision: [...e.rev].reverse().join(""), savedAt: f(t - e.madeDays * 86400000), text: e.text.split(`
`).filter((r) => !r.startsWith("// @description ")).join(`
`) };
  if (e.madeDays === e.savedDays)
    return [{ ...s, revision: e.rev, text: e.text }];
  return [{ version: 2, revision: e.rev, savedAt: f(t - e.savedDays * 86400000), text: e.text }, { ...s, replacedBy: e.rev }];
}
function Zs(e, t, s, r) {
  let n = Jt.filter((l) => l.computer === e), o = (l) => `default/1/${l.file}`;
  if (t === "/health")
    return { status: "ok", now: f(r), features: js };
  if (t === "/scripts/list")
    return { scripts: n.map((l) => ({ path: o(l), type: "file", magicComments: { label: l.label, description: l.about } })) };
  if (t === "/monitor/scripts-summary")
    return { scripts: n.map((l) => {
      let c = Qt(l, r);
      return { scriptPath: o(l), calls: c.length, failed: c.filter((p) => p.outcome === "failed").length, lastOutcome: c[0]?.outcome ?? null };
    }) };
  if (t === "/scripts/history/deleted")
    return { entries: [] };
  if (t === "/schedules/list")
    return { schedules: [] };
  if (t === "/magic-comments/schema")
    return Fs;
  let a = s.get("path") ?? s.get("scriptPath"), i = a === null ? void 0 : n.find((l) => a === o(l) || a === l.file), d = i ? Bs[i.file] : void 0;
  if (!i || !d || a === null)
    return;
  let u = { label: i.label, description: i.about, tokens: [] };
  if (t === "/scripts/read")
    return {
      path: a,
      resolvedPath: o(i),
      content: d.text,
      magicComments: u,
      revision: d.rev,
      metadata: { size: d.text.length, created: f(r - d.madeDays * 86400000), modified: f(r - d.savedDays * 86400000), isDirectory: !1, extension: ".ts" }
    };
  if (t === "/magic-comments/read")
    return { path: a, resolvedPath: o(i), comments: u, warnings: [], revision: d.rev };
  if (t === "/monitor/script-usage")
    return Ps(i, a, r);
  if (t === "/logs/executions")
    return Us(i, a, s, r);
  if (t === "/scripts/history")
    return { versions: Rt(d, r).map((l) => ({ version: l.version, revision: l.revision, savedAt: l.savedAt, ...l.replacedBy ? { replacedBy: l.replacedBy } : {} })) };
  if (t === "/scripts/history/read") {
    let l = Rt(d, r).find((c) => String(c.version) === s.get("version"));
    return l ? { path: a, resolvedPath: o(i), content: l.text, magicComments: { label: i.label, ...l.text.includes("// @description ") ? { description: i.about } : {}, tokens: [] }, revision: l.revision } : void 0;
  }
  if (t === "/env/keys") {
    let l = [...new Set([...d.text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)].map((c) => c[1]))];
    return {
      files: [
        { scope: "script", rel: `default/1/${i.file.replace(/\.ts$/, ".env")}`, exists: l.length > 0, revision: l.length > 0 ? d.rev.slice(0, 8) : null, keys: l.map((c) => ({ name: c })) },
        { scope: "folder", rel: "default/1/.env", exists: !1, revision: null, keys: [] },
        { scope: "computer", exists: !1, revision: null, keys: [] }
      ],
      effective: l.map((c) => ({ name: c, from: "script" }))
    };
  }
  if (t === "/tests/list")
    return i.file === "stock-check.ts" ? { revision: d.rev.slice(8), cases: [{ id: "c1", name: "answers with what is left", method: "GET", route: Le(i), expect: { status: 200, contains: '"left"' } }] } : { revision: null, cases: [] };
  return;
}
var Gs = {
  ["c0a7150000000000000000a1"]: [
    [52, 3000, "GET", "/", 200, 6, "203.0.113.24"],
    [51, 3000, "GET", "/style.css", 200, 2, "203.0.113.24"],
    [44, 8000, "GET", "/health", 200, 2, "198.51.100.7"],
    [27, 3000, "GET", "/wp-login.php", 404, 2, "203.0.113.200"],
    [12, 8000, "GET", "/orders", 200, 21, "198.51.100.7"],
    [9, 3000, "GET", "/", 200, 5, "203.0.113.81"],
    [3, 3000, "GET", "/index.html", 200, 3, "203.0.113.81"]
  ]
}, $s = { "deploy-site.ts": "198.51.100.23", "rotate-logs.ts": "198.51.100.23", "stock-check.ts": "203.0.113.140" }, Hs = ["filters2", "beforeId", "buckets", "retention"], e0 = { hours: 168, maxRows: 50000, maxBytes: 104857600 };
function Ys(e, t) {
  let s = [1, 2, 3, 4].map((r) => (Math.imul(t * 7919 + r * 104729 + Number.parseInt(e.slice(-4), 16), 2654435761) >>> 0).toString(16).padStart(8, "0")).join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-8${s.slice(17, 20)}-${s.slice(20, 32)}`;
}
function t0(e, t) {
  return [
    ...(Gs[e] ?? []).map(([r, n, o, a, i, d, u]) => ({ tsMs: t - r * 60000, serviceName: "http", serviceIndex: n, method: o, url: a, status: i, durationMs: d, clientIp: u })),
    ...Jt.filter((r) => r.computer === e).flatMap((r) => (Ce[r.file] ?? []).map(([n, o, a, i]) => ({ tsMs: t - n * 60000, serviceName: "exec", serviceIndex: 1, method: o, url: Le(r), status: a, durationMs: i + 4, clientIp: $s[r.file] ?? "198.51.100.23" })))
  ].sort((r, n) => r.tsMs - n.tsMs).map((r, n) => ({
    id: n + 1,
    tsIso: f(r.tsMs),
    kind: "request",
    level: r.status >= 500 ? "error" : r.status >= 400 ? "warn" : "info",
    source: "edge",
    computerId: e,
    traceId: Ys(e, n + 1),
    ...r
  }));
}
function s0(e, t) {
  let s = (d) => t.get(d) === null || t.get(d) === "" ? null : Number(t.get(d)), r = (d) => t.get(d) === null || t.get(d) === "" ? null : t.get(d), n = s("sinceMs"), o = s("untilMs"), a = s("minStatus"), i = s("status");
  if (n !== null && e.tsMs < n)
    return !1;
  if (o !== null && e.tsMs > o)
    return !1;
  if (r("source") !== null && e.source !== r("source"))
    return !1;
  if (r("kind") !== null && e.kind !== r("kind"))
    return !1;
  if (r("serviceName") !== null && e.serviceName !== r("serviceName"))
    return !1;
  if (r("excludeService") !== null && e.serviceName === r("excludeService"))
    return !1;
  if (r("level") !== null && !r("level").split(",").includes(e.level))
    return !1;
  if (a !== null && !(e.status >= a))
    return !1;
  if (r("path") !== null && !e.url.toLowerCase().includes(r("path").toLowerCase()))
    return !1;
  if (i !== null && e.status !== i)
    return !1;
  if (r("traceId") !== null && e.traceId !== r("traceId").toLowerCase())
    return !1;
  if (r("method") !== null && e.method !== r("method"))
    return !1;
  if (r("botUrl") !== null)
    return !1;
  return !0;
}
function Ks(e, t, s) {
  let r = t0(e, s), n = r.filter((l) => s0(l, t)), o = Math.min(Math.max(Math.floor(Number(t.get("limit") ?? 100)) || 100, 1), 1000), a = t.get("afterId"), i = t.get("beforeId"), d = a !== null ? n.filter((l) => l.id > Number(a)).slice(0, o) : i !== null ? n.filter((l) => l.id < Number(i)).reverse().slice(0, o) : n.slice().reverse().slice(0, o), u = r[0];
  return {
    entries: d,
    total: n.length,
    limit: o,
    offset: 0,
    bodiesOmitted: !0,
    newestId: r.length > 0 ? r[r.length - 1].id : null,
    retained: u ? { oldestId: u.id, oldestTsMs: u.tsMs } : null,
    retention: { ...e0 }
  };
}
function zs(e, t, s) {
  let r = t0(e, s).filter((p) => s0(p, t)), n = Math.max(1, Number(t.get("bucketMs") || 60000)), o = Number(t.get("sinceMs") || (r[0] ? r[0].tsMs : 0)), a = t.get("untilMs") ? Number(t.get("untilMs")) : r.length > 0 ? r[r.length - 1].tsMs : o, i = Math.max(0, Math.min(500, Math.floor((a - o) / n))) + 1, d = (p, _) => {
    p[_] = (p[_] ?? 0) + 1;
  }, u = {}, l = {}, c = Array.from({ length: i }, (p, _) => ({ startMs: o + _ * n, byLevel: {}, byStatusClass: {} }));
  for (let p of r) {
    let _ = `${Math.floor(p.status / 100)}xx`;
    d(u, p.level), d(l, _);
    let g = c[Math.max(0, Math.floor((p.tsMs - o) / n))];
    if (g)
      d(g.byLevel, p.level), d(g.byStatusClass, _);
  }
  return { features: Hs, total: r.length, byLevel: u, byStatusClass: l, buckets: c, retention: { ...e0 } };
}
var Ws = "ELF\x02\x01\x01\x00", qs = {
  "/": { dirs: ["bin", "etc", "home", "srv", "tmp", "usr", "var"] },
  "/bin": { dirs: [], files: [["bash", 1265648], ["cat", 44016], ["ls", 151344]] },
  "/etc": { dirs: ["nginx"], files: [["hostname", 6], ["hosts", 158]] },
  "/etc/nginx": { dirs: [], files: [["nginx.conf", 412]] },
  "/home": { dirs: ["ada"] },
  "/home/ada": { dirs: ["notes", "projects"], files: [["todo.txt", 118]] },
  "/home/ada/notes": { dirs: [], files: [["release-1.4.md", 236]] },
  "/home/ada/projects": { dirs: ["site"], files: [["README.md", 164]] },
  "/home/ada/projects/site": { dirs: [], files: [["config.yaml", 96], ["deploy.sh", 121], ["index.html", 233]] },
  "/srv": { dirs: ["app"] },
  "/srv/app": { dirs: ["public"], files: [["package.json", 141], ["server.js", 297]] },
  "/srv/app/public": { dirs: [], files: [["index.html", 233], ["style.css", 88]] },
  "/tmp": { dirs: [] },
  "/usr": { dirs: ["bin", "lib", "share"] },
  "/usr/bin": { dirs: [], files: [["env", 43976], ["node", 98112400], ["python3", 6634256]] },
  "/usr/lib": { dirs: [] },
  "/usr/share": { dirs: [] },
  "/var": { dirs: ["log"] },
  "/var/log": { dirs: [], files: [["syslog", 312]] }
}, Xs = {
  "/": { dirs: ["home", "srv", "tmp"] },
  "/home": { dirs: ["ada"] },
  "/home/ada": { dirs: [], files: [["todo.txt", 118]] },
  "/srv": { dirs: [] },
  "/tmp": { dirs: [] }
}, Pe = {
  hostname: `atlas
`,
  hosts: `127.0.0.1 localhost
::1 localhost
10.0.0.12 atlas
`,
  "nginx.conf": `server {
    listen 8080;
    root /srv/app/public;
    location /api/ {
        proxy_pass http://localhost:3000;
    }
}
`,
  "todo.txt": `- Renew the shop certificate
- Check the weekly sales report
- Answer the storefront review notes
`,
  "release-1.4.md": `# Release 1.4

## New
- Search in the shop
- Gift cards
- Order export

## Fixed
- Prices on the cart page
- Slow checkout on phones
`,
  "README.md": `# Projects

site/ is the shop's web site. Run deploy.sh to put it online.
`,
  "config.yaml": `name: shop
port: 3000
log_level: info
`,
  "deploy.sh": `#!/bin/sh
set -e
npm run build
cp -r dist/* /srv/app/public/
echo "Site deployed"
`,
  "index.html": `<!doctype html>
<html lang="en">
<head><title>Shop</title><link rel="stylesheet" href="style.css"></head>
<body><h1>Welcome to the shop</h1></body>
</html>
`,
  "style.css": `body { font-family: sans-serif; margin: 2rem; }
h1 { color: #2a6; }
`,
  "package.json": `{
  "name": "shop",
  "version": "1.4.0",
  "scripts": { "start": "node server.js" }
}
`,
  "server.js": `const http = require("node:http");
const port = 3000;
http.createServer((req, res) => {
  res.end("Shop API is running");
}).listen(port);
`,
  syslog: `atlas systemd[1]: Started Daily backup.
atlas systemd[1]: Finished Daily backup.
atlas cron[412]: (user) CMD (restic backup ~/projects)
`
}, Js = (e) => Pe[e] === void 0 || e.endsWith(".sh");
function Vs(e, t, s) {
  let r = e === "c0a7150000000000000000a1" ? qs : Xs, n = (d) => (r[d]?.dirs.length ?? 0) + (r[d]?.files?.length ?? 0), o = (d, u) => [
    ...u.dirs.map((l, c) => ({ name: l, dir: !0, size: n(d === "/" ? `/${l}` : `${d}/${l}`), at: s - (c + 2) * 86400000 })),
    ...(u.files ?? []).map(([l, c], p) => ({ name: l, dir: !1, size: c, at: s - (p + 1) * 3 * 3600000 }))
  ];
  if (t.pathname === "/" && t.searchParams.has("json") && [...t.searchParams.keys()].length === 1)
    return { body: {
      kind: "Index",
      href: "/",
      uri_prefix: "/",
      allow_upload: !0,
      allow_delete: !0,
      allow_search: !0,
      allow_archive: !0,
      allow_remote: !1,
      auth: !1,
      user: null,
      dir_exists: !0,
      remote_mounts: null,
      paths: o("/", r["/"]).map((d) => ({ path_type: d.dir ? "Dir" : "File", name: d.name, mtime: d.at, size: d.size }))
    } };
  if (!t.pathname.startsWith("/api/v1/files/"))
    return;
  let a = "/" + t.pathname.slice(14).split("/").filter(Boolean).map(decodeURIComponent).join("/"), i = [...t.searchParams.keys()];
  if (i.length === 0) {
    let d = r[a];
    if (!d)
      return;
    let u = o(a, d).map((l) => ({ name: l.name, is_dir: l.dir, size: l.dir ? 0 : l.size, modified: Math.floor(l.at / 1000), type: l.dir ? "dir" : "file", mode: l.dir || Js(l.name) ? "755" : "644" }));
    return { body: { path: a, count: u.length, skipped: [], entries: u } };
  }
  if (i.length === 1 && i[0] === "q") {
    let d = (t.searchParams.get("q") ?? "").toLowerCase();
    if (!r[a] || a === "/" || !d)
      return;
    let u = [], l = (c) => {
      for (let p of o(c, r[c])) {
        let _ = `${c}/${p.name}`;
        if (p.name.toLowerCase().includes(d))
          u.push({ name: _, is_dir: p.dir, size: p.dir ? 0 : p.size, modified: Math.floor(p.at / 1000) });
        if (p.dir && r[_])
          l(_);
      }
    };
    return l(a), { body: { path: a, count: u.length, entries: u } };
  }
  if (i.length === 1 && i[0] === "lines") {
    let d = a.slice(a.lastIndexOf("/") + 1);
    if (!r[a.slice(0, a.lastIndexOf("/")) || "/"]?.files?.some(([l]) => l === d))
      return;
    return { body: Pe[d] ?? Ws, type: "text/plain; charset=utf-8" };
  }
  return;
}
var r0 = { table_present: !1, chain: null, rules: [] }, Qs = { success: !0, configured: null, rev: null, effective: null, live: r0, firewall: "none", problems: [] }, er = {
  success: !0,
  configured: { process: { max_memory: "512M", max_pids: 256, private_tmp: !0 } },
  rev: "5d2e8a41c7b0",
  effective: { bwrap_argv: [], scope_argv: ["<process-limit runner>", "<limits: max_memory 512M, max_pids 256>", "<program argv>"] },
  live: r0,
  firewall: "none",
  problems: []
}, tr = ["1"], sr = { status: "ok", sandbox: { bwrap: !0, nft: !0, systemd_run: !0, landlock_abi: 6, bwrap_version: "0.12.0", bwrap_tmpfs_size: !0, firewall: "ok" } }, rr = [
  { id: 1, name: "web", command: "node /srv/app/server.js", boot: !0, autorestart: !0 },
  { id: 2, name: "api", command: "node /srv/app/api.js", ports: [8000, 8003] },
  { id: 3, name: "worker", command: "python3 worker/main.py", boot: !0, autorestart: !0 },
  { id: 4, name: "nightly-sync", command: "sh bin/nightly-sync.sh", autorestart: !1 },
  { id: 5, name: "backup", command: "restic backup projects", autorestart: !1 },
  { id: 6, name: "docs-preview", command: "node docs/preview.js", autorestart: !1 },
  { id: 7, name: "report-builder", command: "node reports/build.js" },
  { id: 8, name: "legacy-cron", command: "sh bin/old-cron.sh", enabled: !1 },
  { id: 9, name: "image-resizer", command: "node jobs/resize-images.js" }
], Ot = [[100, "hoody-agent"], [101, "hoody-terminal"], [102, "hoody-cron"], [103, "hoody-run"], [104, "hoody-notes"], [105, "hoody-display"], [106, "hoody-files"], [107, "hoody-daemon"], [108, "hoody-tunnel"], [120, "hoody-exec"]].map(([e, t]) => ({ id: e, name: t, command: `/hoody/plugins/${t}/${t}`, boot: !0, autorestart: !0 })), oe = (e) => e === "c0a7150000000000000000a1" ? [...rr, ...Ot] : Ot, nr = (e) => ({
  id: e.id,
  name: e.name,
  command: e.command,
  user: e.id >= 100 ? "root" : "user",
  enabled: e.enabled !== !1,
  boot: e.boot === !0,
  delay_seconds: 0,
  autorestart: e.autorestart ?? "unexpected",
  priority: e.id >= 100 ? 100 : 999,
  hoody_kit: e.id >= 100,
  ...e.ports ? { port_range: { start: e.ports[0], end: e.ports[1] }, port_param: "--port" } : {}
}), ar = {
  web: { stdout: [[4440, "web listening on port 3000"], [52, "GET / 200 4ms"], [51, "GET /style.css 200 1ms"], [27, "GET /wp-login.php 404 1ms"], [9, "GET / 200 3ms"], [3, "GET /index.html 200 2ms"]] },
  api: { stdout: [[60, "api listening on port 8000"], [44, "GET /health 200 1ms"], [12, "GET /orders 200 18ms"]] },
  worker: { stderr: [[16, "Traceback (most recent call last):"], [16, '  File "worker/main.py", line 3, in <module>'], [16, "    import redis"], [15, "ModuleNotFoundError: No module named 'redis'"]] },
  "nightly-sync": { stdout: [[121, "nightly-sync: starting"]], stderr: [[120, "nightly-sync: folder /mnt/share/projects not found"], [120, "nightly-sync: nothing copied (exit 2)"]] },
  backup: { stdout: [[505, "open repository"], [501, "Files: 12 new, 41 changed, 2210 unmodified"], [500, "snapshot 5d07c3b2 saved"]] },
  "docs-preview": { stdout: [[1500, "docs preview on port 4000"], [1440, "docs preview stopped"]] }
};
function or(e, t, s, r) {
  let n = oe(e).find((d) => String(d.id) === t);
  if (!n)
    return;
  let o = s.get("type") === "stderr" ? "stderr" : "stdout", a = Math.min(Math.max(Math.floor(Number(s.get("lines") ?? 100)) || 0, 0), 1e4), i = a === 0 ? [] : (ar[n.name]?.[o] ?? []).map(([d, u]) => `${f(r - d * 60000)} ${u}`).slice(-a);
  return { success: !0, error: null, logs: i.length > 0 ? i.join(`
`) + `
` : "", type: o, lines: i.length, log_file: `/hoody/storage/hoody-daemon/logs/${n.name}/${o}.log` };
}
var n0 = 432000, te = (e, t, s, r = {}) => ({ final: !0, exit_code: s, ended_at: e - t * 60000, ...r });
function ir(e) {
  return {
    1: { status: "running", autorestart: "always", instances: [{ port: 3000, status: "running", pid: 7000, uptime_s: 266400 }] },
    2: { status: "running", autorestart: "unexpected", instances: [{ port: 8000, status: "running", pid: 12000, uptime_s: 3600 }, { port: 8001, status: "running", pid: 12001, uptime_s: 3600 }, { port: 8002, status: "stopped" }] },
    3: { status: "fatal", autorestart: "always", instances: [{ port: 0, status: "fatal" }], last_result: te(e, 15, 1, { failure: "launch_failed" }) },
    4: { status: "exited", autorestart: "never", last_result: te(e, 120, 2), instances: [{ status: "exited", last_result: te(e, 120, 2) }] },
    5: { status: "exited", autorestart: "never", last_result: te(e, 500, 0), instances: [{ status: "exited", last_result: te(e, 500, 0) }] },
    6: { status: "stopped", autorestart: "never", instances: [{ status: "stopped" }], last_result: { ended_at: e - 86400000, exit_code: 0 } },
    7: { status: "stopped", lazy_load: !0, instances: [] },
    8: { status: "stopped", instances: [] },
    9: { status: "stopped", instances: [] }
  };
}
function dr(e, t) {
  let s = e === "c0a7150000000000000000a1" ? ir(t) : {};
  return { programs: oe(e).map((n) => {
    let o = { id: n.id, name: n.name, states_known: !0, hoody_kit: n.id >= 100, ...n.boot ? { boot: !0 } : {}, ...n.enabled === !1 ? { enabled: !1 } : {}, ...n.ports ? { port_range: { start: n.ports[0], end: n.ports[1] } } : {} };
    if (n.id < 100)
      return { ...o, ...s[n.id] };
    if (n.name === "hoody-tunnel" && e !== "c0a7150000000000000000a1")
      return { ...o, status: "stopped", lazy_load: !0, autorestart: "always", instances: [] };
    return { ...o, status: "running", autorestart: "always", instances: [{ port: 15000 + (n.id - 100), status: "running", pid: 19000 + (n.id - 100), uptime_s: n0 }] };
  }), temporary: e === "c0a7150000000000000000a1" ? [{ temporary_id: "quick_1760000000_1", name: "http-server", status: "running", expires_at: t + 2400000 }] : [], features: ["restart", "boot_switch"] };
}
var lr = "sess-4f7a2c91", Y = { expose: 5173, pull: 5432 };
function ur(e, t, s) {
  let r = e === "c0a7150000000000000000a1", n = lr;
  switch (t) {
    case "/health":
      return { status: "ok", started: f(s - n0 * 1000) };
    case "/tunnels":
      return { sessions: r ? [{ sessionId: n, peerAddr: "203.0.113.24:51234", protocol: "v2", activeStreams: 2, exposeBindings: [{ bindId: 1, computerPort: Y.expose }], pullBindings: [{ bindId: 2, computerPort: Y.pull, bindAddr: "127.0.0.1" }] }] : [], orphanedSessions: 0 };
    case "/sessions":
      return { sessions: r ? [{ sessionId: n, maxStreams: 1024 }] : [] };
    case "/bindings":
      return { bindings: r ? [{ sessionId: n, bindId: 1, port: Y.expose, mode: "expose" }, { sessionId: n, bindId: 2, port: Y.pull, mode: "pull", bindAddr: "127.0.0.1" }] : [] };
    default:
      return;
  }
}
function a0(e) {
  let t = (i, d, u, l, c, p = "0.0.0.0", _ = "user") => ({ protocol: "tcp", port: i, ip: p, pid: d, user: _, program: u, path: l, args: c }), s = oe(e).filter((i) => i.id >= 100 && (i.name !== "hoody-tunnel" || e === "c0a7150000000000000000a1")).map((i) => t(15000 + (i.id - 100), 19000 + (i.id - 100), i.name, i.command, i.command, "127.0.0.1", "root")), r = "/hoody/plugins/hoody-tunnel/hoody-tunnel", n = "/usr/bin/node", o = e !== "c0a7150000000000000000a1" ? [] : [
    t(3000, 7000, "node", "/usr/bin/node", "node /srv/app/server.js"),
    t(8000, 12000, "node", "/usr/bin/node", "node /srv/app/api.js --port 8000"),
    t(8001, 12001, "node", "/usr/bin/node", "node /srv/app/api.js --port 8001"),
    t(Y.expose, 19008, "hoody-tunnel", "/hoody/plugins/hoody-tunnel/hoody-tunnel", "/hoody/plugins/hoody-tunnel/hoody-tunnel", "0.0.0.0", "root"),
    t(Y.pull, 19008, "hoody-tunnel", "/hoody/plugins/hoody-tunnel/hoody-tunnel", "/hoody/plugins/hoody-tunnel/hoody-tunnel", "127.0.0.1", "root")
  ];
  return { network_services: [t(22, 410, "sshd", "/usr/sbin/sshd", "/usr/sbin/sshd -D", "0.0.0.0", "root"), ...o, ...s].sort((i, d) => i.port - d.port), terminals: [], displays: [] };
}
function cr(e, t, s, r) {
  if (t === "/health")
    return sr;
  if (t === "/programs/overview")
    return dr(e, r);
  if (t === "/programs")
    return { programs: oe(e).map(nr) };
  let n = /^\/programs\/(\d+)\/logs$/.exec(t);
  if (n)
    return or(e, n[1], s, r);
  let o = /^\/programs\/(\d+)\/sandbox$/.exec(t);
  if (!o || !oe(e).some((a) => String(a.id) === o[1]))
    return;
  return tr.includes(o[1]) ? er : Qs;
}
var R = (e) => ({ kind: "text", text: e }), se = (e, t, s) => ({ kind: "tool_use", tool_id: e, tool_name: t, input: s }), re = (e, t, s = !1) => ({ kind: "tool_result", tool_id: e, output: t, is_error: s }), fr = "Deploy the shop to the staging site and send me its address.", mr = [
  { id: "s-today", cwd: "/home/ada/projects/shop", agoMin: 2, messages: [
    ["user", [R("Fix the failing checkout tests")]],
    ["assistant", [R("I will run the checkout tests first."), se("tu-1", "bash", { command: "npm test -- checkout" })]],
    ["user", [re("tu-1", `Tests: 2 failed, 12 passed, 14 total
  x total rounds the tax once
  x discount and tax together`, !0)]],
    ["assistant", [
      R("Both failures round the tax on every line instead of once on the total. I changed that and ran the tests again."),
      se("tu-2", "edit_file", { path: "src/cart/total.ts", old_string: "lines.reduce((sum, l) => sum + round(l.price * TAX), 0)", new_string: "round(lines.reduce((sum, l) => sum + l.price, 0) * TAX)" }),
      se("tu-3", "bash", { command: "npm test -- checkout" })
    ]],
    ["user", [re("tu-2", "Edited src/cart/total.ts"), re("tu-3", "Tests: 14 passed, 14 total")]],
    ["assistant", [R("All 14 checkout tests pass now. The tax is rounded once, on the order total (src/cart/total.ts).")]]
  ] },
  { id: "s-claude", cwd: "/home/ada", agoMin: 180, acp: !0, messages: [
    ["user", [R("Review the release notes")]],
    ["assistant", [se("tu-1", "read_file", { path: "notes/release-1.4.md" })]],
    ["user", [re("tu-1", Pe["release-1.4.md"])]],
    ["assistant", [R('The notes are clear and short. Two suggestions: add the release date under the title, and say what changed for slow checkout on phones (for example "checkout loads twice as fast").')]]
  ] },
  { id: "s-wait", name: "Deploy the staging site", cwd: "/home/ada/projects/shop", agoMin: 57600, gate: !0, messages: [
    ["user", [R(fr)]],
    ["assistant", [R("I will build the shop first, then deploy it."), se("tu-1", "bash", { command: "npm run build" })]],
    ["user", [re("tu-1", "Build finished in 41 s.")]],
    ["assistant", [R("The build passed. Deploying to staging needs your OK.")]]
  ] },
  { id: "s-delegate", cwd: "/home/ada", agoMin: 1560, fromBot: !0, messages: [
    ["user", [R("Answer the support ticket")]],
    ["assistant", [R('I answered the customer: their order 1042 left the warehouse today, and the tracking link follows by mail. I tagged the ticket "shipping".')]]
  ] },
  { id: "s-old", cwd: "/home/ada", agoMin: 43200, messages: [
    ["user", [R("Plan the backup job")]],
    ["assistant", [R(`A plan for the backup:
1. Back up ~/projects with restic every night at 02:00.
2. Keep 7 daily and 4 weekly snapshots.
3. Check the backup each Sunday and tell you if it fails.`)]]
  ] }
], pr = (e) => e.messages[0][1][0].text, _r = (e) => e.messages.filter(([t, s]) => t === "user" && s.some((r) => r.kind === "text")).length;
function yr(e, t, s) {
  let r = f(s - e.agoMin * 60000), n = {
    id: e.id,
    ...e.name ? { name: e.name } : {},
    first_message: pr(e),
    realm: "f1f1f1f1f1f1f1f1f1f1f1f1",
    model: "hoody-ai/hoody-free",
    cwd: e.cwd,
    state: "idle",
    ...e.gate ? { pending_gate: !0 } : {},
    ...e.acp ? { backend_kind: "acp" } : {},
    ...e.fromBot ? { origin: { kind: "bot", bot_uid: "uid-support-desk", bot_id: "support-desk", realm: "f1f1f1f1f1f1f1f1f1f1f1f1", ref: `work-${e.id}` } } : {},
    started_at: r,
    last_request_at: r
  }, o = _r(e);
  switch (t) {
    case "":
      return { session: n };
    case "/turns":
      return { session_id: e.id, turns: Array.from({ length: o }, (a, i) => ({ turn_id: `turn-demo-${o - i}`, state: e.gate && i === 0 ? "dispatched" : "completed", accepted_at: r, dispatched_at: r })) };
    case "/transcript":
      return {
        session_id: e.id,
        live: !0,
        realm: "f1f1f1f1f1f1f1f1f1f1f1f1",
        name: e.name ?? "",
        model: n.model,
        cwd: e.cwd,
        turns_total: o,
        turns_returned: o,
        turn_boundaries: [],
        started_at: r,
        last_request_at: r,
        messages: e.messages.map(([a, i]) => ({ role: a, blocks: i }))
      };
    case "/state":
      return {
        session_id: e.id,
        live: !0,
        state: e.gate ? "parked" : "idle",
        current_turn_id: null,
        queued_turn_ids: [],
        incarnation: "inc-demo-1",
        seq: 42,
        ...e.gate ? {
          pending_gate: { type: "confirm", gate_id: 1, generation: 1, tool_name: "bash", gate_cause: "static_stakes", risk: "write", human_only: !1, lease_required: !1, params: { command: "npm run deploy -- --target staging" }, detail: "Deploys the shop to the staging site." },
          pending_gate_ref: { id: "g1-0", generation: 1, type: "confirm", tool_name: "bash", gate_cause: "static_stakes", risk: "write", human_only: !1 }
        } : {}
      };
    default:
      return;
  }
}
function hr(e, t, s) {
  let r = /^\/api\/v1\/agent\/sessions\/(s-[a-z]+)((?:\/[a-z]+)?)$/.exec(e), n = r ? mr.find((o) => o.id === r[1]) : void 0;
  return n && (t === null || t === "f1f1f1f1f1f1f1f1f1f1f1f1" || t === "all") ? yr(n, r[2], s) : void 0;
}
var It = {
  "/api/v1/agent/sessions": { items: [], meta: { total: 0, page: 1, limit: 50 } },
  "/api/v1/agent/gates": { items: [], meta: { total: 0, page: 1, limit: 100, omitted: 0 } },
  "/api/v1/agent/sessions/cwds": { cwds: [] },
  "/api/v1/agent/changes": { scope: "scope-empty", tokens: { sessions: "c0:s0", gates: "c0:g0" } },
  "/api/v1/agent/pause": { paused: !1, since_ms: 0, gen: 1 }
};
function o0(e, t) {
  let s;
  try {
    s = new URL(e);
  } catch {
    return null;
  }
  let r = Ts.exec(s.hostname);
  if (!r)
    return null;
  let [, , n, o] = r;
  if (o === "agent" && s.pathname === "/api/v1/agent/bots") {
    let a = s.searchParams.get("realm") ?? "all", i = qt.filter((d) => d.computer === n && (a === "all" || d.realm === a)).map((d) => Xt(d, t));
    return { status: 200, body: { items: i, meta: { total: i.length } } };
  }
  if (o === "agent" && s.pathname.startsWith("/api/v1/agent/bots/")) {
    let a = Is(n, s.pathname.slice(13), s.searchParams.get("realm"), t);
    return a === void 0 ? null : { status: 200, body: a };
  }
  if (o === "files") {
    let a = Vs(n, s, t);
    return a === void 0 ? null : { status: 200, ...a };
  }
  if (o === "daemon" && s.pathname.startsWith("/api/v1/daemon/")) {
    let a = cr(n, s.pathname.slice(14), s.searchParams, t);
    return a === void 0 ? null : { status: 200, body: a };
  }
  if (o === "tunnel" && s.pathname.startsWith("/api/v1/tunnel/")) {
    let a = ur(n, s.pathname.slice(14), t);
    return a === void 0 ? null : { status: 200, body: a };
  }
  if (o === "cron" && s.pathname.startsWith("/api/v1/cron/")) {
    let a = Ls(n, s.pathname.slice(12), s.searchParams, t);
    return a === void 0 ? null : { status: 200, body: a };
  }
  if (o === "exec" && s.pathname.startsWith("/api/v1/exec/")) {
    let a = Zs(n, s.pathname.slice(12), s.searchParams, t);
    return a === void 0 ? null : { status: 200, body: a };
  }
  if (o === "agent" && n === "c0a7150000000000000000a1") {
    let a = hr(s.pathname, s.searchParams.get("realm"), t);
    if (a !== void 0)
      return { status: 200, body: a };
  }
  if (o === "agent" && n !== "c0a7150000000000000000a1" && It[s.pathname] !== void 0)
    return { status: 200, body: It[s.pathname] };
  if (o === "agent" && s.pathname.startsWith("/api/v1/agent/")) {
    let a = Ss(s.pathname.slice(13));
    if (a !== void 0)
      return { status: 200, body: a };
  }
  if (o === "agent" && s.pathname === "/api/v1/agent/script-instances")
    return { status: 200, body: { instances: [] } };
  if (o === "curl" && s.pathname === "/api/v1/curl/schedule")
    return { status: 200, body: { items: [] } };
  if (o === "agent" && s.pathname === "/api/v1/agent/loops")
    return { status: 200, body: { items: [] } };
  if (o === "logs" && s.pathname === "/_logs")
    return { status: 200, body: Ks(n, s.searchParams, t) };
  if (o === "logs" && s.pathname === "/_logs/stats")
    return { status: 200, body: zs(n, s.searchParams, t) };
  if (o === "notes" && s.pathname.startsWith("/api/v1/notes/")) {
    let a = Ds(n, s.pathname.slice(13), t);
    return a === void 0 ? null : { status: 200, body: a };
  }
  return null;
}

// scripts/term/build/fake-empty.ts
var O = (e, t = "OK") => ({ statusCode: 200, message: t, data: e });
var _n = Object.freeze([
  { path: "/computers", match: /^\/computers$/, body: O({ computers: [], pagination: { total: 0, page: 1, limit: 100, totalPages: 0 } }) },
  { path: "/notifications/summary", match: /^\/notifications\/summary$/, body: O({ unread_count: 0, is_capped: !1, unread_cap: 100, latest_id: null, latest_created_at: null, poll_interval_seconds: 300 }) },
  { path: "/wallet/balances", match: /^\/wallet\/balances$/, body: O({ general_balance: "0.00", referral_credit: "0.00", referral_credit_owed: "0.00", ai_limit: "0.00", ai_usage: "0.00", ai_remaining: "0.00", ai_reserved: "0.00", ai_usage_status: "live" }) },
  { path: "/subserver-subscriptions", match: /^\/subserver-subscriptions$/, body: O([]) },
  { path: "/subserver-plans", match: /^\/subserver-plans$/, body: O({ requested_locale: "en", plans: [] }) },
  { path: "/servers/available", match: /^\/servers\/available$/, body: O([]) },
  { path: "/offers", match: /^\/offers$/, body: O([]) },
  { path: "/rentals", match: /^\/rentals$/, body: O([]) },
  { path: "/users/me/free-ai-usage", match: /^\/users\/me\/free-ai-usage$/, body: O({ servers: [], truncated: !1 }) },
  { path: "/users/me/free-tier-status", match: /^\/users\/me\/free-tier-status$/, body: O({ gate_enabled: !1, unlocked: !0, has_free_server: !1, can_claim: !1, claim_blocked_reason: "pool_empty", signup_code_failed: !1, hold: null }) },
  { path: "/auth/tokens", match: /^\/auth\/tokens$/, body: O([]) },
  { path: "/auth/tokens/templates", match: /^\/auth\/tokens\/templates$/, body: O([]) }
]);
// scripts/term/build/demo-world.gen.json
var i0 = {
  note: "GENERATED by scripts/term/demo-record.ts from the fixture world. Do not edit: record again.",
  source: "34e4603c39d6aa53371ddaf1f8fbd7f331f0a14bf50d13191435e306e01c9f38",
  recordedAt: "2026-11-11T09:00:00.000Z",
  account: "64f0ada00000000000000001",
  context: {
    realmId: "f1f1f1f1f1f1f1f1f1f1f1f1",
    projectId: "6a0000000000000000000001",
    containerId: "c0a7150000000000000000a1"
  },
  records: [
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-agent-1.n12.demo.invalid/api/v1/agent/bots?limit=100&realm=f1f1f1f1f1f1f1f1f1f1f1f1",
      status: 200,
      body: {
        items: [
          {
            id: "support-desk",
            uid: "uid-support-desk",
            name: "support-desk",
            realm: "f1f1f1f1f1f1f1f1f1f1f1f1",
            session_id: "s-botown"
          }
        ],
        meta: {
          total: 1
        }
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-agent-1.n12.demo.invalid/api/v1/agent/bots?limit=20&page=1&realm=f1f1f1f1f1f1f1f1f1f1f1f1",
      status: 200,
      body: {
        items: [
          {
            id: "support-desk",
            uid: "uid-support-desk",
            name: "support-desk",
            realm: "f1f1f1f1f1f1f1f1f1f1f1f1",
            session_id: "s-botown"
          }
        ],
        meta: {
          total: 1
        }
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-agent-1.n12.demo.invalid/api/v1/agent/changes?realm=f1f1f1f1f1f1f1f1f1f1f1f1",
      status: 200,
      body: {
        scope: "scope-1",
        tokens: {
          sessions: "c1:s1",
          gates: "c1:g1"
        }
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-agent-1.n12.demo.invalid/api/v1/agent/gates?limit=100&page=1&realm=f1f1f1f1f1f1f1f1f1f1f1f1",
      status: 200,
      body: {
        items: [
          {
            gate_id: "g1-0",
            generation: 1,
            kind: "confirm",
            parked_at: "2026-11-11T09:00:00.000Z",
            gate: {},
            realm: "f1f1f1f1f1f1f1f1f1f1f1f1",
            session_id: "s-wait"
          }
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 100,
          omitted: 0
        }
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-agent-1.n12.demo.invalid/api/v1/agent/pause",
      status: 200,
      body: {
        paused: !1,
        since_ms: 0,
        gen: 1
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-agent-1.n12.demo.invalid/api/v1/agent/sessions/cwds?realm=f1f1f1f1f1f1f1f1f1f1f1f1",
      status: 200,
      body: {
        cwds: [
          "/home/ada/projects/shop",
          "/home/ada"
        ]
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-agent-1.n12.demo.invalid/api/v1/agent/sessions/s-wait?realm=f1f1f1f1f1f1f1f1f1f1f1f1",
      status: 200,
      body: {
        session: {
          realm: "f1f1f1f1f1f1f1f1f1f1f1f1",
          model: "hoody-ai/hoody-free",
          started_at: "2026-10-02T09:00:00.000Z",
          cwd: "/home/ada/projects/shop",
          id: "s-wait",
          name: "Deploy the staging site",
          first_message: "deploy",
          last_request_at: "2026-10-02T09:00:00.000Z",
          state: "idle",
          pending_gate: !0
        },
        attached: !1
      },
      at: "2026-10-23T09:00:00.000Z"
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-agent-1.n12.demo.invalid/api/v1/agent/sessions?limit=50&page=1&order=last_active&realm=f1f1f1f1f1f1f1f1f1f1f1f1",
      status: 200,
      body: {
        items: [
          {
            realm: "f1f1f1f1f1f1f1f1f1f1f1f1",
            model: "hoody-ai/hoody-free",
            started_at: "2026-11-11T08:59:00.000Z",
            cwd: "/home/ada",
            id: "s-bot",
            first_message: "bot work",
            agent: "bot",
            last_request_at: "2026-11-11T08:59:00.000Z",
            state: "idle"
          },
          {
            realm: "f1f1f1f1f1f1f1f1f1f1f1f1",
            model: "hoody-ai/hoody-free",
            started_at: "2026-11-11T08:59:00.000Z",
            cwd: "/home/ada",
            id: "s-botown",
            first_message: "bot own session",
            last_request_at: "2026-11-11T08:59:00.000Z",
            state: "idle",
            origin: {
              kind: "bot",
              bot_uid: "uid-support-desk",
              bot_id: "support-desk",
              realm: "f1f1f1f1f1f1f1f1f1f1f1f1"
            }
          },
          {
            realm: "f1f1f1f1f1f1f1f1f1f1f1f1",
            model: "hoody-ai/hoody-free",
            started_at: "2026-11-11T08:59:00.000Z",
            cwd: "/home/ada",
            id: "s-draft",
            state: "idle"
          },
          {
            realm: "f1f1f1f1f1f1f1f1f1f1f1f1",
            model: "hoody-ai/hoody-free",
            started_at: "2026-11-11T08:58:00.000Z",
            cwd: "/home/ada/projects/shop",
            id: "s-today",
            first_message: `Fix the failing checkout tests
more`,
            last_request_at: "2026-11-11T08:58:00.000Z",
            state: "running"
          },
          {
            realm: "f1f1f1f1f1f1f1f1f1f1f1f1",
            model: "hoody-ai/hoody-free",
            started_at: "2026-11-11T06:00:00.000Z",
            cwd: "/home/ada",
            id: "s-claude",
            first_message: "Review the release notes",
            backend_kind: "acp",
            last_request_at: "2026-11-11T06:00:00.000Z",
            state: "idle"
          },
          {
            realm: "f1f1f1f1f1f1f1f1f1f1f1f1",
            model: "hoody-ai/hoody-free",
            started_at: "2026-11-10T07:00:00.000Z",
            cwd: "/home/ada",
            id: "s-delegate",
            first_message: "Answer the support ticket",
            last_request_at: "2026-11-10T07:00:00.000Z",
            state: "idle",
            origin: {
              kind: "bot",
              bot_uid: "uid-support-desk",
              bot_id: "support-desk",
              realm: "f1f1f1f1f1f1f1f1f1f1f1f1",
              ref: "work-s-delegate"
            }
          },
          {
            realm: "f1f1f1f1f1f1f1f1f1f1f1f1",
            model: "hoody-ai/hoody-free",
            started_at: "2026-10-12T09:00:00.000Z",
            cwd: "/home/ada",
            id: "s-old",
            first_message: "Plan the backup job",
            last_request_at: "2026-10-12T09:00:00.000Z",
            state: "idle"
          },
          {
            realm: "f1f1f1f1f1f1f1f1f1f1f1f1",
            model: "hoody-ai/hoody-free",
            started_at: "2026-10-02T09:00:00.000Z",
            cwd: "/home/ada/projects/shop",
            id: "s-wait",
            name: "Deploy the staging site",
            first_message: "deploy",
            last_request_at: "2026-10-02T09:00:00.000Z",
            state: "idle",
            pending_gate: !0
          }
        ],
        meta: {
          total: 8,
          page: 1,
          limit: 50
        }
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-daemon-1.n12.demo.invalid/api/v1/daemon/programs/overview",
      status: 200,
      body: {
        programs: [
          {
            id: 1,
            name: "web",
            status: "running",
            states_known: !0,
            boot: !0,
            autorestart: "always",
            hoody_kit: !1,
            instances: [
              {
                port: 3000,
                status: "running",
                pid: 7000,
                uptime_s: 266400
              }
            ]
          },
          {
            id: 2,
            name: "api",
            status: "running",
            states_known: !0,
            boot: !1,
            autorestart: "unexpected",
            hoody_kit: !1,
            port_range: {
              start: 8000,
              end: 8003
            },
            instances: [
              {
                port: 8000,
                status: "running",
                pid: 12000,
                uptime_s: 3600
              },
              {
                port: 8001,
                status: "running",
                pid: 12001,
                uptime_s: 3600
              },
              {
                port: 8002,
                status: "stopped"
              }
            ]
          },
          {
            id: 3,
            name: "worker",
            status: "fatal",
            states_known: !0,
            boot: !0,
            autorestart: "always",
            hoody_kit: !1,
            instances: [
              {
                port: 0,
                status: "fatal"
              }
            ],
            last_result: {
              final: !0,
              exit_code: 1,
              ended_at: 1794386700000,
              failure: "launch_failed"
            }
          },
          {
            id: 4,
            name: "nightly-sync",
            status: "exited",
            states_known: !0,
            boot: !1,
            autorestart: "never",
            hoody_kit: !1,
            last_result: {
              final: !0,
              exit_code: 2,
              ended_at: 1794380400000
            },
            instances: [
              {
                status: "exited",
                last_result: {
                  final: !0,
                  exit_code: 2,
                  ended_at: 1794380400000
                }
              }
            ]
          },
          {
            id: 5,
            name: "backup",
            status: "exited",
            states_known: !0,
            boot: !1,
            autorestart: "never",
            hoody_kit: !1,
            last_result: {
              final: !0,
              exit_code: 0,
              ended_at: 1794357600000
            },
            instances: [
              {
                status: "exited",
                last_result: {
                  final: !0,
                  exit_code: 0,
                  ended_at: 1794357600000
                }
              }
            ]
          },
          {
            id: 6,
            name: "docs-preview",
            status: "stopped",
            states_known: !0,
            boot: !1,
            autorestart: "never",
            hoody_kit: !1,
            instances: [
              {
                status: "stopped"
              }
            ],
            last_result: {
              ended_at: 1794301200000,
              exit_code: 0
            }
          },
          {
            id: 7,
            name: "report-builder",
            status: "stopped",
            states_known: !0,
            lazy_load: !0,
            hoody_kit: !1,
            instances: []
          },
          {
            id: 8,
            name: "legacy-cron",
            status: "stopped",
            states_known: !0,
            enabled: !1,
            hoody_kit: !1,
            instances: []
          },
          {
            id: 9,
            name: "mystery",
            status: "unknown",
            states_known: !1,
            hoody_kit: !1,
            instances: []
          },
          {
            id: 100,
            name: "hoody-agent",
            status: "running",
            states_known: !0,
            hoody_kit: !0,
            autorestart: "always",
            instances: [
              {
                port: 15000,
                status: "running",
                pid: 19000,
                uptime_s: 432000
              }
            ]
          },
          {
            id: 101,
            name: "hoody-terminal",
            status: "running",
            states_known: !0,
            hoody_kit: !0,
            autorestart: "always",
            instances: [
              {
                port: 15001,
                status: "running",
                pid: 19001,
                uptime_s: 432000
              }
            ]
          },
          {
            id: 102,
            name: "hoody-cron",
            status: "running",
            states_known: !0,
            hoody_kit: !0,
            autorestart: "always",
            instances: [
              {
                port: 15002,
                status: "running",
                pid: 19002,
                uptime_s: 432000
              }
            ]
          },
          {
            id: 103,
            name: "hoody-run",
            status: "running",
            states_known: !0,
            hoody_kit: !0,
            autorestart: "always",
            instances: [
              {
                port: 15003,
                status: "running",
                pid: 19003,
                uptime_s: 432000
              }
            ]
          },
          {
            id: 104,
            name: "hoody-notes",
            status: "running",
            states_known: !0,
            hoody_kit: !0,
            autorestart: "always",
            instances: [
              {
                port: 15004,
                status: "running",
                pid: 19004,
                uptime_s: 432000
              }
            ]
          },
          {
            id: 105,
            name: "hoody-display",
            status: "running",
            states_known: !0,
            hoody_kit: !0,
            autorestart: "always",
            instances: [
              {
                port: 15005,
                status: "running",
                pid: 19005,
                uptime_s: 432000
              }
            ]
          },
          {
            id: 106,
            name: "hoody-files",
            status: "running",
            states_known: !0,
            hoody_kit: !0,
            autorestart: "always",
            instances: [
              {
                port: 15006,
                status: "running",
                pid: 19006,
                uptime_s: 432000
              }
            ]
          },
          {
            id: 107,
            name: "hoody-daemon",
            status: "running",
            states_known: !0,
            hoody_kit: !0,
            autorestart: "always",
            instances: [
              {
                port: 15007,
                status: "running",
                pid: 19007,
                uptime_s: 432000
              }
            ]
          },
          {
            id: 120,
            name: "hoody-exec",
            status: "fatal",
            states_known: !0,
            hoody_kit: !0,
            autorestart: "always",
            instances: [
              {
                status: "fatal"
              }
            ],
            last_result: {
              final: !0,
              exit_code: 1,
              ended_at: 1794387300000
            }
          }
        ],
        temporary: [
          {
            temporary_id: "quick_1760000000_1",
            name: "http-server",
            status: "running",
            expires_at: 1794390000000
          }
        ],
        features: [
          "restart",
          "boot_switch"
        ]
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-files-1.n12.demo.invalid/?json=",
      status: 200,
      body: {
        kind: "Index",
        href: "/",
        uri_prefix: "/",
        allow_upload: !0,
        allow_delete: !0,
        allow_search: !0,
        allow_archive: !0,
        allow_remote: !1,
        auth: !1,
        user: null,
        dir_exists: !0,
        remote_mounts: null,
        paths: [
          {
            path_type: "Dir",
            name: "bin",
            mtime: 1761200000000,
            size: 3
          },
          {
            path_type: "SymlinkDir",
            name: "copy",
            mtime: 1761113600000,
            size: 3
          },
          {
            path_type: "Dir",
            name: "etc",
            mtime: 1761027200000,
            size: 3
          },
          {
            path_type: "Dir",
            name: "home",
            mtime: 1760940800000,
            size: 3
          },
          {
            path_type: "Dir",
            name: "root",
            mtime: 1760854400000,
            size: 3
          },
          {
            path_type: "Dir",
            name: "srv",
            mtime: 1760768000000,
            size: 3
          },
          {
            path_type: "Dir",
            name: "tmp",
            mtime: 1760681600000,
            size: 3
          },
          {
            path_type: "Dir",
            name: "usr",
            mtime: 1760595200000,
            size: 3
          },
          {
            path_type: "Dir",
            name: "var",
            mtime: 1760508800000,
            size: 3
          }
        ]
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-tunnel-1.n12.demo.invalid/api/v1/tunnel/bindings",
      status: 200,
      body: {
        bindings: [
          {
            port: 3000,
            kind: "http",
            mode: "expose",
            sessionId: "S-4f2a9c1e-7b3d-4e21-9a55-0c1d2e3f4a51",
            bindId: 1
          },
          {
            port: 5173,
            kind: "http",
            mode: "expose",
            sessionId: "S-4f2a9c1e-7b3d-4e21-9a55-0c1d2e3f4a51",
            bindId: 2
          },
          {
            port: 5432,
            kind: "tcp",
            mode: "pull",
            sessionId: "S-4f2a9c1e-7b3d-4e21-9a55-0c1d2e3f4a51",
            bindId: 3,
            bindAddr: "127.0.0.1"
          },
          {
            port: 5432,
            kind: "tcp",
            mode: "pull",
            sessionId: "S-9b1d7e20-41c6-4f8a-b2d3-5e6f7a8b9c02",
            bindId: 1,
            bindAddr: "127.0.0.2"
          },
          {
            port: 6379,
            kind: "tcp",
            mode: "pull",
            sessionId: "S-9b1d7e20-41c6-4f8a-b2d3-5e6f7a8b9c02",
            bindId: 2,
            bindAddr: "127.0.0.1"
          },
          {
            port: 8080,
            kind: "http",
            mode: "expose",
            sessionId: "S-77aa31c5-2d4e-4b6f-8a9b-1c2d3e4f5a09",
            bindId: 4
          }
        ],
        total: 6
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-tunnel-1.n12.demo.invalid/api/v1/tunnel/health",
      status: 200,
      body: {
        status: "ok",
        service: "hoody-tunnel",
        built: null,
        started: "2026-11-11T06:00:00.000Z",
        memory: null,
        fds: 40,
        pid: 812,
        ip: "",
        user_agent: ""
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-tunnel-1.n12.demo.invalid/api/v1/tunnel/sessions",
      status: 200,
      body: {
        sessions: [
          {
            sessionId: "S-4f2a9c1e-7b3d-4e21-9a55-0c1d2e3f4a51",
            peerAddr: "203.0.113.42:51234",
            isV2: !0,
            connectionsGranted: 4,
            activeStreams: 3,
            maxStreams: 1024,
            bindings: [
              {
                bindId: 1,
                computerPort: 3000,
                kind: "http",
                mode: "expose"
              },
              {
                bindId: 2,
                computerPort: 5173,
                kind: "http",
                mode: "expose"
              },
              {
                bindId: 3,
                computerPort: 5432,
                bindAddr: "127.0.0.1",
                kind: "tcp",
                mode: "pull"
              }
            ]
          },
          {
            sessionId: "S-9b1d7e20-41c6-4f8a-b2d3-5e6f7a8b9c02",
            peerAddr: "192.0.2.44:40112",
            isV2: !0,
            connectionsGranted: 4,
            activeStreams: 0,
            maxStreams: 1024,
            bindings: [
              {
                bindId: 1,
                computerPort: 5432,
                bindAddr: "127.0.0.2",
                kind: "tcp",
                mode: "pull"
              },
              {
                bindId: 2,
                computerPort: 6379,
                bindAddr: "127.0.0.1",
                kind: "tcp",
                mode: "pull"
              }
            ]
          }
        ],
        total: 2
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-tunnel-1.n12.demo.invalid/api/v1/tunnel/tunnels",
      status: 200,
      body: {
        sessions: [
          {
            sessionId: "S-4f2a9c1e-7b3d-4e21-9a55-0c1d2e3f4a51",
            peerAddr: "203.0.113.42:51234",
            protocol: "v2",
            connectionsGranted: 4,
            activeStreams: 3,
            exposeBindings: [
              {
                bindId: 1,
                computerPort: 3000
              },
              {
                bindId: 2,
                computerPort: 5173
              }
            ],
            pullBindings: [
              {
                bindId: 3,
                computerPort: 5432,
                bindAddr: "127.0.0.1"
              }
            ]
          },
          {
            sessionId: "S-9b1d7e20-41c6-4f8a-b2d3-5e6f7a8b9c02",
            peerAddr: "192.0.2.44:40112",
            protocol: "v2",
            connectionsGranted: 4,
            activeStreams: 0,
            exposeBindings: [],
            pullBindings: [
              {
                bindId: 1,
                computerPort: 5432,
                bindAddr: "127.0.0.2"
              },
              {
                bindId: 2,
                computerPort: 6379,
                bindAddr: "127.0.0.1"
              }
            ]
          }
        ],
        orphanedSessions: 1,
        totalStreams: 3,
        totalBindings: 5,
        fdPermitsAvailable: 900
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-vm-1.n12.demo.invalid/api/v1/vm/capabilities",
      status: 200,
      body: {
        kvm_present: !0,
        fuse_present: !0,
        unprivileged_port_start: 1024,
        memory: {
          ceiling_bytes: 17179869184,
          admitted: [
            {
              name: "web-1",
              admitted_bytes: 2415919104
            },
            {
              name: "db-1",
              admitted_bytes: 4563402752
            },
            {
              name: "stuck",
              admitted_bytes: 1342177280
            }
          ]
        },
        misc: {
          kvm_vm: {
            used: 3,
            ceiling: 16
          },
          kvm_vcpu: {
            used: 8,
            ceiling: 64
          },
          kvm_memslot: null
        },
        provisioning: {
          uefi: !0,
          virtio_win_iso: !0,
          templates: !0,
          machine_type: "pc-q35-9.2",
          tpm: !0,
          secure_boot: !0,
          file_sharing: !0,
          audio: !1
        },
        storage: {
          free_bytes: 440234147840
        }
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-vm-1.n12.demo.invalid/api/v1/vm/vms",
      status: 200,
      body: [
        {
          name: "web-1",
          vm_id: "0195c0de00000001",
          phase: "committed",
          state: "Running"
        },
        {
          name: "win11",
          vm_id: "0195c0de00000002",
          phase: "committed",
          state: "Stopped"
        },
        {
          name: "build",
          vm_id: "0195c0de00000003",
          phase: "creating",
          state: "Creating"
        },
        {
          name: "db-1",
          vm_id: "0195c0de00000004",
          phase: "committed",
          state: "Paused"
        },
        {
          name: "cache",
          vm_id: "0195c0de00000005",
          phase: "committed",
          state: "Starting"
        },
        {
          name: "old-api",
          vm_id: "0195c0de00000006",
          phase: "committed",
          state: "Stopping"
        },
        {
          name: "batch",
          vm_id: "0195c0de00000007",
          phase: "committed",
          state: "Failed"
        },
        {
          name: "import-1",
          vm_id: "0195c0de00000008",
          phase: "creating",
          state: "Failed"
        },
        {
          name: "ghost",
          vm_id: "0195c0de00000009",
          phase: "committed",
          state: "Orphaned"
        },
        {
          name: "stuck",
          vm_id: "0195c0de00000010",
          phase: "committed",
          state: "Running"
        },
        {
          name: "files-1",
          vm_id: "0195c0de00000011",
          phase: "committed",
          state: "Stopped",
          share: {
            bytes: 12884901888,
            partial: !1,
            sampled_unix: 1792745880,
            quota_bytes: 10737418240,
            over_quota: !0
          }
        },
        {
          name: "lab-01",
          vm_id: "0195c0de00000020",
          phase: "committed",
          state: "Stopped"
        },
        {
          name: "lab-02",
          vm_id: "0195c0de00000021",
          phase: "committed",
          state: "Stopped"
        },
        {
          name: "lab-03",
          vm_id: "0195c0de00000022",
          phase: "committed",
          state: "Stopped"
        },
        {
          name: "lab-04",
          vm_id: "0195c0de00000023",
          phase: "committed",
          state: "Stopped"
        },
        {
          name: "lab-05",
          vm_id: "0195c0de00000024",
          phase: "committed",
          state: "Stopped"
        },
        {
          name: "lab-06",
          vm_id: "0195c0de00000025",
          phase: "committed",
          state: "Stopped"
        }
      ]
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-vm-1.n12.demo.invalid/api/v1/vm/vms/batch",
      status: 200,
      body: {
        name: "batch",
        vm_id: "0195c0de00000007",
        state: "Failed",
        seq: 9,
        spec: {
          memory_mib: 32768,
          vcpus: 8,
          disk_bytes: 21474836480,
          firmware: "uefi",
          bus: "virtio",
          display_adapter: "virtio-vga",
          cpu: "westmere",
          tpm: !1,
          file_sharing: !1,
          agent: !0,
          console: !0,
          console_input: !0,
          audio: "none",
          machine_type: "pc-q35-9.2",
          autostart: !1,
          cdroms: []
        },
        reason: "not enough memory in this computer",
        error: {
          error: {
            code: "MemoryExceedsCgroup",
            message: "the VM needs 33024 MiB and 9472 MiB is left",
            retryable: !1
          }
        }
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-vm-1.n12.demo.invalid/api/v1/vm/vms/build",
      status: 200,
      body: {
        name: "build",
        vm_id: "0195c0de00000003",
        state: "Creating",
        seq: 2,
        progress: {
          phase: "importing",
          bytes_done: 8589934592,
          bytes_total: 21474836480
        }
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-vm-1.n12.demo.invalid/api/v1/vm/vms/cache",
      status: 200,
      body: {
        name: "cache",
        vm_id: "0195c0de00000005",
        state: "Starting",
        run: "a1b2c3d400000005",
        seq: 7,
        spec: {
          memory_mib: 1024,
          vcpus: 1,
          disk_bytes: 21474836480,
          firmware: "uefi",
          bus: "virtio",
          display_adapter: "virtio-vga",
          cpu: "westmere",
          tpm: !1,
          file_sharing: !1,
          agent: !0,
          console: !0,
          console_input: !0,
          audio: "none",
          machine_type: "pc-q35-9.2",
          autostart: !1,
          cdroms: []
        }
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-vm-1.n12.demo.invalid/api/v1/vm/vms/db-1",
      status: 200,
      body: {
        name: "db-1",
        vm_id: "0195c0de00000004",
        state: "Paused",
        run: "a1b2c3d400000004",
        seq: 30,
        spec: {
          memory_mib: 4096,
          vcpus: 4,
          disk_bytes: 107374182400,
          firmware: "uefi",
          bus: "virtio",
          display_adapter: "virtio-vga",
          cpu: "westmere",
          tpm: !1,
          file_sharing: !1,
          agent: !0,
          console: !0,
          console_input: !0,
          audio: "none",
          machine_type: "pc-q35-9.2",
          autostart: !1,
          cdroms: [],
          ports: [
            {
              proto: "tcp",
              host: 5432,
              guest: 5432
            }
          ]
        },
        sidecars: [
          {
            kind: "passt",
            state: "ready"
          }
        ]
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-vm-1.n12.demo.invalid/api/v1/vm/vms/ghost",
      status: 200,
      body: {
        name: "ghost",
        vm_id: "0195c0de00000009",
        state: "Orphaned",
        seq: 3,
        spec: {
          memory_mib: 2048,
          vcpus: 2,
          disk_bytes: 21474836480,
          firmware: "uefi",
          bus: "virtio",
          display_adapter: "virtio-vga",
          cpu: "westmere",
          tpm: !1,
          file_sharing: !1,
          agent: !0,
          console: !0,
          console_input: !0,
          audio: "none",
          machine_type: "pc-q35-9.2",
          autostart: !1,
          cdroms: []
        },
        reason: "a process is still using this VM's disk and cannot be matched to a run"
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-vm-1.n12.demo.invalid/api/v1/vm/vms/import-1",
      status: 200,
      body: {
        name: "import-1",
        vm_id: "0195c0de00000008",
        state: "Failed",
        progress: {
          phase: "failed",
          bytes_done: 3221225472,
          bytes_total: 42949672960,
          error: {
            error: {
              code: "InsufficientSpace",
              message: "the disk needs 40 GiB and 12 GiB is free",
              retryable: !1
            }
          }
        }
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-vm-1.n12.demo.invalid/api/v1/vm/vms/old-api",
      status: 200,
      body: {
        name: "old-api",
        vm_id: "0195c0de00000006",
        state: "Stopping",
        run: "a1b2c3d400000006",
        seq: 19,
        spec: {
          memory_mib: 2048,
          vcpus: 2,
          disk_bytes: 21474836480,
          firmware: "uefi",
          bus: "virtio",
          display_adapter: "virtio-vga",
          cpu: "westmere",
          tpm: !1,
          file_sharing: !1,
          agent: !0,
          console: !0,
          console_input: !0,
          audio: "none",
          machine_type: "pc-q35-9.2",
          autostart: !1,
          cdroms: []
        }
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-vm-1.n12.demo.invalid/api/v1/vm/vms/stuck",
      status: 200,
      body: {
        name: "stuck",
        vm_id: "0195c0de00000010",
        state: "Running",
        run: "a1b2c3d400000010",
        seq: 55,
        monitor_stalled: !0,
        spec: {
          memory_mib: 1024,
          vcpus: 1,
          disk_bytes: 21474836480,
          firmware: "uefi",
          bus: "virtio",
          display_adapter: "virtio-vga",
          cpu: "westmere",
          tpm: !1,
          file_sharing: !1,
          agent: !0,
          console: !0,
          console_input: !0,
          audio: "none",
          machine_type: "pc-q35-9.2",
          autostart: !1,
          cdroms: [],
          display: 7003
        }
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-vm-1.n12.demo.invalid/api/v1/vm/vms/web-1",
      status: 200,
      body: {
        name: "web-1",
        vm_id: "0195c0de00000001",
        state: "Running",
        run: "a1b2c3d400000001",
        seq: 41,
        spec: {
          memory_mib: 2048,
          vcpus: 2,
          disk_bytes: 21474836480,
          firmware: "uefi",
          bus: "virtio",
          display_adapter: "virtio-vga",
          cpu: "westmere",
          tpm: !1,
          file_sharing: !1,
          agent: !0,
          console: !0,
          console_input: !0,
          audio: "none",
          machine_type: "pc-q35-9.2",
          autostart: !0,
          cdroms: [],
          display: 7001,
          ports: [
            {
              proto: "tcp",
              host: 8080,
              guest: 80
            },
            {
              proto: "tcp",
              host: 2222,
              guest: 22
            }
          ]
        },
        sidecars: [
          {
            kind: "passt",
            state: "ready"
          }
        ]
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000001-c0a7150000000000000000a1-vm-1.n12.demo.invalid/api/v1/vm/vms/win11",
      status: 200,
      body: {
        name: "win11",
        vm_id: "0195c0de00000002",
        state: "Stopped",
        seq: 12,
        spec: {
          memory_mib: 4096,
          vcpus: 2,
          disk_bytes: 68719476736,
          firmware: "uefi-secure-boot",
          bus: "virtio",
          display_adapter: "virtio-vga",
          cpu: "westmere",
          tpm: !0,
          file_sharing: !1,
          agent: !0,
          console: !0,
          console_input: !0,
          audio: "none",
          machine_type: "pc-q35-9.2",
          autostart: !1,
          cdroms: [
            "/var/lib/hoody-vm/isos/win11.iso",
            "/usr/share/virtio-win/virtio-win.iso"
          ],
          display: 7002
        }
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000002-c0a7150000000000000000b2-agent-1.fra-7.demo.invalid/api/v1/agent/bots?limit=100&realm=f1f1f1f1f1f1f1f1f1f1f1f1",
      status: 200,
      body: {
        items: [
          {
            id: "support-desk",
            uid: "uid-support-desk",
            name: "support-desk",
            realm: "f1f1f1f1f1f1f1f1f1f1f1f1",
            session_id: "s-botown"
          }
        ],
        meta: {
          total: 1
        }
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000002-c0a715000000000000000107-agent-1.n12.demo.invalid/api/v1/agent/bots?limit=100&realm=f1f1f1f1f1f1f1f1f1f1f1f1",
      status: 200,
      body: {
        items: [
          {
            id: "support-desk",
            uid: "uid-support-desk",
            name: "support-desk",
            realm: "f1f1f1f1f1f1f1f1f1f1f1f1",
            session_id: "s-botown"
          }
        ],
        meta: {
          total: 1
        }
      }
    },
    {
      leg: "fetch",
      method: "GET",
      url: "https://6a0000000000000000000003-c0a715000000000000000118-agent-1.ash-3.demo.invalid/api/v1/agent/bots?limit=100&realm=f1f1f1f1f1f1f1f1f1f1f1f1",
      status: 200,
      body: {
        items: [
          {
            id: "support-desk",
            uid: "uid-support-desk",
            name: "support-desk",
            realm: "f1f1f1f1f1f1f1f1f1f1f1f1",
            session_id: "s-botown"
          }
        ],
        meta: {
          total: 1
        }
      }
    },
    {
      leg: "hoody",
      method: "GET",
      url: "/auth/tokens",
      status: 200,
      body: {
        data: [
          {
            id: "9e3779b19e3779b19e3779b1",
            alias: "ci-deploy",
            prefix: "hdy_9e37",
            realm_ids: [
              "f1f1f1f1f1f1f1f1f1f1f1f1"
            ],
            allow_no_realm: !1,
            permissions: {
              computers: {
                read: !0,
                update: !0,
                actions: {
                  start: !0,
                  stop: !0,
                  restart: !0,
                  exec: !0,
                  logs: !0
                }
              },
              projects: {
                read: !0
              },
              resources: {
                events: !0
              }
            },
            is_enabled: !0,
            expires_at: "2027-01-20T09:00:00.000Z",
            ip_whitelist: [
              "203.0.113.7/32"
            ],
            vault_access: !1,
            event_access: !0,
            delegation_depth: 0,
            created_at: "2026-11-02T09:00:00.000Z"
          },
          {
            id: "3c6ef3623c6ef3623c6ef362",
            alias: "hoody-agent auto 7f3a",
            prefix: "hdy_77c1",
            realm_ids: [],
            allow_no_realm: !0,
            permissions: {
              computers: {
                create: !0,
                read: !0,
                update: !0,
                delete: !0,
                actions: {
                  start: !0,
                  stop: !0,
                  restart: !0,
                  exec: !0,
                  logs: !0
                },
                features: {
                  ai: !0,
                  hoody_kit: !0,
                  snapshots: !0,
                  networking: !0,
                  kvm: !0,
                  env_values: !0
                }
              },
              projects: {
                create: !0,
                read: !0,
                update: !0,
                delete: !0,
                members: {
                  invite: !0,
                  remove: !0,
                  change_roles: !0
                }
              },
              financial: {
                wallet: {
                  read: !0,
                  transfer: !0,
                  withdraw: !0
                },
                billing: {
                  read: !0,
                  manage_payment_methods: !0,
                  download_invoices: !0
                },
                server_rental: {
                  view_marketplace: !0,
                  rent_servers: !0,
                  extend_rentals: !0,
                  terminate_rentals: !0
                },
                subscriptions: {
                  purchase: !0
                }
              },
              resources: {
                vault: !0,
                events: !0,
                ssh_keys: !0,
                storage_shares: !0,
                proxy_aliases: !0,
                bot_urls: !0,
                firewalls: !0,
                realms: !0,
                auth_token_public_profile: !0,
                read_account: !0,
                create_tokens: !0
              },
              admin: {
                users: !0
              }
            },
            is_enabled: !0,
            expires_at: null,
            ip_whitelist: [],
            vault_access: !1,
            event_access: !0,
            delegation_depth: 0,
            created_at: "2026-10-24T09:00:00.000Z"
          },
          {
            id: "daa66d13daa66d13daa66d13",
            alias: "hoody-agent realm Acme client",
            prefix: "hdy_a901",
            realm_ids: [
              "f2f2f2f2f2f2f2f2f2f2f2f2"
            ],
            allow_no_realm: !1,
            permissions: {
              computers: {
                create: !0,
                read: !0,
                update: !0,
                delete: !0,
                actions: {
                  start: !0,
                  stop: !0,
                  restart: !0,
                  exec: !0,
                  logs: !0
                },
                features: {
                  ai: !0,
                  hoody_kit: !0,
                  snapshots: !0,
                  networking: !0,
                  kvm: !0,
                  env_values: !0
                }
              },
              projects: {
                create: !0,
                read: !0,
                update: !0,
                delete: !0,
                members: {
                  invite: !0,
                  remove: !0,
                  change_roles: !0
                }
              },
              financial: {
                wallet: {
                  read: !0,
                  transfer: !0,
                  withdraw: !0
                },
                billing: {
                  read: !0,
                  manage_payment_methods: !0,
                  download_invoices: !0
                },
                server_rental: {
                  view_marketplace: !0,
                  rent_servers: !0,
                  extend_rentals: !0,
                  terminate_rentals: !0
                },
                subscriptions: {
                  purchase: !0
                }
              },
              resources: {
                vault: !0,
                events: !0,
                ssh_keys: !0,
                storage_shares: !0,
                proxy_aliases: !0,
                bot_urls: !0,
                firewalls: !0,
                realms: !0,
                auth_token_public_profile: !0,
                read_account: !0,
                create_tokens: !0
              },
              admin: {
                users: !0
              }
            },
            is_enabled: !0,
            expires_at: null,
            ip_whitelist: [],
            vault_access: !1,
            event_access: !0,
            delegation_depth: 0,
            created_at: "2026-10-15T09:00:00.000Z"
          },
          {
            id: "78dde6c478dde6c478dde6c4",
            alias: "sdk-readonly",
            prefix: "hdy_b2e4",
            realm_ids: [],
            allow_no_realm: !0,
            permissions: {
              computers: {
                read: !0
              },
              projects: {
                read: !0
              }
            },
            is_enabled: !0,
            expires_at: "2026-11-20T09:00:00.000Z",
            ip_whitelist: [],
            vault_access: !1,
            event_access: !0,
            delegation_depth: 0,
            created_at: "2026-10-06T09:00:00.000Z"
          },
          {
            id: "171560751715607517156075",
            alias: "laptop-cli",
            prefix: "hdy_c8d0",
            realm_ids: [
              "f1f1f1f1f1f1f1f1f1f1f1f1",
              "f2f2f2f2f2f2f2f2f2f2f2f2"
            ],
            allow_no_realm: !1,
            permissions: {
              computers: {
                create: !0,
                read: !0,
                update: !0,
                delete: !0,
                actions: {
                  start: !0,
                  stop: !0,
                  restart: !0,
                  exec: !0,
                  logs: !0
                },
                features: {
                  ai: !0,
                  hoody_kit: !0,
                  snapshots: !0,
                  networking: !0,
                  kvm: !0,
                  env_values: !0
                }
              },
              projects: {
                create: !0,
                read: !0,
                update: !0,
                delete: !0,
                members: {
                  invite: !0,
                  remove: !0,
                  change_roles: !0
                }
              },
              financial: {
                wallet: {
                  read: !0,
                  transfer: !0,
                  withdraw: !0
                },
                billing: {
                  read: !0,
                  manage_payment_methods: !0,
                  download_invoices: !0
                },
                server_rental: {
                  view_marketplace: !0,
                  rent_servers: !0,
                  extend_rentals: !0,
                  terminate_rentals: !0
                },
                subscriptions: {
                  purchase: !0
                }
              },
              resources: {
                vault: !0,
                events: !0,
                ssh_keys: !0,
                storage_shares: !0,
                proxy_aliases: !0,
                bot_urls: !0,
                firewalls: !0,
                realms: !0,
                auth_token_public_profile: !0,
                read_account: !0,
                create_tokens: !0
              },
              admin: {
                users: !0
              }
            },
            is_enabled: !1,
            expires_at: null,
            ip_whitelist: [],
            vault_access: !1,
            event_access: !0,
            delegation_depth: 0,
            created_at: "2026-09-27T09:00:00.000Z"
          },
          {
            id: "b54cda26b54cda26b54cda26",
            alias: "old-build-bot",
            prefix: "hdy_d114",
            realm_ids: [],
            allow_no_realm: !0,
            permissions: {
              computers: {
                create: !0,
                read: !0,
                update: !0,
                delete: !0,
                actions: {
                  start: !0,
                  stop: !0,
                  restart: !0,
                  exec: !0,
                  logs: !0
                },
                features: {
                  ai: !0,
                  hoody_kit: !0,
                  snapshots: !0,
                  networking: !0,
                  kvm: !0,
                  env_values: !0
                }
              },
              projects: {
                create: !0,
                read: !0,
                update: !0,
                delete: !0,
                members: {
                  invite: !0,
                  remove: !0,
                  change_roles: !0
                }
              },
              financial: {
                wallet: {
                  read: !0,
                  transfer: !0,
                  withdraw: !0
                },
                billing: {
                  read: !0,
                  manage_payment_methods: !0,
                  download_invoices: !0
                },
                server_rental: {
                  view_marketplace: !0,
                  rent_servers: !0,
                  extend_rentals: !0,
                  terminate_rentals: !0
                },
                subscriptions: {
                  purchase: !0
                }
              },
              resources: {
                vault: !0,
                events: !0,
                ssh_keys: !0,
                storage_shares: !0,
                proxy_aliases: !0,
                bot_urls: !0,
                firewalls: !0,
                realms: !0,
                auth_token_public_profile: !0,
                read_account: !0,
                create_tokens: !0
              },
              admin: {
                users: !0
              }
            },
            is_enabled: !0,
            expires_at: "2026-10-02T09:00:00.000Z",
            ip_whitelist: [],
            vault_access: !1,
            event_access: !0,
            delegation_depth: 0,
            created_at: "2026-09-18T09:00:00.000Z"
          },
          {
            id: "538453d7538453d7538453d7",
            alias: "finance-export",
            prefix: "hdy_e52b",
            realm_ids: [
              "f2f2f2f2f2f2f2f2f2f2f2f2"
            ],
            allow_no_realm: !1,
            permissions: {
              financial: {
                billing: {
                  read: !0,
                  download_invoices: !0
                },
                wallet: {
                  read: !0
                }
              }
            },
            is_enabled: !0,
            expires_at: null,
            ip_whitelist: [
              "198.51.100.0/24",
              "203.0.113.9"
            ],
            vault_access: !1,
            event_access: !0,
            delegation_depth: 0,
            created_at: "2026-09-09T09:00:00.000Z"
          }
        ],
        truncated: !1
      }
    },
    {
      leg: "hoody",
      method: "GET",
      url: "/auth/tokens/templates",
      status: 200,
      body: {
        data: [
          {
            name: "full_access",
            permissions: {
              computers: {
                create: !0,
                read: !0,
                update: !0,
                delete: !0,
                actions: {
                  start: !0,
                  stop: !0,
                  restart: !0,
                  exec: !0,
                  logs: !0
                },
                features: {
                  ai: !0,
                  hoody_kit: !0,
                  snapshots: !0,
                  networking: !0,
                  kvm: !0,
                  env_values: !0
                }
              },
              projects: {
                create: !0,
                read: !0,
                update: !0,
                delete: !0,
                members: {
                  invite: !0,
                  remove: !0,
                  change_roles: !0
                }
              },
              financial: {
                wallet: {
                  read: !0,
                  transfer: !0,
                  withdraw: !0
                },
                billing: {
                  read: !0,
                  manage_payment_methods: !0,
                  download_invoices: !0
                },
                server_rental: {
                  view_marketplace: !0,
                  rent_servers: !0,
                  extend_rentals: !0,
                  terminate_rentals: !0
                },
                subscriptions: {
                  purchase: !0
                }
              },
              resources: {
                vault: !0,
                events: !0,
                ssh_keys: !0,
                storage_shares: !0,
                proxy_aliases: !0,
                bot_urls: !0,
                firewalls: !0,
                realms: !0,
                auth_token_public_profile: !0,
                read_account: !0,
                create_tokens: !0
              },
              admin: {
                users: !0
              }
            }
          },
          {
            name: "read_only",
            permissions: {
              computers: {
                read: !0
              },
              projects: {
                read: !0
              }
            }
          },
          {
            name: "dev_team",
            permissions: {
              computers: {
                read: !0,
                update: !0,
                actions: {
                  start: !0,
                  stop: !0,
                  restart: !0,
                  exec: !0,
                  logs: !0
                }
              },
              projects: {
                read: !0
              },
              resources: {
                events: !0
              }
            }
          },
          {
            name: "finance_team",
            permissions: {
              financial: {
                billing: {
                  read: !0,
                  download_invoices: !0
                },
                wallet: {
                  read: !0
                }
              }
            }
          }
        ]
      }
    },
    {
      leg: "hoody",
      method: "GET",
      url: "/computers?limit=100",
      status: 200,
      body: {
        data: {
          computers: [
            {
              id: "c0a7150000000000000000a1",
              name: "atlas",
              status: "running",
              project_id: "6a0000000000000000000001",
              server_id: "5e0000000000000000000012",
              server_name: "n12",
              server: {
                id: "5e0000000000000000000012",
                name: "n12",
                city: "Singapore",
                country: "SG",
                country_name: "Singapore",
                datacenter: "SIN-DC1",
                is_free: !1,
                paid_subserver: !1,
                expires_at: "2026-12-10T09:00:00.000Z",
                specs: {
                  cpu_cores: 4,
                  ram_gb: 8,
                  disk_gb: 200
                }
              },
              realm_ids: [
                "f1f1f1f1f1f1f1f1f1f1f1f1"
              ],
              has_proxy_permissions: !0,
              proxy_permissions_scope: "computer",
              ssh_hostname: "atlas.ssh.hoody.example",
              ssh_public_key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 ada@laptop",
              ssh_key_fingerprint: "SHA256:Xq0hF1x7Uu3mKc5vQf8T0yWb2NnRr4sLgPzEaYdJkHo",
              ssh_key_installed_at: "2026-09-13T09:00:00.000Z",
              snapshot_count: 3,
              last_used_snapshot: null,
              proxy_domains_count: 1,
              ai: !0,
              hoody_kit: !0,
              dev_kit: !0,
              kvm: !1,
              autostart: !0,
              ramdisk: !0,
              computer_image: "debian/13",
              comment: "Main workstation",
              color: "#3B82F6",
              created_at: "2026-09-13T09:00:00.000Z"
            },
            {
              id: "c0a7150000000000000000b2",
              name: "borealis",
              status: "running",
              project_id: "6a0000000000000000000002",
              server_id: "5e0000000000000000000007",
              server_name: "fra-7",
              server: {
                id: "5e0000000000000000000007",
                name: "fra-7",
                city: "Frankfurt",
                country: "DE",
                country_name: "Germany",
                datacenter: "FRA-DC2",
                is_free: !1,
                paid_subserver: !0,
                expires_at: "2026-10-20T09:00:00.000Z",
                specs: {
                  cpu_cores: 2,
                  ram_gb: 4,
                  disk_gb: 80
                }
              },
              realm_ids: [
                "f2f2f2f2f2f2f2f2f2f2f2f2"
              ],
              has_proxy_permissions: !0,
              proxy_permissions_scope: "both",
              ssh_hostname: "borealis.ssh.hoody.example",
              ssh_public_key: "",
              ssh_key_fingerprint: null,
              ssh_key_installed_at: null,
              snapshot_count: 1,
              last_used_snapshot: null,
              proxy_domains_count: 0,
              ai: !0,
              hoody_kit: !0,
              dev_kit: !1,
              kvm: !1,
              autostart: !0,
              ramdisk: !1,
              computer_image: "debian/13",
              comment: "Storefront staging",
              color: "#10B981",
              created_at: "2026-10-02T09:00:00.000Z"
            },
            {
              id: "c0a7150000000000000000c3",
              name: "cedar",
              status: "stopped",
              project_id: "6a0000000000000000000001",
              server_id: "5e0000000000000000000012",
              server_name: "n12",
              server: {
                id: "5e0000000000000000000012",
                name: "n12",
                city: "Singapore",
                country: "SG",
                country_name: "Singapore",
                datacenter: "SIN-DC1",
                is_free: !1,
                paid_subserver: !1,
                expires_at: "2026-12-10T09:00:00.000Z",
                specs: {
                  cpu_cores: 2,
                  ram_gb: 4,
                  disk_gb: 200
                }
              },
              realm_ids: [
                "f1f1f1f1f1f1f1f1f1f1f1f1"
              ],
              has_proxy_permissions: !1,
              proxy_permissions_scope: "none",
              ssh_hostname: "cedar.ssh.hoody.example",
              ssh_public_key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 ada@laptop",
              ssh_key_fingerprint: "SHA256:Xq0hF1x7Uu3mKc5vQf8T0yWb2NnRr4sLgPzEaYdJkHo",
              ssh_key_installed_at: "2026-07-25T09:00:00.000Z",
              snapshot_count: 2,
              last_used_snapshot: null,
              proxy_domains_count: 0,
              ai: !0,
              hoody_kit: !0,
              dev_kit: !0,
              kvm: !1,
              autostart: !0,
              ramdisk: !1,
              computer_image: "debian/13",
              color: "#F59E0B",
              created_at: "2026-07-25T09:00:00.000Z"
            },
            {
              id: "c0a7150000000000000000d4",
              name: "dune",
              status: "creating",
              project_id: "6a0000000000000000000003",
              server_id: "5e0000000000000000000003",
              server_name: "ash-3",
              server: {
                id: "5e0000000000000000000003",
                name: "ash-3",
                city: "Ashburn",
                country: "US",
                country_name: "United States",
                datacenter: "IAD-DC1",
                is_free: !0,
                paid_subserver: !1,
                expires_at: null,
                specs: {
                  cpu_cores: 1,
                  ram_gb: 2,
                  disk_gb: 20
                }
              },
              realm_ids: [
                "f3f3f3f3f3f3f3f3f3f3f3f3"
              ],
              has_proxy_permissions: !0,
              proxy_permissions_scope: "computer",
              ssh_hostname: "dune.ssh.hoody.example",
              ssh_public_key: "",
              ssh_key_fingerprint: null,
              ssh_key_installed_at: null,
              snapshot_count: 0,
              last_used_snapshot: null,
              proxy_domains_count: 0,
              ai: !0,
              hoody_kit: !0,
              dev_kit: !1,
              kvm: !1,
              autostart: !0,
              ramdisk: !1,
              computer_image: "debian/13",
              color: "#EF4444",
              created_at: "2026-10-23T08:57:00.000Z"
            },
            {
              id: "c0a7150000000000000000e5",
              name: "ember",
              status: "failed",
              project_id: "6a0000000000000000000002",
              server_id: "5e0000000000000000000007",
              server_name: "fra-7",
              server: {
                id: "5e0000000000000000000007",
                name: "fra-7",
                city: "Frankfurt",
                country: "DE",
                country_name: "Germany",
                datacenter: "FRA-DC2",
                is_free: !1,
                paid_subserver: !0,
                expires_at: "2026-10-20T09:00:00.000Z",
                specs: {
                  cpu_cores: 2,
                  ram_gb: 4,
                  disk_gb: 80
                }
              },
              realm_ids: [
                "f2f2f2f2f2f2f2f2f2f2f2f2"
              ],
              has_proxy_permissions: !0,
              proxy_permissions_scope: "both",
              ssh_hostname: "ember.ssh.hoody.example",
              ssh_public_key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 ada@laptop",
              ssh_key_fingerprint: "SHA256:Xq0hF1x7Uu3mKc5vQf8T0yWb2NnRr4sLgPzEaYdJkHo",
              ssh_key_installed_at: "2026-10-23T04:00:00.000Z",
              snapshot_count: 1,
              last_used_snapshot: null,
              proxy_domains_count: 0,
              ai: !0,
              hoody_kit: !0,
              dev_kit: !0,
              kvm: !1,
              autostart: !0,
              ramdisk: !1,
              computer_image: "debian/13",
              color: "#8B5CF6",
              created_at: "2026-10-23T04:00:00.000Z"
            },
            {
              id: "c0a7150000000000000000f6",
              name: "fjord",
              status: "paused",
              project_id: "6a0000000000000000000001",
              server_id: "5e0000000000000000000003",
              server_name: "ash-3",
              server: {
                id: "5e0000000000000000000003",
                name: "ash-3",
                city: "Ashburn",
                country: "US",
                country_name: "United States",
                datacenter: "IAD-DC1",
                is_free: !0,
                paid_subserver: !1,
                expires_at: null,
                specs: {
                  cpu_cores: 1,
                  ram_gb: 2,
                  disk_gb: 20
                }
              },
              realm_ids: [
                "f1f1f1f1f1f1f1f1f1f1f1f1"
              ],
              has_proxy_permissions: !1,
              proxy_permissions_scope: "none",
              ssh_hostname: "fjord.ssh.hoody.example",
              ssh_public_key: "",
              ssh_key_fingerprint: null,
              ssh_key_installed_at: null,
              snapshot_count: 2,
              last_used_snapshot: null,
              proxy_domains_count: 0,
              ai: !0,
              hoody_kit: !0,
              dev_kit: !1,
              kvm: !1,
              autostart: !0,
              ramdisk: !1,
              computer_image: "debian/13",
              color: "#EC4899",
              created_at: "2026-10-11T09:00:00.000Z"
            },
            {
              id: "c0a715000000000000000107",
              name: "granite",
              status: "running",
              project_id: "6a0000000000000000000002",
              server_id: "5e0000000000000000000012",
              server_name: "n12",
              server: {
                id: "5e0000000000000000000012",
                name: "n12",
                city: "Singapore",
                country: "SG",
                country_name: "Singapore",
                datacenter: "SIN-DC1",
                is_free: !1,
                paid_subserver: !1,
                expires_at: "2026-12-10T09:00:00.000Z",
                specs: {
                  cpu_cores: 4,
                  ram_gb: 16,
                  disk_gb: 200
                }
              },
              realm_ids: [
                "f2f2f2f2f2f2f2f2f2f2f2f2"
              ],
              has_proxy_permissions: !0,
              proxy_permissions_scope: "computer",
              ssh_hostname: "granite.ssh.hoody.example",
              ssh_public_key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 ada@laptop",
              ssh_key_fingerprint: "SHA256:Xq0hF1x7Uu3mKc5vQf8T0yWb2NnRr4sLgPzEaYdJkHo",
              ssh_key_installed_at: "2026-10-16T09:00:00.000Z",
              snapshot_count: 0,
              last_used_snapshot: null,
              proxy_domains_count: 0,
              ai: !0,
              hoody_kit: !0,
              dev_kit: !0,
              kvm: !1,
              autostart: !0,
              ramdisk: !1,
              computer_image: "debian/13",
              comment: "Acme database",
              color: "#14B8A6",
              created_at: "2026-10-16T09:00:00.000Z"
            },
            {
              id: "c0a715000000000000000118",
              name: "harbor",
              status: "running",
              project_id: "6a0000000000000000000003",
              server_id: "5e0000000000000000000003",
              server_name: "ash-3",
              server: {
                id: "5e0000000000000000000003",
                name: "ash-3",
                city: "Ashburn",
                country: "US",
                country_name: "United States",
                datacenter: "IAD-DC1",
                is_free: !0,
                paid_subserver: !1,
                expires_at: null,
                specs: {
                  cpu_cores: 1,
                  ram_gb: 2,
                  disk_gb: 20
                }
              },
              realm_ids: [
                "f3f3f3f3f3f3f3f3f3f3f3f3"
              ],
              has_proxy_permissions: !0,
              proxy_permissions_scope: "both",
              ssh_hostname: "harbor.ssh.hoody.example",
              ssh_public_key: "",
              ssh_key_fingerprint: null,
              ssh_key_installed_at: null,
              snapshot_count: 1,
              last_used_snapshot: null,
              proxy_domains_count: 0,
              ai: !0,
              hoody_kit: !0,
              dev_kit: !1,
              kvm: !1,
              autostart: !0,
              ramdisk: !1,
              computer_image: "debian/13",
              color: "#F97316",
              created_at: "2026-10-21T09:00:00.000Z"
            }
          ]
        }
      },
      at: "2026-10-23T09:00:00.000Z"
    },
    {
      leg: "hoody",
      method: "GET",
      url: "/computers?page=1&limit=100",
      status: 200,
      body: {
        data: {
          computers: [
            {
              id: "c0a7150000000000000000a1",
              name: "atlas",
              status: "running",
              project_id: "6a0000000000000000000001",
              server_id: "5e0000000000000000000012",
              server_name: "n12",
              server: {
                id: "5e0000000000000000000012",
                name: "n12",
                city: "Singapore",
                country: "SG",
                country_name: "Singapore",
                datacenter: "SIN-DC1",
                is_free: !1,
                paid_subserver: !1,
                expires_at: "2026-12-10T09:00:00.000Z",
                specs: {
                  cpu_cores: 4,
                  ram_gb: 8,
                  disk_gb: 200
                }
              },
              realm_ids: [
                "f1f1f1f1f1f1f1f1f1f1f1f1"
              ],
              has_proxy_permissions: !0,
              proxy_permissions_scope: "computer",
              ssh_hostname: "atlas.ssh.hoody.example",
              ssh_public_key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 ada@laptop",
              ssh_key_fingerprint: "SHA256:Xq0hF1x7Uu3mKc5vQf8T0yWb2NnRr4sLgPzEaYdJkHo",
              ssh_key_installed_at: "2026-09-13T09:00:00.000Z",
              snapshot_count: 3,
              last_used_snapshot: null,
              proxy_domains_count: 1,
              ai: !0,
              hoody_kit: !0,
              dev_kit: !0,
              kvm: !1,
              autostart: !0,
              ramdisk: !0,
              computer_image: "debian/13",
              comment: "Main workstation",
              color: "#3B82F6",
              created_at: "2026-09-13T09:00:00.000Z"
            },
            {
              id: "c0a7150000000000000000b2",
              name: "borealis",
              status: "running",
              project_id: "6a0000000000000000000002",
              server_id: "5e0000000000000000000007",
              server_name: "fra-7",
              server: {
                id: "5e0000000000000000000007",
                name: "fra-7",
                city: "Frankfurt",
                country: "DE",
                country_name: "Germany",
                datacenter: "FRA-DC2",
                is_free: !1,
                paid_subserver: !0,
                expires_at: "2026-10-20T09:00:00.000Z",
                specs: {
                  cpu_cores: 2,
                  ram_gb: 4,
                  disk_gb: 80
                }
              },
              realm_ids: [
                "f2f2f2f2f2f2f2f2f2f2f2f2"
              ],
              has_proxy_permissions: !0,
              proxy_permissions_scope: "both",
              ssh_hostname: "borealis.ssh.hoody.example",
              ssh_public_key: "",
              ssh_key_fingerprint: null,
              ssh_key_installed_at: null,
              snapshot_count: 1,
              last_used_snapshot: null,
              proxy_domains_count: 0,
              ai: !0,
              hoody_kit: !0,
              dev_kit: !1,
              kvm: !1,
              autostart: !0,
              ramdisk: !1,
              computer_image: "debian/13",
              comment: "Storefront staging",
              color: "#10B981",
              created_at: "2026-10-02T09:00:00.000Z"
            },
            {
              id: "c0a7150000000000000000c3",
              name: "cedar",
              status: "stopped",
              project_id: "6a0000000000000000000001",
              server_id: "5e0000000000000000000012",
              server_name: "n12",
              server: {
                id: "5e0000000000000000000012",
                name: "n12",
                city: "Singapore",
                country: "SG",
                country_name: "Singapore",
                datacenter: "SIN-DC1",
                is_free: !1,
                paid_subserver: !1,
                expires_at: "2026-12-10T09:00:00.000Z",
                specs: {
                  cpu_cores: 2,
                  ram_gb: 4,
                  disk_gb: 200
                }
              },
              realm_ids: [
                "f1f1f1f1f1f1f1f1f1f1f1f1"
              ],
              has_proxy_permissions: !1,
              proxy_permissions_scope: "none",
              ssh_hostname: "cedar.ssh.hoody.example",
              ssh_public_key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 ada@laptop",
              ssh_key_fingerprint: "SHA256:Xq0hF1x7Uu3mKc5vQf8T0yWb2NnRr4sLgPzEaYdJkHo",
              ssh_key_installed_at: "2026-07-25T09:00:00.000Z",
              snapshot_count: 2,
              last_used_snapshot: null,
              proxy_domains_count: 0,
              ai: !0,
              hoody_kit: !0,
              dev_kit: !0,
              kvm: !1,
              autostart: !0,
              ramdisk: !1,
              computer_image: "debian/13",
              color: "#F59E0B",
              created_at: "2026-07-25T09:00:00.000Z"
            },
            {
              id: "c0a7150000000000000000d4",
              name: "dune",
              status: "creating",
              project_id: "6a0000000000000000000003",
              server_id: "5e0000000000000000000003",
              server_name: "ash-3",
              server: {
                id: "5e0000000000000000000003",
                name: "ash-3",
                city: "Ashburn",
                country: "US",
                country_name: "United States",
                datacenter: "IAD-DC1",
                is_free: !0,
                paid_subserver: !1,
                expires_at: null,
                specs: {
                  cpu_cores: 1,
                  ram_gb: 2,
                  disk_gb: 20
                }
              },
              realm_ids: [
                "f3f3f3f3f3f3f3f3f3f3f3f3"
              ],
              has_proxy_permissions: !0,
              proxy_permissions_scope: "computer",
              ssh_hostname: "dune.ssh.hoody.example",
              ssh_public_key: "",
              ssh_key_fingerprint: null,
              ssh_key_installed_at: null,
              snapshot_count: 0,
              last_used_snapshot: null,
              proxy_domains_count: 0,
              ai: !0,
              hoody_kit: !0,
              dev_kit: !1,
              kvm: !1,
              autostart: !0,
              ramdisk: !1,
              computer_image: "debian/13",
              color: "#EF4444",
              created_at: "2026-10-23T08:57:00.000Z"
            },
            {
              id: "c0a7150000000000000000e5",
              name: "ember",
              status: "failed",
              project_id: "6a0000000000000000000002",
              server_id: "5e0000000000000000000007",
              server_name: "fra-7",
              server: {
                id: "5e0000000000000000000007",
                name: "fra-7",
                city: "Frankfurt",
                country: "DE",
                country_name: "Germany",
                datacenter: "FRA-DC2",
                is_free: !1,
                paid_subserver: !0,
                expires_at: "2026-10-20T09:00:00.000Z",
                specs: {
                  cpu_cores: 2,
                  ram_gb: 4,
                  disk_gb: 80
                }
              },
              realm_ids: [
                "f2f2f2f2f2f2f2f2f2f2f2f2"
              ],
              has_proxy_permissions: !0,
              proxy_permissions_scope: "both",
              ssh_hostname: "ember.ssh.hoody.example",
              ssh_public_key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 ada@laptop",
              ssh_key_fingerprint: "SHA256:Xq0hF1x7Uu3mKc5vQf8T0yWb2NnRr4sLgPzEaYdJkHo",
              ssh_key_installed_at: "2026-10-23T04:00:00.000Z",
              snapshot_count: 1,
              last_used_snapshot: null,
              proxy_domains_count: 0,
              ai: !0,
              hoody_kit: !0,
              dev_kit: !0,
              kvm: !1,
              autostart: !0,
              ramdisk: !1,
              computer_image: "debian/13",
              color: "#8B5CF6",
              created_at: "2026-10-23T04:00:00.000Z"
            },
            {
              id: "c0a7150000000000000000f6",
              name: "fjord",
              status: "paused",
              project_id: "6a0000000000000000000001",
              server_id: "5e0000000000000000000003",
              server_name: "ash-3",
              server: {
                id: "5e0000000000000000000003",
                name: "ash-3",
                city: "Ashburn",
                country: "US",
                country_name: "United States",
                datacenter: "IAD-DC1",
                is_free: !0,
                paid_subserver: !1,
                expires_at: null,
                specs: {
                  cpu_cores: 1,
                  ram_gb: 2,
                  disk_gb: 20
                }
              },
              realm_ids: [
                "f1f1f1f1f1f1f1f1f1f1f1f1"
              ],
              has_proxy_permissions: !1,
              proxy_permissions_scope: "none",
              ssh_hostname: "fjord.ssh.hoody.example",
              ssh_public_key: "",
              ssh_key_fingerprint: null,
              ssh_key_installed_at: null,
              snapshot_count: 2,
              last_used_snapshot: null,
              proxy_domains_count: 0,
              ai: !0,
              hoody_kit: !0,
              dev_kit: !1,
              kvm: !1,
              autostart: !0,
              ramdisk: !1,
              computer_image: "debian/13",
              color: "#EC4899",
              created_at: "2026-10-11T09:00:00.000Z"
            },
            {
              id: "c0a715000000000000000107",
              name: "granite",
              status: "running",
              project_id: "6a0000000000000000000002",
              server_id: "5e0000000000000000000012",
              server_name: "n12",
              server: {
                id: "5e0000000000000000000012",
                name: "n12",
                city: "Singapore",
                country: "SG",
                country_name: "Singapore",
                datacenter: "SIN-DC1",
                is_free: !1,
                paid_subserver: !1,
                expires_at: "2026-12-10T09:00:00.000Z",
                specs: {
                  cpu_cores: 4,
                  ram_gb: 16,
                  disk_gb: 200
                }
              },
              realm_ids: [
                "f2f2f2f2f2f2f2f2f2f2f2f2"
              ],
              has_proxy_permissions: !0,
              proxy_permissions_scope: "computer",
              ssh_hostname: "granite.ssh.hoody.example",
              ssh_public_key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFixtureKeyOnly0000000000000000 ada@laptop",
              ssh_key_fingerprint: "SHA256:Xq0hF1x7Uu3mKc5vQf8T0yWb2NnRr4sLgPzEaYdJkHo",
              ssh_key_installed_at: "2026-10-16T09:00:00.000Z",
              snapshot_count: 0,
              last_used_snapshot: null,
              proxy_domains_count: 0,
              ai: !0,
              hoody_kit: !0,
              dev_kit: !0,
              kvm: !1,
              autostart: !0,
              ramdisk: !1,
              computer_image: "debian/13",
              comment: "Acme database",
              color: "#14B8A6",
              created_at: "2026-10-16T09:00:00.000Z"
            },
            {
              id: "c0a715000000000000000118",
              name: "harbor",
              status: "running",
              project_id: "6a0000000000000000000003",
              server_id: "5e0000000000000000000003",
              server_name: "ash-3",
              server: {
                id: "5e0000000000000000000003",
                name: "ash-3",
                city: "Ashburn",
                country: "US",
                country_name: "United States",
                datacenter: "IAD-DC1",
                is_free: !0,
                paid_subserver: !1,
                expires_at: null,
                specs: {
                  cpu_cores: 1,
                  ram_gb: 2,
                  disk_gb: 20
                }
              },
              realm_ids: [
                "f3f3f3f3f3f3f3f3f3f3f3f3"
              ],
              has_proxy_permissions: !0,
              proxy_permissions_scope: "both",
              ssh_hostname: "harbor.ssh.hoody.example",
              ssh_public_key: "",
              ssh_key_fingerprint: null,
              ssh_key_installed_at: null,
              snapshot_count: 1,
              last_used_snapshot: null,
              proxy_domains_count: 0,
              ai: !0,
              hoody_kit: !0,
              dev_kit: !1,
              kvm: !1,
              autostart: !0,
              ramdisk: !1,
              computer_image: "debian/13",
              color: "#F97316",
              created_at: "2026-10-21T09:00:00.000Z"
            }
          ]
        }
      },
      at: "2026-10-23T09:00:00.000Z"
    },
    {
      leg: "hoody",
      method: "GET",
      url: "/ip/lookup?ip=203.0.113.148%2C203.0.113.135%2C203.0.113.122%2C203.0.113.109%2C203.0.113.96%2C203.0.113.83%2C203.0.113.70%2C203.0.113.57%2C203.0.113.44%2C203.0.113.31",
      status: 200,
      body: {
        data: {
          "203.0.113.148": {
            ip: "203.0.113.148",
            country: "AU"
          },
          "203.0.113.135": {
            ip: "203.0.113.135",
            country: "BR"
          },
          "203.0.113.122": {
            ip: "203.0.113.122",
            country: "DE"
          },
          "203.0.113.109": {
            ip: "203.0.113.109",
            country: "ZA"
          },
          "203.0.113.96": {
            ip: "203.0.113.96",
            country: "GB"
          },
          "203.0.113.83": null,
          "203.0.113.70": {
            ip: "203.0.113.70",
            country: "FR"
          },
          "203.0.113.57": {
            ip: "203.0.113.57",
            country: "IN"
          },
          "203.0.113.44": {
            ip: "203.0.113.44",
            country: "JP"
          },
          "203.0.113.31": {
            ip: "203.0.113.31",
            country: "US"
          }
        }
      }
    },
    {
      leg: "hoody",
      method: "GET",
      url: "/notifications/summary",
      status: 200,
      body: {
        data: {
          unread_count: 26,
          is_capped: !1,
          unread_cap: 99,
          latest_id: "4e0000000000000000000000",
          latest_created_at: "2026-10-23T02:56:00.000Z",
          poll_interval_seconds: 300
        }
      },
      at: "2026-10-23T09:00:00.000Z"
    },
    {
      leg: "hoody",
      method: "GET",
      url: "/notifications?read_only=true&limit=100&page=1",
      status: 200,
      body: {
        data: [
          {
            id: "4e001e000000000000000000",
            title: "Storage share fancy-marten expires tomorrow",
            message: 'The share "fancy-marten" expires tomorrow.',
            severity: "WARNING",
            type: "STATUS_UPDATE",
            created_at: "2026-10-22T00:26:00.000Z",
            is_read: !0
          },
          {
            id: "4e001f000000000000000000",
            title: "Hoody news: bright-bison",
            message: "Notifications now explain **exactly** what Hoody sends and where you see it: https://hoody.com/notifications.",
            severity: "INFO",
            created_at: "2026-10-21T23:33:00.000Z",
            is_read: !0
          },
          {
            id: "4e0020000000000000000000",
            title: "Computer bold-moose stopped",
            message: "bold-moose stopped after running out of memory on ash-3. Start it again from Computers, or open the logs to see what happened.",
            severity: "ERROR",
            type: "STATUS_UPDATE",
            created_at: "2026-10-21T22:40:00.000Z",
            is_read: !0
          },
          {
            id: "4e0021000000000000000000",
            title: "Payment received for brisk-raven",
            message: "Your payment for brisk-raven was received. Your wallet balance is now $34.50.",
            severity: "SUCCESS",
            type: "BILLING",
            created_at: "2026-10-21T21:47:00.000Z",
            is_read: !0
          },
          {
            id: "4e0022000000000000000000",
            title: "Server clever-koala rental ends in 3 days",
            message: "Your rental of clever-koala ends on Oct 26. Extend it from Market to keep your computers running.",
            severity: "WARNING",
            type: "BILLING",
            created_at: "2026-10-21T20:54:00.000Z",
            is_read: !0
          },
          {
            id: "4e0023000000000000000000",
            title: "Computer gentle-ferret is running",
            message: "gentle-ferret finished being created and is running on ash-3.",
            severity: "SUCCESS",
            type: "STATUS_UPDATE",
            created_at: "2026-10-21T20:01:00.000Z",
            is_read: !0
          },
          {
            id: "4e0024000000000000000000",
            title: "Planned maintenance for fast-ferret",
            message: "The server for fast-ferret restarts between 02:00 and 02:30 UTC. Computers on it are unavailable for about ten minutes.",
            severity: "INFO",
            type: "MAINTENANCE",
            created_at: "2026-10-21T19:08:00.000Z",
            is_read: !0
          },
          {
            id: "4e0025000000000000000000",
            title: "Renewal coming up for fast-fox",
            message: "Your paid server for fast-fox renews in 5 days for $12.00.",
            severity: "INFO",
            type: "BILLING",
            created_at: "2026-10-21T18:15:00.000Z",
            is_read: !0
          },
          {
            id: "4e0026000000000000000000",
            title: "Storage share sleek-magpie expires tomorrow",
            message: 'The share "sleek-magpie" expires tomorrow.',
            severity: "WARNING",
            type: "STATUS_UPDATE",
            created_at: "2026-10-21T17:22:00.000Z",
            is_read: !0
          },
          {
            id: "4e0027000000000000000000",
            title: "Hoody news: rapid-squid",
            message: "Notifications now explain **exactly** what Hoody sends and where you see it: https://hoody.com/notifications.",
            severity: "INFO",
            created_at: "2026-10-21T16:29:00.000Z",
            is_read: !0
          },
          {
            id: "4e0028000000000000000000",
            title: "Computer tidy-ibis stopped",
            message: "tidy-ibis stopped after running out of memory on fra-7. Start it again from Computers, or open the logs to see what happened.",
            severity: "ERROR",
            type: "STATUS_UPDATE",
            created_at: "2026-10-21T15:36:00.000Z",
            is_read: !0
          },
          {
            id: "4e0029000000000000000000",
            title: "Payment received for amber-crane",
            message: "Your payment for amber-crane was received. Your wallet balance is now $34.50.",
            severity: "SUCCESS",
            type: "BILLING",
            created_at: "2026-10-21T14:43:00.000Z",
            is_read: !0
          },
          {
            id: "4e002a000000000000000000",
            title: "Server sunny-moose rental ends in 3 days",
            message: "Your rental of sunny-moose ends on Oct 26. Extend it from Market to keep your computers running.",
            severity: "WARNING",
            type: "BILLING",
            created_at: "2026-10-21T13:50:00.000Z",
            is_read: !0
          },
          {
            id: "4e002b000000000000000000",
            title: "Computer proud-stork is running",
            message: "proud-stork finished being created and is running on fra-7.",
            severity: "SUCCESS",
            type: "STATUS_UPDATE",
            created_at: "2026-10-21T12:57:00.000Z",
            is_read: !0
          },
          {
            id: "4e002c000000000000000000",
            title: "Planned maintenance for epic-gazelle",
            message: "The server for epic-gazelle restarts between 02:00 and 02:30 UTC. Computers on it are unavailable for about ten minutes.",
            severity: "INFO",
            type: "MAINTENANCE",
            created_at: "2026-10-21T12:04:00.000Z",
            is_read: !0
          },
          {
            id: "4e002d000000000000000000",
            title: "Renewal coming up for fast-puffin",
            message: "Your paid server for fast-puffin renews in 5 days for $12.00.",
            severity: "INFO",
            type: "BILLING",
            created_at: "2026-10-21T11:11:00.000Z",
            is_read: !0
          },
          {
            id: "4e002e000000000000000000",
            title: "Storage share proud-llama expires tomorrow",
            message: 'The share "proud-llama" expires tomorrow.',
            severity: "WARNING",
            type: "STATUS_UPDATE",
            created_at: "2026-10-21T10:18:00.000Z",
            is_read: !0
          },
          {
            id: "4e002f000000000000000000",
            title: "Hoody news: zesty-ocelot",
            message: "Notifications now explain **exactly** what Hoody sends and where you see it: https://hoody.com/notifications.",
            severity: "INFO",
            created_at: "2026-10-21T09:25:00.000Z",
            is_read: !0
          },
          {
            id: "4e0030000000000000000000",
            title: "Computer noble-koala stopped",
            message: "noble-koala stopped after running out of memory on n12. Start it again from Computers, or open the logs to see what happened.",
            severity: "ERROR",
            type: "STATUS_UPDATE",
            created_at: "2026-10-21T08:32:00.000Z",
            is_read: !0
          },
          {
            id: "4e0031000000000000000000",
            title: "Payment received for snappy-crane",
            message: "Your payment for snappy-crane was received. Your wallet balance is now $34.50.",
            severity: "SUCCESS",
            type: "BILLING",
            created_at: "2026-10-21T07:39:00.000Z",
            is_read: !0
          },
          {
            id: "4e0032000000000000000000",
            title: "Server happy-yak rental ends in 3 days",
            message: "Your rental of happy-yak ends on Oct 26. Extend it from Market to keep your computers running.",
            severity: "WARNING",
            type: "BILLING",
            created_at: "2026-10-21T06:46:00.000Z",
            is_read: !0
          },
          {
            id: "4e0033000000000000000000",
            title: "Computer bold-sparrow is running",
            message: "bold-sparrow finished being created and is running on n12.",
            severity: "SUCCESS",
            type: "STATUS_UPDATE",
            created_at: "2026-10-21T05:53:00.000Z",
            is_read: !0
          },
          {
            id: "4e0034000000000000000000",
            title: "Planned maintenance for agile-eagle",
            message: "The server for agile-eagle restarts between 02:00 and 02:30 UTC. Computers on it are unavailable for about ten minutes.",
            severity: "INFO",
            type: "MAINTENANCE",
            created_at: "2026-10-21T05:00:00.000Z",
            is_read: !0
          },
          {
            id: "4e0035000000000000000000",
            title: "Renewal coming up for smart-fox",
            message: "Your paid server for smart-fox renews in 5 days for $12.00.",
            severity: "INFO",
            type: "BILLING",
            created_at: "2026-10-21T04:07:00.000Z",
            is_read: !0
          },
          {
            id: "4e0036000000000000000000",
            title: "Storage share bright-fox expires tomorrow",
            message: 'The share "bright-fox" expires tomorrow.',
            severity: "WARNING",
            type: "STATUS_UPDATE",
            created_at: "2026-10-21T03:14:00.000Z",
            is_read: !0
          },
          {
            id: "4e0037000000000000000000",
            title: "Hoody news: brisk-quail",
            message: "Notifications now explain **exactly** what Hoody sends and where you see it: https://hoody.com/notifications.",
            severity: "INFO",
            created_at: "2026-10-21T02:21:00.000Z",
            is_read: !0
          },
          {
            id: "4e0038000000000000000000",
            title: "Computer glad-newt stopped",
            message: "glad-newt stopped after running out of memory on ash-3. Start it again from Computers, or open the logs to see what happened.",
            severity: "ERROR",
            type: "STATUS_UPDATE",
            created_at: "2026-10-21T01:28:00.000Z",
            is_read: !0
          },
          {
            id: "4e0039000000000000000000",
            title: "Payment received for smart-magpie",
            message: "Your payment for smart-magpie was received. Your wallet balance is now $34.50.",
            severity: "SUCCESS",
            type: "BILLING",
            created_at: "2026-10-21T00:35:00.000Z",
            is_read: !0
          },
          {
            id: "4e003a000000000000000000",
            title: "Server fancy-cheetah rental ends in 3 days",
            message: "Your rental of fancy-cheetah ends on Oct 26. Extend it from Market to keep your computers running.",
            severity: "WARNING",
            type: "BILLING",
            created_at: "2026-10-20T23:42:00.000Z",
            is_read: !0
          },
          {
            id: "4e003b000000000000000000",
            title: "Computer golden-parrot is running",
            message: "golden-parrot finished being created and is running on ash-3.",
            severity: "SUCCESS",
            type: "STATUS_UPDATE",
            created_at: "2026-10-20T22:49:00.000Z",
            is_read: !0
          },
          {
            id: "4e003c000000000000000000",
            title: "Planned maintenance for mighty-wombat",
            message: "The server for mighty-wombat restarts between 02:00 and 02:30 UTC. Computers on it are unavailable for about ten minutes.",
            severity: "INFO",
            type: "MAINTENANCE",
            created_at: "2026-10-20T21:56:00.000Z",
            is_read: !0
          },
          {
            id: "4e003d000000000000000000",
            title: "Renewal coming up for tidy-cobra",
            message: "Your paid server for tidy-cobra renews in 5 days for $12.00.",
            severity: "INFO",
            type: "BILLING",
            created_at: "2026-10-20T21:03:00.000Z",
            is_read: !0
          },
          {
            id: "4e003e000000000000000000",
            title: "Storage share quiet-falcon expires tomorrow",
            message: 'The share "quiet-falcon" expires tomorrow.',
            severity: "WARNING",
            type: "STATUS_UPDATE",
            created_at: "2026-10-20T20:10:00.000Z",
            is_read: !0
          },
          {
            id: "4e003f000000000000000000",
            title: "Hoody news: daring-orca",
            message: "Notifications now explain **exactly** what Hoody sends and where you see it: https://hoody.com/notifications.",
            severity: "INFO",
            created_at: "2026-10-20T19:17:00.000Z",
            is_read: !0
          },
          {
            id: "4e0040000000000000000000",
            title: "Computer vivid-marten stopped",
            message: "vivid-marten stopped after running out of memory on fra-7. Start it again from Computers, or open the logs to see what happened.",
            severity: "ERROR",
            type: "STATUS_UPDATE",
            created_at: "2026-10-20T18:24:00.000Z",
            is_read: !0
          },
          {
            id: "4e0041000000000000000000",
            title: "Payment received for kind-magpie",
            message: "Your payment for kind-magpie was received. Your wallet balance is now $34.50.",
            severity: "SUCCESS",
            type: "BILLING",
            created_at: "2026-10-20T17:31:00.000Z",
            is_read: !0
          },
          {
            id: "4e0042000000000000000000",
            title: "Server daring-sparrow rental ends in 3 days",
            message: "Your rental of daring-sparrow ends on Oct 26. Extend it from Market to keep your computers running.",
            severity: "WARNING",
            type: "BILLING",
            created_at: "2026-10-20T16:38:00.000Z",
            is_read: !0
          },
          {
            id: "4e0043000000000000000000",
            title: "Computer deft-tapir is running",
            message: "deft-tapir finished being created and is running on fra-7.",
            severity: "SUCCESS",
            type: "STATUS_UPDATE",
            created_at: "2026-10-20T15:45:00.000Z",
            is_read: !0
          },
          {
            id: "4e0044000000000000000000",
            title: "Planned maintenance for crisp-fox",
            message: "The server for crisp-fox restarts between 02:00 and 02:30 UTC. Computers on it are unavailable for about ten minutes.",
            severity: "INFO",
            type: "MAINTENANCE",
            created_at: "2026-10-20T14:52:00.000Z",
            is_read: !0
          },
          {
            id: "4e0045000000000000000000",
            title: "Renewal coming up for sunny-finch",
            message: "Your paid server for sunny-finch renews in 5 days for $12.00.",
            severity: "INFO",
            type: "BILLING",
            created_at: "2026-10-20T13:59:00.000Z",
            is_read: !0
          }
        ],
        pagination: {
          total: 40,
          totalPages: 1
        }
      },
      at: "2026-10-23T09:00:00.000Z"
    },
    {
      leg: "hoody",
      method: "GET",
      url: "/notifications?unread_only=true&limit=100&page=1",
      status: 200,
      body: {
        data: [
          {
            id: "4e0000000000000000000000",
            title: "Computer atlas stopped",
            message: "atlas stopped after running out of memory on n12. Start it again from Computers, or open the logs to see what happened.",
            severity: "ERROR",
            type: "STATUS_UPDATE",
            created_at: "2026-10-23T02:56:00.000Z",
            is_read: !1
          },
          {
            id: "4e0001000000000000000000",
            title: "Payment received for borealis",
            message: "Your payment for borealis was received. Your wallet balance is now $34.50.",
            severity: "SUCCESS",
            type: "BILLING",
            created_at: "2026-10-23T02:03:00.000Z",
            is_read: !1
          },
          {
            id: "4e0002000000000000000000",
            title: "Server cedar rental ends in 3 days",
            message: "Your rental of cedar ends on Oct 26. Extend it from Market to keep your computers running.",
            severity: "WARNING",
            type: "BILLING",
            created_at: "2026-10-23T01:10:00.000Z",
            is_read: !1
          },
          {
            id: "4e0003000000000000000000",
            title: "Computer dune is running",
            message: "dune finished being created and is running on n12.",
            severity: "SUCCESS",
            type: "STATUS_UPDATE",
            created_at: "2026-10-23T00:17:00.000Z",
            is_read: !1
          },
          {
            id: "4e0004000000000000000000",
            title: "Planned maintenance for ember",
            message: "The server for ember restarts between 02:00 and 02:30 UTC. Computers on it are unavailable for about ten minutes.",
            severity: "INFO",
            type: "MAINTENANCE",
            created_at: "2026-10-22T23:24:00.000Z",
            is_read: !1
          },
          {
            id: "4e0005000000000000000000",
            title: "Renewal coming up for fjord",
            message: "Your paid server for fjord renews in 5 days for $12.00.",
            severity: "INFO",
            type: "BILLING",
            created_at: "2026-10-22T22:31:00.000Z",
            is_read: !1
          },
          {
            id: "4e0006000000000000000000",
            title: "Storage share granite expires tomorrow",
            message: 'The share "granite" expires tomorrow.',
            severity: "WARNING",
            type: "STATUS_UPDATE",
            created_at: "2026-10-22T21:38:00.000Z",
            is_read: !1
          },
          {
            id: "4e0007000000000000000000",
            title: "Hoody news: harbor",
            message: "Notifications now explain **exactly** what Hoody sends and where you see it: https://hoody.com/notifications.",
            severity: "INFO",
            created_at: "2026-10-22T20:45:00.000Z",
            is_read: !1
          },
          {
            id: "4e0008000000000000000000",
            title: "Computer golden-gazelle stopped",
            message: "golden-gazelle stopped after running out of memory on ash-3. Start it again from Computers, or open the logs to see what happened.",
            severity: "ERROR",
            type: "STATUS_UPDATE",
            created_at: "2026-10-22T19:52:00.000Z",
            is_read: !1
          },
          {
            id: "4e0009000000000000000000",
            title: "Payment received for rapid-raven",
            message: "Your payment for rapid-raven was received. Your wallet balance is now $34.50.",
            severity: "SUCCESS",
            type: "BILLING",
            created_at: "2026-10-22T18:59:00.000Z",
            is_read: !1
          },
          {
            id: "4e000a000000000000000000",
            title: "Server proud-koala rental ends in 3 days",
            message: "Your rental of proud-koala ends on Oct 26. Extend it from Market to keep your computers running.",
            severity: "WARNING",
            type: "BILLING",
            created_at: "2026-10-22T18:06:00.000Z",
            is_read: !1
          },
          {
            id: "4e000b000000000000000000",
            title: "Computer gentle-raven is running",
            message: "gentle-raven finished being created and is running on ash-3.",
            severity: "SUCCESS",
            type: "STATUS_UPDATE",
            created_at: "2026-10-22T17:13:00.000Z",
            is_read: !1
          },
          {
            id: "4e000c000000000000000000",
            title: "Planned maintenance for dandy-coyote",
            message: "The server for dandy-coyote restarts between 02:00 and 02:30 UTC. Computers on it are unavailable for about ten minutes.",
            severity: "INFO",
            type: "MAINTENANCE",
            created_at: "2026-10-22T16:20:00.000Z",
            is_read: !1
          },
          {
            id: "4e000d000000000000000000",
            title: "Renewal coming up for witty-raven",
            message: "Your paid server for witty-raven renews in 5 days for $12.00.",
            severity: "INFO",
            type: "BILLING",
            created_at: "2026-10-22T15:27:00.000Z",
            is_read: !1
          },
          {
            id: "4e000e000000000000000000",
            title: "Storage share cosmic-bison expires tomorrow",
            message: 'The share "cosmic-bison" expires tomorrow.',
            severity: "WARNING",
            type: "STATUS_UPDATE",
            created_at: "2026-10-22T14:34:00.000Z",
            is_read: !1
          },
          {
            id: "4e000f000000000000000000",
            title: "Hoody news: gentle-panda",
            message: "Notifications now explain **exactly** what Hoody sends and where you see it: https://hoody.com/notifications.",
            severity: "INFO",
            created_at: "2026-10-22T13:41:00.000Z",
            is_read: !1
          },
          {
            id: "4e0010000000000000000000",
            title: "Computer quiet-ocelot stopped",
            message: "quiet-ocelot stopped after running out of memory on fra-7. Start it again from Computers, or open the logs to see what happened.",
            severity: "ERROR",
            type: "STATUS_UPDATE",
            created_at: "2026-10-22T12:48:00.000Z",
            is_read: !1
          },
          {
            id: "4e0011000000000000000000",
            title: "Payment received for brisk-jaguar",
            message: "Your payment for brisk-jaguar was received. Your wallet balance is now $34.50.",
            severity: "SUCCESS",
            type: "BILLING",
            created_at: "2026-10-22T11:55:00.000Z",
            is_read: !1
          },
          {
            id: "4e0012000000000000000000",
            title: "Server steady-squid rental ends in 3 days",
            message: "Your rental of steady-squid ends on Oct 26. Extend it from Market to keep your computers running.",
            severity: "WARNING",
            type: "BILLING",
            created_at: "2026-10-22T11:02:00.000Z",
            is_read: !1
          },
          {
            id: "4e0013000000000000000000",
            title: "Computer mighty-dolphin is running",
            message: "mighty-dolphin finished being created and is running on fra-7.",
            severity: "SUCCESS",
            type: "STATUS_UPDATE",
            created_at: "2026-10-22T10:09:00.000Z",
            is_read: !1
          },
          {
            id: "4e0014000000000000000000",
            title: "Planned maintenance for snappy-squid",
            message: "The server for snappy-squid restarts between 02:00 and 02:30 UTC. Computers on it are unavailable for about ten minutes.",
            severity: "INFO",
            type: "MAINTENANCE",
            created_at: "2026-10-22T09:16:00.000Z",
            is_read: !1
          },
          {
            id: "4e0015000000000000000000",
            title: "Renewal coming up for gentle-yak",
            message: "Your paid server for gentle-yak renews in 5 days for $12.00.",
            severity: "INFO",
            type: "BILLING",
            created_at: "2026-10-22T08:23:00.000Z",
            is_read: !1
          },
          {
            id: "4e0016000000000000000000",
            title: "Storage share smart-wombat expires tomorrow",
            message: 'The share "smart-wombat" expires tomorrow.',
            severity: "WARNING",
            type: "STATUS_UPDATE",
            created_at: "2026-10-22T07:30:00.000Z",
            is_read: !1
          },
          {
            id: "4e0017000000000000000000",
            title: "Hoody news: swift-cheetah",
            message: "Notifications now explain **exactly** what Hoody sends and where you see it: https://hoody.com/notifications.",
            severity: "INFO",
            created_at: "2026-10-22T06:37:00.000Z",
            is_read: !1
          },
          {
            id: "4e0018000000000000000000",
            title: "Computer happy-finch stopped",
            message: "happy-finch stopped after running out of memory on n12. Start it again from Computers, or open the logs to see what happened.",
            severity: "ERROR",
            type: "STATUS_UPDATE",
            created_at: "2026-10-22T05:44:00.000Z",
            is_read: !1
          },
          {
            id: "4e0019000000000000000000",
            title: "Payment received for agile-sparrow",
            message: "Your payment for agile-sparrow was received. Your wallet balance is now $34.50.",
            severity: "SUCCESS",
            type: "BILLING",
            created_at: "2026-10-22T04:51:00.000Z",
            is_read: !1
          }
        ],
        pagination: {
          total: 26,
          totalPages: 1
        }
      },
      at: "2026-10-23T09:00:00.000Z"
    },
    {
      leg: "hoody",
      method: "GET",
      url: "/projects?limit=100",
      status: 200,
      body: {
        data: {
          projects: [
            {
              id: "6a0000000000000000000001",
              alias: "Home base",
              color: "#3B82F6",
              realm_ids: [
                "f1f1f1f1f1f1f1f1f1f1f1f1"
              ],
              is_default: !0,
              user_id: "64f0ada00000000000000001"
            },
            {
              id: "6a0000000000000000000002",
              alias: "Acme storefront",
              color: "#10B981",
              realm_ids: [
                "f2f2f2f2f2f2f2f2f2f2f2f2"
              ],
              is_default: !1,
              user_id: "64f0ada00000000000000001"
            },
            {
              id: "6a0000000000000000000003",
              alias: "Experiments",
              color: "#F59E0B",
              realm_ids: [
                "f3f3f3f3f3f3f3f3f3f3f3f3"
              ],
              is_default: !1,
              user_id: "64f0ada00000000000000001"
            }
          ]
        }
      }
    },
    {
      leg: "hoody",
      method: "GET",
      url: "/proxy/aliases?computer_id=c0a7150000000000000000a1",
      status: 200,
      body: {
        data: {
          aliases: [
            {
              id: "al-web",
              alias: "shop-front",
              url: "https://shop-front.custom-domain.example.test/",
              index: 3000,
              program: "http",
              created_at: "2026-10-20T10:00:00Z"
            },
            {
              id: "al-term",
              alias: "term-desk",
              url: "https://term-desk.custom-domain.example.test/",
              index: 3000,
              program: "terminal",
              created_at: "2026-10-20T10:00:00Z"
            },
            {
              id: "al-api",
              alias: "api-two",
              url: "https://api-two.custom-domain.example.test/v1",
              index: 8001,
              program: "https",
              created_at: "2026-10-20T10:00:00Z"
            },
            {
              id: "al-old",
              alias: "api-four",
              url: "https://api-four.custom-domain.example.test/",
              index: 8003,
              created_at: "2026-10-20T10:00:00Z"
            },
            {
              id: "al-sys",
              alias: "agent-door",
              url: "https://agent-door.custom-domain.example.test/",
              index: 15000,
              program: "http",
              created_at: "2026-10-20T10:00:00Z"
            }
          ]
        }
      },
      at: "2026-10-23T09:00:00.000Z"
    },
    {
      leg: "hoody",
      method: "GET",
      url: "/realms?include_usage=true",
      status: 200,
      body: {
        data: {
          realm_ids: [
            "f1f1f1f1f1f1f1f1f1f1f1f1",
            "f2f2f2f2f2f2f2f2f2f2f2f2",
            "f3f3f3f3f3f3f3f3f3f3f3f3"
          ],
          usage: {
            f1f1f1f1f1f1f1f1f1f1f1f1: {
              computers: 3
            },
            f2f2f2f2f2f2f2f2f2f2f2f2: {
              computers: 3
            },
            f3f3f3f3f3f3f3f3f3f3f3f3: {
              computers: 2
            }
          }
        }
      }
    },
    {
      leg: "hoody",
      method: "GET",
      url: "/referrals/me",
      status: 200,
      body: {
        data: {
          eligible: !0,
          enrolled: !0,
          state: "active",
          enrolment_open: !0,
          level: "referrer",
          rate_percent: "5",
          creator_threshold_active_customers: 11,
          creator_rate_percent: "10",
          creator_customers: "fewer_than_3",
          codes: [
            {
              code: "k7m2q9xa",
              kind: "random",
              state: "active",
              link: "https://api.demo.invalid/auth/signup?ref=k7m2q9xa"
            },
            {
              code: "maya-builds",
              kind: "vanity",
              state: "active",
              link: "https://api.demo.invalid/auth/signup?ref=maya-builds"
            }
          ],
          vanity_codes_left: 2,
          counts: {
            signed_up: "7",
            paying: "fewer_than_3",
            active: "fewer_than_3"
          },
          credit: {
            pending: "8.00",
            available: "12.40",
            reversed: "0.00",
            owed: "0.00"
          },
          monthly: [
            {
              month: "2026-10",
              earned: "6.40",
              reversed: "0.00"
            },
            {
              month: "2026-09",
              earned: "9.00",
              reversed: "0.00"
            },
            {
              month: "2026-07",
              earned: "5.00",
              reversed: "0.00"
            }
          ],
          next_release_at: "2026-12-03T00:00:00.000Z"
        }
      }
    },
    {
      leg: "hoody",
      method: "GET",
      url: "/reservations?limit=200&offset=0",
      status: 200,
      body: {
        statusCode: 200,
        data: [
          {
            id: "r01",
            state: "pending",
            days: 30,
            total_paid_cents: 17800,
            delivery_hours_quoted: 72,
            setup_time_minutes_quoted: 30,
            hold_days_quoted: 10,
            rental_cents: 15300,
            setup_fee_cents: 2500,
            server_id: null,
            rental_id: null,
            ready_by: "2026-11-14T09:00:00.000Z",
            created_at: "2026-11-09T09:00:00.000Z",
            offer_snapshot: {
              name: "Frankfurt XL",
              cpu_cores: 24,
              ram_gb: 256,
              disks: [
                {
                  capacity_gb: 3840,
                  count: 1
                }
              ]
            }
          },
          {
            id: "r02",
            state: "pending",
            days: 90,
            total_paid_cents: 84900,
            delivery_hours_quoted: 72,
            setup_time_minutes_quoted: 30,
            hold_days_quoted: 14,
            rental_cents: 14900,
            setup_fee_cents: 2900,
            server_id: null,
            rental_id: null,
            ready_by: "2026-11-09T09:00:00.000Z",
            created_at: "2026-11-02T09:00:00.000Z",
            offer_snapshot: {
              name: "Ashburn XL",
              cpu_cores: 32,
              ram_gb: 512,
              disks: [
                {
                  capacity_gb: 7680,
                  count: 1
                }
              ]
            }
          },
          {
            id: "r03",
            state: "fulfilled",
            days: 30,
            total_paid_cents: 8300,
            delivery_hours_quoted: 48,
            setup_time_minutes_quoted: 20,
            hold_days_quoted: 0,
            rental_cents: 6900,
            setup_fee_cents: 1400,
            server_id: "64b0c0ffee0000000000a003",
            rental_id: "64b0c0ffee0000000000b003",
            ready_by: "2026-11-06T09:00:00.000Z",
            created_at: "2026-11-03T09:00:00.000Z",
            offer_snapshot: {
              name: "Singapore XL",
              cpu_cores: 6,
              ram_gb: 64,
              disks: [
                {
                  capacity_gb: 1000,
                  count: 1
                }
              ]
            }
          },
          {
            id: "r04",
            state: "refunded",
            days: 90,
            total_paid_cents: 41900,
            delivery_hours_quoted: 72,
            setup_time_minutes_quoted: 30,
            hold_days_quoted: 14,
            rental_cents: 14900,
            setup_fee_cents: 2900,
            server_id: null,
            rental_id: null,
            ready_by: null,
            created_at: "2026-10-12T09:00:00.000Z",
            offer_snapshot: {
              name: "Frankfurt XL",
              cpu_cores: 24,
              ram_gb: 256,
              disks: [
                {
                  capacity_gb: 3840,
                  count: 1
                }
              ]
            }
          },
          {
            id: "r05",
            state: "fulfilled",
            days: null,
            server_id: null,
            rental_id: null,
            ready_by: null,
            created_at: "2026-09-12T09:00:00.000Z",
            offer_snapshot: {
              name: "Tokyo L"
            }
          }
        ],
        total: 5
      }
    },
    {
      leg: "hoody",
      method: "GET",
      url: "/servers",
      status: 200,
      body: {
        data: [
          {
            server_id: "5e0000000000000000000012",
            server: {
              id: "5e0000000000000000000012",
              name: "n12",
              city: "Singapore",
              country: "SG",
              specs: {
                cpu_cores: 16,
                ram_gb: 64,
                disk_gb: 1000
              },
              is_vm: !1
            },
            is_free_tier: !1,
            remaining_days: 18,
            status: "active"
          },
          {
            server_id: "5e0000000000000000000007",
            server: {
              id: "5e0000000000000000000007",
              name: "fra-7",
              city: "Frankfurt",
              country: "DE",
              specs: {
                cpu_cores: 8,
                ram_gb: 32,
                disk_gb: 500
              },
              is_vm: !0
            },
            is_free_tier: !1,
            remaining_days: 3,
            status: "active"
          },
          {
            server_id: "5e0000000000000000000003",
            server: {
              id: "5e0000000000000000000003",
              name: "ash-3",
              city: "Ashburn",
              country: "US",
              specs: {
                cpu_cores: 4,
                ram_gb: 8,
                disk_gb: 160
              },
              is_vm: !0
            },
            is_free_tier: !0,
            remaining_days: null,
            status: "active"
          }
        ]
      }
    },
    {
      leg: "hoody",
      method: "GET",
      url: "/subserver-subscriptions?limit=50",
      status: 200,
      body: {
        data: [
          {
            id: "sub_n12",
            state: "active",
            plan: {
              title: "Large"
            },
            server_name: "n12",
            paid_through: "2026-12-10T09:00:00.000Z",
            auto_renew: !0
          },
          {
            id: "sub_fra7",
            state: "past_due",
            plan: {
              title: "Medium"
            },
            server_name: "fra-7",
            paid_through: "2026-10-20T09:00:00.000Z",
            auto_renew: !1
          }
        ],
        total: 2,
        limit: 50,
        offset: 0
      },
      at: "2026-10-23T09:00:00.000Z"
    },
    {
      leg: "hoody",
      method: "GET",
      url: "/support/tickets?limit=20",
      status: 200,
      body: {
        data: {
          tickets: [
            {
              id: "00000000000000006720a1b3",
              subject: "Computer will not start after resize",
              category: "computers",
              status: "waiting_user",
              terminal: !1,
              unread: !0,
              created_at: "2026-11-02T02:30:00.000Z",
              last_message_at: "2026-11-02T12:30:00.000Z",
              closed_at: null,
              reopenable: !1
            },
            {
              id: "00000000000000006720a1b4",
              subject: "Invoice shows the wrong country",
              category: "billing",
              status: "open",
              terminal: !1,
              unread: !1,
              created_at: "2026-11-02T01:00:00.000Z",
              last_message_at: "2026-11-02T11:30:00.000Z",
              closed_at: null,
              reopenable: !1
            },
            {
              id: "00000000000000006720a1b6",
              subject: "Refund for the October charge",
              category: "billing",
              status: "closed",
              terminal: !1,
              unread: !0,
              created_at: "2026-11-01T22:00:00.000Z",
              last_message_at: "2026-11-02T09:30:00.000Z",
              closed_at: "2026-11-02T10:00:00.000Z",
              reopenable: !0
            },
            {
              id: "00000000000000006720a1b5",
              subject: "How do I add a domain?",
              category: "networking",
              status: "closed",
              terminal: !1,
              unread: !1,
              created_at: "2026-11-01T23:30:00.000Z",
              last_message_at: "2026-11-02T10:30:00.000Z",
              closed_at: "2026-11-01T04:40:00.000Z",
              reopenable: !0
            },
            {
              id: "00000000000000006720a1b7",
              subject: "Old question about bots",
              category: "bots",
              status: "closed",
              terminal: !0,
              unread: !1,
              created_at: "2026-11-01T20:30:00.000Z",
              last_message_at: "2026-11-02T08:30:00.000Z",
              closed_at: "2026-09-01T02:00:00.000Z",
              reopenable: !1
            },
            {
              id: "00000000000000006720a1b8",
              subject: "<b>bold</b> **subject**",
              category: "bug",
              status: "open",
              terminal: !1,
              unread: !1,
              created_at: "2026-11-01T19:00:00.000Z",
              last_message_at: "2026-11-02T07:30:00.000Z",
              closed_at: null,
              reopenable: !1
            },
            {
              id: "00000000000000006720a1b9",
              subject: "A ticket with many messages",
              category: "ai",
              status: "open",
              terminal: !1,
              unread: !1,
              created_at: "2026-11-01T17:30:00.000Z",
              last_message_at: "2026-11-02T06:30:00.000Z",
              closed_at: null,
              reopenable: !1
            }
          ],
          next_cursor: null
        }
      }
    },
    {
      leg: "hoody",
      method: "GET",
      url: "/support/tickets?limit=50",
      status: 200,
      body: {
        data: {
          tickets: [
            {
              id: "00000000000000006720a1b3",
              subject: "Computer will not start after resize",
              category: "computers",
              status: "waiting_user",
              terminal: !1,
              unread: !0,
              created_at: "2026-11-02T02:30:00.000Z",
              last_message_at: "2026-11-02T12:30:00.000Z",
              closed_at: null,
              reopenable: !1
            },
            {
              id: "00000000000000006720a1b4",
              subject: "Invoice shows the wrong country",
              category: "billing",
              status: "open",
              terminal: !1,
              unread: !1,
              created_at: "2026-11-02T01:00:00.000Z",
              last_message_at: "2026-11-02T11:30:00.000Z",
              closed_at: null,
              reopenable: !1
            },
            {
              id: "00000000000000006720a1b6",
              subject: "Refund for the October charge",
              category: "billing",
              status: "closed",
              terminal: !1,
              unread: !0,
              created_at: "2026-11-01T22:00:00.000Z",
              last_message_at: "2026-11-02T09:30:00.000Z",
              closed_at: "2026-11-02T10:00:00.000Z",
              reopenable: !0
            },
            {
              id: "00000000000000006720a1b5",
              subject: "How do I add a domain?",
              category: "networking",
              status: "closed",
              terminal: !1,
              unread: !1,
              created_at: "2026-11-01T23:30:00.000Z",
              last_message_at: "2026-11-02T10:30:00.000Z",
              closed_at: "2026-11-01T04:40:00.000Z",
              reopenable: !0
            },
            {
              id: "00000000000000006720a1b7",
              subject: "Old question about bots",
              category: "bots",
              status: "closed",
              terminal: !0,
              unread: !1,
              created_at: "2026-11-01T20:30:00.000Z",
              last_message_at: "2026-11-02T08:30:00.000Z",
              closed_at: "2026-09-01T02:00:00.000Z",
              reopenable: !1
            },
            {
              id: "00000000000000006720a1b8",
              subject: "<b>bold</b> **subject**",
              category: "bug",
              status: "open",
              terminal: !1,
              unread: !1,
              created_at: "2026-11-01T19:00:00.000Z",
              last_message_at: "2026-11-02T07:30:00.000Z",
              closed_at: null,
              reopenable: !1
            },
            {
              id: "00000000000000006720a1b9",
              subject: "A ticket with many messages",
              category: "ai",
              status: "open",
              terminal: !1,
              unread: !1,
              created_at: "2026-11-01T17:30:00.000Z",
              last_message_at: "2026-11-02T06:30:00.000Z",
              closed_at: null,
              reopenable: !1
            }
          ],
          next_cursor: null
        }
      }
    },
    {
      leg: "hoody",
      method: "GET",
      url: "/users/auth/me",
      status: 200,
      body: {
        data: {
          id: "64f0ada00000000000000001",
          username: "ada",
          email: "ada@example.com",
          is_banned: !1
        }
      }
    },
    {
      leg: "hoody",
      method: "GET",
      url: "/vault/keys/hoody.realm-aliases",
      status: 200,
      body: {
        data: {
          value: '{"f1f1f1f1f1f1f1f1f1f1f1f1":"Personal","f2f2f2f2f2f2f2f2f2f2f2f2":"Acme client","f3f3f3f3f3f3f3f3f3f3f3f3":"Lab"}'
        }
      },
      etag: '"names-1"'
    },
    {
      leg: "hoody",
      method: "GET",
      url: "/vault/keys?realm_id=f1f1f1f1f1f1f1f1f1f1f1f1",
      status: 200,
      body: {
        statusCode: 200,
        data: [
          {
            key: "github-token",
            realm_id: "f1f1f1f1f1f1f1f1f1f1f1f1",
            metadata: null,
            size_bytes: 32,
            created_at: "2026-10-20T09:15:00.000Z",
            updated_at: "2026-10-23T16:40:00.000Z"
          },
          {
            key: "db-password",
            realm_id: "f1f1f1f1f1f1f1f1f1f1f1f1",
            metadata: {
              encrypted: !0
            },
            size_bytes: 251,
            created_at: "2026-10-20T09:15:00.000Z",
            updated_at: "2026-10-23T16:40:00.000Z"
          },
          {
            key: "deploy.notes",
            realm_id: "f1f1f1f1f1f1f1f1f1f1f1f1",
            metadata: {
              owner: "ops"
            },
            size_bytes: 44,
            created_at: "2026-10-20T09:15:00.000Z",
            updated_at: "2026-10-23T16:40:00.000Z"
          }
        ]
      },
      at: "2026-10-23T16:40:00.000Z"
    },
    {
      leg: "hoody",
      method: "GET",
      url: "/vault/stats?realm_id=f1f1f1f1f1f1f1f1f1f1f1f1",
      status: 200,
      body: {
        statusCode: 200,
        data: {
          total_keys: 3,
          total_size_bytes: 327,
          total_size_mb: 0.00031185150146484375,
          limit_mb: 50,
          used_percentage: 3.2,
          remaining_mb: 48.4
        }
      }
    }
  ]
};

// scripts/term/build/demo-client.ts
var br = Symbol.for("hoody.term.demoClient"), q = i0, ue = (e) => e.replace(/[?#].*$/s, ""), vr = /* @__PURE__ */ new Set(["limit", "order", "sort", "json", "include_usage"]);
function c0(e) {
  let t = e.replace(/#.*$/s, "").split("?")[1] ?? "";
  return [...new URLSearchParams(t)].filter(([s, r]) => !vr.has(s) && !(s === "page" && r === "1" || s === "offset" && r === "0")).map(([s, r]) => `${s}=${r}`).sort().join("&");
}
var je = /* @__PURE__ */ new Map, Be = /* @__PURE__ */ new Map;
for (let e of q.records) {
  let t = `${e.leg} ${e.method} `;
  if (!je.has(t + e.url))
    je.set(t + e.url, e);
  let s = `${t}${ue(e.url)} ${c0(e.url)}`;
  if (!Be.has(s))
    Be.set(s, e);
}
var W = (e, t) => je.get(`${e} GET ${t}`) ?? Be.get(`${e} GET ${ue(t)} ${c0(t)}`), kr = (e) => e.replace(/([?&]realm=)all(?=&|#|$)/, `$1${q.context.realmId}`), d0 = (e, t) => W(e, t) ?? (e === "fetch" ? W(e, kr(t)) : void 0), z = (e, t) => {
  let s = e?.body?.data, r = t ? s?.[t] : s;
  return Array.isArray(r) ? r : [];
}, Ue = (e) => {
  let t = { ...e.server ?? {} };
  delete t.id;
  let s = Wt(String(e.id));
  return { ...e, server: t, ...s ? { proxy_permissions_computer_state: s } : {} };
}, l0 = (e) => ({ total: e.length, page: 1, limit: 100, totalPages: e.length > 0 ? 1 : 0 });
function wr(e) {
  let t = ue(e), s = new URLSearchParams(e.replace(/#.*$/s, "").split("?")[1] ?? ""), r = [...s.keys()].filter((i) => i !== "page" && i !== "limit"), n = W("hoody", "/computers?limit=100"), o = (i, d) => ({ body: { statusCode: 200, message: "OK", data: i }, from: d }), a;
  if (n && (a = /^\/computers\/([0-9a-f]{24})$/.exec(t)) && r.every((i) => i === "runtime")) {
    let i = z(n, "computers").find((u) => u.id === a[1]);
    if (!i)
      return;
    let d = s.get("runtime") === "true" ? { runtime_info: i.status === "running" ? a0(String(i.id)) : null } : {};
    return o({ ...Ue(i), ...d }, n);
  }
  if (n && t === "/computers" && r.length === 1 && r[0] === "realm_id") {
    let i = z(n, "computers").filter((d) => Array.isArray(d.realm_ids) && d.realm_ids.includes(s.get("realm_id"))).map(Ue);
    return o({ computers: i, pagination: l0(i) }, n);
  }
  if (n && (a = /^\/projects\/([0-9a-f]{24})\/computers$/.exec(t)) && r.every((i) => i === "include_expired" || i === "include_deleting")) {
    if (!z(W("hoody", "/projects?limit=100"), "projects").some((d) => d.id === a[1]))
      return;
    let i = z(n, "computers").filter((d) => d.project_id === a[1]).map((d) => {
      let u = { ...Ue(d), server_expired: !1 };
      return delete u.ramdisk, u;
    });
    return o({ computers: i, pagination: l0(i) }, n);
  }
  if ((a = /^\/vault\/keys\/([^/]+)$/.exec(t)) && r.length === 1 && r[0] === "realm_id") {
    let i = W("hoody", `/vault/keys?realm_id=${s.get("realm_id")}`), d = decodeURIComponent(a[1]), u = z(i).find((c) => c.key === d), l = Ft[d];
    return i && u && l !== void 0 ? o({ ...u, value: l }, i) : void 0;
  }
  return;
}
var Sr = "realms.demo.invalid", Tr = /^https:\/\/([0-9a-f]{24})\.realms\.demo\.invalid\/api\/v1$/, Ar = (e) => e === void 0 ? null : Tr.exec(e)?.[1] ?? null;
function Er(e, t, s) {
  let r = z(W("hoody", `/${t}?limit=100`), t).find((n) => n.id === s);
  return r === void 0 ? void 0 : Array.isArray(r.realm_ids) && r.realm_ids.includes(e);
}
function xr(e, t) {
  let s = new URLSearchParams(t.replace(/#.*$/s, "").split("?")[1] ?? ""), r = [["computers", s.get("computer_id")], ["projects", s.get("project_id")]], n = /^\/(computers|projects)\/([0-9a-f]{24})(?:\/|$)/.exec(ue(t));
  if (n)
    r.push([n[1], n[2]]);
  return r.some(([o, a]) => a !== null && Er(e, o, a) === !1);
}
var Rr = { "/computers": "computers", "/projects": "projects", "/events": "events" };
function Or(e, t, s) {
  let r = Rr[ue(t)], n = s?.data, o = r && n && typeof n === "object" ? n[r] : void 0;
  if (!r || !Array.isArray(o))
    return s;
  let a = o.filter((u) => Array.isArray(u.realm_ids) && u.realm_ids.includes(e)), i = { ...n, [r]: a }, d = i.pagination;
  if (d && typeof d === "object")
    i.pagination = { ...d, total: a.length, ..."totalPages" in d ? { totalPages: a.length > 0 ? 1 : 0 } : {}, ..."has_more" in d ? { has_more: !1 } : {} };
  return { ...s, data: i };
}
var Ir = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/, Nr = /(_at|At|mtime|_time)$/, Dr = Date.parse(q.recordedAt), Mr = 157680000000, Cr = (e, t) => Nr.test(e) && Number.isFinite(t) && Math.abs(t - Dr) <= Mr;
function le(e, t, s = "") {
  if (typeof e === "string")
    return Ir.test(e) ? new Date(Date.parse(e) + t).toISOString() : e;
  if (typeof e === "number")
    return Cr(s, e) ? e + t : e;
  if (Array.isArray(e))
    return e.map((r) => le(r, t, s));
  if (e && typeof e === "object")
    return Object.fromEntries(Object.entries(e).map(([r, n]) => [r, le(n, t, r)]));
  return e;
}
var u0 = () => ({ status: 0, notSent: !0, code: "DEMO_READ_ONLY" }), f0 = Object.freeze({ profile: "demo", ...q.context });
function m0(e = Date.now) {
  let t = (s) => e() - Date.parse(s.at ?? q.recordedAt);
  return {
    [br]: !0,
    identity: { kind: "account", uid: q.account, sid: "demo" },
    realmApiDomain: Sr,
    async request(s, r, n, o) {
      if (s !== "GET")
        throw u0();
      if (o?.beforeWire && !o.beforeWire())
        throw { status: 0, notSent: !0, stale: !0 };
      let a = Ar(o?.base);
      if (a !== null && xr(a, r))
        throw { status: 404, code: "NOT_FOUND" };
      let i = (l) => a === null ? l : Or(a, r, l), d = Zt(s, r, e());
      if (d)
        return o?.onEtag?.(null), i(d);
      let u = d0("hoody", r);
      if (!u) {
        let l = wr(r);
        if (!l)
          throw { status: 404, code: "NOT_FOUND" };
        return o?.onEtag?.(null), i(le(l.body, t(l.from)));
      }
      if (u.status < 200 || u.status > 299)
        throw { status: u.status, code: u.body?.error ?? null, data: u.body };
      return o?.onEtag?.(u.etag ?? null), i(le(u.body, t(u)));
    },
    async fetch(s, r, n) {
      if ((r?.method ?? "GET").toUpperCase() !== "GET")
        throw u0();
      if (n?.beforeWire && !n.beforeWire())
        throw { status: 0, notSent: !0, stale: !0 };
      let o = o0(s, e());
      if (o)
        return new Response(o.type ? String(o.body) : JSON.stringify(o.body), { status: o.status, headers: { "content-type": o.type ?? "application/json" } });
      let a = d0("fetch", s);
      if (!a)
        return new Response('{"error":"NOT_FOUND"}', { status: 404, headers: { "content-type": "application/json" } });
      let i = a.status === 204 ? null : a.raw ? String(a.body) : JSON.stringify(le(a.body, t(a)));
      return new Response(i, { status: a.status, headers: { "content-type": a.type ?? "application/json" } });
    }
  };
}

// scripts/term/build/node-runtime.ts
class C extends Error {
  code;
  constructor(e, t) {
    super(`${e}: ${t}`);
    this.code = e;
    this.name = "HubNodeError";
  }
}
var _0 = () => `${process.platform}-${process.arch}`;
function jr(e, t, s = _0()) {
  let r = t[s];
  if (!r)
    throw new C("TERM_HUB_NODE_PLATFORM", `this package carries no terminal Hub library for ${s}`);
  if (process.platform !== "linux")
    throw new C("TERM_HUB_NODE_PLATFORM", `the terminal Hub library is opened through /proc, which ${process.platform} has not`);
  let n;
  try {
    n = M.openSync(Fe.join(e, r.file), M.constants.O_RDONLY | M.constants.O_NOFOLLOW | M.constants.O_NONBLOCK);
  } catch {
    throw new C("TERM_HUB_NODE_LIBRARY", `${r.file} cannot be opened (missing, or a link)`);
  }
  try {
    if (!M.fstatSync(n).isFile())
      throw new C("TERM_HUB_NODE_LIBRARY", `${r.file} is not a regular file`);
    let o = Lr.createHash("sha256"), a = Buffer.alloc(1048576);
    for (let i = 0;; ) {
      let d = M.readSync(n, a, 0, a.length, i);
      if (d === 0)
        break;
      o.update(a.subarray(0, d)), i += d;
    }
    if (o.digest("hex") !== r.sha256)
      throw new C("TERM_HUB_NODE_LIBRARY", `${r.file} is not the library this package was built with`);
  } catch (o) {
    throw M.closeSync(n), o;
  }
  return `/proc/self/fd/${n}`;
}
function Br(e, t) {
  let s;
  try {
    s = e.dlopen(t, {});
  } catch {
    throw new C("TERM_HUB_NODE_LIBRARY", `this machine cannot load the terminal Hub library for ${_0()}`);
  }
  try {
    e.dlclose(s.lib);
  } catch {}
}
function Fr(e, t = {}) {
  let s = We(e);
  if (s === null)
    return null;
  let r = Fe.join(s, "node-compile"), n = t.uid ?? process.getuid?.() ?? -1;
  try {
    M.mkdirSync(r, { recursive: !0, mode: 448 });
    let o = M.lstatSync(r);
    if (!o.isDirectory() || n >= 0 && o.uid !== n || (o.mode & 511) !== 448)
      return null;
    return qe(r, n, t.gid ?? process.getgid?.() ?? -1), r;
  } catch {
    return null;
  }
}
function y0(e, t, s = Pr.homedir) {
  let r = null;
  return {
    launcher: async () => ({
      runInHubCache: async (o) => (me(process.env), o()),
      hubMain: (o) => lt(o),
      openStore: async (o) => {
        let a;
        try {
          a = await we();
        } catch {
          a = () => !1;
        }
        let i = o.client?.identity?.uid, d = st({ home: s(), apiOrigin: o.apiOrigin, uid: typeof i === "string" ? i : "", tryLock: a }), u = {};
        try {
          u = at(d.area);
        } catch {}
        return { store: d, resume: u, close: () => d.close() };
      },
      revokeBootKeysAtLogout: async (o) => {
        let a;
        try {
          a = await we();
        } catch {
          a = () => !1;
        }
        return _t({ home: s(), apiOrigin: o.apiOrigin, uid: o.uid, tryLock: a, revoke: o.revoke });
      },
      installSystemLibrary: async () => {
        throw new C("TERM_HUB_NODE_PLATFORM", "the npm package installs no system library; the standalone hoody binary does (hoody hub --install-library)");
      }
    }),
    load: () => r ??= (async () => {
      let o = pe();
      if (!o)
        throw new C("TERM_HUB_NODE_FFI", `node:ffi is not available in Node ${process.versions.node} (needs Node 26 or later, not started with --no-experimental-ffi)`);
      let a = jr(e, t);
      try {
        Br(o, a), me(process.env), process.env.OPENTUI_LIB_PATH = a;
        let i = Fr({ XDG_CACHE_HOME: process.env.XDG_CACHE_HOME, HOME: s() });
        if (i !== null)
          try {
            p0.enableCompileCache?.(i);
          } catch {}
        return await import(Ur(Fe.join(e, "hub-term.js")).href);
      } catch (i) {
        if (process.env.OPENTUI_LIB_PATH === a)
          delete process.env.OPENTUI_LIB_PATH;
        try {
          M.closeSync(Number(a.slice(14)));
        } catch {}
        throw i;
      }
    })(),
    demo: async () => ({ client: m0(), context: { ...f0 } })
  };
}

// hub-node-entry.ts
var Un = y0(import.meta.dirname, { "linux-x64": { file: "libopentui-linux-x64.so", sha256: "b164b5df46c73cc4c963261049c9321ad67d2fda132f403360db70ccca399bf1" }, "linux-arm64": { file: "libopentui-linux-arm64.so", sha256: "48a39b0c4a19d9297610ee21454130fe5d2869e5b582436febee1e75fd58cd49" } });
export {
  Un as hub
};
