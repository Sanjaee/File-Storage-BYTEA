"use client"

import React, { useState, useRef, useMemo, useEffect } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  FileIcon,
  ImageIcon,
  VideoIcon,
  FileTextIcon,
  ArchiveIcon,
  Download,
  Trash2,
  Eye,
  Search,
  ArrowUpDown,
  Inbox,
  CheckCircle2,
  Loader2,
  Clock,
  AlertCircle,
  CheckSquare,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatBytes, formatDate, getFileCategory } from "@/lib/utils"
import { FileRecord, FileStatus } from "@/lib/types"
import { getDownloadUrl, getStreamUrl } from "@/lib/api"

interface FileListProps {
  files: FileRecord[]
  loading?: boolean
  onSelectFile: (file: FileRecord) => void
  onDeleteRequest: (file: FileRecord) => void
  onBulkDeleteRequest?: (selectedFiles: FileRecord[]) => void
}

export function FileList({
  files,
  loading = false,
  onSelectFile,
  onDeleteRequest,
  onBulkDeleteRequest,
}: FileListProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedStatus, setSelectedStatus] = useState<string>("all")
  const [selectedCategory, setSelectedCategory] = useState<string>("All")
  const [sortField, setSortField] = useState<"createdAt" | "originalSize" | "storedSize" | "saved">("createdAt")
  const [sortAsc, setSortAsc] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const parentRef = useRef<HTMLDivElement>(null)
  const headerCheckboxRef = useRef<HTMLInputElement>(null)

  const categories = ["All", "Image", "Video", "PDF"]
  const statuses = [
    { label: "All Status", value: "all" },
    { label: "Completed", value: "completed" },
    { label: "Processing", value: "processing" },
    { label: "Queued", value: "queued" },
    { label: "Failed", value: "failed" },
  ]

  // Filter and sort files efficiently
  const filteredFiles = useMemo(() => {
    return files
      .filter((f) => {
        const matchesSearch =
          !searchQuery ||
          f.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.checksum.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (f.compression && f.compression.toLowerCase().includes(searchQuery.toLowerCase()))

        if (!matchesSearch) return false

        if (selectedStatus !== "all" && f.status !== selectedStatus) {
          return false
        }

        if (selectedCategory !== "All") {
          const cat = getFileCategory(f.mimeType, f.filename)
          if (cat !== selectedCategory) return false
        }

        return true
      })
      .sort((a, b) => {
        let diff = 0
        if (sortField === "createdAt") {
          diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        } else if (sortField === "originalSize") {
          diff = a.originalSize - b.originalSize
        } else if (sortField === "storedSize") {
          const aSize = a.storedSize ?? a.originalSize
          const bSize = b.storedSize ?? b.originalSize
          diff = aSize - bSize
        } else if (sortField === "saved") {
          diff = a.savedBytes - b.savedBytes
        }
        return sortAsc ? diff : -diff
      })
  }, [files, searchQuery, selectedStatus, selectedCategory, sortField, sortAsc])

  // Sync indeterminate state for header checkbox
  useEffect(() => {
    if (headerCheckboxRef.current) {
      const isAll = filteredFiles.length > 0 && selectedIds.size === filteredFiles.length
      const isSome = selectedIds.size > 0 && selectedIds.size < filteredFiles.length
      headerCheckboxRef.current.indeterminate = isSome
      headerCheckboxRef.current.checked = isAll
    }
  }, [selectedIds, filteredFiles])

  // Clear stale selections if files list changes
  useEffect(() => {
    const existingIds = new Set(files.map((f) => f.id))
    setSelectedIds((prev) => {
      const next = new Set<string>()
      prev.forEach((id) => {
        if (existingIds.has(id)) next.add(id)
      })
      return next.size === prev.size ? prev : next
    })
  }, [files])

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredFiles.length && filteredFiles.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredFiles.map((f) => f.id)))
    }
  }

  const toggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  // TanStack Virtualizer for high-performance rendering of 1,000 to 10,000+ files
  const rowVirtualizer = useVirtualizer({
    count: filteredFiles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64, // 64px row height
    overscan: 8,
  })

  const getCategoryIcon = (mimeType: string, filename: string) => {
    const cat = getFileCategory(mimeType, filename)
    switch (cat) {
      case "Image":
        return <ImageIcon className="h-4 w-4 text-purple-500" />
      case "Video":
        return <VideoIcon className="h-4 w-4 text-rose-500" />
      case "PDF":
        return <FileTextIcon className="h-4 w-4 text-red-500" />
      case "Document":
        return <FileTextIcon className="h-4 w-4 text-blue-500" />
      case "Archive":
        return <ArchiveIcon className="h-4 w-4 text-amber-500" />
      default:
        return <FileIcon className="h-4 w-4 text-slate-500" />
    }
  }

  const renderStatusBadge = (status: FileStatus, errorMsg?: string) => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Completed
          </span>
        )
      case "processing":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Processing
          </span>
        )
      case "queued":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <Clock className="h-3.5 w-3.5" />
            Queued
          </span>
        )
      case "failed":
        return (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400"
            title={errorMsg || "Processing failed"}
          >
            <AlertCircle className="h-3.5 w-3.5" />
            Failed
          </span>
        )
    }
  }

  const toggleSort = (field: "createdAt" | "originalSize" | "storedSize" | "saved") => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(false)
    }
  }

  const selectedFilesList = useMemo(() => {
    return files.filter((f) => selectedIds.has(f.id))
  }, [files, selectedIds])

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/70 shadow-sm backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/60 overflow-hidden flex flex-col">
      {/* Search, Status, and Category Filters Header */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by filename, checksum, format..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status filter tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {statuses.map((st) => (
              <button
                key={st.value}
                onClick={() => setSelectedStatus(st.value)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors shrink-0 ${
                  selectedStatus === st.value
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-xs text-slate-400 mr-1">Category:</span>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors shrink-0 ${
                selectedCategory === cat
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
              }`}
            >
              {cat}
            </button>
          ))}
          <span className="text-xs text-slate-400 ml-auto font-mono">
            Showing {filteredFiles.length} of {files.length}
          </span>
        </div>
      </div>

      {/* Floating / Sticky Bulk Action Toolbar */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-600/10 dark:bg-blue-900/30 border-b border-blue-500/25 px-4 py-2.5 flex items-center justify-between transition-all duration-200">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white shadow-sm">
              {selectedIds.size}
            </span>
            <span className="text-xs font-semibold text-blue-900 dark:text-blue-100">
              {selectedIds.size} {selectedIds.size === 1 ? "file" : "files"} selected
            </span>
            {selectedIds.size < filteredFiles.length && (
              <button
                onClick={() => setSelectedIds(new Set(filteredFiles.map((f) => f.id)))}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium ml-1.5 hidden sm:inline"
              >
                Select all {filteredFiles.length} in view
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              className="h-7 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
            >
              Deselect All
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (onBulkDeleteRequest) {
                  onBulkDeleteRequest(selectedFilesList)
                }
              }}
              className="h-7 gap-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white shadow-sm"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete Selected ({selectedIds.size})
            </Button>
          </div>
        </div>
      )}

      {/* Skeleton Loading State */}
      {loading && files.length === 0 && (
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-14 rounded-xl shimmer-bg border border-slate-100 dark:border-slate-800/50"
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredFiles.length === 0 && (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800/60 dark:text-slate-500 mb-4">
            <Inbox className="h-8 w-8" />
          </div>
          <h4 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            {files.length === 0 ? "No files stored yet" : "No matching files found"}
          </h4>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm">
            {files.length === 0
              ? "Drag and drop any files into the upload area above to queue binary files directly to PostgreSQL BYTEA."
              : "Try adjusting your search query, status, or category filter."}
          </p>
        </div>
      )}

      {/* Virtualized Table for 1,000 to 10,000+ files */}
      {filteredFiles.length > 0 && (
        <div className="flex-1 flex flex-col min-w-full overflow-x-auto">
          {/* Table Header */}
          <div className="grid grid-cols-[40px_48px_minmax(180px,1fr)_110px_85px_85px_80px_75px_100px_90px] gap-2 items-center bg-slate-50/90 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800/60 px-4 py-2.5 text-xs font-semibold select-none min-w-[850px]">
            {/* Select All Checkbox on the left */}
            <div className="flex items-center justify-center">
              <input
                ref={headerCheckboxRef}
                type="checkbox"
                onChange={toggleSelectAll}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer dark:border-slate-700 dark:bg-slate-800 accent-blue-600"
                aria-label="Select all files"
                title="Select all files"
              />
            </div>

            <div>Preview</div>
            <div>Name</div>
            <div>Status</div>
            <div
              onClick={() => toggleSort("originalSize")}
              className="cursor-pointer hover:text-blue-500 flex items-center gap-1"
            >
              Original <ArrowUpDown className="h-3 w-3" />
            </div>
            <div
              onClick={() => toggleSort("storedSize")}
              className="cursor-pointer hover:text-blue-500 flex items-center gap-1"
            >
              Stored <ArrowUpDown className="h-3 w-3" />
            </div>
            <div
              onClick={() => toggleSort("saved")}
              className="cursor-pointer hover:text-blue-500 flex items-center gap-1"
            >
              Saved <ArrowUpDown className="h-3 w-3" />
            </div>
            <div>Engine</div>
            <div
              onClick={() => toggleSort("createdAt")}
              className="cursor-pointer hover:text-blue-500 flex items-center gap-1"
            >
              Created <ArrowUpDown className="h-3 w-3" />
            </div>
            <div className="text-right">Actions</div>
          </div>

          {/* Virtualized Rows Container */}
          <div
            ref={parentRef}
            className="overflow-y-auto max-h-[550px] relative scrollbar-thin min-w-[850px]"
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const file = filteredFiles[virtualRow.index]
                const category = getFileCategory(file.mimeType, file.filename)
                const isImage = category === "Image"
                const streamUrl = getStreamUrl(file.id)
                const storedSize = file.storedSize ?? file.originalSize
                const isSelected = selectedIds.has(file.id)

                return (
                  <div
                    key={file.id}
                    onClick={() => onSelectFile(file)}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className={`grid grid-cols-[40px_48px_minmax(180px,1fr)_110px_85px_85px_80px_75px_100px_90px] gap-2 items-center px-4 transition-colors cursor-pointer text-xs ${
                      isSelected
                        ? "bg-blue-50/70 dark:bg-blue-950/40 border-b border-blue-200/50 dark:border-blue-900/50"
                        : "border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    {/* Item Select Checkbox on the left */}
                    <div
                      className="flex items-center justify-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => toggleSelectOne(file.id, e as unknown as React.MouseEvent)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer dark:border-slate-700 dark:bg-slate-800 accent-blue-600"
                        aria-label={`Select ${file.filename}`}
                      />
                    </div>

                    {/* Preview */}
                    <div onClick={(e) => e.stopPropagation()}>
                      <div
                        onClick={() => onSelectFile(file)}
                        className="h-10 w-10 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200/50 dark:border-slate-700/50 cursor-pointer"
                      >
                        {isImage && file.status === "completed" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={streamUrl}
                            alt={file.filename}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          getCategoryIcon(file.mimeType, file.filename)
                        )}
                      </div>
                    </div>

                    {/* Name */}
                    <div className="min-w-0 pr-2">
                      <p className="font-semibold text-slate-900 dark:text-slate-100 truncate hover:text-blue-500">
                        {file.filename}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono truncate">
                        {file.id}
                      </p>
                    </div>

                    {/* Status */}
                    <div>
                      {renderStatusBadge(file.status, file.errorMessage)}
                    </div>

                    {/* Original Size */}
                    <div className="font-mono text-slate-600 dark:text-slate-400">
                      {formatBytes(file.originalSize)}
                    </div>

                    {/* Stored Size */}
                    <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {file.status === "completed"
                        ? formatBytes(storedSize)
                        : formatBytes(file.originalSize)}
                    </div>

                    {/* Saved */}
                    <div>
                      {file.status === "completed" && file.savedBytes > 0 ? (
                        <div className="flex flex-col">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            {file.savedPercentage.toFixed(1)}%
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {formatBytes(file.savedBytes)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 font-mono">0%</span>
                      )}
                    </div>

                    {/* Compression Engine */}
                    <div>
                      <Badge
                        variant={file.savedBytes > 0 ? "success" : "secondary"}
                        className="uppercase text-[10px] tracking-wider px-1.5 py-0"
                      >
                        {file.compression || "none"}
                      </Badge>
                    </div>

                    {/* Created */}
                    <div className="text-slate-500 dark:text-slate-400 text-[11px] whitespace-nowrap truncate">
                      {formatDate(file.createdAt)}
                    </div>

                    {/* Actions */}
                    <div
                      className="text-right flex items-center justify-end gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-500 hover:text-blue-600"
                        onClick={() => onSelectFile(file)}
                        title="View Details"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <a
                        href={getDownloadUrl(file.id, true)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Download File"
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-500 hover:text-emerald-600"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-500 hover:text-red-600"
                        onClick={() => onDeleteRequest(file)}
                        title="Delete File"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
