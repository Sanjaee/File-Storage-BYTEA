"use client"

import React from "react"
import { Files, HardDrive, Database, Sparkles, TrendingDown, Clock, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { formatBytes } from "@/lib/utils"
import { StorageStats as StatsType } from "@/lib/types"

interface StorageStatsProps {
  stats: StatsType | null
  loading?: boolean
}

export function StorageStats({ stats, loading }: StorageStatsProps) {
  if (loading && !stats) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-5 shimmer-bg h-28 rounded-2xl border-slate-200/60 dark:border-slate-800/60" />
        ))}
      </div>
    )
  }

  const reductionPercentage = stats?.savingPercentage ? stats.savingPercentage.toFixed(1) : "0.0"

  const cards = [
    {
      title: "Total Files",
      value: (stats?.totalFiles ?? 0).toLocaleString(),
      subtext: "Stored in PostgreSQL BYTEA",
      icon: Files,
      color: "text-blue-500",
      bg: "bg-blue-500/10 dark:bg-blue-500/20",
      pill: stats && (stats.queuedFiles > 0 || stats.processingFiles > 0) ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-blue-500 font-medium">
          <Loader2 className="h-3 w-3 animate-spin" />
          {stats.processingFiles} processing, {stats.queuedFiles} queued
        </span>
      ) : null,
    },
    {
      title: "Original",
      value: formatBytes(stats?.originalSize ?? 0),
      subtext: "Pre-compression size",
      icon: HardDrive,
      color: "text-slate-500 dark:text-slate-400",
      bg: "bg-slate-500/10 dark:bg-slate-500/20",
    },
    {
      title: "Stored",
      value: formatBytes(stats?.storedSize ?? 0),
      subtext: "Actual binary size in DB",
      icon: Database,
      color: "text-indigo-500",
      bg: "bg-indigo-500/10 dark:bg-indigo-500/20",
    },
    {
      title: "Storage Saved",
      value: formatBytes(stats?.storageSaved ?? 0),
      subtext: `${reductionPercentage}% storage reduction`,
      badge: stats && stats.storageSaved > 0 ? `${reductionPercentage}% Saved` : null,
      icon: Sparkles,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10 dark:bg-emerald-500/20",
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => {
        const Icon = c.icon
        return (
          <Card
            key={c.title}
            className="p-5 rounded-2xl border border-slate-200/80 bg-white/70 backdrop-blur-md shadow-sm transition-all duration-300 hover:shadow-md hover:border-blue-500/30 dark:border-slate-800/80 dark:bg-slate-900/60"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {c.title}
              </span>
              <div className={`p-2 rounded-xl ${c.bg}`}>
                <Icon className={`h-4 w-4 ${c.color}`} />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                {c.value}
              </span>
              {c.badge && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                  <TrendingDown className="h-3 w-3" />
                  {c.badge}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{c.subtext}</span>
              {c.pill}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
