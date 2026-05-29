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
6. **Agents must never base64** — proven dogfooding: the agent tried
   `$(base64 -i file)` as an MCP arg (no shell expansion) and choked on the
   blob. The model to teach agents: files dropped in inbox/ sync to R2
   automatically (~10s); convert by `r2_path` key `inbox/<name>` from the cloud;
   if not-found, wait and retry. No base64, no raw-byte reads, no shelling out —
   patience + the sync. (Guidance already corrected in AGENTS.md seed + recipe.)

---

## Decision: extend the files MCP, don't fork a worker

Office Town is "one worker". The files MCP already has the `R2` + `AI`
bindings. Adding a vision path, a cache table, a jobs table, and (later) the
`MEDIA` binding is incremental — no second service to deploy, auth, or sync.
Goanna split mediabox out because it's a shared fleet service; Office Town is
self-contained, so in-worker is simpler.

---

## Plan, in value order

### Phase A — image description via a capable multimodal LLM  ✅ SHIPPED 2026-05-29
Live in files.convert: images → gemma4 (default) / kimi (`model` param), reads
text + describes in one call, `hint` steer, save-alongside sidecar. Verified on
a real business-card image. Below is the original spec.

The real parity gap. When `extract` (or `convert`) receives an image, run a
**general multimodal LLM** via the chat-completions `image_url` path with a
search-oriented prompt: subject, any visible text, document-vs-photo, key
details, suggested tags. Optional `hint`. Returns descriptive markdown the
agent files as the entry body.
- **Do NOT use the dedicated vision-specific models** (llama-3.2-vision, LLaVA,
  uform) — they're weak. Use general multimodal chat models, mirroring Goanna's
  fast/complex split via a `model` param: **Gemma 4** (`@cf/google/gemma-4-26b-a4b-it`,
  fast default) and **Kimi 2.6** (`@cf/moonshotai/kimi-k2.6`, complex / document
  understanding). Qwen 3.x multimodal is a candidate too. Verify the exact live
  `@cf/` IDs + vision capability at build time (per workers-ai-gotchas: the
  `capabilities.vision` flag is stale for several — trust the docs/bake-off, not
  the flag).
- A capable multimodal model captures visible text *and* describes the image in
  one call, so it can replace OCR for images entirely — collapse to one image
  path rather than OCR-then-maybe-describe. Confirm in a quick bake-off.

### Phase B — result cache (D1)  ✅ SHIPPED 2026-05-29
Live: convert_cache keyed by sha256(bytes)+variant(model+hint). Verified 6s miss -> 0s hit. Below is the original spec.

`sha256(bytes)` → cache row (`hash`, `kind`, `result_markdown`, `created`).
`extract` checks cache first → `cached: true`. Re-syncs and cross-session
re-runs become free. Small table, big payoff.

### Phase C — audio + video  ✅ VIDEO v1 SHIPPED 2026-05-29
Live: MEDIA binding enabled (env.MEDIA, open beta). convert handles video —
extracts a frame (gemma4 description) + audio track (whisper transcript),
combined, cached, sidecar-saved. Verified on a real mp4.

REMAINING in Phase C:
- **Spritesheet for full temporal coverage** — gemma4 handles ~1min / 60 frames,
  so a spritesheet (grid of frames) in one vision call beats the single frame.
  Pending: confirm the binding's spritesheet param shape (rows/cols/interval).
- **Async jobs for long media** — current path is synchronous in the convert
  request; fine for short clips, will time out on long video. Jobs table +
  poll action when needed.
- **Standalone audio files** (mp3/m4a/wav) currently route to toMarkdown; could
  route to whisper directly for consistency.

Original spec below.
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

## Where outputs live — keep the converted text alongside the original

Goanna kept converted markdown beside the original; Office Town currently
discards it (convert → extract entities → move original to `inbox/_processed/`,
markdown thrown away). Fix: persist **both** the original and its converted
markdown, and treat extraction as a third, separate layer.

**The sidecar rule is location-agnostic:** the converted markdown lives next to
the original, *wherever the original is*. `<any-dir>/<name>.<ext>` →
`<any-dir>/<name>.md`. A file can be anywhere in the cortex — dropped in
`inbox/`, placed by the user directly in `wiki/projects/foo/`, a folder of
scanned contracts under `files/`, or anything they point the agent at. Don't
assume `attachments/`.

Two outputs per document, three artifacts:

| Artifact | Where |
|---|---|
| Original file (PDF/image/audio) — source of truth | wherever it already is, or wherever the agent files it |
| Converted markdown — the readable doc (sidecar) | **always** beside the original: same dir, `<name>.md` |
| Extracted entities — structured knowledge | wiki entries (orgs/contacts/projects/decisions) |

`attachments/` and `files/archive/` are just *conventions for where the agent
files things it's actively organising* — when a document clearly belongs to an
entity, the agent moves it (+ sidecar) into that entity's `attachments/` so it
shows in the dashboard companion-files view and links from the entry. But
conversion + sidecar work on **any** file in **any** folder, including ones the
human dropped directly while editing locally. The agent leaves a file where the
owner put it unless there's a reason to move it.

Benefits:
- The document's content stays readable as markdown without re-converting.
- The original is preserved (audits, "show me the actual invoice").
- Re-reading later never re-runs OCR/vision (separate from the D1 compute-cache).
- Works for the human-first workflow: someone organising files in Finder/Obsidian
  gets readable sidecars next to whatever they filed, without an agent involved.

Implementation: `convert` already supports `save_to_files` — the sidecar path is
just `dirname(key) + '/' + basename + '.md'`, computed from the original's key.
The recipe uses it for inbox processing; the same action serves "convert this
file I pointed you at, wherever it lives".

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
2. ~~One vision call vs OCR+vision~~ — RESOLVED: use one multimodal-LLM call
   (captures text + describes). No dedicated vision models. Bake off Gemma 4 vs
   Kimi 2.6 for quality/speed only.
3. **Cache scope** — content-hash only, or also invalidate on model change?
   (Re-extract if we upgrade the vision model and want better descriptions.)

## Sequencing recommendation

Phase D guidance fix now (tiny, fixes the witnessed flail) → Phase A (vision,
the headline upgrade) → Phase B (cache) → Phase C (audio async, then video as a
separate milestone gated on Media Transformations availability).
