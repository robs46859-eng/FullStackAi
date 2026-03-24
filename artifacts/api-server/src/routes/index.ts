import { Router, type IRouter } from "express";
import healthRouter from "./health";
import agentRouter from "./agent";
import gatewayRouter from "./gateway";

const router: IRouter = Router();

router.use(healthRouter);
router.use(agentRouter);
router.use(gatewayRouter);

export default router;
