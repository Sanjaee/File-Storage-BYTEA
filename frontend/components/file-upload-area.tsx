"use client"

import React, { useRef, useState, useEffect } from "react"
import {
  UploadCloud,
  FileIcon,
  ImageIcon,
  VideoIcon,
  FileTextIcon,
  ArchiveIcon,
  X,
  ArrowUpCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatBytes, getFileCategory } from "@/lib/utils"

interface SelectedFile {
  id: string
  file: File
  previewUrl?: string
  category: string
}

interface FileUploadAreaProps {
  onFilesSelected: (files: File[]) => void
  disabled?: boolean
}

export function FileUploadArea({
  onFilesSelected,
  disabled = false,
}: FileUploadAreaProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Clean up object URLs when selected files change or unmount
  useEffect(() => {
    return () => {
      selectedFiles.forEach((sf) => {
        if (sf.previewUrl) URL.revokeObjectURL(sf.previewUrl)
      })
    }
  }, [selectedFiles])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    if (disabled) return

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files))
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(Array.from(e.target.files))
      // Reset input so same file can be selected again if needed
      e.target.value = ""
    }
  }

  const processFiles = (files: File[]) => {
    const newItems: SelectedFile[] = files.map((file) => {
      const category = getFileCategory(file.type, file.name)
      let previewUrl: string | undefined = undefined

      // Generate object URL for image or video preview without loading to memory
      if (category === "Image" || category === "Video") {
        previewUrl = URL.createObjectURL(file)
      }

      return {
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        previewUrl,
        category,
      }
    })

    setSelectedFiles((prev) => [...prev, ...newItems])
  }

  const removeFile = (id: string) => {
    setSelectedFiles((prev) => {
      const item = prev.find((f) => f.id === id)
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
      return prev.filter((f) => f.id !== id)
    })
  }

  const clearAll = () => {
    selectedFiles.forEach((sf) => {
      if (sf.previewUrl) URL.revokeObjectURL(sf.previewUrl)
    })
    setSelectedFiles([])
  }

  const handleStartUpload = () => {
    if (selectedFiles.length === 0) return
    const filesToUpload = selectedFiles.map((sf) => sf.file)
    onFilesSelected(filesToUpload)
    clearAll()
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "Image":
        return <ImageIcon className="h-4 w-4 text-purple-500" />
      case "Video":
        return <VideoIcon className="h-5 w-5 text-rose-500" />
      case "Document":
        return <FileTextIcon className="h-4 w-4 text-blue-500" />
      case "Archive":
        return <ArchiveIcon className="h-4 w-4 text-amber-500" />
      default:
        return <FileIcon className="h-4 w-4 text-slate-500" />
    }
  }

  return (
    <div className="space-y-4">
      {/* Drop Zone Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-300 cursor-pointer ${
          isDragOver
            ? "border-blue-500 bg-blue-500/10 scale-[1.008]"
            : "border-slate-300 bg-white/50 hover:border-blue-400 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:border-slate-700 dark:hover:bg-slate-900/80"
        } ${disabled ? "opacity-60 pointer-events-none" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
          disabled={disabled}
        />

        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 shadow-inner mb-4 transition-transform group-hover:scale-110">
          <UploadCloud className="h-8 w-8" />
        </div>

        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Drag & Drop Files
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          or <span className="font-semibold text-blue-600 dark:text-blue-400 underline underline-offset-4">click to browse</span> from your device
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">
            <ImageIcon className="h-3.5 w-3.5 text-purple-500" /> Images
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">
            <VideoIcon className="h-3.5 w-3.5 text-rose-500" /> Videos
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">
            <FileTextIcon className="h-3.5 w-3.5 text-blue-500" /> Documents
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">
            <ArchiveIcon className="h-3.5 w-3.5 text-amber-500" /> Archives
          </span>
          <span>&bull; Up to 500 MB per file &bull; Direct PostgreSQL BYTEA</span>
        </div>
      </div>

      {/* Selected file staging area if files picked */}
      {selectedFiles.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Selected Files ({selectedFiles.length})
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={clearAll} className="h-8 text-xs text-slate-500">
                Clear all
              </Button>
              <Button
                size="sm"
                onClick={handleStartUpload}
                className="gap-1.5 bg-blue-600 hover:bg-blue-700 h-8"
              >
                <ArrowUpCircle className="h-4 w-4" />
                Upload All ({selectedFiles.length})
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-3 max-h-60 overflow-y-auto">
            {selectedFiles.map((item) => (
              <div
                key={item.id}
                className="relative flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50 group"
              >
                {/* Thumbnail Preview */}
                <div className="h-12 w-12 shrink-0 rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                  {item.category === "Image" && item.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className="h-full w-full object-cover"
                    />
                  ) : item.category === "Video" && item.previewUrl ? (
                    <video
                      src={item.previewUrl}
                      className="h-full w-full object-cover"
                      muted
                      preload="metadata"
                    />
                  ) : (
                    getCategoryIcon(item.category)
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {item.file.name}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {formatBytes(item.file.size)} &middot; {item.category}
                  </p>
                </div>

                <button
                  onClick={() => removeFile(item.id)}
                  className="rounded-lg p-1 text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
