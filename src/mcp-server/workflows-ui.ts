// Workflows dashboard panel — builds the body, wraps it in the shared kit.
// See ui-kit.ts for the shell + action bridge.

import { esc, jsPrompt, uiPage } from './ui-kit';

export interface WorkflowSummary {
	slug: string;
	name: string;
	description: string;
	on: string;
	trust: string;
	runtime: string;
	status: string;
	last_receipt: string | null;
}

export interface PendingDraft {
	slug: string;
	workflowName: string;
	title: string;
	summary: string;
}

function runtimeBadge(rt: string): string {
	const cloud = rt === 'cloud';
	return `<span class="badge ${cloud ? 'b-cloud' : 'b-local'}">${cloud ? '☁ cloud' : '💻 local'}</span>`;
}

function trustBadge(t: string): string {
	const cls = t === 'auto' ? 'b-auto' : t === 'ask' ? 'b-ask' : 'b-review';
	return `<span class="badge ${cls}">${esc(t)}</span>`;
}

function pendingCard(p: PendingDraft): string {
	const approve = `Approve and send the "${p.workflowName}" draft: ${p.title}. (workflow: ${p.slug})`;
	const decline = `Hold the "${p.workflowName}" draft "${p.title}" — don't send it, leave it in pending.`;
	return `
    <div class="card need">
      <div class="need-head"><span class="need-dot">●</span> <strong>${esc(p.workflowName)}</strong> wants your OK</div>
      <div class="need-title">${esc(p.title)}</div>
      <div class="need-summary">${esc(p.summary)}</div>
      <div class="row">
        <button class="btn primary" onclick='act(${jsPrompt(approve)})'>Approve &amp; send</button>
        <button class="btn ghost" onclick='act(${jsPrompt(decline)})'>Decline</button>
      </div>
    </div>`;
}

function workflowCard(w: WorkflowSummary): string {
	const active = w.status === 'active';
	const run = `Run my "${w.name}" workflow now.`;
	const runBtn = active
		? `<button class="btn primary sm" onclick='act(${jsPrompt(run)})'>Run now</button>`
		: `<span class="paused">paused</span>`;
	return `
    <div class="card">
      <div class="wf-top"><div class="wf-name">${esc(w.name)}</div>${runBtn}</div>
      <div class="badges"><span class="badge">${esc(w.on)}</span>${trustBadge(w.trust)}${runtimeBadge(w.runtime)}</div>
      ${w.description ? `<div class="wf-desc">${esc(w.description)}</div>` : ''}
      ${w.last_receipt ? `<div class="receipt">${esc(w.last_receipt)}</div>` : `<div class="receipt muted">no runs yet</div>`}
    </div>`;
}

export function renderWorkflowsApp(workflows: WorkflowSummary[], pending: PendingDraft[]): string {
	const needsYou = pending.length
		? `<section><h2>Needs you <span class="count">${pending.length}</span></h2>${pending.map(pendingCard).join('')}</section>`
		: `<section><h2>Needs you</h2><div class="empty">Nothing needs you right now. The cortex is handling things.</div></section>`;
	const roster = workflows.length
		? workflows.map(workflowCard).join('')
		: `<div class="empty">No workflows yet. Ask your agent to "put my receipts on a workflow".</div>`;
	return uiPage({
		title: 'Office Town — Workflows',
		subtitle: 'Standing jobs your cortex owns. Buttons ask your agent to act.',
		body: `${needsYou}<section><h2>Workflows</h2>${roster}</section>`,
	});
}
