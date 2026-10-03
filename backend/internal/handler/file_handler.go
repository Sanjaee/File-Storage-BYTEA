package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"filestorage-backend/internal/config"
	"filestorage-backend/internal/service"
)

type FileHandler struct {
	cfg     *config.Config
	service *service.FileService
}

func NewFileHandler(cfg *config.Config, s *service.FileService) *FileHandler {
	return &FileHandler{
		cfg:     cfg,
		service: s,
	}
}

func (h *FileHandler) RegisterRoutes(r chi.Router) {
	// Upload & Batch endpoints
	r.Post("/api/upload", h.FastUpload)
	r.Post("/api/files", h.FastUpload) // backward compatibility
	r.Post("/api/upload-batches", h.CreateBatch)
	r.Get("/api/upload-batches/{id}", h.GetBatch)

	// File Management
	r.Get("/api/files", h.List)
	r.Get("/api/files/{id}", h.DownloadOrStream)
	r.Get("/api/files/{id}/meta", h.GetMetadata)
	r.Delete("/api/files/{id}", h.Delete)
	r.Post("/api/files/bulk-delete", h.BulkDelete)
	r.Get("/api/stats", h.GetStats)
	r.Get("/api/events", h.EventsSSE)

	// Health and Readiness
	r.Get("/health", h.Health)
	r.Get("/ready", h.Ready)
}

