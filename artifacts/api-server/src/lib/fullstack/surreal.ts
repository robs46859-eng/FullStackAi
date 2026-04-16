import { randomUUID } from "crypto";
import { env } from "../../config/env";

type SqlStatementResult<T = unknown> = {
	status?: string;
	result?: T;
	detail?: string;
};

type QueryRows<T> = SqlStatementResult<T[]>[];

export type WorkspaceInput = {
	slug: string;
	name?: string;
};

export type LeadBundleInput = {
	workspace: WorkspaceInput;
	listId?: string;
	company?: {
		id?: string;
		name: string;
		website?: string;
		linkedinUrl?: string;
		industry?: string;
		country?: string;
		notes?: string;
	};
	contact?: {
		id?: string;
		fullName: string;
		firstName?: string;
		lastName?: string;
		email?: string;
		phone?: string;
		title?: string;
		linkedinUrl?: string;
		status?: "lead" | "qualified" | "customer" | "inactive";
	};
	lead?: {
		id?: string;
		sourceUrl?: string;
		rawPayload?: Record<string, unknown>;
		fitScore?: number;
		intentScore?: number;
		stage?: "new" | "researched" | "queued" | "contacted" | "replied" | "qualified" | "disqualified";
	};
};

export type AgentTaskInput = {
	workspace: WorkspaceInput;
	threadId?: string;
	leadId?: string;
	campaignId?: string;
	assignedTo?: string;
	type: "discover" | "research" | "score" | "draft" | "review" | "schedule" | "send" | "monitor";
	input?: Record<string, unknown>;
	priority?: number;
	subject?: string;
};

export type MemoryInput = {
	workspace: WorkspaceInput;
	leadId?: string;
	contactId?: string;
	companyId?: string;
	sourceTaskId?: string;
	category: "fact" | "summary" | "objection" | "intent" | "research" | "policy";
	content: string;
	confidence?: number;
};

export type DraftInput = {
	workspace: WorkspaceInput;
	campaignId?: string;
	leadId?: string;
	contactId?: string;
	channel: "email" | "linkedin";
	subject?: string;
	body: string;
	generatedByAgentId?: string;
};

function base64(input: string): string {
	return Buffer.from(input, "utf8").toString("base64");
}

function surrealLiteral(value: unknown): string {
	if (value === undefined) return "NONE";
	if (value === null) return "NONE";
	if (typeof value === "string") return JSON.stringify(value);
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (value instanceof Date) return `d"${value.toISOString()}"`;
	if (Array.isArray(value)) return `[${value.map((item) => surrealLiteral(item)).join(", ")}]`;
	if (typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, item]) => item !== undefined)
			.map(([key, item]) => `${key}: ${surrealLiteral(item)}`);
		return `{ ${entries.join(", ")} }`;
	}
	return JSON.stringify(String(value));
}

function thing(table: string, id: string): string {
	return `type::thing(${JSON.stringify(table)}, ${JSON.stringify(id)})`;
}

function optionalThing(table: string, id?: string): string {
	return id ? thing(table, id) : "NONE";
}

function requireSurrealConfig(): void {
	if (!env.SURREAL_URL || !env.SURREAL_NS || !env.SURREAL_DB || !env.SURREAL_USER || !env.SURREAL_PASS) {
		throw new Error(
			"SurrealDB is not configured. Set SURREAL_URL, SURREAL_NS, SURREAL_DB, SURREAL_USER, and SURREAL_PASS.",
		);
	}
}

async function runQuery<T>(query: string): Promise<T[]> {
	requireSurrealConfig();

	const response = await fetch(`${env.SURREAL_URL}/sql`, {
		method: "POST",
		headers: {
			"Content-Type": "text/plain",
			Accept: "application/json",
			NS: env.SURREAL_NS!,
			DB: env.SURREAL_DB!,
			Authorization: `Basic ${base64(`${env.SURREAL_USER!}:${env.SURREAL_PASS!}`)}`,
		},
		body: query,
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`SurrealDB query failed (${response.status}): ${text}`);
	}

	const data = (await response.json()) as QueryRows<T>;
	const failures = data.filter((statement) => statement.status === "ERR");
	if (failures.length > 0) {
		throw new Error(
			`SurrealDB query error: ${failures.map((statement) => statement.detail ?? "unknown").join("; ")}`,
		);
	}

	return data.flatMap((statement) => statement.result ?? []);
}

