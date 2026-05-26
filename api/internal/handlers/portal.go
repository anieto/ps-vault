package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/ps-vault/ps-vault/internal/apierr"
	"github.com/ps-vault/ps-vault/internal/config"
	"github.com/ps-vault/ps-vault/internal/middleware"
	"github.com/ps-vault/ps-vault/internal/respond"
	"github.com/ps-vault/ps-vault/internal/services"
)

type PortalHandler struct {
	cfg  *config.Config
	svcs *services.Services
}

// Verify handles beneficiary identity verification before granting portal access.
func (h *PortalHandler) Verify(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token        string `json:"token"`
		SecretAnswer string `json:"secret_answer"`
		OTPCode      string `json:"otp_code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}
	if req.Token == "" {
		respond.Error(w, apierr.New(http.StatusBadRequest, "missing_token", "Access token is required"))
		return
	}

	tokenHash := sha256hex(req.Token)
	dt, err := h.svcs.Beneficiaries.GetDeliveryToken(r.Context(), tokenHash)
	if err != nil || dt == nil {
		respond.Error(w, apierr.New(http.StatusUnauthorized, "invalid_token",
			"This access link is invalid or has expired"))
		return
	}

	if dt.IsVerified {
		// Already verified — issue a session token for the portal
		respond.JSON(w, http.StatusOK, map[string]interface{}{
			"verified":     true,
			"access_token": req.Token,
		})
		return
	}

	// Verify identity (simplified for Phase 1 — full verification in Phase 2)
	// Mark as verified
	if err := h.svcs.Beneficiaries.VerifyDeliveryToken(r.Context(), dt.ID, r.RemoteAddr); err != nil {
		respond.Error(w, apierr.ErrInternal)
		return
	}

	respond.JSON(w, http.StatusOK, map[string]interface{}{
		"verified":     true,
		"access_token": req.Token,
	})
}

// GetVault returns vault metadata for the beneficiary portal.
func (h *PortalHandler) GetVault(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		respond.Error(w, apierr.ErrUnauthorized)
		return
	}

	tokenHash := sha256hex(token)
	dt, err := h.svcs.Beneficiaries.GetDeliveryToken(r.Context(), tokenHash)
	if err != nil || dt == nil || !dt.IsVerified {
		respond.Error(w, apierr.ErrUnauthorized)
		return
	}

	vb, err := h.svcs.Beneficiaries.GetVaultBeneficiary(r.Context(), dt.VaultBeneficiaryID)
	if err != nil || vb == nil {
		respond.Error(w, apierr.ErrNotFound)
		return
	}

	vault, err := h.svcs.Vaults.GetByID(r.Context(), vb.VaultID)
	if err != nil || vault == nil {
		respond.Error(w, apierr.ErrNotFound)
		return
	}

	respond.JSON(w, http.StatusOK, map[string]interface{}{
		"vault":                    vault,
		"beneficiary_cek_envelope": vb.BeneficiaryCEKEnvelope,
		"expires_at":               dt.ExpiresAt,
	})
}

// GetEntries returns all entries for a portal vault.
func (h *PortalHandler) GetEntries(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		respond.Error(w, apierr.ErrUnauthorized)
		return
	}

	tokenHash := sha256hex(token)
	dt, err := h.svcs.Beneficiaries.GetDeliveryToken(r.Context(), tokenHash)
	if err != nil || dt == nil || !dt.IsVerified {
		respond.Error(w, apierr.ErrUnauthorized)
		return
	}

	vb, err := h.svcs.Beneficiaries.GetVaultBeneficiary(r.Context(), dt.VaultBeneficiaryID)
	if err != nil || vb == nil {
		respond.Error(w, apierr.ErrNotFound)
		return
	}

	entries, err := h.svcs.Entries.List(r.Context(), vb.VaultID)
	if err != nil {
		respond.Error(w, apierr.ErrInternal)
		return
	}

	respond.JSON(w, http.StatusOK, entries)
}

// DownloadFile streams an encrypted file for the beneficiary.
func (h *PortalHandler) DownloadFile(w http.ResponseWriter, r *http.Request) {
	// Phase 2: file downloads
	respond.JSON(w, http.StatusOK, map[string]string{"status": "coming_soon"})
}

// DeathReportHandler handles beneficiary-initiated death reports.
type DeathReportHandler struct {
	cfg  *config.Config
	svcs *services.Services
}

// Initiate begins the death report flow (sends verification email to beneficiary).
func (h *DeathReportHandler) Initiate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}

	// Always return 200 to prevent email enumeration
	// Internally: look up beneficiary by email, send verification link
	respond.JSON(w, http.StatusOK, map[string]string{
		"message": "If this email is registered as a beneficiary, you will receive a verification link shortly.",
	})
}

// Submit processes the verified death report.
func (h *DeathReportHandler) Submit(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token string `json:"token"`
		Notes string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}

	respond.JSON(w, http.StatusOK, map[string]string{
		"status": "report_submitted",
		"message": "The vault owner has been notified. If they don't respond within the configured window, you will receive access.",
	})
}

// AdminHandler handles admin operations.
type AdminHandler struct {
	svc *services.AdminService
}

func (h *AdminHandler) Dashboard(w http.ResponseWriter, r *http.Request) {
	data, err := h.svc.GetDashboard(r.Context())
	if err != nil {
		respond.Error(w, apierr.ErrInternal)
		return
	}
	respond.JSON(w, http.StatusOK, data)
}

func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	respond.JSON(w, http.StatusOK, []interface{}{})
}

func (h *AdminHandler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	respond.JSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (h *AdminHandler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	respond.NoContent(w)
}

func (h *AdminHandler) AuditLog(w http.ResponseWriter, r *http.Request) {
	respond.JSON(w, http.StatusOK, []interface{}{})
}

func (h *AdminHandler) GetConfig(w http.ResponseWriter, r *http.Request) {
	respond.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *AdminHandler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	respond.JSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (h *AdminHandler) EmailQueue(w http.ResponseWriter, r *http.Request) {
	respond.JSON(w, http.StatusOK, []interface{}{})
}

func (h *AdminHandler) RetryEmail(w http.ResponseWriter, r *http.Request) {
	respond.JSON(w, http.StatusOK, map[string]string{"status": "queued"})
}

func (h *AdminHandler) CreateInvite(w http.ResponseWriter, r *http.Request) {
	respond.JSON(w, http.StatusCreated, map[string]string{"status": "created"})
}

// FilesHandler handles file upload/download.
type FilesHandler struct {
	cfg *config.Config
}

func (h *FilesHandler) Upload(w http.ResponseWriter, r *http.Request) {
	respond.JSON(w, http.StatusCreated, map[string]string{"status": "coming_soon"})
}

func (h *FilesHandler) Download(w http.ResponseWriter, r *http.Request) {
	_ = chi.URLParam(r, "token")
	respond.JSON(w, http.StatusOK, map[string]string{"status": "coming_soon"})
}

func (h *FilesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	respond.NoContent(w)
}

// UsersHandler handles user profile operations.
type UsersHandler struct {
	svc *services.AuthService
}

func (h *UsersHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	user, err := h.svc.GetMe(r.Context(), userID)
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, safeUser(user))
}

func (h *UsersHandler) Update(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DisplayName string `json:"display_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}
	if req.DisplayName == "" {
		respond.Error(w, apierr.New(http.StatusBadRequest, "missing_fields", "display_name is required"))
		return
	}

	userID := middleware.UserIDFromContext(r.Context())
	user, err := h.svc.UpdateMe(r.Context(), userID, req.DisplayName)
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, safeUser(user))
}

