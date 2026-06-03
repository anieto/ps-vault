package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/ps-vault/ps-vault/internal/apierr"
	"github.com/ps-vault/ps-vault/internal/respond"
	"github.com/ps-vault/ps-vault/internal/services"
)

type BeneficiaryAccessHandler struct {
	svcs *services.Services
}

// Initiate accepts an email and sends a magic link if any beneficiary records exist.
func (h *BeneficiaryAccessHandler) Initiate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}
	h.svcs.Beneficiaries.InitiateAccess(r.Context(), req.Email) //nolint:errcheck
	respond.JSON(w, http.StatusOK, map[string]string{"status": "sent"})
}

// GetPortal validates a token and returns the beneficiary's portal info.
func (h *BeneficiaryAccessHandler) GetPortal(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		respond.Error(w, apierr.ErrUnauthorized)
		return
	}
	info, err := h.svcs.Beneficiaries.GetPortalInfo(r.Context(), token)
	if err != nil {
		respond.Error(w, apierr.New(http.StatusUnauthorized, "invalid_token", "This link is invalid or has expired"))
		return
	}
	respond.JSON(w, http.StatusOK, info)
}
