package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/ps-vault/ps-vault/internal/apierr"
	"github.com/ps-vault/ps-vault/internal/config"
	"github.com/ps-vault/ps-vault/internal/middleware"
	"github.com/ps-vault/ps-vault/internal/respond"
	"github.com/ps-vault/ps-vault/internal/services"
)

type DeathReportHandler struct {
	cfg  *config.Config
	svcs *services.Services
}

// Initiate sends a magic link to the given email if it matches a known beneficiary.
// Always returns 200 to prevent enumeration.
func (h *DeathReportHandler) Initiate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}
	h.svcs.DeathReport.Initiate(r.Context(), req.Email) //nolint:errcheck
	respond.JSON(w, http.StatusOK, map[string]string{
		"message": "If that email is registered as a beneficiary, you will receive a link shortly.",
	})
}

// ValidateToken checks that a magic link token is valid and returns the owner name.
func (h *DeathReportHandler) ValidateToken(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		respond.Error(w, apierr.New(http.StatusBadRequest, "missing_token", "Token is required"))
		return
	}
	ownerName, _, err := h.svcs.DeathReport.ValidateToken(r.Context(), token)
	if err != nil {
		respond.Error(w, apierr.New(http.StatusBadRequest, "invalid_token", err.Error()))
		return
	}
	respond.JSON(w, http.StatusOK, map[string]string{"owner_name": ownerName})
}

// Submit creates a death report from a validated magic link token.
func (h *DeathReportHandler) Submit(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token         string `json:"token"`
		DateOfPassing string `json:"date_of_passing"`
		Notes         string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}
	if err := h.svcs.DeathReport.Submit(r.Context(), services.SubmitInput{
		Token:         req.Token,
		DateOfPassing: req.DateOfPassing,
		Notes:         req.Notes,
	}); err != nil {
		respond.Error(w, apierr.New(http.StatusBadRequest, "submit_failed", err.Error()))
		return
	}
	respond.JSON(w, http.StatusOK, map[string]string{"status": "submitted"})
}

// VerifyLife dismisses a pending death report via the owner's one-click token.
func (h *DeathReportHandler) VerifyLife(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		respond.Error(w, apierr.New(http.StatusBadRequest, "missing_token", "Token is required"))
		return
	}
	if err := h.svcs.DeathReport.VerifyLife(r.Context(), token); err != nil {
		respond.Error(w, apierr.New(http.StatusBadRequest, "verify_failed", err.Error()))
		return
	}
	respond.JSON(w, http.StatusOK, map[string]string{"status": "dismissed"})
}

// TrustedVerifyLife lets a trusted contact dismiss a pending death report via their one-click token.
func (h *DeathReportHandler) TrustedVerifyLife(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}
	if err := h.svcs.DeathReport.TrustedVerifyLife(r.Context(), req.Token); err != nil {
		respond.Error(w, apierr.New(http.StatusBadRequest, "verify_failed", err.Error()))
		return
	}
	respond.JSON(w, http.StatusOK, map[string]string{"status": "dismissed"})
}

// TrustedCorroborate lets a trusted contact corroborate a pending death report via their one-click token.
func (h *DeathReportHandler) TrustedCorroborate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}
	if err := h.svcs.DeathReport.TrustedCorroborate(r.Context(), req.Token); err != nil {
		respond.Error(w, apierr.New(http.StatusBadRequest, "corroborate_failed", err.Error()))
		return
	}
	respond.JSON(w, http.StatusOK, map[string]string{"status": "corroborated"})
}

// Active returns the active (pending) death report for the authenticated owner, if any.
func (h *DeathReportHandler) Active(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	dr, err := h.svcs.DeathReport.GetActive(r.Context(), userID)
	if err != nil {
		respond.Error(w, apierr.ErrInternal)
		return
	}
	respond.JSON(w, http.StatusOK, dr)
}
