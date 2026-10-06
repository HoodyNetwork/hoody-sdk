import{oe,ie,Je,$e,de,le,ce}from"./index-wcwykjay.js";import{w,Ke,we,G,U,K,ne,ut,ae,mt}from"./index-sw6rbks1.js";import{P}from"./index-f353d2nk.js";import{R,Ae}from"./index.js";import i from"chalk";import Me from"node:readline";import{existsSync as We}from"node:fs";import{open as ke}from"node:fs/promises";import{existsSync as Oe}from"node:fs";import{join as De}from"node:path";import k from"chalk";function re(){return De(R(),".hoody","chats",".seen-privacy-banner")}function Fe(){return Oe(re())}async function He(){await P();try{await(await ke(re(),"wx",384)).close()}catch(s){if(s?.code!=="EEXIST")process.stderr.write(`[hoody chat] Could not write banner marker: ${s?.message??s}
`)}}function _e(){let s=k.cyan,p=k.bold,n=k.green,g=k.yellow,f=k.dim,h=(B,O,l)=>`  ${B}  ${O.padEnd(20)} ${l}`;return["",`  ${p.cyan("hoody chat")}  ${f("·")}  ${p.green("Welcome ✨")}`,"",`  ${p("Privacy by default.")} ${f("Sessions live in memory only and vanish")}`,`  ${f("when you exit — opt in to persistence with")} ${n("--persist")}${f(".")}`,"",`  ${p("Privacy controls")}`,h(g("→"),"This REPL only",n("/private")),h(g("→"),"This invocation",n("--private")),h(g("→"),"Every invocation",Ae("HOODY_CHAT_PRIVATE","1")),"",`  ${p("Sessions")}`,h(s("•"),"Persist sessions",n("hoody chat --persist")),h(s("•"),"Wipe everything",n("hoody chat sessions delete --all -y")),"",`  ${f("Commands:")} ${s("hoody chat --help")}  ${f("·")}  ${f("In-REPL:")} ${s("/help")}  ${f("·")}  ${f("Exit:")} ${s("/exit")} ${f("or Ctrl-C ×2")}`,""].join(`
`)}async function se(s={}){let p=s.out??process.stdout,n=p.isTTY===!0,g=s.isInteractive??n;if(!s.force&&!g)return!1;if(!s.force&&Fe())return!1;return p.write(_e()),await He(),!0}async function ot(s){let p=s.input??process.stdin,n=s.output??process.stdout,g=n.isTTY===!0,f=p.isTTY===!0,h=g&&f;if(!s.initialPrivate)await se({out:n,isInteractive:h});let B=s.markdown===!1,O=s.stream===!1,l=s.initialPrivate,c,y,D=!1,J=(e,t)=>{if(D)return;D=!0;let r=e instanceof Error?e.message:String(e);process.stderr.write(i.yellow(`
[hoody chat] Persistence ${t} failed (${r}). Continuing in-memory only — disk writes disabled for this REPL.
`))},d=[],C=!1,x=!1,j=!1,q=async(e,t)=>{try{return await ne(e),!0}catch(r){let o=r instanceof Error?r.message:String(r);return process.stderr.write(i.red(`Failed to delete ${t}: ${o}
`)),C=!0,!1}},S="idle",T;if(s.resume!==void 0&&l)process.stderr.write(i.yellow(`hoody chat: --resume does nothing in private mode (it would have to read from disk); starting a new session.
`));else if(s.resume!==void 0&&!s.persist)process.stderr.write(i.yellow(`hoody chat: --resume requires --persist; starting a new session.
`));if(s.persist&&s.resume!==void 0&&!l){let e=await Ie(s.resume);if(e){c=e.filePath,y=e.meta;for(let t of e.turns)d.push({role:t.role,content:t.content,ts:t.ts});n.write(i.dim(`Resumed session ${e.meta.id} — ${w(e.meta.title)}
`))}else process.stderr.write(i.yellow(typeof s.resume==="string"?`hoody chat: no session matches "${s.resume}" — starting a new one.
`:`hoody chat: no previous session to resume — starting a new one.
`))}let m=Me.createInterface({input:p,output:g?n:void 0,terminal:h,prompt:i.cyan("hoody> ")}),I=()=>{if(S==="inflight"&&T){T.abort(Error("user-interrupt")),T=void 0,S="idle",n.write(`
`+i.dim(`(aborted)
`)),m.prompt();return}if(S==="confirm-exit"){n.write(`
`+i.dim(`Exiting.
`)),m.close();return}S="confirm-exit",n.write(`
`+i.dim(`Press Ctrl-C again to exit, or continue typing.
`)),m.prompt()};if(f)m.on("SIGINT",I),process.on("SIGINT",I);if(s.sigintSignal)s.sigintSignal.addEventListener("abort",I);let v="",F=!1,H=[],L=[],V=!1,X=(e,t=!1)=>{let r={line:e,bypassSlash:t};if(L.length>0)L.shift()(r);else H.push(r)},z=()=>{if(H.length>0)return Promise.resolve(H.shift());if(V)return Promise.resolve(null);return new Promise((e)=>{L.push(e)})};m.on("line",(e)=>X(e)),m.once("close",()=>{V=!0;for(let e of L)e(null);if(L=[],f&&S==="inflight"&&T&&H.length===0)T.abort(Error("stdin-closed"))});let fe=async()=>{let e=await z();return e===null?null:e.line};m.prompt();while(!0){let e=await z();if(e===null)break;let{line:t,bypassSlash:r}=e;if(S==="confirm-exit")S="idle";if(t.trim()==='"""'){if(!F){F=!0,m.prompt();continue}F=!1;let a=v;if(v="",!a.trim()){m.prompt();continue}await Z(a),m.prompt();continue}if(F){v+=(v.length>0?`
`:"")+t,m.prompt();continue}if(t.endsWith("\\")){v+=(v.length>0?`
`:"")+t.slice(0,-1),m.prompt();continue}let o=(v.length>0?v+`
`:"")+t;if(v="",!o.trim()){m.prompt();continue}if(!r&&o.trim().startsWith("/")){if(await me(o.trim(),fe)==="exit"){m.close();break}m.prompt();continue}await Z(o),m.prompt()}if(!h&&C)process.exitCode=j?2:1;return Re();async function Z(e){S="inflight";let t=new AbortController;T=t;let r=new Date().toISOString();if(d.push({role:"user",content:e,ts:r}),_())try{if(await Ce(e),c)await we(c,{role:"user",content:e,ts:r})}catch(u){J(u,"user-turn write")}let o=process.env.HOODY_CHAT_MAX_HISTORY,a=o!==void 0&&/^\d+$/.test(o)?Number(o):void 0,b=a!==void 0?a:10,Q=[],Y=d.slice(0,-1);for(let u=0;u<Y.length-1;u++){let W=Y[u],te=Y[u+1];if(W.role==="user"&&te.role==="assistant")Q.push({role:"user",content:W.content}),Q.push({role:"assistant",content:te.content}),u++}let Le=b<=0?[]:Q.slice(-b*2),N=oe({out:n,noMarkdown:B}),A="",ee=!1,M=h?Be(n):null,E=await le({message:e,history:Le,limiter:ce,acceptEndpointFlag:s.acceptEndpointFlag,acceptEndpointEnv:s.acceptEndpointEnv,isTty:h,sessionOnly:l,signal:t.signal,onDelta:O?void 0:(u)=>{if(M)M.stop();A+=u,N.write(u)}});if(M)M.stop();if("error"in E){ee=!0;let u=t.signal.aborted||/user-interrupt|stdin-closed|aborted by caller/.test(E.message);if(j=E.error==="endpoint-not-accepted",!u)C=!0,process.stderr.write(i.red(`Error: ${E.message}`)+`
`)}else{if(C=!1,O)A=E.text,N.write(E.text);if(E.truncated)N.write(ie);let u=de(E.sources);if(u)N.write(u)}N.end();let Ne=t.signal.aborted===!0;if(!ee&&!Ne&&A.length>0){let u=new Date().toISOString();if(d.push({role:"assistant",content:A,ts:u}),_()&&c)try{await we(c,{role:"assistant",content:A,ts:u})}catch(W){J(W,"assistant-turn write")}}T=void 0,S="idle"}async function me(e,t){let[r,...o]=e.slice(1).split(/\s+/),a=o.join(" ").trim();switch(r){case"help":return he();case"exit":case"quit":return"exit";case"clear":if(g)n.write("\x1B[2J\x1B[H");return"continue";case"new":return ye();case"history":return Se();case"sessions":return ve();case"load":return be(a);case"save":return Pe();case"delete":return Ee(a);case"wipe":return xe(t);case"private":return Te();case"retry":return pe();default:return n.write(i.red(`Unknown command: /${r}. Try /help.
`)),"continue"}}async function pe(){if(S==="inflight")return n.write(i.yellow(`/retry refused: a turn is in flight. Ctrl-C to abort first.
`)),"continue";if(d.length===0)return n.write(i.dim(`Nothing to retry — no turns yet.
`)),"continue";let e=-1;for(let o=d.length-1;o>=0;o--)if(d[o].role==="user"){e=o;break}if(e===-1)return n.write(i.dim(`Nothing to retry — no user turn in transcript.
`)),"continue";let t=d[e].content;if(d.length=e,_()&&c)try{await ut(c,e)}catch(o){J(o,"retry truncate")}return n.write(i.dim(`Retrying last message…
`)),X(t,!0),"continue"}function he(){let e=[["/help","Print this table"],["/exit, /quit","Exit the REPL"],["/clear","Clear the screen (keeps current session)"],["/new","Start a fresh session in-place"],["/history","Print current transcript"],["/sessions",`List persistent sessions (${l?"disabled in private mode":"OK"})`],["/load <id>",`Switch REPL to that session's history${l?" (disabled in private mode)":""}`],["/save",`Promote current session → persistent file${l?" (refused in private mode)":""}`],["/delete [id]",`Delete session <id>; no arg = delete current + /new${l?" (disabled in private mode)":""}`],["/wipe",`Delete ALL persistent sessions (confirms)${l?" (disabled in private mode)":""}`],["/private",`Toggle private mode (currently: ${l?"ON":"OFF"})`],["/retry","Drop the last assistant reply and re-send the last user message"]];for(let[t,r]of e)n.write(`  ${i.cyan(t.padEnd(18))} ${r}
`);return"continue"}function ge(e,t){c=e,y=t,x=!0}function ye(){return d.length=0,c=void 0,y=void 0,x=!1,n.write(i.dim(`New session.
`)),"continue"}function Se(){if(d.length===0)return n.write(i.dim(`(empty transcript)
`)),"continue";for(let e of d){let t=e.role==="user"?i.green:e.role==="assistant"?i.blue:i.dim;n.write(t(`[${e.role}]`)+" "+w(e.content)+`
`)}return"continue"}async function ve(){if(l)return n.write(i.yellow(`/sessions disabled in private mode.
`)),"continue";let e=await U();if(e.length===0)return n.write(i.dim(`(no persistent sessions)
`)),"continue";for(let t of e)n.write(`  ${i.cyan(t.id)}  ${i.dim(t.updatedAt)}  ${t.turnCount} turn${t.turnCount===1?"":"s"}  ${w(t.title)}
`);return"continue"}async function be(e){if(l)return n.write(i.yellow(`/load disabled in private mode.
`)),"continue";if(!e)return n.write(i.red(`Usage: /load <id>
`)),"continue";let t=e.replace(/[\x00-\x1f\x7f]/g,"?"),r=await K(e);if(r.length===0)return n.write(i.red(`No session matches: ${t}
`)),"continue";if(r.length>1)return n.write(i.red(`Ambiguous prefix ${t} — matches ${r.length} sessions:
`)+r.slice(0,10).map((b)=>`  ${b.id}  ${w(b.title)}`).join(`
`)+`
`+(r.length>10?i.dim(`  ... and ${r.length-10} more
`):"")),"continue";let o=r[0],a=await G(o.filePath);if(!a)return n.write(i.red(`Failed to read session ${e}.
`)),"continue";ge(a.filePath,a.meta),d.length=0;for(let b of a.turns)d.push({role:b.role,content:b.content,ts:b.ts});return n.write(i.dim(`Loaded ${a.meta.id} — ${w(a.meta.title)} (${a.turns.length} turns)
`)),"continue"}async function Pe(){if(l)return n.write(i.yellow(`/save is disabled in private mode. Exit and rerun without --private to persist.
`)),"continue";if(D)return n.write(i.yellow(`/save is disabled — disk writes failed earlier this session.
`)),"continue";if(c)return n.write(i.dim(`Session already persisted: ${y?.id}
`)),"continue";let e=d.find((t)=>t.role==="user");if(!e)return n.write(i.dim(`Nothing to save yet — no user turns.
`)),"continue";try{let t=await mt({firstUserMessage:e.content,model:Je,tier:$e,turns:d});c=t.filePath,y=t.meta,x=!0,n.write(i.dim(`Saved as ${t.meta.id} — ${t.meta.title}
`))}catch(t){let r=t instanceof Error?t.message:String(t);n.write(i.red(`Failed to save session: ${r}
`))}return"continue"}async function Ee(e){if(l)return n.write(i.yellow(`/delete disabled in private mode.
`)),"continue";if(!e){if(!c)return n.write(i.dim(`Ephemeral session — nothing to delete. Starting fresh.
`)),d.length=0,"continue";if(!await q(c,`session ${y?.id}`))return"continue";return n.write(i.dim(`Deleted current session ${y?.id}. Starting fresh.
`)),c=void 0,y=void 0,d.length=0,x=!1,"continue"}let t=e.replace(/[\x00-\x1f\x7f]/g,"?"),r=await K(e);if(r.length===0)return n.write(i.red(`No session matches: ${t}
`)),"continue";if(r.length>1)return n.write(i.red(`Ambiguous prefix ${t} — matches ${r.length} sessions; refusing to delete:
`)+r.slice(0,10).map((a)=>`  ${a.id}  ${w(a.title)}`).join(`
`)+`
`+(r.length>10?i.dim(`  ... and ${r.length-10} more
`):"")),"continue";let o=r[0];if(!await q(o.filePath,o.id))return"continue";if(n.write(i.dim(`Deleted ${o.id}.
`)),o.filePath===c)c=void 0,y=void 0,d.length=0,x=!1;return"continue"}async function xe(e){if(l)return n.write(i.yellow(`/wipe is disabled in private mode.
`)),"continue";if(n.write(i.red(`This will DELETE all persistent sessions.
`)),n.write(i.red('Type the word "yes" (lowercase) to confirm: ')),(await e()??"").trim()!=="yes")return n.write(i.dim(`Wipe cancelled.
`)),"continue";let{deleted:o,failed:a}=await ae();if(n.write(i.dim(`Deleted ${o} session${o===1?"":"s"}.
`)),a>0)process.stderr.write(i.red(`Failed to delete ${a} session file${a===1?"":"s"} — they are still on disk.
`)),C=!0;if(a===0||!c||!We(c))c=void 0,y=void 0,x=!1;return"continue"}function Te(){if(l)return n.write(i.yellow(s.initialPrivate?`Private mode was set for this whole process (--private / HOODY_CHAT_PRIVATE=1) and cannot be turned off.
`:"Private mode is already on and cannot be turned off — turns taken while it was on would otherwise become writable. Restart `hoody chat` for a non-private session.\n")),"continue";return l=!0,n.write(i.dim(`Private mode ${l?i.green("ON"):i.yellow("OFF")}. ${l?"No disk writes or reads.":"Disk writes/reads allowed."}
`)),"continue"}function _(){return(s.persist||x)&&!l&&!D}async function Ce(e){if(c)return;if(!_())return;let t=await Ke({firstUserMessage:e,model:Je,tier:$e});c=t.filePath,y=t.meta}async function Ie(e){if(e===void 0||e===!1)return null;if(e===!0){let r=await U();if(r.length===0)return null;return await G(r[0].filePath)}let t=await K(e);if(t.length===0)return null;if(t.length>1){let r=t.slice(0,5).map((o)=>`  - ${o.id}`).join(`
`);throw Error(`Ambiguous session id/prefix "${e}" — ${t.length} matches:
${r}${t.length>5?`
  ... and ${t.length-5} more`:""}
Provide a longer prefix.`)}return await G(t[0].filePath)}function Re(){if(f)process.removeListener("SIGINT",I);s.sigintSignal?.removeEventListener("abort",I),m.close()}}var ue=["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];function Be(s){let p=0,n=!1,g=()=>{if(n)return;let h=ue[p++%ue.length];s.write(`\r${i.cyan(h)} ${i.dim("thinking…")}`)};g();let f=setInterval(g,80);return{stop(){if(n)return;n=!0,clearInterval(f),s.write("\x1B[2K\r")}}}export{ot as runRepl};
