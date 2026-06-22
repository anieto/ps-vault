package services

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/pquerna/otp/totp"
	"github.com/ps-vault/ps-vault/internal/apierr"
	"github.com/ps-vault/ps-vault/internal/config"
	"github.com/ps-vault/ps-vault/internal/models"
	"github.com/ps-vault/ps-vault/internal/repository"
	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/bcrypt"
)

const (
	accessTokenDuration        = 15 * time.Minute
	mobileRefreshTokenDuration = 14 * 24 * time.Hour
	webRefreshTokenDuration    = 7 * 24 * time.Hour
)

type AuthService struct {
	cfg   *config.Config
	repos *repository.Repos
	email *EmailService
}

type RegisterInput struct {
	Email       string
	DisplayName string
	Password    string
	InviteCode  string
	MEKSalt     string // hex — client-generated random salt for Argon2id KEK derivation
	MEKEnvelope string // base64url — MEK encrypted with KEK, produced by client
	IPAddress   string
	UserAgent   string
	IsMobile    bool
}

type LoginInput struct {
	Email      string
	Password   string
	MFACode    string
	IPAddress  string
	UserAgent  string
	ClientType string // "web", "mobile", or "ios"
}

type TokenPair struct {
	AccessToken  string
	RefreshToken string
	User         *models.User
	// Crypto fields returned to client so it can derive MEK
	MEKSalt      string
	MEKEnvelope  string
	Argon2Params string
	// Set when account recovery is in progress
	RecoveryKeyEnvelope string
}

type MFASetupResult struct {
	Secret      string   `json:"secret"`
	OTPURL      string   `json:"otp_url"`
	BackupCodes []string `json:"backup_codes"`
}

