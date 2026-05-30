// Timeline-shape app — decision log (lightweight ADR). Dated entries capturing
// what was decided and why, newest first, with a status (Proposed / Decided /
// Superseded). The "why" is the point — it's the record you reach for months
// later. Alpine + Tailwind on a real-origin /app page; persists via app-scoped
// appdata.

export function renderDecisionLogPage(token: string, origin: string): string {
	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Office Town — Decisions</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config={theme:{extend:{colors:{brand:{DEFAULT:'#c25e4f',deep:'#8c4035'},sand:'#f7f3e8'}}}};</script>
<style>:root{color-scheme:light dark}[x-cloak]{display:none!important}</style>
</head>
<body class="bg-sand text-[#2a2520] dark:bg-[#1c1813] dark:text-[#ede6d6] font-sans">
<div x-data="dlog()" x-init="boot()" x-cloak class="max-w-2xl mx-auto p-5">

  <div class="flex items-baseline justify-between">
    <h1 class="text-xl font-semibold" style="font-family:Georgia,serif">Decision log</h1>
    <span class="text-xs opacity-50" x-text="savedNote"></span>
  </div>
  <p class="text-sm opacity-60 mb-4">What you decided and why — the record you'll thank yourself for later.</p>

  <div class="rounded-lg border border-black/10 dark:border-white/10 bg-white/50 dark:bg-white/5 p-3 mb-6 space-y-2">
    <input x-model="f.title" placeholder="Decision — e.g. Move hosting to Cloudflare" class="w-full bg-transparent font-medium focus:outline-none border-b border-black/10 dark:border-white/10 pb-1">
    <textarea x-model="f.why" rows="2" placeholder="Why — the reasoning, options weighed, who was involved…" class="w-full bg-transparent text-sm focus:outline-none resize-none"></textarea>
    <div class="flex gap-2 items-center">
      <select x-model="f.status" class="text-xs rounded border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-2 py-1">
        <template x-for="s in statuses" :key="s"><option :value="s" x-text="s"></option></template>
      </select>
      <button @click="add()" class="ml-auto rounded-lg bg-brand hover:bg-brand-deep text-white px-3 py-1.5 text-sm font-semibold">Log decision</button>
    </div>
  </div>

  <div class="relative pl-5">
    <div x-show="entries.length" class="absolute left-1.5 top-1 bottom-1 w-px bg-black/10 dark:bg-white/10"></div>
    <div class="space-y-5">
      <template x-for="e in sorted" :key="e.id">
        <div class="relative">
          <span class="absolute -left-[15px] top-1 w-2.5 h-2.5 rounded-full" :class="dot(e.status)"></span>
          <div class="flex items-baseline gap-2">
            <span class="font-medium" x-text="e.title||'Untitled'"></span>
            <span class="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5" :class="badge(e.status)" x-text="e.status"></span>
          </div>
          <div class="text-xs opacity-50 mb-1" x-text="e.date"></div>
          <p class="text-sm opacity-80 whitespace-pre-line" x-text="e.why"></p>
          <button @click="remove(e.id)" class="text-xs opacity-30 hover:opacity-100 mt-1">remove</button>
        </div>
      </template>
    </div>
    <p x-show="!entries.length" class="text-sm opacity-50 py-4">No decisions logged yet.</p>
  </div>

</div>

<script src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
<script>
  var TOKEN=${JSON.stringify(token)}, ORIGIN=${JSON.stringify(origin)};
  var DATA=ORIGIN+'/api/appdata/office-town-decision-log';
  var H={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'};
  function today(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

  function dlog(){ return {
    entries:[], statuses:['Proposed','Decided','Superseded'], f:{title:'',why:'',status:'Decided'}, savedNote:'',
    async boot(){ try{ var r=await fetch(DATA,{headers:H}); var d=r.ok?await r.json():{}; this.entries=Array.isArray(d.entries)?d.entries:[]; }catch(e){ this.entries=[]; } },
    get sorted(){ return this.entries.slice().sort(function(a,b){ return (a.date+a.id)<(b.date+b.id)?1:-1; }); },
    dot(s){ return ({'Proposed':'bg-amber-500','Decided':'bg-brand','Superseded':'bg-black/30 dark:bg-white/30'})[s]||'bg-brand'; },
    badge(s){ return ({'Proposed':'bg-amber-500/20 text-amber-700 dark:text-amber-400','Decided':'bg-brand/15 text-brand-deep','Superseded':'bg-black/10 dark:bg-white/10 opacity-60'})[s]||''; },
    add(){ if(!this.f.title.trim())return; this.entries.push({id:'e-'+Math.random().toString(36).slice(2,9), date:today(), title:this.f.title.trim(), why:this.f.why.trim(), status:this.f.status}); this.f={title:'',why:'',status:'Decided'}; this.save(); },
    remove(id){ this.entries=this.entries.filter(function(e){return e.id!==id;}); this.save(); },
    async save(){ this.savedNote='saving…'; try{ await fetch(DATA,{method:'PUT',headers:H,body:JSON.stringify({entries:this.entries})}); this.savedNote='✓ saved'; }catch(e){ this.savedNote='save failed'; }
      var self=this; setTimeout(function(){ self.savedNote=''; },1500); },
  }; }
</script>
</body></html>`;
}
