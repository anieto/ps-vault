package storage

import (
	"context"
	"io"
)

// Backend is the interface implemented by all storage backends.
type Backend interface {
	// Upload writes the reader's contents to the given key.
	Upload(ctx context.Context, key string, r io.Reader, size int64) error
	// Download returns a ReadCloser for the given key. Caller must close it.
	Download(ctx context.Context, key string) (io.ReadCloser, error)
	// Delete removes the object at the given key.
	Delete(ctx context.Context, key string) error
	// TestConnection verifies that the backend is reachable and credentials are valid.
	TestConnection(ctx context.Context) error
}
