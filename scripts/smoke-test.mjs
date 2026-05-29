#!/usr/bin/env node
// Office Town smoke suite — exercises the live worker's MCP + dashboard surface
// and asserts. Run after every deploy so a regression in wiki CRUD, files,
// search, auth, or the installer endpoint is caught before a user hits it.
//
// Usage:
//   WORKER_URL='https://office-town.jezweb.workers.dev' MCP_BEARER='<token>' \
//     node scripts/smoke-test.mjs [--write]
//
//   --write  also runs the wiki create→search→read→delete round-trip (creates
//            and cleans up a namespaced smoke-test entry). Without it the run is
//            read-only + an isolated files round-trip, safe against production.
//
// Exit code: 0 if all checks pass, 1 if any fail, 2 on bad invocation.

const WORKER_URL = (process.env.WORKER_URL || '').replace(/\/$/, '');
const BEARER = process.env.MCP_BEARER || '';
const WRITE = process.argv.includes('--write');

if (!WORKER_URL || !BEARER) {
	console.error('Set WORKER_URL and MCP_BEARER env vars.');
	console.error("e.g. WORKER_URL='https://office-town.jezweb.workers.dev' MCP_BEARER='…' node scripts/smoke-test.mjs");
	process.exit(2);
}

let passed = 0;
let failed = 0;

function assert(cond, msg) {
	if (!cond) throw new Error(msg);
}

async function check(name, fn) {
	try {
		await fn();
		passed++;
		console.log(`  ✓ ${name}`);
	} catch (err) {
		failed++;
		console.error(`  ✗ ${name} — ${err.message}`);
	}
}

async function rpc(server, method, params, bearer = BEARER) {
	const r = await fetch(`${WORKER_URL}/mcp/${server}`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
	});
	assert(r.ok, `${server} ${method} HTTP ${r.status}`);
	const j = await r.json();
	assert(!j.error, `${server} ${method} error: ${JSON.stringify(j.error)}`);
	return j.result;
}

// tools/call returns { content: [{ type:'text', text }] }; the text is JSON.
async function callTool(server, name, args) {
	const res = await rpc(server, 'tools/call', { name, arguments: args });
	const text = res?.content?.[0]?.text;
	assert(text != null, `${server}.${name} returned no content`);
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

const SERVERS = ['wiki', 'files', 'email', 'cron', 'voice', 'sandbox'];

console.log(`\nOffice Town smoke suite → ${WORKER_URL}  (${WRITE ? 'write' : 'read-only'})\n`);

// 1. Every MCP server is up and advertises tools.
console.log('MCP servers:');
for (const s of SERVERS) {
	await check(`mcp/${s} tools/list`, async () => {
		const r = await rpc(s, 'tools/list');
		assert(Array.isArray(r.tools) && r.tools.length > 0, 'no tools advertised');
	});
}

// 2. Auth actually rejects a wrong token (not just accepts the right one).
console.log('\nAuth:');
await check('mcp/wiki rejects a bad bearer (401)', async () => {
	const r = await fetch(`${WORKER_URL}/mcp/wiki`, {
		method: 'POST',
		headers: { Authorization: 'Bearer definitely-not-the-token', 'Content-Type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
	});
	assert(r.status === 401, `expected 401, got ${r.status}`);
});

// 3. Files write path: upload → list → download → delete, all on RAW keys.
// Guards the one-namespace fix (upload/list/download/convert must agree).
console.log('\nFiles:');
const fileKey = `smoke-test/ping-${Date.now()}.txt`;
await check('files upload→list→download→delete round-trip (raw key namespace)', async () => {
	const marker = `smoke-${Date.now()}`;
	await callTool('files', 'files', { action: 'upload', path: fileKey, content_text: marker, content_type: 'text/plain' });
	const listed = await callTool('files', 'files', { action: 'list', prefix: 'smoke-test' });
	assert((listed.files ?? []).some((f) => f.path === fileKey), `list did not surface ${fileKey} (namespace mismatch?)`);
	const dl = await callTool('files', 'files', { action: 'download', path: fileKey });
	const got = Buffer.from(dl.content_base64, 'base64').toString('utf8');
	assert(got === marker, `download mismatch: got "${got}"`);
	await callTool('files', 'files', { action: 'delete', path: fileKey });
});

// Convert by r2_path WITHOUT a filename — guards filename-derivation + that
// convert reads the same key namespace upload wrote to.
await check('files convert (r2_path, no filename) reads what upload wrote', async () => {
	const htmlKey = `smoke-test/conv-${Date.now()}.html`;
	const marker = `convmarker${Date.now()}`;
	await callTool('files', 'files', { action: 'upload', path: htmlKey, content_text: `<h1>${marker}</h1>`, content_type: 'text/html' });
	try {
		const res = await callTool('files', 'files', { action: 'convert', source: 'r2_path', source_value: htmlKey, save_sidecar: false });
		assert((res.markdown ?? '').includes(marker), 'convert output missing the marker');
	} finally {
		await callTool('files', 'files', { action: 'delete', path: htmlKey });
	}
});

// 4. Installer + dashboard endpoints serve.
console.log('\nInstaller / dashboard:');
await check('GET /connect.sh serves a bash script', async () => {
	const r = await fetch(`${WORKER_URL}/connect.sh`);
	assert(r.ok, `HTTP ${r.status}`);
	const t = await r.text();
	assert(t.includes('#!/usr/bin/env bash') && t.length > 1000, 'response does not look like the installer');
});
await check('GET /disconnect.sh serves a bash script', async () => {
	const r = await fetch(`${WORKER_URL}/disconnect.sh`);
	assert(r.ok, `HTTP ${r.status}`);
	const t = await r.text();
	assert(t.includes('#!/usr/bin/env bash'), 'response does not look like the uninstaller');
});

// 5. Wiki CRUD round-trip (only with --write; namespaced + cleaned up).
if (WRITE) {
	console.log('\nWiki CRUD (--write):');
	const slug = `smoke-test-${Date.now()}`;
	const marker = `smoke marker ${Date.now()}`;
	let created = false;
	try {
		await check('wiki write', async () => {
			// frontmatter is a separate object param (the required-fields
			// validator checks it) — NOT embedded in the body markdown.
			await callTool('wiki', 'wiki', {
				action: 'write',
				collection: 'knowledge',
				slug,
				frontmatter: { title: `Smoke Test ${slug}`, slug },
				body: `${marker}\n`,
				why: 'automated smoke test — safe to delete',
			});
			created = true;
		});
		await check('wiki read returns the body', async () => {
			const r = await callTool('wiki', 'wiki', { action: 'read', collection: 'knowledge', slug });
			const text = typeof r === 'string' ? r : JSON.stringify(r);
			assert(text.includes(marker), 'read did not return the written marker');
		});
		await check('wiki search finds it (FTS)', async () => {
			// FTS indexing is synchronous on write in this worker; search the marker.
			const r = await callTool('wiki', 'wiki', { action: 'search', query: marker, limit: 5 });
			const text = typeof r === 'string' ? r : JSON.stringify(r);
			assert(text.includes(slug), 'search did not surface the new entry');
		});
	} finally {
		if (created) {
			await check('wiki delete (cleanup)', async () => {
				await callTool('wiki', 'wiki', { action: 'delete', collection: 'knowledge', slug, why: 'smoke test cleanup' });
			});
		}
	}
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
