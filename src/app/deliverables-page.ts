// Table-shape app — deliverables tracker. Rows of work products (design, asset,
// document, page) with a status that moves Draft → In review → Approved →
// Delivered, an owner, a due date, and a link. Filter by status. Alpine +
// Tailwind on a real-origin /app page; persists via app-scoped appdata.

export function renderDeliverablesPage(token: string, origin: string): string {
	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Office Town — Deliverables</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config={theme:{extend:{colors:{brand:{DEFAULT:'#c25e4f',deep:'#8c4035'},sand:'#f7f3e8'}}}};</script>
<style>:root{color-scheme:light dark}[x-cloak]{display:none!important}</style>
</head>
<body class="bg-sand text-[#2a2520] dark:bg-[#1c1813] dark:text-[#ede6d6] font-sans">
<div x-data="dl()" x-init="boot()" x-cloak class="max-w-3xl mx-auto p-5">

  <div class="flex items-baseline justify-between">
    <h1 class="text-xl font-semibold" style="font-family:Georgia,serif">Deliverables</h1>
    <span class="text-xs opacity-50" x-text="savedNote"></span>
  </div>
  <p class="text-sm opacity-60 mb-3">Every work product and where it's up to.</p>

  <div class="flex flex-wrap gap-1.5 mb-3">
    <template x-for="s in ['All'].concat(stages)" :key="s">
      <button @click="filter=s" :class="filter===s?'bg-brand text-white':'border border-black/15 dark:border-white/15 opacity-70'" class="rounded-full px-3 py-1 text-xs font-medium" x-text="s"></button>
    </template>
    <button @click="add()" class="ml-auto rounded-lg bg-brand hover:bg-brand-deep text-white px-3 py-1.5 text-sm font-semibold">+ Row</button>
  </div>

  <table class="w-full text-sm">
    <thead><tr class="text-left opacity-50 text-xs"><th class="py-1">Item</th><th class="w-28">Status</th><th class="w-24">Owner</th><th class="w-28">Due</th><th class="w-16">Link</th><th class="w-6"></th></tr></thead>
    <tbody>
      <template x-for="d in shown" :key="d.id">
        <tr class="border-t border-black/5 dark:border-white/5">
          <td class="py-1"><input x-model="d.item" @input="touch()" class="w-full bg-transparent py-1 focus:outline-none" placeholder="Homepage hero…"></td>
          <td>
            <select x-model="d.status" @change="touch()" :class="statusColor(d.status)" class="rounded-full px-2 py-0.5 text-[11px] font-semibold border-0 focus:outline-none">
              <template x-for="s in stages" :key="s"><option :value="s" x-text="s"></option></template>
            </select>
          </td>
          <td><input x-model="d.owner" @input="touch()" class="w-full bg-transparent py-1 focus:outline-none" placeholder="—"></td>
          <td><input x-model="d.due" @input="touch()" type="date" class="w-full bg-transparent py-1 focus:outline-none text-xs"></td>
          <td><input x-model="d.link" @input="touch()" class="w-full bg-transparent py-1 focus:outline-none text-xs text-brand" placeholder="url"></td>
          <td class="text-right"><button @click="remove(d.id)" class="opacity-40 hover:opacity-100">×</button></td>
        </tr>
      </template>
    </tbody>
  </table>
  <p x-show="!shown.length" class="text-sm opacity-50 py-8 text-center">No deliverables. Add a row.</p>

</div>

<script src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
<script>
  var TOKEN=${JSON.stringify(token)}, ORIGIN=${JSON.stringify(origin)};
  var DATA=ORIGIN+'/api/appdata/office-town-deliverables';
  var H={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'};

  function dl(){ return {
    items:[], stages:['Draft','In review','Approved','Delivered'], filter:'All', savedNote:'', saveTimer:null,
    async boot(){ try{ var r=await fetch(DATA,{headers:H}); var d=r.ok?await r.json():{}; this.items=Array.isArray(d.items)?d.items:[]; }catch(e){ this.items=[]; } },
    get shown(){ var f=this.filter; return f==='All'?this.items:this.items.filter(function(d){return d.status===f;}); },
    statusColor(s){ return ({'Draft':'bg-black/10 dark:bg-white/10','In review':'bg-amber-500/20 text-amber-700 dark:text-amber-400','Approved':'bg-brand/20 text-brand-deep','Delivered':'bg-green-600/15 text-green-700 dark:text-green-400'})[s]||''; },
    add(){ this.items.unshift({id:'d-'+Math.random().toString(36).slice(2,9), item:'', status:'Draft', owner:'', due:'', link:''}); this.touch(); },
    remove(id){ this.items=this.items.filter(function(d){return d.id!==id;}); this.touch(); },
    touch(){ var self=this; clearTimeout(this.saveTimer); this.saveTimer=setTimeout(function(){ self.save(); },600); },
    async save(){ this.savedNote='saving…'; try{ await fetch(DATA,{method:'PUT',headers:H,body:JSON.stringify({items:this.items})}); this.savedNote='✓ saved'; }catch(e){ this.savedNote='save failed'; }
      var self=this; setTimeout(function(){ self.savedNote=''; },1500); },
  }; }
</script>
</body></html>`;
}
