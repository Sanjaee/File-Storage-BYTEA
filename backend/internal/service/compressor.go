package service

import (
	"bytes"
	"context"
	"fmt"
	"image"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/HugoSmits86/nativewebp"
	"github.com/klauspost/compress/zstd"
	_ "golang.org/x/image/webp"

	"filestorage-backend/internal/config"
)

type CompressionResult struct {
	Data        []byte
	Compression string // "zstd", "webp", "jpeg", "h265", "none"
	StoredSize  int64
	MimeType    string
	Width       int
	Height      int
	Duration    float64
	Codec       string
}

type Compressor struct {
	cfg        *config.Config
	zstdWriter *zstd.Encoder
	zstdReader *zstd.Decoder
}

func NewCompressor(cfg *config.Config) (*Compressor, error) {
	enc, err := zstd.NewWriter(nil, zstd.WithEncoderLevel(zstd.SpeedBetterCompression))
	if err != nil {
		return nil, fmt.Errorf("failed to init zstd writer: %w", err)
	}

	dec, err := zstd.NewReader(nil)
	if err != nil {
		return nil, fmt.Errorf("failed to init zstd reader: %w", err)
	}

	return &Compressor{
		cfg:        cfg,
		zstdWriter: enc,
		zstdReader: dec,
	}, nil
}

// Process analyzes MIME type, compresses/optimizes data, and returns the smallest binary payload
func (c *Compressor) Process(ctx context.Context, originalData []byte, filename string, mimeType string) (*CompressionResult, error) {
	origLen := int64(len(originalData))

	result := &CompressionResult{
		Data:        originalData,
		Compression: "none",
		StoredSize:  origLen,
		MimeType:    mimeType,
	}

	// 1. Check if already compressed format
	if c.isAlreadyCompressed(mimeType, filename) {
		return result, nil
	}

	// 2. Check Text formats: compress with Zstandard
	if c.isTextFormat(mimeType, filename) {
		compressed := c.zstdWriter.EncodeAll(originalData, make([]byte, 0, len(originalData)/2))
		if int64(len(compressed)) < origLen {
			result.Data = compressed
			result.Compression = "zstd"
			result.StoredSize = int64(len(compressed))
		}
		return result, nil
	}

	// 3. Check Image formats: JPEG, PNG, etc.
	if c.isOptimizableImage(mimeType, filename) {
		optResult, err := c.optimizeImage(originalData, mimeType)
		if err == nil && optResult != nil {
			result.Width = optResult.Width
			result.Height = optResult.Height
			if int64(len(optResult.Data)) < origLen {
				result.Data = optResult.Data
				result.Compression = optResult.Compression
				result.StoredSize = int64(len(optResult.Data))
				result.MimeType = optResult.MimeType
			}
		}
		return result, nil
	}

	// 4. Check Video formats: optional FFmpeg transcoding
	if strings.HasPrefix(mimeType, "video/") {
		if c.cfg.EnableVideoTranscoding {
			transResult, err := c.transcodeVideo(ctx, originalData, filename)
			if err == nil && transResult != nil {
				if int64(len(transResult.Data)) < origLen {
					result.Data = transResult.Data
					result.Compression = transResult.Compression
					result.StoredSize = int64(len(transResult.Data))
					result.MimeType = transResult.MimeType
					result.Codec = transResult.Codec
				}
			}
		}
		// For videos without transcoding or where transcoded >= original, store original as "none"
		return result, nil
	}

	return result, nil
}

// Decompress decompresses stored binary data back to original form if compressed
func (c *Compressor) Decompress(data []byte, compression string) ([]byte, error) {
	switch compression {
	case "zstd":
		return c.zstdReader.DecodeAll(data, nil)
	default:
		// "none", "webp", "h265", "av1" are stored as directly readable formats
		return data, nil
	}
}

func (c *Compressor) isTextFormat(mimeType string, filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	textExts := map[string]bool{
		".txt": true, ".json": true, ".csv": true, ".xml": true,
		".html": true, ".htm": true, ".css": true, ".js": true,
		".ts": true, ".tsx": true, ".jsx": true, ".md": true,
		".svg": true, ".yaml": true, ".yml": true, ".sql": true,
	}
	if textExts[ext] {
		return true
	}

	return strings.HasPrefix(mimeType, "text/") ||
		mimeType == "application/json" ||
		mimeType == "application/xml" ||
		mimeType == "application/javascript" ||
		mimeType == "application/x-javascript" ||
		mimeType == "text/csv"
}

