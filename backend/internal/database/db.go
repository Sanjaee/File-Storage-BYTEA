package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	_ "github.com/jackc/pgx/v5/stdlib"

	"filestorage-backend/internal/config"
	"filestorage-backend/internal/model"
)

type DB struct {
	pool *sql.DB
}

func InitDB(cfg *config.Config) (*DB, error) {
	db, err := sql.Open("pgx", cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("unable to open database connection: %w", err)
	}

	// Performance: connection pool configuration
	db.SetMaxOpenConns(cfg.DBMaxOpenConnections)
	db.SetMaxIdleConns(cfg.DBMaxIdleConnections)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(2 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("database ping failed: %w", err)
	}

	appDB := &DB{pool: db}
	if err := appDB.migrate(ctx); err != nil {
		return nil, fmt.Errorf("failed to run database migrations: %w", err)
	}

	return appDB, nil
}

func (db *DB) Close() error {
	return db.pool.Close()
}

func (db *DB) Pool() *sql.DB {
	return db.pool
}

func (db *DB) migrate(ctx context.Context) error {
	query := `
	DO $$ 
	BEGIN
		IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'file_status') THEN
			CREATE TYPE file_status AS ENUM ('queued', 'processing', 'completed', 'failed', 'cancelled');
		ELSE
			ALTER TYPE file_status ADD VALUE IF NOT EXISTS 'cancelled';
		END IF;
	END $$;

	CREATE TABLE IF NOT EXISTS upload_batches (
		id UUID PRIMARY KEY,
		total_files INT NOT NULL DEFAULT 0,
		queued_files INT NOT NULL DEFAULT 0,
		processing_files INT NOT NULL DEFAULT 0,
		completed_files INT NOT NULL DEFAULT 0,
		failed_files INT NOT NULL DEFAULT 0,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		completed_at TIMESTAMPTZ
	);

	CREATE TABLE IF NOT EXISTS files (
		id UUID PRIMARY KEY,
		batch_id UUID REFERENCES upload_batches(id) ON DELETE SET NULL,
		original_name TEXT NOT NULL,
		mime_type TEXT NOT NULL,
		original_size BIGINT NOT NULL,
		stored_size BIGINT,
		compression TEXT,
		checksum TEXT NOT NULL,
		status file_status NOT NULL DEFAULT 'queued',
		error_message TEXT,
		data BYTEA,
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		processed_at TIMESTAMPTZ
	);

	CREATE INDEX IF NOT EXISTS idx_files_status ON files (status);
	CREATE INDEX IF NOT EXISTS idx_files_batch_id ON files (batch_id);
	CREATE INDEX IF NOT EXISTS idx_files_checksum ON files (checksum);
	CREATE INDEX IF NOT EXISTS idx_files_created_at ON files (created_at DESC);
	`
	_, err := db.pool.ExecContext(ctx, query)
	return err
}

// -------------------------------------------------------------
// BATCH OPERATIONS
// -------------------------------------------------------------

