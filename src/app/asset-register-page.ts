// Table-with-badges app — asset / renewal register. Rows for anything with a
// renewal or expiry date (domains, hosting, SSL, licences, tools, equipment):
// each shows a countdown chip coloured by urgency, provider, cost and status.
// Sorts soonest-expiring first. Alpine + Tailwind on a real-origin /app page;
// persists via app-scoped appdata.

export function renderAssetRegisterPage(token: string, origin: string): string {
	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Office Town — Asset Register</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config={theme:{extend:{colors:{brand:{DEFAULT:'#c25e4f',deep:'#8c4035'},sand:'#f7f3e8'}}}};</script>
<style>:root{color-scheme:light dark}[x-cloak]{display:none!important}</style>
</head>
<body class="bg-sand text-[#2a2520] dark:bg-[#1c1813] dark:text-[#ede6d6] font-sans">
<div x-data="ar()" x-init="boot()" x-cloak class="max-w-3xl mx-auto p-5">

  <div class="flex items-baseline justify-between">
    <h1 class="text-xl font-semibold" style="font-family:Georgia,serif">Asset register</h1>
    <span class="text-xs opacity-50" x-text="savedNote"></span>
  </div>
  <p class="text-sm opacity-60 mb-3">Domains, hosting, licences, equipment — with renewal counted down. Soonest first.</p>

  <div class="flex justify-end mb-2"><button @click="add()" class="rounded-lg bg-brand hover:bg-brand-deep text-white px-3 py-1.5 text-sm font-semibold">+ Asset</button></div>

  <table class="w-full text-sm">
    <thead><tr class="text-left opacity-50 text-xs"><th class="py-1 w-24">Renews</th><th>Asset</th><th class="w-28">Provider</th><th class="w-20 text-right">Cost</th><th class="w-6"></th></tr></thead>
    <tbody>
      <template x-for="a in sorted" :key="a.id">
        <tr class="border-t border-black/5 dark:border-white/5">
          <td class="py-1">
            <div class="flex items-center gap-1.5">
              <span class="rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums" :class="chip(a.renew)" x-text="countLabel(a.renew)"></span>
            </div>
            <input x-model="a.renew" @input="touch()" type="date" class="mt-0.5 bg-transparent text-[11px] opacity-50 focus:outline-none w-full">
          </td>
          <td><input x-model="a.name" @input="touch()" class="w-full bg-transparent py-1 focus:outline-none font-medium" placeholder="example.com.au"></td>
          <td><input x-model="a.provider" @input="touch()" class="w-full bg-transparent py-1 focus:outline-none opacity-70" placeholder="—"></td>
          <td><input x-model.number="a.cost" @input="touch()" type="number" min="0" class="w-full bg-transparent py-1 text-right focus:outline-none opacity-70" placeholder="0"></td>
          <td class="text-right"><button @click="remove(a.id)" class="opacity-40 hover:opacity-100">×</button></td>
        </tr>
      </template>
    </tbody>
  </table>
  <p x-show="!assets.length" class="text-sm opacity-50 py-8 text-center">No assets tracked. Add a domain, licence or tool.</p>
  <p x-show="assets.length" class="text-xs opacity-50 mt-3" x-text="'Annual cost: $'+totalCost.toLocaleString('en-AU')"></p>

</div>

<script src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
<script>
  var TOKEN=${JSON.stringify(token)}, ORIGIN=${JSON.stringify(origin)};
  var DATA=ORIGIN+'/api/appdata/office-town-asset-register';
  var H={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'};
  function todayD(){ var n=new Date(); return new Date(n.getFullYear(),n.getMonth(),n.getDate()); }
  function daysTo(due){ if(!due)return null; return Math.round((new Date(due+'T00:00:00')-todayD())/86400000); }

  function ar(){ return {
    assets:[], savedNote:'', saveTimer:null,
    async boot(){ try{ var r=await fetch(DATA,{headers:H}); var d=r.ok?await r.json():{}; this.assets=Array.isArray(d.assets)?d.assets:[]; }catch(e){ this.assets=[]; } },
    get sorted(){ return this.assets.slice().sort(function(a,b){ if(!a.renew)return 1; if(!b.renew)return -1; return a.renew<b.renew?-1:1; }); },
    get totalCost(){ return this.assets.reduce(function(s,a){return s+(a.cost||0);},0); },
    countLabel(due){ var n=daysTo(due); if(n===null)return '—'; if(n<0)return Math.abs(n)+'d ago'; if(n===0)return 'today'; if(n<60)return n+'d'; return Math.round(n/30)+'mo'; },
    chip(due){ var n=daysTo(due); if(n===null)return 'bg-black/10 dark:bg-white/10 opacity-60'; if(n<0)return 'bg-brand text-white'; if(n<=30)return 'bg-amber-500/20 text-amber-700 dark:text-amber-400'; if(n<=90)return 'bg-brand/15 text-brand-deep'; return 'bg-black/10 dark:bg-white/10 opacity-70'; },
    add(){ this.assets.push({id:'a-'+Math.random().toString(36).slice(2,9), name:'', provider:'', renew:'', cost:0}); this.touch(); },
    remove(id){ this.assets=this.assets.filter(function(a){return a.id!==id;}); this.touch(); },
    touch(){ var self=this; clearTimeout(this.saveTimer); this.saveTimer=setTimeout(function(){ self.save(); },600); },
    async save(){ this.savedNote='saving…'; try{ await fetch(DATA,{method:'PUT',headers:H,body:JSON.stringify({assets:this.assets})}); this.savedNote='✓ saved'; }catch(e){ this.savedNote='save failed'; }
      var self=this; setTimeout(function(){ self.savedNote=''; },1500); },
  }; }
</script>
</body></html>`;
}
