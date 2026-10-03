package service

import (
	"context"
	"strings"
	"testing"

	"filestorage-backend/internal/config"
)

func TestZstandardCompression(t *testing.T) {
	cfg := &config.Config{
		ImageQuality: 80,
	}

	comp, err := NewCompressor(cfg)
	if err != nil {
		t.Fatalf("failed to create compressor: %v", err)
	}

	sampleText := strings.Repeat("This is a repetitive test payload designed for Zstandard compression benchmark. ", 50)
	originalData := []byte(sampleText)

	ctx := context.Background()
	result, err := comp.Process(ctx, originalData, "benchmark.txt", "text/plain")
	if err != nil {
		t.Fatalf("Process failed: %v", err)
	}

	if result.Compression != "zstd" {
		t.Errorf("expected compression zstd, got %s", result.Compression)
	}

	if result.StoredSize >= int64(len(originalData)) {
		t.Errorf("expected compressed size (%d) < original size (%d)", result.StoredSize, len(originalData))
	}

	// Test Decompression
	decompressed, err := comp.Decompress(result.Data, result.Compression)
	if err != nil {
		t.Fatalf("Decompress failed: %v", err)
	}

	if string(decompressed) != sampleText {
		t.Errorf("decompressed text does not match original")
	}
}

func TestAlreadyCompressedBypass(t *testing.T) {
	cfg := &config.Config{
		ImageQuality: 80,
	}

	comp, err := NewCompressor(cfg)
	if err != nil {
		t.Fatalf("failed to create compressor: %v", err)
	}

	dummyData := []byte("already compressed content")
	ctx := context.Background()

	result, err := comp.Process(ctx, dummyData, "archive.zip", "application/zip")
	if err != nil {
		t.Fatalf("Process failed: %v", err)
	}

	if result.Compression != "none" {
		t.Errorf("expected compression none for zip file, got %s", result.Compression)
	}

	if result.StoredSize != int64(len(dummyData)) {
		t.Errorf("expected stored size to equal original size")
	}
}
