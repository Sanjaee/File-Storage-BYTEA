"use client"

import React from "react"
import {
  FileIcon,
  ImageIcon,
  VideoIcon,
  FileTextIcon,
  ArchiveIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  RotateCcw,
  Zap,
} from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { formatBytes, formatSpeed, formatETA, getFileCategory } from "@/lib/utils"
import { UploadProgressItem } from "@/lib/types"

interface UploadProgressCardProps {
  item: UploadProgressItem
  onCancel?: (id: string) => void
  onRetry?: (item: UploadProgressItem) => void
}

export function UploadProgressCard({
  item,
  onCancel,
  onRetry,
}: UploadProgressCardProps) {
  const category = getFileCategory(item.type, item.name)

  const renderIcon = () => {
    switch (category) {
      case "Image":
        return <ImageIcon className="h-5 w-5 text-purple-500" />
      case "Video":
        return <VideoIcon className="h-5 w-5 text-rose-500" />
      case "Document":
        return <FileTextIcon className="h-5 w-5 text-blue-500" />
      case "Archive":
        return <ArchiveIcon className="h-5 w-5 text-amber-500" />
      default:
        return <FileIcon className="h-5 w-5 text-slate-500" />
    }
  }

  const isUploading = item.phase === "uploading" || item.phase === "queued"
  const isServerProcessing =
    item.phase === "processing" ||
    item.phase === "optimizing" ||
    item.phase === "compressing" ||
    item.phase === "saving"
  const isCompleted = item.phase === "completed"
  const isError = item.phase === "error"

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/80 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
            {item.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.previewUrl}
                alt={item.name}
                className="h-10 w-10 rounded-xl object-cover"
              />
            ) : (
              renderIcon()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {item.name}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {formatBytes(item.size)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {isUploading && onCancel && (
            <button
              onClick={() => onCancel(item.id)}
              className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Cancel Upload"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {isError && onRetry && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRetry(item)}
              className="h-7 px-2 text-xs gap-1 text-blue-600 border-blue-500/30 dark:text-blue-400"
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </Button>
          )}
        </div>
      </div>

      {/* Progress & metrics */}
      <div className="mt-3 space-y-2">
        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium">
              {isUploading
                ? `Uploading... ${item.progress}%`
                : isServerProcessing
                ? "Processing binary on server..."
                : isCompleted
                ? "Completed"
                : "Error"}
            </span>
            <span className="font-mono">{item.progress}%</span>
          </div>
          <Progress
            value={item.progress}
            indicatorClassName={
              isCompleted
                ? "bg-emerald-500"
                : isError
                ? "bg-red-500"
                : isServerProcessing
                ? "bg-indigo-500 animate-pulse"
                : "bg-blue-600"
            }
          />
        </div>

        {/* Upload Metrics (Speed, ETA, bytes) */}
        {isUploading && item.progress < 100 && (
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
            <span>
              Uploaded:{" "}
              <strong className="text-slate-700 dark:text-slate-300 font-mono">
                {formatBytes(item.uploadedBytes)} / {formatBytes(item.totalBytes)}
              </strong>
            </span>
            <div className="flex items-center gap-3 font-mono">
              <span>Speed: {formatSpeed(item.speedBytesPerSec)}</span>
              <span>ETA: {formatETA(item.etaSeconds)}</span>
            </div>
          </div>
        )}

        {/* Section 9: Server Processing Stages Indicator */}
        {isServerProcessing && (
          <div className="rounded-lg bg-indigo-50/70 p-2.5 text-xs text-indigo-950 dark:bg-indigo-950/40 dark:text-indigo-200 border border-indigo-200/50 dark:border-indigo-800/50 space-y-1 animate-in fade-in">
            <div className="flex items-center gap-2 font-medium">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
              <span>{item.statusMessage || "Processing binary..."}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-indigo-700/80 dark:text-indigo-300/80 pl-5">
              <span>
                {item.phase === "optimizing"
                  ? "Re-encoding image to WebP format..."
                  : item.phase === "compressing"
                  ? "Compressing via Zstandard algorithm..."
                  : item.phase === "saving"
                  ? "Writing BYTEA directly to PostgreSQL..."
                  : "Analyzing binary & SHA-256..."}
              </span>
              <span className="italic">Please wait...</span>
            </div>
          </div>
        )}

        {/* Completed status banner */}
        {isCompleted && (
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 pt-1">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              ✓ Upload completed &middot; Stored in PostgreSQL BYTEA
            </span>
          </div>
        )}

        {/* Error banner */}
        {isError && (
          <div className="flex items-center gap-2 text-xs font-medium text-red-600 dark:text-red-400 pt-1">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{item.error || "Upload failed."}</span>
          </div>
        )}
      </div>
    </div>
  )
}
