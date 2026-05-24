package handlers

import "github.com/ps-vault/ps-vault/internal/models"

// safeUser returns a user map safe to expose to the client (no password hashes, etc.)
func safeUser(u *models.User) map[string]interface{} {
	if u == nil {
		return nil
	}
	return map[string]interface{}{
		"id":             u.ID,
		"email":          u.Email,
		"display_name":   u.DisplayName,
		"role":           u.Role,
		"email_verified": u.EmailVerified,
		"mfa_enabled":    u.MFAEnabled,
		"timezone":       u.Timezone,
		"created_at":     u.CreatedAt,
	}
}
