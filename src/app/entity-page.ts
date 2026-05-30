// Editable entity page (externalUrl panel). Served at /app/entity?c=&s=&t=.
//
// The direct-manipulation CRM cell: click a field and overtype it — it saves to
// the wiki on blur, no agent round-trip. Append a dated note to the body. Server-
// renders with the entity data + token + API origin injected, so edits PATCH
// straight to /api/cortex. Relationships use act() to ask the agent to open them.

const HIDE = new Set([
	'title', 'name', 'kind', 'slug', 'uuid', 'seed',
	'schema_version', 'status', 'confidence', 'review_status',
	'created', 'last_updated', 'last_edited_by', 'last_edited_at', 'last_change_summary',
]);

function esc(s: unknown): string {
	return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const ICONS: Record<string, string> = {
	orgs: '🏢', contacts: '👤', projects: '📋', decisions: '⚖️', knowledge: '📚',
	research: '🔬', people: '👥', sites: '📍', team: '🧑‍💼', owner: '🪪', business: '💼',
};
const icon = (n: string) => ICONS[n] ?? '📁';

export function renderEntityEditPage(
	token: string,
	origin: string,
	collection: string,
	slug: string,
	frontmatter: Record<string, unknown>,
	related: { outgoing: Array<{ collection: string; slug: string; kind?: string }>; incoming: Array<{ collection: string; slug: string; kind?: string }> },
	actions: Array<{ label: string; prompt: string }> = [],
): string {
	const pills = actions
		.map((a) => `<button class="pill" data-prompt="${esc(a.prompt)}">${esc(a.label)}</button>`)
		.join('');
	const title = (frontmatter.title as string) ?? (frontmatter.name as string) ?? slug;
	const fields = Object.entries(frontmatter).filter(
		([k, v]) => !HIDE.has(k) && (v == null || typeof v !== 'object'),
	);
	const fieldRows = fields
		.map(
			([k, v]) => `<div class="field"><label>${esc(k)}</label>
        <input class="f" data-key="${esc(k)}" value="${esc(v)}" autocomplete="off"><span class="ok" data-for="${esc(k)}"></span></div>`,
		)
		.join('');

	const seen = new Set<string>();
	const rels = [...related.outgoing, ...related.incoming].filter((r) => {
		const k = `${r.collection}/${r.slug}`;
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});
	const relChips = rels
		.map((r) => `<button class="badge rel" onclick="openRel('${esc(r.collection)}','${esc(r.slug)}')">${icon(r.collection)} ${esc(r.slug)}</button>`)
		.join('');

	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { --bg:#f7f3e8;--fg:#2a2520;--muted:#8a7e6f;--line:#d8cdb4;--card:#fffdf5;--card-line:#d8cdb4;
    --accent:#c25e4f;--accent-deep:#8c4035;--accent-fg:#fff;--code:#efe9d8;--green:#4a7a3d; }
  @media (prefers-color-scheme: dark){ :root { --bg:#1c1813;--fg:#ede6d6;--muted:#a89a86;--line:#3a3228;
    --card:#26211a;--card-line:#3a3228;--accent:#d4715f;--accent-deep:#c25e4f;--accent-fg:#fff;--code:#241f18;--green:#86c272; } }
  *{box-sizing:border-box;} body{margin:0;background:var(--bg);color:var(--fg);padding:16px;font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}
  h1{font-size:17px;margin:0 0 12px;font-family:'Optima','Palatino',Georgia,serif;}
  .type{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-left:8px;font-family:system-ui;}
  .field{margin-bottom:10px;} .field label{display:block;font-size:12px;color:var(--muted);margin-bottom:3px;text-transform:capitalize;}
  input,textarea{width:100%;font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg);}
  input:focus,textarea:focus{outline:none;border-color:var(--accent);}
  .ok{font-size:12px;color:var(--green);margin-left:4px;opacity:0;transition:opacity .2s;} .ok.show{opacity:1;}
  h2{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:20px 0 8px;}
  .badges{display:flex;gap:6px;flex-wrap:wrap;} .badge{background:var(--code);color:var(--muted);border-radius:6px;padding:3px 9px;font-size:12px;border:1px solid var(--card-line);}
  .pills{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;}
  .pill{background:var(--card);border:1px solid var(--accent);color:var(--accent);border-radius:999px;padding:6px 13px;font:inherit;font-size:13px;cursor:pointer;}
  .pill:hover{background:var(--accent);color:var(--accent-fg);}
  .badge.rel{cursor:pointer;} .badge.rel:hover{border-color:var(--accent);color:var(--accent);}
  .btn{border:0;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;background:var(--accent);color:var(--accent-fg);font-family:inherit;} .btn:hover{background:var(--accent-deep);}
  .hint{color:var(--muted);font-size:12px;margin:0 0 14px;}
</style></head>
<body>
  <h1>${icon(collection)} ${esc(title)}<span class="type">${esc(collection.replace(/s$/, ''))}</span></h1>
  <p class="hint">Click any field and overtype — it saves as you go.</p>
  ${pills ? `<h2>Suggested</h2><div class="pills">${pills}</div>` : ''}
  ${fieldRows || '<p class="hint">No editable fields.</p>'}
  ${relChips ? `<h2>Related</h2><div class="badges">${relChips}</div>` : ''}
  <h2>Add a note</h2>
  <textarea id="note" rows="2" placeholder="Append a dated note to this entry…"></textarea>
  <div style="margin-top:8px;"><button class="btn" onclick="addNote()">Add note</button></div>

<script>
  var TOKEN=${JSON.stringify(token)}, API=${JSON.stringify(origin)}+'/api/cortex',
      C=${JSON.stringify(collection)}, S=${JSON.stringify(slug)};
  var H={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'};

  function flag(key){ var el=document.querySelector('.ok[data-for="'+CSS.escape(key)+'"]'); if(!el)return;
    el.textContent='✓ saved'; el.classList.add('show'); setTimeout(function(){ el.classList.remove('show'); },1400); }

  document.querySelectorAll('input.f').forEach(function(inp){
    var initial=inp.value;
    inp.addEventListener('change', async function(){
      if(inp.value===initial) return;
      var r=await fetch(API+'/field',{method:'PATCH',headers:H,body:JSON.stringify({collection:C,slug:S,key:inp.dataset.key,value:inp.value})});
      if(r.ok){ initial=inp.value; flag(inp.dataset.key); }
    });
  });

  async function addNote(){
    var t=document.getElementById('note'); if(!t.value.trim())return;
    var r=await fetch(API+'/note',{method:'POST',headers:H,body:JSON.stringify({collection:C,slug:S,text:t.value})});
    if(r.ok){ t.value=''; }
  }

  // Fire a prompt action to the host (Goose) — the agent then carries it out.
  function act(p){ try{ window.parent.postMessage({type:'prompt',messageId:'ot-'+Date.now(),payload:{prompt:p}},'*'); }catch(e){} }
  function openRel(c,s){ act('Open '+c+'/'+s+' in the cortex browser.'); }
  // Suggested-action pills — the agent filled these for THIS entity.
  document.querySelectorAll('.pill').forEach(function(b){ b.addEventListener('click',function(){ act(b.dataset.prompt); }); });
</script>
</body></html>`;
}
