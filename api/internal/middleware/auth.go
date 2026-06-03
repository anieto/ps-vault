package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/ps-vault/ps-vault/internal/apierr"
	"github.com/ps-vault/ps-vault/internal/respond"
)

type contextKey string

const (
	ContextKeyUserID contextKey = "user_id"
	ContextKeyRole   contextKey = "role"
)

func Authenticate(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
				respond.Error(w, apierr.ErrUnauthorized)
				return
			}

			tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
			claims := &jwt.MapClaims{}

			token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, apierr.ErrUnauthorized
				}
				return []byte(jwtSecret), nil
			})

			if err != nil || !token.Valid {
				respond.Error(w, apierr.ErrUnauthorized)
				return
			}

			userID, ok := (*claims)["sub"].(string)
			if !ok || userID == "" {
				respond.Error(w, apierr.ErrUnauthorized)
				return
			}

			role, _ := (*claims)["role"].(string)

			ctx := context.WithValue(r.Context(), ContextKeyUserID, userID)
			ctx = context.WithValue(ctx, ContextKeyRole, role)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		role, _ := r.Context().Value(ContextKeyRole).(string)
		if role != "admin" {
			respond.Error(w, apierr.ErrForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func UserIDFromContext(ctx context.Context) string {
	id, _ := ctx.Value(ContextKeyUserID).(string)
	return id
}

func RoleFromContext(ctx context.Context) string {
	role, _ := ctx.Value(ContextKeyRole).(string)
	return role
}
