package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"filestorage-backend/internal/config"
	"filestorage-backend/internal/database"
	"filestorage-backend/internal/handler"
	"filestorage-backend/internal/queue"
	"filestorage-backend/internal/service"
)

func main() {
	// Structured logging with slog
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg := config.Load()
	slog.Info("initializing PostgreSQL BYTEA File Storage API with Asynq Queue...",
		"port", cfg.Port,
		"redis_url", cfg.RedisURL,
		"database_url", cfg.DatabaseURL,
	)

	// Database connection with retry loop
	var db *database.DB
	var err error
	for i := 1; i <= 10; i++ {
		db, err = database.InitDB(cfg)
		if err == nil {
			slog.Info("successfully connected to PostgreSQL (BYTEA storage ready)")
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

	// Redis Asynq client
	queueClient := queue.NewClient(cfg.RedisURL, cfg.MaxRetries)
	defer queueClient.Close()

	// Services & Handlers
	fileService := service.NewFileService(cfg, db, compressor, queueClient)
	fileHandler := handler.NewFileHandler(cfg, fileService)

	// HTTP Router
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(120 * time.Second))

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "Range"},
		ExposedHeaders:   []string{"Link", "Content-Length", "Content-Disposition", "ETag", "Accept-Ranges"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	fileHandler.RegisterRoutes(r)

	server := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Port),
		Handler:      r,
		ReadTimeout:  120 * time.Second,
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		slog.Info("API server listening", "url", fmt.Sprintf("http://0.0.0.0:%s", cfg.Port))
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("HTTP server error", "error", err)
			os.Exit(1)
		}
	}()

	<-stopChan
	slog.Info("shutting down HTTP API server gracefully...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		slog.Error("server shutdown error", "error", err)
	}

	slog.Info("API server stopped.")
}