func (s *AuthService) Register(ctx context.Context, input RegisterInput) (*TokenPair, error) {
	// Check registration mode
	switch s.cfg.RegistrationMode {
	case "closed":
		return nil, apierr.ErrRegistrationClosed
	case "invite":
		if input.InviteCode == "" {
			return nil, apierr.ErrInvalidInvite
		}
		invite, err := s.repos.InviteCodes.GetByCode(ctx, input.InviteCode)
		if err != nil || invite == nil {
			return nil, apierr.ErrInvalidInvite
		}
		defer func() {
			// Mark invite used after successful registration
		}()
		_ = invite
	}

	// Check email availability
	exists, err := s.repos.Users.EmailExists(ctx, strings.ToLower(input.Email))
	if err != nil {
		log.Printf("register: EmailExists error: %v", err)
		return nil, apierr.ErrInternal
	}
	if exists {
		return nil, apierr.ErrEmailTaken
	}

	// Hash password — pre-hash with SHA-256 to avoid bcrypt's 72-byte limit
	passwordHash, err := bcrypt.GenerateFromPassword(pepperPassword(input.Password, s.cfg.EncryptionPepper), 12)
	if err != nil {
		log.Printf("register: bcrypt error: %v", err)
		return nil, apierr.ErrInternal
	}

	// Derive key verification hash (separate from password hash — used to verify
	// the master encryption key can be derived without sending the MEK to the server)
	kvh := s.deriveKeyVerificationHash(input.Password)

	// Generate email verification token
	verifyToken, err := generateSecureToken(32)
	if err != nil {
		log.Printf("register: generateSecureToken error: %v", err)
		return nil, apierr.ErrInternal
	}

	role := "user"
	adminCount, err := s.repos.Users.CountAdmins(ctx)
	if err != nil {
		log.Printf("register: CountAdmins error: %v", err)
		return nil, apierr.ErrInternal
	}
	// First user, or matches configured admin email, gets admin role
	if adminCount == 0 || strings.EqualFold(input.Email, s.cfg.AdminEmail) {
		role = "admin"
	}

	if input.MEKSalt == "" || input.MEKEnvelope == "" {
		return nil, apierr.New(http.StatusBadRequest, "missing_crypto",
			"mek_salt and mek_envelope are required")
	}

	user := &models.User{
		ID:                  uuid.New().String(),
		Email:               strings.ToLower(input.Email),
		DisplayName:         input.DisplayName,
		PasswordHash:        string(passwordHash),
		KeyVerificationHash: kvh,
		Argon2Params:        defaultArgon2ParamsJSON(),
		MEKSalt:             input.MEKSalt,
		MEKEnvelope:         input.MEKEnvelope,
		Role:                role,
		IsActive:            true,
		Timezone:            "UTC",
	}
	user.EmailVerifyToken.String = verifyToken
	user.EmailVerifyToken.Valid = true
	user.EmailVerifyExpires.Time = time.Now().Add(24 * time.Hour)
	user.EmailVerifyExpires.Valid = true

	if err := s.repos.Users.Create(ctx, user); err != nil {
		log.Printf("register: Users.Create error: %v", err)
		return nil, apierr.ErrInternal
	}

	// Create default switch settings for this user
	sw := &models.SwitchSettings{
		ID:                       uuid.New().String(),
		UserID:                   user.ID,
		IsActive:                 false,
		CheckInIntervalDays:      7,
		AbortWindowHours:         12,
		DeathReportResponseHours: 24,
		MaxPauseDays:             180,
		Status:                   "inactive",
	}
	sw.Reminder1HoursBefore.Int32, sw.Reminder1HoursBefore.Valid = 48, true
	sw.Reminder2HoursBefore.Int32, sw.Reminder2HoursBefore.Valid = 12, true
	sw.Reminder3HoursBefore.Int32, sw.Reminder3HoursBefore.Valid = 2, true
	if err := s.repos.Switch.Create(ctx, sw); err != nil {
		log.Printf("register: Switch.Create error: %v", err)
		return nil, apierr.ErrInternal
	}

	// Send verification email
	verifyURL := fmt.Sprintf("%s/api/v1/auth/verify-email?token=%s", s.cfg.BaseURL, verifyToken)
	s.email.SendAsync(ctx, user.Email, "verify_email", map[string]string{
		"display_name": user.DisplayName,
		"verify_url":   verifyURL,
		"app_name": resolveAppName(ctx, s.repos, s.cfg),
	})

	// Mark invite used
	if s.cfg.RegistrationMode == "invite" && input.InviteCode != "" {
		invite, _ := s.repos.InviteCodes.GetByCode(ctx, input.InviteCode)
		if invite != nil {
			s.repos.InviteCodes.MarkUsed(ctx, invite.ID, user.ID)
		}
	}

	// Audit log
	s.auditLog(ctx, user.ID, "user.registered", input.IPAddress, "")

	pair, err := s.issueTokenPair(ctx, user, input.IPAddress, input.UserAgent, input.IsMobile)
	if err != nil {
		return nil, err
	}
	pair.MEKSalt = user.MEKSalt
	pair.MEKEnvelope = user.MEKEnvelope
	pair.Argon2Params = user.Argon2Params
	return pair, nil
}

