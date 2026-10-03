# Stage 1: Build Go binaries
FROM golang:1.24-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git

COPY go.mod go.sum* ./
RUN go mod download

COPY . .

# Build API server and Worker binaries
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/api ./cmd/api && \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/worker ./cmd/worker

# Stage 2: Runtime
FROM alpine:3.20

WORKDIR /app

# Install runtime dependencies including FFmpeg for video transcoding and CA certificates
RUN apk add --no-cache ca-certificates tzdata ffmpeg

COPY --from=builder /app/api /app/api
COPY --from=builder /app/worker /app/worker

EXPOSE 8080

CMD ["/app/api"]
