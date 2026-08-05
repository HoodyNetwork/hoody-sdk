(function(){
var pv=document.getElementById('pv');if(!pv)return;
// An extracted archive is opened over file://, where fetch() is blocked by the
// browser. Intercepting there would swallow every click and leave a dead panel,
// which is strictly worse than the native link. Bail out and stay progressive.
if(location.protocol==='file:')return;
var ttl=pv.querySelector('h3'),body=pv.querySelector('pre'),shut=pv.querySelector('button');
var seq=0,last=null;
function close(){pv.className='';body.textContent='';ttl.textContent='';
  if(last&&last.focus)last.focus();last=null;}
shut.addEventListener('click',close);
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&pv.className==='on')close();});
document.addEventListener('click',function(e){
  var a=e.target.closest?e.target.closest('a'):null;
  if(!a||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button)return;
  if(pv.contains(a))return;
  var h=a.getAttribute('href')||'';
  if(!/\.md$/.test(h))return;
  e.preventDefault();
  last=a;
  var mine=++seq;
  ttl.textContent=h;body.textContent='Loading…';pv.className='on';
  shut.focus();
  fetch(h,{credentials:'omit'}).then(function(r){
    if(!r.ok)throw new Error('HTTP '+r.status);return r.text();
  }).then(function(t){
    if(mine!==seq)return;          // a newer click owns the panel now
    body.textContent=t;
  }).catch(function(){
    if(mine!==seq)return;
    // Never strand the user in a dead panel: fall back to what the anchor
    // would have done on its own.
    close();
    location.href=h;
  });
});
})();