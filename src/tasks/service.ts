// Tasks — a tiny persistent store behind the task-board panel.
//
// Stored as one JSON doc in R2 (app-state/tasks.json). A personal board is
// small, so read-whole / write-whole is fine and avoids a schema migration.
// The board panel (externalUrl) reads + saves through /api/tasks.

import type { Env } from '../types';

export type TaskStatus = 'todo' | 'doing' | 'done';

export interface Task {
	id: string;
	title: string;
	status: TaskStatus;
	order: number;
	priority: 'low' | 'normal' | 'high';
	urgent: boolean;
	created_at: string;
}

const KEY = 'app-state/tasks.json';

export class TasksService {
	constructor(private env: Env) {}

	async load(): Promise<Task[]> {
		const obj = await this.env.FILES.get(KEY);
		if (!obj) return [];
		try {
			const parsed = JSON.parse(await obj.text());
			return Array.isArray(parsed) ? (parsed as Task[]) : [];
		} catch {
			return [];
		}
	}

	private async save(tasks: Task[]): Promise<void> {
		await this.env.FILES.put(KEY, JSON.stringify(tasks), { httpMetadata: { contentType: 'application/json' } });
	}

	async add(input: { title: string; priority?: Task['priority']; urgent?: boolean }, nowIso: string): Promise<Task> {
		const tasks = await this.load();
		const order = Math.max(0, ...tasks.filter((t) => t.status === 'todo').map((t) => t.order)) + 1;
		const task: Task = {
			id: crypto.randomUUID().slice(0, 8),
			title: input.title,
			status: 'todo',
			order,
			priority: input.priority ?? 'normal',
			urgent: !!input.urgent,
			created_at: nowIso,
		};
		tasks.push(task);
		await this.save(tasks);
		return task;
	}

	// Apply a full board layout in one write — the panel recomputes {status,
	// order} for every card after a drag and posts the lot.
	async applyLayout(layout: Array<{ id: string; status: TaskStatus; order: number }>): Promise<void> {
		const tasks = await this.load();
		const m = new Map(layout.map((l) => [l.id, l]));
		for (const t of tasks) {
			const l = m.get(t.id);
			if (l) {
				t.status = l.status;
				t.order = l.order;
			}
		}
		await this.save(tasks);
	}

	async remove(id: string): Promise<void> {
		const tasks = await this.load();
		await this.save(tasks.filter((t) => t.id !== id));
	}
}
