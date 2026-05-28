package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/ps-vault/ps-vault/internal/apierr"
	"github.com/ps-vault/ps-vault/internal/middleware"
	"github.com/ps-vault/ps-vault/internal/respond"
	"github.com/ps-vault/ps-vault/internal/services"
)

type PushHandler struct {
	svc *services.PushService
}

func (h *PushHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token    string `json:"token"`
		Platform string `json:"platform"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}
	if req.Token == "" {
		respond.Error(w, apierr.New(http.StatusBadRequest, "missing_fields", "token is required"))
		return
	}
	if req.Platform != "ios" && req.Platform != "android" {
		respond.Error(w, apierr.New(http.StatusBadRequest, "invalid_platform", "platform must be ios or android"))
		return
	}

	userID := middleware.UserIDFromContext(r.Context())
	if err := h.svc.RegisterToken(r.Context(), userID, req.Token, req.Platform); err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusCreated, map[string]bool{"registered": true})
}

func (h *PushHandler) Delete(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}

	userID := middleware.UserIDFromContext(r.Context())
	if err := h.svc.DeleteToken(r.Context(), userID, req.Token); err != nil {
		respond.Error(w, err)
		return
	}
	respond.NoContent(w)
}
