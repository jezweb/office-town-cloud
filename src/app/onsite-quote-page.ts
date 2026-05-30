// Trade sampler — On-site quick quote. A compact single-screen quote builder for
// use on the van: customer + line items → live GST total, save to a list, and
// "copy as text" for pasting into an SMS or email on the spot. Form-shape app.
// Alpine + Tailwind on a real-origin /app page; persists via app-scoped appdata.

export function renderOnsiteQuotePage(token: string, origin: string): string {
	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Office Town — On-site Quote</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config={theme:{extend:{colors:{brand:{DEFAULT:'#c25e4f',deep:'#8c4035'},sand:'#f7f3e8'}}}};</script>
<style>:root{color-scheme:light dark}[x-cloak]{display:none!important}</style>
</head>
<body class="bg-sand text-[#2a2520] dark:bg-[#1c1813] dark:text-[#ede6d6] font-sans">
<div x-data="oq()" x-init="boot()" x-cloak class="max-w-lg mx-auto p-5">

  <h1 class="text-xl font-semibold" style="font-family:Georgia,serif">On-site quote</h1>
  <p class="text-sm opacity-60 mb-4">Build it on the spot, send the total before you leave the driveway.</p>

  <label class="block mb-3"><span class="text-xs uppercase tracking-wide opacity-60">Customer</span>
    <input x-model="customer" class="mt-1 w-full rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-3 py-2" placeholder="Name / job"></label>

  <div class="flex justify-between items-center mb-1">
    <span class="text-xs uppercase tracking-wide opacity-60">Line items</span>
    <button @click="addLine()" class="text-sm text-brand">+ Add line</button>
  </div>
  <div class="space-y-1.5">
    <template x-for="(ln,i) in lines" :key="i">
      <div class="flex gap-2 items-center">
        <input x-model="ln.desc" placeholder="Description" class="flex-1 rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-2 py-1.5 text-sm">
        <input x-model.number="ln.qty" type="number" min="0" step="0.5" class="w-14 rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-2 py-1.5 text-sm text-right">
        <input x-model.number="ln.price" type="number" min="0" step="1" class="w-20 rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-2 py-1.5 text-sm text-right">
        <span class="w-20 text-right text-sm tabular-nums" x-text="money((ln.qty||0)*(ln.price||0))"></span>
        <button @click="lines.splice(i,1)" class="opacity-40 hover:opacity-100">×</button>
      </div>
    </template>
  </div>

  <div class="mt-3 ml-auto w-56 text-sm space-y-0.5">
    <div class="flex justify-between opacity-70"><span>Subtotal</span><span class="tabular-nums" x-text="money(subtotal)"></span></div>
    <div class="flex justify-between opacity-70"><span>GST (10%)</span><span class="tabular-nums" x-text="money(subtotal*0.1)"></span></div>
    <div class="flex justify-between font-semibold text-base border-t border-black/10 dark:border-white/10 pt-0.5"><span>Total</span><span class="tabular-nums" x-text="money(total)"></span></div>
  </div>

  <div class="flex gap-2 mt-5">
    <button @click="copyText()" class="flex-1 rounded-lg border border-brand text-brand px-3 py-2 text-sm font-semibold" x-text="copied?'✓ Copied':'Copy as text'"></button>
    <button @click="saveQuote()" class="flex-1 rounded-lg bg-brand hover:bg-brand-deep text-white px-3 py-2 text-sm font-semibold">Save quote</button>
  </div>

  <div x-show="saved.length" class="mt-6">
    <span class="text-xs uppercase tracking-wide opacity-60">Saved quotes</span>
    <div class="mt-1 space-y-1">
      <template x-for="q in saved" :key="q.id">
        <button @click="load(q)" class="w-full text-left rounded-lg border border-black/10 dark:border-white/10 bg-white/50 dark:bg-white/5 px-3 py-2 text-sm hover:border-brand transition flex justify-between">
          <span><span class="font-medium" x-text="q.customer||'Untitled'"></span> <span class="opacity-50" x-text="q.savedAt"></span></span>
          <span class="tabular-nums" x-text="money(q.total)"></span>
        </button>
      </template>
    </div>
  </div>

</div>

<script src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
<script>
  var TOKEN=${JSON.stringify(token)}, ORIGIN=${JSON.stringify(origin)};
  var DATA=ORIGIN+'/api/appdata/office-town-onsite-quote';
  var H={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'};
  function today(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

  function oq(){ return {
    customer:'', lines:[{desc:'',qty:1,price:0}], saved:[], copied:false,
    async boot(){ try{ var r=await fetch(DATA,{headers:H}); var d=r.ok?await r.json():{}; this.saved=Array.isArray(d.quotes)?d.quotes:[]; }catch(e){ this.saved=[]; } },
    get subtotal(){ return this.lines.reduce(function(s,l){return s+(l.qty||0)*(l.price||0);},0); },
    get total(){ return this.subtotal*1.1; },
    money(n){ return '$'+(Number(n)||0).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2}); },
    addLine(){ this.lines.push({desc:'',qty:1,price:0}); },
    asText(){ var self=this; var ls=this.lines.filter(function(l){return l.desc;}).map(function(l){ return l.desc+' — '+l.qty+' × '+self.money(l.price)+' = '+self.money((l.qty||0)*(l.price||0)); });
      return 'Quote for '+(this.customer||'you')+'\\n'+ls.join('\\n')+'\\nSubtotal '+this.money(this.subtotal)+'\\nGST '+this.money(this.subtotal*0.1)+'\\nTotal '+this.money(this.total); },
    copyText(){ var self=this; navigator.clipboard.writeText(this.asText()).then(function(){ self.copied=true; setTimeout(function(){self.copied=false;},1500); }); },
    async saveQuote(){ var q={id:'q-'+Math.random().toString(36).slice(2,9), customer:this.customer, lines:JSON.parse(JSON.stringify(this.lines)), total:this.total, savedAt:today()};
      this.saved.unshift(q); await fetch(DATA,{method:'PUT',headers:H,body:JSON.stringify({quotes:this.saved})});
      this.customer=''; this.lines=[{desc:'',qty:1,price:0}]; },
    load(q){ this.customer=q.customer; this.lines=JSON.parse(JSON.stringify(q.lines)); },
  }; }
</script>
</body></html>`;
}
