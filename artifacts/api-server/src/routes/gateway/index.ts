import { Router, type IRouter } from "express";
import statsRoute from "./stats";

const router: IRouter = Router();

router.use(statsRoute);

export default router;
