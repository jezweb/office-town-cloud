// Trade sampler — Today's run sheet. A list-view app for a tradie's day: each
// job has a customer, address (tap to map), phone (tap to call), time window and
// a status that cycles To do → On site → Done. Single screen, built for the van.
// Alpine + Tailwind on a real-origin /app page; persists via app-scoped appdata.

export function renderRunSheetPage(token: string, origin: string): string {
	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Office Town — Run Sheet</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config={theme:{extend:{colors:{brand:{DEFAULT:'#c25e4f',deep:'#8c4035'},sand:'#f7f3e8'}}}};</script>
<style>:root{color-scheme:light dark}[x-cloak]{display:none!important}</style>
</head>
<body class="bg-sand text-[#2a2520] dark:bg-[#1c1813] dark:text-[#ede6d6] font-sans">
<div x-data="rs()" x-init="boot()" x-cloak class="max-w-lg mx-auto p-5">

  <div class="flex items-baseline justify-between">
    <h1 class="text-xl font-semibold" style="font-family:Georgia,serif">Run sheet</h1>
    <span class="text-xs opacity-50" x-text="savedNote"></span>
  </div>
  <p class="text-sm opacity-60 mb-3" x-text="headline"></p>

  <div class="flex gap-2 mb-3">
    <button @click="onlyToday=!onlyToday" :class="onlyToday?'bg-brand text-white':'border border-black/15 dark:border-white/15'" class="rounded-lg px-3 py-1.5 text-sm font-medium" x-text="onlyToday?'Today':'All days'"></button>
    <button @click="add()" class="ml-auto rounded-lg bg-brand hover:bg-brand-deep text-white px-3 py-1.5 text-sm font-semibold">+ Job</button>
  </div>

  <div class="space-y-2">
    <template x-for="(j,idx) in visible" :key="j.id">
      <div class="rounded-xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 p-3">
        <div class="flex items-start gap-2">
          <button @click="cycle(j)" :class="statusColor(j.status)" class="mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide" x-text="j.status"></button>
          <div class="flex-1 min-w-0">
            <input x-model="j.customer" @input="touch()" placeholder="Customer" class="w-full bg-transparent font-medium focus:outline-none">
            <input x-model="j.address" @input="touch()" placeholder="Address" class="w-full bg-transparent text-sm opacity-70 focus:outline-none">
            <div class="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm">
              <input x-model="j.time" @input="touch()" placeholder="Time (e.g. 9–10am)" class="bg-transparent w-28 focus:outline-none opacity-70">
              <input x-model="j.phone" @input="touch()" placeholder="Phone" class="bg-transparent w-32 focus:outline-none opacity-70">
            </div>
            <input x-model="j.note" @input="touch()" placeholder="Notes…" class="w-full bg-transparent text-sm mt-1 focus:outline-none opacity-70">
            <div class="flex gap-3 mt-2 text-xs">
              <a x-show="j.address" :href="mapUrl(j.address)" target="_blank" class="text-brand">Map ↗</a>
              <a x-show="j.phone" :href="'tel:'+telLink(j.phone)" class="text-brand">Call ↗</a>
              <button @click="remove(j.id)" class="ml-auto opacity-40 hover:opacity-100">Remove</button>
            </div>
          </div>
        </div>
      </div>
    </template>
    <p x-show="!visible.length" class="text-sm opacity-50 py-8 text-center">No jobs yet. Add one for today.</p>
  </div>

</div>

<script src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
<script>
  var TOKEN=${JSON.stringify(token)}, ORIGIN=${JSON.stringify(origin)};
  var DATA=ORIGIN+'/api/appdata/office-town-run-sheet';
  var H={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'};
  function today(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  var ORDER=['To do','On site','Done'];

  function rs(){ return {
    jobs:[], onlyToday:true, savedNote:'', saveTimer:null,
    async boot(){ try{ var r=await fetch(DATA,{headers:H}); var d=r.ok?await r.json():{}; this.jobs=Array.isArray(d.jobs)?d.jobs:[]; }catch(e){ this.jobs=[]; } },
    get visible(){ var t=today(); return this.onlyToday?this.jobs.filter(function(j){return j.date===t;}):this.jobs; },
    get headline(){ var v=this.visible; var done=v.filter(function(j){return j.status==='Done';}).length; return v.length?(v.length+' job'+(v.length>1?'s':'')+' · '+done+' done'):'A clear day'; },
    statusColor(s){ return s==='Done'?'bg-green-600/15 text-green-700 dark:text-green-400':s==='On site'?'bg-brand/15 text-brand-deep':'bg-black/10 dark:bg-white/10 opacity-70'; },
    cycle(j){ var i=ORDER.indexOf(j.status); j.status=ORDER[(i+1)%ORDER.length]; this.touch(); },
    mapUrl(a){ return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(a); },
    telLink(p){ var d=(p||'').replace(/[^0-9+]/g,''); return d.replace(/^0/,'+61'); },
    add(){ this.jobs.push({id:'j-'+Math.random().toString(36).slice(2,9), customer:'', address:'', phone:'', time:'', note:'', status:'To do', date:today()}); this.save(); },
    remove(id){ this.jobs=this.jobs.filter(function(j){return j.id!==id;}); this.save(); },
    touch(){ var self=this; clearTimeout(this.saveTimer); this.saveTimer=setTimeout(function(){ self.save(); },600); },
    async save(){ this.savedNote='saving…'; try{ await fetch(DATA,{method:'PUT',headers:H,body:JSON.stringify({jobs:this.jobs})}); this.savedNote='✓ saved'; }catch(e){ this.savedNote='save failed'; }
      var self=this; setTimeout(function(){ self.savedNote=''; },1500); },
  }; }
</script>
</body></html>`;
}
