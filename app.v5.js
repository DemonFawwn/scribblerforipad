// app.v5.js — Soft-Web vertical + Undo/Redo, pen-only, adjustable range
(()=>{
  const cvs = document.getElementById('canvas');
  const ctx = cvs.getContext('2d');
  const colorEl = document.getElementById('color');
  const wEl = document.getElementById('w');
  const aEl = document.getElementById('a');
  const radiusEl = document.getElementById('radius');
  const radiusVal = document.getElementById('radiusVal');
  const undoEl = document.getElementById('undo');
  const redoEl = document.getElementById('redo');
  const clearEl = document.getElementById('clear');
  const saveEl = document.getElementById('save');

  function fillWhite(){
    ctx.save();
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,cvs.width,cvs.height);
    ctx.restore();
  }
  fillWhite();

  // Paths & history
  let paths=[], redoStack=[], drawing=false, cur=null;

  // Web params (some constants, radius is dynamic from slider)
  const MAX_LINKS_PER_MOVE = 6;
  const LINK_ALPHA = 0.38;
  const LINK_MIN_W = 0.25;
  const LINK_MAX_W = 0.7;

  // Slider UI update
  function updateRadiusLabel(){ radiusVal.textContent = radiusEl.value + 'px'; }
  radiusEl.addEventListener('input', updateRadiusLabel);
  updateRadiusLabel();

  function begin(x,y,p=1){
    drawing=true;
    cur={ color: colorEl.value, baseW: parseFloat(wEl.value), alpha: parseFloat(aEl.value),
          pts:[{x,y,p}], bbox:{minx:x,miny:y,maxx:x,maxy:y} };
  }
  function extend(x,y,p=1){
    if(!drawing||!cur) return;
    const last=cur.pts[cur.pts.length-1];
    const pt={x,y,p};
    cur.pts.push(pt);
    const b=cur.bbox;
    if(x<b.minx)b.minx=x; if(y<b.miny)b.miny=y; if(x>b.maxx)b.maxx=x; if(y>b.maxy)b.maxy=y;

    const press = Math.max(0.05, Math.min(1, p||1));
    const w = Math.max(0.2, cur.baseW * Math.pow(press, 0.7));

    ctx.save();
    ctx.globalAlpha = cur.alpha;
    ctx.strokeStyle = cur.color;
    ctx.lineCap='round'; ctx.lineJoin='round'; ctx.lineWidth=w;
    ctx.beginPath(); ctx.moveTo(last.x,last.y); ctx.lineTo(x,y); ctx.stroke();
    ctx.restore();

    softWebConnect({x,y}, cur.color);
  }
  function end(){
    if(!drawing||!cur) return;
    if(cur.pts.length>1){ paths.push(cur); redoStack.length=0; }
    drawing=false; cur=null;
  }

  function d2(a,b){const dx=a.x-b.x,dy=a.y-b.y;return dx*dx+dy*dy;}

  function softWebConnect(lastPt,color){
    const RADIUS = parseFloat(radiusEl.value)||50;
    const R2=RADIUS*RADIUS;
    let links=0;
    for(const path of paths){
      const b=path.bbox;
      if(lastPt.x<b.minx-RADIUS||lastPt.x>b.maxx+RADIUS||lastPt.y<b.miny-RADIUS||lastPt.y>b.maxy+RADIUS) continue;
      const nearby=[];
      for(const q of path.pts){ if(d2(lastPt,q)<=R2) nearby.push(q); }
      if(!nearby.length) continue;
      const n = 1 + Math.min(2, Math.floor(nearby.length/12));
      for(let k=0;k<n;k++){
        if(links>=MAX_LINKS_PER_MOVE) break;
        const rnd = nearby[(Math.random()*nearby.length)|0];
        ctx.save();
        ctx.globalAlpha = LINK_ALPHA;
        ctx.strokeStyle = color;
        ctx.lineWidth = LINK_MIN_W + Math.random()*(LINK_MAX_W - LINK_MIN_W);
        ctx.beginPath(); ctx.moveTo(lastPt.x,lastPt.y); ctx.lineTo(rnd.x,rnd.y); ctx.stroke();
        ctx.restore();
        links++;
      }
      if(links>=MAX_LINKS_PER_MOVE) break;
    }
  }

  function redrawAll(){
    fillWhite();
    for(const s of paths){
      if(!s.pts||s.pts.length<2) continue;
      ctx.save();
      ctx.globalAlpha = s.alpha;
      ctx.strokeStyle = s.color;
      ctx.lineCap='round'; ctx.lineJoin='round';
      for(let i=1;i<s.pts.length;i++){
        const a=s.pts[i-1], b=s.pts[i];
        const press = Math.max(0.05, Math.min(1, b.p||1));
        const w = Math.max(0.2, s.baseW * Math.pow(press, 0.7));
        ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Undo/Redo
  function undo(){ if(paths.length){ redoStack.push(paths.pop()); redrawAll(); } }
  function redo(){ if(redoStack.length){ paths.push(redoStack.pop()); redrawAll(); } }
  undoEl.onclick = undo; redoEl.onclick = redo;

  // ----- Input handling (Pen only) -----
  function isPen(e){ return e.pointerType === 'pen'; }
  function xy(e){
    const r=cvs.getBoundingClientRect();
    return {x:(e.clientX-r.left)*(cvs.width/r.width), y:(e.clientY-r.top)*(cvs.height/r.height)};
  }
  function pressure(e){
    if(typeof e.pressure==='number' && e.pressure>0) return e.pressure;
    return 1;
  }

  cvs.addEventListener('pointerdown',e=>{
    if(!isPen(e)) return; // ignore finger/mouse for drawing
    e.preventDefault();
    cvs.setPointerCapture(e.pointerId);
    const p = xy(e);
    begin(p.x, p.y, pressure(e));
  }, {passive:false});

  cvs.addEventListener('pointermove',e=>{
    if(!isPen(e) || !drawing) return;
    e.preventDefault();
    const p = xy(e);
    extend(p.x, p.y, pressure(e));
  }, {passive:false});

  function finishPen(e){ end(); try{ cvs.releasePointerCapture(e.pointerId); }catch{} }
  cvs.addEventListener('pointerup',e=>{ if(!isPen(e)) return; e.preventDefault(); finishPen(e); }, {passive:false});
  cvs.addEventListener('pointercancel',e=>{ if(!isPen(e)) return; e.preventDefault(); finishPen(e); }, {passive:false});

  // Prevent page scroll while interacting on canvas only when target is canvas
  document.body.addEventListener('touchmove', e=>{ if(e.target===cvs) e.preventDefault(); }, {passive:false});

  // UI
  clearEl.onclick=()=>{paths=[];redoStack=[];cur=null;drawing=false;fillWhite();};
  saveEl.onclick=()=>{const a=document.createElement('a');a.download='scribbler-softweb-vertical.png';a.href=cvs.toDataURL('image/png');a.click();};

  // Shortcuts
  window.addEventListener('keydown',(e)=>{
    if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='z'){ if(e.shiftKey) redo(); else undo(); }
    else if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='y'){ redo(); }
  });

  // Persist prefs (incl. radius)
  const LS='scribbler-softweb-v5';
  function savePrefs(){localStorage.setItem(LS,JSON.stringify({c:colorEl.value,w:wEl.value,a:aEl.value,r:radiusEl.value}))}
  function loadPrefs(){try{const p=JSON.parse(localStorage.getItem(LS)||'{}');if(p.c)colorEl.value=p.c;if(p.w)wEl.value=p.w;if(p.a)aEl.value=p.a;if(p.r){radiusEl.value=p.r;updateRadiusLabel();}}catch{}}
  ;[colorEl,wEl,aEl,radiusEl].forEach(el=>el.addEventListener('change',savePrefs));
  loadPrefs();
})();