export function surrealConfigured(): boolean {
	return Boolean(env.SURREAL_URL && env.SURREAL_NS && env.SURREAL_DB && env.SURREAL_USER && env.SURREAL_PASS);
}

export async function ensureWorkspace(workspace: WorkspaceInput): Promise<{ id: string; slug: string; name: string }> {
	const slug = workspace.slug.trim();
	if (!slug) {
		throw new Error("workspace.slug is required");
	}

	const name = workspace.name?.trim() || slug;
	const rows = await runQuery<{ id: string; slug: string; name: string }>(`
UPSERT ${thing("workspace", slug)} CONTENT {
	slug: ${surrealLiteral(slug)},
	name: ${surrealLiteral(name)}
};
SELECT id, slug, name FROM ${thing("workspace", slug)};
`);

	const record = rows.at(-1);
	if (!record) {
		throw new Error("Failed to ensure workspace");
	}
	return record;
}

export async function createLeadBundle(input: LeadBundleInput): Promise<Record<string, unknown>> {
	const workspace = await ensureWorkspace(input.workspace);
	const workspaceRef = thing("workspace", workspace.slug);
	const statements: string[] = [];

	let companyId: string | undefined;
	let contactId: string | undefined;
	const leadId = input.lead?.id ?? randomUUID();

	if (input.company) {
		companyId = input.company.id ?? randomUUID();
		statements.push(`
CREATE ${thing("company", companyId)} CONTENT {
	workspace: ${workspaceRef},
	name: ${surrealLiteral(input.company.name)},
	website: ${surrealLiteral(input.company.website)},
	linkedin_url: ${surrealLiteral(input.company.linkedinUrl)},
	industry: ${surrealLiteral(input.company.industry)},
	country: ${surrealLiteral(input.company.country)},
	notes: ${surrealLiteral(input.company.notes)}
};`);
	}

	if (input.contact) {
		contactId = input.contact.id ?? randomUUID();
		statements.push(`
CREATE ${thing("contact", contactId)} CONTENT {
	workspace: ${workspaceRef},
	company: ${optionalThing("company", companyId)},
	first_name: ${surrealLiteral(input.contact.firstName)},
	last_name: ${surrealLiteral(input.contact.lastName)},
	full_name: ${surrealLiteral(input.contact.fullName)},
	email: ${surrealLiteral(input.contact.email)},
	phone: ${surrealLiteral(input.contact.phone)},
	title: ${surrealLiteral(input.contact.title)},
	linkedin_url: ${surrealLiteral(input.contact.linkedinUrl)},
	status: ${surrealLiteral(input.contact.status ?? "lead")}
};`);
	}

	statements.push(`
CREATE ${thing("lead", leadId)} CONTENT {
	workspace: ${workspaceRef},
	list: ${optionalThing("lead_list", input.listId)},
	company: ${optionalThing("company", companyId)},
	contact: ${optionalThing("contact", contactId)},
	source_url: ${surrealLiteral(input.lead?.sourceUrl)},
	raw_payload: ${surrealLiteral(input.lead?.rawPayload)},
	fit_score: ${surrealLiteral(input.lead?.fitScore)},
	intent_score: ${surrealLiteral(input.lead?.intentScore)},
	stage: ${surrealLiteral(input.lead?.stage ?? "new")}
};
`);

	const rows = await runQuery<Record<string, unknown>>(`
${statements.join("\n")}
RETURN {
	workspace: ${workspaceRef},
	company: ${optionalThing("company", companyId)},
	contact: ${optionalThing("contact", contactId)},
	lead: ${thing("lead", leadId)}
};
`);

	return rows.at(-1) ?? { workspace: workspaceRef, lead: thing("lead", leadId) };
}

