package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/ps-vault/ps-vault/internal/apierr"
	"github.com/ps-vault/ps-vault/internal/middleware"
	"github.com/ps-vault/ps-vault/internal/respond"
	"github.com/ps-vault/ps-vault/internal/services"
)

type VaultsHandler struct {
	svc *services.VaultService
}

func (h *VaultsHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	vaults, err := h.svc.List(r.Context(), userID)
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, vaults)
}

func (h *VaultsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name               string `json:"name"`
		Description        string `json:"description"`
		Icon               string `json:"icon"`
		Color              string `json:"color"`
		CEKEnvelope        string `json:"cek_envelope"`
		DeliveryMessageEnc string `json:"delivery_message_enc"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}
	if req.Name == "" {
		respond.Error(w, apierr.New(http.StatusBadRequest, "missing_name", "Vault name is required"))
		return
	}

	userID := middleware.UserIDFromContext(r.Context())
	vault, err := h.svc.Create(r.Context(), services.CreateVaultInput{
		UserID:             userID,
		Name:               req.Name,
		Description:        req.Description,
		Icon:               req.Icon,
		Color:              req.Color,
		CEKEnvelope:        req.CEKEnvelope,
		DeliveryMessageEnc: req.DeliveryMessageEnc,
	})
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusCreated, vault)
}

func (h *VaultsHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	vaultID := chi.URLParam(r, "vaultID")

	vault, err := h.svc.Get(r.Context(), vaultID, userID)
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, vault)
}

func (h *VaultsHandler) Update(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name                        *string `json:"name"`
		Description                 *string `json:"description"`
		Icon                        *string `json:"icon"`
		Color                       *string `json:"color"`
		Status                      *string `json:"status"`
		DeliveryMessageEnc          *string `json:"delivery_message_enc"`
		CEKEnvelope                 *string `json:"cek_envelope"`
		SwitchEnabled               *bool   `json:"switch_enabled"`
		CheckInIntervalOverride     *int    `json:"check_in_interval_override"`
		AbortWindowOverride         *int    `json:"abort_window_override"`
		AdditionalDeliveryDelayDays *int    `json:"additional_delivery_delay_days"`
		PostDeliveryRetention       *string `json:"post_delivery_retention"`
		PostDeliveryRetentionDays   *int    `json:"post_delivery_retention_days"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}

	userID := middleware.UserIDFromContext(r.Context())
	vaultID := chi.URLParam(r, "vaultID")

	vault, err := h.svc.Update(r.Context(), vaultID, userID, services.UpdateVaultInput{
		Name:                        req.Name,
		Description:                 req.Description,
		Icon:                        req.Icon,
		Color:                       req.Color,
		Status:                      req.Status,
		DeliveryMessageEnc:          req.DeliveryMessageEnc,
		CEKEnvelope:                 req.CEKEnvelope,
		SwitchEnabled:               req.SwitchEnabled,
		CheckInIntervalOverride:     req.CheckInIntervalOverride,
		AbortWindowOverride:         req.AbortWindowOverride,
		AdditionalDeliveryDelayDays: req.AdditionalDeliveryDelayDays,
		PostDeliveryRetention:       req.PostDeliveryRetention,
		PostDeliveryRetentionDays:   req.PostDeliveryRetentionDays,
	})
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, vault)
}

func (h *VaultsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	vaultID := chi.URLParam(r, "vaultID")

	if err := h.svc.Delete(r.Context(), vaultID, userID); err != nil {
		respond.Error(w, err)
		return
	}
	respond.NoContent(w)
}

func (h *VaultsHandler) Export(w http.ResponseWriter, r *http.Request) {
	// Phase 2: export vault as encrypted archive or PDF
	respond.JSON(w, http.StatusOK, map[string]string{"status": "coming_soon"})
}

func (h *VaultsHandler) Preview(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	vaultID := chi.URLParam(r, "vaultID")

	vault, err := h.svc.Get(r.Context(), vaultID, userID)
	if err != nil {
		respond.Error(w, err)
		return
	}
	// Return vault data as the beneficiary would see it
	// The client renders this in the preview portal UI
	respond.JSON(w, http.StatusOK, map[string]interface{}{
		"vault":       vault,
		"preview_mode": true,
	})
}
