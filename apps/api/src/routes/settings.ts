import { Router } from "express";
import {
  getAgencySettingsStatus,
  updateAgencySettings,
  type UpdateAgencySettingsInput,
} from "@seo/db";

export const settingsRouter = Router();

settingsRouter.get("/", async (_req, res) => {
  const status = await getAgencySettingsStatus();
  res.json(status);
});

settingsRouter.put("/", async (req, res) => {
  const body = req.body as UpdateAgencySettingsInput;
  const status = await updateAgencySettings(body ?? {});
  res.json(status);
});
