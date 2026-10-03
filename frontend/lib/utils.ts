import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Section 19: Format Size utility
 * formatBytes(1024) -> 1 KB
 * formatBytes(1048576) -> 1 MB
 * formatBytes(1073741824) -> 1 GB
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (!bytes || bytes <= 0) return "0 B"
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const idx = Math.min(i, sizes.length - 1)
  return `${parseFloat((bytes / Math.pow(k, idx)).toFixed(dm))} ${sizes[idx]}`
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return "0 B/s"
  return `${formatBytes(bytesPerSec, 1)}/s`
}

export function formatETA(seconds: number): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return "--:--"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return "-"
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

export type FileCategory = "Image" | "Video" | "PDF" | "Document" | "Archive" | "Other"

export function getFileCategory(mimeType: string, filename?: string): FileCategory {
  const mime = (mimeType || "").toLowerCase()
  const ext = (filename ? filename.split(".").pop() : "")?.toLowerCase() || ""

  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif", "svg", "bmp", "avif"].includes(ext)) {
    return "Image"
  }
  if (mime.startsWith("video/") || ["mp4", "mkv", "webm", "avi", "mov"].includes(ext)) {
    return "Video"
  }
  if (mime === "application/pdf" || ext === "pdf") {
    return "PDF"
  }
  if (
    mime.startsWith("text/") ||
    mime.includes("json") ||
    mime.includes("xml") ||
    mime.includes("document") ||
    mime.includes("sheet") ||
    mime.includes("presentation") ||
    ["txt", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "json", "md", "html", "css", "js", "ts"].includes(ext)
  ) {
    return "Document"
  }
  if (
    mime.includes("zip") ||
    mime.includes("tar") ||
    mime.includes("compressed") ||
    mime.includes("rar") ||
    ["zip", "rar", "7z", "tar", "gz"].includes(ext)
  ) {
    return "Archive"
  }
  return "Other"
}
