# M6 design docs — voice, sandbox, search

The three M6 extensions that need genuine build effort beyond a thin MCP wrapper. This doc captures the design so they can be picked up in a focused session.

## 1. Voice MCP (`packages/mcp-voice`)

### Goal

"Phone the librarian" — the founder talks to an Office Town agent over WebRTC. Voice in, voice out, real-time. Demo moment for v1.1.

### Architecture

```
Browser (WebRTC) <---> Worker (signalling + audio bridge)
                              |
                              v
                      Cloudflare Realtime (TURN + low-latency relay)
                              |
                              v
                  Audio frames -> Workers AI Nova-3 (STT) -> text
                  Text response <- LLM (per Goose provider chain)
                  Text -> Workers AI Aura-2 (TTS) -> audio frames
                              |
                              v
                  Worker streams audio back to browser
```

### Components

| Component | Tech | Notes |
|---|---|---|
| WebRTC signalling | Worker + Durable Object | DO holds peer state; pure Workers can't because each request is fresh |
| STT | Workers AI `@cf/deepgram/nova-3` | Requires webm-opus per `workers-ai-gotchas.md`. Browser MediaRecorder native. |
| LLM | Configured Goose provider (Anthropic/OpenAI/Workers AI) | Reuse existing config |
| TTS | Workers AI `@cf/deepgram/aura-2-en` | Strip `-en` suffix when calling via binding |
| Transport | Cloudflare Realtime | Provides STUN + TURN |

### Phases

1. **WebRTC connection establishment** — DO-backed signalling, one-shot ICE exchange
2. **Audio-in → STT → text** — verify Nova-3 picks up speech reliably
3. **Text → LLM → text** — same model the agent normally uses
4. **Text → TTS → audio-out** — Aura-2; pick a voice that matches the agent's persona
5. **Interruption handling** — user starts talking while agent is talking; cut TTS, route new input
6. **Multi-agent routing** — `@librarian` vs `@worker` etc. selectable from the call UI
7. **Call recording → wiki/research/** — optional transcript filing with kind:voice-call

### Open questions

- Latency budget: realistic <1.5s end-to-end on a residential connection?
- Cost per minute (Realtime + AI STT + LLM + TTS): need a target cost ceiling
- Demo UX: phone-call shape vs walkie-talkie (push-to-talk)?

### Effort

2-3 days (per BUILD-SPEC). Probably the highest-risk M6 item — WebRTC + DO + audio is fiddly.

---

## 2. Sandbox MCP (`packages/mcp-sandbox`)

### Goal

Workers can't run arbitrary user code (Python, Bash, etc.). Cloudflare Containers provides a Docker-style sandbox. The sandbox MCP gives agents a tool to "run this Python in a sandbox and return the result".

### Architecture

```
Agent calls sandbox.run(language: "python", code: "...", inputs: {...})
                              |
                              v
                  Worker (MCP) -> Cloudflare Containers API
                              |
                              v
                      Container spins up, runs code
                              |
                              v
                  Returns stdout + stderr + exit code + files
```

### Components

| Component | Notes |
|---|---|
| Container images | Pre-built images per language: python:3.12-slim, node:22-slim, rust:1.78-slim |
| Container API | Cloudflare Containers REST API |
| Volume mounting | Optional R2 bucket mount for input files / output artefacts |
| Resource limits | CPU/memory/duration caps; default 30s + 512MB |

### Tools

- `sandbox.run` — run code, return result
- `sandbox.with_files` — run with input files from R2/FILES, write outputs back
- `sandbox.persistent` — start a persistent container for multi-step interactive work
- `sandbox.stop` — explicit stop

### Phases

1. Single language (Python), single run, return stdout
2. Multi-language (Python + Node + Bash)
3. File mounting (input + output via FILES bucket)
4. Persistent containers
5. Cost + abuse guards (per-tenant quotas, output truncation)

### Effort

1 day. Cloudflare Containers does the heavy lifting; this is a thin shim.

---

## 3. Search MCP (`packages/mcp-search`)

### Goal

Two paths to search the wiki: (1) DIY (FTS5 + Vectorize, already built in core), (2) Cloudflare AI Search (managed). MCP layer hides the choice; users can switch backends without changing agent code.

### Why a separate MCP

The wiki MCP exposes `wiki.search` over the DIY path. The Search MCP wraps it AND offers AI Search as an alternative backend, plus *generic* search (not just wiki — files, published pages, external sources too).

### Architecture

```
Agent calls search.query(text, scope: "wiki" | "files" | "published" | "all")
                              |
                              v
              MCP routes to configured backend:
              - DIY (FTS5 + Vectorize via core worker) — default
              - AI Search (managed) — if AI_SEARCH_INDEX_ID set
                              |
                              v
                      Returns triage-shape hits
```

### Tools

- `search.query` — search across configured scopes
- `search.index` — explicit index of a content source (e.g. an external URL)
- `search.benchmark` — A/B compare DIY vs AI Search on a set of queries

### Phases

1. Pass-through to wiki.search (DIY only)
2. Add AI Search as alternative backend (if available)
3. Add cross-scope search (wiki + files + published)
4. Add external source indexing (e.g. point at a blog URL, periodically re-index)
5. Benchmark tool: run a query set against both, return quality + latency + cost comparison

### Decision: DIY vs AI Search

Per SHIP-PLAN, the call is made 90 days after M3. Run the benchmark tool, see which wins on quality + cost.

### Effort

1-2 days. Pass-through is half a day; AI Search integration depends on whether the managed product has shipped GA pricing by then.

---

## Status

These three are deferred from M6 v1.1 launch. They're documented here so a future session (or contributor) can pick them up.

Currently deployed M6 extensions:
- ✅ `mcp-browser` — Cloudflare Browser Rendering (fetch, screenshot, extract)
- ✅ `mcp-devops` — Cloudflare API wrapper (read-only by default)
- ✅ `mcp-email` — Outbound via SMTP2Go (per smtp2go.md rule)

Still drafts (need build + deploy):
- `mcp-voice` (this doc)
- `mcp-sandbox` (this doc)
- `mcp-search` (this doc)
