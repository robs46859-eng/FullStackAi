import { Router, type IRouter, type Response } from "express";
import {
	createAgentTask,
	createLeadBundle,
	createMessageDraft,
	getWorkspaceContext,
	saveMemory,
	surrealConfigured,
} from "../../lib/fullstack/surreal";

const router: IRouter = Router();

function assertConfigured(res: Response): boolean {
	if (!surrealConfigured()) {
		res.status(503).json({
			error: "SurrealDB integration is not configured",
			required: ["SURREAL_URL", "SURREAL_NS", "SURREAL_DB", "SURREAL_USER", "SURREAL_PASS"],
		});
		return false;
	}

	return true;
}

router.get("/fullstack/context/:workspaceSlug", async (req, res, next) => {
	if (!assertConfigured(res)) return;

	try {
		const limit = req.query.limit ? Number(req.query.limit) : 10;
		const data = await getWorkspaceContext({
			slug: req.params.workspaceSlug,
			name: typeof req.query.workspaceName === "string" ? req.query.workspaceName : undefined,
		}, limit);
		res.json(data);
	} catch (err) {
		next(err);
	}
});

router.post("/fullstack/leads", async (req, res, next) => {
	if (!assertConfigured(res)) return;

	try {
		const data = await createLeadBundle(req.body);
		res.status(201).json(data);
	} catch (err) {
		next(err);
	}
});

router.post("/fullstack/tasks", async (req, res, next) => {
	if (!assertConfigured(res)) return;

	try {
		const data = await createAgentTask(req.body);
		res.status(201).json(data);
	} catch (err) {
		next(err);
	}
});

router.post("/fullstack/memories", async (req, res, next) => {
	if (!assertConfigured(res)) return;

	try {
		const data = await saveMemory(req.body);
		res.status(201).json(data);
	} catch (err) {
		next(err);
	}
});

router.post("/fullstack/drafts", async (req, res, next) => {
	if (!assertConfigured(res)) return;

	try {
		const data = await createMessageDraft(req.body);
		res.status(201).json(data);
	} catch (err) {
		next(err);
	}
});

export default router;