func (s *AuthService) Login(ctx context.Context, input LoginInput) (*TokenPair, bool, error) {
	user, err := s.repos.Users.GetByEmail(ctx, strings.ToLower(input.Email))
	if err != nil {
		return nil, false, apierr.ErrInternal
	}
	if user == nil {
		return nil, false, apierr.ErrInvalidCredentials
	}

	if !user.IsActive {
		return nil, false, apierr.ErrAccountDisabled
	}

	// Check lockout
	if user.LockedUntil.Valid && user.LockedUntil.Time.After(time.Now()) {
		return nil, false, apierr.New(http.StatusTooManyRequests, "account_locked",
			fmt.Sprintf("Account is temporarily locked. Try again after %s",
				user.LockedUntil.Time.Format(time.RFC3339)))
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword(
		[]byte(user.PasswordHash), pepperPassword(input.Password, s.cfg.EncryptionPepper)); err != nil {
		s.repos.Users.IncrementFailedLogins(ctx, user.ID)
		s.auditLog(ctx, user.ID, "auth.login_failed", input.IPAddress, "")
		return nil, false, apierr.ErrInvalidCredentials
	}

	if !user.EmailVerified {
		return nil, false, apierr.ErrEmailNotVerified
	}

	// MFA check
	if user.MFAEnabled {
		if input.MFACode == "" {
			return nil, true, apierr.ErrMFARequired
		}
		if !s.verifyMFACode(user, input.MFACode) {
			s.auditLog(ctx, user.ID, "auth.mfa_failed", input.IPAddress, "")
			return nil, false, apierr.ErrInvalidMFA
		}
	}

	s.repos.Users.ResetFailedLogins(ctx, user.ID)
	s.repos.Users.UpdateLastLogin(ctx, user.ID)
	s.auditLog(ctx, user.ID, "auth.login", input.IPAddress, "")

	// Login counts as a check-in (unless disabled by admin)
	go s.recordLoginCheckin(context.Background(), user.ID, input.IPAddress, input.ClientType)

	pair, err := s.issueTokenPair(ctx, user, input.IPAddress, input.UserAgent, input.ClientType == "mobile")
	if err != nil {
		return nil, false, err
	}
	pair.MEKSalt = user.MEKSalt
	pair.MEKEnvelope = user.MEKEnvelope
	pair.Argon2Params = user.Argon2Params
	return pair, false, nil
}

// VerifyCredentials checks email/password/lockout/verification without performing MFA.
// Used by the passkey authentication begin flow.
func (s *AuthService) VerifyCredentials(ctx context.Context, email, password, ip string) (*models.User, error) {
	user, err := s.repos.Users.GetByEmail(ctx, strings.ToLower(email))
	if err != nil {
		return nil, apierr.ErrInternal
	}
	if user == nil {
		return nil, apierr.ErrInvalidCredentials
	}
	if !user.IsActive {
		return nil, apierr.ErrAccountDisabled
	}
	if user.LockedUntil.Valid && user.LockedUntil.Time.After(time.Now()) {
		return nil, apierr.New(http.StatusTooManyRequests, "account_locked",
			fmt.Sprintf("Account is temporarily locked. Try again after %s",
				user.LockedUntil.Time.Format(time.RFC3339)))
	}
	if err := bcrypt.CompareHashAndPassword(
		[]byte(user.PasswordHash), pepperPassword(password, s.cfg.EncryptionPepper)); err != nil {
		s.repos.Users.IncrementFailedLogins(ctx, user.ID)
		s.auditLog(ctx, user.ID, "auth.login_failed", ip, "")
		return nil, apierr.ErrInvalidCredentials
	}
	if !user.EmailVerified {
		return nil, apierr.ErrEmailNotVerified
	}
	return user, nil
}

// CompleteLogin issues tokens and records a successful login. Used after passkey MFA verification.
func (s *AuthService) CompleteLogin(ctx context.Context, user *models.User, ip, ua string) (*TokenPair, error) {
	s.repos.Users.ResetFailedLogins(ctx, user.ID)
	s.repos.Users.UpdateLastLogin(ctx, user.ID)
	s.auditLog(ctx, user.ID, "auth.login", ip, "")
	go s.recordLoginCheckin(context.Background(), user.ID, ip, "web")

	pair, err := s.issueTokenPair(ctx, user, ip, ua, false)
	if err != nil {
		return nil, err
	}
	pair.MEKSalt = user.MEKSalt
	pair.MEKEnvelope = user.MEKEnvelope
	pair.Argon2Params = user.Argon2Params
	return pair, nil
}

func (s *AuthService) Logout(ctx context.Context, refreshTokenHash string) error {
	return s.repos.Sessions.DeleteByTokenHash(ctx, refreshTokenHash)
}

func (s *AuthService) Refresh(ctx context.Context, refreshToken, ipAddress, userAgent string) (*TokenPair, error) {
	hash := hashToken(refreshToken)
	session, err := s.repos.Sessions.GetByTokenHash(ctx, hash)
	if err != nil || session == nil {
		return nil, apierr.ErrUnauthorized
	}

	user, err := s.repos.Users.GetByID(ctx, session.UserID)
	if err != nil || user == nil || !user.IsActive {
		return nil, apierr.ErrUnauthorized
	}

	// Delete old session and issue new pair (preserve client type from the original session)
	s.repos.Sessions.Delete(ctx, session.ID)
	return s.issueTokenPair(ctx, user, ipAddress, userAgent, session.ClientType == "mobile")
}

func (s *AuthService) VerifyEmail(ctx context.Context, token string) error {
	user, err := s.repos.Users.GetByVerifyToken(ctx, token)
	if err != nil {
		return apierr.ErrInternal
	}
	if user == nil {
		return apierr.New(http.StatusBadRequest, "invalid_token", "Invalid or expired verification link")
	}

	if err := s.repos.Users.MarkEmailVerified(ctx, user.ID); err != nil {
		return apierr.ErrInternal
	}

	s.auditLog(ctx, user.ID, "user.email_verified", "", "")
	return nil
}

func (s *AuthService) ResendVerification(ctx context.Context, email string) {
	// Always return silently to prevent email enumeration
	user, err := s.repos.Users.GetByEmail(ctx, strings.ToLower(email))
	if err != nil || user == nil || user.EmailVerified {
		return
	}

	token, err := generateSecureToken(32)
	if err != nil {
		return
	}

	if err := s.repos.Users.SetVerifyToken(ctx, user.ID, token); err != nil {
		return
	}

	verifyURL := fmt.Sprintf("%s/api/v1/auth/verify-email?token=%s", s.cfg.BaseURL, token)
	s.email.SendAsync(ctx, user.Email, "verify_email", map[string]string{
		"display_name": user.DisplayName,
		"verify_url":   verifyURL,
		"app_name": resolveAppName(ctx, s.repos, s.cfg),
	})
}

func (s *AuthService) SetupMFA(ctx context.Context, userID string) (*MFASetupResult, error) {
	user, err := s.repos.Users.GetByID(ctx, userID)
	if err != nil || user == nil {
		return nil, apierr.ErrNotFound
	}

	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      resolveAppName(ctx, s.repos, s.cfg),
		AccountName: user.Email,
	})
	if err != nil {
		return nil, apierr.ErrInternal
	}

	backupCodes, err := generateBackupCodes(8)
	if err != nil {
		return nil, apierr.ErrInternal
	}

	return &MFASetupResult{
		Secret:      key.Secret(),
		OTPURL:      key.URL(),
		BackupCodes: backupCodes,
	}, nil
}

