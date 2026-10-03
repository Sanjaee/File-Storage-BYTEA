package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"io"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"

	"filestorage-backend/internal/config"
	"filestorage-backend/internal/database"
	"filestorage-backend/internal/model"
	"filestorage-backend/internal/queue"
	"filestorage-backend/internal/utils"
)

var (
	ErrFileTooLarge     = errors.New("file exceeds maximum allowed size")
	ErrEmptyFile        = errors.New("file cannot be empty")
	ErrFileNotFound     = errors.New("file not found")
	ErrDuplicatePayload = errors.New("duplicate file already exists")
)

type FileService struct {
	cfg         *config.Config
	db          *database.DB
	compressor  *Compressor
	queueClient *queue.Client
}

func NewFileService(cfg *config.Config, db *database.DB, compressor *Compressor, queueClient *queue.Client) *FileService {
	return &FileService{
		cfg:         cfg,
		db:          db,
		compressor:  compressor,
		queueClient: queueClient,
	}
}

// CreateBatch initializes a multi-file batch record
func (s *FileService) CreateBatch(ctx context.Context, totalFiles int) (*model.UploadBatch, error) {
	batch := &model.UploadBatch{
		ID:              uuid.New(),
		TotalFiles:      totalFiles,
		QueuedFiles:     0,
		ProcessingFiles: 0,
		CompletedFiles:  0,
		FailedFiles:     0,
		CreatedAt:       time.Now().UTC(),
	}
	if err := s.db.CreateBatch(ctx, batch); err != nil {
		return nil, fmt.Errorf("failed to create upload batch: %w", err)
	}
	return batch, nil
}

// GetBatch returns current status of a batch
func (s *FileService) GetBatch(ctx context.Context, batchID uuid.UUID) (*model.UploadBatch, error) {
	return s.db.GetBatch(ctx, batchID)
}

// FastUpload saves the initial binary to PostgreSQL BYTEA in 'queued' status and enqueues to Redis
// IT RETURNS IMMEDIATELY TO THE FRONTEND WITHOUT WAITING FOR COMPRESSION!
func (s *FileService) FastUpload(
	ctx context.Context,
	filename string,
	r io.Reader,
	headerSize int64,
	batchID *uuid.UUID,
) (*model.UploadResponse, error) {
	maxBytes := s.cfg.MaxUploadSizeMB * 1024 * 1024
	if headerSize > maxBytes {
		return nil, ErrFileTooLarge
	}

	limitReader := io.LimitReader(r, maxBytes+1)
	buf := new(bytes.Buffer)
	hasher := sha256.New()
	multiWriter := io.MultiWriter(buf, hasher)

	copied, err := io.Copy(multiWriter, limitReader)
	if err != nil {
		return nil, fmt.Errorf("failed to read upload stream: %w", err)
	}

	if copied > maxBytes {
		return nil, ErrFileTooLarge
	}
	if copied == 0 {
		return nil, ErrEmptyFile
	}

	originalData := buf.Bytes()
	originalSize := int64(len(originalData))
	checksum := hex.EncodeToString(hasher.Sum(nil))
	mimeType := utils.DetectMimeType(originalData, filename)

	fileID := uuid.New()
	now := time.Now().UTC()

	// Initial file entry in PostgreSQL with status 'queued'
	fileData := &model.FileData{
		FileRecord: model.FileRecord{
			ID:           fileID,
			BatchID:      batchID,
			OriginalName: filename,
			MimeType:     mimeType,
			OriginalSize: originalSize,
			Checksum:     checksum,
			Status:       model.StatusQueued,
			CreatedAt:    now,
		},
		Data: originalData,
	}

	if err := s.db.SaveInitialFile(ctx, fileData); err != nil {
		return nil, fmt.Errorf("failed to persist initial binary in database: %w", err)
	}

	if batchID != nil {
		_ = s.db.IncrementBatchQueued(ctx, *batchID)
	}

	// Enqueue task to Redis Asynq (carrying ONLY fileId and batchId - ZERO BINARY IN REDIS!)
	if s.queueClient != nil {
		_, err = s.queueClient.EnqueueFileProcess(ctx, fileID, batchID, queue.QueueCritical)
		if err != nil {
			slog.Error("failed to enqueue file processing task", "file_id", fileID, "error", err)
		}
		_ = s.queueClient.PublishEvent(ctx, queue.StorageEvent{
			Type:   "file_uploaded",
			FileID: &fileID,
			Status: string(model.StatusQueued),
		})
	}

	return &model.UploadResponse{
		BatchID:      batchID,
		FileID:       fileID,
		Filename:     filename,
		MimeType:     mimeType,
		OriginalSize: originalSize,
		Checksum:     checksum,
		Status:       model.StatusQueued,
	}, nil
}

