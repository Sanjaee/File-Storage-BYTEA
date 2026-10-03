"use client"

import React, { useState } from "react"
import { AlertTriangle, Trash2, Loader2 } from "lucide-react"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FileRecord } from "@/lib/types"

interface DeleteConfirmDialogProps {
  file: FileRecord | null
  open: boolean
  onClose: () => void
  onConfirm: (file: FileRecord) => Promise<void>
}

export function DeleteConfirmDialog({
  file,
  open,
  onClose,
  onConfirm,
}: DeleteConfirmDialogProps) {
  const [loading, setLoading] = useState(false)

  if (!file) return null

  const handleDelete = async () => {
    try {
      setLoading(true)
      await onConfirm(file)
      onClose()
    } catch {
      // handled by parent toast
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Delete file?" className="max-w-md">
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl bg-red-500/10 p-3 text-red-600 dark:text-red-400 border border-red-500/20">
          <AlertTriangle className="h-6 w-6 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{file.filename}</p>
            <p className="text-xs opacity-90">
              This will permanently delete the binary stored in PostgreSQL BYTEA.
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Are you sure you want to proceed? This operation cannot be undone and will immediately reclaim database disk space.
        </p>

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
            Delete
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