func (s *AuthService) EnableMFA(ctx context.Context, userID, secret, code string, backupCodes []string) error {
	// Verify the provided code against the secret before enabling
	if !totp.Validate(code, secret) {
		return apierr.ErrInvalidMFA
	}

	// Store backup codes as bcrypt hashes (newline-separated)
	var hashedCodes []string
	for _, bc := range backupCodes {
		h, err := bcrypt.GenerateFromPassword([]byte(bc), 10)
		if err != nil {
			return apierr.ErrInternal
		}
		hashedCodes = append(hashedCodes, string(h))
	}

	err := s.repos.Users.UpdateMFA(ctx, userID, true, secret, strings.Join(hashedCodes, "\n"))
	if err != nil {
		return apierr.ErrInternal
	}

	s.auditLog(ctx, userID, "auth.mfa_enabled", "", "")
	return nil
}

func (s *AuthService) DisableMFA(ctx context.Context, userID, code string) error {
	user, err := s.repos.Users.GetByID(ctx, userID)
	if err != nil || user == nil {
		return apierr.ErrNotFound
	}

	if !s.verifyMFACode(user, code) {
		return apierr.ErrInvalidMFA
	}

	if err := s.repos.Users.UpdateMFA(ctx, userID, false, "", ""); err != nil {
		return apierr.ErrInternal
	}

	s.auditLog(ctx, userID, "auth.mfa_disabled", "", "")
	return nil
}

func (s *AuthService) ChangePassword(ctx context.Context, userID, currentPassword, newPassword, newMEKEnvelope string) error {
	user, err := s.repos.Users.GetByID(ctx, userID)
	if err != nil || user == nil {
		return apierr.ErrNotFound
	}

	if err := bcrypt.CompareHashAndPassword(
		[]byte(user.PasswordHash), pepperPassword(currentPassword, s.cfg.EncryptionPepper)); err != nil {
		return apierr.New(http.StatusUnauthorized, "invalid_password", "Current password is incorrect")
	}

	if newMEKEnvelope == "" {
		return apierr.New(http.StatusBadRequest, "missing_crypto", "new_mek_envelope is required")
	}

	passwordHash, err := bcrypt.GenerateFromPassword(pepperPassword(newPassword, s.cfg.EncryptionPepper), 12)
	if err != nil {
		return apierr.ErrInternal
	}

	kvh := s.deriveKeyVerificationHash(newPassword)
	if err := s.repos.Users.UpdatePassword(ctx, userID, string(passwordHash), kvh, defaultArgon2ParamsJSON(), newMEKEnvelope); err != nil {
		return apierr.ErrInternal
	}

	s.auditLog(ctx, userID, "auth.password_changed", "", "")
	return nil
}