// CreateBatch initializes a new batch tracking record
func (h *FileHandler) CreateBatch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TotalFiles int `json:"total"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.TotalFiles <= 0 {
		req.TotalFiles = 1
	}

	batch, err := h.service.CreateBatch(r.Context(), req.TotalFiles)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to create upload batch.")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(batch)
}

// GetBatch returns aggregated real-time batch progress
func (h *FileHandler) GetBatch(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		sendError(w, http.StatusBadRequest, "Invalid batch ID format.")
		return
	}

	batch, err := h.service.GetBatch(r.Context(), id)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to retrieve batch status.")
		return
	}
	if batch == nil {
		sendError(w, http.StatusNotFound, "Batch not found.")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(batch)
}

// FastUpload receives file, stores initial BYTEA in PostgreSQL as 'queued', enqueues to Redis Asynq, and returns IMMEDIATELY!
func (h *FileHandler) FastUpload(w http.ResponseWriter, r *http.Request) {
	maxBytes := h.cfg.MaxUploadSizeMB * 1024 * 1024
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes+1024*1024)

	if err := r.ParseMultipartForm(32 << 20); err != nil {
		if strings.Contains(err.Error(), "request body too large") {
			sendError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("File exceeds maximum size. Maximum allowed size: %d MB.", h.cfg.MaxUploadSizeMB))
			return
		}
		sendError(w, http.StatusBadRequest, "Invalid upload form data.")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		sendError(w, http.StatusBadRequest, "No file provided in form field 'file'.")
		return
	}
	defer file.Close()

	if header.Size > maxBytes {
		sendError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("File exceeds maximum size. Maximum allowed size: %d MB.", h.cfg.MaxUploadSizeMB))
		return
	}

	var batchID *uuid.UUID
	if bStr := r.FormValue("batchId"); bStr != "" {
		if bid, err := uuid.Parse(bStr); err == nil {
			batchID = &bid
		}
	}

	res, err := h.service.FastUpload(r.Context(), header.Filename, file, header.Size, batchID)
	if err != nil {
		if errors.Is(err, service.ErrUnsupportedFileType) {
			sendError(w, http.StatusBadRequest, "Hanya file Gambar (Images), Video, dan PDF yang diizinkan untuk di-upload. File aplikasi, APK, dan executable dilarang.")
			return
		}
		if errors.Is(err, service.ErrFileTooLarge) {
			sendError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("File exceeds maximum size. Maximum allowed size: %d MB.", h.cfg.MaxUploadSizeMB))
			return
		}
		if errors.Is(err, service.ErrEmptyFile) {
			sendError(w, http.StatusBadRequest, "Uploaded file is empty.")
			return
		}
		sendError(w, http.StatusInternalServerError, "Upload failed. The file was not saved.")
		return
	}


	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(res)
}

// List returns files with pagination and filtering
func (h *FileHandler) List(w http.ResponseWriter, r *http.Request) {
	limit := 100
	offset := 0
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 {
			limit = l
		}
	}
	if oStr := r.URL.Query().Get("offset"); oStr != "" {
		if o, err := strconv.Atoi(oStr); err == nil && o >= 0 {
			offset = o
		}
	}

	statusFilter := r.URL.Query().Get("status")
	searchQuery := r.URL.Query().Get("search")

	files, total, err := h.service.ListFiles(r.Context(), limit, offset, statusFilter, searchQuery)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to retrieve files.")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"files":  files,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// DownloadOrStream retrieves binary data from PostgreSQL BYTEA and streams it
func (h *FileHandler) DownloadOrStream(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		sendError(w, http.StatusBadRequest, "Invalid file ID format.")
		return
	}

	if r.URL.Query().Get("meta") == "true" || r.URL.Query().Get("metadata") == "true" {
		h.GetMetadata(w, r)
		return
	}

	fileData, err := h.service.GetFileForDownload(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrFileNotFound) {
			sendError(w, http.StatusNotFound, "File not found.")
			return
		}
		sendError(w, http.StatusInternalServerError, "Failed to retrieve file from storage.")
		return
	}

	etag := fmt.Sprintf(`"%s"`, fileData.Checksum)
	if match := r.Header.Get("If-None-Match"); match == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}

	dispositionType := "inline"
	if r.URL.Query().Get("download") == "true" || r.URL.Query().Get("dl") == "1" {
		dispositionType = "attachment"
	}

	contentDisposition := mime.FormatMediaType(dispositionType, map[string]string{
		"filename": fileData.OriginalName,
	})

	w.Header().Set("Content-Type", fileData.MimeType)
	w.Header().Set("Content-Disposition", contentDisposition)
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")

	http.ServeContent(w, r, fileData.OriginalName, fileData.CreatedAt, bytes.NewReader(fileData.Data))
}

func (h *FileHandler) GetMetadata(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		sendError(w, http.StatusBadRequest, "Invalid file ID format.")
		return
	}

	meta, err := h.service.GetFileMeta(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrFileNotFound) {
			sendError(w, http.StatusNotFound, "File not found.")
			return
		}
		sendError(w, http.StatusInternalServerError, "Failed to retrieve file details.")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(meta)
}

func (h *FileHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		sendError(w, http.StatusBadRequest, "Invalid file ID format.")
		return
	}

	if err := h.service.DeleteFile(r.Context(), id); err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to delete file.")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"message": "File deleted successfully",
		"id":      idStr,
	})
}

// BulkDelete handles deleting multiple files at once by list of UUIDs
func (h *FileHandler) BulkDelete(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDs []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.IDs) == 0 {
		sendError(w, http.StatusBadRequest, "No file IDs provided for bulk deletion.")
		return
	}

	uuids := make([]uuid.UUID, 0, len(req.IDs))
	for _, idStr := range req.IDs {
		if u, err := uuid.Parse(idStr); err == nil {
			uuids = append(uuids, u)
		}
	}

	if len(uuids) == 0 {
		sendError(w, http.StatusBadRequest, "No valid UUIDs provided.")
		return
	}

	deletedCount, err := h.service.DeleteFilesBulk(r.Context(), uuids)
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to bulk delete files.")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"message": fmt.Sprintf("%d files deleted successfully", deletedCount),
		"deleted": deletedCount,
	})
}

func (h *FileHandler) GetStats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.service.GetStats(r.Context())
	if err != nil {
		sendError(w, http.StatusInternalServerError, "Failed to compute storage statistics.")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(stats)
}

func (h *FileHandler) Health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok","storage":"postgresql_bytea","queue":"redis_asynq"}`))
}

func (h *FileHandler) Ready(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"ready":true}`))
}

// EventsSSE streams real-time updates via Server-Sent Events (SSE)
func (h *FileHandler) EventsSSE(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		sendError(w, http.StatusInternalServerError, "Streaming unsupported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	// Initial handshake
	_, _ = fmt.Fprintf(w, "event: connected\ndata: {\"status\":\"ok\"}\n\n")
	flusher.Flush()

	queueClient := h.service.GetQueueClient()
	if queueClient == nil {
		return
	}

	pubsub := queueClient.Subscribe(r.Context())
	if pubsub == nil {
		return
	}
	defer pubsub.Close()

	ch := pubsub.Channel()
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			_, _ = fmt.Fprintf(w, "data: %s\n\n", msg.Payload)
			flusher.Flush()
		case <-ticker.C:
			// keepalive ping to prevent proxy/browser timeout
			_, _ = fmt.Fprintf(w, ": keepalive\n\n")
			flusher.Flush()
		}
	}
}

func sendError(w http.ResponseWriter, statusCode int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error": message,
	})
}

