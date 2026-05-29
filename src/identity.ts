// Device/actor identity — the Workflow keystone.
//
// Posture: the daemon is a minimal courier (it mints + sends a random device_id
// and its platform, nothing else). Everything useful about WHERE a connection
// comes from is derived here, worker-side, from Cloudflare's connection
// metadata (request.cf) — no device read, no profiling. See CONCEPT-the-workflow.

import type { Context } from 'hono';
import type { AppContext } from './types';

export interface DeviceTouch {
	deviceId: string;
	kind?: string; // daemon | goose | connector | cloud
	platform?: string; // e.g. darwin/arm64 (daemon sends it)
	gooseVersion?: string; // from MCP clientInfo / User-Agent
	stats?: unknown; // last sync stats (JSON-able)
}

// Reads timezone + coarse region from request.cf (edge-derived, free, no device
// read) and upserts the device row. Timezone is only set while unconfirmed —
// once the user confirms it in the dashboard, the IP-derived value is ignored.
// No-ops when there's no device id (legacy/none — we never fabricate identity).
export async function touchDevice(c: Context<AppContext>, t: DeviceTouch): Promise<void> {
	if (!t.deviceId) return;
	const cf = ((c.req.raw as unknown as { cf?: Record<string, unknown> }).cf) ?? {};
	const timezone = typeof cf.timezone === 'string' ? cf.timezone : null;
	const region = [cf.city, cf.region, cf.country].filter((v) => typeof v === 'string' && v).join(', ') || null;
	const statsJson = t.stats != null ? JSON.stringify(t.stats) : null;

	try {
		await c.env.DB.prepare(
			`INSERT INTO devices (device_id, kind, platform, goose_version, timezone, region, last_stats, last_seen)
			 VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
			 ON CONFLICT(device_id) DO UPDATE SET
			   last_seen = datetime('now'),
			   kind          = COALESCE(excluded.kind, devices.kind),
			   platform      = COALESCE(excluded.platform, devices.platform),
			   goose_version = COALESCE(excluded.goose_version, devices.goose_version),
			   region        = COALESCE(excluded.region, devices.region),
			   last_stats    = COALESCE(excluded.last_stats, devices.last_stats),
			   timezone      = CASE WHEN devices.timezone_confirmed = 1
			                        THEN devices.timezone
			                        ELSE COALESCE(excluded.timezone, devices.timezone) END`,
		)
			.bind(
				t.deviceId,
				t.kind ?? 'daemon',
				t.platform ?? null,
				t.gooseVersion ?? null,
				timezone,
				region,
				statsJson,
			)
			.run();
	} catch (err) {
		// Identity capture must never break the request it rides on.
		console.error(JSON.stringify({ event: 'touch_device_error', error: String(err) }));
	}
}

// Convenience: pull the device id from the standard header.
export function deviceIdFrom(c: Context<AppContext>): string | undefined {
	return c.req.header('x-office-town-device') || undefined;
}

// Capture goose_version onto the device on an MCP `initialize` (the agent's MCP
// calls carry the same device id the daemon uses — the installer wires it into
// the Goose headers). Doesn't set `kind` (a machine runs both daemon + agent;
// they share one device row). Safe to call on every request.
export async function captureMcpInitialize(
	c: Context<AppContext>,
	req: { method?: string; params?: unknown },
): Promise<void> {
	if (req?.method !== 'initialize') return;
	const deviceId = deviceIdFrom(c);
	if (!deviceId) return;
	const ci = (req.params as { clientInfo?: { version?: string } } | undefined)?.clientInfo;
	await touchDevice(c, { deviceId, gooseVersion: typeof ci?.version === 'string' ? ci.version : undefined });
}