func (s *AuthService) GetMe(ctx context.Context, userID string) (*models.User, error) {
	user, err := s.repos.Users.GetByID(ctx, userID)
	if err != nil || user == nil {
		return nil, apierr.ErrNotFound
	}
	return user, nil
}

func (s *AuthService) UpdateMe(ctx context.Context, userID, displayName string) (*models.User, error) {
	user, err := s.repos.Users.GetByID(ctx, userID)
	if err != nil || user == nil {
		return nil, apierr.ErrNotFound
	}
	user.DisplayName = displayName
	if err := s.repos.Users.Update(ctx, user); err != nil {
		return nil, apierr.ErrInternal
	}
	return user, nil
}

func (s *AuthService) RequestEmailChange(ctx context.Context, userID, currentPassword, newEmail string) error {
	user, err := s.repos.Users.GetByID(ctx, userID)
	if err != nil || user == nil {
		return apierr.ErrNotFound
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(currentPassword)); err != nil {
		return apierr.New(http.StatusUnauthorized, "invalid_password", "Current password is incorrect")
	}

	newEmail = strings.ToLower(strings.TrimSpace(newEmail))
	if newEmail == user.Email {
		return apierr.New(http.StatusBadRequest, "same_email", "New email is the same as your current email")
	}

	exists, err := s.repos.Users.EmailExists(ctx, newEmail)
	if err != nil {
		return apierr.ErrInternal
	}
	if exists {
		return apierr.New(http.StatusConflict, "email_taken", "That email address is already in use")
	}

	token, err := generateSecureToken(32)
	if err != nil {
		return apierr.ErrInternal
	}

	if err := s.repos.Users.SetEmailChangeToken(ctx, userID, newEmail, token); err != nil {
		return apierr.ErrInternal
	}

	appName := resolveAppName(ctx, s.repos, s.cfg)
	confirmURL := fmt.Sprintf("%s/confirm-email-change?token=%s", s.cfg.BaseURL, token)

	// Send verification to the new address
	s.email.SendAsync(ctx, newEmail, "email_change_verify", map[string]string{
		"app_name":    appName,
		"confirm_url": confirmURL,
		"new_email":   newEmail,
	})

	// Notify old address as a security heads-up
	s.email.SendAsync(ctx, user.Email, "email_change_notice", map[string]string{
		"app_name":  appName,
		"new_email": newEmail,
	})

	s.auditLog(ctx, userID, "user.email_change_requested", "", "")
	return nil
}

func (s *AuthService) ConfirmEmailChange(ctx context.Context, token string) error {
	user, err := s.repos.Users.GetByEmailChangeToken(ctx, token)
	if err != nil || user == nil {
		return apierr.New(http.StatusBadRequest, "invalid_token", "Invalid or expired email change link")
	}

	if err := s.repos.Users.ApplyEmailChange(ctx, user.ID); err != nil {
		return apierr.ErrInternal
	}

	s.auditLog(ctx, user.ID, "user.email_changed", "", "")
	return nil
}

func (s *AuthService) ListSessions(ctx context.Context, userID string) ([]*models.Session, error) {
	return s.repos.Sessions.ListByUser(ctx, userID)
}

func (s *AuthService) RevokeSession(ctx context.Context, userID, sessionID string) error {
	deleted, err := s.repos.Sessions.DeleteByIDAndUser(ctx, sessionID, userID)
	if err != nil {
		return apierr.ErrInternal
	}
	if !deleted {
		return apierr.ErrNotFound
	}
	return nil
}

