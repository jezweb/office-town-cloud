// Professional-services sampler — Compliance deadlines. A countdown-view app for
// recurring obligations (BAS, income tax, PAYG, super, ASIC review): each shows
// days-remaining as an urgency chip, grouped Overdue / This month / Upcoming.
// "Lodged" rolls the due date forward by its frequency. Alpine + Tailwind on a
// real-origin /app page; persists via app-scoped appdata.

export function renderCompliancePage(token: string, origin: string): string {
	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Office Town — Compliance</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config={theme:{extend:{colors:{brand:{DEFAULT:'#c25e4f',deep:'#8c4035'},sand:'#f7f3e8'}}}};</script>
<style>:root{color-scheme:light dark}[x-cloak]{display:none!important}</style>
</head>
<body class="bg-sand text-[#2a2520] dark:bg-[#1c1813] dark:text-[#ede6d6] font-sans">
<div x-data="cmp()" x-init="boot()" x-cloak class="max-w-xl mx-auto p-5">

  <div class="flex items-baseline justify-between">
    <h1 class="text-xl font-semibold" style="font-family:Georgia,serif">Compliance deadlines</h1>
    <span class="text-xs opacity-50" x-text="savedNote"></span>
  </div>
  <p class="text-sm opacity-60 mb-4">Every recurring lodgement, counted down. Mark it lodged and it rolls to the next period.</p>

  <div class="flex flex-wrap gap-2 mb-5 items-end">
    <input x-model="d.name" placeholder="e.g. Q3 BAS" class="flex-1 min-w-[140px] rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-3 py-2 text-sm">
    <input x-model="d.due" type="date" class="rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-3 py-2 text-sm">
    <select x-model="d.frequency" class="rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-3 py-2 text-sm">
      <option value="quarterly">Quarterly</option><option value="monthly">Monthly</option><option value="annual">Annual</option><option value="once">One-off</option>
    </select>
    <button @click="add()" class="rounded-lg bg-brand hover:bg-brand-deep text-white px-3 py-2 text-sm font-semibold">Add</button>
  </div>

  <template x-for="grp in groups" :key="grp.key">
    <div x-show="grp.items.length" class="mb-4">
      <span class="text-xs uppercase tracking-wide font-semibold" :class="grp.key==='overdue'?'text-brand-deep':''" x-text="grp.label"></span>
      <div class="mt-1 space-y-1.5">
        <template x-for="o in grp.items" :key="o.id">
          <div class="rounded-lg border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-2 flex items-center gap-3">
            <span class="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums" :class="chip(o)" x-text="countLabel(o)"></span>
            <div class="flex-1 min-w-0">
              <div class="font-medium" x-text="o.name||'Untitled'"></div>
              <div class="text-xs opacity-50" x-text="o.due+' · '+freqLabel(o.frequency)"></div>
            </div>
            <button @click="lodge(o)" class="text-xs rounded-md border border-brand text-brand px-2 py-1 shrink-0">Lodged</button>
            <button @click="remove(o.id)" class="text-xs opacity-40 hover:opacity-100 shrink-0">×</button>
          </div>
        </template>
      </div>
    </div>
  </template>
  <p x-show="!obligations.length" class="text-sm opacity-50 py-8 text-center">No obligations yet. Add a BAS, tax or super deadline above.</p>

</div>

<script src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
<script>
  var TOKEN=${JSON.stringify(token)}, ORIGIN=${JSON.stringify(origin)};
  var DATA=ORIGIN+'/api/appdata/office-town-compliance';
  var H={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'};
  function todayD(){ return new Date(new Date().getFullYear(),new Date().getMonth(),new Date().getDate()); }
  function iso(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function daysTo(due){ return Math.round((new Date(due+'T00:00:00')-todayD())/86400000); }

  function cmp(){ return {
    obligations:[], d:{name:'',due:'',frequency:'quarterly'}, savedNote:'',
    async boot(){ try{ var r=await fetch(DATA,{headers:H}); var x=r.ok?await r.json():{}; this.obligations=Array.isArray(x.obligations)?x.obligations:[]; }catch(e){ this.obligations=[]; } },
    daysTo:daysTo,
    countLabel(o){ var n=daysTo(o.due); if(n<0) return Math.abs(n)+'d ago'; if(n===0) return 'today'; return n+'d'; },
    chip(o){ var n=daysTo(o.due); if(n<0) return 'bg-brand text-white'; if(n<=7) return 'bg-brand/20 text-brand-deep'; if(n<=30) return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'; return 'bg-black/10 dark:bg-white/10 opacity-70'; },
    freqLabel(f){ return ({quarterly:'Quarterly',monthly:'Monthly',annual:'Annual',once:'One-off'})[f]||f; },
    get sorted(){ return this.obligations.slice().sort(function(a,b){return a.due<b.due?-1:1;}); },
    get groups(){ var s=this.sorted;
      return [
        {key:'overdue',label:'Overdue',items:s.filter(function(o){return daysTo(o.due)<0;})},
        {key:'month',label:'Next 30 days',items:s.filter(function(o){var n=daysTo(o.due);return n>=0&&n<=30;})},
        {key:'later',label:'Upcoming',items:s.filter(function(o){return daysTo(o.due)>30;})},
      ]; },
    add(){ if(!this.d.due)return; this.obligations.push({id:'o-'+Math.random().toString(36).slice(2,9), name:this.d.name, due:this.d.due, frequency:this.d.frequency}); this.d={name:'',due:'',frequency:this.d.frequency}; this.save(); },
    lodge(o){ if(o.frequency==='once'){ this.remove(o.id); return; }
      var add={quarterly:3,monthly:1,annual:12}[o.frequency]||3; var dt=new Date(o.due+'T00:00:00'); dt.setMonth(dt.getMonth()+add); o.due=iso(dt); this.save(); },
    remove(id){ this.obligations=this.obligations.filter(function(o){return o.id!==id;}); this.save(); },
    async save(){ this.savedNote='saving…'; try{ await fetch(DATA,{method:'PUT',headers:H,body:JSON.stringify({obligations:this.obligations})}); this.savedNote='✓ saved'; }catch(e){ this.savedNote='save failed'; }
      var self=this; setTimeout(function(){ self.savedNote=''; },1500); },
  }; }
</script>
</body></html>`;
}
