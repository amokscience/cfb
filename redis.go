package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
)

// RedisService provides methods to store and retrieve JSON data from Redis
type RedisService struct {
	client *redis.Client
}

// NewRedisService creates a new Redis service instance
// Uses REDIS_ADDR environment variable, defaults to localhost:6379
func NewRedisService() (*RedisService, error) {
	addr := os.Getenv("REDIS_ADDR")
	if addr == "" {
		addr = "localhost:6379"
	}

	client := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: "",
		DB:       0,
	})

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	return &RedisService{client: client}, nil
}

// Set stores a value as a JSON string with the given key
func (rs *RedisService) Set(ctx context.Context, key string, value interface{}) error {
	jsonData, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("failed to marshal JSON: %w", err)
	}

	return rs.client.Set(ctx, key, string(jsonData), 0).Err()
}

// SetWithExpiration stores a value as a JSON string with expiration
func (rs *RedisService) SetWithExpiration(ctx context.Context, key string, value interface{}, expiration time.Duration) error {
	jsonData, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("failed to marshal JSON: %w", err)
	}

	return rs.client.Set(ctx, key, string(jsonData), expiration).Err()
}

// Get retrieves a JSON value by key and unmarshals it into the provided interface
func (rs *RedisService) Get(ctx context.Context, key string, dest interface{}) error {
	val, err := rs.client.Get(ctx, key).Result()
	if err != nil {
		if err == redis.Nil {
			return fmt.Errorf("key not found: %s", key)
		}
		return fmt.Errorf("failed to get key: %w", err)
	}

	if err := json.Unmarshal([]byte(val), dest); err != nil {
		return fmt.Errorf("failed to unmarshal JSON: %w", err)
	}

	return nil
}

// Delete removes a key from Redis
func (rs *RedisService) Delete(ctx context.Context, key string) error {
	return rs.client.Del(ctx, key).Err()
}

// Exists checks if a key exists in Redis
func (rs *RedisService) Exists(ctx context.Context, key string) (bool, error) {
	result, err := rs.client.Exists(ctx, key).Result()
	if err != nil {
		return false, fmt.Errorf("failed to check key existence: %w", err)
	}
	return result > 0, nil
}

// Close closes the Redis connection
func (rs *RedisService) Close() error {
	return rs.client.Close()
}

// Flush clears all keys from the database
func (rs *RedisService) Flush(ctx context.Context) error {
	return rs.client.FlushDB(ctx).Err()
}
