// GET /v1/models — 返回已配置且启用的模型列表
import { Router } from "express";
import type { Request, Response } from "express";
import { getDbPool } from "../cache/db.js";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  const pool = getDbPool();
  const result = await pool.query<{ name: string; modelId: string }>(
    `SELECT p.name, m."modelId"
     FROM models m
     JOIN providers p ON p.id = m."providerId"
     WHERE m.enabled = true AND p.enabled = true
     ORDER BY p.name, m."modelId"`,
  );

  const now = Math.floor(Date.now() / 1000);

  const models = [
    {
      id: "auto",
      object: "model" as const,
      created: now,
      owned_by: "smart-router",
    },
    ...result.rows.map((row) => ({
      id: `${row.name}/${row.modelId}`,
      object: "model" as const,
      created: now,
      owned_by: row.name,
    })),
  ];

  res.json({ object: "list", data: models });
});

export default router;
