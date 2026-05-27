package services

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/ps-vault/ps-vault/internal/apierr"
	"github.com/ps-vault/ps-vault/internal/config"
	"github.com/ps-vault/ps-vault/internal/models"
	"github.com/ps-vault/ps-vault/internal/repository"
	"github.com/ps-vault/ps-vault/internal/storage"
)

type AdminService struct {
	cfg   *config.Config
	repos *repository.Repos
	email *EmailService
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

type DashboardStats struct {
	TotalUsers    int            `json:"total_users"`
	TotalVaults   int            `json:"total_vaults"`
	TotalEntries  int            `json:"total_entries"`
	StorageUsedBytes int64       `json:"storage_used_bytes"`
	SwitchStatus  map[string]int `json:"switch_status"`
}

func (s *AdminService) GetDashboard(ctx context.Context) (*DashboardStats, error) {
	users, _ := s.repos.Users.Count(ctx)
	vaults, _ := s.repos.Vaults.Count(ctx)
	entries, _ := s.repos.Entries.Count(ctx)
	storageBytes, _ := s.repos.Files.TotalSize(ctx)
	switchCounts, _ := s.repos.Switch.CountByStatus(ctx)

	return &DashboardStats{
		TotalUsers:       users,
		TotalVaults:      vaults,
		TotalEntries:     entries,
		StorageUsedBytes: storageBytes,
		SwitchStatus:     switchCounts,
	}, nil
}

// ─── Users ────────────────────────────────────────────────────────────────────

type AdminUserSummary struct {
	ID               string          `json:"id"`
	Email            string          `json:"email"`
	DisplayName      string          `json:"display_name"`
	Role             string          `json:"role"`
	IsActive         bool            `json:"is_active"`
	MFAEnabled       bool            `json:"mfa_enabled"`
	VaultCount       int             `json:"vault_count"`
	StorageUsedBytes int64           `json:"storage_used_bytes"`
	LastLoginAt      models.NullTime `json:"last_login_at,omitempty"`
	CreatedAt        time.Time       `json:"created_at"`
}

func (s *AdminService) ListUsers(ctx context.Context, limit, offset int) ([]*AdminUserSummary, int, error) {
	users, total, err := s.repos.Users.List(ctx, limit, offset)
	if err != nil {
		return nil, 0, apierr.ErrInternal
	}

	summaries := make([]*AdminUserSummary, 0, len(users))
	for _, u := range users {
		vaultCount, _ := s.repos.Vaults.CountByUser(ctx, u.ID)
		storageBytes, _ := s.repos.Files.SizeByUser(ctx, u.ID)
		summaries = append(summaries, &AdminUserSummary{
			ID:               u.ID,
			Email:            u.Email,
			DisplayName:      u.DisplayName,
			Role:             u.Role,
			IsActive:         u.IsActive,
			MFAEnabled:       u.MFAEnabled,
			VaultCount:       vaultCount,
			StorageUsedBytes: storageBytes,
			LastLoginAt:      u.LastLoginAt,
			CreatedAt:        u.CreatedAt,
		})
	}
	return summaries, total, nil
}

func (s *AdminService) SetUserRole(ctx context.Context, requesterID, targetID, role string) error {
	if role != "admin" && role != "user" {
		return apierr.New(http.StatusBadRequest, "invalid_role", "Role must be 'admin' or 'user'")
	}
	if requesterID == targetID {
		return apierr.New(http.StatusBadRequest, "cannot_change_own_role", "You cannot change your own role")
	}
	u, err := s.repos.Users.GetByID(ctx, targetID)
	if err != nil || u == nil {
		return apierr.ErrNotFound
	}
	// Prevent demoting the last admin
	if u.Role == "admin" && role == "user" {
		count, err := s.repos.Users.CountAdmins(ctx)
		if err != nil || count <= 1 {
			return apierr.New(http.StatusBadRequest, "last_admin", "Cannot demote the last admin account")
		}
	}
	return s.repos.Users.SetRole(ctx, targetID, role)
}

func (s *AdminService) SetUserActive(ctx context.Context, userID string, active bool) error {
	u, err := s.repos.Users.GetByID(ctx, userID)
	if err != nil || u == nil {
		return apierr.ErrNotFound
	}
	return s.repos.Users.SetActive(ctx, userID, active)
}

func (s *AdminService) ForceLogoutUser(ctx context.Context, userID string) error {
	u, err := s.repos.Users.GetByID(ctx, userID)
	if err != nil || u == nil {
		return apierr.ErrNotFound
	}
	return s.repos.Sessions.DeleteAllForUser(ctx, userID)
}

func (s *AdminService) DeleteUser(ctx context.Context, userID string) error {
	u, err := s.repos.Users.GetByID(ctx, userID)
	if err != nil || u == nil {
		return apierr.ErrNotFound
	}
	if u.Role == "admin" {
		return apierr.New(http.StatusBadRequest, "cannot_delete_admin", "Cannot delete an admin account")
	}
	return s.repos.Users.Delete(ctx, userID)
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

func (s *AdminService) ListAuditLog(ctx context.Context, userID, eventType string, limit, offset int) ([]*models.AuditLog, int, error) {
	return s.repos.AuditLog.ListFiltered(ctx, userID, eventType, limit, offset)
}

// ─── Email Queue ──────────────────────────────────────────────────────────────

func (s *AdminService) ListEmailQueue(ctx context.Context, status string, limit, offset int) ([]*models.EmailQueueEntry, int, error) {
	return s.repos.EmailQueue.List(ctx, status, limit, offset)
}

func (s *AdminService) RetryEmail(ctx context.Context, emailID string) error {
	e, err := s.repos.EmailQueue.GetByID(ctx, emailID)
	if err != nil || e == nil {
		return apierr.ErrNotFound
	}
	if err := s.repos.EmailQueue.ResetForRetry(ctx, emailID); err != nil {
		return apierr.ErrInternal
	}
	// Re-send asynchronously
	go func() {
		ctx2 := context.Background()
		if sendErr := s.email.Send(e.ToEmail, e.TemplateName, nil); sendErr != nil {
			s.repos.EmailQueue.UpdateStatus(ctx2, emailID, "failed", sendErr.Error()) //nolint:errcheck
		} else {
			s.repos.EmailQueue.UpdateStatus(ctx2, emailID, "sent", "") //nolint:errcheck
		}
	}()
	return nil
}

// ─── Invites ──────────────────────────────────────────────────────────────────

func (s *AdminService) ListInvites(ctx context.Context) ([]*models.InviteCode, error) {
	return s.repos.InviteCodes.List(ctx)
}

func (s *AdminService) DeleteInvite(ctx context.Context, id string) error {
	return s.repos.InviteCodes.Delete(ctx, id)
}

func (s *AdminService) SendInviteEmail(ctx context.Context, id, toEmail string) error {
	ic, err := s.repos.InviteCodes.GetByID(ctx, id)
	if err != nil || ic == nil {
		return apierr.ErrNotFound
	}
	if ic.UsedAt.Valid {
		return apierr.New(http.StatusBadRequest, "invite_already_used", "This invite code has already been used")
	}
	registerURL := fmt.Sprintf("%s/register?code=%s", s.cfg.BaseURL, ic.Code)
	return s.email.Send(toEmail, "invite_code", map[string]string{
		"app_name":     resolveAppName(ctx, s.repos, s.cfg),
		"invite_code":  ic.Code,
		"register_url": registerURL,
		"expires_at":   ic.ExpiresAt.Format("January 2, 2006"),
	})
}

func (s *AdminService) CreateInvite(ctx context.Context, createdBy string) (*models.InviteCode, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return nil, apierr.ErrInternal
	}
	code := hex.EncodeToString(b)

	ic := &models.InviteCode{
		ID:        uuid.New().String(),
		Code:      code,
		CreatedBy: createdBy,
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
		CreatedAt: time.Now(),
	}
	if err := s.repos.InviteCodes.Create(ctx, ic); err != nil {
		return nil, apierr.ErrInternal
	}
	return ic, nil
}

// ─── Config ───────────────────────────────────────────────────────────────────

var allowedConfigKeys = map[string]bool{
	"max_file_size_mb":                true,
	"registration_mode":               true,
	"downtime_grace_threshold_hours":  true,
	"storage_backend":    true,
	"s3_endpoint":        true,
	"s3_bucket":          true,
	"s3_region":          true,
	"s3_access_key":      true,
	"s3_secret_key":      true,
	"app_name_override":  true,
	"app_accent_color":   true,
	"smtp_host_override": true,
	"smtp_port_override": true,
	"smtp_user_override": true,
	"smtp_pass_override": true,
	"smtp_from_override": true,
	"smtp_tls_override":  true,
}

func (s *AdminService) GetConfig(ctx context.Context) (map[string]string, error) {
	return s.repos.SystemConfig.GetAll(ctx)
}

func (s *AdminService) SetConfig(ctx context.Context, key, value string) error {
	if !allowedConfigKeys[key] {
		return apierr.New(http.StatusBadRequest, "unknown_key", fmt.Sprintf("Unknown configuration key: %s", key))
	}
	return s.repos.SystemConfig.Set(ctx, key, value)
}

// ─── SMTP Test ────────────────────────────────────────────────────────────────

func (s *AdminService) TestSMTP(ctx context.Context, toEmail string) error {
	err := s.email.Send(toEmail, "test_email", map[string]string{
		"app_name": resolveAppName(ctx, s.repos, s.cfg),
	})
	if err != nil {
		return apierr.New(http.StatusBadGateway, "smtp_error", fmt.Sprintf("SMTP test failed: %v", err))
	}
	return nil
}

// ─── Storage Test ─────────────────────────────────────────────────────────────

func (s *AdminService) TestStorage(ctx context.Context) error {
	backendName := s.cfg.StorageBackend
	if v, err := s.repos.SystemConfig.Get(ctx, "storage_backend"); err == nil && v != "" {
		backendName = v
	}

	var backend storage.Backend
	switch backendName {
	case "s3":
		cfg := storage.S3Config{
			Endpoint:  getConfigValAdmin(ctx, s.repos, "s3_endpoint", s.cfg.S3Endpoint),
			Bucket:    getConfigValAdmin(ctx, s.repos, "s3_bucket", s.cfg.S3Bucket),
			Region:    getConfigValAdmin(ctx, s.repos, "s3_region", s.cfg.S3Region),
			AccessKey: getConfigValAdmin(ctx, s.repos, "s3_access_key", s.cfg.S3AccessKey),
			SecretKey: getConfigValAdmin(ctx, s.repos, "s3_secret_key", s.cfg.S3SecretKey),
		}
		var err error
		backend, err = storage.NewS3Backend(cfg)
		if err != nil {
			return apierr.New(http.StatusBadGateway, "storage_error", fmt.Sprintf("Storage configuration error: %v", err))
		}
	default:
		backend = storage.NewLocalBackend(s.cfg.StorageLocalPath)
	}

	if err := backend.TestConnection(ctx); err != nil {
		return apierr.New(http.StatusBadGateway, "storage_error", fmt.Sprintf("Storage connection failed: %v", err))
	}
	return nil
}

func getConfigValAdmin(ctx context.Context, repos *repository.Repos, key, fallback string) string {
	if v, err := repos.SystemConfig.Get(ctx, key); err == nil && v != "" {
		return v
	}
	return fallback
}