func (db *DB) CreateBatch(ctx context.Context, batch *model.UploadBatch) error {
	query := `
	INSERT INTO upload_batches (id, total_files, queued_files, processing_files, completed_files, failed_files, created_at)
	VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	_, err := db.pool.ExecContext(ctx, query,
		batch.ID,
		batch.TotalFiles,
		batch.QueuedFiles,
		batch.ProcessingFiles,
		batch.CompletedFiles,
		batch.FailedFiles,
		batch.CreatedAt,
	)
	return err
}

func (db *DB) GetBatch(ctx context.Context, id uuid.UUID) (*model.UploadBatch, error) {
	query := `
	SELECT id, total_files, queued_files, processing_files, completed_files, failed_files, created_at, completed_at
	FROM upload_batches
	WHERE id = $1
	`
	row := db.pool.QueryRowContext(ctx, query, id)
	var b model.UploadBatch
	err := row.Scan(&b.ID, &b.TotalFiles, &b.QueuedFiles, &b.ProcessingFiles, &b.CompletedFiles, &b.FailedFiles, &b.CreatedAt, &b.CompletedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	if b.TotalFiles > 0 {
		b.Progress = int(float64(b.CompletedFiles+b.FailedFiles) / float64(b.TotalFiles) * 100)
	}
	return &b, nil
}

func (db *DB) IncrementBatchQueued(ctx context.Context, batchID uuid.UUID) error {
	query := `
	UPDATE upload_batches
	SET queued_files = queued_files + 1,
	    total_files = GREATEST(total_files, queued_files + 1 + processing_files + completed_files + failed_files)
	WHERE id = $1
	`
	_, err := db.pool.ExecContext(ctx, query, batchID)
	return err
}

func (db *DB) UpdateBatchTransition(ctx context.Context, batchID uuid.UUID, fromStatus, toStatus model.FileStatus) error {
	var decField, incField string
	switch fromStatus {
	case model.StatusQueued:
		decField = "queued_files"
	case model.StatusProcessing:
		decField = "processing_files"
	}

	switch toStatus {
	case model.StatusProcessing:
		incField = "processing_files"
	case model.StatusCompleted:
		incField = "completed_files"
	case model.StatusFailed:
		incField = "failed_files"
	}

	if decField == "" || incField == "" {
		return nil
	}

	query := fmt.Sprintf(`
	UPDATE upload_batches
	SET %s = GREATEST(0, %s - 1),
	    %s = %s + 1,
	    completed_at = CASE 
	        WHEN (queued_files - 1 <= 0 AND processing_files - 1 <= 0) THEN NOW() 
	        ELSE completed_at 
	    END
	WHERE id = $1
	`, decField, decField, incField, incField)

	_, err := db.pool.ExecContext(ctx, query, batchID)
	return err
}

// -------------------------------------------------------------
// FILE OPERATIONS
// -------------------------------------------------------------

// SaveInitialFile saves the initial uploaded file directly to PostgreSQL BYTEA in 'queued' status
func (db *DB) SaveInitialFile(ctx context.Context, f *model.FileData) error {
	query := `
	INSERT INTO files (id, batch_id, original_name, mime_type, original_size, stored_size, compression, checksum, status, data, created_at)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`
	storedSize := f.OriginalSize
	_, err := db.pool.ExecContext(ctx, query,
		f.ID,
		f.BatchID,
		f.OriginalName,
		f.MimeType,
		f.OriginalSize,
		storedSize,
		"none",
		f.Checksum,
		model.StatusQueued,
		f.Data,
		f.CreatedAt,
	)
	return err
}

// GetFileForProcessing retrieves the file data for a worker
func (db *DB) GetFileForProcessing(ctx context.Context, id uuid.UUID) (*model.FileData, error) {
	query := `
	SELECT id, batch_id, original_name, mime_type, original_size, stored_size, compression, checksum, status, error_message, data, created_at, processed_at
	FROM files
	WHERE id = $1
	`
	row := db.pool.QueryRowContext(ctx, query, id)
	var f model.FileData
	err := row.Scan(
		&f.ID,
		&f.BatchID,
		&f.OriginalName,
		&f.MimeType,
		&f.OriginalSize,
		&f.StoredSize,
		&f.Compression,
		&f.Checksum,
		&f.Status,
		&f.ErrorMessage,
		&f.Data,
		&f.CreatedAt,
		&f.ProcessedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &f, nil
}

// FindCompletedByChecksum searches for an already completed file with identical checksum (Deduplication)
func (db *DB) FindCompletedByChecksum(ctx context.Context, checksum string) (*model.FileData, error) {
	query := `
	SELECT id, batch_id, original_name, mime_type, original_size, stored_size, compression, checksum, status, data, created_at, processed_at
	FROM files
	WHERE checksum = $1 AND status = 'completed' AND data IS NOT NULL
	LIMIT 1
	`
	row := db.pool.QueryRowContext(ctx, query, checksum)
	var f model.FileData
	err := row.Scan(
		&f.ID,
		&f.BatchID,
		&f.OriginalName,
		&f.MimeType,
		&f.OriginalSize,
		&f.StoredSize,
		&f.Compression,
		&f.Checksum,
		&f.Status,
		&f.Data,
		&f.CreatedAt,
		&f.ProcessedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &f, nil
}

// UpdateFileStatus updates the status of a file
func (db *DB) UpdateFileStatus(ctx context.Context, id uuid.UUID, status model.FileStatus) error {
	query := `UPDATE files SET status = $1 WHERE id = $2`
	_, err := db.pool.ExecContext(ctx, query, status, id)
	return err
}

// UpdateFileCompleted saves compressed BYTEA and marks status as completed
func (db *DB) UpdateFileCompleted(ctx context.Context, id uuid.UUID, storedSize int64, compression string, data []byte) error {
	query := `
	UPDATE files
	SET stored_size = $1,
	    compression = $2,
	    data = $3,
	    status = 'completed',
	    processed_at = NOW(),
	    error_message = NULL
	WHERE id = $4
	`
	_, err := db.pool.ExecContext(ctx, query, storedSize, compression, data, id)
	return err
}

// UpdateFileFailed records processing failure
func (db *DB) UpdateFileFailed(ctx context.Context, id uuid.UUID, errMsg string) error {
	query := `
	UPDATE files
	SET status = 'failed',
	    error_message = $1,
	    processed_at = NOW()
	WHERE id = $2
	`
	_, err := db.pool.ExecContext(ctx, query, errMsg, id)
	return err
}

// GetFileStatus returns the current status of a file
func (db *DB) GetFileStatus(ctx context.Context, id uuid.UUID) (model.FileStatus, error) {
	query := `SELECT status FROM files WHERE id = $1`
	var status model.FileStatus
	err := db.pool.QueryRowContext(ctx, query, id).Scan(&status)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	return status, nil
}

// CancelFile marks a queued or processing file as cancelled, clears bytea payload, and returns the file record
func (db *DB) CancelFile(ctx context.Context, id uuid.UUID) (*model.FileRecord, error) {
	query := `
	UPDATE files
	SET status = 'cancelled',
	    error_message = 'Cancelled by user',
	    data = NULL,
	    processed_at = NOW()
	WHERE id = $1 AND status IN ('queued', 'processing')
	RETURNING id, batch_id, original_name, mime_type, original_size, stored_size, compression, checksum, status, error_message, created_at, processed_at
	`
	row := db.pool.QueryRowContext(ctx, query, id)
	var f model.FileRecord
	err := row.Scan(
		&f.ID,
		&f.BatchID,
		&f.OriginalName,
		&f.MimeType,
		&f.OriginalSize,
		&f.StoredSize,
		&f.Compression,
		&f.Checksum,
		&f.Status,
		&f.ErrorMessage,
		&f.CreatedAt,
		&f.ProcessedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	calculateSavings(&f)
	return &f, nil
}

// CancelBatch marks all queued or processing files in a batch as cancelled
func (db *DB) CancelBatch(ctx context.Context, batchID uuid.UUID) (int64, error) {
	query := `
	UPDATE files
	SET status = 'cancelled',
	    error_message = 'Batch cancelled by user',
	    data = NULL,
	    processed_at = NOW()
	WHERE batch_id = $1 AND status IN ('queued', 'processing')
	`
	res, err := db.pool.ExecContext(ctx, query, batchID)
	if err != nil {
		return 0, err
	}
	cancelledCount, _ := res.RowsAffected()

	batchQuery := `
	UPDATE upload_batches
	SET queued_files = 0,
	    processing_files = 0,
	    failed_files = failed_files + $1,
	    completed_at = NOW()
	WHERE id = $2
	`
	_, _ = db.pool.ExecContext(ctx, batchQuery, cancelledCount, batchID)
	return cancelledCount, nil
}

// CancelAllQueued cancels all currently queued and processing files system-wide
func (db *DB) CancelAllQueued(ctx context.Context) (int64, error) {
	query := `
	UPDATE files
	SET status = 'cancelled',
	    error_message = 'Queue cancelled by user',
	    data = NULL,
	    processed_at = NOW()
	WHERE status IN ('queued', 'processing')
	`
	res, err := db.pool.ExecContext(ctx, query)
	if err != nil {
		return 0, err
	}
	count, _ := res.RowsAffected()

	batchQuery := `
	UPDATE upload_batches
	SET queued_files = 0,
	    processing_files = 0,
	    completed_at = NOW()
	WHERE queued_files > 0 OR processing_files > 0
	`
	_, _ = db.pool.ExecContext(ctx, batchQuery)
	return count, nil
}

// GetFileMetaByID fetches file metadata without the heavy BYTEA payload
func (db *DB) GetFileMetaByID(ctx context.Context, id uuid.UUID) (*model.FileRecord, error) {
	query := `
	SELECT id, batch_id, original_name, mime_type, original_size, stored_size, compression, checksum, status, error_message, created_at, processed_at
	FROM files
	WHERE id = $1
	`
	row := db.pool.QueryRowContext(ctx, query, id)
	var f model.FileRecord
	err := row.Scan(
		&f.ID,
		&f.BatchID,
		&f.OriginalName,
		&f.MimeType,
		&f.OriginalSize,
		&f.StoredSize,
		&f.Compression,
		&f.Checksum,
		&f.Status,
		&f.ErrorMessage,
		&f.CreatedAt,
		&f.ProcessedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	calculateSavings(&f)
	return &f, nil
}

// GetFileDataByID fetches both metadata and BYTEA payload
func (db *DB) GetFileDataByID(ctx context.Context, id uuid.UUID) (*model.FileData, error) {
	query := `
	SELECT id, batch_id, original_name, mime_type, original_size, stored_size, compression, checksum, status, error_message, data, created_at, processed_at
	FROM files
	WHERE id = $1
	`
	row := db.pool.QueryRowContext(ctx, query, id)
	var f model.FileData
	err := row.Scan(
		&f.ID,
		&f.BatchID,
		&f.OriginalName,
		&f.MimeType,
		&f.OriginalSize,
		&f.StoredSize,
		&f.Compression,
		&f.Checksum,
		&f.Status,
		&f.ErrorMessage,
		&f.Data,
		&f.CreatedAt,
		&f.ProcessedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	calculateSavings(&f.FileRecord)
	return &f, nil
}

// ListFiles returns files with optional search and filters
func (db *DB) ListFiles(ctx context.Context, limit, offset int, statusFilter, search string) ([]model.FileRecord, int64, error) {
	var conditions []string
	var args []interface{}
	argIdx := 1

	if statusFilter != "" && statusFilter != "all" {
		conditions = append(conditions, fmt.Sprintf("status = $%d", argIdx))
		args = append(args, statusFilter)
		argIdx++
	}

	if search != "" {
		conditions = append(conditions, fmt.Sprintf("(original_name ILIKE $%d OR checksum ILIKE $%d)", argIdx, argIdx))
		args = append(args, "%"+search+"%")
		argIdx++
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM files %s", whereClause)
	var total int64
	if err := db.pool.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	if limit <= 0 {
		limit = 500
	}

	query := fmt.Sprintf(`
	SELECT id, batch_id, original_name, mime_type, original_size, stored_size, compression, checksum, status, error_message, created_at, processed_at
	FROM files
	%s
	ORDER BY created_at DESC
	LIMIT $%d OFFSET $%d
	`, whereClause, argIdx, argIdx+1)

	args = append(args, limit, offset)

	rows, err := db.pool.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	files := make([]model.FileRecord, 0)
	for rows.Next() {
		var f model.FileRecord
		if err := rows.Scan(
			&f.ID,
			&f.BatchID,
			&f.OriginalName,
			&f.MimeType,
			&f.OriginalSize,
			&f.StoredSize,
			&f.Compression,
			&f.Checksum,
			&f.Status,
			&f.ErrorMessage,
			&f.CreatedAt,
			&f.ProcessedAt,
		); err != nil {
			return nil, 0, err
		}
		calculateSavings(&f)
		files = append(files, f)
	}

	return files, total, rows.Err()
}

func (db *DB) DeleteFile(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM files WHERE id = $1`
	res, err := db.pool.ExecContext(ctx, query, id)
	if err != nil {
		return err
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// DeleteFilesBulk deletes multiple files by their IDs in PostgreSQL
func (db *DB) DeleteFilesBulk(ctx context.Context, ids []uuid.UUID) (int64, error) {
	if len(ids) == 0 {
		return 0, nil
	}

	placeholders := make([]string, len(ids))
	args := make([]interface{}, len(ids))
	for i, id := range ids {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}

	query := fmt.Sprintf("DELETE FROM files WHERE id IN (%s)", strings.Join(placeholders, ", "))
	res, err := db.pool.ExecContext(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// GetStats returns aggregated storage usage and queue counts
func (db *DB) GetStats(ctx context.Context) (*model.StorageStats, error) {
	query := `
	SELECT 
		COUNT(*) FILTER (WHERE status != 'cancelled'), 
		COALESCE(SUM(original_size) FILTER (WHERE status != 'cancelled'), 0), 
		COALESCE(SUM(COALESCE(stored_size, original_size)) FILTER (WHERE status != 'cancelled'), 0),
		COUNT(*) FILTER (WHERE status = 'queued'),
		COUNT(*) FILTER (WHERE status = 'processing'),
		COUNT(*) FILTER (WHERE status = 'completed'),
		COUNT(*) FILTER (WHERE status = 'failed')
	FROM files
	`
	row := db.pool.QueryRowContext(ctx, query)
	var totalFiles int64
	var origSize, storedSize int64
	var queued, processing, completed, failed int64
	if err := row.Scan(&totalFiles, &origSize, &storedSize, &queued, &processing, &completed, &failed); err != nil {
		return nil, err
	}

	saved := origSize - storedSize
	if saved < 0 {
		saved = 0
	}

	var pct float64
	if origSize > 0 {
		pct = (float64(saved) / float64(origSize)) * 100.0
		if pct < 0 {
			pct = 0
		}
	}

	return &model.StorageStats{
		TotalFiles:       totalFiles,
		OriginalSize:     origSize,
		StoredSize:       storedSize,
		StorageSaved:     saved,
		SavingPercentage: pct,
		QueuedFiles:      queued,
		ProcessingFiles:  processing,
		CompletedFiles:   completed,
		FailedFiles:      failed,
	}, nil
}

func calculateSavings(f *model.FileRecord) {
	if f.StoredSize != nil {
		saved := f.OriginalSize - *f.StoredSize
		if saved > 0 {
			f.SavedBytes = saved
			if f.OriginalSize > 0 {
				f.SavedPercentage = (float64(saved) / float64(f.OriginalSize)) * 100.0
			}
		}
	}
}
