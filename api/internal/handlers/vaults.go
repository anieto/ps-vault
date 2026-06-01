package handlers

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/ps-vault/ps-vault/internal/apierr"
	"github.com/ps-vault/ps-vault/internal/middleware"
	"github.com/ps-vault/ps-vault/internal/respond"
	"github.com/ps-vault/ps-vault/internal/services"
)

type VaultsHandler struct {
	svc     *services.VaultService
	fileSvc *services.FileService
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
		AccessMode                  *string `json:"access_mode"`
		CascadeWindowDays           *int    `json:"cascade_window_days"`
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
		AccessMode:                  req.AccessMode,
		CascadeWindowDays:           req.CascadeWindowDays,
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
	userID := middleware.UserIDFromContext(r.Context())
	vaultID := chi.URLParam(r, "vaultID")

	data, err := h.svc.GetExportData(r.Context(), vaultID, userID)
	if err != nil {
		respond.Error(w, err)
		return
	}

	filename := fmt.Sprintf("vault-%s-%s.zip", data.Vault.Name, time.Now().UTC().Format("2006-01-02"))
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)

	zw := zip.NewWriter(w)
	defer zw.Close()

	// export_info.json — vault metadata and CEK envelope for client-side decryption
	infoBytes, _ := json.Marshal(map[string]interface{}{
		"export_version": "1",
		"exported_at":    time.Now().UTC().Format(time.RFC3339),
		"vault": map[string]interface{}{
			"id":           data.Vault.ID,
			"name":         data.Vault.Name,
			"cek_envelope": data.Vault.CEKEnvelope,
		},
	})
	if f, err := zw.Create("export_info.json"); err == nil {
		f.Write(infoBytes) //nolint:errcheck
	}

	// entries.json — all encrypted entry ciphertext
	entriesBytes, _ := json.Marshal(data.Entries)
	if f, err := zw.Create("entries.json"); err == nil {
		f.Write(entriesBytes) //nolint:errcheck
	}

	// files/ — encrypted blobs, one per vault file
	for _, vf := range data.Files {
		_, rc, dlErr := h.fileSvc.Download(r.Context(), userID, vf.StorageToken)
		if dlErr != nil {
			continue
		}
		if f, zipErr := zw.Create(fmt.Sprintf("files/%s", vf.ID)); zipErr == nil {
			io.Copy(f, rc) //nolint:errcheck
		}
		rc.Close()
	}
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
