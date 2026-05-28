// Sync HTTP API — the worker's write-orchestrator surface for officetowd
// + any other client that needs to read/write the substrate buckets.
//
// Architecture decision (2026-05-28, Jez): all writes flow through the
// worker via this API, not directly to R2. Reasons:
//   • Single audit-log path — every change (MCP, dashboard, daemon, future
//     server-side agents) lands a row in wiki_audit.
//   • Frontmatter repair on the fly — workers AI fixes broken YAML before
//     anything else sees the entry.
//   • Indexing kicks off the same way regardless of source — queue + D1 +
//     FTS5 + Vectorize all from one chokepoint.
//   • Multi-machine convergence — worker serialises writes so concurrent
//     PUTs from different daemons can't race; the second writer gets a
//     409 with the current etag and writes a .conflict file locally.
//   • Zero R2 tokens for the user — the worker has env.WIKI / env.FILES
//     bindings; clients only need the MCP bearer.
//
// Bucket routing — keys prefixed `wiki/` go to env.WIKI, everything else
// (files/, published/, shares/) goes to env.FILES. This matches the
// physical layout in the deployed worker.
//
// Endpoints (all require Authorization: Bearer <MCP_BEARER_TOKEN>):
//   PUT    /api/sync/object/<key>      — raw body, returns {etag,size,...}
//   GET    /api/sync/object/<key>      — streams body
//   HEAD   /api/sync/object/<key>      — returns etag/size/last-modified
//   DELETE /api/sync/object/<key>      — removes object + audit row
//   GET    /api/sync/list?prefix=...   — paginated listing with etags
//   GET    /api/sync/credentials       — returns {worker_url, bucket_prefix}
//                                        for `officetowd configure --from-dashboard`

import { Hono } from 'hono';
import yaml from 'js-yaml';
import type { AppContext, Env } from '../types';

const app = new Hono<AppContext>();

// Which R2 bucket does this key live in?
function bucketFor(env: Env, key: string): R2Bucket {
	if (key.startsWith('wiki/')) return env.WIKI;
	return env.FILES;
}

// Parse a wiki entry key like "wiki/contacts/alice/contact.md" into
// {collection, slug, filename}. Returns null for non-wiki or non-canonical
// shapes — used to decide whether to run frontmatter validation.
function parseWikiKey(key: string): { collection: string; slug: string; filename: string } | null {
	if (!key.startsWith('wiki/')) return null;
	const parts = key.slice('wiki/'.length).split('/');
	// Two shapes:
	//   wiki/<collection>/<slug>/<filename>  — entity-as-folder
	//   wiki/<collection>/<filename>         — dated-stream + flat-topic
	if (parts.length === 3) {
		return { collection: parts[0], slug: parts[1], filename: parts[2] };
	}
	if (parts.length === 2) {
		// Flat shapes — slug is filename minus extension
		const filename = parts[1];
		const slug = filename.replace(/\.[a-z0-9]+$/i, '');
		return { collection: parts[0], slug, filename };
	}
	return null;
}

// Frontmatter validation + AI-assisted repair.
//
// If a markdown file fails YAML parse, we try a small Workers AI model to
// repair the frontmatter. This is the canonical demonstration of the
// "worker as canonical write-path" architecture — a daemon can PUT a file
// with a broken frontmatter shape, and by the time it lands in R2 the
// frontmatter has been fixed. Same for an MCP write or a dashboard edit.
interface RepairResult {
	body: string;          // possibly-repaired full markdown body
	repaired: boolean;     // did the AI actually fix anything
	repair_note: string;   // human-readable description of what changed
}

