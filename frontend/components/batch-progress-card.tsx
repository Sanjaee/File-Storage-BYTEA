"use client"

import React from "react"
import {
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  Zap,
  ArrowUpCircle,
  Database,
  Layers,
} from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { formatBytes } from "@/lib/utils"

export interface BatchProgressProps {
  total: number
  uploadedNetworkCount: number
  networkUploadedBytes: number
  networkTotalBytes: number
  backendCompleted: number
  backendProcessing: number
  backendQueued: number
  backendFailed: number
  activeUploadsCount: number
  isUploading: boolean
}

export function BatchProgressCard({
  total,
  uploadedNetworkCount,
  networkUploadedBytes,
  networkTotalBytes,
  backendCompleted,
  backendProcessing,
  backendQueued,
  backendFailed,
  activeUploadsCount,
  isUploading,
}: BatchProgressProps) {
  if (total === 0) return null

  // 1. Network upload percentage
  const networkProgress =
    networkTotalBytes > 0
      ? Math.min(100, Math.round((networkUploadedBytes / networkTotalBytes) * 100))
      : total > 0
      ? Math.min(100, Math.round((uploadedNetworkCount / total) * 100))
      : 100

  // 2. Backend processing percentage
  const processedCount = backendCompleted + backendFailed
  const backendProgress =
    total > 0 ? Math.min(100, Math.round((processedCount / total) * 100)) : 0

  // 3. Overall composite progress (50% network + 50% backend)
  const overallProgress = Math.min(
    100,
    Math.round(networkProgress * 0.4 + backendProgress * 0.6)
  )

  const isDone = backendProgress >= 100 && networkProgress >= 100

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/5 via-white to-slate-50 p-5 shadow-sm dark:border-blue-500/20 dark:from-blue-950/20 dark:via-slate-900 dark:to-slate-900/90 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
            {isDone ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : (
              <Layers className="h-5 w-5 text-blue-500" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              Batch Queue Dashboard
              {isDone ? (
                <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400">
                  &bull; All files processed
                </span>
              ) : isUploading ? (
                <span className="text-xs font-normal text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Uploading ({activeUploadsCount} active concurrent streams)
                </span>
              ) : (
                <span className="text-xs font-normal text-indigo-500 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Asynq workers processing in background
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Total {total.toLocaleString()} {total === 1 ? "file" : "files"} in this upload session
            </p>
          </div>
        </div>

        {/* Overall progress indicator */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-xs text-slate-500">Overall Progress</span>
            <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100">
              {overallProgress}%
            </p>
          </div>
        </div>
      </div>

      {/* Progress Bars Grid (Network vs Backend) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
        {/* Network Upload Progress */}
        <div className="rounded-xl border border-slate-200/80 bg-white/60 p-3.5 dark:border-slate-800/80 dark:bg-slate-950/40 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
              <ArrowUpCircle className="h-4 w-4 text-blue-500" />
              1. Network Upload to API
            </span>
            <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
              {networkProgress}%
            </span>
          </div>
          <Progress value={networkProgress} indicatorClassName="bg-blue-600" />
          <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
            <span>
              {uploadedNetworkCount} of {total} files uploaded
            </span>
            <span>
              {formatBytes(networkUploadedBytes)} / {formatBytes(networkTotalBytes)}
            </span>
          </div>
        </div>

        {/* Backend Asynq Worker Processing Progress */}
        <div className="rounded-xl border border-slate-200/80 bg-white/60 p-3.5 dark:border-slate-800/80 dark:bg-slate-950/40 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
              <Database className="h-4 w-4 text-indigo-500" />
              2. Asynq Compression & BYTEA Storage
            </span>
            <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
              {backendProgress}%
            </span>
          </div>
          <Progress
            value={backendProgress}
            indicatorClassName={isDone ? "bg-emerald-500" : "bg-indigo-600"}
          />
          <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
            <span>
              {backendCompleted} completed, {backendFailed} failed
            </span>
            <span>{total - processedCount} remaining in queue</span>
          </div>
        </div>
      </div>

      {/* Breakdown Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-2.5 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <div>
            <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 uppercase font-semibold">
              Completed
            </span>
            <p className="font-bold font-mono text-sm leading-none mt-0.5">
              {backendCompleted}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 p-2.5 text-blue-700 dark:text-blue-300 border border-blue-500/20">
          <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
          <div>
            <span className="text-[10px] text-blue-600/80 dark:text-blue-400/80 uppercase font-semibold">
              Processing
            </span>
            <p className="font-bold font-mono text-sm leading-none mt-0.5">
              {backendProcessing}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-slate-500/10 p-2.5 text-slate-700 dark:text-slate-300 border border-slate-500/20">
          <Clock className="h-4 w-4 text-slate-400 shrink-0" />
          <div>
            <span className="text-[10px] text-slate-500 uppercase font-semibold">
              Queued
            </span>
            <p className="font-bold font-mono text-sm leading-none mt-0.5">
              {backendQueued}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-2.5 text-red-700 dark:text-red-300 border border-red-500/20">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <div>
            <span className="text-[10px] text-red-600/80 dark:text-red-400/80 uppercase font-semibold">
              Failed
            </span>
            <p className="font-bold font-mono text-sm leading-none mt-0.5">
              {backendFailed}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
