// Calendar-shape app — a month grid of bookings. Click a day to see + add
// bookings (time, title, who, note); today is highlighted; day cells show a
// count. New view-shape for the kit. Alpine + Tailwind on a real-origin /app
// page; persists via app-scoped appdata.

export function renderBookingCalendarPage(token: string, origin: string): string {
	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Office Town — Bookings</title>
<script src="https://cdn.tailwindcss.com"></script>
<script>tailwind.config={theme:{extend:{colors:{brand:{DEFAULT:'#c25e4f',deep:'#8c4035'},sand:'#f7f3e8'}}}};</script>
<style>:root{color-scheme:light dark}[x-cloak]{display:none!important}</style>
</head>
<body class="bg-sand text-[#2a2520] dark:bg-[#1c1813] dark:text-[#ede6d6] font-sans">
<div x-data="cal()" x-init="boot()" x-cloak class="max-w-2xl mx-auto p-5">

  <div class="flex items-baseline justify-between">
    <h1 class="text-xl font-semibold" style="font-family:Georgia,serif">Bookings</h1>
    <span class="text-xs opacity-50" x-text="savedNote"></span>
  </div>

  <div class="flex items-center gap-3 my-4">
    <button @click="shift(-1)" class="rounded-lg border border-black/15 dark:border-white/15 w-8 h-8">‹</button>
    <span class="font-medium w-40 text-center" x-text="monthLabel"></span>
    <button @click="shift(1)" class="rounded-lg border border-black/15 dark:border-white/15 w-8 h-8">›</button>
    <button @click="goToday()" class="ml-auto text-sm text-brand">Today</button>
  </div>

  <div class="grid grid-cols-7 gap-1 text-center text-xs opacity-50 mb-1">
    <template x-for="d in ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']" :key="d"><div x-text="d"></div></template>
  </div>
  <div class="grid grid-cols-7 gap-1">
    <template x-for="(cell,i) in cells" :key="i">
      <button @click="cell.date && select(cell.date)"
        :class="!cell.date ? 'invisible' : (cell.date===selected ? 'border-brand bg-brand/10' : 'border-black/10 dark:border-white/10') + (cell.date===todayStr ? ' ring-1 ring-brand' : '')"
        class="aspect-square rounded-lg border p-1 text-left text-sm flex flex-col">
        <span x-text="cell.day" :class="cell.date===todayStr?'font-bold text-brand-deep':''"></span>
        <span x-show="count(cell.date)" class="mt-auto text-[10px] rounded bg-brand/20 text-brand-deep px-1 self-start" x-text="count(cell.date)+(count(cell.date)===1?' bk':' bks')"></span>
      </button>
    </template>
  </div>

  <div class="mt-5">
    <div class="flex items-center justify-between mb-2">
      <span class="font-medium" x-text="selectedLabel"></span>
    </div>
    <div class="space-y-1.5 mb-3">
      <template x-for="b in dayBookings" :key="b.id">
        <div class="rounded-lg border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-2 flex items-center gap-3">
          <span class="text-sm tabular-nums w-16 shrink-0 opacity-70" x-text="b.time||'—'"></span>
          <div class="flex-1 min-w-0">
            <div class="font-medium text-sm" x-text="b.title||'Booking'"></div>
            <div class="text-xs opacity-60" x-text="[b.who,b.note].filter(Boolean).join(' · ')"></div>
          </div>
          <button @click="remove(b.id)" class="opacity-40 hover:opacity-100 shrink-0">×</button>
        </div>
      </template>
      <p x-show="!dayBookings.length" class="text-sm opacity-50 py-2">Nothing booked. Add one below.</p>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <input x-model="f.time" type="time" class="rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-2 py-1.5 text-sm">
      <input x-model="f.title" placeholder="What" class="rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-2 py-1.5 text-sm">
      <input x-model="f.who" placeholder="Who" class="rounded-lg border border-black/15 dark:border-white/15 bg-white/70 dark:bg-white/5 px-2 py-1.5 text-sm">
      <button @click="add()" class="rounded-lg bg-brand hover:bg-brand-deep text-white px-3 py-1.5 text-sm font-semibold">Add</button>
    </div>
  </div>

</div>

<script src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
<script>
  var TOKEN=${JSON.stringify(token)}, ORIGIN=${JSON.stringify(origin)};
  var DATA=ORIGIN+'/api/appdata/office-town-bookings';
  var H={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'};
  function iso(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  var MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];

  function cal(){ var now=new Date(); return {
    bookings:[], view:{y:now.getFullYear(), m:now.getMonth()}, selected:iso(now), todayStr:iso(now), savedNote:'', f:{time:'',title:'',who:''},
    async boot(){ try{ var r=await fetch(DATA,{headers:H}); var d=r.ok?await r.json():{}; this.bookings=Array.isArray(d.bookings)?d.bookings:[]; }catch(e){ this.bookings=[]; } },
    get monthLabel(){ return MONTHS[this.view.m]+' '+this.view.y; },
    get cells(){ var y=this.view.y,m=this.view.m; var first=new Date(y,m,1); var lead=(first.getDay()+6)%7; var dim=new Date(y,m+1,0).getDate();
      var out=[]; for(var i=0;i<lead;i++) out.push({day:'',date:''});
      for(var d=1;d<=dim;d++) out.push({day:d,date:iso(new Date(y,m,d))}); return out; },
    count(date){ if(!date)return 0; return this.bookings.filter(function(b){return b.date===date;}).length; },
    get dayBookings(){ var s=this.selected; return this.bookings.filter(function(b){return b.date===s;}).sort(function(a,b){return (a.time||'')<(b.time||'')?-1:1;}); },
    get selectedLabel(){ var d=new Date(this.selected+'T00:00:00'); return d.toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long'}); },
    shift(n){ var m=this.view.m+n,y=this.view.y; if(m<0){m=11;y--;} if(m>11){m=0;y++;} this.view={y:y,m:m}; },
    goToday(){ var t=new Date(); this.view={y:t.getFullYear(),m:t.getMonth()}; this.selected=iso(t); },
    select(date){ this.selected=date; },
    add(){ if(!this.f.title&&!this.f.time)return; this.bookings.push({id:'b-'+Math.random().toString(36).slice(2,9), date:this.selected, time:this.f.time, title:this.f.title, who:this.f.who, note:''}); this.f={time:'',title:'',who:''}; this.save(); },
    remove(id){ this.bookings=this.bookings.filter(function(b){return b.id!==id;}); this.save(); },
    async save(){ this.savedNote='saving…'; try{ await fetch(DATA,{method:'PUT',headers:H,body:JSON.stringify({bookings:this.bookings})}); this.savedNote='✓ saved'; }catch(e){ this.savedNote='save failed'; }
      var self=this; setTimeout(function(){ self.savedNote=''; },1500); },
  }; }
</script>
</body></html>`;
}
