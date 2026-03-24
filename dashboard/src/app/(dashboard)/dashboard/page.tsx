// Dashboard 总览页 — KPI 卡片 + 24h 趋势 + Provider 分布（ISSUE-V3-06）
"use client";

import { DashboardOverviewClient } from "./overview-client";
import { useI18n } from "@/lib/i18n/context";

export default function DashboardOverviewPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.title")}</h1>
      <DashboardOverviewClient />
    </div>
  );
}