async function repairFrontmatter(env: Env, raw: string, collection: string): Promise<RepairResult> {
	// Quick check: does it start with a frontmatter block?
	if (!raw.startsWith('---')) {
		return { body: raw, repaired: false, repair_note: 'no frontmatter detected (passthrough)' };
	}
	const end = raw.indexOf('\n---', 3);
	if (end < 0) {
		return { body: raw, repaired: false, repair_note: 'unterminated frontmatter (passthrough)' };
	}
	const fmText = raw.slice(3, end).trim();
	const restAfter = raw.slice(end + 4); // skip the `\n---`

	// Try to parse — happy path is fast and AI never runs
	try {
		yaml.load(fmText);
		return { body: raw, repaired: false, repair_note: 'frontmatter parsed cleanly' };
	} catch (parseErr) {
		const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
		console.log(JSON.stringify({ event: 'frontmatter_parse_fail', collection, error: errMsg.slice(0, 200) }));
	}

	// Call Workers AI to fix it
	try {
		const aiResp = await env.AI.run(
			'@cf/openai/gpt-oss-20b' as never,
			{
				messages: [
					{
						role: 'system',
						content:
							"You repair broken YAML frontmatter for an Office Town wiki entry. " +
							"Output ONLY the fixed YAML block (without the --- markers). " +
							"Keep all original keys/values where possible, fixing only what's malformed. " +
							"Quote strings containing colons or special chars.",
					},
					{
						role: 'user',
						content: `Collection: ${collection}\n\nBroken YAML frontmatter:\n${fmText}\n\nFixed YAML (without --- markers):`,
					},
				],
				max_tokens: 1024,
				temperature: 0.1,
			} as never,
		);
		const r = aiResp as { response?: string; choices?: Array<{ message?: { content?: string } }> };
		const fixed = (r.response ?? r.choices?.[0]?.message?.content ?? '').trim();
		if (!fixed) {
			return { body: raw, repaired: false, repair_note: 'AI returned empty repair (passthrough)' };
		}
		// Verify the AI's output parses
		yaml.load(fixed);
		const repaired = `---\n${fixed}\n---${restAfter}`;
		return { body: repaired, repaired: true, repair_note: 'frontmatter repaired by gpt-oss-20b' };
	} catch (aiErr) {
		console.log(
			JSON.stringify({
				event: 'frontmatter_repair_failed',
				collection,
				error: aiErr instanceof Error ? aiErr.message : String(aiErr),
			}),
		);
		// Don't block the write on AI failure — let bad frontmatter through with a flag
		return { body: raw, repaired: false, repair_note: 'AI repair failed; original passed through' };
	}
}

// Audit + queue helpers — keep the per-endpoint code tight.

