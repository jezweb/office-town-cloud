// List-with-priority app — support / request tracker. Tickets carry a subject,
// requester, priority (Low→Urgent) and status (Open / Waiting / Closed); the
// list groups open work to the top and shows how long each has been open.
// Alpine + Tailwind on a real-origin /app page; persists via app-scoped appdata.

export function renderSupportTicketsPage(token: string, origin: string): string {
	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Office Town — Tickets</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config={theme:{extend:{colors:{brand:{DEFAULT:'#c25e4f',deep:'#8c4035'},sand:'#f7f3e8'}}}};</script>
<style>:root{color-scheme:light dark}[x-cloak]{display:none!important}</style>
</head>
<body class="bg-sand text-[#2a2520] dark:bg-[#1c1813] dark:text-[#ede6d6] font-sans">
<div x-data="tk()" x-init="boot()" x-cloak class="max-w-2xl mx-auto p-5">

  <div class="flex items-baseline justify-between">
    <h1 class="text-xl font-semibold" style="font-family:Georgia,serif">Tickets</h1>
    <span class="text-xs opacity-50" x-text="savedNote"></span>
  </div>
  <p class="text-sm opacity-60 mb-3" x-text="openCount+' open · '+tickets.length+' total'"></p>

  <div class="flex gap-2 mb-4">
    <input x-model="draft" @keydown.enter="add()" placeholder="New request — subject…" class="flex-1 rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-3 py-2 text-sm">
    <button @click="add()" class="rounded-lg bg-brand hover:bg-brand-deep text-white px-3 py-1.5 text-sm font-semibold">Add</button>
  </div>

  <div class="space-y-1.5">
    <template x-for="t in sorted" :key="t.id">
      <div class="rounded-lg border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-2" :class="t.status==='Closed'?'opacity-50':''">
        <div class="flex items-center gap-2">
          <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase shrink-0" :class="prioColor(t.priority)" x-text="t.priority"></span>
          <input x-model="t.subject" @input="touch()" class="flex-1 min-w-0 bg-transparent font-medium text-sm focus:outline-none">
          <select x-model="t.status" @change="touch()" class="text-xs bg-transparent border-0 focus:outline-none opacity-70 shrink-0">
            <template x-for="s in statuses" :key="s"><option :value="s" x-text="s"></option></template>
          </select>
          <button @click="remove(t.id)" class="opacity-40 hover:opacity-100 shrink-0">×</button>
        </div>
        <div class="flex items-center gap-3 mt-1 pl-1">
          <input x-model="t.requester" @input="touch()" placeholder="Requester" class="bg-transparent text-xs opacity-70 focus:outline-none w-32">
          <select x-model="t.priority" @change="touch()" class="text-xs bg-transparent border-0 focus:outline-none opacity-50">
            <template x-for="p in priorities" :key="p"><option :value="p" x-text="p"></option></template>
          </select>
          <span class="text-xs opacity-40 ml-auto" x-text="age(t)"></span>
        </div>
      </div>
    </template>
    <p x-show="!tickets.length" class="text-sm opacity-50 py-8 text-center">No tickets. Log a request above.</p>
  </div>

</div>

<script src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
<script>
  var TOKEN=${JSON.stringify(token)}, ORIGIN=${JSON.stringify(origin)};
  var DATA=ORIGIN+'/api/appdata/office-town-support-tickets';
  var H={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'};
  var PRIO_RANK={'Urgent':0,'High':1,'Medium':2,'Low':3};

  function tk(){ return {
    tickets:[], draft:'', priorities:['Low','Medium','High','Urgent'], statuses:['Open','Waiting','Closed'], savedNote:'', saveTimer:null,
    async boot(){ try{ var r=await fetch(DATA,{headers:H}); var d=r.ok?await r.json():{}; this.tickets=Array.isArray(d.tickets)?d.tickets:[]; }catch(e){ this.tickets=[]; } },
    get openCount(){ return this.tickets.filter(function(t){return t.status!=='Closed';}).length; },
    get sorted(){ return this.tickets.slice().sort(function(a,b){
      var ca=a.status==='Closed'?1:0, cb=b.status==='Closed'?1:0; if(ca!==cb)return ca-cb;
      return (PRIO_RANK[a.priority]||9)-(PRIO_RANK[b.priority]||9); }); },
    prioColor(p){ return ({'Urgent':'bg-brand text-white','High':'bg-amber-500/20 text-amber-700 dark:text-amber-400','Medium':'bg-black/10 dark:bg-white/10','Low':'bg-black/5 dark:bg-white/5 opacity-60'})[p]||''; },
    age(t){ if(!t.opened)return ''; var d=Math.round((Date.now()-new Date(t.opened).getTime())/86400000); return d<=0?'today':d+'d open'; },
    add(){ if(!this.draft.trim())return; this.tickets.unshift({id:'t-'+Math.random().toString(36).slice(2,9), subject:this.draft.trim(), requester:'', priority:'Medium', status:'Open', opened:new Date().toISOString()}); this.draft=''; this.save(); },
    remove(id){ this.tickets=this.tickets.filter(function(t){return t.id!==id;}); this.save(); },
    touch(){ var self=this; clearTimeout(this.saveTimer); this.saveTimer=setTimeout(function(){ self.save(); },600); },
    async save(){ this.savedNote='saving…'; try{ await fetch(DATA,{method:'PUT',headers:H,body:JSON.stringify({tickets:this.tickets})}); this.savedNote='✓ saved'; }catch(e){ this.savedNote='save failed'; }
      var self=this; setTimeout(function(){ self.savedNote=''; },1500); },
  }; }
</script>
</body></html>`;
}
