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

type BeneficiariesHandler struct {
	svc *services.BeneficiaryService
}

func (h *BeneficiariesHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	beneficiaries, err := h.svc.List(r.Context(), userID)
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, beneficiaries)
}

func (h *BeneficiariesHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name               string `json:"name"`
		Email              string `json:"email"`
		Phone              string `json:"phone"`
		Relationship       string `json:"relationship"`
		VerificationMethod string `json:"verification_method"`
		SecretQuestion     string `json:"secret_question"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}
	if req.Name == "" || req.Email == "" {
		respond.Error(w, apierr.New(http.StatusBadRequest, "missing_fields",
			"Name and email are required"))
		return
	}

	userID := middleware.UserIDFromContext(r.Context())
	b, err := h.svc.Create(r.Context(), userID, services.CreateBeneficiaryInput{
		Name:               req.Name,
		Email:              req.Email,
		Phone:              req.Phone,
		Relationship:       req.Relationship,
		VerificationMethod: req.VerificationMethod,
		SecretQuestion:     req.SecretQuestion,
	})
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusCreated, b)
}

func (h *BeneficiariesHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	id := chi.URLParam(r, "beneficiaryID")

	b, err := h.svc.Get(r.Context(), id, userID)
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, b)
}

func (h *BeneficiariesHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	id := chi.URLParam(r, "beneficiaryID")

	var req struct {
		Name           string `json:"name"`
		Email          string `json:"email"`
		Relationship   string `json:"relationship"`
		SecretQuestion string `json:"secret_question"`
		PhotoData      string `json:"photo_data"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}

	b, err := h.svc.Update(r.Context(), id, userID, services.UpdateBeneficiaryInput{
		Name:           req.Name,
		Email:          req.Email,
		Relationship:   req.Relationship,
		SecretQuestion: req.SecretQuestion,
		PhotoData:      req.PhotoData,
	})
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, b)
}

func (h *BeneficiariesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	id := chi.URLParam(r, "beneficiaryID")

	if err := h.svc.Delete(r.Context(), id, userID); err != nil {
		respond.Error(w, err)
		return
	}
	respond.NoContent(w)
}

func (h *BeneficiariesHandler) ListBeneficiaryVaults(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	beneficiaryID := chi.URLParam(r, "beneficiaryID")

	vaults, err := h.svc.GetVaultsByBeneficiary(r.Context(), beneficiaryID, userID)
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, vaults)
}

func (h *BeneficiariesHandler) ListVaultBeneficiaries(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	vaultID := chi.URLParam(r, "vaultID")

	list, err := h.svc.GetVaultBeneficiaries(r.Context(), vaultID, userID)
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, list)
}

func (h *BeneficiariesHandler) AssignVaultBeneficiary(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	vaultID := chi.URLParam(r, "vaultID")

	var req struct {
		BeneficiaryID          string `json:"beneficiary_id"`
		BeneficiaryCEKEnvelope string `json:"beneficiary_cek_envelope"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}
	if req.BeneficiaryID == "" || req.BeneficiaryCEKEnvelope == "" {
		respond.Error(w, apierr.New(http.StatusBadRequest, "missing_fields", "beneficiary_id and beneficiary_cek_envelope are required"))
		return
	}

	if err := h.svc.AssignToVault(r.Context(), vaultID, req.BeneficiaryID, userID, req.BeneficiaryCEKEnvelope); err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, map[string]string{"status": "assigned"})
}

func (h *BeneficiariesHandler) RemoveVaultBeneficiary(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	vaultID := chi.URLParam(r, "vaultID")
	beneficiaryID := chi.URLParam(r, "beneficiaryID")

	if err := h.svc.RemoveFromVault(r.Context(), vaultID, beneficiaryID, userID); err != nil {
		respond.Error(w, err)
		return
	}
	respond.NoContent(w)
}

func (h *BeneficiariesHandler) SetBeneficiaryTier(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	vaultID := chi.URLParam(r, "vaultID")
	beneficiaryID := chi.URLParam(r, "beneficiaryID")

	var req struct {
		Tier              *string `json:"tier"`
		CascadeWindowDays *int    `json:"cascade_window_days"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}

	if err := h.svc.SetBeneficiaryTier(r.Context(), vaultID, beneficiaryID, userID, req.Tier, req.CascadeWindowDays); err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (h *BeneficiariesHandler) ResendConfirmation(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	id := chi.URLParam(r, "beneficiaryID")

	if err := h.svc.ResendConfirmation(r.Context(), id, userID); err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, map[string]string{"status": "sent"})
}

// TrustedContactsHandler handles trusted contact operations.
type TrustedContactsHandler struct {
	svc *services.BeneficiaryService
}

func (h *TrustedContactsHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	contacts, err := h.svc.ListTrustedContacts(r.Context(), userID)
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, contacts)
}

func (h *TrustedContactsHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var req struct {
		Name                  string `json:"name"`
		Email                 string `json:"email"`
		Phone                 string `json:"phone"`
		NotifyOnFinalWarning  bool   `json:"notify_on_final_warning"`
		CanAbort              bool   `json:"can_abort"`
		CanVerifyLife         bool   `json:"can_verify_life"`
		CanCorroborateDeath   bool   `json:"can_corroborate_death"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}
	if req.Name == "" || req.Email == "" {
		respond.Error(w, apierr.New(http.StatusBadRequest, "missing_fields", "Name and email are required"))
		return
	}

	tc, err := h.svc.CreateTrustedContact(r.Context(), userID, services.TrustedContactInput{
		Name:                 req.Name,
		Email:                req.Email,
		Phone:                req.Phone,
		NotifyOnFinalWarning: req.NotifyOnFinalWarning,
		CanAbort:             req.CanAbort,
		CanVerifyLife:        req.CanVerifyLife,
		CanCorroborateDeath:  req.CanCorroborateDeath,
	})
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusCreated, tc)
}

func (h *TrustedContactsHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	id := chi.URLParam(r, "contactID")

	var req struct {
		Name                  string `json:"name"`
		Email                 string `json:"email"`
		Phone                 string `json:"phone"`
		NotifyOnFinalWarning  bool   `json:"notify_on_final_warning"`
		CanAbort              bool   `json:"can_abort"`
		CanVerifyLife         bool   `json:"can_verify_life"`
		CanCorroborateDeath   bool   `json:"can_corroborate_death"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}

	tc, err := h.svc.UpdateTrustedContact(r.Context(), id, userID, services.TrustedContactInput{
		Name:                 req.Name,
		Email:                req.Email,
		Phone:                req.Phone,
		NotifyOnFinalWarning: req.NotifyOnFinalWarning,
		CanAbort:             req.CanAbort,
		CanVerifyLife:        req.CanVerifyLife,
		CanCorroborateDeath:  req.CanCorroborateDeath,
	})
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, tc)
}

func (h *TrustedContactsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	id := chi.URLParam(r, "contactID")

	if err := h.svc.DeleteTrustedContact(r.Context(), id, userID); err != nil {
		respond.Error(w, err)
		return
	}
	respond.NoContent(w)
}
