import{m as J,p as U,q as V,r as W,s as X,u as Y}from"./index-4fjpm2g6.js";import"./index-f2ce9jac.js";import"./index-3vwsc5zq.js";import"./index-xjdpwnkp.js";import N from"chalk";function Q(q,y=!1){if(!y&&process.env.HOODY_CHAT_PRIVATE!=="1")return!1;let z=y?"--private":"HOODY_CHAT_PRIVATE=1";return process.stderr.write(`hoody chat sessions ${q}: refused — ${z} forbids reading or writing chat files.
`),process.exitCode=1,!0}var A=(q)=>process.stdout.isTTY?N.green(q):q,C=(q)=>process.stdout.isTTY?N.dim(q):q;var G=(q)=>process.stdout.isTTY?N.red(q):q;async function u(q={}){if(Q("list",q.private===!0))return;let y=await V();if(y.length===0){process.stdout.write(C(`No persistent chat sessions found.
`)),process.stdout.write(C("Tip: run `hoody chat --persist` and type a message to create one.\n"));return}if(process.stdout.isTTY)process.stdout.write(C(["ID       ","UPDATED (UTC)        ","TURNS","TITLE"].join("\t"))+`
`);for(let z of y)process.stdout.write(K(z)+`
`)}function K(q){let y=q.updatedAt.replace(/\.\d+Z$/,"Z"),z=J(q.title).replace(/\s+/g," ").slice(0,80);return`${q.id}	${y}	${String(q.turnCount).padStart(4)}  	${z}`}async function F(q,y={}){if(Q("show",y.private===!0))return;let z=await Z(q),B=await U(z.filePath);if(!B)process.stderr.write(G(`Could not read session ${z.id}.
`)),process.exit(1);let H=B.meta,_=J(H.title);process.stdout.write(C(`# ${H.id} — ${_}`)+`
`+C(`# created=${H.createdAt}  model=${H.model}  tier=${H.tier}`)+`
`+C(`# turns=${B.turns.length}`)+`

`);for(let L of B.turns){let $=L.role==="user"?A("[user]"):L.role==="assistant"?C("[assistant]"):C(`[${L.role}]`);process.stdout.write(`${$} ${J(L.content)}

`)}}async function E(q){if(Q("delete",q.private===!0))return;if(q.all){if(!q.yes)process.stderr.write(G("`hoody chat sessions delete --all` requires -y to confirm destructive operation.\n")),process.exit(1);let{deleted:z,failed:B}=await Y();if(process.stdout.write(C(`Deleted ${z} session${z===1?"":"s"}.
`)),B>0)process.stderr.write(G(`Failed to delete ${B} session file${B===1?"":"s"} — still on disk.
`)),process.exitCode=1;return}if(!q.id)process.stderr.write(G(`Usage: hoody chat sessions delete <id>  |  delete --all -y
`)),process.exit(1);let y=await Z(q.id);try{await X(y.filePath)}catch(z){let B=z instanceof Error?z.message:String(z);process.stderr.write(G(`Failed to delete: ${B}
`)),process.exitCode=1;return}process.stdout.write(C(`Deleted ${y.id}.
`))}function j(q){return q.replace(/[\x00-\x1f\x7f]/g,"?")}async function Z(q){let y=await W(q),z=j(q);if(y.length===0)process.stderr.write(G(`No session matches: ${z}
`)),process.exit(1);if(y.length>1){process.stderr.write(G(`Ambiguous prefix "${z}" matches ${y.length} sessions:
`));for(let B of y.slice(0,10))process.stderr.write(`  ${B.id}  ${B.updatedAt}  ${J(B.title)}
`);if(y.length>10)process.stderr.write(C(`  … and ${y.length-10} more.
`));process.stderr.write(C(`Use a longer prefix to disambiguate.
`)),process.exit(1)}return y[0]}export{F as showSessionCli,u as listSessionsCli,E as deleteSessionCli};
