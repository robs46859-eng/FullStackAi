import { Router, type IRouter } from "express";
import generateRoute from "./generate";
import historyRoute from "./history";

const router: IRouter = Router();

router.use(generateRoute);
router.use(historyRoute);

export default router;
