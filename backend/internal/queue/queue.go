package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
	"github.com/redis/go-redis/v9"
)

const (
	TypeFileProcess = "file:process"

	QueueCritical = "critical"
	QueueDefault  = "default"
	QueueLow      = "low"

	ChannelStorageEvents = "storage:events"
)

// StorageEvent is broadcast to real-time subscribers (SSE)
type StorageEvent struct {
	Type      string     `json:"type"` // "file_uploaded", "file_processed", "file_failed", "files_deleted"
	FileID    *uuid.UUID `json:"fileId,omitempty"`
	Status    string     `json:"status,omitempty"`
	Timestamp int64      `json:"timestamp"`
}

// FileProcessPayload contains only identifiers - NEVER binary data!
type FileProcessPayload struct {
	FileID  uuid.UUID  `json:"fileId"`
	BatchID *uuid.UUID `json:"batchId,omitempty"`
}

type Client struct {
	asynqClient *asynq.Client
	rdb         *redis.Client
	maxRetries  int
}

func NewClient(redisAddr string, maxRetries int) *Client {
	client := asynq.NewClient(asynq.RedisClientOpt{Addr: redisAddr})
	rdb := redis.NewClient(&redis.Options{Addr: redisAddr})
	return &Client{
		asynqClient: client,
		rdb:         rdb,
		maxRetries:  maxRetries,
	}
}

func (c *Client) Close() error {
	if c.rdb != nil {
		_ = c.rdb.Close()
	}
	return c.asynqClient.Close()
}

// PublishEvent broadcasts an event via Redis Pub/Sub
func (c *Client) PublishEvent(ctx context.Context, event StorageEvent) error {
	if c.rdb == nil {
		return nil
	}
	if event.Timestamp == 0 {
		event.Timestamp = time.Now().UnixMilli()
	}
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}
	return c.rdb.Publish(ctx, ChannelStorageEvents, data).Err()
}

// Subscribe returns a Redis PubSub channel
func (c *Client) Subscribe(ctx context.Context) *redis.PubSub {
	if c.rdb == nil {
		return nil
	}
	return c.rdb.Subscribe(ctx, ChannelStorageEvents)
}


// EnqueueFileProcess sends task with fileId to Redis queue
func (c *Client) EnqueueFileProcess(ctx context.Context, fileID uuid.UUID, batchID *uuid.UUID, queueName string) (*asynq.TaskInfo, error) {
	if queueName == "" {
		queueName = QueueDefault
	}

	payload, err := json.Marshal(FileProcessPayload{
		FileID:  fileID,
		BatchID: batchID,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to marshal task payload: %w", err)
	}

	task := asynq.NewTask(TypeFileProcess, payload)

	opts := []asynq.Option{
		asynq.Queue(queueName),
		asynq.MaxRetry(c.maxRetries),
		asynq.Timeout(15 * time.Minute),
		asynq.Retention(2 * time.Hour),
		asynq.TaskID(fileID.String()), // Idempotency: task ID matches file ID
	}

	info, err := c.asynqClient.EnqueueContext(ctx, task, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to enqueue file processing task: %w", err)
	}

	return info, nil
}

// NewServer initializes an Asynq worker server with bounded concurrency and queue priorities
func NewServer(redisAddr string, concurrency int) *asynq.Server {
	return asynq.NewServer(
		asynq.RedisClientOpt{Addr: redisAddr},
		asynq.Config{
			Concurrency: concurrency,
			Queues: map[string]int{
				QueueCritical: 6,
				QueueDefault:  3,
				QueueLow:      1,
			},
			// Exponential backoff configuration
			RetryDelayFunc: func(n int, e error, t *asynq.Task) time.Duration {
				// 2s, 4s, 8s, 16s...
				return time.Duration(1<<uint(n)) * time.Second
			},
		},
	)
}
