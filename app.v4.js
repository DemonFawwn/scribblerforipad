// app.v4.js — Soft-Web vertical + Undo/Redo + Pinch Zoom/Pan + Pen-only (Apple Pencil)
(()=>{
  const cvs = document.getElementById('canvas');
  const ctx = cvs.getContext('2d');
  const colorEl = document.getElementById('color');
  const wEl = document.getElementById('w');
  const aEl = document.getElementById('a');
  const undoEl = document.getElementById('undo');
  const redoEl = document.getElementById('redo');
  const clearEl = document.getElementById('clear');
  const saveEl = document.getElementById('save');
  const resetViewEl = document.getElementById('resetView');

  function fillWhite(){
    ctx.save();
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,cvs.width,cvs.height);
    ctx.restore();
  }
  fillWhite();

  // View transform via CSS transform (scale + translate) for display only
  let view = { scale: 1, tx: 0, ty: 0 };
  function applyView(){
    cvs.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`;
  }
  applyView();
  resetViewEl.onclick = ()=>{ view = {scale:1, tx:0, ty:0}; applyView(); };

  // Paths & history
  let paths=[], redoStack=[], drawing=false, cur=null;

  // Soft web params
  const RADIUS = 50, MAX_LINKS_PER_MOVE = 6, LINK_ALPHA = 0.38, LINK_MIN_W = 0.25, LINK_MAX_W = 0.7;

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

  function undo(){ if(paths.length){ redoStack.push(paths.pop()); redrawAll(); } }
  function redo(){ if(redoStack.length){ paths.push(redoStack.pop()); redrawAll(); } }
  undoEl.onclick = undo; redoEl.onclick = redo;

  // ----- Input handling -----
  // Only allow drawing with Apple Pencil / pen
  function isPen(e){ return e.pointerType === 'pen'; }

  // Convert client coords to canvas coords, accounting for CSS zoom/pan (via current rect)
  function xy(e){
    const r=cvs.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (cvs.width / r.width),
             y: (e.clientY - r.top)  * (cvs.height / r.height) };
  }
  function pressure(e){
    if(typeof e.pressure==='number' && e.pressure>0) return e.pressure;
    return 1; // default when unknown
  }

  // Track active pointers for pinch-zoom/pan (touch only)
  const activeTouches = new Map();

  function distance(a,b){ const dx=a.clientX-b.clientX, dy=a.clientY-b.clientY; return Math.hypot(dx,dy); }
  function midpoint(a,b){ return { x:(a.clientX+b.clientX)/2, y:(a.clientY+b.clientY)/2 }; }

  function applyPinch(e){
    if(activeTouches.size<2) return;
    const [t1, t2] = Array.from(activeTouches.values());
    // Initial data
    if(!applyPinch.start){
      applyPinch.start = {
        d: distance(t1, t2),
        mid: midpoint(t1, t2),
        view0: { ...view }
      };
      return;
    }
    const s = applyPinch.start;
    const dNow = distance(t1, t2);
    const midNow = midpoint(t1, t2);
    if(!s.d) return;

    // Scale around the initial midpoint
    const scaleFactor = dNow / s.d;
    let newScale = Math.max(0.5, Math.min(6, s.view0.scale * scaleFactor));

    // To keep the midpoint stable, adjust translation:
    // r is current canvas rect BEFORE applying new transform
    const r = cvs.getBoundingClientRect();
    // Compute how much the midpoint moved; translate by that delta plus scaling compensation.
    const dx = midNow.x - s.mid.x;
    const dy = midNow.y - s.mid.y;

    // Rough compensation to keep content under fingers
    const k = newScale / s.view0.scale;
    view.scale = newScale;
    view.tx = s.view0.tx + dx + (1 - k) * (s.mid.x - r.left);
    view.ty = s.view0.ty + dy + (1 - k) * (s.mid.y - r.top);
    applyView();
  }
  function endPinch(){ applyPinch.start = null; }

  cvs.addEventListener('pointerdown', e=>{
    // Drawing only with pen
    if(isPen(e)){
      e.preventDefault();
      cvs.setPointerCapture(e.pointerId);
      const p = xy(e);
      begin(p.x, p.y, pressure(e));
      return;
    }
    // Track touch pointers for pinch/drag (do not draw)
    if(e.pointerType==='touch'){
      activeTouches.set(e.pointerId, e);
      if(activeTouches.size>=2){ e.preventDefault(); applyPinch.start=null; }
    }
  }, {passive:false});

  cvs.addEventListener('pointermove', e=>{
    if(isPen(e) && drawing){
      e.preventDefault();
      const p = xy(e);
      extend(p.x, p.y, pressure(e));
      return;
    }
    if(e.pointerType==='touch' && activeTouches.has(e.pointerId)){
      activeTouches.set(e.pointerId, e);
      if(activeTouches.size>=2){ e.preventDefault(); applyPinch(e); }
      else {
        // one-finger touch -> pan
        const prev = applyPinch.prev || { x:e.clientX, y:e.clientY, view0:{...view} };
        if(!applyPinch.prev){ applyPinch.prev = prev; }
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        view.tx = prev.view0.tx + dx;
        view.ty = prev.view0.ty + dy;
        applyView();
      }
    }
  }, {passive:false});

  function finishPen(e){ end(); try{ cvs.releasePointerCapture(e.pointerId); }catch{} }
  cvs.addEventListener('pointerup', e=>{
    if(isPen(e)){ e.preventDefault(); finishPen(e); return; }
    if(e.pointerType==='touch'){
      activeTouches.delete(e.pointerId);
      if(activeTouches.size<2) endPinch();
      applyPinch.prev = null;
    }
  }, {passive:false});

  cvs.addEventListener('pointercancel', e=>{
    if(isPen(e)){ e.preventDefault(); finishPen(e); return; }
    if(e.pointerType==='touch'){
      activeTouches.delete(e.pointerId);
      if(activeTouches.size<2) endPinch();
      applyPinch.prev = null;
    }
  }, {passive:false});

  // Disable page scroll while interacting on canvas
  document.body.addEventListener('touchmove', e=>{ if(e.target===cvs) e.preventDefault(); }, {passive:false});

  // UI
  clearEl.onclick=()=>{paths=[];redoStack=[];cur=null;drawing=false;fillWhite();};
  saveEl.onclick=()=>{const a=document.createElement('a');a.download='scribbler-softweb-vertical.png';a.href=cvs.toDataURL('image/png');a.click();};

  // Shortcuts
  window.addEventListener('keydown',(e)=>{
    if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='z'){ if(e.shiftKey) redo(); else undo(); }
    else if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='y'){ redo(); }
    else if((e.key==='0' && (e.metaKey||e.ctrlKey))){ view={scale:1,tx:0,ty:0}; applyView(); }
  });

  // Persist prefs
  const LS='scribbler-softweb-v4';
  function savePrefs(){localStorage.setItem(LS,JSON.stringify({c:colorEl.value,w:wEl.value,a:aEl.value}))}
  function loadPrefs(){try{const p=JSON.parse(localStorage.getItem(LS)||'{}');if(p.c)colorEl.value=p.c;if(p.w)wEl.value=p.w;if(p.a)aEl.value=p.a;}catch{}}
  ;[colorEl,wEl,aEl].forEach(el=>el.addEventListener('change',savePrefs));
  loadPrefs();
})();