func (c *Compressor) isOptimizableImage(mimeType string, filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == ".jpg" || ext == ".jpeg" || ext == ".png" || ext == ".bmp" {
		return true
	}
	return mimeType == "image/jpeg" || mimeType == "image/png" || mimeType == "image/bmp"
}

func (c *Compressor) isAlreadyCompressed(mimeType string, filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	alreadyExts := map[string]bool{
		".zip": true, ".rar": true, ".7z": true, ".gz": true, ".tar": true,
		".pdf": true, ".mp4": true, ".mkv": true, ".webm": true,
		".webp": true, ".avif": true, ".mp3": true, ".aac": true,
	}
	if alreadyExts[ext] {
		return true
	}

	return mimeType == "application/zip" ||
		mimeType == "application/x-rar-compressed" ||
		mimeType == "application/x-7z-compressed" ||
		mimeType == "application/pdf" ||
		mimeType == "image/webp" ||
		mimeType == "image/avif" ||
		mimeType == "video/mp4"
}

func (c *Compressor) optimizeImage(originalData []byte, mimeType string) (*CompressionResult, error) {
	img, _, err := image.Decode(bytes.NewReader(originalData))
	if err != nil {
		return nil, err
	}

	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()

	bestData := originalData
	bestComp := "none"
	bestMime := mimeType

	// Try WebP lossless/lossy compression via nativewebp
	var webpBuf bytes.Buffer
	webpOpts := &nativewebp.Options{
		CompressionLevel: nativewebp.DefaultCompression,
	}
	if err := nativewebp.Encode(&webpBuf, img, webpOpts); err == nil {
		if webpBuf.Len() > 0 && webpBuf.Len() < len(bestData) {
			bestData = webpBuf.Bytes()
			bestComp = "webp"
			bestMime = "image/webp"
		}
	}

	// Also try JPEG compression if source was JPEG and user set quality
	if mimeType == "image/jpeg" || strings.HasSuffix(strings.ToLower(mimeType), "jpeg") {
		var jpegBuf bytes.Buffer
		quality := c.cfg.ImageQuality
		if quality <= 0 || quality > 100 {
			quality = 80
		}
		if err := jpeg.Encode(&jpegBuf, img, &jpeg.Options{Quality: quality}); err == nil {
			if jpegBuf.Len() > 0 && jpegBuf.Len() < len(bestData) {
				bestData = jpegBuf.Bytes()
				bestComp = "jpeg"
				bestMime = "image/jpeg"
			}
		}
	}

	return &CompressionResult{
		Data:        bestData,
		Compression: bestComp,
		StoredSize:  int64(len(bestData)),
		MimeType:    bestMime,
		Width:       width,
		Height:      height,
	}, nil
}

func (c *Compressor) transcodeVideo(ctx context.Context, originalData []byte, filename string) (*CompressionResult, error) {
	ffmpegPath, err := exec.LookPath("ffmpeg")
	if err != nil {
		return nil, fmt.Errorf("ffmpeg not found in PATH")
	}

	tmpDir := os.TempDir()
	inExt := filepath.Ext(filename)
	if inExt == "" {
		inExt = ".mp4"
	}
	inFile, err := os.CreateTemp(tmpDir, "input-*"+inExt)
	if err != nil {
		return nil, err
	}
	defer os.Remove(inFile.Name())

	if _, err := inFile.Write(originalData); err != nil {
		inFile.Close()
		return nil, err
	}
	inFile.Close()

	outFile, err := os.CreateTemp(tmpDir, "transcoded-*.mp4")
	if err != nil {
		return nil, err
	}
	outPath := outFile.Name()
	outFile.Close()
	defer os.Remove(outPath)

	// FFmpeg transcode to H.265 (libx265)
	cmd := exec.CommandContext(ctx, ffmpegPath,
		"-y",
		"-i", inFile.Name(),
		"-c:v", "libx265",
		"-crf", "28",
		"-preset", "fast",
		"-c:a", "aac",
		"-b:a", "128k",
		outPath,
	)

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("ffmpeg execution failed: %w", err)
	}

	transcodedData, err := os.ReadFile(outPath)
	if err != nil {
		return nil, err
	}

	return &CompressionResult{
		Data:        transcodedData,
		Compression: "h265",
		StoredSize:  int64(len(transcodedData)),
		MimeType:    "video/mp4",
		Codec:       "H.265",
	}, nil
}
