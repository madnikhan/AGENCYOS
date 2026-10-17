import { Router } from "express";
import { db, getAgencySettingsStatus } from "@seo/db";

export const dashboardRouter = Router();

dashboardRouter.get("/stats", async (_req, res) => {
  const [clients, pending, scheduled, published, failed, integrations] =
    await Promise.all([
      db.client.count({ where: { active: true } }),
      db.post.count({ where: { status: "PENDING_APPROVAL" } }),
      db.post.count({ where: { status: "SCHEDULED" } }),
      db.post.count({ where: { status: "PUBLISHED" } }),
      db.post.count({ where: { status: "FAILED" } }),
      getAgencySettingsStatus(),
    ]);
  res.json({
    clients,
    pending,
    scheduled,
    published,
    failed,
    integrations,
  });
});
