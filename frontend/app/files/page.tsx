"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import {
  Database,
  Plus,
  RefreshCw,
  Sun,
  Moon,
  ShieldCheck,
  Zap,
  Layers,
  ArrowUpCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/toast"
import { StorageStats } from "@/components/storage-stats"
import { FileUploadArea } from "@/components/file-upload-area"
import { BatchProgressCard } from "@/components/batch-progress-card"
import { FileList } from "@/components/file-list"
import { FileDetailDialog } from "@/components/file-detail-dialog"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
import { BulkDeleteDialog } from "@/components/bulk-delete-dialog"
import {
  FileRecord,
  StorageStats as StatsType,
  ClientQueueItem,
  UploadBatch,
} from "@/lib/types"
import {
  fetchFiles,
  fetchStats,
  deleteFileApi,
  bulkDeleteFilesApi,
  createBatch,
  getBatch,
  uploadFileFast,
  getApiBaseUrl,
} from "@/lib/api"

const CLIENT_UPLOAD_CONCURRENCY = 5

export default function FilesPage() {
  const { toast } = useToast()

  // State
  const [files, setFiles] = useState<FileRecord[]>([])
  const [stats, setStats] = useState<StatsType | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Upload Queue State (bounded concurrency)
  const [clientQueue, setClientQueue] = useState<ClientQueueItem[]>([])
  const [currentBatch, setCurrentBatch] = useState<UploadBatch | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  // Modals
  const [selectedFileForDetail, setSelectedFileForDetail] = useState<FileRecord | null>(null)
  const [fileToDelete, setFileToDelete] = useState<FileRecord | null>(null)
  const [bulkDeleteTargetFiles, setBulkDeleteTargetFiles] = useState<FileRecord[]>([])

  // Theme
  const [isDarkMode, setIsDarkMode] = useState(true)

  const uploadAreaRef = useRef<HTMLDivElement>(null)
  const queueRef = useRef<ClientQueueItem[]>([])
  queueRef.current = clientQueue

  const activeUploadsCountRef = useRef(0)
  const batchIdRef = useRef<string | null>(null)

  const toggleTheme = () => {
    setIsDarkMode((prev) => {
      const next = !prev
      if (next) {
        document.documentElement.classList.add("dark")
      } else {
        document.documentElement.classList.remove("dark")
      }
      return next
    })
  }

  // Load files and storage stats
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true)
    setRefreshing(true)
    try {
      const [fetchedFiles, fetchedStats] = await Promise.all([
        fetchFiles(1000, 0),
        fetchStats(),
      ])
      setFiles(fetchedFiles.files || [])
      setStats(fetchedStats)
    } catch (err: unknown) {
      if (!isSilent) {
        const msg = err instanceof Error ? err.message : "Failed to load data from storage"
        toast({
          title: "Connection Error",
          description: msg,
          type: "error",
        })
      }
    } finally {
      if (!isSilent) setLoading(false)
      setRefreshing(false)
    }
  }, [toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  // 1. Realtime SSE listener: receives file_uploaded, file_processed, file_failed, files_deleted from Redis Pub/Sub
  useEffect(() => {
    let es: EventSource | null = null
    let reconnectTimeout: NodeJS.Timeout | null = null

    const connectSSE = () => {
      try {
        const url = `${getApiBaseUrl()}/api/events`
        es = new EventSource(url)

        es.onmessage = () => {
          // Instant real-time update when queue task completes, fails, or uploads
          loadData(true)
          if (batchIdRef.current) {
            getBatch(batchIdRef.current).then(setCurrentBatch).catch(() => {})
          }
        }

        es.onerror = () => {
          if (es) {
            es.close()
            es = null
          }
          reconnectTimeout = setTimeout(connectSSE, 3000)
        }
      } catch {
        // Fallback to poller
      }
    }

    connectSSE()

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (es) es.close()
    }
  }, [loadData])

  // 2. High-frequency active reactive poller (1.2s while queue is active, 7s when idle)
  useEffect(() => {
    const hasActiveQueue =
      isUploading ||
      (stats && (stats.queuedFiles > 0 || stats.processingFiles > 0)) ||
      (currentBatch && currentBatch.completed + currentBatch.failed < currentBatch.total)

    const intervalMs = hasActiveQueue ? 1200 : 7000

    const timer = setInterval(async () => {
      loadData(true)
      if (currentBatch?.batchId) {
        try {
          const b = await getBatch(currentBatch.batchId)
          setCurrentBatch(b)
        } catch {
          // ignore
        }
      }
    }, intervalMs)

    return () => clearInterval(timer)
  }, [isUploading, stats?.queuedFiles, stats?.processingFiles, currentBatch, loadData])

  // 3. Tab focus / visibility change listener for immediate fresh data
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadData(true)
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    window.addEventListener("focus", onVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.removeEventListener("focus", onVisibilityChange)
    }
  }, [loadData])

  // Process next files in the client queue with bounded concurrency
  const processNextQueueItems = useCallback(() => {
    const queue = queueRef.current
    const active = activeUploadsCountRef.current

    if (active >= CLIENT_UPLOAD_CONCURRENCY) return

    const availableSlots = CLIENT_UPLOAD_CONCURRENCY - active
    const waitingItems = queue.filter((it) => it.status === "waiting").slice(0, availableSlots)

    if (waitingItems.length === 0) {
      if (active === 0) {
        setIsUploading(false)
      }
      return
    }

    setIsUploading(true)

    waitingItems.forEach((item) => {
      activeUploadsCountRef.current++

      setClientQueue((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, status: "uploading" } : it
        )
      )

      const handle = uploadFileFast(
        item.file,
        batchIdRef.current || undefined,
        (progress, loaded) => {
          setClientQueue((prev) =>
            prev.map((it) =>
              it.id === item.id
                ? { ...it, networkProgress: progress, uploadedBytes: loaded }
                : it
            )
          )
        }
      )

      handle.promise
        .then((res) => {
          setClientQueue((prev) =>
            prev.map((it) =>
              it.id === item.id
                ? {
                    ...it,
                    status: "queued",
                    fileId: res.fileId,
                    networkProgress: 100,
                    uploadedBytes: item.size,
                  }
                : it
            )
          )
          // Realtime: Immediately update files table & storage stats so newly queued file appears at once!
          loadData(true)
        })
        .catch((err) => {
          setClientQueue((prev) =>
            prev.map((it) =>
              it.id === item.id
                ? {
                    ...it,
                    status: "failed",
                    errorMessage: err instanceof Error ? err.message : "Upload failed",
                  }
                : it
            )
          )
        })
        .finally(() => {
          activeUploadsCountRef.current--
          processNextQueueItems()
        })
    })
  }, [])

  // Start upload batch when files are selected
  const handleFilesSelected = async (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return

    try {
      // 1. Create upload batch on server
      const batch = await createBatch(selectedFiles.length)
      batchIdRef.current = batch.batchId
      setCurrentBatch(batch)

      // 2. Enqueue files to client bounded queue
      const newItems: ClientQueueItem[] = selectedFiles.map((file, idx) => ({
        id: `queue-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        networkProgress: 0,
        uploadedBytes: 0,
        status: "waiting",
        batchId: batch.batchId,
      }))

      setClientQueue((prev) => [...newItems, ...prev])

      toast({
        title: "Batch Queued",
        description: `${selectedFiles.length} files added to upload queue (${CLIENT_UPLOAD_CONCURRENCY} concurrent streams).`,
        type: "info",
      })

      // Trigger concurrency loop on next tick
      setTimeout(() => {
        processNextQueueItems()
      }, 50)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create upload batch"
      toast({
        title: "Queue Failed",
        description: msg,
        type: "error",
      })
    }
  }

  // Delete file handler
  const handleConfirmDelete = async (file: FileRecord) => {
    try {
      await deleteFileApi(file.id)
      toast({
        title: "File Deleted",
        description: `Permanently removed "${file.filename}" from PostgreSQL BYTEA.`,
        type: "success",
      })
      loadData(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete file from database."
      toast({
        title: "Delete Failed",
        description: msg,
        type: "error",
      })
      throw err
    }
  }

  // Bulk delete queued handler (processes in batches to avoid network or DB contention)
  const handleBulkDeleteConfirm = async (
    filesToDelete: FileRecord[],
    onProgress: (processed: number, total: number) => void
  ) => {
    const CHUNK_SIZE = 50
    const total = filesToDelete.length
    let processedCount = 0

    try {
      for (let i = 0; i < filesToDelete.length; i += CHUNK_SIZE) {
        const chunk = filesToDelete.slice(i, i + CHUNK_SIZE)
        const ids = chunk.map((f) => f.id)
        await bulkDeleteFilesApi(ids)
        processedCount += chunk.length
        onProgress(Math.min(processedCount, total), total)
      }

      toast({
        title: "Bulk Deletion Completed",
        description: `Successfully purged ${total} files directly from PostgreSQL BYTEA.`,
        type: "success",
      })
      loadData(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Bulk deletion queue failed"
      toast({
        title: "Bulk Delete Failed",
        description: msg,
        type: "error",
      })
      throw err
    }
  }

  const scrollToUpload = () => {
    uploadAreaRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  // Aggregate batch metrics
  const totalInCurrentQueue = clientQueue.length
  const uploadedNetworkCount = clientQueue.filter(
    (q) => q.status === "queued" || q.status === "processing" || q.status === "completed"
  ).length
  const networkUploadedBytes = clientQueue.reduce(
    (acc, q) => acc + (q.uploadedBytes || 0),
    0
  )
  const networkTotalBytes = clientQueue.reduce((acc, q) => acc + q.size, 0)

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col transition-colors duration-200">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 dark:border-slate-800/80 dark:bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-600/20 dark:text-blue-400 border border-blue-500/30 shadow-inner">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                  File Storage
                </h1>
                <Badge variant="outline" className="text-[10px] py-0 border-blue-500/30 text-blue-600 dark:text-blue-400 font-mono">
                  Redis + Asynq + BYTEA
                </Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                Async Queue &middot; Bounded Workers &middot; TanStack Virtual &middot; Zstandard
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => loadData()}
              disabled={refreshing}
              className="h-9 w-9 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800"
              title="Refresh Data"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={toggleTheme}
              className="h-9 w-9 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800"
              title="Toggle Theme"
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            <Button
              onClick={scrollToUpload}
              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs sm:text-sm h-9 px-3 sm:px-4 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Upload
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Section 15: Storage Statistics Dashboard */}
        <section aria-label="Storage Statistics">
          <StorageStats stats={stats} loading={loading} />
        </section>

        {/* Section 19: Batch Queue Progress Card (if uploads active or recent batch exists) */}
        {currentBatch && (
          <section aria-label="Batch Progress">
            <BatchProgressCard
              total={currentBatch.total}
              uploadedNetworkCount={uploadedNetworkCount}
              networkUploadedBytes={networkUploadedBytes}
              networkTotalBytes={networkTotalBytes}
              backendCompleted={currentBatch.completed}
              backendProcessing={currentBatch.processing}
              backendQueued={currentBatch.queued}
              backendFailed={currentBatch.failed}
              activeUploadsCount={activeUploadsCountRef.current}
              isUploading={isUploading}
            />
          </section>
        )}

        {/* Section 6 & 7: Upload Drop Area */}
        <section ref={uploadAreaRef} aria-label="Upload Area" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight">
                Upload Files
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Non-blocking queue ingestion: drops of 100, 1,000, to 10,000+ files upload smoothly without UI freeze.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <Layers className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                5 Concurrent Streams
              </span>
              <span>&bull;</span>
              <span className="flex items-center gap-1">
                <Zap className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
                Background Asynq
              </span>
            </div>
          </div>

          <FileUploadArea onFilesSelected={handleFilesSelected} />
        </section>

        {/* Section 14: Virtualized File List (Smooth for 10,000+ files) */}
        <section aria-label="Stored Files" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight">
                Files
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {files.length} {files.length === 1 ? "file" : "files"} in database &middot; Virtualized 60fps rendering
              </p>
            </div>
          </div>

          <FileList
            files={files}
            loading={loading}
            onSelectFile={(file) => setSelectedFileForDetail(file)}
            onDeleteRequest={(file) => setFileToDelete(file)}
            onBulkDeleteRequest={(targetFiles) => setBulkDeleteTargetFiles(targetFiles)}
          />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-900 bg-white dark:bg-slate-950 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-blue-500" />
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              PostgreSQL BYTEA + Redis Asynq Storage System
            </span>
          </div>
          <div className="flex items-center gap-4 text-slate-500 dark:text-slate-400">
            <span>Next.js App Router</span>
            <span>Golang Asynq Worker</span>
            <span>TanStack Virtual</span>
          </div>
        </div>
      </footer>

      {/* File Detail Modal Dialog */}
      <FileDetailDialog
        file={selectedFileForDetail}
        open={!!selectedFileForDetail}
        onClose={() => setSelectedFileForDetail(null)}
        onDeleteRequest={(file) => setFileToDelete(file)}
      />

      {/* Delete Confirmation Modal Dialog */}
      <DeleteConfirmDialog
        file={fileToDelete}
        open={!!fileToDelete}
        onClose={() => setFileToDelete(null)}
        onConfirm={handleConfirmDelete}
      />

      {/* Bulk Delete Queue Confirmation Modal Dialog */}
      <BulkDeleteDialog
        files={bulkDeleteTargetFiles}
        open={bulkDeleteTargetFiles.length > 0}
        onClose={() => setBulkDeleteTargetFiles([])}
        onConfirm={handleBulkDeleteConfirm}
      />
    </div>
  )
}
