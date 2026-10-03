"use client"

import React, { useState, useEffect } from "react"
import {
  Download,
  Trash2,
  Copy,
  Check,
  Sparkles,
  Database,
  Calendar,
  Layers,
  FileCheck2,
  HardDrive,
  Maximize2,
  Image as ImageIcon,
  Video as VideoIcon,
} from "lucide-react"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatBytes, formatDate, getFileCategory } from "@/lib/utils"
import { FileRecord, FileMetadataDetails } from "@/lib/types"
import { fetchFileMetadata, getDownloadUrl, getStreamUrl } from "@/lib/api"

interface FileDetailDialogProps {
  file: FileRecord | null
  open: boolean
  onClose: () => void
  onDeleteRequest: (file: FileRecord) => void
}

export function FileDetailDialog({
  file,
  open,
  onClose,
  onDeleteRequest,
}: FileDetailDialogProps) {
  const [details, setDetails] = useState<FileMetadataDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (file && open) {
      setLoading(true)
      fetchFileMetadata(file.id)
        .then((data) => setDetails(data))
        .catch(() => {
          // fallback to base record
          const actualStored = file.storedSize ?? file.originalSize
          const saved = file.originalSize - actualStored
          const pct = file.originalSize > 0 ? (saved / file.originalSize) * 100 : 0
          setDetails({
            ...file,
            savedBytes: saved > 0 ? saved : 0,
            savedPercentage: pct > 0 ? pct : 0,
          })
        })
        .finally(() => setLoading(false))
    } else {
      setDetails(null)
    }
  }, [file, open])

  if (!file) return null

  const category = getFileCategory(file.mimeType, file.filename)
  const actualStored = file.storedSize ?? file.originalSize
  const savedBytes = details ? details.savedBytes : file.originalSize - actualStored
  const savedPercentage = details
    ? details.savedPercentage
    : file.originalSize > 0
    ? ((file.originalSize - actualStored) / file.originalSize) * 100
    : 0

  const copyChecksum = () => {
    navigator.clipboard.writeText(file.checksum)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const streamUrl = getStreamUrl(file.id)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="File Details"
      description="Binary stored directly in PostgreSQL BYTEA"
      className="max-w-2xl"
    >
      <div className="space-y-5">
        {/* Preview Container for Image or Video */}
        {category === "Image" && (
          <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-950 flex items-center justify-center max-h-72 dark:border-slate-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={streamUrl}
              alt={file.filename}
              className="max-h-72 w-auto object-contain rounded-lg"
            />
          </div>
        )}

        {category === "Video" && (
          <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-black flex items-center justify-center max-h-72 dark:border-slate-800">
            <video
              src={streamUrl}
              controls
              className="max-h-72 w-full object-contain rounded-lg"
              preload="metadata"
            >
              Your browser does not support the video tag.
            </video>
          </div>
        )}

        {/* File name & format badges */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
              {file.filename}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
              UUID: {file.id}
            </p>
          </div>
          <Badge
            variant={savedPercentage > 0 ? "success" : "secondary"}
            className="shrink-0 uppercase text-xs"
          >
            {file.compression}
          </Badge>
        </div>

        {/* Savings visual comparison */}
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-800/80 dark:bg-slate-950/40 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              PostgreSQL BYTEA Storage Savings
            </span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {savedPercentage.toFixed(2)}% saved
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            <div className="rounded-lg bg-white p-2 border border-slate-200/60 dark:bg-slate-900 dark:border-slate-800">
              <span className="text-[11px] text-slate-500">Original</span>
              <p className="font-mono font-bold text-sm text-slate-800 dark:text-slate-200">
                {formatBytes(file.originalSize)}
              </p>
            </div>
            <div className="rounded-lg bg-white p-2 border border-slate-200/60 dark:bg-slate-900 dark:border-slate-800">
              <span className="text-[11px] text-slate-500">Stored</span>
              <p className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                {formatBytes(file.storedSize ?? file.originalSize)}
              </p>
            </div>
            <div className="rounded-lg bg-white p-2 border border-slate-200/60 dark:bg-slate-900 dark:border-slate-800">
              <span className="text-[11px] text-slate-500">Saved Bytes</span>
              <p className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400">
                {formatBytes(savedBytes)}
              </p>
            </div>
          </div>
        </div>

        {/* Detailed Metadata Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div className="space-y-0.5">
            <span className="text-slate-500 dark:text-slate-400">MIME Type</span>
            <p className="font-mono text-slate-800 dark:text-slate-200 truncate">
              {file.mimeType}
            </p>
          </div>

          <div className="space-y-0.5">
            <span className="text-slate-500 dark:text-slate-400">Compression</span>
            <p className="font-semibold text-indigo-600 dark:text-indigo-400 uppercase">
              {file.compression}
            </p>
          </div>

          <div className="space-y-0.5">
            <span className="text-slate-500 dark:text-slate-400">Created At</span>
            <p className="text-slate-800 dark:text-slate-200">
              {formatDate(file.createdAt)}
            </p>
          </div>

          {/* Extended image metadata if present */}
          {details?.width && details?.height ? (
            <>
              <div className="space-y-0.5">
                <span className="text-slate-500 dark:text-slate-400">Resolution</span>
                <p className="font-mono text-slate-800 dark:text-slate-200">
                  {details.width} &times; {details.height} px
                </p>
              </div>
              <div className="space-y-0.5">
                <span className="text-slate-500 dark:text-slate-400">Image Format</span>
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  {details.format || "WebP"}
                </p>
              </div>
            </>
          ) : null}

          {/* Extended video metadata if present */}
          {details?.codec && (
            <div className="space-y-0.5">
              <span className="text-slate-500 dark:text-slate-400">Video Codec</span>
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                {details.codec}
              </p>
            </div>
          )}
        </div>

        {/* SHA-256 Checksum block */}
        <div className="space-y-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            SHA-256 Checksum (Integrity & Deduplication)
          </span>
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs font-mono dark:border-slate-800 dark:bg-slate-900">
            <span className="text-slate-800 dark:text-slate-200 break-all mr-2">
              {file.checksum}
            </span>
            <button
              onClick={copyChecksum}
              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors shrink-0"
              title="Copy SHA-256"
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              onClose()
              onDeleteRequest(file)
            }}
            className="gap-1.5"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
            <a
              href={getDownloadUrl(file.id, true)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700">
                <Download className="h-4 w-4" />
                Download
              </Button>
            </a>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
