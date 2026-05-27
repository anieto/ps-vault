package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/ps-vault/ps-vault/internal/apierr"
	"github.com/ps-vault/ps-vault/internal/middleware"
	"github.com/ps-vault/ps-vault/internal/respond"
	"github.com/ps-vault/ps-vault/internal/services"
)


// AdminHandler handles admin-only operations.
type AdminHandler struct {
	svc *services.AdminService
}

func (h *AdminHandler) Dashboard(w http.ResponseWriter, r *http.Request) {
	stats, err := h.svc.GetDashboard(r.Context())
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, stats)
}

func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	limit := queryInt(r, "limit", 50)
	offset := queryInt(r, "offset", 0)

	users, total, err := h.svc.ListUsers(r.Context(), limit, offset)
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, map[string]interface{}{
		"users": users,
		"total": total,
	})
}

func (h *AdminHandler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	respond.JSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (h *AdminHandler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")
	if err := h.svc.DeleteUser(r.Context(), userID); err != nil {
		respond.Error(w, err)
		return
	}
	respond.NoContent(w)
}

func (h *AdminHandler) DisableUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")
	if err := h.svc.SetUserActive(r.Context(), userID, false); err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, map[string]bool{"active": false})
}

func (h *AdminHandler) EnableUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")
	if err := h.svc.SetUserActive(r.Context(), userID, true); err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, map[string]bool{"active": true})
}

func (h *AdminHandler) ForceLogoutUser(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")
	if err := h.svc.ForceLogoutUser(r.Context(), userID); err != nil {
		respond.Error(w, err)
		return
	}
	respond.NoContent(w)
}

func (h *AdminHandler) AuditLog(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	eventType := r.URL.Query().Get("event_type")
	limit := queryInt(r, "limit", 50)
	offset := queryInt(r, "offset", 0)

	entries, total, err := h.svc.ListAuditLog(r.Context(), userID, eventType, limit, offset)
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, map[string]interface{}{
		"entries": entries,
		"total":   total,
	})
}

func (h *AdminHandler) GetConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.svc.GetConfig(r.Context())
	if err != nil {
		respond.Error(w, apierr.ErrInternal)
		return
	}
	respond.JSON(w, http.StatusOK, cfg)
}

func (h *AdminHandler) UpdateConfig(w http.ResponseWriter, r *http.Request) {
	var req map[string]string
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}
	for key, value := range req {
		if err := h.svc.SetConfig(r.Context(), key, value); err != nil {
			respond.Error(w, err)
			return
		}
	}
	cfg, err := h.svc.GetConfig(r.Context())
	if err != nil {
		respond.Error(w, apierr.ErrInternal)
		return
	}
	respond.JSON(w, http.StatusOK, cfg)
}

func (h *AdminHandler) TestSMTP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" {
		respond.Error(w, apierr.New(http.StatusBadRequest, "missing_email", "email is required"))
		return
	}
	if err := h.svc.TestSMTP(r.Context(), req.Email); err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, map[string]string{"status": "sent"})
}

func (h *AdminHandler) TestStorage(w http.ResponseWriter, r *http.Request) {
	if err := h.svc.TestStorage(r.Context()); err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *AdminHandler) EmailQueue(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	limit := queryInt(r, "limit", 50)
	offset := queryInt(r, "offset", 0)

	entries, total, err := h.svc.ListEmailQueue(r.Context(), status, limit, offset)
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, map[string]interface{}{
		"entries": entries,
		"total":   total,
	})
}

func (h *AdminHandler) RetryEmail(w http.ResponseWriter, r *http.Request) {
	emailID := chi.URLParam(r, "emailID")
	if err := h.svc.RetryEmail(r.Context(), emailID); err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, map[string]string{"status": "queued"})
}

func (h *AdminHandler) ListInvites(w http.ResponseWriter, r *http.Request) {
	codes, err := h.svc.ListInvites(r.Context())
	if err != nil {
		respond.Error(w, apierr.ErrInternal)
		return
	}
	respond.JSON(w, http.StatusOK, codes)
}

func (h *AdminHandler) CreateInvite(w http.ResponseWriter, r *http.Request) {
	createdBy := middleware.UserIDFromContext(r.Context())
	code, err := h.svc.CreateInvite(r.Context(), createdBy)
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusCreated, code)
}

func (h *AdminHandler) GetBranding(w http.ResponseWriter, r *http.Request) {
	cfg, err := h.svc.GetConfig(r.Context())
	if err != nil {
		respond.Error(w, apierr.ErrInternal)
		return
	}
	respond.JSON(w, http.StatusOK, map[string]string{
		"app_name":     cfg["app_name_override"],
		"accent_color": cfg["app_accent_color"],
	})
}

func queryInt(r *http.Request, key string, def int) int {
	v := r.URL.Query().Get(key)
	if v == "" {
		return def
	}
	i, err := strconv.Atoi(v)
	if err != nil || i < 0 {
		return def
	}
	return i
}
