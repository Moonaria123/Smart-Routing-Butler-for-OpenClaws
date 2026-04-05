// GET /v1/models — 返回已配置且启用的模型列表（含 V5 能力元数据）
import { Router } from "express";
import type { Request, Response } from "express";
import { getDbPool } from "../cache/db.js";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  const pool = getDbPool();
  const result = await pool.query<{
    name: string;
    modelId: string;
    features: string[] | null;
    supportsThinking: boolean;
    contextWindow: number;
  }>(
    `SELECT p.name, m."modelId", m.features, m."supportsThinking", m."contextWindow"
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
    ...result.rows.map((row) => {
      const features = row.features ?? [];
      const capabilities: Record<string, boolean> = {};
      if (features.includes("vision")) capabilities.vision = true;
      if (features.includes("audio")) capabilities.audio = true;
      if (features.includes("image-generation")) capabilities.image_generation = true;
      if (row.supportsThinking) capabilities.thinking = true;
      return {
        id: `${row.name}/${row.modelId}`,
        object: "model" as const,
        created: now,
        owned_by: row.name,
        ...(Object.keys(capabilities).length > 0 ? { capabilities } : {}),
        context_window: row.contextWindow,
      };
    }),
  ];

  res.json({ object: "list", data: models });
});

export default router;
