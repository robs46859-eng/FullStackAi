import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import agentRouter from "./agent";
import gatewayRouter from "./gateway";
import keysRouter from "./keys";
import billingRouter from "./billing";
import publicApiRouter from "./public-api";
import wellKnownRouter from "./well-known";
import adminRouter from "./admin";
import { createMcpRouter } from "../lib/mcp-server";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(agentRouter);
router.use(gatewayRouter);
router.use(keysRouter);
router.use(billingRouter);
router.use(publicApiRouter);
router.use(adminRouter);
router.use(createMcpRouter());

export { wellKnownRouter };
export default router;
