"use client"

import React, { useState } from "react"
import { AlertTriangle, Trash2, Loader2, CheckCircle2, Database, Layers } from "lucide-react"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FileRecord } from "@/lib/types"
import { formatBytes } from "@/lib/utils"

interface BulkDeleteDialogProps {
  files: FileRecord[]
  open: boolean
  onClose: () => void
  onConfirm: (files: FileRecord[], onProgress: (processed: number, total: number) => void) => Promise<void>
}

export function BulkDeleteDialog({
  files,
  open,
  onClose,
  onConfirm,
}: BulkDeleteDialogProps) {
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ processed: 0, total: 0 })
  const [completed, setCompleted] = useState(false)

  if (!files || files.length === 0) return null

  const totalBytes = files.reduce((acc, f) => acc + (f.storedSize ?? f.originalSize ?? 0), 0)

  const handleDelete = async () => {
    try {
      setLoading(true)
      setProgress({ processed: 0, total: files.length })
      await onConfirm(files, (processed, total) => {
        setProgress({ processed, total })
      })
      setCompleted(true)
      setTimeout(() => {
        setCompleted(false)
        setLoading(false)
        onClose()
      }, 600)
    } catch {
      setLoading(false)
    }
  }

  const progressPercent =
    progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!loading) {
          onClose()
        }
      }}
      title={`Delete ${files.length} Selected Files?`}
      className="max-w-lg"
    >
      <div className="space-y-4">
        {/* Warning card */}
        <div className="flex items-start gap-3 rounded-xl bg-red-500/10 p-3.5 text-red-600 dark:text-red-400 border border-red-500/20">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-1">
            <p className="font-semibold text-sm">
              Bulk Permanent Deletion Queue
            </p>
            <p className="text-xs opacity-90 leading-relaxed">
              This will permanently delete <strong className="font-semibold">{files.length} selected files</strong> directly from PostgreSQL <code className="bg-red-500/15 px-1 py-0.5 rounded text-[11px] font-mono">BYTEA</code> storage.
            </p>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-100/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-blue-500" />
            <div>
              <p className="text-slate-400 text-[11px]">Storage to Reclaim</p>
              <p className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                {formatBytes(totalBytes)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-indigo-500" />
            <div>
              <p className="text-slate-400 text-[11px]">Execution Queue</p>
              <p className="font-bold text-slate-800 dark:text-slate-200">
                Batch Asynchronous
              </p>
            </div>
          </div>
        </div>

        {/* Selected preview filenames preview (first 5 items) */}
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-slate-400">Selected items to purge:</p>
          <div className="max-h-28 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
            {files.slice(0, 5).map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
              >
                <span className="truncate max-w-[280px] font-medium text-slate-700 dark:text-slate-300">
                  {f.filename}
                </span>
                <span className="font-mono text-[10px] text-slate-400 shrink-0">
                  {formatBytes(f.storedSize ?? f.originalSize)}
                </span>
              </div>
            ))}
            {files.length > 5 && (
              <p className="text-[11px] text-slate-400 italic text-center py-1">
                + {files.length - 5} more files...
              </p>
            )}
          </div>
        </div>

        {/* Active Queue Progress Bar */}
        {loading && (
          <div className="space-y-2 p-3 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-900/50">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium text-blue-600 dark:text-blue-400">
                {completed ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    All files deleted!
                  </>
                ) : (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Deleting from PostgreSQL BYTEA queue...
                  </>
                )}
              </span>
              <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                {progress.processed} / {progress.total} ({progressPercent}%)
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full bg-red-600 transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={loading}
            className="gap-1.5"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {loading ? "Deleting..." : `Delete ${files.length} Files`}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
