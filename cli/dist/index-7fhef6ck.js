import{ya as q}from"./index-adz920n5.js";import{mkdir as v,chmod as w}from"node:fs/promises";import{join as x}from"node:path";var g;async function C(){if(g)return g;let b=x(q(),".hoody","chats");await v(b,{recursive:!0,mode:448});try{await w(b,448)}catch{}return g=b,b}
export{C as B};
