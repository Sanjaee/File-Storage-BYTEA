package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port                   string
	DatabaseURL            string
	RedisURL               string
	WorkerConcurrency      int
	MaxRetries             int
	MaxUploadSizeMB        int64
	DeduplicationEnabled   bool
	EnableVideoTranscoding bool
	ImageQuality           int
	AllowedOrigins         string
	DBMaxOpenConnections   int
	DBMaxIdleConnections   int
}

func Load() *Config {
	port := getEnv("PORT", "8080")
	dbURL := getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/filestorage?sslmode=disable")
	redisURL := getEnv("REDIS_URL", "localhost:6379")
	workerConcurrency := int(getEnvAsInt64("WORKER_CONCURRENCY", 5))
	maxRetries := int(getEnvAsInt64("MAX_RETRIES", 5))
	maxUploadSizeMB := getEnvAsInt64("MAX_UPLOAD_SIZE_MB", 500)
	dedupEnabled := getEnvAsBool("DEDUPLICATION_ENABLED", true)
	enableVideoTrans := getEnvAsBool("ENABLE_VIDEO_TRANSCODING", false)
	imageQuality := int(getEnvAsInt64("IMAGE_QUALITY", 80))
	allowedOrigins := getEnv("ALLOWED_ORIGINS", "*")
	dbMaxOpenConns := int(getEnvAsInt64("DB_MAX_OPEN_CONNECTIONS", 25))
	dbMaxIdleConns := int(getEnvAsInt64("DB_MAX_IDLE_CONNECTIONS", 10))

	return &Config{
		Port:                   port,
		DatabaseURL:            dbURL,
		RedisURL:               redisURL,
		WorkerConcurrency:      workerConcurrency,
		MaxRetries:             maxRetries,
		MaxUploadSizeMB:        maxUploadSizeMB,
		DeduplicationEnabled:   dedupEnabled,
		EnableVideoTranscoding: enableVideoTrans,
		ImageQuality:           imageQuality,
		AllowedOrigins:         allowedOrigins,
		DBMaxOpenConnections:   dbMaxOpenConns,
		DBMaxIdleConnections:   dbMaxIdleConns,
	}
}

func getEnv(key, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		return val
	}
	return defaultVal
}

func getEnvAsInt64(key string, defaultVal int64) int64 {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		if i, err := strconv.ParseInt(val, 10, 64); err == nil {
			return i
		}
	}
	return defaultVal
}

func getEnvAsBool(key string, defaultVal bool) bool {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		if b, err := strconv.ParseBool(val); err == nil {
			return b
		}
	}
	return defaultVal
}
