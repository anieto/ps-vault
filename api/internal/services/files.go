package services

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/ps-vault/ps-vault/internal/apierr"
	"github.com/ps-vault/ps-vault/internal/config"
	"github.com/ps-vault/ps-vault/internal/models"
	"github.com/ps-vault/ps-vault/internal/repository"
)

type FileService struct {
	cfg   *config.Config
	repos *repository.Repos
}

// maxFileSizeBytes returns the current upload limit, preferring the DB value over the env config.
func (s *FileService) maxFileSizeBytes(ctx context.Context) int64 {
	if v, err := s.repos.SystemConfig.Get(ctx, "max_file_size_mb"); err == nil {
		if mb, err := strconv.ParseInt(v, 10, 64); err == nil && mb > 0 {
			return mb * 1024 * 1024
		}
	}
	return s.cfg.MaxFileSizeMB * 1024 * 1024
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

	token, err := generateStorageToken()
	if err != nil {
		return nil, apierr.ErrInternal
	}

	id := uuid.New().String()
	dir := filepath.Join(s.cfg.StorageLocalPath, userID)
	if err := os.MkdirAll(dir, 0750); err != nil {
		return nil, apierr.ErrInternal
	}
	path := filepath.Join(dir, id)

	dst, err := os.Create(path)
	if err != nil {
		return nil, apierr.ErrInternal
	}
	defer dst.Close()

	written, err := io.Copy(dst, r)
	if err != nil {
		os.Remove(path)
		return nil, apierr.ErrInternal
	}

	f := &models.VaultFile{
		ID:           id,
		UserID:       userID,
		VaultID:      vaultID,
		StorageToken: token,
		StoragePath:  path,
		SizeBytes:    written,
		CreatedAt:    time.Now(),
	}
	if err := s.repos.Files.Create(ctx, f); err != nil {
		os.Remove(path)
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

	file, err := os.Open(f.StoragePath)
	if err != nil {
		return nil, nil, apierr.ErrInternal
	}
	return f, file, nil
}

// DownloadForPortal returns the file for a beneficiary portal request.
// vaultID must match the file's vault to prevent cross-vault access.
func (s *FileService) DownloadForPortal(ctx context.Context, vaultID, token string) (*models.VaultFile, io.ReadCloser, error) {
	f, err := s.repos.Files.GetByToken(ctx, token)
	if err != nil || f == nil {
		return nil, nil, apierr.ErrNotFound
	}
	if f.VaultID != vaultID {
		return nil, nil, apierr.ErrNotFound
	}

	file, err := os.Open(f.StoragePath)
	if err != nil {
		return nil, nil, apierr.ErrInternal
	}
	return f, file, nil
}

// Delete removes the blob from disk and the DB record.
func (s *FileService) Delete(ctx context.Context, userID, token string) error {
	f, err := s.repos.Files.GetByToken(ctx, token)
	if err != nil || f == nil {
		return apierr.ErrNotFound
	}
	if f.UserID != userID {
		return apierr.ErrNotFound
	}

	os.Remove(f.StoragePath)
	return s.repos.Files.Delete(ctx, f.ID)
}

func generateStorageToken() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