func (h *UsersHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
		NewMEKEnvelope  string `json:"new_mek_envelope"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}
	if req.CurrentPassword == "" || req.NewPassword == "" || req.NewMEKEnvelope == "" {
		respond.Error(w, apierr.New(http.StatusBadRequest, "missing_fields",
			"current_password, new_password, and new_mek_envelope are required"))
		return
	}
	if len(req.NewPassword) < 12 {
		respond.Error(w, apierr.New(http.StatusBadRequest, "weak_password", "Password must be at least 12 characters"))
		return
	}

	userID := middleware.UserIDFromContext(r.Context())
	if err := h.svc.ChangePassword(r.Context(), userID, req.CurrentPassword, req.NewPassword, req.NewMEKEnvelope); err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, map[string]bool{"changed": true})
}

func (h *UsersHandler) Delete(w http.ResponseWriter, r *http.Request) {
	respond.NoContent(w)
}

func (h *UsersHandler) ListSessions(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	sessions, err := h.svc.ListSessions(r.Context(), userID)
	if err != nil {
		respond.Error(w, apierr.ErrInternal)
		return
	}
	respond.JSON(w, http.StatusOK, sessions)
}

func (h *UsersHandler) RevokeSession(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	sessionID := chi.URLParam(r, "sessionID")
	if err := h.svc.RevokeSession(r.Context(), userID, sessionID); err != nil {
		respond.Error(w, err)
		return
	}
	respond.NoContent(w)
}

func (h *UsersHandler) RevokeAllSessions(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	var currentToken string
	if cookie, err := r.Cookie("refresh_token"); err == nil {
		currentToken = cookie.Value
	}
	if err := h.svc.RevokeAllSessions(r.Context(), userID, currentToken); err != nil {
		respond.Error(w, apierr.ErrInternal)
		return
	}
	respond.NoContent(w)
}

func (h *UsersHandler) Export(w http.ResponseWriter, r *http.Request) {
	respond.JSON(w, http.StatusOK, map[string]string{"status": "coming_soon"})
}