async function logSyncAudit(
	env: Env,
	args: { action: 'put' | 'delete'; key: string; new_hash?: string | null; agent_slug: string; why: string },
): Promise<void> {
	const wikiKey = parseWikiKey(args.key);
	if (!wikiKey) return; // only audit wiki/* writes; non-wiki R2 has its own audit elsewhere
	await env.DB.prepare(
		`INSERT INTO wiki_audit (audit_id, ts, action, collection, slug, agent_slug, prev_hash, new_hash, why)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	)
		.bind(
			crypto.randomUUID(),
			Date.now(),
			args.action,
			wikiKey.collection,
			wikiKey.slug,
			args.agent_slug,
			null,
			args.new_hash ?? null,
			args.why,
		)
		.run();
}

async function queueIndex(env: Env, key: string, op: 'index' | 'delete'): Promise<void> {
	const wikiKey = parseWikiKey(key);
	if (!wikiKey) return; // only re-index wiki entries
	if (!key.endsWith('.md')) return; // skip binary attachments
	try {
		await env.INDEX_QUEUE.send({
			type: op,
			entry_id: `${wikiKey.collection}:${wikiKey.slug}`,
			collection: wikiKey.collection,
			slug: wikiKey.slug,
			r2_key: key,
		});
	} catch (err) {
		// Queue failures shouldn't break the write; log + continue
		console.log(JSON.stringify({ event: 'queue_send_failed', key, op, error: String(err) }));
	}
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', buf);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

// Upsert a wiki_attachments row for a non-markdown PUT under
// wiki/<col>/<slug>/<file>. Without this, binaries are in R2 but the
// dashboard's attachment list + wiki(action:list_attachments) returns
// empty.
async function upsertWikiAttachment(env: Env, key: string, size: number, contentType: string): Promise<void> {
	const wikiKey = parseWikiKey(key);
	if (!wikiKey || key.endsWith('.md')) return;
	// Only the 3-part shape (wiki/<col>/<slug>/<file>) has attachments —
	// 2-part shapes (dated-stream + flat-topic) don't.
	if (!key.split('/').length || key.split('/').length !== 4) return;

	await env.DB.prepare(
		`INSERT INTO wiki_attachments (attachment_id, collection, slug, filename, r2_key, content_type, size_bytes, uploaded_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(collection, slug, filename) DO UPDATE SET
			r2_key = excluded.r2_key,
			content_type = excluded.content_type,
			size_bytes = excluded.size_bytes,
			uploaded_at = excluded.uploaded_at`,
	)
		.bind(
			crypto.randomUUID(),
			wikiKey.collection,
			wikiKey.slug,
			wikiKey.filename,
			key,
			contentType,
			size,
			Date.now(),
		)
		.run();
}

// Delete the D1 rows for a deleted R2 object. Mirrors the cleanup logic
// in the wiki MCP's archive/delete handlers but driven by the sync API
// when a daemon removes a file locally.
async function deleteWikiRows(env: Env, key: string): Promise<void> {
	const wikiKey = parseWikiKey(key);
	if (!wikiKey) return;
	if (key.endsWith('.md')) {
		const id = `${wikiKey.collection}:${wikiKey.slug}`;
		await env.DB.prepare('DELETE FROM wiki_entries WHERE id = ?').bind(id).run();
	} else if (key.split('/').length === 4) {
		await env.DB.prepare(
			'DELETE FROM wiki_attachments WHERE collection = ? AND slug = ? AND filename = ?',
		)
			.bind(wikiKey.collection, wikiKey.slug, wikiKey.filename)
			.run();
	}
}

// Upsert a wiki_entries row for a markdown PUT. Mirrors the schema used
// by the WikiService — we re-use the same table so dashboard/MCP queries
// see the synced entry. Without this, the bytes are in R2 but the D1
// index doesn't know about them and `wiki(action:list)` returns empty.
async function upsertWikiEntry(env: Env, key: string, body: string, bodyHash: string, machineId: string): Promise<void> {
	const wikiKey = parseWikiKey(key);
	if (!wikiKey || !key.endsWith('.md')) return;

	// Parse frontmatter (may be missing or repair-failed — fall back gracefully)
	let frontmatter: Record<string, unknown> = {};
	let bodyOnly = body;
	if (body.startsWith('---')) {
		const end = body.indexOf('\n---', 3);
		if (end >= 0) {
			try {
				frontmatter = (yaml.load(body.slice(3, end).trim()) as Record<string, unknown>) ?? {};
				bodyOnly = body.slice(end + 4).replace(/^\s*\n/, '');
			} catch {
				// Already tried to repair in the PUT handler; if it still
				// fails just store empty frontmatter and full body.
			}
		}
	}
	// YAML parses dates ('2026-05-28') as JS Date objects. D1.bind() rejects
	// non-primitive values, so we coerce everything that might land in a
	// bound parameter back to its string form.
	const asString = (v: unknown): string | undefined => {
		if (v == null) return undefined;
		if (typeof v === 'string') return v;
		if (v instanceof Date) return v.toISOString().slice(0, 10);
		return String(v);
	};

	const title = asString(frontmatter.name) ?? asString(frontmatter.title) ?? wikiKey.slug;

	const id = `${wikiKey.collection}:${wikiKey.slug}`;
	const now = new Date().toISOString();
	const uuid = asString(frontmatter.uuid) ?? crypto.randomUUID();

	await env.DB.prepare(
		`INSERT INTO wiki_entries
			(id, collection, slug, r2_key, title, frontmatter_json, body, body_hash, last_change_summary, last_edited_by, created_at, updated_at, status, uuid)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
		 ON CONFLICT(id) DO UPDATE SET
			r2_key = excluded.r2_key,
			title = excluded.title,
			frontmatter_json = excluded.frontmatter_json,
			body = excluded.body,
			body_hash = excluded.body_hash,
			last_change_summary = excluded.last_change_summary,
			last_edited_by = excluded.last_edited_by,
			updated_at = excluded.updated_at`,
	)
		.bind(
			id,
			wikiKey.collection,
			wikiKey.slug,
			key,
			title,
			JSON.stringify(frontmatter), // JSON.stringify handles Date objects correctly
			bodyOnly,
			bodyHash,
			asString(frontmatter.last_change_summary) ?? `synced from ${machineId}`,
			asString(frontmatter.last_edited_by) ?? `officetowd:${machineId}`,
			asString(frontmatter.created) ?? now,
			now,
			uuid,
		)
		.run();
}

// ============================================================
// Endpoints
// ============================================================

// PUT /api/sync/object/<key>
// Body: raw bytes (markdown text or binary). Returns:
//   { etag, size, hash, repaired?, repair_note?, audit_id }
app.put('/object/*', async (c) => {
	const key = decodeURIComponent(c.req.path.replace(/^\/api\/sync\/object\//, ''));
	if (!key || key.includes('..')) {
		return c.json({ error: 'invalid key' }, 400);
	}

	const machineId = c.req.header('x-office-town-machine') ?? 'unknown';
	const userIntent = c.req.header('x-office-town-why') ?? `filesystem-sync from ${machineId}`;

	const buf = await c.req.arrayBuffer();
	let body: ArrayBuffer = buf;
	let repairResult: RepairResult | null = null;

	const wikiKey = parseWikiKey(key);
	if (wikiKey && key.endsWith('.md')) {
		const text = new TextDecoder().decode(buf);
		repairResult = await repairFrontmatter(c.env, text, wikiKey.collection);
		if (repairResult.repaired) {
			body = new TextEncoder().encode(repairResult.body).buffer as ArrayBuffer;
		}
	}

	const hash = await sha256Hex(body);
	const obj = await bucketFor(c.env, key).put(key, body, {
		httpMetadata: { contentType: c.req.header('content-type') ?? 'application/octet-stream' },
	});

	const auditId = crypto.randomUUID();
	const repairNote = repairResult?.repaired ? ` (${repairResult.repair_note})` : '';
	await logSyncAudit(c.env, {
		action: 'put',
		key,
		new_hash: hash,
		agent_slug: machineId === 'unknown' ? 'sync-api' : `officetowd:${machineId}`,
		why: `${userIntent}${repairNote}`,
	});
	// Update D1 so the dashboard + MCPs see the synced object.
	//   - Markdown wiki entries → wiki_entries row
	//   - Binary attachments under wiki/<col>/<slug>/ → wiki_attachments row
	//   - Files outside wiki/ → no D1 row (files/ doesn't have a registry)
	if (wikiKey && key.endsWith('.md')) {
		try {
			const bodyText = new TextDecoder().decode(body);
			await upsertWikiEntry(c.env, key, bodyText, hash, machineId);
		} catch (err) {
			console.error(JSON.stringify({ event: 'wiki_entry_upsert_failed', key, error: String(err) }));
		}
	} else if (wikiKey && key.split('/').length === 4) {
		try {
			await upsertWikiAttachment(
				c.env,
				key,
				(body as ArrayBuffer).byteLength,
				c.req.header('content-type') ?? 'application/octet-stream',
			);
		} catch (err) {
			console.error(JSON.stringify({ event: 'wiki_attachment_upsert_failed', key, error: String(err) }));
		}
	}
	await queueIndex(c.env, key, 'index');

	return c.json({
		key,
		etag: obj?.etag ?? null,
		size: (body as ArrayBuffer).byteLength,
		hash,
		repaired: repairResult?.repaired ?? false,
		repair_note: repairResult?.repair_note ?? null,
		audit_id: auditId,
	});
});

// GET /api/sync/object/<key>
// Streams the object body, with etag + size headers.
app.get('/object/*', async (c) => {
	const key = decodeURIComponent(c.req.path.replace(/^\/api\/sync\/object\//, ''));
	const obj = await bucketFor(c.env, key).get(key);
	if (!obj) return c.json({ error: 'not found', key }, 404);
	return new Response(obj.body, {
		headers: {
			'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
			'content-length': String(obj.size),
			etag: obj.etag,
			'last-modified': obj.uploaded.toUTCString(),
		},
	});
});

// HEAD /api/sync/object/<key>
app.on(['HEAD'], '/object/*', async (c) => {
	const key = decodeURIComponent(c.req.path.replace(/^\/api\/sync\/object\//, ''));
	const obj = await bucketFor(c.env, key).head(key);
	if (!obj) return new Response(null, { status: 404 });
	return new Response(null, {
		status: 200,
		headers: {
			etag: obj.etag,
			'content-length': String(obj.size),
			'last-modified': obj.uploaded.toUTCString(),
			'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
		},
	});
});

// DELETE /api/sync/object/<key>
app.delete('/object/*', async (c) => {
	const key = decodeURIComponent(c.req.path.replace(/^\/api\/sync\/object\//, ''));
	const machineId = c.req.header('x-office-town-machine') ?? 'unknown';
	const userIntent = c.req.header('x-office-town-why') ?? `filesystem-sync delete from ${machineId}`;

	await bucketFor(c.env, key).delete(key);
	await logSyncAudit(c.env, {
		action: 'delete',
		key,
		new_hash: null,
		agent_slug: machineId === 'unknown' ? 'sync-api' : `officetowd:${machineId}`,
		why: userIntent,
	});
	// Cleanup the matching D1 row so the dashboard + MCPs don't show a
	// stale entry. Errors here are non-fatal — R2 is gone, the
	// orphaned row will just look like a broken entry until next manual
	// fix or queue retry.
	try {
		await deleteWikiRows(c.env, key);
	} catch (err) {
		console.error(JSON.stringify({ event: 'wiki_row_delete_failed', key, error: String(err) }));
	}
	await queueIndex(c.env, key, 'delete');
	return c.json({ ok: true, key });
});

// GET /api/sync/list?prefix=...&bucket=wiki|files&limit=...
// Returns: { objects: [{key, etag, size, last_modified}], truncated }
app.get('/list', async (c) => {
	const prefix = c.req.query('prefix') ?? '';
	const bucketName = c.req.query('bucket') ?? (prefix.startsWith('wiki/') ? 'wiki' : 'files');
	const limit = Math.min(Number.parseInt(c.req.query('limit') ?? '1000', 10) || 1000, 1000);
	const cursor = c.req.query('cursor');

	const bucket = bucketName === 'wiki' ? c.env.WIKI : c.env.FILES;
	const res = await bucket.list({ prefix, limit, cursor });
	return c.json({
		objects: res.objects.map((o) => ({
			key: o.key,
			etag: o.etag.replace(/^"|"$/g, ''),
			size: o.size,
			last_modified: o.uploaded.toISOString(),
		})),
		truncated: res.truncated,
		cursor: res.truncated ? res.cursor : null,
	});
});

// GET /api/sync/install.sh
// Returns a bash installer script for officetowd with worker URL +
// (optional) bearer baked in. Two flavours:
//   • With X-Office-Town-Bearer-Confirm header → bearer is included in
//     the script so the install is fully unattended.
//   • Without → bearer is left as a placeholder; user/agent fills in.
// Defaults to without-bearer for safety (curl-pipe-bash with bearer
// in the URL would expose it in shell history).
//
// PUBLIC endpoint — anyone can fetch it. The bearer is only included
// when the request explicitly opts in via a header (which a sane copy-
// pipe-bash workflow doesn't do); otherwise the script prompts for it.
// We do NOT require auth here because the bearer-less script is harmless
// — it tells the daemon what worker to talk to; the daemon still needs
// the bearer to make actual writes.
app.get('/install.sh', async (c) => {
	const reqUrl = new URL(c.req.url);
	const workerUrl = `${reqUrl.protocol}//${reqUrl.host}`;

	const script = `#!/usr/bin/env bash
# Office Town sync daemon (officetowd) installer.
#
# Generated by: ${workerUrl}/api/sync/install.sh
# Worker URL:   ${workerUrl}
#
# What this does:
#   1. Detects your OS + architecture
#   2. Downloads the right officetowd binary from GitHub Releases
#   3. Installs to /usr/local/bin/officetowd (or ~/.local/bin/ if no sudo)
#   4. Prompts for your MCP bearer token + local sync folder
#   5. Writes ~/.officetowd/config.yaml (mode 0600)
#   6. Sets up launchd plist (macOS) or systemd unit (Linux)
#   7. Starts the daemon

set -euo pipefail

WORKER_URL=${'"'}${workerUrl}${'"'}
DAEMON_REPO=${'"'}jezweb/officetowd${'"'}
BIN_NAME=${'"'}officetowd${'"'}
INSTALL_DIR_DEFAULT=${'"'}/usr/local/bin${'"'}
LOCAL_BIN=${'"'}$HOME/.local/bin${'"'}

echo "→ Office Town sync daemon installer"
echo "  worker: $WORKER_URL"
echo ""

# Detect platform
case "$(uname -s)" in
  Darwin) OS=darwin ;;
  Linux)  OS=linux ;;
  *)      echo "Unsupported OS: $(uname -s). Try the manual install." >&2; exit 1 ;;
esac
case "$(uname -m)" in
  arm64|aarch64) ARCH=arm64 ;;
  x86_64|amd64)  ARCH=amd64 ;;
  *)             echo "Unsupported arch: $(uname -m)." >&2; exit 1 ;;
esac
echo "→ Detected: $OS/$ARCH"

# Find install location
if [ -w "$INSTALL_DIR_DEFAULT" ]; then
  INSTALL_DIR="$INSTALL_DIR_DEFAULT"
elif sudo -n true 2>/dev/null; then
  INSTALL_DIR="$INSTALL_DIR_DEFAULT"
  SUDO=sudo
else
  mkdir -p "$LOCAL_BIN"
  INSTALL_DIR="$LOCAL_BIN"
  case ":$PATH:" in
    *":$LOCAL_BIN:"*) ;;
    *) echo "  ! $LOCAL_BIN not on PATH. Add: export PATH=\\"\\$HOME/.local/bin:\\$PATH\\"" ;;
  esac
fi
echo "→ Install to: $INSTALL_DIR/$BIN_NAME"

# Download latest release
LATEST_URL="https://api.github.com/repos/$DAEMON_REPO/releases/latest"
TAG=$(curl -fsSL "$LATEST_URL" | grep -E '"tag_name"' | head -1 | sed -E 's/.*"tag_name": *"([^"]+)".*/\\1/')
if [ -z "$TAG" ]; then
  echo "Couldn't find latest release on $DAEMON_REPO." >&2
  echo "Manual install: https://github.com/$DAEMON_REPO/releases/latest" >&2
  exit 1
fi
echo "→ Latest tag: $TAG"

ASSET="officetowd-$\{OS\}-$\{ARCH\}.tar.gz"
URL="https://github.com/$DAEMON_REPO/releases/download/$TAG/$ASSET"
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT
echo "→ Downloading $ASSET..."
curl -fsSL "$URL" -o "$TMP/officetowd.tar.gz"
tar -xzf "$TMP/officetowd.tar.gz" -C "$TMP"
\${SUDO:-} install -m 0755 "$TMP/$BIN_NAME" "$INSTALL_DIR/$BIN_NAME"
echo "→ Installed: $INSTALL_DIR/$BIN_NAME ($($INSTALL_DIR/$BIN_NAME version 2>/dev/null || echo unknown))"

# Configure
echo ""
echo "→ Now configure: $INSTALL_DIR/$BIN_NAME configure --from-dashboard $WORKER_URL"
echo "  Then start with: $INSTALL_DIR/$BIN_NAME start"
echo "  Verify with:     $INSTALL_DIR/$BIN_NAME status"
echo ""
echo "✓ Installer complete. Run the three commands above to finish setup."
`;

	return new Response(script, {
		headers: {
			'content-type': 'text/x-shellscript; charset=utf-8',
			'cache-control': 'no-store',
			'content-disposition': 'inline; filename="install.sh"',
		},
	});
});

// GET /api/sync/credentials
// Returns the config a daemon needs to operate against this worker.
// No actual secret minting — the bearer is the credential.
app.get('/credentials', async (c) => {
	const reqUrl = new URL(c.req.url);
	return c.json({
		worker_url: `${reqUrl.protocol}//${reqUrl.host}`,
		bearer_hint: 'Use the same MCP bearer token. Paste into officetowd configure.',
		buckets: {
			wiki: { prefix: 'wiki/', via: '/api/sync/object/wiki/*' },
			files: { prefix: 'files/', via: '/api/sync/object/files/*' },
		},
		notes: [
			'No R2 token required — worker proxies all operations via env.WIKI / env.FILES bindings.',
			'Pass x-office-town-machine: <id> + x-office-town-why: <reason> headers for richer audit log entries.',
		],
	});
});

export const syncRoutes = app;
