// Inbound email handler — wired to Cloudflare Email Routing.
//
// When the user adds an Email Routing rule pointing at this worker (e.g.
// `agent@<their-domain>` → `office-town`), Cloudflare delivers the message
// via the email() binding entry point. We extract subject + body + headers
// and create a wiki/research/ entry with kind:inbound-email.
//
// No API token, no SMTP server, no external service — pure binding-based.

import type { ForwardableEmailMessage } from '@cloudflare/workers-types';
import type { Env } from '../types';
import { WikiService } from '../wiki/service';

/** Stream → string with a safety cap so a giant attachment doesn't blow memory */
async function streamToString(stream: ReadableStream<Uint8Array>, maxBytes = 5 * 1024 * 1024): Promise<string> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			total += value.byteLength;
			if (total > maxBytes) {
				chunks.push(value);
				break; // bail early, we'll truncate
			}
			chunks.push(value);
		}
	}
	const buf = new Uint8Array(total);
	let offset = 0;
	for (const c of chunks) {
		buf.set(c, offset);
		offset += c.byteLength;
	}
	return new TextDecoder('utf-8', { fatal: false, ignoreBOM: false }).decode(buf);
}

/**
 * Pull the plain-text part out of a MIME message. Lazy parser — looks for
 * `Content-Type: text/plain` boundary parts in multipart bodies, otherwise
 * uses the whole body. Good enough for "land the email in the wiki so the
 * librarian can read it"; not a full MIME tree decoder.
 */
function extractTextBody(raw: string): string {
	// Split headers from body
	const headerEnd = raw.indexOf('\r\n\r\n');
	const body = headerEnd === -1 ? raw : raw.slice(headerEnd + 4);

	// Find multipart boundary in the top-level Content-Type if present
	const ctMatch = raw.slice(0, headerEnd === -1 ? raw.length : headerEnd).match(/Content-Type:\s*multipart\/[^;]+;\s*boundary="?([^";\r\n]+)"?/i);
	if (!ctMatch) {
		// Not multipart — body is whatever encoding the single part declared
		return body.trim();
	}
	const boundary = `--${ctMatch[1]}`;
	const parts = body.split(boundary).slice(1, -1); // drop preamble + closing
	// Prefer text/plain
	for (const part of parts) {
		if (/Content-Type:\s*text\/plain/i.test(part)) {
			const partBodyStart = part.indexOf('\r\n\r\n');
			if (partBodyStart !== -1) return part.slice(partBodyStart + 4).trim();
		}
	}
	// Fall back to text/html (stripped of tags)
	for (const part of parts) {
		if (/Content-Type:\s*text\/html/i.test(part)) {
			const partBodyStart = part.indexOf('\r\n\r\n');
			if (partBodyStart !== -1) {
				const html = part.slice(partBodyStart + 4);
				return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
			}
		}
	}
	// Last resort: first part body
	if (parts.length > 0) {
		const partBodyStart = parts[0].indexOf('\r\n\r\n');
		if (partBodyStart !== -1) return parts[0].slice(partBodyStart + 4).trim();
	}
	return body.trim();
}

function safeSlug(input: string, maxLen = 60): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, maxLen) || 'untitled';
}

export async function handleInboundEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
	const subject = message.headers.get('subject') ?? '(no subject)';
	const messageId = message.headers.get('message-id') ?? '';
	const date = message.headers.get('date') ?? new Date().toUTCString();
	const replyTo = message.headers.get('reply-to') ?? message.from;

	const raw = await streamToString(message.raw);
	const text = extractTextBody(raw);

	const today = new Date().toISOString().slice(0, 10);
	const slug = `${today}-from-${safeSlug(message.from)}-${safeSlug(subject, 40)}`;

	const frontmatter = {
		kind: 'inbound-email',
		subject,
		from: message.from,
		to: message.to,
		reply_to: replyTo,
		received_at: new Date().toISOString(),
		message_id: messageId,
		date_header: date,
	};

	const body = [
		`## Subject`,
		subject,
		'',
		`## From`,
		message.from,
		'',
		`## To`,
		message.to,
		'',
		`## Body`,
		'',
		text,
	].join('\n');

	const svc = new WikiService(env);
	await svc.create({ collection: 'research', slug, frontmatter, body }, 'inbound-email');

	console.log(
		JSON.stringify({
			event: 'inbound_email_filed',
			from: message.from,
			to: message.to,
			slug,
			body_chars: text.length,
		}),
	);
}
