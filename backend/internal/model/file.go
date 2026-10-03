package model

import (
	"time"

	"github.com/google/uuid"
)

type FileStatus string

const (
	StatusQueued     FileStatus = "queued"
	StatusProcessing FileStatus = "processing"
	StatusCompleted  FileStatus = "completed"
	StatusFailed     FileStatus = "failed"
)

// FileRecord represents the metadata of a file stored in PostgreSQL
type FileRecord struct {
	ID           uuid.UUID  `json:"id"`
	BatchID      *uuid.UUID `json:"batchId,omitempty"`
	OriginalName string     `json:"filename"`
	MimeType     string     `json:"mimeType"`
	OriginalSize int64      `json:"originalSize"`
	StoredSize   *int64     `json:"storedSize,omitempty"`
	Compression  *string    `json:"compression,omitempty"`
	Checksum     string     `json:"checksum"`
	Status       FileStatus `json:"status"`
	ErrorMessage *string    `json:"errorMessage,omitempty"`
	CreatedAt    time.Time  `json:"createdAt"`
	ProcessedAt  *time.Time `json:"processedAt,omitempty"`

	// Derived helper fields for JSON serialization
	SavedBytes      int64   `json:"savedBytes"`
	SavedPercentage float64 `json:"savedPercentage"`
}

// FileData contains metadata and the raw BYTEA payload
type FileData struct {
	FileRecord
	Data []byte `json:"-"`
}

// UploadBatch tracks aggregated progress of a multi-file upload session
type UploadBatch struct {
	ID              uuid.UUID  `json:"batchId"`
	TotalFiles      int        `json:"total"`
	QueuedFiles     int        `json:"queued"`
	ProcessingFiles int        `json:"processing"`
	CompletedFiles  int        `json:"completed"`
	FailedFiles     int        `json:"failed"`
	Progress        int        `json:"progress"`
	CreatedAt       time.Time  `json:"createdAt"`
	CompletedAt     *time.Time `json:"completedAt,omitempty"`
}

// UploadResponse is returned immediately upon file ingestion into the queue
type UploadResponse struct {
	BatchID      *uuid.UUID `json:"batchId,omitempty"`
	FileID       uuid.UUID  `json:"fileId"`
	Filename     string     `json:"filename"`
	MimeType     string     `json:"mimeType"`
	OriginalSize int64      `json:"originalSize"`
	Checksum     string     `json:"checksum"`
	Status       FileStatus `json:"status"`
	IsDuplicate  bool       `json:"isDuplicate,omitempty"`
}

// BatchResponse is returned when batch metadata is queried
type BatchResponse struct {
	BatchID    uuid.UUID `json:"batchId"`
	Total      int       `json:"total"`
	Queued     int       `json:"queued"`
	Processing int       `json:"processing"`
	Completed  int       `json:"completed"`
	Failed     int       `json:"failed"`
	Progress   int       `json:"progress"`
}

// StorageStats aggregates storage metrics across completed files
type StorageStats struct {
	TotalFiles       int64   `json:"totalFiles"`
	OriginalSize     int64   `json:"originalSize"`
	StoredSize       int64   `json:"storedSize"`
	StorageSaved     int64   `json:"storageSaved"`
	SavingPercentage float64 `json:"savingPercentage"`
	QueuedFiles      int64   `json:"queuedFiles"`
	ProcessingFiles  int64   `json:"processingFiles"`
	CompletedFiles   int64   `json:"completedFiles"`
	FailedFiles      int64   `json:"failedFiles"`
}

// FileMetadataDetails provides extended metadata for UI modals
type FileMetadataDetails struct {
	FileRecord
	Width           int     `json:"width,omitempty"`
	Height          int     `json:"height,omitempty"`
	Format          string  `json:"format,omitempty"`
	DurationSeconds float64 `json:"duration,omitempty"`
	Codec           string  `json:"codec,omitempty"`
}
