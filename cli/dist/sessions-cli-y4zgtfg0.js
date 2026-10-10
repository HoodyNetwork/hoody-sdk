import{P,W,K,X,be,we}from"./index-rez00rmx.js";import"./index-ape8ekqb.js";import c from"chalk";function d(e,s=!1){if(!s&&process.env.HOODY_CHAT_PRIVATE!=="1")return!1;let t=s?"--private":"HOODY_CHAT_PRIVATE=1";return process.stderr.write(`hoody chat sessions ${e}: refused — ${t} forbids reading or writing chat files.
`),process.exitCode=1,!0}var f=(e)=>process.stdout.isTTY?c.green(e):e,i=(e)=>process.stdout.isTTY?c.dim(e):e;var o=(e)=>process.stdout.isTTY?c.red(e):e;async function S(e={}){if(d("list",e.private===!0))return;let s=await K();if(s.length===0){process.stdout.write(i(`No persistent chat sessions found.
`)),process.stdout.write(i("Tip: run `hoody chat --persist` and type a message to create one.\n"));return}if(process.stdout.isTTY)process.stdout.write(i(["ID       ","UPDATED (UTC)        ","TURNS","TITLE"].join("\t"))+`
`);for(let t of s)process.stdout.write(m(t)+`
`)}function m(e){let s=e.updatedAt.replace(/\.\d+Z$/,"Z"),t=P(e.title).replace(/\s+/g," ").slice(0,80);return`${e.id}	${s}	${String(e.turnCount).padStart(4)}  	${t}`}async function y(e,s={}){if(d("get",s.private===!0))return;let t=await l(e),r=await W(t.filePath);if(!r)process.stderr.write(o(`Could not read session ${t.id}.
`)),process.exit(1);let n=r.meta,p=P(n.title);process.stdout.write(i(`# ${n.id} — ${p}`)+`
`+i(`# created=${n.createdAt}  model=${n.model}  tier=${n.tier}`)+`
`+i(`# turns=${r.turns.length}`)+`

`);for(let a of r.turns){let u=a.role==="user"?f("[user]"):a.role==="assistant"?i("[assistant]"):i(`[${a.role}]`);process.stdout.write(`${u} ${P(a.content)}

`)}}async function x(e){if(d("delete",e.private===!0))return;if(e.all){if(!e.yes)process.stderr.write(o("`hoody chat sessions delete --all` requires -y to confirm destructive operation.\n")),process.exit(1);let{deleted:t,failed:r}=await we();if(process.stdout.write(i(`Deleted ${t} session${t===1?"":"s"}.
`)),r>0)process.stderr.write(o(`Failed to delete ${r} session file${r===1?"":"s"} — still on disk.
`)),process.exitCode=1;return}if(!e.id)process.stderr.write(o(`Usage: hoody chat sessions delete <id>  |  delete --all -y
`)),process.exit(1);let s=await l(e.id);try{await be(s.filePath)}catch(t){let r=t instanceof Error?t.message:String(t);process.stderr.write(o(`Failed to delete: ${r}
`)),process.exitCode=1;return}process.stdout.write(i(`Deleted ${s.id}.
`))}function g(e){return e.replace(/[\x00-\x1f\x7f]/g,"?")}async function l(e){let s=await X(e),t=g(e);if(s.length===0)process.stderr.write(o(`No session matches: ${t}
`)),process.exit(1);if(s.length>1){process.stderr.write(o(`Ambiguous prefix "${t}" matches ${s.length} sessions:
`));for(let r of s.slice(0,10))process.stderr.write(`  ${r.id}  ${r.updatedAt}  ${P(r.title)}
`);if(s.length>10)process.stderr.write(i(`  … and ${s.length-10} more.
`));process.stderr.write(i(`Use a longer prefix to disambiguate.
`)),process.exit(1)}return s[0]}export{x as deleteSessionCli,S as listSessionsCli,y as showSessionCli};
