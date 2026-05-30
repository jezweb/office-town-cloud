// Quick Capture page (externalUrl panel). Served at /app/capture?t=<cortex token>.
//
// A frictionless box: jot a note / paste a link → POST /api/cortex/capture →
// lands in inbox/ for the filing-cabinet workflow to file. Shows recent
// captures. Direct-save, so it works as a standalone Goose app window.

export function renderCapturePage(token: string, origin: string): string {
	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Office Town — Capture</title>
<style>
  :root { --bg:#f7f3e8;--fg:#2a2520;--muted:#8a7e6f;--line:#d8cdb4;--card:#fffdf5;--card-line:#d8cdb4;
    --accent:#c25e4f;--accent-deep:#8c4035;--accent-fg:#fff;--code:#efe9d8;--green:#4a7a3d; }
  @media (prefers-color-scheme: dark){ :root { --bg:#1c1813;--fg:#ede6d6;--muted:#a89a86;--line:#3a3228;
    --card:#26211a;--card-line:#3a3228;--accent:#d4715f;--accent-deep:#c25e4f;--accent-fg:#fff;--code:#241f18;--green:#86c272; } }
  *{box-sizing:border-box;} body{margin:0;background:var(--bg);color:var(--fg);padding:16px;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}
  h1{font-size:17px;margin:0 0 2px;font-family:'Optima','Palatino',Georgia,serif;}
  .sub{color:var(--muted);font-size:12px;margin:0 0 14px;}
  textarea{width:100%;min-height:120px;font:inherit;padding:11px 13px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--fg);resize:vertical;}
  textarea:focus{outline:none;border-color:var(--accent);}
  .row{display:flex;align-items:center;gap:10px;margin-top:10px;}
  .btn{border:0;border-radius:8px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer;background:var(--accent);color:var(--accent-fg);font-family:inherit;}
  .btn:hover{background:var(--accent-deep);} .hint{color:var(--muted);font-size:12px;}
  .ok{color:var(--green);font-size:12px;opacity:0;transition:opacity .2s;} .ok.show{opacity:1;}
  h2{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:22px 0 8px;}
  .cap{background:var(--card);border:1px solid var(--card-line);border-radius:10px;padding:10px 12px;margin-bottom:8px;font-size:13px;}
  .empty{color:var(--muted);font-size:13px;font-style:italic;}
</style></head>
<body>
  <h1>Capture</h1>
  <p class="sub">Jot a note or paste a link — it lands in your cortex inbox and gets filed.</p>
  <textarea id="t" placeholder="Jot a note, paste a link, dump a thought…" autofocus></textarea>
  <div class="row">
    <button class="btn" onclick="capture()">Capture →</button>
    <span class="hint">⌘/Ctrl + Enter</span>
    <span id="ok" class="ok">✓ captured</span>
  </div>
  <h2>Recently captured</h2>
  <div id="recent"><div class="empty">Nothing captured yet.</div></div>

<script>
  var TOKEN=${JSON.stringify(token)}, API=${JSON.stringify(origin)}+'/api/cortex';
  var H={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'};
  function esc(s){var d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}

  async function loadRecent(){
    try{
      var r=await fetch(API+'/captures',{headers:H}); if(!r.ok)return;
      var d=await r.json(); var el=document.getElementById('recent');
      if(!d.captures||!d.captures.length){ el.innerHTML='<div class="empty">Nothing captured yet.</div>'; return; }
      el.innerHTML=d.captures.map(function(c){return '<div class="cap">'+esc(c.snippet||'(empty)')+'</div>';}).join('');
    }catch(e){}
  }
  async function capture(){
    var t=document.getElementById('t'); var text=t.value.trim(); if(!text)return;
    var r=await fetch(API+'/capture',{method:'POST',headers:H,body:JSON.stringify({text:text})});
    if(r.ok){ t.value=''; var ok=document.getElementById('ok'); ok.classList.add('show'); setTimeout(function(){ok.classList.remove('show');},1500); loadRecent(); t.focus(); }
  }
  document.getElementById('t').addEventListener('keydown',function(e){ if((e.metaKey||e.ctrlKey)&&e.key==='Enter') capture(); });
  loadRecent();
</script>
</body></html>`;
}
