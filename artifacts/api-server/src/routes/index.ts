import { Router, type IRouter } from "express";
import healthRouter from "./health";
import vitalScanRouter from "./vitalscan";

const router: IRouter = Router();

router.use(healthRouter);
router.use(vitalScanRouter);

export default router;
