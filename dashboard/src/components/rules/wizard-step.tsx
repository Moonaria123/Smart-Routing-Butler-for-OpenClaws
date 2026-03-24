// 向导步骤容器 — 可复用的步骤布局组件（进度与导航文案走 i18n，ISSUE-V5-07）
"use client";

import { useI18n } from "@/lib/i18n/context";

interface WizardStepProps {
  title: string;
  description: string;
  stepNumber: number;
  totalSteps: number;
  children: React.ReactNode;
  onPrev?: () => void;
  onNext?: () => void;
  /** 未传时使用 `wizard.nav.next` */
  nextLabel?: string;
  nextDisabled?: boolean;
  isLoading?: boolean;
}

export function WizardStep({
  title,
  description,
  stepNumber,
  totalSteps,
  children,
  onPrev,
  onNext,
  nextLabel,
  nextDisabled = false,
  isLoading = false,
}: WizardStepProps) {
  const { t } = useI18n();
  const nextText = nextLabel ?? t("wizard.nav.next");

  return (
    <div className="space-y-6">
      {/* 进度条 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {t("wizard.stepProgress", {
              current: stepNumber,
              total: totalSteps,
            })}
          </span>
          <span>{Math.round((stepNumber / totalSteps) * 100)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-300"
            style={{ width: `${(stepNumber / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {/* 标题 */}
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      {/* 内容 */}
      <div className="min-h-[200px]">{children}</div>

      {/* 操作按钮 */}
      <div className="flex items-center justify-between border-t pt-4">
        {onPrev ? (
          <button
            type="button"
            onClick={onPrev}
            disabled={isLoading}
            className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {t("wizard.nav.prev")}
          </button>
        ) : (
          <div />
        )}
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled || isLoading}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading && (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            {nextText}
          </button>
        )}
      </div>
    </div>
  );
}
