"use client"

import React from "react"
import {
  CheckCircle2,
  Database,
  Download,
  Eye,
  Sparkles,
  Copy,
  Check,
  ShieldCheck,
  FileCheck2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatBytes } from "@/lib/utils"
import { UploadResult } from "@/lib/types"
import { getDownloadUrl } from "@/lib/api"

interface UploadResultCardProps {
  result: UploadResult
  onPreview?: (result: UploadResult) => void
  onDismiss?: () => void
}

export function UploadResultCard({
  result,
  onPreview,
  onDismiss,
}: UploadResultCardProps) {
  const [copied, setCopied] = React.useState(false)

  const reductionPercentage = result.savedPercentage
    ? result.savedPercentage.toFixed(2)
    : "0.00"

  const copyChecksum = () => {
    navigator.clipboard.writeText(result.checksum)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const storedSize = result.storedSize ?? result.originalSize

  // Visual bar calculation (original is 100%, stored is proportional)
  const storedWidthPct =
    result.originalSize > 0
      ? Math.max(5, Math.min(100, Math.round((storedSize / result.originalSize) * 100)))
      : 100

  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-white to-slate-50 p-6 shadow-md dark:border-emerald-500/20 dark:from-emerald-950/20 dark:via-slate-900/90 dark:to-slate-900">
      {/* Header status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-semibold text-sm tracking-wide uppercase">
            Upload Completed
          </span>
        </div>
        {result.isDuplicate ? (
          <Badge variant="warning" className="gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            Deduplicated (SHA-256 match)
          </Badge>
        ) : (
          <Badge variant="success" className="gap-1">
            <Database className="h-3.5 w-3.5" />
            Stored in PostgreSQL BYTEA
          </Badge>
        )}
      </div>

      {/* File name & quick meta */}
      <div className="mt-3">
        <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
          {result.filename}
        </h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
          ID: {result.id}
        </p>
      </div>

      {/* Storage saving visualization bar */}
      <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/50 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-600 dark:text-slate-400">
            Storage Savings Comparison
          </span>
          {result.savedPercentage > 0 ? (
            <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
              <Sparkles className="h-3.5 w-3.5" />
              {reductionPercentage}% smaller
            </span>
          ) : (
            <span className="text-slate-500">Original preserved (0% reduction)</span>
          )}
        </div>

        {/* Original size bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Original Size</span>
            <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
              {formatBytes(result.originalSize)}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div className="h-full w-full rounded-full bg-slate-400 dark:bg-slate-600" />
          </div>
        </div>

        {/* Stored size bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Stored in PostgreSQL</span>
            <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
              {formatBytes(storedSize)}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${storedWidthPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Metadata Table Grid */}
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs border-t border-slate-100 dark:border-slate-800/80 pt-4">
        <div>
          <span className="text-slate-500 dark:text-slate-400">Original size:</span>
          <p className="font-mono font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
            {formatBytes(result.originalSize)}
          </p>
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">Stored size:</span>
          <p className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
            {formatBytes(storedSize)}
          </p>
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">Saved:</span>
          <p className="font-mono font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
            {formatBytes(result.savedBytes)} ({reductionPercentage}%)
          </p>
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">Compression Engine:</span>
          <p className="font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5 uppercase">
            {result.compression}
          </p>
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">MIME Type:</span>
          <p className="font-mono text-slate-800 dark:text-slate-200 truncate mt-0.5">
            {result.mimeType}
          </p>
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">Database Storage:</span>
          <p className="font-semibold text-blue-600 dark:text-blue-400 mt-0.5">
            PostgreSQL BYTEA
          </p>
        </div>
      </div>

      {/* SHA-256 Checksum row */}
      <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-100/70 p-2 text-xs font-mono dark:bg-slate-800/50">
        <span className="text-slate-500 truncate mr-2">
          SHA-256: {result.checksum}
        </span>
        <button
          onClick={copyChecksum}
          className="shrink-0 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          title="Copy Checksum"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Action buttons */}
      <div className="mt-5 flex items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          {onPreview && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPreview(result)}
              className="gap-1.5 shadow-none"
            >
              <Eye className="h-4 w-4" />
              Preview
            </Button>
          )}
          <a
            href={getDownloadUrl(result.id, true)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700">
              <Download className="h-4 w-4" />
              Download
            </Button>
          </a>
        </div>
        {onDismiss && (
          <Button variant="ghost" size="sm" onClick={onDismiss} className="text-xs text-slate-500">
            Dismiss
          </Button>
        )}
      </div>
    </div>
  )
}
