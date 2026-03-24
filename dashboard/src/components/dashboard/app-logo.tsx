// 应用标志 — 棱镜节点线稿（扁平 / currentColor，适配色主题）
"use client";

import { cn } from "@/lib/utils";

export function AppLogo({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {/* 外框：正六边形（平角朝上） */}
      <path
        d="M16 3.5 26.5 9.5 26.5 22.5 16 28.5 5.5 22.5 5.5 9.5z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      {/* 中心：领结意象（简笔） */}
      <path
        d="M11.5 13.5 14.5 16 11.5 18.5M20.5 13.5 17.5 16 20.5 18.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="14.85" y="14.85" width="2.3" height="2.3" rx="0.35" fill="currentColor" />
      {/* 单束入射 */}
      <line
        x1="1.5"
        y1="16"
        x2="5.5"
        y2="16"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      {/* 三束出射 */}
      <line
        x1="26.5"
        y1="16"
        x2="30.5"
        y2="11"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <line
        x1="26.5"
        y1="16"
        x2="30.5"
        y2="16"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <line
        x1="26.5"
        y1="16"
        x2="30.5"
        y2="21"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
