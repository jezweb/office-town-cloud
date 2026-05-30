// Shared shell for Office Town's MCP-UI panels (the "cortex UI kit").
//
// Every panel is a self-contained rawHtml doc rendered inline by Goose's
// @mcp-ui/client. They share one stylesheet + one action bridge so the
// surfaces feel like one product. Buttons call act(prompt) → a `prompt`
// action → Goose injects it into chat → the agent runs the matching tool.
// (Goose stubs `tool` actions today, so we use `prompt` — see workflows.ts.)
//
// Adding a new surface = a new tool that builds a body string and wraps it
// in uiPage(). No new framework, no build step.

export function esc(s: unknown): string {
	return String(s ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

// A prompt is injected verbatim into chat — keep it imperative + unambiguous.
export function jsPrompt(s: string): string {
	return JSON.stringify(s);
}

export function actButton(label: string, prompt: string, kind: 'primary' | 'ghost' = 'primary', small = false): string {
	return `<button class="btn ${kind}${small ? ' sm' : ''}" onclick='act(${jsPrompt(prompt)})'>${esc(label)}</button>`;
}

const STYLE = `
  /* Warm earth palette — matches the Office Town dashboard (terracotta + cream). */
  :root {
    --bg:#f7f3e8; --fg:#2a2520; --muted:#8a7e6f; --line:#d8cdb4;
    --card:#fffdf5; --card-line:#d8cdb4; --accent:#c25e4f; --accent-deep:#8c4035; --accent-fg:#fff;
    --need:#f6ecd9; --need-line:#cdab73; --dot:#b87333;
    --b-bg:#efe9d8; --b-fg:#5a4f44; --code:#efe9d8;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg:#1c1813; --fg:#ede6d6; --muted:#a89a86; --line:#3a3228;
      --card:#26211a; --card-line:#3a3228; --accent:#d4715f; --accent-deep:#c25e4f; --accent-fg:#fff;
      --need:#2a2014; --need-line:#5c4427; --dot:#d08a4a;
      --b-bg:#2b251c; --b-fg:#c4b6a2; --code:#241f18;
    }
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); padding:16px;
    font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  h1 { font-size:16px; margin:0 0 2px; font-family:'Optima','Palatino',Georgia,serif; }
  .sub { color:var(--muted); font-size:12px; margin:0 0 16px; }
  h2 { font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted);
    margin:22px 0 10px; display:flex; align-items:center; gap:8px; }
  .count { background:var(--dot); color:#fff; border-radius:10px; padding:0 7px; font-size:11px; line-height:18px; }
  .card { background:var(--card); border:1px solid var(--card-line); border-radius:12px; padding:14px; margin-bottom:10px; }
  .card.need { background:var(--need); border-color:var(--need-line); }
  .need-head { font-size:13px; margin-bottom:6px; } .need-dot { color:var(--dot); margin-right:4px; }
  .need-title { font-weight:600; margin-bottom:4px; } .need-summary { color:var(--muted); font-size:13px; margin-bottom:12px; }
  .wf-top { display:flex; justify-content:space-between; align-items:center; gap:10px; }
  .wf-name { font-weight:600; font-size:14px; } .wf-desc { color:var(--muted); font-size:13px; margin:8px 0 0; }
  .badges { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
  .badge { background:var(--b-bg); color:var(--b-fg); border-radius:6px; padding:1px 8px; font-size:11px; font-weight:500; }
  .b-cloud{background:#e6ebe1;color:#4a7a3d;} .b-local{background:#efe2d2;color:#8c5a35;}
  .b-review{background:#f3e6cf;color:#8a5a1c;} .b-auto{background:#e3efdc;color:#3a6230;} .b-ask{background:#f5dcd6;color:#a83a2c;}
  @media (prefers-color-scheme: dark) {
    .b-cloud{background:#23301f;color:#9cc78b;} .b-local{background:#33291c;color:#cda07a;}
    .b-review{background:#352a18;color:#e0b76a;} .b-auto{background:#1f2e1a;color:#9cc78b;} .b-ask{background:#33201c;color:#e09a8c;}
  }
  .receipt { color:var(--muted); font-size:12px; margin-top:10px; font-variant-numeric:tabular-nums; }
  .receipt.muted { font-style:italic; opacity:.7; }
  .row { display:flex; gap:8px; flex-wrap:wrap; }
  .btn { border:0; border-radius:8px; padding:8px 14px; font-size:13px; font-weight:600; cursor:pointer; font-family:inherit; }
  .btn.sm { padding:5px 11px; font-size:12px; } .btn.primary { background:var(--accent); color:var(--accent-fg); }
  .btn.primary:hover { background:var(--accent-deep); }
  .btn.ghost { background:transparent; color:var(--muted); border:1px solid var(--line); } .btn:active { transform:translateY(1px); }
  .paused { color:var(--muted); font-size:12px; font-style:italic; }
  .empty { color:var(--muted); font-size:13px; padding:14px; border:1px dashed var(--line); border-radius:12px; text-align:center; }
  /* forms + controls */
  input,select,textarea { font:inherit; padding:7px 10px; border:1px solid var(--line); border-radius:8px;
    background:var(--bg); color:var(--fg); width:100%; }
  .field { margin-bottom:10px; } .field > label { display:block; font-size:12px; color:var(--muted); margin-bottom:4px; }
  label.chk { display:flex; align-items:center; gap:7px; font-size:13px; cursor:pointer; }
  label.chk input { width:auto; }
  .drag { cursor:grab; display:flex; align-items:center; gap:10px; } .drag:active { cursor:grabbing; }
  .grip { color:var(--muted); letter-spacing:-2px; } .drag.over { border-color:var(--accent); }
  .note { color:var(--muted); font-size:12px; margin:6px 0 0; }
  /* cortex browser */
  .tiles { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; }
  .tile { background:var(--card); border:1px solid var(--card-line); border-radius:12px; padding:14px; cursor:pointer; text-align:left; }
  .tile:hover { border-color:var(--accent); } .tile-ico { font-size:22px; } .tile-name { font-weight:600; margin-top:6px; text-transform:capitalize; }
  .tile-count { color:var(--muted); font-size:12px; }
  .entry { width:100%; text-align:left; background:var(--card); border:1px solid var(--card-line); border-radius:10px;
    padding:11px 13px; margin-bottom:8px; cursor:pointer; display:block; font:inherit; color:inherit; }
  .entry:hover { border-color:var(--accent); } .entry-slug { font-weight:600; } .entry-ex { color:var(--muted); font-size:12px; margin-top:3px; }
  .crumb { display:flex; gap:6px; align-items:center; margin-bottom:14px; font-size:12px; color:var(--muted); }
  .fm { display:flex; gap:6px; flex-wrap:wrap; margin:6px 0 14px; }
  .md { font-size:14px; } .md h1,.md h2,.md h3 { text-transform:none; letter-spacing:0; color:var(--fg); margin:18px 0 8px; }
  .md h1 { font-size:20px; } .md h2 { font-size:16px; } .md h3 { font-size:14px; }
  .md p { margin:8px 0; } .md ul,.md ol { padding-left:20px; margin:8px 0; } .md li { margin:3px 0; }
  .md a { color:var(--accent); } .md code { background:var(--code); padding:1px 5px; border-radius:4px; font-size:12px; }
  .md pre { background:var(--code); padding:12px; border-radius:8px; overflow:auto; } .md pre code { background:none; padding:0; }
  .md blockquote { border-left:3px solid var(--line); margin:8px 0; padding:2px 12px; color:var(--muted); }
  .md table { border-collapse:collapse; margin:8px 0; } .md th,.md td { border:1px solid var(--line); padding:4px 8px; text-align:left; }
  /* entity card — fields adapt to whatever the entity has */
  .kv { margin:12px 0; display:flex; flex-direction:column; gap:5px; }
  .kvrow { display:flex; gap:10px; font-size:13px; align-items:baseline; }
  .kvk { color:var(--muted); min-width:96px; text-transform:capitalize; flex-shrink:0; }
  .kvv { color:var(--fg); word-break:break-word; }
  .esum { color:var(--muted); font-size:13px; margin:12px 0; }
  .erel-h { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); margin:14px 0 6px; }
  .badge.rel { cursor:pointer; border:1px solid var(--card-line); } .badge.rel:hover { border-color:var(--accent); color:var(--accent); }
`;

const SCRIPT = `
  function act(prompt) {
    try {
      window.parent.postMessage(
        { type:'prompt', messageId:'ot-'+Date.now(), payload:{ prompt:prompt } }, '*'
      );
    } catch (e) {}
  }
`;

export function uiPage(opts: { title: string; subtitle?: string; body: string }): string {
	return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(opts.title)}</title><style>${STYLE}</style></head>
<body>
  <h1>${esc(opts.title)}</h1>
  ${opts.subtitle ? `<p class="sub">${esc(opts.subtitle)}</p>` : ''}
  ${opts.body}
<script>${SCRIPT}</script>
</body></html>`;
}
