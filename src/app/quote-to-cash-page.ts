// Quote-to-cash flagship — one object (a "deal") flowing across tabs:
//   Quote (line-item table, live GST total) → Job (details, attachments, voice
//   notes) → Invoice (status + chase) → Money (KPI dashboard + chart).
// Multi-tab "SaaS-in-one-app" built on Alpine + Tailwind + Chart.js (all CDN —
// fine on a real-origin /app page, no CSP). Persists the whole deal list via the
// app-scoped appdata store; attachments + voice use /api/media.

const STAGES = ['draft', 'sent', 'accepted', 'in_progress', 'invoiced', 'paid'] as const;

export function renderQuoteToCashPage(token: string, origin: string): string {
	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Office Town — Quote to Cash</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script>tailwind.config={theme:{extend:{colors:{brand:{DEFAULT:'#c25e4f',deep:'#8c4035'},sand:'#f7f3e8'}}}};</script>
<style>:root{color-scheme:light dark}[x-cloak]{display:none!important}</style>
</head>
<body class="bg-sand text-[#2a2520] dark:bg-[#1c1813] dark:text-[#ede6d6] font-sans">
<div x-data="q2c()" x-init="boot()" x-cloak class="max-w-4xl mx-auto p-5">

  <div class="flex items-baseline justify-between">
    <h1 class="text-xl font-semibold" style="font-family:Georgia,serif">Quote to Cash</h1>
    <span class="text-xs opacity-50" x-text="savedNote"></span>
  </div>
  <p class="text-sm opacity-60 mb-4">One reference, the whole money flow — quote, job, invoice — in a single window.</p>

  <nav class="flex gap-1 border-b border-black/10 dark:border-white/10 mb-5">
    <template x-for="t in tabs" :key="t.id">
      <button @click="tab=t.id"
        :class="tab===t.id ? 'border-brand' : 'border-transparent opacity-60'"
        class="px-4 py-2 text-sm font-medium border-b-2" x-text="t.label"></button>
    </template>
  </nav>

  <!-- PIPELINE -->
  <section x-show="tab==='pipeline'">
    <div class="flex justify-between items-center mb-3">
      <span class="text-sm opacity-60" x-text="deals.length + ' deals'"></span>
      <button @click="newDeal()" class="rounded-lg bg-brand hover:bg-brand-deep text-white px-3 py-1.5 text-sm font-semibold">+ New deal</button>
    </div>
    <template x-if="deals.length===0">
      <p class="text-sm opacity-50 py-8 text-center">No deals yet. Start one — quote a client, watch it flow through to paid.</p>
    </template>
    <div class="space-y-4">
      <template x-for="st in stages" :key="st">
        <div x-show="byStage(st).length">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs uppercase tracking-wide font-semibold" x-text="stageLabel(st)"></span>
            <span class="text-xs opacity-50" x-text="money(stageTotal(st))"></span>
          </div>
          <div class="space-y-1.5">
            <template x-for="d in byStage(st)" :key="d.id">
              <button @click="open(d.id)" class="w-full text-left rounded-lg border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-2 hover:border-brand transition flex justify-between items-center">
                <span><span class="font-medium" x-text="d.client||'Untitled'"></span> <span class="opacity-50 text-sm" x-text="d.ref"></span></span>
                <span class="text-sm tabular-nums" x-text="money(total(d))"></span>
              </button>
            </template>
          </div>
        </div>
      </template>
    </div>
  </section>

  <!-- DEAL -->
  <section x-show="tab==='deal'">
    <template x-if="!current">
      <p class="text-sm opacity-50 py-8 text-center">Pick a deal from the Pipeline, or <button @click="newDeal()" class="text-brand underline">start a new one</button>.</p>
    </template>
    <template x-if="current"><div class="space-y-6">
      <div class="flex flex-wrap gap-3 items-end">
        <label class="block flex-1 min-w-[180px]"><span class="text-xs uppercase tracking-wide opacity-60">Client</span>
          <input x-model="current.client" @input="touch()" class="mt-1 w-full rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-3 py-2"></label>
        <label class="block"><span class="text-xs uppercase tracking-wide opacity-60">Stage</span>
          <select x-model="current.stage" @change="touch()" class="mt-1 rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-3 py-2">
            <template x-for="st in stages" :key="st"><option :value="st" x-text="stageLabel(st)"></option></template>
          </select></label>
        <span class="text-xs opacity-50 pb-2" x-text="current.ref"></span>
      </div>

      <!-- Quote line items -->
      <div>
        <div class="flex justify-between items-center mb-1">
          <span class="text-xs uppercase tracking-wide opacity-60">Quote — line items</span>
          <button @click="addLine()" class="text-sm text-brand">+ Add line</button>
        </div>
        <table class="w-full text-sm">
          <thead><tr class="text-left opacity-50 text-xs"><th class="py-1">Description</th><th class="w-16 text-right">Qty</th><th class="w-24 text-right">Unit $</th><th class="w-24 text-right">Amount</th><th class="w-6"></th></tr></thead>
          <tbody>
            <template x-for="(ln,i) in current.lines" :key="i">
              <tr class="border-t border-black/5 dark:border-white/5">
                <td class="py-1"><input x-model="ln.desc" @input="touch()" class="w-full bg-transparent py-1 focus:outline-none" placeholder="Supply &amp; install…"></td>
                <td><input x-model.number="ln.qty" @input="touch()" type="number" min="0" step="0.5" class="w-full bg-transparent text-right py-1 focus:outline-none"></td>
                <td><input x-model.number="ln.price" @input="touch()" type="number" min="0" step="0.01" class="w-full bg-transparent text-right py-1 focus:outline-none"></td>
                <td class="text-right tabular-nums" x-text="money((ln.qty||0)*(ln.price||0))"></td>
                <td class="text-right"><button @click="current.lines.splice(i,1);touch()" class="opacity-40 hover:opacity-100">×</button></td>
              </tr>
            </template>
          </tbody>
        </table>
        <div class="mt-2 ml-auto w-56 text-sm space-y-0.5">
          <div class="flex justify-between opacity-70"><span>Subtotal</span><span class="tabular-nums" x-text="money(subtotal(current))"></span></div>
          <div class="flex justify-between opacity-70"><span>GST (10%)</span><span class="tabular-nums" x-text="money(subtotal(current)*0.1)"></span></div>
          <div class="flex justify-between font-semibold border-t border-black/10 dark:border-white/10 pt-0.5"><span>Total</span><span class="tabular-nums" x-text="money(total(current))"></span></div>
        </div>
      </div>

      <!-- Job notes + voice dictate -->
      <div>
        <div class="flex justify-between items-center mb-1">
          <span class="text-xs uppercase tracking-wide opacity-60">Job notes</span>
          <button @click="dictate()" class="text-sm" :class="recording?'text-brand-deep':'text-brand'" x-text="recording?'■ Stop':'● Dictate'"></button>
        </div>
        <textarea x-model="current.notes" @input="touch()" rows="3" class="w-full rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-3 py-2" placeholder="On-site notes, scope, materials…"></textarea>
        <span class="text-xs opacity-50" x-text="recStatus"></span>
      </div>

      <!-- Attachments -->
      <div>
        <div class="flex justify-between items-center mb-1">
          <span class="text-xs uppercase tracking-wide opacity-60">Attachments</span>
          <label class="text-sm text-brand cursor-pointer">+ Upload<input type="file" class="hidden" @change="attach($event)"></label>
        </div>
        <div class="flex flex-wrap gap-2">
          <template x-for="(a,i) in current.attachments" :key="i">
            <a :href="fileUrl(a.key)" target="_blank" class="block w-20 h-20 rounded-lg border border-black/10 dark:border-white/10 overflow-hidden bg-black/5">
              <img :src="fileUrl(a.key)" class="w-full h-full object-cover" :alt="a.name">
            </a>
          </template>
          <span x-show="!current.attachments.length" class="text-sm opacity-50">No photos yet.</span>
        </div>
      </div>

      <!-- Invoice -->
      <div class="rounded-lg border border-black/10 dark:border-white/10 p-3">
        <div class="flex justify-between items-center">
          <div>
            <span class="text-xs uppercase tracking-wide opacity-60">Invoice</span>
            <div class="text-sm" x-text="invoiceLine()"></div>
          </div>
          <div class="flex gap-2">
            <button @click="markSent()" class="rounded-lg border border-brand text-brand px-3 py-1.5 text-sm font-medium">Mark sent</button>
            <button @click="markPaid()" class="rounded-lg bg-brand hover:bg-brand-deep text-white px-3 py-1.5 text-sm font-medium">Mark paid</button>
          </div>
        </div>
      </div>

      <button @click="del()" class="text-sm opacity-40 hover:opacity-100 hover:text-brand-deep">Delete this deal</button>
    </div></template>
  </section>

  <!-- MONEY -->
  <section x-show="tab==='money'">
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      <div class="rounded-lg border border-black/10 dark:border-white/10 p-3"><div class="text-xs uppercase opacity-50">Pipeline</div><div class="text-lg font-semibold tabular-nums" x-text="money(kpi.pipeline)"></div></div>
      <div class="rounded-lg border border-black/10 dark:border-white/10 p-3"><div class="text-xs uppercase opacity-50">Accepted</div><div class="text-lg font-semibold tabular-nums" x-text="money(kpi.accepted)"></div></div>
      <div class="rounded-lg border border-black/10 dark:border-white/10 p-3"><div class="text-xs uppercase opacity-50">Outstanding</div><div class="text-lg font-semibold tabular-nums" x-text="money(kpi.outstanding)"></div></div>
      <div class="rounded-lg border border-black/10 dark:border-white/10 p-3"><div class="text-xs uppercase opacity-50">Paid</div><div class="text-lg font-semibold tabular-nums" x-text="money(kpi.paid)"></div></div>
    </div>
    <canvas id="chart" height="120"></canvas>
  </section>

</div>

<script src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
<script>
  var TOKEN=${JSON.stringify(token)}, ORIGIN=${JSON.stringify(origin)};
  var DATA=ORIGIN+'/api/appdata/office-town-quote-to-cash', MEDIA=ORIGIN+'/api/media';
  var H={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'};
  var STAGES=${JSON.stringify(STAGES)};

  function q2c(){ return {
    tabs:[{id:'pipeline',label:'Pipeline'},{id:'deal',label:'Deal'},{id:'money',label:'Money'}],
    stages:STAGES,
    tab:'pipeline', deals:[], currentId:null, savedNote:'', saveTimer:null,
    recording:false, recStatus:'', _rec:null, _chunks:[],
    kpi:{pipeline:0,accepted:0,outstanding:0,paid:0}, _chart:null,

    get current(){ var self=this; return this.deals.find(function(d){return d.id===self.currentId;})||null; },

    async boot(){ try{ var r=await fetch(DATA,{headers:H}); var d=r.ok?await r.json():{}; this.deals=Array.isArray(d.deals)?d.deals:[]; }catch(e){ this.deals=[]; }
      var self=this; this.$watch('tab',function(v){ if(v==='money') self.$nextTick(function(){ self.recalc(); self.drawChart(); }); }); },

    money(n){ return '$'+(Number(n)||0).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2}); },
    stageLabel(s){ return ({draft:'Draft',sent:'Quote sent',accepted:'Accepted',in_progress:'In progress',invoiced:'Invoiced',paid:'Paid'})[s]||s; },
    subtotal(d){ return (d&&d.lines||[]).reduce(function(s,l){return s+(l.qty||0)*(l.price||0);},0); },
    total(d){ return this.subtotal(d)*1.1; },
    byStage(s){ return this.deals.filter(function(d){return d.stage===s;}); },
    stageTotal(s){ var self=this; return this.byStage(s).reduce(function(t,d){return t+self.total(d);},0); },

    newDeal(){ var n=this.deals.filter(function(d){return /^Q-/.test(d.ref);}).length+1;
      var ref='Q-'+String(1000+n);
      var d={id:'d-'+Math.random().toString(36).slice(2,9), ref:ref, client:'', stage:'draft',
        lines:[{desc:'',qty:1,price:0}], notes:'', attachments:[], invoice:{status:'none'}, createdAt:new Date().toISOString()};
      this.deals.unshift(d); this.currentId=d.id; this.tab='deal'; this.save(); },
    open(id){ this.currentId=id; this.tab='deal'; },
    addLine(){ this.current.lines.push({desc:'',qty:1,price:0}); this.touch(); },
    del(){ var id=this.currentId; this.deals=this.deals.filter(function(d){return d.id!==id;}); this.currentId=null; this.tab='pipeline'; this.save(); },

    invoiceLine(){ var inv=this.current&&this.current.invoice||{status:'none'};
      if(inv.status==='paid') return 'Paid'+(inv.paidAt?' · '+inv.paidAt.slice(0,10):'');
      if(inv.status==='sent') return 'Sent'+(inv.sentAt?' · '+inv.sentAt.slice(0,10):'')+' — awaiting payment';
      return 'Not invoiced yet'; },
    markSent(){ this.current.invoice={status:'sent',sentAt:new Date().toISOString()}; if(this.current.stage!=='paid') this.current.stage='invoiced'; this.touch(); },
    markPaid(){ var inv=this.current.invoice||{}; inv.status='paid'; inv.paidAt=new Date().toISOString(); this.current.invoice=inv; this.current.stage='paid'; this.touch(); },

    touch(){ var self=this; clearTimeout(this.saveTimer); this.saveTimer=setTimeout(function(){ self.save(); },600); },
    async save(){ this.savedNote='saving…'; try{ await fetch(DATA,{method:'PUT',headers:H,body:JSON.stringify({deals:this.deals})}); this.savedNote='✓ saved'; }catch(e){ this.savedNote='save failed'; }
      var self=this; setTimeout(function(){ self.savedNote=''; },1500); },

    fileUrl(key){ return MEDIA+'/file?key='+encodeURIComponent(key)+'&t='+encodeURIComponent(TOKEN); },
    async attach(e){ var f=e.target.files[0]; if(!f||!this.current)return; var self=this;
      var r=new FileReader(); r.onload=async function(){ var b64=r.result.split(',')[1];
        var res=await fetch(MEDIA+'/upload',{method:'POST',headers:H,body:JSON.stringify({filename:f.name,content_base64:b64,content_type:f.type})});
        var d=await res.json(); if(d.key){ self.current.attachments.push({key:d.key,name:f.name}); self.touch(); } };
      r.readAsDataURL(f); },

    async dictate(){ var self=this;
      if(this._rec&&this._rec.state==='recording'){ this._rec.stop(); return; }
      try{ var stream=await navigator.mediaDevices.getUserMedia({audio:true}); }catch(err){ this.recStatus='Mic blocked: '+err.message; return; }
      this._rec=new MediaRecorder(stream); this._chunks=[]; this.recording=true; this.recStatus='Recording…';
      this._rec.ondataavailable=function(ev){ self._chunks.push(ev.data); };
      this._rec.onstop=async function(){ stream.getTracks().forEach(function(t){t.stop();}); self.recording=false; self.recStatus='Transcribing…';
        var blob=new Blob(self._chunks,{type:'audio/webm'}); var buf=await blob.arrayBuffer();
        var b64=btoa(String.fromCharCode.apply(null,new Uint8Array(buf)));
        var res=await fetch(MEDIA+'/transcribe',{method:'POST',headers:H,body:JSON.stringify({audio_base64:b64})});
        var d=await res.json(); self.recStatus=''; if(d.text){ self.current.notes=(self.current.notes?self.current.notes+' ':'')+d.text; self.touch(); } };
      this._rec.start(); },

    recalc(){ var self=this; var k={pipeline:0,accepted:0,outstanding:0,paid:0};
      this.deals.forEach(function(d){ var t=self.total(d);
        if(d.stage==='draft'||d.stage==='sent') k.pipeline+=t;
        if(d.stage==='accepted'||d.stage==='in_progress') k.accepted+=t;
        if((d.invoice&&d.invoice.status)==='sent') k.outstanding+=t;
        if(d.stage==='paid'||(d.invoice&&d.invoice.status)==='paid') k.paid+=t; });
      this.kpi=k; },
    drawChart(){ var self=this; var ctx=document.getElementById('chart'); if(!ctx)return;
      var vals=STAGES.map(function(s){ return self.stageTotal(s); });
      if(this._chart) this._chart.destroy();
      this._chart=new Chart(ctx,{type:'bar',data:{labels:STAGES.map(function(s){return self.stageLabel(s);}),
        datasets:[{label:'Value by stage',data:vals,backgroundColor:'#c25e4f'}]},
        options:{plugins:{legend:{display:false}},scales:{y:{ticks:{callback:function(v){return '$'+v;}}}}}}); },
  }; }
</script>
</body></html>`;
}
