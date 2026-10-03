export type FileStatus = "queued" | "processing" | "completed" | "failed" | "cancelled"

export interface FileRecord {
  id: string
  batchId?: string
  filename: string
  mimeType: string
  originalSize: number
  storedSize?: number
  compression?: string
  checksum: string
  status: FileStatus
  errorMessage?: string
  createdAt: string
  processedAt?: string
  savedBytes: number
  savedPercentage: number
  isDuplicate?: boolean
}

export type UploadResult = FileRecord

export interface UploadBatch {
  batchId: string
  total: number
  queued: number
  processing: number
  completed: number
  failed: number
  progress: number
}

export interface UploadResponse {
  batchId?: string
  fileId: string
  filename: string
  mimeType: string
  originalSize: number
  checksum: string
  status: FileStatus
  isDuplicate?: boolean
}

export interface StorageStats {
  totalFiles: number
  originalSize: number
  storedSize: number
  storageSaved: number
  savingPercentage: number
  queuedFiles: number
  processingFiles: number
  completedFiles: number
  failedFiles: number
}

export interface FileMetadataDetails extends FileRecord {
  width?: number
  height?: number
  format?: string
  duration?: number
  codec?: string
}

export interface ClientQueueItem {
  id: string
  file: File
  name: string
  size: number
  type: string
  networkProgress: number
  uploadedBytes: number
  status: "waiting" | "uploading" | "queued" | "processing" | "completed" | "failed" | "cancelled"
  fileId?: string
  batchId?: string
  result?: FileRecord
  errorMessage?: string
  xhr?: XMLHttpRequest
}

export type UploadPhase =
  | "queued"
  | "uploading"
  | "processing"
  | "optimizing"
  | "compressing"
  | "saving"
  | "completed"
  | "error"

export interface UploadProgressItem {
  id: string
  file: File
  name: string
  size: number
  type: string
  progress: number
  uploadedBytes: number
  totalBytes: number
  speedBytesPerSec: number
  etaSeconds: number
  phase: UploadPhase
  statusMessage: string
  result?: UploadResult
  error?: string
  xhr?: XMLHttpRequest
  previewUrl?: string
}
