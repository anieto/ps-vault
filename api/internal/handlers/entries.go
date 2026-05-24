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

type EntriesHandler struct {
	vaultSvc *services.VaultService
	entrySvc *services.EntryService
}

func (h *EntriesHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	vaultID := chi.URLParam(r, "vaultID")

	// Verify vault ownership
	if _, err := h.vaultSvc.Get(r.Context(), vaultID, userID); err != nil {
		respond.Error(w, err)
		return
	}

	entries, err := h.entrySvc.List(r.Context(), vaultID)
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, entries)
}

func (h *EntriesHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		EntryType     string `json:"entry_type"`
		Title         string `json:"title"`
		EncryptedData string `json:"encrypted_data"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}
	if req.Title == "" || req.EntryType == "" || req.EncryptedData == "" {
		respond.Error(w, apierr.New(http.StatusBadRequest, "missing_fields",
			"entry_type, title, and encrypted_data are required"))
		return
	}

	userID := middleware.UserIDFromContext(r.Context())
	vaultID := chi.URLParam(r, "vaultID")

	if _, err := h.vaultSvc.Get(r.Context(), vaultID, userID); err != nil {
		respond.Error(w, err)
		return
	}

	entry, err := h.entrySvc.Create(r.Context(), services.CreateEntryInput{
		VaultID:       vaultID,
		EntryType:     req.EntryType,
		Title:         req.Title,
		EncryptedData: req.EncryptedData,
	})
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusCreated, entry)
}

func (h *EntriesHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	vaultID := chi.URLParam(r, "vaultID")
	entryID := chi.URLParam(r, "entryID")

	if _, err := h.vaultSvc.Get(r.Context(), vaultID, userID); err != nil {
		respond.Error(w, err)
		return
	}

	entry, err := h.entrySvc.Get(r.Context(), entryID, vaultID)
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, entry)
}

func (h *EntriesHandler) Update(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Title         *string `json:"title"`
		EncryptedData *string `json:"encrypted_data"`
		IsFavorite    *bool   `json:"is_favorite"`
		SortOrder     *int    `json:"sort_order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}

	userID := middleware.UserIDFromContext(r.Context())
	vaultID := chi.URLParam(r, "vaultID")
	entryID := chi.URLParam(r, "entryID")

	if _, err := h.vaultSvc.Get(r.Context(), vaultID, userID); err != nil {
		respond.Error(w, err)
		return
	}

	entry, err := h.entrySvc.Update(r.Context(), entryID, vaultID, services.UpdateEntryInput{
		Title:         req.Title,
		EncryptedData: req.EncryptedData,
		IsFavorite:    req.IsFavorite,
		SortOrder:     req.SortOrder,
	})
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, entry)
}

func (h *EntriesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	vaultID := chi.URLParam(r, "vaultID")
	entryID := chi.URLParam(r, "entryID")

	if _, err := h.vaultSvc.Get(r.Context(), vaultID, userID); err != nil {
		respond.Error(w, err)
		return
	}

	if err := h.entrySvc.Delete(r.Context(), entryID, vaultID); err != nil {
		respond.Error(w, err)
		return
	}
	respond.NoContent(w)
}

func (h *EntriesHandler) History(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	vaultID := chi.URLParam(r, "vaultID")
	entryID := chi.URLParam(r, "entryID")

	if _, err := h.vaultSvc.Get(r.Context(), vaultID, userID); err != nil {
		respond.Error(w, err)
		return
	}

	versions, err := h.entrySvc.History(r.Context(), entryID, vaultID)
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, versions)
}
