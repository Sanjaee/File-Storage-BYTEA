"use client"

import React, { useState } from "react"
import {
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  ArrowUpCircle,
  Database,
  Layers,
  Ban,
  X,
  ChevronDown,
  ChevronUp,
  FileIcon,
  ImageIcon,
  VideoIcon,
  FileTextIcon,
} from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { formatBytes, getFileCategory } from "@/lib/utils"
import { ClientQueueItem } from "@/lib/types"

export interface BatchProgressProps {
  batchId?: string
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
  items?: ClientQueueItem[]
  onCancelBatch?: () => void
  onCancelItem?: (itemId: string) => void
  onDismiss?: () => void
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
  items,
  onCancelBatch,
  onCancelItem,
  onDismiss,
}: BatchProgressProps) {
  const [showItems, setShowItems] = useState(false)

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

  // 3. Overall composite progress (40% network + 60% backend)
  const overallProgress = Math.min(
    100,
    Math.round(networkProgress * 0.4 + backendProgress * 0.6)
  )

  const isDone = backendProgress >= 100 && networkProgress >= 100

  const getItemIcon = (mimeType: string, filename: string) => {
    const cat = getFileCategory(mimeType, filename)
    switch (cat) {
      case "Image":
        return <ImageIcon className="h-4 w-4 text-purple-500" />
      case "Video":
        return <VideoIcon className="h-4 w-4 text-rose-500" />
      case "Document":
        return <FileTextIcon className="h-4 w-4 text-blue-500" />
      default:
        return <FileIcon className="h-4 w-4 text-slate-500" />
    }
  }

  const renderItemStatus = (status: ClientQueueItem["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
      case "processing":
      case "queued":
        return <Loader2 className="h-3.5 w-3.5 text-indigo-500 animate-spin" />
      case "uploading":
        return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />
      case "waiting":
        return <Clock className="h-3.5 w-3.5 text-slate-400" />
      case "cancelled":
        return <Ban className="h-3.5 w-3.5 text-rose-500" />
      case "failed":
        return <AlertCircle className="h-3.5 w-3.5 text-red-500" />
    }
  }

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/5 via-white to-slate-50 p-5 shadow-sm dark:border-blue-500/20 dark:from-blue-950/20 dark:via-slate-900 dark:to-slate-900/90 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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

        {/* Overall progress indicator & Cancel/Dismiss Controls */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-xs text-slate-500">Overall Progress</span>
            <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100">
              {overallProgress}%
            </p>
          </div>

          {/* Batalkan Antrean button */}
          {!isDone && onCancelBatch && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCancelBatch}
              className="h-8 gap-1.5 text-xs font-semibold text-rose-600 border-rose-500/30 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:border-rose-500/30 dark:hover:bg-rose-950/50"
              title="Batalkan Seluruh Antrean Upload"
            >
              <Ban className="h-3.5 w-3.5" />
              Batalkan Antrean
            </Button>
          )}

          {/* Dismiss button when finished */}
          {isDone && onDismiss && (
            <button
              onClick={onDismiss}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition-colors"
              title="Tutup Ringkasan Antrean"
            >
              <X className="h-4 w-4" />
            </button>
          )}
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

      {/* Expandable Queue Items List */}
      {items && items.length > 0 && (
        <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
          <button
            onClick={() => setShowItems(!showItems)}
            className="w-full flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white py-1 transition-colors"
          >
            <span className="font-semibold flex items-center gap-1.5">
              <span>Daftar File Antrean ({items.length})</span>
              <span className="text-[11px] font-normal text-slate-400">
                &bull; Klik untuk melihat detail &amp; batalkan per file
              </span>
            </span>
            {showItems ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showItems && (
            <div className="mt-2 space-y-2 max-h-60 overflow-y-auto pr-1 scrollbar-thin">
              {items.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-slate-200/70 bg-white/80 dark:border-slate-800/70 dark:bg-slate-950/50 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      {getItemIcon(it.type, it.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {it.name}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span>{formatBytes(it.size)}</span>
                        <span>&bull;</span>
                        <span className="font-mono">
                          {it.status === "uploading"
                            ? `Uploading ${it.networkProgress}%`
                            : it.status === "waiting"
                            ? "Waiting in queue"
                            : it.status === "queued"
                            ? "Queued in Asynq"
                            : it.status === "processing"
                            ? "Optimizing binary..."
                            : it.status === "completed"
                            ? "Completed"
                            : it.status === "cancelled"
                            ? "Cancelled"
                            : "Failed"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Progress percentage during upload */}
                    {it.status === "uploading" && (
                      <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400">
                        {it.networkProgress}%
                      </span>
                    )}

                    {/* Status icon badge */}
                    {renderItemStatus(it.status)}

                    {/* Per-item cancel button */}
                    {onCancelItem &&
                      (it.status === "waiting" ||
                        it.status === "uploading" ||
                        it.status === "queued" ||
                        it.status === "processing") && (
                        <button
                          onClick={() => onCancelItem(it.id)}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                          title="Batalkan File Ini"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
