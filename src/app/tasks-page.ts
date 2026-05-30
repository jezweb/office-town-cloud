// The task-board page (externalUrl panel). Served at /app/tasks?t=<token>.
//
// A real, persistent kanban: drag cards within/between columns, add, delete —
// every change saves to /api/tasks. Unlike the rawHtml panels, this fetches
// live and persists directly (no agent round-trip). The token + absolute API
// origin are injected server-side, so it works whether Goose embeds it via the
// mcp-ui proxy or it's opened standalone in a browser.

export function renderTasksPage(token: string, origin: string): string {
	const COLS = [
		{ status: 'todo', label: 'To do' },
		{ status: 'doing', label: 'Doing' },
		{ status: 'done', label: 'Done' },
	];
	const columns = COLS.map(
		(c) => `<div class="col" data-status="${c.status}">
      <div class="col-h">${c.label}</div>
      <div class="cards" data-status="${c.status}"></div>
    </div>`,
	).join('');

	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Office Town — Tasks</title>
<style>
  /* Warm earth palette — matches the Office Town dashboard. */
  :root { --bg:#f7f3e8;--fg:#2a2520;--muted:#8a7e6f;--line:#d8cdb4;--card:#fffdf5;--card-line:#d8cdb4;
    --accent:#c25e4f;--accent-deep:#8c4035;--accent-fg:#fff;--col:#efe9d8;--code:#efe9d8; }
  @media (prefers-color-scheme: dark) { :root { --bg:#1c1813;--fg:#ede6d6;--muted:#a89a86;--line:#3a3228;
    --card:#26211a;--card-line:#3a3228;--accent:#d4715f;--accent-deep:#c25e4f;--accent-fg:#fff;--col:#211c16;--code:#241f18; } }
  * { box-sizing:border-box; } body { margin:0;background:var(--bg);color:var(--fg);padding:16px;
    font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  h1 { font-size:16px;margin:0 0 2px;font-family:'Optima','Palatino',Georgia,serif; } .sub { color:var(--muted);font-size:12px;margin:0 0 14px; }
  .add { display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap; }
  .add input[type=text] { flex:1;min-width:160px;padding:8px 11px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);font:inherit; }
  .add select { padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);font:inherit; }
  .btn { border:0;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;background:var(--accent);color:var(--accent-fg);font-family:inherit; }
  .btn:hover { background:var(--accent-deep); }
  .board { display:grid;grid-template-columns:repeat(3,1fr);gap:12px; }
  @media (max-width:620px){ .board { grid-template-columns:1fr; } }
  .col { background:var(--col);border:1px solid var(--line);border-radius:12px;padding:10px;min-height:120px; }
  .col-h { font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:2px 4px 10px; }
  .cards { min-height:60px;display:flex;flex-direction:column;gap:8px; }
  .cards.over { outline:2px dashed var(--accent);outline-offset:3px;border-radius:8px; }
  .tcard { background:var(--card);border:1px solid var(--card-line);border-radius:10px;padding:10px 11px;cursor:grab;
    display:flex;flex-direction:column;gap:6px; } .tcard:active { cursor:grabbing; } .tcard.dragging { opacity:.4; }
  .ttitle { font-weight:600;font-size:13px; }
  .trow { display:flex;align-items:center;gap:6px; }
  .badge { background:var(--code);color:var(--muted);border-radius:6px;padding:1px 7px;font-size:11px;font-weight:500; }
  .b-high{background:#f5dcd6;color:#a83a2c;} .b-urgent{background:#f3e6cf;color:#8a5a1c;}
  @media (prefers-color-scheme: dark){ .b-high{background:#33201c;color:#e09a8c;} .b-urgent{background:#352a18;color:#e0b76a;} }
  .del { margin-left:auto;border:0;background:none;color:var(--muted);cursor:pointer;font-size:14px;padding:0 2px; }
  .del:hover { color:#ef4444; } .empty { color:var(--muted);font-size:12px;font-style:italic;padding:6px 4px; }
</style></head>
<body>
  <h1>Office Town — Tasks</h1>
  <p class="sub">Drag to reorder or move between columns. Changes save instantly.</p>
  <div class="add">
    <input id="t-title" type="text" placeholder="Add a task and press Enter">
    <select id="t-pri"><option value="low">low</option><option value="normal" selected>normal</option><option value="high">high</option></select>
    <button class="btn" onclick="addTask()">Add</button>
  </div>
  <div class="board">${columns}</div>

<script>
  var TOKEN = ${JSON.stringify(token)};
  var API = ${JSON.stringify(origin)} + '/api/tasks';
  var H = { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };
  var dragging = null;

  function esc(s){ var d=document.createElement('div'); d.textContent=s==null?'':String(s); return d.innerHTML; }

  function cardHtml(t){
    var badges = '';
    if (t.priority === 'high') badges += '<span class="badge b-high">high</span>';
    if (t.urgent) badges += '<span class="badge b-urgent">urgent</span>';
    return '<div class="tcard" draggable="true" data-id="'+esc(t.id)+'">'
      + '<div class="trow"><span class="ttitle">'+esc(t.title)+'</span>'
      + '<button class="del" title="Delete" onclick="del(\\''+esc(t.id)+'\\')">✕</button></div>'
      + (badges ? '<div class="trow">'+badges+'</div>' : '')
      + '</div>';
  }

  function render(tasks){
    ['todo','doing','done'].forEach(function(st){
      var zone = document.querySelector('.cards[data-status="'+st+'"]');
      var items = tasks.filter(function(t){ return t.status===st; }).sort(function(a,b){ return a.order-b.order; });
      zone.innerHTML = items.length ? items.map(cardHtml).join('') : '<div class="empty">nothing here</div>';
    });
    document.querySelectorAll('.tcard').forEach(wireCard);
  }

  function wireCard(card){
    card.addEventListener('dragstart', function(){ dragging=card; setTimeout(function(){ card.classList.add('dragging'); },0); });
    card.addEventListener('dragend', function(){ card.classList.remove('dragging'); dragging=null;
      document.querySelectorAll('.cards').forEach(function(z){ z.classList.remove('over'); }); saveLayout(); });
  }

  function afterEl(zone, y){
    var els = [].slice.call(zone.querySelectorAll('.tcard:not(.dragging)'));
    var closest = { offset:-Infinity, el:null };
    els.forEach(function(child){ var box=child.getBoundingClientRect(); var off=y-box.top-box.height/2;
      if (off<0 && off>closest.offset) closest={ offset:off, el:child }; });
    return closest.el;
  }

  document.querySelectorAll('.cards').forEach(function(zone){
    zone.addEventListener('dragover', function(e){ e.preventDefault(); if(!dragging) return; zone.classList.add('over');
      var empty=zone.querySelector('.empty'); if(empty) empty.remove();
      var after=afterEl(zone, e.clientY); if(!after) zone.appendChild(dragging); else zone.insertBefore(dragging, after); });
    zone.addEventListener('dragleave', function(){ zone.classList.remove('over'); });
  });

  async function load(){
    var r = await fetch(API, { headers: H });
    if (!r.ok) { document.querySelector('.sub').textContent = 'Could not load tasks (auth expired — reopen the panel).'; return; }
    var d = await r.json(); render(d.tasks || []);
  }
  async function saveLayout(){
    var layout = [];
    document.querySelectorAll('.col').forEach(function(col){ var st=col.dataset.status;
      [].slice.call(col.querySelectorAll('.tcard')).forEach(function(c,i){ layout.push({ id:c.dataset.id, status:st, order:i }); }); });
    await fetch(API + '/reorder', { method:'POST', headers:H, body:JSON.stringify({ layout:layout }) });
  }
  async function addTask(){
    var title=document.getElementById('t-title').value.trim(); if(!title) return;
    var pri=document.getElementById('t-pri').value;
    await fetch(API, { method:'POST', headers:H, body:JSON.stringify({ title:title, priority:pri }) });
    document.getElementById('t-title').value=''; load();
  }
  async function del(id){ await fetch(API + '/' + id, { method:'DELETE', headers:H }); load(); }
  document.getElementById('t-title').addEventListener('keydown', function(e){ if(e.key==='Enter') addTask(); });

  load();
</script>
</body></html>`;
}
