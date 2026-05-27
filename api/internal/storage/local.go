package storage

import (
	"context"
	"io"
	"os"
	"path/filepath"
)

// LocalBackend stores files on the local filesystem.
// Keys are treated as relative paths under the base directory.
type LocalBackend struct {
	BaseDir string
}

func NewLocalBackend(baseDir string) *LocalBackend {
	return &LocalBackend{BaseDir: baseDir}
}

func (b *LocalBackend) Upload(ctx context.Context, key string, r io.Reader, size int64) error {
	path := b.fullPath(key)
	if err := os.MkdirAll(filepath.Dir(path), 0750); err != nil {
		return err
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, r)
	return err
}

func (b *LocalBackend) Download(ctx context.Context, key string) (io.ReadCloser, error) {
	return os.Open(b.fullPath(key))
}

func (b *LocalBackend) Delete(ctx context.Context, key string) error {
	err := os.Remove(b.fullPath(key))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func (b *LocalBackend) TestConnection(ctx context.Context) error {
	return os.MkdirAll(b.BaseDir, 0750)
}

// fullPath resolves a key to an absolute filesystem path.
// Absolute keys (legacy format) are used as-is; relative keys are joined under BaseDir.
func (b *LocalBackend) fullPath(key string) string {
	if filepath.IsAbs(key) {
		return key
	}
	return filepath.Join(b.BaseDir, key)
}