// ProcessFileTask is executed by the Asynq background worker
func (s *FileService) ProcessFileTask(ctx context.Context, fileID uuid.UUID, batchID *uuid.UUID) error {
	start := time.Now()
	slog.Info("worker started processing file", "file_id", fileID)

	fileData, err := s.db.GetFileForProcessing(ctx, fileID)
	if err != nil {
		return err // retry on database read error
	}
	if fileData == nil {
		slog.Warn("file not found for processing, skipping", "file_id", fileID)
		return nil
	}

	// Idempotency: if already completed, do nothing
	if fileData.Status == model.StatusCompleted {
		slog.Info("file already completed, skipping", "file_id", fileID)
		return nil
	}

	// Transition to processing
	if err := s.db.UpdateFileStatus(ctx, fileID, model.StatusProcessing); err != nil {
		return err
	}
	if batchID != nil {
		_ = s.db.UpdateBatchTransition(ctx, *batchID, model.StatusQueued, model.StatusProcessing)
	}

	// 1. Deduplication check against existing completed files
	if s.cfg.DeduplicationEnabled {
		existing, err := s.db.FindCompletedByChecksum(ctx, fileData.Checksum)
		if err == nil && existing != nil && existing.ID != fileData.ID {
			storedSize := fileData.OriginalSize
			if existing.StoredSize != nil {
				storedSize = *existing.StoredSize
			}
			compression := "none"
			if existing.Compression != nil {
				compression = *existing.Compression
			}

			if err := s.db.UpdateFileCompleted(ctx, fileID, storedSize, compression, existing.Data); err != nil {
				return err
			}

			if batchID != nil {
				_ = s.db.UpdateBatchTransition(ctx, *batchID, model.StatusProcessing, model.StatusCompleted)
			}
			if s.queueClient != nil {
				_ = s.queueClient.PublishEvent(ctx, queue.StorageEvent{
					Type:   "file_processed",
					FileID: &fileID,
					Status: string(model.StatusCompleted),
				})
			}
			slog.Info("file completed via instant deduplication", "file_id", fileID, "checksum", fileData.Checksum)
			return nil
		}
	}

	// 2. Run compression & optimization pipeline
	compResult, err := s.compressor.Process(ctx, fileData.Data, fileData.OriginalName, fileData.MimeType)
	if err != nil {
		slog.Warn("optimization failed, falling back to original", "file_id", fileID, "error", err)
		compResult = &CompressionResult{
			Data:        fileData.Data,
			Compression: "none",
			StoredSize:  fileData.OriginalSize,
			MimeType:    fileData.MimeType,
		}
	}

	// Persist optimized binary to PostgreSQL BYTEA
	if err := s.db.UpdateFileCompleted(ctx, fileID, compResult.StoredSize, compResult.Compression, compResult.Data); err != nil {
		slog.Error("failed to update completed file in PostgreSQL", "file_id", fileID, "error", err)
		return err // retry on database failure
	}

	if batchID != nil {
		_ = s.db.UpdateBatchTransition(ctx, *batchID, model.StatusProcessing, model.StatusCompleted)
	}

	if s.queueClient != nil {
		_ = s.queueClient.PublishEvent(ctx, queue.StorageEvent{
			Type:   "file_processed",
			FileID: &fileID,
			Status: string(model.StatusCompleted),
		})
	}

	slog.Info("worker finished processing file",
		"file_id", fileID,
		"duration", time.Since(start).String(),
		"original_size", fileData.OriginalSize,
		"stored_size", compResult.StoredSize,
		"compression", compResult.Compression,
	)

	return nil
}

// MarkFileFailed marks a file as permanently failed after max retries
func (s *FileService) MarkFileFailed(ctx context.Context, fileID uuid.UUID, batchID *uuid.UUID, errMsg string) {
	_ = s.db.UpdateFileFailed(ctx, fileID, errMsg)
	if batchID != nil {
		_ = s.db.UpdateBatchTransition(ctx, *batchID, model.StatusProcessing, model.StatusFailed)
	}
	if s.queueClient != nil {
		_ = s.queueClient.PublishEvent(ctx, queue.StorageEvent{
			Type:   "file_failed",
			FileID: &fileID,
			Status: string(model.StatusFailed),
		})
	}
}

// GetFileForDownload retrieves and decompresses if needed
func (s *FileService) GetFileForDownload(ctx context.Context, id uuid.UUID) (*model.FileData, error) {
	fileData, err := s.db.GetFileDataByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if fileData == nil {
		return nil, ErrFileNotFound
	}

	if fileData.Compression != nil && *fileData.Compression == "zstd" {
		decompressed, err := s.compressor.Decompress(fileData.Data, *fileData.Compression)
		if err != nil {
			return nil, fmt.Errorf("failed to decompress file: %w", err)
		}
		fileData.Data = decompressed
	}

	return fileData, nil
}

func (s *FileService) GetFileMeta(ctx context.Context, id uuid.UUID) (*model.FileMetadataDetails, error) {
	fileData, err := s.db.GetFileDataByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if fileData == nil {
		return nil, ErrFileNotFound
	}

	details := &model.FileMetadataDetails{
		FileRecord: fileData.FileRecord,
		Format:     strings.ToUpper(strings.TrimPrefix(fileData.MimeType, "image/")),
	}

	if strings.HasPrefix(fileData.MimeType, "image/") && len(fileData.Data) > 0 {
		cfg, _, err := image.DecodeConfig(bytes.NewReader(fileData.Data))
		if err == nil {
			details.Width = cfg.Width
			details.Height = cfg.Height
		}
	}

	return details, nil
}

func (s *FileService) ListFiles(ctx context.Context, limit, offset int, status, search string) ([]model.FileRecord, int64, error) {
	return s.db.ListFiles(ctx, limit, offset, status, search)
}

func (s *FileService) DeleteFile(ctx context.Context, id uuid.UUID) error {
	err := s.db.DeleteFile(ctx, id)
	if err == nil && s.queueClient != nil {
		_ = s.queueClient.PublishEvent(ctx, queue.StorageEvent{
			Type: "files_deleted",
		})
	}
	return err
}

func (s *FileService) DeleteFilesBulk(ctx context.Context, ids []uuid.UUID) (int64, error) {
	count, err := s.db.DeleteFilesBulk(ctx, ids)
	if err == nil && s.queueClient != nil {
		_ = s.queueClient.PublishEvent(ctx, queue.StorageEvent{
			Type: "files_deleted",
		})
	}
	return count, err
}

func (s *FileService) GetStats(ctx context.Context) (*model.StorageStats, error) {
	return s.db.GetStats(ctx)
}

func (s *FileService) GetQueueClient() *queue.Client {
	return s.queueClient
}

