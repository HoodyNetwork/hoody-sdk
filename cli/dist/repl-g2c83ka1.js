import{a as $z,b as Qz,c as u,d as l,e as Vz,f as Oz,g as Bz}from"./index-14nv2x9k.js";import"./index-p6y8qg03.js";import{m as w,n as Hz,o as n,p as k,q as o,r as m,s as Nz,t as jz,u as qz,v as Uz}from"./index-4fjpm2g6.js";import{w as Wz}from"./index-f2ce9jac.js";import{Ja as Jz,Ka as Kz}from"./index-3vwsc5zq.js";import"./index-xjdpwnkp.js";import K from"chalk";import pz from"node:readline";import{existsSync as dz}from"node:fs";import{open as Sz}from"node:fs/promises";import{existsSync as fz}from"node:fs";import{join as kz}from"node:path";import y from"chalk";function Xz(){return kz(Jz(),".hoody","chats",".seen-privacy-banner")}function mz(){return fz(Xz())}async function hz(){await Wz();try{await(await Sz(Xz(),"wx",384)).close()}catch(X){if(X?.code!=="EEXIST")process.stderr.write(`[hoody chat] Could not write banner marker: ${X?.message??X}
`)}}function cz(){let X=y.cyan,N=y.bold,J=y.green,q=y.yellow,B=y.dim,j=(h,P,$)=>`  ${h}  ${P.padEnd(20)} ${$}`;return["",`  ${N.cyan("hoody chat")}  ${B("·")}  ${N.green("Welcome ✨")}`,"",`  ${N("Privacy by default.")} ${B("Sessions live in memory only and vanish")}`,`  ${B("when you exit — opt in to persistence with")} ${J("--persist")}${B(".")}`,"",`  ${N("Privacy controls")}`,j(q("→"),"This REPL only",J("/private")),j(q("→"),"This invocation",J("--private")),j(q("→"),"Every invocation",Kz("HOODY_CHAT_PRIVATE","1")),"",`  ${N("Sessions")}`,j(X("•"),"Persist sessions",J("hoody chat --persist")),j(X("•"),"Wipe everything",J("hoody chat sessions delete --all -y")),"",`  ${B("Commands:")} ${X("hoody chat --help")}  ${B("·")}  ${B("In-REPL:")} ${X("/help")}  ${B("·")}  ${B("Exit:")} ${X("/exit")} ${B("or Ctrl-C ×2")}`,""].join(`
`)}async function Yz(X={}){let N=X.out??process.stdout,J=N.isTTY===!0,q=X.isInteractive??J;if(!X.force&&!q)return!1;if(!X.force&&mz())return!1;return N.write(cz()),await hz(),!0}async function ZG(X){let N=X.input??process.stdin,J=X.output??process.stdout,q=J.isTTY===!0,B=N.isTTY===!0,j=q&&B;if(!X.initialPrivate)await Yz({out:J,isInteractive:j});let h=X.markdown===!1,P=X.stream===!1,$=X.initialPrivate,Q,U,b=!1,c=(z,G)=>{if(b)return;b=!0;let W=z instanceof Error?z.message:String(z);process.stderr.write(K.yellow(`
[hoody chat] Persistence ${G} failed (${W}). Continuing in-memory only — disk writes disabled for this REPL.
`))},V=[],I=!1,A=!1,i=!1,a=async(z,G)=>{try{return await Nz(z),!0}catch(W){let Y=W instanceof Error?W.message:String(W);return process.stderr.write(K.red(`Failed to delete ${G}: ${Y}
`)),I=!0,!1}},_="idle",R;if(X.resume!==void 0&&$)process.stderr.write(K.yellow(`hoody chat: --resume does nothing in private mode (it would have to read from disk); starting a new session.
`));else if(X.resume!==void 0&&!X.persist)process.stderr.write(K.yellow(`hoody chat: --resume requires --persist; starting a new session.
`));if(X.persist&&X.resume!==void 0&&!$){let z=await bz(X.resume);if(z){Q=z.filePath,U=z.meta;for(let G of z.turns)V.push({role:G.role,content:G.content,ts:G.ts});J.write(K.dim(`Resumed session ${z.meta.id} — ${w(z.meta.title)}
`))}else process.stderr.write(K.yellow(typeof X.resume==="string"?`hoody chat: no session matches "${X.resume}" — starting a new one.
`:`hoody chat: no previous session to resume — starting a new one.
`))}let H=pz.createInterface({input:N,output:q?J:void 0,terminal:j,prompt:K.cyan("hoody> ")}),C=()=>{if(_==="inflight"&&R){R.abort(Error("user-interrupt")),R=void 0,_="idle",J.write(`
`+K.dim(`(aborted)
`)),H.prompt();return}if(_==="confirm-exit"){J.write(`
`+K.dim(`Exiting.
`)),H.close();return}_="confirm-exit",J.write(`
`+K.dim(`Press Ctrl-C again to exit, or continue typing.
`)),H.prompt()};if(B)H.on("SIGINT",C),process.on("SIGINT",C);if(X.sigintSignal)X.sigintSignal.addEventListener("abort",C);let x="",F=!1,v=[],T=[],r=!1,t=(z,G=!1)=>{let W={line:z,bypassSlash:G};if(T.length>0)T.shift()(W);else v.push(W)},s=()=>{if(v.length>0)return Promise.resolve(v.shift());if(r)return Promise.resolve(null);return new Promise((z)=>{T.push(z)})};H.on("line",(z)=>t(z)),H.once("close",()=>{r=!0;for(let z of T)z(null);if(T=[],B&&_==="inflight"&&R&&v.length===0)R.abort(Error("stdin-closed"))});let _z=async()=>{let z=await s();return z===null?null:z.line};H.prompt();while(!0){let z=await s();if(z===null)break;let{line:G,bypassSlash:W}=z;if(_==="confirm-exit")_="idle";if(G.trim()==='"""'){if(!F){F=!0,H.prompt();continue}F=!1;let Z=x;if(x="",!Z.trim()){H.prompt();continue}await e(Z),H.prompt();continue}if(F){x+=(x.length>0?`
`:"")+G,H.prompt();continue}if(G.endsWith("\\")){x+=(x.length>0?`
`:"")+G.slice(0,-1),H.prompt();continue}let Y=(x.length>0?x+`
`:"")+G;if(x="",!Y.trim()){H.prompt();continue}if(!W&&Y.trim().startsWith("/")){if(await xz(Y.trim(),_z)==="exit"){H.close();break}H.prompt();continue}await e(Y),H.prompt()}if(!j&&I)process.exitCode=i?2:1;return Fz();async function e(z){_="inflight";let G=new AbortController;R=G;let W=new Date().toISOString();if(V.push({role:"user",content:z,ts:W}),M())try{if(await Pz(z),Q)await n(Q,{role:"user",content:z,ts:W})}catch(O){c(O,"user-turn write")}let Y=process.env.HOODY_CHAT_MAX_HISTORY,Z=Y!==void 0&&/^\d+$/.test(Y)?Number(Y):void 0,L=Z!==void 0?Z:10,p=[],d=V.slice(0,-1);for(let O=0;O<d.length-1;O++){let f=d[O],Gz=d[O+1];if(f.role==="user"&&Gz.role==="assistant")p.push({role:"user",content:f.content}),p.push({role:"assistant",content:Gz.content}),O++}let vz=L<=0?[]:p.slice(-L*2),E=$z({out:J,noMarkdown:h}),g="",zz=!1,S=j?uz(J):null,D=await Oz({message:z,history:vz,limiter:Bz,acceptEndpointFlag:X.acceptEndpointFlag,acceptEndpointEnv:X.acceptEndpointEnv,isTty:j,sessionOnly:$,signal:G.signal,onDelta:P?void 0:(O)=>{if(S)S.stop();g+=O,E.write(O)}});if(S)S.stop();if("error"in D){zz=!0;let O=G.signal.aborted||/user-interrupt|stdin-closed|aborted by caller/.test(D.message);if(i=D.error==="endpoint-not-accepted",!O)I=!0,process.stderr.write(K.red(`Error: ${D.message}`)+`
`)}else{if(I=!1,P)g=D.text,E.write(D.text);if(D.truncated)E.write(Qz);let O=Vz(D.sources);if(O)E.write(O)}E.end();let Mz=G.signal.aborted===!0;if(!zz&&!Mz&&g.length>0){let O=new Date().toISOString();if(V.push({role:"assistant",content:g,ts:O}),M()&&Q)try{await n(Q,{role:"assistant",content:g,ts:O})}catch(f){c(f,"assistant-turn write")}}R=void 0,_="idle"}async function xz(z,G){let[W,...Y]=z.slice(1).split(/\s+/),Z=Y.join(" ").trim();switch(W){case"help":return Dz();case"exit":case"quit":return"exit";case"clear":if(q)J.write("\x1B[2J\x1B[H");return"continue";case"new":return Rz();case"history":return wz();case"sessions":return Iz();case"load":return Cz(Z);case"save":return Tz();case"delete":return Ez(Z);case"wipe":return gz(G);case"private":return yz();case"retry":return Lz();default:return J.write(K.red(`Unknown command: /${W}. Try /help.
`)),"continue"}}async function Lz(){if(_==="inflight")return J.write(K.yellow(`/retry refused: a turn is in flight. Ctrl-C to abort first.
`)),"continue";if(V.length===0)return J.write(K.dim(`Nothing to retry — no turns yet.
`)),"continue";let z=-1;for(let Y=V.length-1;Y>=0;Y--)if(V[Y].role==="user"){z=Y;break}if(z===-1)return J.write(K.dim(`Nothing to retry — no user turn in transcript.
`)),"continue";let G=V[z].content;if(V.length=z,M()&&Q)try{await jz(Q,z)}catch(Y){c(Y,"retry truncate")}return J.write(K.dim(`Retrying last message…
`)),t(G,!0),"continue"}function Dz(){let z=[["/help","Print this table"],["/exit, /quit","Exit the REPL"],["/clear","Clear the screen (keeps current session)"],["/new","Start a fresh session in-place"],["/history","Print current transcript"],["/sessions",`List persistent sessions (${$?"disabled in private mode":"OK"})`],["/load <id>",`Switch REPL to that session's history${$?" (disabled in private mode)":""}`],["/save",`Promote current session → persistent file${$?" (refused in private mode)":""}`],["/delete [id]",`Delete session <id>; no arg = delete current + /new${$?" (disabled in private mode)":""}`],["/wipe",`Delete ALL persistent sessions (confirms)${$?" (disabled in private mode)":""}`],["/private",`Toggle private mode (currently: ${$?"ON":"OFF"})`],["/retry","Drop the last assistant reply and re-send the last user message"]];for(let[G,W]of z)J.write(`  ${K.cyan(G.padEnd(18))} ${W}
`);return"continue"}function Az(z,G){Q=z,U=G,A=!0}function Rz(){return V.length=0,Q=void 0,U=void 0,A=!1,J.write(K.dim(`New session.
`)),"continue"}function wz(){if(V.length===0)return J.write(K.dim(`(empty transcript)
`)),"continue";for(let z of V){let G=z.role==="user"?K.green:z.role==="assistant"?K.blue:K.dim;J.write(G(`[${z.role}]`)+" "+w(z.content)+`
`)}return"continue"}async function Iz(){if($)return J.write(K.yellow(`/sessions disabled in private mode.
`)),"continue";let z=await o();if(z.length===0)return J.write(K.dim(`(no persistent sessions)
`)),"continue";for(let G of z)J.write(`  ${K.cyan(G.id)}  ${K.dim(G.updatedAt)}  ${G.turnCount} turn${G.turnCount===1?"":"s"}  ${w(G.title)}
`);return"continue"}async function Cz(z){if($)return J.write(K.yellow(`/load disabled in private mode.
`)),"continue";if(!z)return J.write(K.red(`Usage: /load <id>
`)),"continue";let G=z.replace(/[\x00-\x1f\x7f]/g,"?"),W=await m(z);if(W.length===0)return J.write(K.red(`No session matches: ${G}
`)),"continue";if(W.length>1)return J.write(K.red(`Ambiguous prefix ${G} — matches ${W.length} sessions:
`)+W.slice(0,10).map((L)=>`  ${L.id}  ${w(L.title)}`).join(`
`)+`
`+(W.length>10?K.dim(`  ... and ${W.length-10} more
`):"")),"continue";let Y=W[0],Z=await k(Y.filePath);if(!Z)return J.write(K.red(`Failed to read session ${z}.
`)),"continue";Az(Z.filePath,Z.meta),V.length=0;for(let L of Z.turns)V.push({role:L.role,content:L.content,ts:L.ts});return J.write(K.dim(`Loaded ${Z.meta.id} — ${w(Z.meta.title)} (${Z.turns.length} turns)
`)),"continue"}async function Tz(){if($)return J.write(K.yellow(`/save is disabled in private mode. Exit and rerun without --private to persist.
`)),"continue";if(b)return J.write(K.yellow(`/save is disabled — disk writes failed earlier this session.
`)),"continue";if(Q)return J.write(K.dim(`Session already persisted: ${U?.id}
`)),"continue";let z=V.find((G)=>G.role==="user");if(!z)return J.write(K.dim(`Nothing to save yet — no user turns.
`)),"continue";try{let G=await Uz({firstUserMessage:z.content,model:u,tier:l,turns:V});Q=G.filePath,U=G.meta,A=!0,J.write(K.dim(`Saved as ${G.meta.id} — ${G.meta.title}
`))}catch(G){let W=G instanceof Error?G.message:String(G);J.write(K.red(`Failed to save session: ${W}
`))}return"continue"}async function Ez(z){if($)return J.write(K.yellow(`/delete disabled in private mode.
`)),"continue";if(!z){if(!Q)return J.write(K.dim(`Ephemeral session — nothing to delete. Starting fresh.
`)),V.length=0,"continue";if(!await a(Q,`session ${U?.id}`))return"continue";return J.write(K.dim(`Deleted current session ${U?.id}. Starting fresh.
`)),Q=void 0,U=void 0,V.length=0,A=!1,"continue"}let G=z.replace(/[\x00-\x1f\x7f]/g,"?"),W=await m(z);if(W.length===0)return J.write(K.red(`No session matches: ${G}
`)),"continue";if(W.length>1)return J.write(K.red(`Ambiguous prefix ${G} — matches ${W.length} sessions; refusing to delete:
`)+W.slice(0,10).map((Z)=>`  ${Z.id}  ${w(Z.title)}`).join(`
`)+`
`+(W.length>10?K.dim(`  ... and ${W.length-10} more
`):"")),"continue";let Y=W[0];if(!await a(Y.filePath,Y.id))return"continue";if(J.write(K.dim(`Deleted ${Y.id}.
`)),Y.filePath===Q)Q=void 0,U=void 0,V.length=0,A=!1;return"continue"}async function gz(z){if($)return J.write(K.yellow(`/wipe is disabled in private mode.
`)),"continue";if(J.write(K.red(`This will DELETE all persistent sessions.
`)),J.write(K.red('Type the word "yes" (lowercase) to confirm: ')),(await z()??"").trim()!=="yes")return J.write(K.dim(`Wipe cancelled.
`)),"continue";let{deleted:Y,failed:Z}=await qz();if(J.write(K.dim(`Deleted ${Y} session${Y===1?"":"s"}.
`)),Z>0)process.stderr.write(K.red(`Failed to delete ${Z} session file${Z===1?"":"s"} — they are still on disk.
`)),I=!0;if(Z===0||!Q||!dz(Q))Q=void 0,U=void 0,A=!1;return"continue"}function yz(){if($)return J.write(K.yellow(X.initialPrivate?`Private mode was set for this whole process (--private / HOODY_CHAT_PRIVATE=1) and cannot be turned off.
`:"Private mode is already on and cannot be turned off — turns taken while it was on would otherwise become writable. Restart `hoody chat` for a non-private session.\n")),"continue";return $=!0,J.write(K.dim(`Private mode ${$?K.green("ON"):K.yellow("OFF")}. ${$?"No disk writes or reads.":"Disk writes/reads allowed."}
`)),"continue"}function M(){return(X.persist||A)&&!$&&!b}async function Pz(z){if(Q)return;if(!M())return;let G=await Hz({firstUserMessage:z,model:u,tier:l});Q=G.filePath,U=G.meta}async function bz(z){if(z===void 0||z===!1)return null;if(z===!0){let W=await o();if(W.length===0)return null;return await k(W[0].filePath)}let G=await m(z);if(G.length===0)return null;if(G.length>1){let W=G.slice(0,5).map((Y)=>`  - ${Y.id}`).join(`
`);throw Error(`Ambiguous session id/prefix "${z}" — ${G.length} matches:
${W}${G.length>5?`
  ... and ${G.length-5} more`:""}
Provide a longer prefix.`)}return await k(G[0].filePath)}function Fz(){if(B)process.removeListener("SIGINT",C);X.sigintSignal?.removeEventListener("abort",C),H.close()}}var Zz=["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];function uz(X){let N=0,J=!1,q=()=>{if(J)return;let j=Zz[N++%Zz.length];X.write(`\r${K.cyan(j)} ${K.dim("thinking…")}`)};q();let B=setInterval(q,80);return{stop(){if(J)return;J=!0,clearInterval(B),X.write("\x1B[2K\r")}}}export{ZG as runRepl};