// RevokeAllSessions deletes all sessions for the user except the one identified by the current refresh token.
func (s *AuthService) RevokeAllSessions(ctx context.Context, userID, currentRefreshToken string) error {
	if currentRefreshToken != "" {
		current, err := s.repos.Sessions.GetByTokenHash(ctx, hashToken(currentRefreshToken))
		if err == nil && current != nil {
			return s.repos.Sessions.DeleteAllForUserExcept(ctx, userID, current.ID)
		}
	}
	return s.repos.Sessions.DeleteAllForUser(ctx, userID)
}

func (s *AuthService) ForgotPassword(ctx context.Context, email string) error {
	user, err := s.repos.Users.GetByEmail(ctx, strings.ToLower(email))
	if err != nil || user == nil || !user.EmailVerified {
		return nil // Silent — don't reveal whether email exists
	}

	token, err := generateSecureToken(32)
	if err != nil {
		return nil
	}

	tokenHash := hashToken(token)
	if err := s.repos.Users.SetVerifyToken(ctx, user.ID, tokenHash); err != nil {
		return nil
	}

	resetURL := fmt.Sprintf("%s/reset-password?token=%s", s.cfg.BaseURL, token)
	s.email.SendAsync(ctx, user.Email, "forgot_password", map[string]string{
		"display_name": user.DisplayName,
		"reset_url":    resetURL,
		"app_name": resolveAppName(ctx, s.repos, s.cfg),
	})

	s.auditLog(ctx, user.ID, "auth.forgot_password", "", "")
	return nil
}

// ResetPassword is used for the email-token-based reset flow (no ZK — wipes crypto state).
// For ZK-preserving recovery, use RecoverComplete instead.
func (s *AuthService) ResetPassword(ctx context.Context, token, newPassword string) error {
	tokenHash := hashToken(token)
	user, err := s.repos.Users.GetByResetToken(ctx, tokenHash)
	if err != nil {
		return apierr.ErrInternal
	}
	if user == nil {
		return apierr.New(http.StatusBadRequest, "invalid_token", "This reset link is invalid or has expired.")
	}

	passwordHash, err := bcrypt.GenerateFromPassword(pepperPassword(newPassword, s.cfg.EncryptionPepper), 12)
	if err != nil {
		return apierr.ErrInternal
	}

	// mek_envelope is left unchanged — caller must re-derive MEK from recovery key and supply new envelope.
	// This endpoint only resets the server-side password; the client must call SetMEKEnvelope separately.
	kvh := s.deriveKeyVerificationHash(newPassword)
	if err := s.repos.Users.UpdatePassword(ctx, user.ID, string(passwordHash), kvh, defaultArgon2ParamsJSON(), user.MEKEnvelope); err != nil {
		return apierr.ErrInternal
	}

	s.repos.Sessions.DeleteAllForUser(ctx, user.ID)
	s.auditLog(ctx, user.ID, "auth.password_reset", "", "")
	return nil
}

// RecoverStart initiates account recovery via recovery key.
// Sends a time-limited token to the user's email; the token is used to fetch the
// recovery_key_envelope so the client can unwrap the MEK without the password.
func (s *AuthService) RecoverStart(ctx context.Context, email string) {
	user, err := s.repos.Users.GetByEmail(ctx, strings.ToLower(email))
	if err != nil || user == nil || !user.EmailVerified || !user.RecoveryKeyEnvelope.Valid {
		return // silent — don't reveal account existence or recovery key status
	}

	token, err := generateSecureToken(32)
	if err != nil {
		return
	}
	tokenHash := hashToken(token)
	if err := s.repos.Users.SetVerifyToken(ctx, user.ID, tokenHash); err != nil {
		return
	}

	recoverURL := fmt.Sprintf("%s/recover?token=%s", s.cfg.BaseURL, token)
	s.email.SendAsync(ctx, user.Email, "recover_account", map[string]string{
		"display_name": user.DisplayName,
		"recover_url":  recoverURL,
		"app_name": resolveAppName(ctx, s.repos, s.cfg),
	})
	s.auditLog(ctx, user.ID, "auth.recover_started", "", "")
}

