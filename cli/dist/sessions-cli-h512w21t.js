import{r as G,u as N,v as Q,w as U,x as V,z as W}from"./index-ez61yxcc.js";import"./index-scfw1v7a.js";import"./index-syps4pt8.js";import"./index-ecrvt0as.js";import L from"chalk";var _=(q)=>process.stdout.isTTY?L.green(q):q,B=(q)=>process.stdout.isTTY?L.dim(q):q;var H=(q)=>process.stdout.isTTY?L.red(q):q;async function v(){let q=await Q();if(q.length===0){process.stdout.write(B(`No persistent chat sessions found.
`)),process.stdout.write(B("Tip: run `hoody chat --persist` and type a message to create one.\n"));return}if(process.stdout.isTTY)process.stdout.write(B(["ID       ","UPDATED (UTC)        ","TURNS","TITLE"].join("\t"))+`
`);for(let y of q)process.stdout.write($(y)+`
`)}function $(q){let y=q.updatedAt.replace(/\.\d+Z$/,"Z"),z=G(q.title).replace(/\s+/g," ").slice(0,80);return`${q.id}	${y}	${String(q.turnCount).padStart(4)}  	${z}`}async function w(q){let y=await X(q),z=await N(y.filePath);if(!z)process.stderr.write(H(`Could not read session ${y.id}.
`)),process.exit(1);let C=z.meta,Y=G(C.title);process.stdout.write(B(`# ${C.id} — ${Y}`)+`
`+B(`# created=${C.createdAt}  model=${C.model}  tier=${C.tier}`)+`
`+B(`# turns=${z.turns.length}`)+`

`);for(let J of z.turns){let Z=J.role==="user"?_("[user]"):J.role==="assistant"?B("[assistant]"):B(`[${J.role}]`);process.stdout.write(`${Z} ${G(J.content)}

`)}}async function T(q){if(q.all){if(!q.yes)process.stderr.write(H("`hoody chat sessions delete --all` requires -y to confirm destructive operation.\n")),process.exit(1);let z=await W();process.stdout.write(B(`Deleted ${z} session${z===1?"":"s"}.
`));return}if(!q.id)process.stderr.write(H(`Usage: hoody chat sessions delete <id>  |  delete --all -y
`)),process.exit(1);let y=await X(q.id);await V(y.filePath),process.stdout.write(B(`Deleted ${y.id}.
`))}function A(q){return q.replace(/[\x00-\x1f\x7f]/g,"?")}async function X(q){let y=await U(q),z=A(q);if(y.length===0)process.stderr.write(H(`No session matches: ${z}
`)),process.exit(1);if(y.length>1){process.stderr.write(H(`Ambiguous prefix "${z}" matches ${y.length} sessions:
`));for(let C of y.slice(0,10))process.stderr.write(`  ${C.id}  ${C.updatedAt}  ${G(C.title)}
`);if(y.length>10)process.stderr.write(B(`  … and ${y.length-10} more.
`));process.stderr.write(B(`Use a longer prefix to disambiguate.
`)),process.exit(1)}return y[0]}export{w as showSessionCli,v as listSessionsCli,T as deleteSessionCli};
