// Capabilities showcase — a single multi-tab app that pushes the ceiling:
// Tailwind (Play CDN) theming with a live colour picker, every input control, a
// Chart.js chart, a data table, and image attachment with preview. Proves what
// an agent-built "SaaS-in-one-app" can do. Real-origin /app page (no CSP), so
// CDNs load. Persists via window.ot.load/save.

export function renderCapabilitiesPage(token: string, origin: string): string {
	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Office Town — Capabilities</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script>
  tailwind.config = { theme: { extend: { colors: { brand: { DEFAULT: '#c25e4f', deep: '#8c4035' } } } } };
</script>
<style>:root{color-scheme:light dark}</style>
</head>
<body class="bg-[#f7f3e8] text-[#2a2520] dark:bg-[#1c1813] dark:text-[#ede6d6] font-sans">
<div class="max-w-3xl mx-auto p-5">
  <h1 class="text-xl font-semibold" style="font-family:Georgia,serif">Capabilities</h1>
  <p class="text-sm opacity-60 mb-4">One app, full kit — Tailwind theming, every control, charts, tables, attachments. Built to show the ceiling.</p>

  <nav class="flex gap-1 border-b border-black/10 dark:border-white/10 mb-5">
    <button data-tab="controls" class="tab px-4 py-2 text-sm font-medium border-b-2 border-brand">Controls</button>
    <button data-tab="data" class="tab px-4 py-2 text-sm font-medium border-b-2 border-transparent opacity-60">Data &amp; chart</button>
    <button data-tab="media" class="tab px-4 py-2 text-sm font-medium border-b-2 border-transparent opacity-60">Attachments</button>
    <button data-tab="theme" class="tab px-4 py-2 text-sm font-medium border-b-2 border-transparent opacity-60">Theme</button>
  </nav>

  <section data-panel="controls">
    <div class="grid sm:grid-cols-2 gap-4">
      <label class="block"><span class="text-xs uppercase tracking-wide opacity-60">Text</span>
        <input id="c-text" class="mt-1 w-full rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-3 py-2" placeholder="Type anything"></label>
      <label class="block"><span class="text-xs uppercase tracking-wide opacity-60">Select</span>
        <select id="c-sel" class="mt-1 w-full rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-3 py-2"><option>Low</option><option selected>Normal</option><option>High</option></select></label>
      <label class="block"><span class="text-xs uppercase tracking-wide opacity-60">Date</span>
        <input id="c-date" type="date" class="mt-1 w-full rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-3 py-2"></label>
      <label class="block"><span class="text-xs uppercase tracking-wide opacity-60">Range</span>
        <input id="c-range" type="range" class="mt-3 w-full accent-brand"></label>
      <label class="flex items-center gap-2 text-sm"><input id="c-chk" type="checkbox" class="accent-brand w-4 h-4"> Toggle / checkbox</label>
      <div class="text-sm opacity-60">…any HTML input works: time, color, file, multi-select, textarea, rich pickers.</div>
    </div>
    <button onclick="persist()" class="mt-5 rounded-lg bg-brand hover:bg-brand-deep text-white px-4 py-2 text-sm font-semibold">Save state</button>
    <span id="saved" class="ml-2 text-sm text-green-700 dark:text-green-400 opacity-0 transition">✓ saved</span>
  </section>

  <section data-panel="data" hidden>
    <canvas id="chart" height="120"></canvas>
    <table class="mt-5 w-full text-sm border-collapse">
      <thead><tr class="text-left opacity-60"><th class="py-2 border-b border-black/10 dark:border-white/10">Month</th><th class="border-b border-black/10 dark:border-white/10">Enquiries</th><th class="border-b border-black/10 dark:border-white/10">Won</th></tr></thead>
      <tbody id="rows"></tbody>
    </table>
  </section>

  <section data-panel="media" hidden>
    <p class="text-sm opacity-60 mb-3">Attach an image (client-side preview here; a scoped upload endpoint persists it to your cortex — coming next).</p>
    <input id="file" type="file" accept="image/*" class="text-sm" onchange="preview(event)">
    <div id="thumb" class="mt-4"></div>
  </section>

  <section data-panel="theme" hidden>
    <p class="text-sm opacity-60 mb-3">The agent (or you) picks the scheme. Pick a brand colour — the whole app re-themes live.</p>
    <input type="color" value="#c25e4f" class="w-16 h-10 rounded cursor-pointer" oninput="retheme(this.value)">
    <div class="mt-4 flex gap-2">
      <span class="rounded-lg bg-brand text-white px-3 py-1 text-sm">Brand</span>
      <span class="rounded-lg border border-brand text-brand px-3 py-1 text-sm">Outline</span>
    </div>
  </section>
</div>

<script>
  var TOKEN=${JSON.stringify(token)}, API=${JSON.stringify(origin)}+'/api/appdata/office-town-showcase';
  var H={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'};

  // tabs
  document.querySelectorAll('.tab').forEach(function(b){ b.addEventListener('click',function(){
    document.querySelectorAll('.tab').forEach(function(x){ x.classList.remove('border-brand'); x.classList.add('border-transparent','opacity-60'); });
    b.classList.add('border-brand'); b.classList.remove('border-transparent','opacity-60');
    document.querySelectorAll('[data-panel]').forEach(function(p){ p.hidden = p.dataset.panel !== b.dataset.tab; });
  }); });

  // live re-theme
  function retheme(hex){ tailwind.config.theme.extend.colors.brand.DEFAULT = hex; if (window.tailwind && tailwind.refresh) tailwind.refresh(); document.documentElement.style.setProperty('--brand', hex); }

  // chart + table
  var data={labels:['Jan','Feb','Mar','Apr','May'],enq:[12,19,14,23,28],won:[3,6,5,9,11]};
  new Chart(document.getElementById('chart'),{type:'bar',data:{labels:data.labels,datasets:[{label:'Enquiries',data:data.enq,backgroundColor:'#c25e4f'},{label:'Won',data:data.won,backgroundColor:'#4a7a3d'}]},options:{plugins:{legend:{labels:{color:getComputedStyle(document.body).color}}},scales:{x:{ticks:{color:getComputedStyle(document.body).color}},y:{ticks:{color:getComputedStyle(document.body).color}}}}});
  document.getElementById('rows').innerHTML = data.labels.map(function(m,i){ return '<tr><td class="py-1.5 border-b border-black/5 dark:border-white/5">'+m+'</td><td class="border-b border-black/5 dark:border-white/5">'+data.enq[i]+'</td><td class="border-b border-black/5 dark:border-white/5">'+data.won[i]+'</td></tr>'; }).join('');

  // image attach (client-side preview)
  function preview(e){ var f=e.target.files[0]; if(!f)return; var r=new FileReader(); r.onload=function(){ document.getElementById('thumb').innerHTML='<img src="'+r.result+'" class="max-h-48 rounded-lg border border-black/10 dark:border-white/10">'; }; r.readAsDataURL(f); }

  // persistence
  async function persist(){
    var state={text:document.getElementById('c-text').value,sel:document.getElementById('c-sel').value,date:document.getElementById('c-date').value,chk:document.getElementById('c-chk').checked};
    var r=await fetch(API,{method:'PUT',headers:H,body:JSON.stringify(state)});
    if(r.ok){ var s=document.getElementById('saved'); s.style.opacity=1; setTimeout(function(){s.style.opacity=0;},1400); }
  }
  (async function(){ try{ var d=await (await fetch(API,{headers:H})).json(); if(d.text!==undefined)document.getElementById('c-text').value=d.text; if(d.sel)document.getElementById('c-sel').value=d.sel; if(d.date)document.getElementById('c-date').value=d.date; if(d.chk)document.getElementById('c-chk').checked=d.chk; }catch(e){} })();
</script>
</body></html>`;
}
