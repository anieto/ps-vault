package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/ps-vault/ps-vault/internal/apierr"
	"github.com/ps-vault/ps-vault/internal/config"
	"github.com/ps-vault/ps-vault/internal/middleware"
	"github.com/ps-vault/ps-vault/internal/respond"
	"github.com/ps-vault/ps-vault/internal/services"
)

type PasskeysHandler struct {
	cfg     *config.Config
	waSvc   *services.WebAuthnService
	authSvc *services.AuthService
}

// BeginRegistration starts the passkey registration ceremony (authenticated).
func (h *PasskeysHandler) BeginRegistration(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	user, err := h.authSvc.GetMe(r.Context(), userID)
	if err != nil {
		respond.Error(w, err)
		return
	}

	challengeID, creation, err := h.waSvc.BeginRegistration(r.Context(), user)
	if err != nil {
		respond.Error(w, apierr.New(http.StatusBadRequest, "passkey_error", err.Error()))
		return
	}

	respond.JSON(w, http.StatusOK, map[string]interface{}{
		"challenge_id":     challengeID,
		"creation_options": creation,
	})
}

// FinishRegistration completes the passkey registration ceremony (authenticated).
// challenge_id and name are passed as query params; the request body is the WebAuthn attestation.
func (h *PasskeysHandler) FinishRegistration(w http.ResponseWriter, r *http.Request) {
	challengeID := r.URL.Query().Get("challenge_id")
	if challengeID == "" {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}
	name := r.URL.Query().Get("name")
	if name == "" {
		name = "Passkey"
	}

	userID := middleware.UserIDFromContext(r.Context())
	user, err := h.authSvc.GetMe(r.Context(), userID)
	if err != nil {
		respond.Error(w, err)
		return
	}

	passkey, err := h.waSvc.FinishRegistration(r.Context(), user, challengeID, name, r)
	if err != nil {
		respond.Error(w, apierr.New(http.StatusBadRequest, "passkey_error", err.Error()))
		return
	}

	respond.JSON(w, http.StatusCreated, passkey)
}

// BeginAuthentication starts the passkey authentication ceremony (unauthenticated — password gating).
func (h *PasskeysHandler) BeginAuthentication(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" || req.Password == "" {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}

	user, err := h.authSvc.VerifyCredentials(r.Context(), req.Email, req.Password, r.RemoteAddr)
	if err != nil {
		respond.Error(w, err)
		return
	}

	if !user.MFAEnabled {
		respond.Error(w, apierr.New(http.StatusBadRequest, "passkey_error",
			"Passkey authentication requires two-factor authentication to be enabled"))
		return
	}

	challengeID, assertion, err := h.waSvc.BeginAuthentication(r.Context(), user)
	if err != nil {
		respond.Error(w, apierr.New(http.StatusBadRequest, "passkey_error", err.Error()))
		return
	}

	respond.JSON(w, http.StatusOK, map[string]interface{}{
		"challenge_id":      challengeID,
		"assertion_options": assertion,
	})
}

// FinishAuthentication completes the passkey authentication ceremony and issues tokens (unauthenticated).
func (h *PasskeysHandler) FinishAuthentication(w http.ResponseWriter, r *http.Request) {
	challengeID := r.URL.Query().Get("challenge_id")
	if challengeID == "" {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}

	userID, err := h.waSvc.GetChallengeOwner(r.Context(), challengeID)
	if err != nil {
		respond.Error(w, apierr.New(http.StatusUnauthorized, "passkey_error", err.Error()))
		return
	}

	user, err := h.authSvc.GetMe(r.Context(), userID)
	if err != nil {
		respond.Error(w, err)
		return
	}

	if err := h.waSvc.FinishAuthentication(r.Context(), user, challengeID, r); err != nil {
		respond.Error(w, apierr.New(http.StatusUnauthorized, "passkey_error", err.Error()))
		return
	}

	pair, err := h.authSvc.CompleteLogin(r.Context(), user, r.RemoteAddr, r.UserAgent())
	if err != nil {
		respond.Error(w, err)
		return
	}

	resp := authResponse{
		AccessToken:  pair.AccessToken,
		User:         safeUser(pair.User),
		MEKSalt:      pair.MEKSalt,
		MEKEnvelope:  pair.MEKEnvelope,
		Argon2Params: pair.Argon2Params,
	}
	// Passkey auth is web-only — always use cookie for refresh token
	h.setRefreshCookie(w, pair.RefreshToken)
	respond.JSON(w, http.StatusOK, resp)
}

// List returns all passkeys for the authenticated user.
func (h *PasskeysHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	passkeys, err := h.waSvc.ListPasskeys(r.Context(), userID)
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, passkeys)
}

// Rename renames a passkey.
func (h *PasskeysHandler) Rename(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "passkeyID")
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}

	userID := middleware.UserIDFromContext(r.Context())
	if err := h.waSvc.RenamePasskey(r.Context(), id, userID, req.Name); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respond.Error(w, apierr.ErrNotFound)
			return
		}
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, map[string]bool{"renamed": true})
}

// Delete deletes a passkey.
func (h *PasskeysHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "passkeyID")
	userID := middleware.UserIDFromContext(r.Context())

	if err := h.waSvc.DeletePasskey(r.Context(), id, userID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			respond.Error(w, apierr.ErrNotFound)
			return
		}
		respond.Error(w, err)
		return
	}
	respond.NoContent(w)
}

func (h *PasskeysHandler) setRefreshCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    token,
		Path:     "/api/v1/auth",
		HttpOnly: true,
		Secure:   h.cfg.Env == "production",
		SameSite: http.SameSiteStrictMode,
		MaxAge:   7 * 24 * 60 * 60,
	})
}
