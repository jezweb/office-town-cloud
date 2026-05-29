# Office Town media pipeline — plan

**Date:** 2026-05-29
**Goal:** Bring Goanna-mediabox-grade file understanding into Office Town's
files MCP, server-side on Cloudflare (no local Python in the core), so the
"empty your filing cabinet and I learn your business" promise covers photos,
audio, and video — not just text documents.

---

## Reference: what Goanna's mediabox does

Learned from the deployed `goanna-mediabox` worker (tool contract + bindings;
source not on this Mac).

**Bindings:** `AI` (Workers AI), `MEDIA` (Cloudflare **Media Transformations**
— extracts video frames server-side, no ffmpeg), `D1` (job tracking + result
cache), `R2` (media storage), a bearer secret.

**One `extract` action, auto-routes by file type:**

| Input | Handler | Result field |
|---|---|---|
| Images | AI vision description (`gemma4` fast / `kimi` complex) | `description` |
| PDF / Office / HTML | text → markdown (`toMarkdown`) | `text` |
| Audio | transcript | `transcript` |
| Video | frames → vision + audio → transcript | `visual_summary` + `frames` + `transcript` |

**Mechanics worth copying:**
- **Async jobs** — small/fast block and return; audio/video return
  `status: processing` + `job_id`, polled via a job tool with `wait` (≤3 min).
- **Result cache** — keyed by content hash; re-extracting the same bytes is
  free (`cached: true`). Essential because officetowd re-syncs and the agent
  may re-run across sessions.
- **`hint`** — steer the model ("focus on invoice numbers and totals").
- **`model`** — `gemma4` (fast, most images) vs `kimi` (complex / document
  understanding).
- base64 inline ≤ ~5 MB; larger files go via R2.

---

## What Office Town has today

`files(action: 'convert')` → `env.AI.toMarkdown` only. Covers PDF, DOCX, XLSX,
PPTX, HTML, image-**OCR**, and audio-transcribe. Sources: `url | r2_path |
base64` (r2_path reads `env.FILES.get(key)`).

**Gaps vs mediabox:**
1. **Images get OCR, not description.** A brochure / site photo / product shot
   returns whatever text is in it — not "a timber cafe counter with green
   banquette seating". For non-text images that's near-useless as context.
2. **No video.** Not handled at all.
3. **No caching.** officetowd re-syncs inbox and the agent re-runs → re-pays
   the AI cost every time. For a big filing-cabinet dump processed over several
   sessions this matters.
4. **No async** for slow media — a long audio/video would block or time out.
5. **No auto-routing** — caller picks the path; fine, but a single `extract`
   that just-does-the-right-thing is friendlier for the agent.
6. **base64-through-MCP is awkward** — proven dogfooding: the agent tried
   `$(base64 -i file)` as an MCP arg (no shell expansion) and choked on the
   blob. Since inbox auto-syncs to R2, `r2_path` with key `inbox/<name>` is the
   clean path; base64 is only a small/unsynced fallback.

---

## Decision: extend the files MCP, don't fork a worker

Office Town is "one worker". The files MCP already has the `R2` + `AI`
bindings. Adding a vision path, a cache table, a jobs table, and (later) the
`MEDIA` binding is incremental — no second service to deploy, auth, or sync.
Goanna split mediabox out because it's a shared fleet service; Office Town is
self-contained, so in-worker is simpler.

---

## Plan, in value order

### Phase A — vision description for images  *(highest value, lowest risk)*
The real parity gap. When `extract` (or `convert`) receives an image, run a
vision model via the chat-completions `image_url` path with a
search-oriented prompt: subject, any visible text, document-vs-photo, key
details, suggested tags. Optional `hint`. Returns a descriptive markdown the
agent files as the entry body.
- Model: verify current best for description-that-also-captures-text against
  `~/.claude/rules/workers-ai-gotchas.md` (candidates: Llama 4 Scout, Gemma 4
  26B, Kimi). Mirror Goanna's fast/complex split (`model` param).
- Keep `toMarkdown` for clearly-textual docs; route images to vision. (Verify
  whether one vision call can replace OCR entirely — it usually captures
  visible text too, which would simplify to one path.)

### Phase B — result cache (D1)  *(makes the whole inbox flow economical)*
`sha256(bytes)` → cache row (`hash`, `kind`, `result_markdown`, `created`).
`extract` checks cache first → `cached: true`. Re-syncs and cross-session
re-runs become free. Small table, big payoff.

### Phase C — async jobs for audio + video  *(bigger; video can be its own milestone)*
- Jobs table (`job_id`, `status`, `result`, timestamps). `extract` returns a
  `job_id` for slow media; a `poll` action with `wait` blocks ≤ a cap.
- Audio: `toMarkdown` already transcribes — wire it through the async path for
  long files.
- Video: needs the `MEDIA` (Media Transformations) binding to pull frames
  server-side, then vision-describe key frames + transcribe the audio track →
  `visual_summary` + `transcript`. **Open question:** is Media Transformations
  enabled on the office-town worker's account/plan? (It is on goanna's.)

### Phase D — auto-routing + corrected agent guidance  *(woven through)*
- A single `extract` that routes by extension/mime so the agent calls one
  thing and gets the right handler.
- Fix the inbox guidance now (cheap, independent of A–C): **prefer `r2_path`
  with the synced key `inbox/<name>`**; base64 only for tiny/unsynced files;
  never `$(base64 …)` inside an MCP arg. Update `triage-inbox.yaml` + the
  AGENTS.md seed + re-seed (flag bump).

---

## Trigger model (unchanged from earlier decision)

Processing stays **agent-on-request or opt-in cron** — never silent auto, to
avoid surprise AI spend and processing private docs without a yes. The pipeline
is identical regardless of trigger; a `process-inbox` cron recipe just calls
the same `extract`.

## Where local Python still belongs

Only the genuinely ffmpeg-bound edges (exotic video containers, multi-GB media,
fully-offline use). Ships as an **optional `office-town-pack-media`**, never the
core — keeps the zero-friction install intact.

## Open questions for Jez

1. **Media Transformations** on the office-town account/plan — available? (gates
   Phase C video). If not, video defers to the optional Python pack.
2. **One vision call vs OCR+vision** — if a vision model reliably captures
   visible text too, collapse to a single image path. Needs a quick bake-off.
3. **Cache scope** — content-hash only, or also invalidate on model change?
   (Re-extract if we upgrade the vision model and want better descriptions.)

## Sequencing recommendation

Phase D guidance fix now (tiny, fixes the witnessed flail) → Phase A (vision,
the headline upgrade) → Phase B (cache) → Phase C (audio async, then video as a
separate milestone gated on Media Transformations availability).
