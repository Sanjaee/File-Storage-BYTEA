package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/hibiken/asynq"

	"filestorage-backend/internal/config"
	"filestorage-backend/internal/database"
	"filestorage-backend/internal/queue"
	"filestorage-backend/internal/service"
)

func main() {
	// Structured logging with slog
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg := config.Load()
	slog.Info("initializing File Storage Asynq Worker...",
		"concurrency", cfg.WorkerConcurrency,
		"redis_url", cfg.RedisURL,
		"max_retries", cfg.MaxRetries,
	)

	// Database connection with retry loop
	var db *database.DB
	var err error
	for i := 1; i <= 10; i++ {
		db, err = database.InitDB(cfg)
		if err == nil {
			slog.Info("worker connected to PostgreSQL (BYTEA storage ready)")
			break
		}
		slog.Warn("attempt waiting for PostgreSQL...", "attempt", i, "error", err)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		slog.Error("could not connect to PostgreSQL", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	// Compressor
	compressor, err := service.NewCompressor(cfg)
	if err != nil {
		slog.Error("could not initialize compressor", "error", err)
		os.Exit(1)
	}

	queueClient := queue.NewClient(cfg.RedisURL, cfg.MaxRetries)
	defer queueClient.Close()

	fileService := service.NewFileService(cfg, db, compressor, queueClient)

	// Asynq worker server
	srv := queue.NewServer(cfg.RedisURL, cfg.WorkerConcurrency)

	mux := asynq.NewServeMux()
	mux.HandleFunc(queue.TypeFileProcess, func(ctx context.Context, t *asynq.Task) error {
		var p queue.FileProcessPayload
		if err := json.Unmarshal(t.Payload(), &p); err != nil {
			slog.Error("failed to unmarshal task payload", "error", err)
			return fmt.Errorf("invalid payload: %w", asynq.SkipRetry)
		}

		retried, _ := asynq.GetRetryCount(ctx)
		maxRetry, _ := asynq.GetMaxRetry(ctx)

		err := fileService.ProcessFileTask(ctx, p.FileID, p.BatchID)
		if err != nil {
			slog.Warn("task processing failed",
				"file_id", p.FileID,
				"retry", retried,
				"max_retry", maxRetry,
				"error", err,
			)

			// If last retry reached, mark file as failed permanently
			if retried >= maxRetry-1 {
				fileService.MarkFileFailed(ctx, p.FileID, p.BatchID, err.Error())
				return fmt.Errorf("task permanently failed: %w", asynq.SkipRetry)
			}
			return err
		}

		return nil
	})

	// Graceful shutdown listener
	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		slog.Info("asynq worker running and waiting for tasks...",
			"queues", "critical (weight 6), default (weight 3), low (weight 1)",
		)
		if err := srv.Run(mux); err != nil {
			slog.Error("asynq server error", "error", err)
		}
	}()

	<-stopChan
	slog.Info("shutting down asynq worker gracefully...")
	srv.Shutdown()
	slog.Info("worker stopped successfully.")
}
