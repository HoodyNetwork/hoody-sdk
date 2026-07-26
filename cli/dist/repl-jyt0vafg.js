import{b as Yz,c as Zz,d as $z,e as _z,f as Oz,g as M,h as p,i as f}from"./index-mgc7ervp.js";import"./index-gtmv8pbc.js";import{A as Hz,r as E,s as Xz,t as l,u as g,v as u,w as k,x as c,y as Nz,z as Bz}from"./index-qx4jgbrv.js";import{B as Jz}from"./index-e54gft1y.js";import{Oa as zz,Pa as Gz}from"./index-fgzhrj8s.js";import"./index-859fjz74.js";import K from"chalk";import pz from"node:readline";import{open as fz}from"node:fs/promises";import{existsSync as gz}from"node:fs";import{join as kz}from"node:path";import T from"chalk";function Kz(){return kz(zz(),".hoody","chats",".seen-privacy-banner")}function mz(){return gz(Kz())}async function hz(){await Jz();try{await(await fz(Kz(),"wx",384)).close()}catch(V){if(V?.code!=="EEXIST")process.stderr.write(`[hoody chat] Could not write banner marker: ${V?.message??V}
`)}}function dz(){let V=T.cyan,Q=T.bold,G=T.green,H=T.yellow,N=T.dim,L=(I,Z,$)=>`  ${I}  ${Z.padEnd(20)} ${$}`;return["",`  ${Q.cyan("hoody chat")}  ${N("·")}  ${Q.green("Welcome ✨")}`,"",`  ${Q("Privacy by default.")} ${N("Sessions live in memory only and vanish")}`,`  ${N("when you exit — opt in to persistence with")} ${G("--persist")}${N(".")}`,"",`  ${Q("Privacy controls")}`,L(H("→"),"This REPL only",G("/private")),L(H("→"),"This invocation",G("--private")),L(H("→"),"Every invocation",Gz("HOODY_CHAT_PRIVATE","1")),"",`  ${Q("Sessions & tools")}`,L(V("•"),"Persist sessions",G("hoody chat --persist")),L(V("•"),"Wipe everything",G("hoody chat sessions delete --all -y")),L(V("•"),"Disable docs tool",`${G("/tool off")}  ${N("(or HOODY_CHAT_DOCS_TOOL=0)")}`),"",`  ${N("Commands:")} ${V("hoody chat --help")}  ${N("·")}  ${N("In-REPL:")} ${V("/help")}  ${N("·")}  ${N("Exit:")} ${V("/exit")} ${N("or Ctrl-C ×2")}`,""].join(`
`)}async function Vz(V={}){let Q=V.out??process.stdout,G=Q.isTTY===!0,H=V.isInteractive??G;if(!V.force&&!H)return!1;if(!V.force&&mz())return!1;return Q.write(dz()),await hz(),!0}async function $G(V){let Q=V.input??process.stdin,G=V.output??process.stdout,H=G.isTTY===!0,N=Q.isTTY===!0,L=H&&N;if(!V.initialPrivate)await Vz({out:G,isInteractive:L});let{initialToolsEnabled:I,initialPrivate:Z}=V,$,U,C=!1,m=(z,J)=>{if(C)return;C=!0;let W=z instanceof Error?z.message:String(z);G.write(K.yellow(`
[hoody chat] Persistence ${J} failed (${W}). Continuing in-memory only — disk writes disabled for this REPL.
`))},_=[],q="idle",R,x=V.contextPreface;if(V.persist&&V.resume!==void 0&&!Z){let z=await Fz(V.resume);if(z){$=z.filePath,U=z.meta;for(let J of z.turns)_.push({role:J.role,content:J.content,ts:J.ts});G.write(K.dim(`Resumed session ${z.meta.id} — ${E(z.meta.title)}
`))}}let B=pz.createInterface({input:Q,output:H?G:void 0,terminal:L,prompt:K.cyan("hoody> ")}),F=()=>{if(q==="inflight"&&R){R.abort(Error("user-interrupt")),R=void 0,q="idle",G.write(`
`+K.dim(`(aborted)
`)),B.prompt();return}if(q==="confirm-exit"){G.write(`
`+K.dim(`Exiting.
`)),B.close();return}q="confirm-exit",G.write(`
`+K.dim(`Press Ctrl-C again to exit, or continue typing.
`)),B.prompt()};if(N)process.on("SIGINT",F);if(V.sigintSignal)V.sigintSignal.addEventListener("abort",F);let j="",S=!1,P=[],w=[],n=!1,a=(z,J=!1)=>{let W={line:z,bypassSlash:J};if(w.length>0)w.shift()(W);else P.push(W)},i=()=>{if(P.length>0)return Promise.resolve(P.shift());if(n)return Promise.resolve(null);return new Promise((z)=>{w.push(z)})};B.on("line",(z)=>a(z)),B.once("close",()=>{n=!0;for(let z of w)z(null);if(w=[],N&&q==="inflight"&&R&&P.length===0)R.abort(Error("stdin-closed"))});let Lz=async()=>{let z=await i();return z===null?null:z.line};B.prompt();while(!0){let z=await i();if(z===null)break;let{line:J,bypassSlash:W}=z;if(q==="confirm-exit")q="idle";if(J.trim()==='"""'){if(!S){S=!0,B.prompt();continue}S=!1;let O=j;if(j="",!O.trim()){B.prompt();continue}await o(O),B.prompt();continue}if(S){j+=(j.length>0?`
`:"")+J,B.prompt();continue}if(J.endsWith("\\")){j+=(j.length>0?`
`:"")+J.slice(0,-1),B.prompt();continue}let Y=(j.length>0?j+`
`:"")+J;if(j="",!Y.trim()){B.prompt();continue}if(!W&&Y.trim().startsWith("/")){if(await Qz(Y.trim(),Lz)==="exit"){B.close();break}B.prompt();continue}await o(Y),B.prompt()}return Sz();async function o(z){q="inflight",R=new AbortController;let J=new Date().toISOString();if(_.push({role:"user",content:z,ts:J}),y())try{if(await Cz(z),$)await l($,{role:"user",content:z,ts:J})}catch(X){m(X,"user-turn write")}let W,Y="";if(I){let X=Oz({userMessage:z});if(X.hit&&X.query.length>=8){Y=X.query;let D=f.get(Y);if(D)W=D;else{if(H)G.write(K.dim("[hoody chat] searching docs…\r"));if(W=await $z({query:Y,limiter:p,acceptEndpointFlag:V.acceptEndpointFlag,acceptEndpointEnv:V.acceptEndpointEnv,isTty:L,sessionOnly:Z,signal:R?.signal}),H)G.write("\x1B[2K\r");f.set(Y,W)}}}let{systemPrompt:O,retrievalText:A}=Yz({userMessage:z}),Pz=A?`<retrieved-context source="cli-reference">
${A}
</retrieved-context>

`:"",yz=x?`<user-context untrusted="true">
${M(x.slice(0,1000))}
</user-context>

`:"";x=void 0;let vz=W?`<hoody-docs-result untrusted="true" source="https://docs.hoody.com" query=${JSON.stringify(Y)}>
${"error"in W?`<error code="${W.error}">${M(W.message)}</error>`:M(W.text)}
</hoody-docs-result>

`:"",h=process.env.HOODY_CHAT_MAX_HISTORY,r=h!==void 0&&/^\d+$/.test(h)?Number(h):void 0,bz=r!==void 0?r:10,s=_.slice(-bz*2-1),d=[{role:"system",content:O}];for(let X=0;X<s.length-1;X++){let D=s[X];d.push({role:D.role,content:D.content})}d.push({role:"user",content:`${Pz}${vz}${yz}${z}`});let t=Zz({out:G}),v="",e=!1,b=L?lz(G):null;try{await _z({url:V.provider.url,key:V.provider.key,model:V.model,messages:d,maxTokens:V.maxTokens,temperature:V.temperature,onDelta:(X)=>{if(b)b.stop();v+=X,t.write(X)},toolsEnabled:I,limiter:p,acceptEndpointFlag:V.acceptEndpointFlag,acceptEndpointEnv:V.acceptEndpointEnv,isTty:L,sessionOnly:Z,signal:R.signal})}catch(X){e=!0;let D=X instanceof Error?X.message:String(X);G.write(`
`+K.red(`Error: ${D}`)+`
`)}finally{if(b)b.stop()}t.end();let Mz=R?.signal.aborted===!0;if(!e&&!Mz&&v.length>0){let X=new Date().toISOString();if(_.push({role:"assistant",content:v,ts:X}),y()&&$)try{await l($,{role:"assistant",content:v,ts:X})}catch(D){m(D,"assistant-turn write")}}R=void 0,q="idle"}async function Qz(z,J){let[W,...Y]=z.slice(1).split(/\s+/),O=Y.join(" ").trim();switch(W){case"help":return qz();case"exit":case"quit":return"exit";case"clear":if(H)G.write("\x1B[2J\x1B[H");return"continue";case"new":return Rz();case"history":return jz();case"sessions":return Az();case"load":return Dz(O);case"save":return Iz();case"delete":return Ez(O);case"wipe":return xz(J);case"private":return wz();case"tool":return Tz(O);case"retry":return Uz();default:return G.write(K.red(`Unknown command: /${W}. Try /help.
`)),"continue"}}async function Uz(){if(q==="inflight")return G.write(K.yellow(`/retry refused: a turn is in flight. Ctrl-C to abort first.
`)),"continue";if(_.length===0)return G.write(K.dim(`Nothing to retry — no turns yet.
`)),"continue";let z=-1;for(let Y=_.length-1;Y>=0;Y--)if(_[Y].role==="user"){z=Y;break}if(z===-1)return G.write(K.dim(`Nothing to retry — no user turn in transcript.
`)),"continue";let J=_[z].content;if(_.length=z,y()&&$)try{await Nz($,z)}catch(Y){m(Y,"retry truncate")}if(_.length===0&&V.contextPreface&&!x)x=V.contextPreface;return G.write(K.dim(`Retrying last message…
`)),a(J,!0),"continue"}function qz(){let z=[["/help","Print this table"],["/exit, /quit","Exit the REPL"],["/clear","Clear the screen (keeps current session)"],["/new","Start a fresh session in-place"],["/history","Print current transcript"],["/sessions",`List persistent sessions (${Z?"disabled in private mode":"OK"})`],["/load <id>",`Switch REPL to that session's history${Z?" (disabled in private mode)":""}`],["/save",`Promote current session → persistent file${Z?" (refused in private mode)":""}`],["/delete [id]",`Delete session <id>; no arg = delete current + /new${Z?" (disabled in private mode)":""}`],["/wipe",`Delete ALL persistent sessions (confirms)${Z?" (disabled in private mode)":""}`],["/private",`Toggle private mode (currently: ${Z?"ON":"OFF"})`],["/tool on|off",`Toggle hoody_docs_search (currently: ${I?"ON":"OFF"})`],["/retry","Drop the last assistant reply and re-send the last user message"]];for(let[J,W]of z)G.write(`  ${K.cyan(J.padEnd(18))} ${W}
`);return"continue"}function Rz(){return _.length=0,$=void 0,U=void 0,x=void 0,G.write(K.dim(`New session.
`)),"continue"}function jz(){if(_.length===0)return G.write(K.dim(`(empty transcript)
`)),"continue";for(let z of _){let J=z.role==="user"?K.green:z.role==="assistant"?K.blue:K.dim;G.write(J(`[${z.role}]`)+" "+E(z.content)+`
`)}return"continue"}async function Az(){if(Z)return G.write(K.yellow(`/sessions disabled in private mode.
`)),"continue";let z=await u();if(z.length===0)return G.write(K.dim(`(no persistent sessions)
`)),"continue";for(let J of z)G.write(`  ${K.cyan(J.id)}  ${K.dim(J.updatedAt)}  ${J.turnCount} turn${J.turnCount===1?"":"s"}  ${E(J.title)}
`);return"continue"}async function Dz(z){if(Z)return G.write(K.yellow(`/load disabled in private mode.
`)),"continue";if(!z)return G.write(K.red(`Usage: /load <id>
`)),"continue";let J=z.replace(/[\x00-\x1f\x7f]/g,"?"),W=await k(z);if(W.length===0)return G.write(K.red(`No session matches: ${J}
`)),"continue";if(W.length>1)return G.write(K.red(`Ambiguous prefix ${J} — matches ${W.length} sessions:
`)+W.slice(0,10).map((A)=>`  ${A.id}  ${E(A.title)}`).join(`
`)+`
`+(W.length>10?K.dim(`  ... and ${W.length-10} more
`):"")),"continue";let Y=W[0],O=await g(Y.filePath);if(!O)return G.write(K.red(`Failed to read session ${z}.
`)),"continue";$=O.filePath,U=O.meta,_.length=0;for(let A of O.turns)_.push({role:A.role,content:A.content,ts:A.ts});return G.write(K.dim(`Loaded ${O.meta.id} — ${E(O.meta.title)} (${O.turns.length} turns)
`)),"continue"}async function Iz(){if(Z)return G.write(K.yellow(`/save is disabled in private mode. Exit and rerun without --private to persist.
`)),"continue";if(C)return G.write(K.yellow(`/save is disabled — disk writes failed earlier this session.
`)),"continue";if($)return G.write(K.dim(`Session already persisted: ${U?.id}
`)),"continue";let z=_.find((J)=>J.role==="user");if(!z)return G.write(K.dim(`Nothing to save yet — no user turns.
`)),"continue";try{let J=await Hz({firstUserMessage:z.content,model:V.model,tier:V.provider.tier,turns:_});$=J.filePath,U=J.meta,G.write(K.dim(`Saved as ${J.meta.id} — ${J.meta.title}
`))}catch(J){let W=J instanceof Error?J.message:String(J);G.write(K.red(`Failed to save session: ${W}
`))}return"continue"}async function Ez(z){if(Z)return G.write(K.yellow(`/delete disabled in private mode.
`)),"continue";if(!z){if(!$)return G.write(K.dim(`Ephemeral session — nothing to delete. Starting fresh.
`)),_.length=0,"continue";return await c($),G.write(K.dim(`Deleted current session ${U?.id}. Starting fresh.
`)),$=void 0,U=void 0,_.length=0,"continue"}let J=z.replace(/[\x00-\x1f\x7f]/g,"?"),W=await k(z);if(W.length===0)return G.write(K.red(`No session matches: ${J}
`)),"continue";if(W.length>1)return G.write(K.red(`Ambiguous prefix ${J} — matches ${W.length} sessions; refusing to delete:
`)+W.slice(0,10).map((O)=>`  ${O.id}  ${E(O.title)}`).join(`
`)+`
`+(W.length>10?K.dim(`  ... and ${W.length-10} more
`):"")),"continue";let Y=W[0];if(await c(Y.filePath),G.write(K.dim(`Deleted ${Y.id}.
`)),Y.filePath===$)$=void 0,U=void 0,_.length=0;return"continue"}async function xz(z){if(Z)return G.write(K.yellow(`/wipe is disabled in private mode.
`)),"continue";if(G.write(K.red(`This will DELETE all persistent sessions.
`)),G.write(K.red('Type the word "yes" (lowercase) to confirm: ')),(await z()??"").trim()!=="yes")return G.write(K.dim(`Wipe cancelled.
`)),"continue";let Y=await Bz();return G.write(K.dim(`Deleted ${Y} session${Y===1?"":"s"}.
`)),$=void 0,U=void 0,"continue"}function wz(){return Z=!Z,f.clear(),G.write(K.dim(`Private mode ${Z?K.green("ON"):K.yellow("OFF")}. ${Z?"No disk writes or reads.":"Disk writes/reads allowed."}
`)),"continue"}function Tz(z){let J=z.toLowerCase();if(J==="on")I=!0,G.write(K.dim(`hoody_docs_search tool: ON.
`));else if(J==="off")I=!1,G.write(K.dim(`hoody_docs_search tool: OFF.
`));else G.write(K.dim(`Usage: /tool on|off (currently: ${I?"ON":"OFF"})
`));return"continue"}function y(){return V.persist&&!Z&&!C}async function Cz(z){if($)return;if(!y())return;let J=await Xz({firstUserMessage:z,model:V.model,tier:V.provider.tier});$=J.filePath,U=J.meta}async function Fz(z){if(z===void 0||z===!1)return null;if(z===!0){let W=await u();if(W.length===0)return null;return await g(W[0].filePath)}let J=await k(z);if(J.length===0)return null;if(J.length>1){let W=J.slice(0,5).map((Y)=>`  - ${Y.id}`).join(`
`);throw Error(`Ambiguous session id/prefix "${z}" — ${J.length} matches:
${W}${J.length>5?`
  ... and ${J.length-5} more`:""}
Provide a longer prefix.`)}return await g(J[0].filePath)}function Sz(){if(N)process.removeListener("SIGINT",F);V.sigintSignal?.removeEventListener("abort",F),B.close()}}var Wz=["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];function lz(V){let Q=0,G=!1,H=()=>{if(G)return;let L=Wz[Q++%Wz.length];V.write(`\r${K.cyan(L)} ${K.dim("thinking…")}`)};H();let N=setInterval(H,80);return{stop(){if(G)return;G=!0,clearInterval(N),V.write("\x1B[2K\r")}}}export{$G as runRepl};
