package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/ps-vault/ps-vault/internal/apierr"
	"github.com/ps-vault/ps-vault/internal/config"
	"github.com/ps-vault/ps-vault/internal/middleware"
	"github.com/ps-vault/ps-vault/internal/respond"
	"github.com/ps-vault/ps-vault/internal/services"
)

type AuthHandler struct {
	cfg *config.Config
	svc *services.AuthService
}

type registerRequest struct {
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	Password    string `json:"password"`
	InviteCode  string `json:"invite_code"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	MFACode  string `json:"mfa_code"`
}

type authResponse struct {
	AccessToken string      `json:"access_token"`
	User        interface{} `json:"user"`
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}

	if req.Email == "" || req.Password == "" || req.DisplayName == "" {
		respond.Error(w, apierr.New(http.StatusBadRequest, "missing_fields",
			"Email, display name, and password are required"))
		return
	}
	if len(req.Password) < 12 {
		respond.Error(w, apierr.New(http.StatusBadRequest, "weak_password",
			"Password must be at least 12 characters"))
		return
	}

	pair, err := h.svc.Register(r.Context(), services.RegisterInput{
		Email:       req.Email,
		DisplayName: req.DisplayName,
		Password:    req.Password,
		InviteCode:  req.InviteCode,
		IPAddress:   r.RemoteAddr,
		UserAgent:   r.UserAgent(),
	})
	if err != nil {
		log.Printf("register error (type=%T): %+v", err, err)
		respond.Error(w, err)
		return
	}

	h.setRefreshCookie(w, pair.RefreshToken)
	respond.JSON(w, http.StatusCreated, authResponse{
		AccessToken: pair.AccessToken,
		User:        safeUser(pair.User),
	})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}

	pair, mfaRequired, err := h.svc.Login(r.Context(), services.LoginInput{
		Email:     req.Email,
		Password:  req.Password,
		MFACode:   req.MFACode,
		IPAddress: r.RemoteAddr,
		UserAgent: r.UserAgent(),
	})
	if err != nil {
		if mfaRequired {
			respond.Error(w, apierr.ErrMFARequired)
			return
		}
		respond.Error(w, err)
		return
	}

	h.setRefreshCookie(w, pair.RefreshToken)
	respond.JSON(w, http.StatusOK, authResponse{
		AccessToken: pair.AccessToken,
		User:        safeUser(pair.User),
	})
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie("refresh_token"); err == nil {
		h.svc.Logout(r.Context(), sha256hex(cookie.Value))
	}
	h.clearRefreshCookie(w)
	respond.NoContent(w)
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("refresh_token")
	if err != nil {
		respond.Error(w, apierr.ErrUnauthorized)
		return
	}

	pair, err := h.svc.Refresh(r.Context(), cookie.Value, r.RemoteAddr, r.UserAgent())
	if err != nil {
		h.clearRefreshCookie(w)
		respond.Error(w, err)
		return
	}

	h.setRefreshCookie(w, pair.RefreshToken)
	respond.JSON(w, http.StatusOK, authResponse{
		AccessToken: pair.AccessToken,
		User:        safeUser(pair.User),
	})
}

func (h *AuthHandler) VerifyEmail(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		respond.Error(w, apierr.New(http.StatusBadRequest, "missing_token", "Verification token is required"))
		return
	}

	if err := h.svc.VerifyEmail(r.Context(), token); err != nil {
		respond.Error(w, err)
		return
	}

	http.Redirect(w, r, h.cfg.BaseURL+"/login?verified=true", http.StatusFound)
}

func (h *AuthHandler) ResendVerification(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}
	// Always return 200 to prevent enumeration
	h.svc.ResendVerification(r.Context(), req.Email)
	respond.JSON(w, http.StatusOK, map[string]string{
		"message": "If that email is registered and unverified, a new link has been sent.",
	})
}

func (h *AuthHandler) MFASetup(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	result, err := h.svc.SetupMFA(r.Context(), userID)
	if err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, result)
}

func (h *AuthHandler) MFAVerify(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Secret      string   `json:"secret"`
		Code        string   `json:"code"`
		BackupCodes []string `json:"backup_codes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}

	userID := middleware.UserIDFromContext(r.Context())
	if err := h.svc.EnableMFA(r.Context(), userID, req.Secret, req.Code, req.BackupCodes); err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, map[string]bool{"enabled": true})
}

func (h *AuthHandler) MFADisable(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}

	userID := middleware.UserIDFromContext(r.Context())
	if err := h.svc.DisableMFA(r.Context(), userID, req.Code); err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, map[string]bool{"disabled": true})
}

func (h *AuthHandler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Email == "" {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}

	// Always return 200 to prevent email enumeration
	h.svc.ForgotPassword(r.Context(), req.Email)
	respond.JSON(w, http.StatusOK, map[string]string{
		"message": "If an account exists with that email, you will receive a reset link shortly.",
	})
}

func (h *AuthHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}
	if req.Token == "" || req.Password == "" {
		respond.Error(w, apierr.New(http.StatusBadRequest, "missing_fields", "Token and password are required"))
		return
	}
	if len(req.Password) < 12 {
		respond.Error(w, apierr.New(http.StatusBadRequest, "weak_password", "Password must be at least 12 characters"))
		return
	}

	if err := h.svc.ResetPassword(r.Context(), req.Token, req.Password); err != nil {
		respond.Error(w, err)
		return
	}
	respond.JSON(w, http.StatusOK, map[string]bool{"reset": true})
}

func (h *AuthHandler) setRefreshCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    token,
		Path:     "/api/v1/auth",
		HttpOnly: true,
		Secure:   h.cfg.Env == "production",
		SameSite: http.SameSiteStrictMode,
		MaxAge:   int((7 * 24 * time.Hour).Seconds()),
	})
}

func (h *AuthHandler) clearRefreshCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    "",
		Path:     "/api/v1/auth",
		HttpOnly: true,
		MaxAge:   -1,
	})
}

func sha256hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}