export async function createAgentTask(input: AgentTaskInput): Promise<Record<string, unknown>> {
	const workspace = await ensureWorkspace(input.workspace);
	const workspaceRef = thing("workspace", workspace.slug);
	const taskId = randomUUID();

	const statements: string[] = [];
	if (input.subject?.trim()) {
		const threadId = input.threadId ?? randomUUID();
		statements.push(`
CREATE ${thing("agent_thread", threadId)} CONTENT {
	workspace: ${workspaceRef},
	lead: ${optionalThing("lead", input.leadId)},
	campaign: ${optionalThing("campaign", input.campaignId)},
	subject: ${surrealLiteral(input.subject)},
	status: "open"
};`);
		input.threadId = threadId;
	}

	const rows = await runQuery<Record<string, unknown>>(`
${statements.join("\n")}
CREATE ${thing("agent_task", taskId)} CONTENT {
	workspace: ${workspaceRef},
	thread: ${optionalThing("agent_thread", input.threadId)},
	lead: ${optionalThing("lead", input.leadId)},
	campaign: ${optionalThing("campaign", input.campaignId)},
	assigned_to: ${optionalThing("agent", input.assignedTo)},
	type: ${surrealLiteral(input.type)},
	input: ${surrealLiteral(input.input)},
	status: "queued",
	priority: ${surrealLiteral(input.priority ?? 50)}
};
SELECT * FROM ${thing("agent_task", taskId)};
`);

	return rows.at(-1) ?? { id: taskId };
}

export async function saveMemory(input: MemoryInput): Promise<Record<string, unknown>> {
	const workspace = await ensureWorkspace(input.workspace);
	const workspaceRef = thing("workspace", workspace.slug);
	const memoryId = randomUUID();
	const rows = await runQuery<Record<string, unknown>>(`
CREATE ${thing("memory", memoryId)} CONTENT {
	workspace: ${workspaceRef},
	lead: ${optionalThing("lead", input.leadId)},
	contact: ${optionalThing("contact", input.contactId)},
	company: ${optionalThing("company", input.companyId)},
	source_task: ${optionalThing("agent_task", input.sourceTaskId)},
	category: ${surrealLiteral(input.category)},
	content: ${surrealLiteral(input.content)},
	confidence: ${surrealLiteral(input.confidence)}
};
SELECT * FROM ${thing("memory", memoryId)};
`);
	return rows.at(-1) ?? { id: memoryId };
}

export async function createMessageDraft(input: DraftInput): Promise<Record<string, unknown>> {
	const workspace = await ensureWorkspace(input.workspace);
	const workspaceRef = thing("workspace", workspace.slug);
	const draftId = randomUUID();
	const rows = await runQuery<Record<string, unknown>>(`
CREATE ${thing("message_draft", draftId)} CONTENT {
	workspace: ${workspaceRef},
	campaign: ${optionalThing("campaign", input.campaignId)},
	lead: ${optionalThing("lead", input.leadId)},
	contact: ${optionalThing("contact", input.contactId)},
	channel: ${surrealLiteral(input.channel)},
	subject: ${surrealLiteral(input.subject)},
	body: ${surrealLiteral(input.body)},
	status: "draft",
	generated_by_agent: ${optionalThing("agent", input.generatedByAgentId)}
};
SELECT * FROM ${thing("message_draft", draftId)};
`);
	return rows.at(-1) ?? { id: draftId };
}

export async function getWorkspaceContext(workspace: WorkspaceInput, limit = 10): Promise<Record<string, unknown>> {
	const ensuredWorkspace = await ensureWorkspace(workspace);
	const workspaceRef = thing("workspace", ensuredWorkspace.slug);
	const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, limit)) : 10;
	const rows = await runQuery<Record<string, unknown>>(`
RETURN {
	workspace: (SELECT id, slug, name FROM ${workspaceRef})[0],
	leads: (SELECT * FROM lead WHERE workspace = ${workspaceRef} ORDER BY created_at DESC LIMIT ${safeLimit}),
	tasks: (SELECT * FROM agent_task WHERE workspace = ${workspaceRef} ORDER BY created_at DESC LIMIT ${safeLimit}),
	memories: (SELECT * FROM memory WHERE workspace = ${workspaceRef} ORDER BY created_at DESC LIMIT ${safeLimit}),
	drafts: (SELECT * FROM message_draft WHERE workspace = ${workspaceRef} ORDER BY created_at DESC LIMIT ${safeLimit})
};
`);
	return rows.at(-1) ?? { workspace: ensuredWorkspace };
}
