package utils

import (
	"mime"
	"net/http"
	"path/filepath"
	"strings"
)

// DetectMimeType accurately detects the MIME type using magic bytes and file extension fallback
func DetectMimeType(data []byte, filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))

	// Known exact extensions where sniff might be ambiguous
	knownExts := map[string]string{
		".json": "application/json",
		".csv":  "text/csv",
		".xml":  "application/xml",
		".svg":  "image/svg+xml",
		".css":  "text/css",
		".js":   "application/javascript",
		".ts":   "application/typescript",
		".md":   "text/markdown",
		".txt":  "text/plain",
		".html": "text/html",
		".htm":  "text/html",
		".webp": "image/webp",
		".avif": "image/avif",
		".mp4":  "video/mp4",
		".mkv":  "video/x-matroska",
		".webm": "video/webm",
		".avi":  "video/x-msvideo",
		".mov":  "video/quicktime",
		".pdf":  "application/pdf",
		".zip":  "application/zip",
		".tar":  "application/x-tar",
		".gz":   "application/gzip",
		".7z":   "application/x-7z-compressed",
		".rar":  "application/vnd.rar",
		".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	}

	if expectedMime, found := knownExts[ext]; found {
		return expectedMime
	}

	// Sniff magic bytes if we have data
	if len(data) > 0 {
		sniffSize := len(data)
		if sniffSize > 512 {
			sniffSize = 512
		}
		detected := http.DetectContentType(data[:sniffSize])
		if detected != "" && detected != "application/octet-stream" {
			// Strip charset if present for clean comparison
			if semi := strings.Index(detected, ";"); semi != -1 {
				detected = strings.TrimSpace(detected[:semi])
			}
			return detected
		}
	}

	// Standard mime lookup by extension
	if ext != "" {
		if mimeByExt := mime.TypeByExtension(ext); mimeByExt != "" {
			if semi := strings.Index(mimeByExt, ";"); semi != -1 {
				mimeByExt = strings.TrimSpace(mimeByExt[:semi])
			}
			return mimeByExt
		}
	}

	return "application/octet-stream"
}

// GetCategory returns a friendly category string for UI grouping and icons
func GetCategory(mimeType string) string {
	mimeType = strings.ToLower(mimeType)
	switch {
	case strings.HasPrefix(mimeType, "image/"):
		return "Image"
	case strings.HasPrefix(mimeType, "video/"):
		return "Video"
	case mimeType == "application/pdf":
		return "PDF"
	case strings.HasPrefix(mimeType, "text/") ||
		mimeType == "application/json" ||
		mimeType == "application/xml" ||
		mimeType == "application/javascript":
		return "Document"
	case mimeType == "application/zip" ||
		mimeType == "application/x-tar" ||
		mimeType == "application/gzip" ||
		mimeType == "application/x-7z-compressed" ||
		mimeType == "application/vnd.rar":
		return "Archive"
	default:
		return "Other"
	}
}
