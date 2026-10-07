import{ce,Z,ee,Ve,Xe,ue,me,pe}from"./index-wx3qv674.js";import{v,We,_e,Y,j,V,fe,xt,he,St}from"./index-5e11xq7t.js";import{C}from"./index-dxt8445g.js";import{x,ke,Pe}from"./index.js";import i from"chalk";import Je from"node:readline";import{existsSync as Qe}from"node:fs";import{open as De}from"node:fs/promises";import{existsSync as Fe}from"node:fs";import{join as Be}from"node:path";import N from"chalk";function oe(){return Be(x(),".hoody","chats",".seen-privacy-banner")}function He(){return Fe(oe())}async function Me(){await C();try{await(await De(oe(),"wx",384)).close()}catch(s){if(s?.code!=="EEXIST")process.stderr.write(`[hoody chat] Could not write banner marker: ${s?.message??s}
`)}}function Ue(){let s=N.cyan,p=N.bold,n=N.green,w=N.yellow,f=N.dim,h=(W,O,l)=>`  ${W}  ${O.padEnd(20)} ${l}`;return["",`  ${p.cyan("hoody chat")}  ${f("·")}  ${p.green("Welcome ✨")}`,"",`  ${p("Privacy by default.")} ${f("Sessions live in memory only and vanish")}`,`  ${f("when you exit — opt in to persistence with")} ${n("--persist")}${f(".")}`,"",`  ${p("Privacy controls")}`,h(w("→"),"This REPL only",n("/private")),h(w("→"),"This invocation",n("--private")),h(w("→"),"Every invocation",Pe("HOODY_CHAT_PRIVATE","1")),"",`  ${p("Sessions")}`,h(s("•"),"Persist sessions",n("hoody chat --persist")),h(s("•"),"Wipe everything",n("hoody chat sessions delete --all -y")),"",`  ${f("Commands:")} ${s("hoody chat --help")}  ${f("·")}  ${f("In-REPL:")} ${s("/help")}  ${f("·")}  ${f("Exit:")} ${s("/exit")} ${f("or Ctrl-C ×2")}`,""].join(`
`)}async function ae(s={}){let p=s.out??process.stdout,n=p.isTTY===!0,w=s.isInteractive??n;if(!s.force&&!w)return!1;if(!s.force&&He())return!1;return p.write(Ue()),await Me(),!0}async function ut(s){let p=s.input??process.stdin,n=s.output??process.stdout,w=n.isTTY===!0,f=p.isTTY===!0,h=w&&f;if(!s.initialPrivate)await ae({out:n,isInteractive:h});let W=s.markdown===!1,O=s.stream===!1,l=s.initialPrivate,c,g,D=!1,U=(e,t)=>{if(D)return;D=!0;let r=e instanceof Error?e.message:String(e);process.stderr.write(i.yellow(`
[hoody chat] Persistence ${t} failed (${r}). Continuing in-memory only — disk writes disabled for this REPL.
`))},d=[],I=!1,E=!1,q=!1,G=async(e,t)=>{try{return await fe(e),!0}catch(r){let o=r instanceof Error?r.message:String(r);return process.stderr.write(i.red(`Failed to delete ${t}: ${o}
`)),I=!0,!1}},y="idle",T;if(s.resume!==void 0&&l)process.stderr.write(i.yellow(`hoody chat: --resume does nothing in private mode (it would have to read from disk); starting a new session.
`));else if(s.resume!==void 0&&!s.persist)process.stderr.write(i.yellow(`hoody chat: --resume requires --persist; starting a new session.
`));if(s.persist&&s.resume!==void 0&&!l){let e=await Le(s.resume);if(e){c=e.filePath,g=e.meta;for(let t of e.turns)d.push({role:t.role,content:t.content,ts:t.ts});n.write(i.dim(`Resumed session ${e.meta.id} — ${v(e.meta.title)}
`))}else process.stderr.write(i.yellow(typeof s.resume==="string"?`hoody chat: no session matches "${s.resume}" — starting a new one.
`:`hoody chat: no previous session to resume — starting a new one.
`))}let m=Je.createInterface({input:p,output:w?n:void 0,terminal:h,prompt:i.cyan("hoody> ")}),R=()=>{if(y==="inflight"&&T){T.abort(Error("user-interrupt")),T=void 0,y="idle",n.write(`
`+i.dim(`(aborted)
`)),m.prompt();return}if(y==="confirm-exit"){n.write(`
`+i.dim(`Exiting.
`)),m.close();return}y="confirm-exit",n.write(`
`+i.dim(`Press Ctrl-C again to exit, or continue typing.
`)),m.prompt()};if(f)m.on("SIGINT",R),process.on("SIGINT",R);if(s.sigintSignal)s.sigintSignal.addEventListener("abort",R);let S="",F=!1,B=[],L=[],K=!1,X=(e,t=!1)=>{let r={line:e,bypassSlash:t};if(L.length>0)L.shift()(r);else B.push(r)},z=()=>{if(B.length>0)return Promise.resolve(B.shift());if(K)return Promise.resolve(null);return new Promise((e)=>{L.push(e)})};m.on("line",(e)=>X(e)),m.once("close",()=>{K=!0;for(let e of L)e(null);if(L=[],f&&y==="inflight"&&T&&B.length===0)T.abort(Error("stdin-closed"))});let de=async()=>{let e=await z();return e===null?null:e.line};m.prompt();while(!0){let e=await z();if(e===null)break;let{line:t,bypassSlash:r}=e;if(y==="confirm-exit")y="idle";if(t.trim()==='"""'){if(!F){F=!0,m.prompt();continue}F=!1;let a=S;if(S="",!a.trim()){m.prompt();continue}await te(a),m.prompt();continue}if(F){S+=(S.length>0?`
`:"")+t,m.prompt();continue}if(t.endsWith("\\")){S+=(S.length>0?`
`:"")+t.slice(0,-1),m.prompt();continue}let o=(S.length>0?S+`
`:"")+t;if(S="",!o.trim()){m.prompt();continue}if(!r&&o.trim().startsWith("/")){if(await we(o.trim(),de)==="exit"){m.close();break}m.prompt();continue}await te(o),m.prompt()}if(!h&&I)process.exitCode=q?2:1;return Ae();async function te(e){y="inflight";let t=new AbortController;T=t;let r=new Date().toISOString();if(d.push({role:"user",content:e,ts:r}),H())try{if(await Re(e),c)await _e(c,{role:"user",content:e,ts:r})}catch(u){U(u,"user-turn write")}let o=process.env.HOODY_CHAT_MAX_HISTORY,a=o!==void 0&&/^\d+$/.test(o)?Number(o):void 0,b=a!==void 0?a:10,J=[],Q=d.slice(0,-1);for(let u=0;u<Q.length-1;u++){let _=Q[u],se=Q[u+1];if(_.role==="user"&&se.role==="assistant")J.push({role:"user",content:_.content}),J.push({role:"assistant",content:se.content}),u++}let Ne=b<=0?[]:J.slice(-b*2),A=ce({out:n,noMarkdown:W}),k="",ne=!1,M=h?Ye(n):null,ie=s.apiBaseUrl??ke(),re=Z(ie),P=await me({message:e,apiBaseUrl:ie,history:Ne,limiter:pe,acceptEndpointFlag:s.acceptEndpointFlag,acceptEndpointEnv:s.acceptEndpointEnv,isTty:h,sessionOnly:l,signal:t.signal,onDelta:O?void 0:(u)=>{if(M)M.stop();k+=u,A.write(u)}});if(M)M.stop();if("error"in P){ne=!0;let u=t.signal.aborted||/user-interrupt|stdin-closed|aborted by caller/.test(P.message);if(q=P.error==="endpoint-not-accepted",!u)I=!0,process.stderr.write(i.red(`Error: ${P.message}`)+`
`)}else{if(I=!1,O)k=P.text,A.write(P.text);if(P.truncated)A.write(ee(re));let u=ue(P.sources,re);if(u)A.write(u)}A.end();let Oe=t.signal.aborted===!0;if(!ne&&!Oe&&k.length>0){let u=new Date().toISOString();if(d.push({role:"assistant",content:k,ts:u}),H()&&c)try{await _e(c,{role:"assistant",content:k,ts:u})}catch(_){U(_,"assistant-turn write")}}T=void 0,y="idle"}async function we(e,t){let[r,...o]=e.slice(1).split(/\s+/),a=o.join(" ").trim();switch(r){case"help":return ye();case"exit":case"quit":return"exit";case"clear":if(w)n.write("\x1B[2J\x1B[H");return"continue";case"new":return $e();case"history":return ve();case"sessions":return be();case"load":return Ee(a);case"save":return xe();case"delete":return Te(a);case"wipe":return Ce(t);case"private":return Ie();case"retry":return ge();default:return n.write(i.red(`Unknown command: /${r}. Try /help.
`)),"continue"}}async function ge(){if(y==="inflight")return n.write(i.yellow(`/retry refused: a turn is in flight. Ctrl-C to abort first.
`)),"continue";if(d.length===0)return n.write(i.dim(`Nothing to retry — no turns yet.
`)),"continue";let e=-1;for(let o=d.length-1;o>=0;o--)if(d[o].role==="user"){e=o;break}if(e===-1)return n.write(i.dim(`Nothing to retry — no user turn in transcript.
`)),"continue";let t=d[e].content;if(d.length=e,H()&&c)try{await xt(c,e)}catch(o){U(o,"retry truncate")}return n.write(i.dim(`Retrying last message…
`)),X(t,!0),"continue"}function ye(){let e=[["/help","Print this table"],["/exit, /quit","Exit the REPL"],["/clear","Clear the screen (keeps current session)"],["/new","Start a fresh session in-place"],["/history","Print current transcript"],["/sessions",`List persistent sessions (${l?"disabled in private mode":"OK"})`],["/load <id>",`Switch REPL to that session's history${l?" (disabled in private mode)":""}`],["/save",`Promote current session → persistent file${l?" (refused in private mode)":""}`],["/delete [id]",`Delete session <id>; no arg = delete current + /new${l?" (disabled in private mode)":""}`],["/wipe",`Delete ALL persistent sessions (confirms)${l?" (disabled in private mode)":""}`],["/private",`Toggle private mode (currently: ${l?"ON":"OFF"})`],["/retry","Drop the last assistant reply and re-send the last user message"]];for(let[t,r]of e)n.write(`  ${i.cyan(t.padEnd(18))} ${r}
`);return"continue"}function Se(e,t){c=e,g=t,E=!0}function $e(){return d.length=0,c=void 0,g=void 0,E=!1,n.write(i.dim(`New session.
`)),"continue"}function ve(){if(d.length===0)return n.write(i.dim(`(empty transcript)
`)),"continue";for(let e of d){let t=e.role==="user"?i.green:e.role==="assistant"?i.blue:i.dim;n.write(t(`[${e.role}]`)+" "+v(e.content)+`
`)}return"continue"}async function be(){if(l)return n.write(i.yellow(`/sessions disabled in private mode.
`)),"continue";let e=await j();if(e.length===0)return n.write(i.dim(`(no persistent sessions)
`)),"continue";for(let t of e)n.write(`  ${i.cyan(t.id)}  ${i.dim(t.updatedAt)}  ${t.turnCount} turn${t.turnCount===1?"":"s"}  ${v(t.title)}
`);return"continue"}async function Ee(e){if(l)return n.write(i.yellow(`/load disabled in private mode.
`)),"continue";if(!e)return n.write(i.red(`Usage: /load <id>
`)),"continue";let t=e.replace(/[\x00-\x1f\x7f]/g,"?"),r=await V(e);if(r.length===0)return n.write(i.red(`No session matches: ${t}
`)),"continue";if(r.length>1)return n.write(i.red(`Ambiguous prefix ${t} — matches ${r.length} sessions:
`)+r.slice(0,10).map((b)=>`  ${b.id}  ${v(b.title)}`).join(`
`)+`
`+(r.length>10?i.dim(`  ... and ${r.length-10} more
`):"")),"continue";let o=r[0],a=await Y(o.filePath);if(!a)return n.write(i.red(`Failed to read session ${e}.
`)),"continue";Se(a.filePath,a.meta),d.length=0;for(let b of a.turns)d.push({role:b.role,content:b.content,ts:b.ts});return n.write(i.dim(`Loaded ${a.meta.id} — ${v(a.meta.title)} (${a.turns.length} turns)
`)),"continue"}async function xe(){if(l)return n.write(i.yellow(`/save is disabled in private mode. Exit and rerun without --private to persist.
`)),"continue";if(D)return n.write(i.yellow(`/save is disabled — disk writes failed earlier this session.
`)),"continue";if(c)return n.write(i.dim(`Session already persisted: ${g?.id}
`)),"continue";let e=d.find((t)=>t.role==="user");if(!e)return n.write(i.dim(`Nothing to save yet — no user turns.
`)),"continue";try{let t=await St({firstUserMessage:e.content,model:Ve,tier:Xe,turns:d});c=t.filePath,g=t.meta,E=!0,n.write(i.dim(`Saved as ${t.meta.id} — ${t.meta.title}
`))}catch(t){let r=t instanceof Error?t.message:String(t);n.write(i.red(`Failed to save session: ${r}
`))}return"continue"}async function Te(e){if(l)return n.write(i.yellow(`/delete disabled in private mode.
`)),"continue";if(!e){if(!c)return n.write(i.dim(`Ephemeral session — nothing to delete. Starting fresh.
`)),d.length=0,"continue";if(!await G(c,`session ${g?.id}`))return"continue";return n.write(i.dim(`Deleted current session ${g?.id}. Starting fresh.
`)),c=void 0,g=void 0,d.length=0,E=!1,"continue"}let t=e.replace(/[\x00-\x1f\x7f]/g,"?"),r=await V(e);if(r.length===0)return n.write(i.red(`No session matches: ${t}
`)),"continue";if(r.length>1)return n.write(i.red(`Ambiguous prefix ${t} — matches ${r.length} sessions; refusing to delete:
`)+r.slice(0,10).map((a)=>`  ${a.id}  ${v(a.title)}`).join(`
`)+`
`+(r.length>10?i.dim(`  ... and ${r.length-10} more
`):"")),"continue";let o=r[0];if(!await G(o.filePath,o.id))return"continue";if(n.write(i.dim(`Deleted ${o.id}.
`)),o.filePath===c)c=void 0,g=void 0,d.length=0,E=!1;return"continue"}async function Ce(e){if(l)return n.write(i.yellow(`/wipe is disabled in private mode.
`)),"continue";if(n.write(i.red(`This will DELETE all persistent sessions.
`)),n.write(i.red('Type the word "yes" (lowercase) to confirm: ')),(await e()??"").trim()!=="yes")return n.write(i.dim(`Wipe cancelled.
`)),"continue";let{deleted:o,failed:a}=await he();if(n.write(i.dim(`Deleted ${o} session${o===1?"":"s"}.
`)),a>0)process.stderr.write(i.red(`Failed to delete ${a} session file${a===1?"":"s"} — they are still on disk.
`)),I=!0;if(a===0||!c||!Qe(c))c=void 0,g=void 0,E=!1;return"continue"}function Ie(){if(l)return n.write(i.yellow(s.initialPrivate?`Private mode was set for this whole process (--private / HOODY_CHAT_PRIVATE=1) and cannot be turned off.
`:"Private mode is already on and cannot be turned off — turns taken while it was on would otherwise become writable. Restart `hoody chat` for a non-private session.\n")),"continue";return l=!0,n.write(i.dim(`Private mode ${l?i.green("ON"):i.yellow("OFF")}. ${l?"No disk writes or reads.":"Disk writes/reads allowed."}
`)),"continue"}function H(){return(s.persist||E)&&!l&&!D}async function Re(e){if(c)return;if(!H())return;let t=await We({firstUserMessage:e,model:Ve,tier:Xe});c=t.filePath,g=t.meta}async function Le(e){if(e===void 0||e===!1)return null;if(e===!0){let r=await j();if(r.length===0)return null;return await Y(r[0].filePath)}let t=await V(e);if(t.length===0)return null;if(t.length>1){let r=t.slice(0,5).map((o)=>`  - ${o.id}`).join(`
`);throw Error(`Ambiguous session id/prefix "${e}" — ${t.length} matches:
${r}${t.length>5?`
  ... and ${t.length-5} more`:""}
Provide a longer prefix.`)}return await Y(t[0].filePath)}function Ae(){if(f)process.removeListener("SIGINT",R);s.sigintSignal?.removeEventListener("abort",R),m.close()}}var le=["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];function Ye(s){let p=0,n=!1,w=()=>{if(n)return;let h=le[p++%le.length];s.write(`\r${i.cyan(h)} ${i.dim("thinking…")}`)};w();let f=setInterval(w,80);return{stop(){if(n)return;n=!0,clearInterval(f),s.write("\x1B[2K\r")}}}export{ut as runRepl};
