// Mini-CRM flagship — the four core CRM jobs in one window:
//   Pipeline (board by stage) · Contacts (directory + editable detail) ·
//   Follow-ups (the next-step/due-date list — the #1 SME wish) · Today (triage).
// One "contact" record carries directory fields + stage + value + next_step/
// due_date, so all four tabs are derived views over a single array. Alpine +
// Tailwind on a real-origin /app page; persists via the app-scoped appdata store.

const CRM_STAGES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'] as const;

export function renderMiniCrmPage(token: string, origin: string): string {
	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Office Town — Mini CRM</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config={theme:{extend:{colors:{brand:{DEFAULT:'#c25e4f',deep:'#8c4035'},sand:'#f7f3e8'}}}};</script>
<style>:root{color-scheme:light dark}[x-cloak]{display:none!important}</style>
</head>
<body class="bg-sand text-[#2a2520] dark:bg-[#1c1813] dark:text-[#ede6d6] font-sans">
<div x-data="crm()" x-init="boot()" x-cloak class="max-w-4xl mx-auto p-5">

  <div class="flex items-baseline justify-between">
    <h1 class="text-xl font-semibold" style="font-family:Georgia,serif">Mini CRM</h1>
    <span class="text-xs opacity-50" x-text="savedNote"></span>
  </div>
  <p class="text-sm opacity-60 mb-4">Pipeline, contacts, follow-ups and your day — one window, all on the cortex.</p>

  <nav class="flex gap-1 border-b border-black/10 dark:border-white/10 mb-5">
    <template x-for="t in tabs" :key="t.id">
      <button @click="tab=t.id; if(t.id==='contacts') view='list'"
        :class="tab===t.id ? 'border-brand' : 'border-transparent opacity-60'"
        class="px-4 py-2 text-sm font-medium border-b-2 flex items-center gap-1">
        <span x-text="t.label"></span>
        <span x-show="t.id==='followups' && dueCount>0" class="text-[10px] bg-brand text-white rounded-full px-1.5" x-text="dueCount"></span>
      </button>
    </template>
  </nav>

  <!-- TODAY -->
  <section x-show="tab==='today'">
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      <div class="rounded-lg border border-black/10 dark:border-white/10 p-3"><div class="text-xs uppercase opacity-50">Open pipeline</div><div class="text-lg font-semibold tabular-nums" x-text="money(openValue)"></div></div>
      <div class="rounded-lg border border-black/10 dark:border-white/10 p-3"><div class="text-xs uppercase opacity-50">Need follow-up</div><div class="text-lg font-semibold" x-text="needFollowup.length"></div></div>
      <div class="rounded-lg border border-black/10 dark:border-white/10 p-3"><div class="text-xs uppercase opacity-50">Overdue</div><div class="text-lg font-semibold" :class="overdue.length?'text-brand-deep':''" x-text="overdue.length"></div></div>
      <div class="rounded-lg border border-black/10 dark:border-white/10 p-3"><div class="text-xs uppercase opacity-50">Won</div><div class="text-lg font-semibold tabular-nums" x-text="money(wonValue)"></div></div>
    </div>
    <span class="text-xs uppercase tracking-wide opacity-60">What needs you</span>
    <div class="mt-1 space-y-1.5">
      <template x-for="c in needYou" :key="c.id">
        <button @click="open(c.id)" class="w-full text-left rounded-lg border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-2 hover:border-brand transition flex justify-between items-center">
          <span><span class="font-medium" x-text="c.name||'Unnamed'"></span> <span class="opacity-60 text-sm" x-text="c.next_step?('— '+c.next_step):''"></span></span>
          <span class="text-xs tabular-nums" :class="isOverdue(c)?'text-brand-deep':'opacity-50'" x-text="c.due_date||''"></span>
        </button>
      </template>
      <p x-show="!needYou.length" class="text-sm opacity-50 py-6 text-center">Nothing overdue or due today. Clear desk.</p>
    </div>
  </section>

  <!-- PIPELINE (board) -->
  <section x-show="tab==='pipeline'">
    <div class="flex justify-end mb-3"><button @click="newContact()" class="rounded-lg bg-brand hover:bg-brand-deep text-white px-3 py-1.5 text-sm font-semibold">+ New contact</button></div>
    <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
      <template x-for="st in boardStages" :key="st">
        <div class="rounded-lg bg-black/[0.03] dark:bg-white/[0.03] p-2">
          <div class="flex justify-between items-center mb-2 px-1">
            <span class="text-xs uppercase tracking-wide font-semibold" x-text="stageLabel(st)"></span>
            <span class="text-[11px] opacity-50" x-text="byStage(st).length"></span>
          </div>
          <div class="space-y-1.5">
            <template x-for="c in byStage(st)" :key="c.id">
              <button @click="open(c.id)" class="w-full text-left rounded-md border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/5 px-2.5 py-2 hover:border-brand transition">
                <div class="font-medium text-sm" x-text="c.name||'Unnamed'"></div>
                <div class="text-xs opacity-60" x-text="c.company||''"></div>
                <div class="text-xs tabular-nums opacity-70 mt-0.5" x-show="c.value" x-text="money(c.value)"></div>
              </button>
            </template>
          </div>
        </div>
      </template>
    </div>
  </section>

  <!-- CONTACTS (list ↔ detail) -->
  <section x-show="tab==='contacts'">
    <!-- list -->
    <div x-show="view==='list'">
      <div class="flex gap-2 mb-3">
        <input x-model="search" placeholder="Search contacts…" class="flex-1 rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-3 py-2 text-sm">
        <button @click="newContact()" class="rounded-lg bg-brand hover:bg-brand-deep text-white px-3 py-1.5 text-sm font-semibold whitespace-nowrap">+ New</button>
      </div>
      <div class="space-y-1.5">
        <template x-for="c in filtered" :key="c.id">
          <button @click="open(c.id)" class="w-full text-left rounded-lg border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-2 hover:border-brand transition flex justify-between items-center">
            <span><span class="font-medium" x-text="c.name||'Unnamed'"></span> <span class="opacity-50 text-sm" x-text="c.company?('· '+c.company):''"></span></span>
            <span class="text-xs uppercase opacity-50" x-text="stageLabel(c.stage)"></span>
          </button>
        </template>
        <p x-show="!filtered.length" class="text-sm opacity-50 py-8 text-center">No contacts. Add your first one.</p>
      </div>
    </div>
    <!-- detail -->
    <template x-if="view==='detail' && current">
      <div class="space-y-5">
        <button @click="view='list'" class="text-sm text-brand">← All contacts</button>
        <div class="grid sm:grid-cols-2 gap-3">
          <label class="block"><span class="text-xs uppercase tracking-wide opacity-60">Name</span>
            <input x-model="current.name" @input="touch()" class="mt-1 w-full rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-3 py-2"></label>
          <label class="block"><span class="text-xs uppercase tracking-wide opacity-60">Company</span>
            <input x-model="current.company" @input="touch()" class="mt-1 w-full rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-3 py-2"></label>
          <label class="block"><span class="text-xs uppercase tracking-wide opacity-60">Email</span>
            <input x-model="current.email" @input="touch()" type="email" class="mt-1 w-full rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-3 py-2"></label>
          <label class="block"><span class="text-xs uppercase tracking-wide opacity-60">Phone</span>
            <input x-model="current.phone" @input="touch()" class="mt-1 w-full rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-3 py-2"></label>
          <label class="block"><span class="text-xs uppercase tracking-wide opacity-60">Stage</span>
            <select x-model="current.stage" @change="touch()" class="mt-1 w-full rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-3 py-2">
              <template x-for="st in stages" :key="st"><option :value="st" x-text="stageLabel(st)"></option></template>
            </select></label>
          <label class="block"><span class="text-xs uppercase tracking-wide opacity-60">Value ($)</span>
            <input x-model.number="current.value" @input="touch()" type="number" min="0" class="mt-1 w-full rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-3 py-2"></label>
        </div>
        <div class="rounded-lg border border-brand/30 bg-brand/[0.04] p-3 grid sm:grid-cols-2 gap-3">
          <label class="block"><span class="text-xs uppercase tracking-wide opacity-60">Next step</span>
            <input x-model="current.next_step" @input="touch()" class="mt-1 w-full rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-3 py-2" placeholder="Call back re: quote"></label>
          <label class="block"><span class="text-xs uppercase tracking-wide opacity-60">Due</span>
            <input x-model="current.due_date" @input="touch()" type="date" class="mt-1 w-full rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-3 py-2"></label>
        </div>
        <div>
          <div class="flex justify-between items-center mb-1">
            <span class="text-xs uppercase tracking-wide opacity-60">Activity</span>
          </div>
          <div class="flex gap-2 mb-2">
            <input x-model="noteDraft" @keydown.enter="logNote()" placeholder="Log a note or call…" class="flex-1 rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-3 py-2 text-sm">
            <button @click="logNote()" class="rounded-lg border border-brand text-brand px-3 text-sm font-medium">Log</button>
          </div>
          <div class="space-y-1">
            <template x-for="(a,i) in (current.activity||[])" :key="i">
              <div class="text-sm flex gap-2"><span class="opacity-40 tabular-nums text-xs pt-0.5" x-text="a.at"></span><span x-text="a.text"></span></div>
            </template>
          </div>
        </div>
        <button @click="del()" class="text-sm opacity-40 hover:opacity-100 hover:text-brand-deep">Delete contact</button>
      </div>
    </template>
  </section>

  <!-- FOLLOW-UPS -->
  <section x-show="tab==='followups'">
    <template x-for="grp in followGroups" :key="grp.key">
      <div x-show="grp.items.length" class="mb-4">
        <span class="text-xs uppercase tracking-wide font-semibold" :class="grp.key==='overdue'?'text-brand-deep':''" x-text="grp.label"></span>
        <div class="mt-1 space-y-1.5">
          <template x-for="c in grp.items" :key="c.id">
            <div class="rounded-lg border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-2 flex justify-between items-center gap-2">
              <button @click="open(c.id)" class="text-left flex-1">
                <span class="font-medium" x-text="c.name||'Unnamed'"></span>
                <span class="opacity-60 text-sm" x-text="'— '+c.next_step"></span>
              </button>
              <span class="text-xs tabular-nums opacity-50" x-text="c.due_date"></span>
              <button @click="markDone(c.id)" class="text-xs rounded-md border border-brand text-brand px-2 py-1">Done</button>
            </div>
          </template>
        </div>
      </div>
    </template>
    <p x-show="!dueCount && !laterCount" class="text-sm opacity-50 py-8 text-center">No follow-ups set. Add a next step + due date on any contact.</p>
  </section>

</div>

<script src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
<script>
  var TOKEN=${JSON.stringify(token)}, ORIGIN=${JSON.stringify(origin)};
  var COL=ORIGIN+'/api/collection/contacts';
  var H={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'};
  var STAGES=${JSON.stringify(CRM_STAGES)};
  function today(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

  function crm(){ return {
    tabs:[{id:'today',label:'Today'},{id:'pipeline',label:'Pipeline'},{id:'contacts',label:'Contacts'},{id:'followups',label:'Follow-ups'}],
    stages:STAGES, boardStages:['new','contacted','qualified','proposal','won','lost'],
    tab:'today', view:'list', contacts:[], currentId:null, search:'', noteDraft:'', savedNote:'', saveTimer:null,

    get current(){ var self=this; return this.contacts.find(function(c){return c.id===self.currentId;})||null; },
    get filtered(){ var q=this.search.toLowerCase(); return this.contacts.filter(function(c){ return !q || (c.name||'').toLowerCase().includes(q) || (c.company||'').toLowerCase().includes(q); }); },
    get openValue(){ return this.contacts.filter(function(c){return ['new','contacted','qualified','proposal'].includes(c.stage);}).reduce(function(s,c){return s+(c.value||0);},0); },
    get wonValue(){ return this.contacts.filter(function(c){return c.stage==='won';}).reduce(function(s,c){return s+(c.value||0);},0); },
    get needFollowup(){ return this.contacts.filter(function(c){return c.next_step&&c.due_date;}); },
    get overdue(){ var t=today(); return this.needFollowup.filter(function(c){return c.due_date<t;}); },
    get needYou(){ var t=today(); return this.needFollowup.filter(function(c){return c.due_date<=t;}).sort(function(a,b){return a.due_date<b.due_date?-1:1;}); },
    get dueCount(){ return this.needYou.length; },
    get laterCount(){ var t=today(); return this.needFollowup.filter(function(c){return c.due_date>t;}).length; },
    get followGroups(){ var t=today(); var f=this.needFollowup;
      function wk(){ var d=new Date(); d.setDate(d.getDate()+7); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
      var w=wk();
      return [
        {key:'overdue',label:'Overdue',items:f.filter(function(c){return c.due_date<t;}).sort(byDue)},
        {key:'today',label:'Today',items:f.filter(function(c){return c.due_date===t;})},
        {key:'week',label:'This week',items:f.filter(function(c){return c.due_date>t&&c.due_date<=w;}).sort(byDue)},
        {key:'later',label:'Later',items:f.filter(function(c){return c.due_date>w;}).sort(byDue)},
      ];
      function byDue(a,b){return a.due_date<b.due_date?-1:1;} },

    money(n){ return '$'+(Number(n)||0).toLocaleString('en-AU',{maximumFractionDigits:0}); },
    stageLabel(s){ return ({new:'New',contacted:'Contacted',qualified:'Qualified',proposal:'Proposal',won:'Won',lost:'Lost'})[s]||s; },
    byStage(s){ return this.contacts.filter(function(c){return c.stage===s;}); },
    isOverdue(c){ return c.due_date && c.due_date<today(); },

    async boot(){
      try{ var r=await fetch(COL,{headers:H}); var d=r.ok?await r.json():{}; var es=Array.isArray(d.entries)?d.entries:[];
        this.contacts=es.map(function(e){ var fm=e.frontmatter||{};
          return { id:e.slug, slug:e.slug, name:fm.name||'', company:fm.company||'', email:fm.email||'', phone:fm.phone||'',
            stage:fm.stage||'new', value:fm.value||0, next_step:fm.next_step||'', due_date:fm.due_date||'',
            activity:Array.isArray(fm.activity)?fm.activity:[] }; });
      }catch(e){ this.contacts=[]; } },
    open(id){ this.currentId=id; this.tab='contacts'; this.view='detail'; },
    newContact(){ var slug='c-'+Math.random().toString(36).slice(2,9);
      var c={id:slug, slug:slug, name:'', company:'', email:'', phone:'', stage:'new', value:0, next_step:'', due_date:'', activity:[]};
      this.contacts.unshift(c); this.currentId=c.id; this.tab='contacts'; this.view='detail'; },
    logNote(){ if(!this.noteDraft.trim()||!this.current)return; if(!this.current.activity)this.current.activity=[]; this.current.activity.unshift({at:today(),text:this.noteDraft.trim()}); this.noteDraft=''; this.touch(); },
    markDone(id){ var c=this.contacts.find(function(x){return x.id===id;}); if(!c)return; if(!c.activity)c.activity=[]; c.activity.unshift({at:today(),text:'✓ '+c.next_step}); c.next_step=''; c.due_date=''; this.saveContact(c); },
    del(){ var c=this.current; if(!c)return; this.contacts=this.contacts.filter(function(x){return x.id!==c.id;}); this.currentId=null; this.view='list'; this.deleteContact(c.slug); },

    touch(){ var self=this; var c=this.current; clearTimeout(this.saveTimer); this.saveTimer=setTimeout(function(){ self.saveContact(c); },600); },
    frontmatterFor(c){ return { name:c.name, kind:'contact', company:c.company, email:c.email, phone:c.phone, stage:c.stage, value:c.value, next_step:c.next_step, due_date:c.due_date, activity:c.activity }; },
    async saveContact(c){ if(!c||!(c.name||'').trim())return; this.savedNote='saving…';
      try{ await fetch(COL+'/'+encodeURIComponent(c.slug),{method:'PUT',headers:H,body:JSON.stringify({frontmatter:this.frontmatterFor(c),body:'',why:'mini-crm edit'})}); this.savedNote='✓ saved'; }
      catch(e){ this.savedNote='save failed'; }
      var self=this; setTimeout(function(){ self.savedNote=''; },1500); },
    async deleteContact(slug){ try{ await fetch(COL+'/'+encodeURIComponent(slug),{method:'DELETE',headers:H}); }catch(e){} },
  }; }
</script>
</body></html>`;
}
