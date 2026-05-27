package storage

import (
	"context"
	"io"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// S3Config holds the credentials and settings for an S3-compatible backend.
type S3Config struct {
	Endpoint  string // e.g. "s3.amazonaws.com", "s3.us-west-004.backblazeb2.com", custom MinIO host
	Bucket    string
	Region    string
	AccessKey string
	SecretKey string
	UseSSL    bool
}

// S3Backend stores files on any S3-compatible object store.
// Works with AWS S3, MinIO, Backblaze B2, and Cloudflare R2.
type S3Backend struct {
	client *minio.Client
	bucket string
	region string
}

func NewS3Backend(cfg S3Config) (*S3Backend, error) {
	useSSL := cfg.UseSSL
	if !strings.HasPrefix(cfg.Endpoint, "http://") {
		useSSL = true
	}
	// Strip scheme if present — minio-go expects host only.
	endpoint := strings.TrimPrefix(strings.TrimPrefix(cfg.Endpoint, "https://"), "http://")

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: useSSL,
		Region: cfg.Region,
	})
	if err != nil {
		return nil, err
	}
	return &S3Backend{client: client, bucket: cfg.Bucket, region: cfg.Region}, nil
}

func (b *S3Backend) Upload(ctx context.Context, key string, r io.Reader, size int64) error {
	_, err := b.client.PutObject(ctx, b.bucket, key, r, size, minio.PutObjectOptions{
		ContentType: "application/octet-stream",
	})
	return err
}

func (b *S3Backend) Download(ctx context.Context, key string) (io.ReadCloser, error) {
	obj, err := b.client.GetObject(ctx, b.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	return obj, nil
}

func (b *S3Backend) Delete(ctx context.Context, key string) error {
	return b.client.RemoveObject(ctx, b.bucket, key, minio.RemoveObjectOptions{})
}

func (b *S3Backend) TestConnection(ctx context.Context) error {
	_, err := b.client.BucketExists(ctx, b.bucket)
	return err
}
