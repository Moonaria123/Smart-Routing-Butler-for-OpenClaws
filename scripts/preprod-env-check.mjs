#!/usr/bin/env node
/**
 * 预发布环境自检：探测 Proxy / Router / Dashboard 健康端点与可选 Ollama。
 * 使用 Node 原生 http 以避免部分 Windows 环境下 fetch 退出时的句柄问题。
 */
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

const PROXY_URL = process.env.PROXY_URL ?? "http://127.0.0.1:8080";
const ROUTER_URL = process.env.ROUTER_URL ?? "http://127.0.0.1:8001";
const DASHBOARD_URL = process.env.DASHBOARD_URL ?? "http://127.0.0.1:3000";
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";

function httpGet(urlStr) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      u,
      { method: "GET", timeout: 8000 },
      (res) => {
        res.resume();
        resolve({ status: res.statusCode ?? 0 });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.end();
  });
}

async function check(name, url, okStatuses = [200]) {
  try {
    const { status } = await httpGet(url);
    const ok = okStatuses.includes(status);
    return { name, ok, status, detail: ok ? "" : `期望状态 ${okStatuses.join("|")}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { name, ok: false, status: 0, detail: msg };
  }
}

async function main() {
  const rows = [
    await check("Proxy /health", `${PROXY_URL}/health`),
    await check("Router /health", `${ROUTER_URL}/health`),
    await check("Router /health/semantic", `${ROUTER_URL}/health/semantic`),
    await check("Dashboard 首页", `${DASHBOARD_URL}/`, [200, 307, 308]),
    await check("Ollama /api/tags", `${OLLAMA_URL}/api/tags`, [200]),
  ];

  console.log("Smart Router Butler — Pre-Production 环境探测\n");
  for (const r of rows) {
    const mark = r.ok ? "OK" : "FAIL";
    console.log(`[${mark}] ${r.name} -> HTTP ${r.status}${r.detail ? ` (${r.detail})` : ""}`);
  }

  const critical = rows.slice(0, 3);
  const criticalFail = critical.some((r) => !r.ok);

  console.log("\n说明：");
  console.log("- Proxy/Router 健康为发布必需；Dashboard 首页若重定向属正常。");
  console.log("- Ollama 失败时 L3 将降级（契约允许），不单独阻断本脚本。");
  console.log("- 种子规则、API Token、prisma migrate 需人工在目标环境核对（见 docs/PRE-PRODUCTION-ENV-CHECKLIST.md）。");

  process.exit(criticalFail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