// RecoverValidate returns the crypto material needed for the client to unwrap the MEK
// using the recovery key. The token must be valid and the user must have a recovery key set.
func (s *AuthService) RecoverValidate(ctx context.Context, token string) (*models.User, error) {
	tokenHash := hashToken(token)
	user, err := s.repos.Users.GetByResetToken(ctx, tokenHash)
	if err != nil {
		return nil, apierr.ErrInternal
	}
	if user == nil || !user.RecoveryKeyEnvelope.Valid {
		return nil, apierr.New(http.StatusBadRequest, "invalid_token", "This recovery link is invalid or has expired.")
	}
	return user, nil
}

// RecoverComplete re-encrypts the MEK with the new password's KEK and updates the password.
// The client decrypts the MEK using the recovery key, derives a new KEK from the new password,
// re-wraps the MEK, and supplies the new mek_envelope here.
func (s *AuthService) RecoverComplete(ctx context.Context, token, newPassword, newMEKEnvelope string) error {
	tokenHash := hashToken(token)
	user, err := s.repos.Users.GetByResetToken(ctx, tokenHash)
	if err != nil {
		return apierr.ErrInternal
	}
	if user == nil {
		return apierr.New(http.StatusBadRequest, "invalid_token", "This recovery link is invalid or has expired.")
	}
	if newMEKEnvelope == "" {
		return apierr.New(http.StatusBadRequest, "missing_crypto", "new_mek_envelope is required")
	}

	passwordHash, err := bcrypt.GenerateFromPassword(pepperPassword(newPassword, s.cfg.EncryptionPepper), 12)
	if err != nil {
		return apierr.ErrInternal
	}

	kvh := s.deriveKeyVerificationHash(newPassword)
	if err := s.repos.Users.UpdatePassword(ctx, user.ID, string(passwordHash), kvh, defaultArgon2ParamsJSON(), newMEKEnvelope); err != nil {
		return apierr.ErrInternal
	}

	s.repos.Sessions.DeleteAllForUser(ctx, user.ID)
	s.auditLog(ctx, user.ID, "auth.recover_completed", "", "")
	return nil
}

// SetRecoveryKey stores the client-supplied recovery_key_envelope for a user.
// The envelope is the MEK encrypted with the user's recovery key (derived from BIP39 mnemonic).
func (s *AuthService) SetRecoveryKey(ctx context.Context, userID, envelope string) error {
	if envelope == "" {
		return apierr.New(http.StatusBadRequest, "missing_envelope", "recovery_key_envelope is required")
	}
	if err := s.repos.Users.SetRecoveryKeyEnvelope(ctx, userID, envelope); err != nil {
		return apierr.ErrInternal
	}
	s.auditLog(ctx, userID, "auth.recovery_key_set", "", "")
	return nil
}

// GetCryptoParams returns the mek_salt, argon2_params, and mek_envelope for a user by email.
// Used by the login flow; only called after password is verified.
func (s *AuthService) GetCryptoParams(ctx context.Context, userID string) (mekSalt, argon2Params, mekEnvelope string, err error) {
	user, err := s.repos.Users.GetByID(ctx, userID)
	if err != nil || user == nil {
		return "", "", "", apierr.ErrNotFound
	}
	return user.MEKSalt, user.Argon2Params, user.MEKEnvelope, nil
}

func (s *AuthService) IssueAccessToken(userID, role string) (string, error) {
	claims := jwt.MapClaims{
		"sub":  userID,
		"role": role,
		"iat":  time.Now().Unix(),
		"exp":  time.Now().Add(accessTokenDuration).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTSecret))
}

// --- helpers ---

func (s *AuthService) issueTokenPair(ctx context.Context, user *models.User, ip, ua string, isMobile bool) (*TokenPair, error) {
	accessToken, err := s.IssueAccessToken(user.ID, user.Role)
	if err != nil {
		return nil, apierr.ErrInternal
	}

	refreshToken, err := generateSecureToken(48)
	if err != nil {
		return nil, apierr.ErrInternal
	}

	clientType := "web"
	tokenDuration := webRefreshTokenDuration
	if isMobile {
		clientType = "mobile"
		tokenDuration = mobileRefreshTokenDuration
	}

	session := &models.Session{
		ID:               uuid.New().String(),
		UserID:           user.ID,
		RefreshTokenHash: hashToken(refreshToken),
		DeviceInfo:       ua,
		IPAddress:        ip,
		ExpiresAt:        time.Now().Add(tokenDuration),
		ClientType:       clientType,
	}
	if err := s.repos.Sessions.Create(ctx, session); err != nil {
		log.Printf("issueTokenPair: Sessions.Create error: %v", err)
		return nil, apierr.ErrInternal
	}

	return &TokenPair{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		User:         user,
	}, nil
}

