import{he,re,ne,nt,st,ge,ye,Ae}from"./index-gdj3p0dc.js";import{P,at,De,W,K,X,be,jt,we,qt}from"./index-rez00rmx.js";import{_}from"./index-ape8ekqb.js";import{B,Re,_e}from"./index.js";import i from"chalk";import Ue from"node:readline";import{existsSync as Je}from"node:fs";import{open as Oe}from"node:fs/promises";import{existsSync as Fe}from"node:fs";import{join as Be}from"node:path";import A from"chalk";function oe(){return Be(B(),".hoody","chats",".seen-privacy-banner")}function He(){return Fe(oe())}async function Me(){await _();try{await(await Oe(oe(),"wx",384)).close()}catch(s){if(s?.code!=="EEXIST")process.stderr.write(`[hoody chat] Could not write banner marker: ${s?.message??s}
`)}}function We(){let s=A.cyan,p=A.bold,n=A.green,w=A.yellow,f=A.dim,h=(U,k,l)=>`  ${U}  ${k.padEnd(20)} ${l}`;return["",`  ${p.cyan("hoody chat")}  ${f("·")}  ${p.green("Welcome ✨")}`,"",`  ${p("Privacy by default.")} ${f("Sessions live in memory only and vanish")}`,`  ${f("when you exit — opt in to persistence with")} ${n("--persist")}${f(".")}`,"",`  ${p("Privacy controls")}`,h(w("→"),"This REPL only",n("/private")),h(w("→"),"This invocation",n("--private")),h(w("→"),"Every invocation",_e("HOODY_CHAT_PRIVATE","1")),"",`  ${p("Sessions")}`,h(s("•"),"Persist sessions",n("hoody chat --persist")),h(s("•"),"Wipe everything",n("hoody chat sessions delete --all -y")),"",`  ${f("Commands:")} ${s("hoody chat --help")}  ${f("·")}  ${f("In-REPL:")} ${s("/help")}  ${f("·")}  ${f("Exit:")} ${s("/exit")} ${f("or Ctrl-C ×2")}`,""].join(`
`)}async function ae(s={}){let p=s.out??process.stdout,n=p.isTTY===!0,w=s.isInteractive??n;if(!s.force&&!w)return!1;if(!s.force&&He())return!1;return p.write(We()),await Me(),!0}async function ut(s){let p=s.input??process.stdin,n=s.output??process.stdout,w=n.isTTY===!0,f=p.isTTY===!0,h=w&&f;if(!s.initialPrivate)await ae({out:n,isInteractive:h});let U=s.markdown===!1,k=s.stream===!1,l=s.initialPrivate,c,g,N=!1,J=(e,t)=>{if(N)return;N=!0;let r=e instanceof Error?e.message:String(e);process.stderr.write(i.yellow(`
[hoody chat] Persistence ${t} failed (${r}). Continuing in-memory only — disk writes disabled for this REPL.
`))},d=[],T=!1,E=!1,j=!1,q=async(e,t)=>{try{return await be(e),!0}catch(r){let o=r instanceof Error?r.message:String(r);return process.stderr.write(i.red(`Failed to delete ${t}: ${o}
`)),T=!0,!1}},y="idle",x;if(s.resume!==void 0&&l)process.stderr.write(i.yellow(`hoody chat: --resume does nothing in private mode (it would have to read from disk); starting a new session.
`));else if(s.resume!==void 0&&!s.persist)process.stderr.write(i.yellow(`hoody chat: --resume requires --persist; starting a new session.
`));if(s.persist&&s.resume!==void 0&&!l){let e=await Ie(s.resume);if(e){c=e.filePath,g=e.meta;for(let t of e.turns)d.push({role:t.role,content:t.content,ts:t.ts});n.write(i.dim(`Resumed session ${e.meta.id} — ${P(e.meta.title)}
`))}else process.stderr.write(i.yellow(typeof s.resume==="string"?`hoody chat: no session matches "${s.resume}" — starting a new one.
`:`hoody chat: no previous session to resume — starting a new one.
`))}let m=Ue.createInterface({input:p,output:w?n:void 0,terminal:h,prompt:i.cyan("hoody> ")}),C=()=>{if(y==="inflight"&&x){x.abort(Error("user-interrupt")),x=void 0,y="idle",n.write(`
`+i.dim(`(aborted)
`)),m.prompt();return}if(y==="confirm-exit"){n.write(`
`+i.dim(`Exiting.
`)),m.close();return}y="confirm-exit",n.write(`
`+i.dim(`Press Ctrl-C again to exit, or continue typing.
`)),m.prompt()};if(f)m.on("SIGINT",C),process.on("SIGINT",C);if(s.sigintSignal)s.sigintSignal.addEventListener("abort",C);let S="",O=!1,D=[],I=[],V=!1,G=(e,t=!1)=>{let r={line:e,bypassSlash:t};if(I.length>0)I.shift()(r);else D.push(r)},z=()=>{if(D.length>0)return Promise.resolve(D.shift());if(V)return Promise.resolve(null);return new Promise((e)=>{I.push(e)})};m.on("line",(e)=>G(e)),m.once("close",()=>{V=!0;for(let e of I)e(null);if(I=[],f&&y==="inflight"&&x&&D.length===0)x.abort(Error("stdin-closed"))});let ce=async()=>{let e=await z();return e===null?null:e.line};m.prompt();while(!0){let e=await z();if(e===null)break;let{line:t,bypassSlash:r}=e;if(y==="confirm-exit")y="idle";if(t.trim()==='"""'){if(!O){O=!0,m.prompt();continue}O=!1;let a=S;if(S="",!a.trim()){m.prompt();continue}await Z(a),m.prompt();continue}if(O){S+=(S.length>0?`
`:"")+t,m.prompt();continue}if(t.endsWith("\\")){S+=(S.length>0?`
`:"")+t.slice(0,-1),m.prompt();continue}let o=(S.length>0?S+`
`:"")+t;if(S="",!o.trim()){m.prompt();continue}if(!r&&o.trim().startsWith("/")){if(await de(o.trim(),ce)==="exit"){m.close();break}m.prompt();continue}await Z(o),m.prompt()}if(!h&&T)process.exitCode=j?2:1;return Le();async function Z(e){y="inflight";let t=new AbortController;x=t;let r=new Date().toISOString();if(d.push({role:"user",content:e,ts:r}),F())try{if(await Ce(e),c)await De(c,{role:"user",content:e,ts:r})}catch(u){J(u,"user-turn write")}let o=process.env.HOODY_CHAT_MAX_HISTORY,a=o!==void 0&&/^\d+$/.test(o)?Number(o):void 0,v=a!==void 0?a:10,Q=[],Y=d.slice(0,-1);for(let u=0;u<Y.length-1;u++){let M=Y[u],se=Y[u+1];if(M.role==="user"&&se.role==="assistant")Q.push({role:"user",content:M.content}),Q.push({role:"assistant",content:se.content}),u++}let ke=v<=0?[]:Q.slice(-v*2),R=he({out:n,noMarkdown:U}),L="",ee=!1,H=h?Qe(n):null,te=s.apiBaseUrl??Re(),ie=re(te),b=await ye({message:e,apiBaseUrl:te,history:ke,limiter:Ae,acceptEndpointFlag:s.acceptEndpointFlag,acceptEndpointEnv:s.acceptEndpointEnv,isTty:h,sessionOnly:l,signal:t.signal,onDelta:k?void 0:(u)=>{if(H)H.stop();L+=u,R.write(u)}});if(H)H.stop();if("error"in b){ee=!0;let u=t.signal.aborted||/user-interrupt|stdin-closed|aborted by caller/.test(b.message);if(j=b.error==="endpoint-not-accepted",!u)T=!0,process.stderr.write(i.red(`Error: ${b.message}`)+`
`)}else{if(T=!1,k)L=b.text,R.write(b.text);if(b.truncated)R.write(ne(ie));let u=ge(b.sources,ie);if(u)R.write(u)}R.end();let Ne=t.signal.aborted===!0;if(!ee&&!Ne&&L.length>0){let u=new Date().toISOString();if(d.push({role:"assistant",content:L,ts:u}),F()&&c)try{await De(c,{role:"assistant",content:L,ts:u})}catch(M){J(M,"assistant-turn write")}}x=void 0,y="idle"}async function de(e,t){let[r,...o]=e.slice(1).split(/\s+/),a=o.join(" ").trim();switch(r){case"help":return fe();case"exit":case"quit":return"exit";case"clear":if(w)n.write("\x1B[2J\x1B[H");return"continue";case"new":return pe();case"history":return Se();case"sessions":return $e();case"load":return ve(a);case"save":return Pe();case"delete":return Ee(a);case"wipe":return xe(t);case"private":return Te();case"retry":return ue();default:return n.write(i.red(`Unknown command: /${r}. Try /help.
`)),"continue"}}async function ue(){if(y==="inflight")return n.write(i.yellow(`/retry refused: a turn is in flight. Ctrl-C to abort first.
`)),"continue";if(d.length===0)return n.write(i.dim(`Nothing to retry — no turns yet.
`)),"continue";let e=-1;for(let o=d.length-1;o>=0;o--)if(d[o].role==="user"){e=o;break}if(e===-1)return n.write(i.dim(`Nothing to retry — no user turn in transcript.
`)),"continue";let t=d[e].content;if(d.length=e,F()&&c)try{await jt(c,e)}catch(o){J(o,"retry truncate")}return n.write(i.dim(`Retrying last message…
`)),G(t,!0),"continue"}function fe(){let e=[["/help","Print this table"],["/exit, /quit","Exit the REPL"],["/clear","Clear the screen (keeps current session)"],["/new","Start a fresh session in-place"],["/history","Print current transcript"],["/sessions",`List persistent sessions (${l?"disabled in private mode":"OK"})`],["/load <id>",`Switch REPL to that session's history${l?" (disabled in private mode)":""}`],["/save",`Promote current session → persistent file${l?" (refused in private mode)":""}`],["/delete [id]",`Delete session <id>; no arg = delete current + /new${l?" (disabled in private mode)":""}`],["/wipe",`Delete ALL persistent sessions (confirms)${l?" (disabled in private mode)":""}`],["/private",`Toggle private mode (currently: ${l?"ON":"OFF"})`],["/retry","Drop the last assistant reply and re-send the last user message"]];for(let[t,r]of e)n.write(`  ${i.cyan(t.padEnd(18))} ${r}
`);return"continue"}function me(e,t){c=e,g=t,E=!0}function pe(){return d.length=0,c=void 0,g=void 0,E=!1,n.write(i.dim(`New session.
`)),"continue"}function Se(){if(d.length===0)return n.write(i.dim(`(empty transcript)
`)),"continue";for(let e of d){let t=e.role==="user"?i.green:e.role==="assistant"?i.blue:i.dim;n.write(t(`[${e.role}]`)+" "+P(e.content)+`
`)}return"continue"}async function $e(){if(l)return n.write(i.yellow(`/sessions disabled in private mode.
`)),"continue";let e=await K();if(e.length===0)return n.write(i.dim(`(no persistent sessions)
`)),"continue";for(let t of e)n.write(`  ${i.cyan(t.id)}  ${i.dim(t.updatedAt)}  ${t.turnCount} turn${t.turnCount===1?"":"s"}  ${P(t.title)}
`);return"continue"}async function ve(e){if(l)return n.write(i.yellow(`/load disabled in private mode.
`)),"continue";if(!e)return n.write(i.red(`Usage: /load <id>
`)),"continue";let t=e.replace(/[\x00-\x1f\x7f]/g,"?"),r=await X(e);if(r.length===0)return n.write(i.red(`No session matches: ${t}
`)),"continue";if(r.length>1)return n.write(i.red(`Ambiguous prefix ${t} — matches ${r.length} sessions:
`)+r.slice(0,10).map((v)=>`  ${v.id}  ${P(v.title)}`).join(`
`)+`
`+(r.length>10?i.dim(`  ... and ${r.length-10} more
`):"")),"continue";let o=r[0],a=await W(o.filePath);if(!a)return n.write(i.red(`Failed to read session ${e}.
`)),"continue";me(a.filePath,a.meta),d.length=0;for(let v of a.turns)d.push({role:v.role,content:v.content,ts:v.ts});return n.write(i.dim(`Loaded ${a.meta.id} — ${P(a.meta.title)} (${a.turns.length} turns)
`)),"continue"}async function Pe(){if(l)return n.write(i.yellow(`/save is disabled in private mode. Exit and rerun without --private to persist.
`)),"continue";if(N)return n.write(i.yellow(`/save is disabled — disk writes failed earlier this session.
`)),"continue";if(c)return n.write(i.dim(`Session already persisted: ${g?.id}
`)),"continue";let e=d.find((t)=>t.role==="user");if(!e)return n.write(i.dim(`Nothing to save yet — no user turns.
`)),"continue";try{let t=await qt({firstUserMessage:e.content,model:nt,tier:st,turns:d});c=t.filePath,g=t.meta,E=!0,n.write(i.dim(`Saved as ${t.meta.id} — ${t.meta.title}
`))}catch(t){let r=t instanceof Error?t.message:String(t);n.write(i.red(`Failed to save session: ${r}
`))}return"continue"}async function Ee(e){if(l)return n.write(i.yellow(`/delete disabled in private mode.
`)),"continue";if(!e){if(!c)return n.write(i.dim(`Ephemeral session — nothing to delete. Starting fresh.
`)),d.length=0,"continue";if(!await q(c,`session ${g?.id}`))return"continue";return n.write(i.dim(`Deleted current session ${g?.id}. Starting fresh.
`)),c=void 0,g=void 0,d.length=0,E=!1,"continue"}let t=e.replace(/[\x00-\x1f\x7f]/g,"?"),r=await X(e);if(r.length===0)return n.write(i.red(`No session matches: ${t}
`)),"continue";if(r.length>1)return n.write(i.red(`Ambiguous prefix ${t} — matches ${r.length} sessions; refusing to delete:
`)+r.slice(0,10).map((a)=>`  ${a.id}  ${P(a.title)}`).join(`
`)+`
`+(r.length>10?i.dim(`  ... and ${r.length-10} more
`):"")),"continue";let o=r[0];if(!await q(o.filePath,o.id))return"continue";if(n.write(i.dim(`Deleted ${o.id}.
`)),o.filePath===c)c=void 0,g=void 0,d.length=0,E=!1;return"continue"}async function xe(e){if(l)return n.write(i.yellow(`/wipe is disabled in private mode.
`)),"continue";if(n.write(i.red(`This will DELETE all persistent sessions.
`)),n.write(i.red('Type the word "yes" (lowercase) to confirm: ')),(await e()??"").trim()!=="yes")return n.write(i.dim(`Wipe cancelled.
`)),"continue";let{deleted:o,failed:a}=await we();if(n.write(i.dim(`Deleted ${o} session${o===1?"":"s"}.
`)),a>0)process.stderr.write(i.red(`Failed to delete ${a} session file${a===1?"":"s"} — they are still on disk.
`)),T=!0;if(a===0||!c||!Je(c))c=void 0,g=void 0,E=!1;return"continue"}function Te(){if(l)return n.write(i.yellow(s.initialPrivate?`Private mode was set for this whole process (--private / HOODY_CHAT_PRIVATE=1) and cannot be turned off.
`:"Private mode is already on and cannot be turned off — turns taken while it was on would otherwise become writable. Restart `hoody chat` for a non-private session.\n")),"continue";return l=!0,n.write(i.dim(`Private mode ${l?i.green("ON"):i.yellow("OFF")}. ${l?"No disk writes or reads.":"Disk writes/reads allowed."}
`)),"continue"}function F(){return(s.persist||E)&&!l&&!N}async function Ce(e){if(c)return;if(!F())return;let t=await at({firstUserMessage:e,model:nt,tier:st});c=t.filePath,g=t.meta}async function Ie(e){if(e===void 0||e===!1)return null;if(e===!0){let r=await K();if(r.length===0)return null;return await W(r[0].filePath)}let t=await X(e);if(t.length===0)return null;if(t.length>1){let r=t.slice(0,5).map((o)=>`  - ${o.id}`).join(`
`);throw Error(`Ambiguous session id/prefix "${e}" — ${t.length} matches:
${r}${t.length>5?`
  ... and ${t.length-5} more`:""}
Provide a longer prefix.`)}return await W(t[0].filePath)}function Le(){if(f)process.removeListener("SIGINT",C);s.sigintSignal?.removeEventListener("abort",C),m.close()}}var le=["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];function Qe(s){let p=0,n=!1,w=()=>{if(n)return;let h=le[p++%le.length];s.write(`\r${i.cyan(h)} ${i.dim("thinking…")}`)};w();let f=setInterval(w,80);return{stop(){if(n)return;n=!0,clearInterval(f),s.write("\x1B[2K\r")}}}export{ut as runRepl};
