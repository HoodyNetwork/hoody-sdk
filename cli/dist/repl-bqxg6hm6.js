import{nn,vr,kr,Gs,Vs,sn,on,an}from"./index-29jq2pna.js";import{we}from"./index-dnb5ngec.js";import{Js,Vn,or,Ht,ar,dn,Ma,ln,Ua}from"./index-gye7f1pr.js";import{at,cn,un,Ne}from"./index-bg7a8ea9.js";import i from"chalk";import Te from"node:readline";import{existsSync as Ce}from"node:fs";import{open as $e}from"node:fs/promises";import{existsSync as ve}from"node:fs";import{join as be}from"node:path";import L from"chalk";function z(){return be(at(),".hoody","chats",".seen-privacy-banner")}function Pe(){return ve(z())}async function Ee(){await Ne();try{await(await $e(z(),"wx",384)).close()}catch(s){if(s?.code!=="EEXIST")process.stderr.write(`[hoody chat] Could not write banner marker: ${s?.message??s}
`)}}function xe(){let s=L.cyan,p=L.bold,n=L.green,w=L.yellow,f=L.dim,h=(H,A,l)=>`  ${H}  ${A.padEnd(20)} ${l}`;return["",`  ${p.cyan("hoody chat")}  ${f("·")}  ${p.green("Welcome ✨")}`,"",`  ${p("Privacy by default.")} ${f("Sessions live in memory only and vanish")}`,`  ${f("when you exit — opt in to persistence with")} ${n("--persist")}${f(".")}`,"",`  ${p("Privacy controls")}`,h(w("→"),"This REPL only",n("/private")),h(w("→"),"This invocation",n("--private")),h(w("→"),"Every invocation",un("HOODY_CHAT_PRIVATE","1")),"",`  ${p("Sessions")}`,h(s("•"),"Persist sessions",n("hoody chat --persist")),h(s("•"),"Wipe everything",n("hoody chat sessions delete --all -y")),"",`  ${f("Commands:")} ${s("hoody chat --help")}  ${f("·")}  ${f("In-REPL:")} ${s("/help")}  ${f("·")}  ${f("Exit:")} ${s("/exit")} ${f("or Ctrl-C ×2")}`,""].join(`
`)}async function Z(s={}){let p=s.out??process.stdout,n=p.isTTY===!0,w=s.isInteractive??n;if(!s.force&&!w)return!1;if(!s.force&&Pe())return!1;return p.write(xe()),await Ee(),!0}async function qe(s){let p=s.input??process.stdin,n=s.output??process.stdout,w=n.isTTY===!0,f=p.isTTY===!0,h=w&&f;if(!s.initialPrivate)await Z({out:n,isInteractive:h});let H=s.markdown===!1,A=s.stream===!1,l=s.initialPrivate,c,g,k=!1,M=(e,t)=>{if(k)return;k=!0;let r=e instanceof Error?e.message:String(e);process.stderr.write(i.yellow(`
[hoody chat] Persistence ${t} failed (${r}). Continuing in-memory only — disk writes disabled for this REPL.
`))},d=[],x=!1,P=!1,U=!1,J=async(e,t)=>{try{return await dn(e),!0}catch(r){let o=r instanceof Error?r.message:String(r);return process.stderr.write(i.red(`Failed to delete ${t}: ${o}
`)),x=!0,!1}},y="idle",E;if(s.resume!==void 0&&l)process.stderr.write(i.yellow(`hoody chat: --resume does nothing in private mode (it would have to read from disk); starting a new session.
`));else if(s.resume!==void 0&&!s.persist)process.stderr.write(i.yellow(`hoody chat: --resume requires --persist; starting a new session.
`));if(s.persist&&s.resume!==void 0&&!l){let e=await he(s.resume);if(e){c=e.filePath,g=e.meta;for(let t of e.turns)d.push({role:t.role,content:t.content,ts:t.ts});n.write(i.dim(`Resumed session ${e.meta.id} — ${we(e.meta.title)}
`))}else process.stderr.write(i.yellow(typeof s.resume==="string"?`hoody chat: no session matches "${s.resume}" — starting a new one.
`:`hoody chat: no previous session to resume — starting a new one.
`))}let m=Te.createInterface({input:p,output:w?n:void 0,terminal:h,prompt:i.cyan("hoody> ")}),T=()=>{if(y==="inflight"&&E){E.abort(Error("user-interrupt")),E=void 0,y="idle",n.write(`
`+i.dim(`(aborted)
`)),m.prompt();return}if(y==="confirm-exit"){n.write(`
`+i.dim(`Exiting.
`)),m.close();return}y="confirm-exit",n.write(`
`+i.dim(`Press Ctrl-C again to exit, or continue typing.
`)),m.prompt()};if(f)m.on("SIGINT",T),process.on("SIGINT",T);if(s.sigintSignal)s.sigintSignal.addEventListener("abort",T);let S="",N=!1,O=[],C=[],Q=!1,Y=(e,t=!1)=>{let r={line:e,bypassSlash:t};if(C.length>0)C.shift()(r);else O.push(r)},j=()=>{if(O.length>0)return Promise.resolve(O.shift());if(Q)return Promise.resolve(null);return new Promise((e)=>{C.push(e)})};m.on("line",(e)=>Y(e)),m.once("close",()=>{Q=!0;for(let e of C)e(null);if(C=[],f&&y==="inflight"&&E&&O.length===0)E.abort(Error("stdin-closed"))});let te=async()=>{let e=await j();return e===null?null:e.line};m.prompt();while(!0){let e=await j();if(e===null)break;let{line:t,bypassSlash:r}=e;if(y==="confirm-exit")y="idle";if(t.trim()==='"""'){if(!N){N=!0,m.prompt();continue}N=!1;let a=S;if(S="",!a.trim()){m.prompt();continue}await q(a),m.prompt();continue}if(N){S+=(S.length>0?`
`:"")+t,m.prompt();continue}if(t.endsWith("\\")){S+=(S.length>0?`
`:"")+t.slice(0,-1),m.prompt();continue}let o=(S.length>0?S+`
`:"")+t;if(S="",!o.trim()){m.prompt();continue}if(!r&&o.trim().startsWith("/")){if(await ne(o.trim(),te)==="exit"){m.close();break}m.prompt();continue}await q(o),m.prompt()}if(!h&&x)process.exitCode=U?2:1;return ge();async function q(e){y="inflight";let t=new AbortController;E=t;let r=new Date().toISOString();if(d.push({role:"user",content:e,ts:r}),D())try{if(await pe(e),c)await Vn(c,{role:"user",content:e,ts:r})}catch(u){M(u,"user-turn write")}let o=process.env.HOODY_CHAT_MAX_HISTORY,a=o!==void 0&&/^\d+$/.test(o)?Number(o):void 0,v=a!==void 0?a:10,_=[],W=d.slice(0,-1);for(let u=0;u<W.length-1;u++){let B=W[u],X=W[u+1];if(B.role==="user"&&X.role==="assistant")_.push({role:"user",content:B.content}),_.push({role:"assistant",content:X.content}),u++}let ye=v<=0?[]:_.slice(-v*2),I=nn({out:n,noMarkdown:H}),R="",V=!1,F=h?Ie(n):null,G=s.apiBaseUrl??cn(),K=vr(G),b=await on({message:e,apiBaseUrl:G,history:ye,limiter:an,acceptEndpointFlag:s.acceptEndpointFlag,acceptEndpointEnv:s.acceptEndpointEnv,isTty:h,sessionOnly:l,signal:t.signal,onDelta:A?void 0:(u)=>{if(F)F.stop();R+=u,I.write(u)}});if(F)F.stop();if("error"in b){V=!0;let u=t.signal.aborted||/user-interrupt|stdin-closed|aborted by caller/.test(b.message);if(U=b.error==="endpoint-not-accepted",!u)x=!0,process.stderr.write(i.red(`Error: ${b.message}`)+`
`)}else{if(x=!1,A)R=b.text,I.write(b.text);if(b.truncated)I.write(kr(K));let u=sn(b.sources,K);if(u)I.write(u)}I.end();let Se=t.signal.aborted===!0;if(!V&&!Se&&R.length>0){let u=new Date().toISOString();if(d.push({role:"assistant",content:R,ts:u}),D()&&c)try{await Vn(c,{role:"assistant",content:R,ts:u})}catch(B){M(B,"assistant-turn write")}}E=void 0,y="idle"}async function ne(e,t){let[r,...o]=e.slice(1).split(/\s+/),a=o.join(" ").trim();switch(r){case"help":return re();case"exit":case"quit":return"exit";case"clear":if(w)n.write("\x1B[2J\x1B[H");return"continue";case"new":return oe();case"history":return ae();case"sessions":return le();case"load":return ce(a);case"save":return de();case"delete":return ue(a);case"wipe":return fe(t);case"private":return me();case"retry":return ie();default:return n.write(i.red(`Unknown command: /${r}. Try /help.
`)),"continue"}}async function ie(){if(y==="inflight")return n.write(i.yellow(`/retry refused: a turn is in flight. Ctrl-C to abort first.
`)),"continue";if(d.length===0)return n.write(i.dim(`Nothing to retry — no turns yet.
`)),"continue";let e=-1;for(let o=d.length-1;o>=0;o--)if(d[o].role==="user"){e=o;break}if(e===-1)return n.write(i.dim(`Nothing to retry — no user turn in transcript.
`)),"continue";let t=d[e].content;if(d.length=e,D()&&c)try{await Ma(c,e)}catch(o){M(o,"retry truncate")}return n.write(i.dim(`Retrying last message…
`)),Y(t,!0),"continue"}function re(){let e=[["/help","Print this table"],["/exit, /quit","Exit the REPL"],["/clear","Clear the screen (keeps current session)"],["/new","Start a fresh session in-place"],["/history","Print current transcript"],["/sessions",`List persistent sessions (${l?"disabled in private mode":"OK"})`],["/load <id>",`Switch REPL to that session's history${l?" (disabled in private mode)":""}`],["/save",`Promote current session → persistent file${l?" (refused in private mode)":""}`],["/delete [id]",`Delete session <id>; no arg = delete current + /new${l?" (disabled in private mode)":""}`],["/wipe",`Delete ALL persistent sessions (confirms)${l?" (disabled in private mode)":""}`],["/private",`Toggle private mode (currently: ${l?"ON":"OFF"})`],["/retry","Drop the last assistant reply and re-send the last user message"]];for(let[t,r]of e)n.write(`  ${i.cyan(t.padEnd(18))} ${r}
`);return"continue"}function se(e,t){c=e,g=t,P=!0}function oe(){return d.length=0,c=void 0,g=void 0,P=!1,n.write(i.dim(`New session.
`)),"continue"}function ae(){if(d.length===0)return n.write(i.dim(`(empty transcript)
`)),"continue";for(let e of d){let t=e.role==="user"?i.green:e.role==="assistant"?i.blue:i.dim;n.write(t(`[${e.role}]`)+" "+we(e.content)+`
`)}return"continue"}async function le(){if(l)return n.write(i.yellow(`/sessions disabled in private mode.
`)),"continue";let e=await Ht();if(e.length===0)return n.write(i.dim(`(no persistent sessions)
`)),"continue";for(let t of e)n.write(`  ${i.cyan(t.id)}  ${i.dim(t.updatedAt)}  ${t.turnCount} turn${t.turnCount===1?"":"s"}  ${we(t.title)}
`);return"continue"}async function ce(e){if(l)return n.write(i.yellow(`/load disabled in private mode.
`)),"continue";if(!e)return n.write(i.red(`Usage: /load <id>
`)),"continue";let t=e.replace(/[\x00-\x1f\x7f]/g,"?"),r=await ar(e);if(r.length===0)return n.write(i.red(`No session matches: ${t}
`)),"continue";if(r.length>1)return n.write(i.red(`Ambiguous prefix ${t} — matches ${r.length} sessions:
`)+r.slice(0,10).map((v)=>`  ${v.id}  ${we(v.title)}`).join(`
`)+`
`+(r.length>10?i.dim(`  ... and ${r.length-10} more
`):"")),"continue";let o=r[0],a=await or(o.filePath);if(!a)return n.write(i.red(`Failed to read session ${e}.
`)),"continue";se(a.filePath,a.meta),d.length=0;for(let v of a.turns)d.push({role:v.role,content:v.content,ts:v.ts});return n.write(i.dim(`Loaded ${a.meta.id} — ${we(a.meta.title)} (${a.turns.length} turns)
`)),"continue"}async function de(){if(l)return n.write(i.yellow(`/save is disabled in private mode. Exit and rerun without --private to persist.
`)),"continue";if(k)return n.write(i.yellow(`/save is disabled — disk writes failed earlier this session.
`)),"continue";if(c)return n.write(i.dim(`Session already persisted: ${g?.id}
`)),"continue";let e=d.find((t)=>t.role==="user");if(!e)return n.write(i.dim(`Nothing to save yet — no user turns.
`)),"continue";try{let t=await Ua({firstUserMessage:e.content,model:Gs,tier:Vs,turns:d});c=t.filePath,g=t.meta,P=!0,n.write(i.dim(`Saved as ${t.meta.id} — ${t.meta.title}
`))}catch(t){let r=t instanceof Error?t.message:String(t);n.write(i.red(`Failed to save session: ${r}
`))}return"continue"}async function ue(e){if(l)return n.write(i.yellow(`/delete disabled in private mode.
`)),"continue";if(!e){if(!c)return n.write(i.dim(`Ephemeral session — nothing to delete. Starting fresh.
`)),d.length=0,"continue";if(!await J(c,`session ${g?.id}`))return"continue";return n.write(i.dim(`Deleted current session ${g?.id}. Starting fresh.
`)),c=void 0,g=void 0,d.length=0,P=!1,"continue"}let t=e.replace(/[\x00-\x1f\x7f]/g,"?"),r=await ar(e);if(r.length===0)return n.write(i.red(`No session matches: ${t}
`)),"continue";if(r.length>1)return n.write(i.red(`Ambiguous prefix ${t} — matches ${r.length} sessions; refusing to delete:
`)+r.slice(0,10).map((a)=>`  ${a.id}  ${we(a.title)}`).join(`
`)+`
`+(r.length>10?i.dim(`  ... and ${r.length-10} more
`):"")),"continue";let o=r[0];if(!await J(o.filePath,o.id))return"continue";if(n.write(i.dim(`Deleted ${o.id}.
`)),o.filePath===c)c=void 0,g=void 0,d.length=0,P=!1;return"continue"}async function fe(e){if(l)return n.write(i.yellow(`/wipe is disabled in private mode.
`)),"continue";if(n.write(i.red(`This will DELETE all persistent sessions.
`)),n.write(i.red('Type the word "yes" (lowercase) to confirm: ')),(await e()??"").trim()!=="yes")return n.write(i.dim(`Wipe cancelled.
`)),"continue";let{deleted:o,failed:a}=await ln();if(n.write(i.dim(`Deleted ${o} session${o===1?"":"s"}.
`)),a>0)process.stderr.write(i.red(`Failed to delete ${a} session file${a===1?"":"s"} — they are still on disk.
`)),x=!0;if(a===0||!c||!Ce(c))c=void 0,g=void 0,P=!1;return"continue"}function me(){if(l)return n.write(i.yellow(s.initialPrivate?`Private mode was set for this whole process (--private / HOODY_CHAT_PRIVATE=1) and cannot be turned off.
`:"Private mode is already on and cannot be turned off — turns taken while it was on would otherwise become writable. Restart `hoody chat` for a non-private session.\n")),"continue";return l=!0,n.write(i.dim(`Private mode ${l?i.green("ON"):i.yellow("OFF")}. ${l?"No disk writes or reads.":"Disk writes/reads allowed."}
`)),"continue"}function D(){return(s.persist||P)&&!l&&!k}async function pe(e){if(c)return;if(!D())return;let t=await Js({firstUserMessage:e,model:Gs,tier:Vs});c=t.filePath,g=t.meta}async function he(e){if(e===void 0||e===!1)return null;if(e===!0){let r=await Ht();if(r.length===0)return null;return await or(r[0].filePath)}let t=await ar(e);if(t.length===0)return null;if(t.length>1){let r=t.slice(0,5).map((o)=>`  - ${o.id}`).join(`
`);throw Error(`Ambiguous session id/prefix "${e}" — ${t.length} matches:
${r}${t.length>5?`
  ... and ${t.length-5} more`:""}
Provide a longer prefix.`)}return await or(t[0].filePath)}function ge(){if(f)process.removeListener("SIGINT",T);s.sigintSignal?.removeEventListener("abort",T),m.close()}}var ee=["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];function Ie(s){let p=0,n=!1,w=()=>{if(n)return;let h=ee[p++%ee.length];s.write(`\r${i.cyan(h)} ${i.dim("thinking…")}`)};w();let f=setInterval(w,80);return{stop(){if(n)return;n=!0,clearInterval(f),s.write("\x1B[2K\r")}}}export{qe as runRepl};
