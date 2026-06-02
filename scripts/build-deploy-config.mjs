#!/usr/bin/env node
// build-deploy-config.mjs — produce wrangler.deploy.jsonc with the Sandbox
// (code-execution) bindings injected.
//
// The default wrangler.jsonc is free-tier: no containers, no Sandbox Durable
// Object, no migration. When the install opts into the sandbox MCP
// (`provision.sh --with-sandbox`), this script slots the blocks from
// scripts/sandbox-bindings.jsonc into wrangler.jsonc at the marker line and
// writes wrangler.deploy.jsonc, which the deploy then uses via `-c`.
//
// Pure text replacement of one marker line — no JSONC parsing, so comments,
// URLs (https://…) and trailing commas in wrangler.jsonc are untouched.
//
// Usage: node scripts/build-deploy-config.mjs

import { readFileSync, writeFileSync } from 'node:fs';

const MARKER = '__OFFICE_TOWN_SANDBOX_BINDINGS__';
const BASE = 'wrangler.jsonc';
const FRAGMENT = 'scripts/sandbox-bindings.jsonc';
const OUT = 'wrangler.deploy.jsonc';

const base = readFileSync(BASE, 'utf8');
const lines = base.split('\n');
const markerIdx = lines.findIndex((l) => l.includes(MARKER));
if (markerIdx === -1) {
	console.error(`✗ marker ${MARKER} not found in ${BASE} — cannot inject sandbox bindings`);
	process.exit(1);
}

const fragment = readFileSync(FRAGMENT, 'utf8').replace(/\n$/, '');
lines.splice(markerIdx, 1, fragment);
writeFileSync(OUT, lines.join('\n'));
console.log(`✓ wrote ${OUT} with sandbox bindings injected`);
