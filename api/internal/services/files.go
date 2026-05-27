package services

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/ps-vault/ps-vault/internal/apierr"
	"github.com/ps-vault/ps-vault/internal/config"
	"github.com/ps-vault/ps-vault/internal/models"
	"github.com/ps-vault/ps-vault/internal/repository"
	"github.com/ps-vault/ps-vault/internal/storage"
)

type FileService struct {
	cfg   *config.Config
	repos *repository.Repos
}

// maxFileSizeBytes returns the current upload limit, preferring the DB value over env config.
func (s *FileService) maxFileSizeBytes(ctx context.Context) int64 {
	if v, err := s.repos.SystemConfig.Get(ctx, "max_file_size_mb"); err == nil {
		if mb, err := strconv.ParseInt(v, 10, 64); err == nil && mb > 0 {
			return mb * 1024 * 1024
		}
	}
	return s.cfg.MaxFileSizeMB * 1024 * 1024
}

// getBackend builds the appropriate storage backend for the current request.
// It reads storage_backend from system_config first, falling back to env config.
func (s *FileService) getBackend(ctx context.Context) (storage.Backend, string, error) {
	backendName := s.cfg.StorageBackend
	if v, err := s.repos.SystemConfig.Get(ctx, "storage_backend"); err == nil && v != "" {
		backendName = v
	}

	switch strings.ToLower(backendName) {
	case "s3":
		cfg := storage.S3Config{
			Endpoint:  s.getConfigVal(ctx, "s3_endpoint", s.cfg.S3Endpoint),
			Bucket:    s.getConfigVal(ctx, "s3_bucket", s.cfg.S3Bucket),
			Region:    s.getConfigVal(ctx, "s3_region", s.cfg.S3Region),
			AccessKey: s.getConfigVal(ctx, "s3_access_key", s.cfg.S3AccessKey),
			SecretKey: s.getConfigVal(ctx, "s3_secret_key", s.cfg.S3SecretKey),
		}
		b, err := storage.NewS3Backend(cfg)
		if err != nil {
			return nil, "", apierr.ErrInternal
		}
		return b, "s3", nil
	default:
		return storage.NewLocalBackend(s.cfg.StorageLocalPath), "local", nil
	}
}

// getConfigVal reads a key from system_config, falling back to a default.
func (s *FileService) getConfigVal(ctx context.Context, key, fallback string) string {
	if v, err := s.repos.SystemConfig.Get(ctx, key); err == nil && v != "" {
		return v
	}
	return fallback
}

// Upload stores an already-encrypted blob and returns the vault file record.
// The caller must verify vault ownership before calling this.
func (s *FileService) Upload(ctx context.Context, userID, vaultID string, r io.Reader, sizeBytes int64) (*models.VaultFile, error) {
	maxBytes := s.maxFileSizeBytes(ctx)
	limitMB := maxBytes / (1024 * 1024)
	if sizeBytes > maxBytes {
		return nil, apierr.New(http.StatusRequestEntityTooLarge, "file_too_large",
			fmt.Sprintf("File exceeds the %d MB limit", limitMB))
	}

	backend, backendName, err := s.getBackend(ctx)
	if err != nil {
		return nil, err
	}

	token, err := generateStorageToken()
	if err != nil {
		return nil, apierr.ErrInternal
	}

	id := uuid.New().String()

	// Build the storage key.
	// For local: absolute path (maintains backward compat).
	// For S3: relative key like "userID/fileID".
	var key string
	if backendName == "local" {
		key = filepath.Join(s.cfg.StorageLocalPath, userID, id)
	} else {
		key = userID + "/" + id
	}

	if err := backend.Upload(ctx, key, r, sizeBytes); err != nil {
		return nil, apierr.ErrInternal
	}

	f := &models.VaultFile{
		ID:             id,
		UserID:         userID,
		VaultID:        vaultID,
		StorageToken:   token,
		StoragePath:    key,
		StorageBackend: backendName,
		SizeBytes:      sizeBytes,
		CreatedAt:      time.Now(),
	}
	if err := s.repos.Files.Create(ctx, f); err != nil {
		backend.Delete(ctx, key) //nolint:errcheck
		return nil, apierr.ErrInternal
	}
	return f, nil
}

// Download returns the file record and a ReadCloser for the blob.
// The caller must close the returned ReadCloser.
func (s *FileService) Download(ctx context.Context, userID, token string) (*models.VaultFile, io.ReadCloser, error) {
	f, err := s.repos.Files.GetByToken(ctx, token)
	if err != nil || f == nil {
		return nil, nil, apierr.ErrNotFound
	}
	if f.UserID != userID {
		return nil, nil, apierr.ErrNotFound
	}

	backend, err := s.backendForFile(ctx, f.StorageBackend)
	if err != nil {
		return nil, nil, apierr.ErrInternal
	}

	rc, err := backend.Download(ctx, f.StoragePath)
	if err != nil {
		return nil, nil, apierr.ErrInternal
	}
	return f, rc, nil
}

// DownloadForPortal returns the file for a beneficiary portal request.
func (s *FileService) DownloadForPortal(ctx context.Context, vaultID, token string) (*models.VaultFile, io.ReadCloser, error) {
	f, err := s.repos.Files.GetByToken(ctx, token)
	if err != nil || f == nil {
		return nil, nil, apierr.ErrNotFound
	}
	if f.VaultID != vaultID {
		return nil, nil, apierr.ErrNotFound
	}

	backend, err := s.backendForFile(ctx, f.StorageBackend)
	if err != nil {
		return nil, nil, apierr.ErrInternal
	}

	rc, err := backend.Download(ctx, f.StoragePath)
	if err != nil {
		return nil, nil, apierr.ErrInternal
	}
	return f, rc, nil
}

// Delete removes the blob from storage and the DB record.
func (s *FileService) Delete(ctx context.Context, userID, token string) error {
	f, err := s.repos.Files.GetByToken(ctx, token)
	if err != nil || f == nil {
		return apierr.ErrNotFound
	}
	if f.UserID != userID {
		return apierr.ErrNotFound
	}

	backend, err := s.backendForFile(ctx, f.StorageBackend)
	if err == nil {
		backend.Delete(ctx, f.StoragePath) //nolint:errcheck
	}
	return s.repos.Files.Delete(ctx, f.ID)
}

// backendForFile returns the correct backend for a file, using its stored backend name.
// Falls back to the current configured backend for legacy files with no backend recorded.
func (s *FileService) backendForFile(ctx context.Context, backendName string) (storage.Backend, error) {
	if backendName == "" {
		backendName = "local"
	}
	switch strings.ToLower(backendName) {
	case "s3":
		cfg := storage.S3Config{
			Endpoint:  s.getConfigVal(ctx, "s3_endpoint", s.cfg.S3Endpoint),
			Bucket:    s.getConfigVal(ctx, "s3_bucket", s.cfg.S3Bucket),
			Region:    s.getConfigVal(ctx, "s3_region", s.cfg.S3Region),
			AccessKey: s.getConfigVal(ctx, "s3_access_key", s.cfg.S3AccessKey),
			SecretKey: s.getConfigVal(ctx, "s3_secret_key", s.cfg.S3SecretKey),
		}
		return storage.NewS3Backend(cfg)
	default:
		return storage.NewLocalBackend(s.cfg.StorageLocalPath), nil
	}
}

func generateStorageToken() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
