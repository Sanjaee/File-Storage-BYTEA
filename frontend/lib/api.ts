import {
  FileMetadataDetails,
  FileRecord,
  StorageStats,
  UploadBatch,
  UploadResponse,
} from "./types"

export function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL
  }
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:8080`
  }
  return "http://localhost:8080"
}

export async function createBatch(total: number): Promise<UploadBatch> {
  const url = `${getApiBaseUrl()}/api/upload-batches`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ total }),
  })
  if (!res.ok) {
    throw new Error(`Failed to create batch: ${res.statusText}`)
  }
  return res.json()
}

export async function getBatch(batchId: string): Promise<UploadBatch> {
  const url = `${getApiBaseUrl()}/api/upload-batches/${batchId}`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    throw new Error(`Failed to fetch batch progress: ${res.statusText}`)
  }
  return res.json()
}

export function uploadFileFast(
  file: File,
  batchId?: string,
  onProgress?: (percent: number, loaded: number) => void
): { promise: Promise<UploadResponse>; xhr: XMLHttpRequest } {
  const xhr = new XMLHttpRequest()
  const url = `${getApiBaseUrl()}/api/upload`
  const formData = new FormData()
  formData.append("file", file, file.name)
  if (batchId) {
    formData.append("batchId", batchId)
  }

  const promise = new Promise<UploadResponse>((resolve, reject) => {
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        const pct = Math.min(100, Math.round((e.loaded / e.total) * 100))
        onProgress(pct, e.loaded)
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data: UploadResponse = JSON.parse(xhr.responseText)
          resolve(data)
        } catch {
          reject(new Error("Invalid JSON response from server"))
        }
      } else {
        let msg = "Upload failed"
        try {
          const err = JSON.parse(xhr.responseText)
          if (err.error) msg = err.error
        } catch {
          // ignore
        }
        reject(new Error(msg))
      }
    }

    xhr.onerror = () => reject(new Error("Network error during upload"))
    xhr.onabort = () => reject(new Error("Upload aborted"))

    xhr.open("POST", url, true)
    xhr.send(formData)
  })

  return { promise, xhr }
}

export async function fetchFiles(
  limit: number = 2000,
  offset: number = 0,
  status?: string,
  search?: string
): Promise<{ files: FileRecord[]; total: number }> {
  const params = new URLSearchParams()
  params.set("limit", limit.toString())
  params.set("offset", offset.toString())
  if (status && status !== "all") params.set("status", status)
  if (search) params.set("search", search)

  const url = `${getApiBaseUrl()}/api/files?${params.toString()}`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    throw new Error(`Failed to fetch files: ${res.statusText}`)
  }
  return res.json()
}

export async function fetchStats(): Promise<StorageStats> {
  const url = `${getApiBaseUrl()}/api/stats`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    throw new Error(`Failed to fetch storage stats: ${res.statusText}`)
  }
  return res.json()
}

export async function fetchFileMetadata(id: string): Promise<FileMetadataDetails> {
  const url = `${getApiBaseUrl()}/api/files/${id}/meta`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    throw new Error(`Failed to fetch file metadata: ${res.statusText}`)
  }
  return res.json()
}

export async function deleteFileApi(id: string): Promise<void> {
  const url = `${getApiBaseUrl()}/api/files/${id}`
  const res = await fetch(url, { method: "DELETE" })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || "Failed to delete file")
  }
}

export async function bulkDeleteFilesApi(ids: string[]): Promise<{ message: string; deleted: number }> {
  const url = `${getApiBaseUrl()}/api/files/bulk-delete`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || "Failed to bulk delete files")
  }
  return res.json()
}

export async function cancelFileApi(id: string): Promise<{ success: boolean; message: string }> {
  const url = `${getApiBaseUrl()}/api/files/${id}/cancel`
  const res = await fetch(url, { method: "POST" })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || "Failed to cancel file")
  }
  return res.json()
}

export async function cancelBatchApi(batchId: string): Promise<{ success: boolean; cancelledCount: number; message: string }> {
  const url = `${getApiBaseUrl()}/api/upload-batches/${batchId}/cancel`
  const res = await fetch(url, { method: "POST" })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || "Failed to cancel upload batch")
  }
  return res.json()
}

export async function cancelQueueApi(): Promise<{ success: boolean; cancelledCount: number; message: string }> {
  const url = `${getApiBaseUrl()}/api/queue/cancel`
  const res = await fetch(url, { method: "POST" })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || "Failed to cancel queue")
  }
  return res.json()
}

export function getDownloadUrl(id: string, download: boolean = true): string {
  return `${getApiBaseUrl()}/api/files/${id}${download ? "?download=true" : ""}`
}

export function getStreamUrl(id: string): string {
  return `${getApiBaseUrl()}/api/files/${id}`
}


