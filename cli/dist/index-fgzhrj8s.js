import{homedir as g}from"node:os";function k(){return process.env.HOME||g()}function p(b,f){if(process.platform==="win32"){if(process.env.PSModulePath)return`$env:${b}="${f}"   (add to $PROFILE)`;return`setx ${b} ${f}   (permanent across sessions)`}return`export ${b}=${f}   (add to ~/.bashrc or ~/.zshrc)`}
export{k as Oa,p as Pa};
