import{R}from"./index.js";import{mkdir as e,chmod as t}from"node:fs/promises";import{join as i}from"node:path";var o;async function P(){if(o)return o;let r=i(R(),".hoody","chats");await e(r,{recursive:!0,mode:448});try{await t(r,448)}catch{}return o=r,r}
export{P};
