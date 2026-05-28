package router

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/go-chi/httprate"
	"github.com/ps-vault/ps-vault/internal/config"
	"github.com/ps-vault/ps-vault/internal/handlers"
	"github.com/ps-vault/ps-vault/internal/middleware"
)

func New(cfg *config.Config, h *handlers.Handlers) http.Handler {
	r := chi.NewRouter()

	// Base middleware
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Timeout(5 * time.Minute))

	// CORS
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{cfg.BaseURL},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Request-ID", "X-Client"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Security headers
	r.Use(securityHeaders)

	// Health check (no auth)
	r.Get("/health", h.Health.Check)
	// Public branding (no auth — needed before login)
	r.Get("/api/v1/branding", h.Admin.GetBranding)

	// API v1
	r.Route("/api/v1", func(r chi.Router) {
		// Auth endpoints — rate limited
		r.Group(func(r chi.Router) {
			r.Use(httprate.LimitByIP(20, time.Minute))
			r.Post("/auth/register", h.Auth.Register)
			r.Post("/auth/login", h.Auth.Login)
			r.Post("/auth/refresh", h.Auth.Refresh)
			r.Get("/auth/verify-email", h.Auth.VerifyEmail)
			r.Post("/auth/forgot-password", h.Auth.ForgotPassword)
			r.Post("/auth/reset-password", h.Auth.ResetPassword)
			r.Post("/auth/resend-verification", h.Auth.ResendVerification)
		r.Get("/auth/confirm-email-change", h.Auth.ConfirmEmailChange)
			// Account recovery via BIP39 recovery key (ZK-preserving)
			r.Post("/auth/recover/start", h.Auth.RecoverStart)
			r.Get("/auth/recover/validate", h.Auth.RecoverValidate)
			r.Post("/auth/recover/complete", h.Auth.RecoverComplete)
		})

		// Authenticated endpoints
		r.Group(func(r chi.Router) {
			r.Use(middleware.Authenticate(cfg.JWTSecret))
			r.Use(httprate.LimitByIP(100, time.Minute))

			// Auth (authenticated actions)
			r.Post("/auth/logout", h.Auth.Logout)
			r.Post("/auth/mfa/setup", h.Auth.MFASetup)
			r.Post("/auth/mfa/verify", h.Auth.MFAVerify)
			r.Post("/auth/mfa/disable", h.Auth.MFADisable)
			r.Post("/auth/recovery-key", h.Auth.SetRecoveryKey)

			// Users
			r.Get("/users/me", h.Users.Me)
			r.Patch("/users/me", h.Users.Update)
			r.Post("/users/me/change-password", h.Users.ChangePassword)
			r.Post("/users/me/change-email", h.Users.ChangeEmail)
			r.Delete("/users/me", h.Users.Delete)
			r.Get("/users/me/sessions", h.Users.ListSessions)
			r.Delete("/users/me/sessions", h.Users.RevokeAllSessions)
			r.Delete("/users/me/sessions/{sessionID}", h.Users.RevokeSession)
			r.Post("/users/me/export", h.Users.Export)

			// Push tokens (mobile)
			r.Post("/users/me/push-token", h.Push.Register)
			r.Delete("/users/me/push-token", h.Push.Delete)

			// Switch
			r.Get("/switch", h.Switch.Get)
			r.Patch("/switch", h.Switch.Update)
			r.Post("/switch/checkin", h.Switch.CheckIn)
			r.Post("/switch/pause", h.Switch.Pause)
			r.Post("/switch/resume", h.Switch.Resume)
			r.Post("/switch/abort", h.Switch.Abort)
			r.Post("/switch/revoke-deliveries", h.Switch.RevokeDeliveries)
			r.Get("/switch/history", h.Switch.History)
			r.Post("/switch/test", h.Switch.Test)

			// Vaults
			r.Get("/vaults", h.Vaults.List)
			r.Post("/vaults", h.Vaults.Create)
			r.Get("/vaults/{vaultID}", h.Vaults.Get)
			r.Patch("/vaults/{vaultID}", h.Vaults.Update)
			r.Delete("/vaults/{vaultID}", h.Vaults.Delete)
			r.Post("/vaults/{vaultID}/export", h.Vaults.Export)
			r.Get("/vaults/{vaultID}/preview", h.Vaults.Preview)

			// Vault entries
			r.Get("/vaults/{vaultID}/entries", h.Entries.List)
			r.Post("/vaults/{vaultID}/entries", h.Entries.Create)
			r.Get("/vaults/{vaultID}/entries/{entryID}", h.Entries.Get)
			r.Patch("/vaults/{vaultID}/entries/{entryID}", h.Entries.Update)
			r.Delete("/vaults/{vaultID}/entries/{entryID}", h.Entries.Delete)
			r.Get("/vaults/{vaultID}/entries/{entryID}/history", h.Entries.History)

			// Files
			r.Post("/files", h.Files.Upload)
			r.Get("/files/{token}", h.Files.Download)
			r.Delete("/files/{token}", h.Files.Delete)

			// Beneficiaries
			r.Get("/beneficiaries", h.Beneficiaries.List)
			r.Post("/beneficiaries", h.Beneficiaries.Create)
			r.Get("/beneficiaries/{beneficiaryID}", h.Beneficiaries.Get)
			r.Patch("/beneficiaries/{beneficiaryID}", h.Beneficiaries.Update)
			r.Delete("/beneficiaries/{beneficiaryID}", h.Beneficiaries.Delete)
			r.Post("/beneficiaries/{beneficiaryID}/resend", h.Beneficiaries.ResendConfirmation)

			// Vault beneficiary assignments
			r.Get("/vaults/{vaultID}/beneficiaries", h.Beneficiaries.ListVaultBeneficiaries)
			r.Post("/vaults/{vaultID}/beneficiaries", h.Beneficiaries.AssignVaultBeneficiary)
			r.Delete("/vaults/{vaultID}/beneficiaries/{beneficiaryID}", h.Beneficiaries.RemoveVaultBeneficiary)

			// Trusted contacts
			r.Get("/trusted-contacts", h.TrustedContacts.List)
			r.Post("/trusted-contacts", h.TrustedContacts.Create)
			r.Patch("/trusted-contacts/{contactID}", h.TrustedContacts.Update)
			r.Delete("/trusted-contacts/{contactID}", h.TrustedContacts.Delete)

			// Admin
			r.Group(func(r chi.Router) {
				r.Use(middleware.RequireAdmin)
				r.Get("/admin/dashboard", h.Admin.Dashboard)
				r.Get("/admin/users", h.Admin.ListUsers)
				r.Patch("/admin/users/{userID}", h.Admin.UpdateUser)
				r.Delete("/admin/users/{userID}", h.Admin.DeleteUser)
				r.Post("/admin/users/{userID}/disable", h.Admin.DisableUser)
				r.Post("/admin/users/{userID}/enable", h.Admin.EnableUser)
				r.Post("/admin/users/{userID}/logout", h.Admin.ForceLogoutUser)
				r.Get("/admin/audit-log", h.Admin.AuditLog)
				r.Get("/admin/audit-log/export", h.Admin.AuditLogExport)
				r.Get("/admin/config", h.Admin.GetConfig)
				r.Patch("/admin/config", h.Admin.UpdateConfig)
				r.Post("/admin/config/test-smtp", h.Admin.TestSMTP)
				r.Post("/admin/config/test-storage", h.Admin.TestStorage)
				r.Get("/admin/email-queue", h.Admin.EmailQueue)
				r.Post("/admin/email-queue/{emailID}/retry", h.Admin.RetryEmail)
				r.Get("/admin/invites", h.Admin.ListInvites)
				r.Post("/admin/invites", h.Admin.CreateInvite)
				r.Delete("/admin/invites/{inviteID}", h.Admin.DeleteInvite)
				r.Post("/admin/invites/{inviteID}/send", h.Admin.SendInviteEmail)
			})
		})

		// Beneficiary portal — token-based, no JWT auth
		r.Group(func(r chi.Router) {
			r.Use(httprate.LimitByIP(30, time.Minute))
			r.Post("/portal/verify", h.Portal.Verify)
			r.Get("/portal/vault", h.Portal.GetVault)
			r.Get("/portal/entries", h.Portal.GetEntries)
			r.Get("/portal/files/{token}", h.Portal.DownloadFile)
		})

		// Email check-in — public, token-based
		r.Group(func(r chi.Router) {
			r.Use(httprate.LimitByIP(30, time.Minute))
			r.Get("/switch/checkin/email", h.Switch.CheckInByEmailToken)
		})

		// Death report — public, token-based
		r.Group(func(r chi.Router) {
			r.Use(httprate.LimitByIP(10, time.Minute))
			r.Post("/report/initiate", h.DeathReport.Initiate)
			r.Post("/report/submit", h.DeathReport.Submit)
		})
	})

	return r
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		next.ServeHTTP(w, r)
	})
}