func (s *AuthService) verifyMFACode(user *models.User, code string) bool {
	if !user.MFASecret.Valid {
		return false
	}
	// Try TOTP first
	if totp.Validate(code, user.MFASecret.String) {
		return true
	}
	// Try backup codes
	if user.MFABackupCodes.Valid {
		lines := strings.Split(user.MFABackupCodes.String, "\n")
		for i, hash := range lines {
			if hash == "" {
				continue
			}
			if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(code)); err == nil {
				// Invalidate used backup code
				lines[i] = ""
				s.repos.Users.UpdateMFA(context.Background(), user.ID, true,
					user.MFASecret.String, strings.Join(lines, "\n"))
				return true
			}
		}
	}
	return false
}

func (s *AuthService) deriveKeyVerificationHash(password string) string {
	// Argon2id with deterministic params to produce KVH
	// Uses a fixed salt derived from the pepper so the server can verify
	// without storing the actual MEK
	pepper := []byte(s.cfg.EncryptionPepper)
	salt := sha256.Sum256(append(pepper, []byte("kvh")...))
	hash := argon2.IDKey([]byte(password), salt[:16], 3, 64*1024, 4, 32)
	return hex.EncodeToString(hash)
}

func (s *AuthService) recordLoginCheckin(ctx context.Context, userID, ip, clientType string) {
	// Respect admin toggle — default on.
	if v, err := s.repos.SystemConfig.Get(ctx, "login_counts_as_checkin"); err == nil && v == "false" {
		return
	}

	sw, err := s.repos.Switch.GetByUserID(ctx, userID)
	if err != nil || sw == nil || sw.Status != "active" {
		return
	}

	method := clientType
	if method == "" {
		method = "web"
	}

	checkin := &models.SwitchCheckin{
		ID:        uuid.New().String(),
		UserID:    userID,
		Method:    method,
		IPAddress: ip,
	}
	s.repos.Switch.SaveCheckin(ctx, checkin)

	user, _ := s.repos.Users.GetByID(ctx, userID)
	now := time.Now()
	sw.LastCheckinAt.Time = now
	sw.LastCheckinAt.Valid = true
	sw.NextCheckinDeadline.Time = computeDeadline(now, sw.CheckInIntervalDays, sw, locFromUser(user))
	sw.NextCheckinDeadline.Valid = true
	sw.Reminder1SentAt.Valid = false
	sw.Reminder2SentAt.Valid = false
	sw.Reminder3SentAt.Valid = false
	s.repos.Switch.Update(ctx, sw)
}

func (s *AuthService) auditLog(ctx context.Context, userID, eventType, ip, ua string) {
	s.repos.AuditLog.Log(ctx, &models.AuditLog{
		ID:        uuid.New().String(),
		UserID:    userID,
		EventType: eventType,
		EventData: "{}",
		IPAddress: ip,
		UserAgent: ua,
	})
}

func generateSecureToken(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func generateBackupCodes(n int) ([]string, error) {
	codes := make([]string, n)
	for i := range codes {
		b := make([]byte, 5)
		if _, err := rand.Read(b); err != nil {
			return nil, err
		}
		codes[i] = fmt.Sprintf("%x", b)
	}
	return codes, nil
}

func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

func defaultArgon2ParamsJSON() string {
	return `{"memory":65536,"iterations":3,"parallelism":4,"key_length":32}`
}

// pepperPassword pre-hashes password+pepper with SHA-256 to produce a fixed-length
// input for bcrypt, avoiding bcrypt's 72-byte maximum password length.
func pepperPassword(password, pepper string) []byte {
	h := sha256.Sum256([]byte(password + pepper))
	return h[:]
}
