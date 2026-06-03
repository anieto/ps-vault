package apierr

import "net/http"

type APIError struct {
	Status  int
	Code    string
	Message string
}

func (e *APIError) Error() string {
	return e.Message
}

func New(status int, code, message string) *APIError {
	return &APIError{Status: status, Code: code, Message: message}
}

// Common errors
var (
	ErrUnauthorized     = New(http.StatusUnauthorized, "unauthorized", "Authentication required")
	ErrForbidden        = New(http.StatusForbidden, "forbidden", "You do not have permission to perform this action")
	ErrNotFound         = New(http.StatusNotFound, "not_found", "Resource not found")
	ErrInvalidInput     = New(http.StatusBadRequest, "invalid_input", "Invalid input")
	ErrEmailTaken       = New(http.StatusConflict, "email_taken", "An account with this email already exists")
	ErrInvalidCredentials = New(http.StatusUnauthorized, "invalid_credentials", "Incorrect email or password")
	ErrEmailNotVerified = New(http.StatusForbidden, "email_not_verified", "Please verify your email address before logging in")
	ErrMFARequired      = New(http.StatusUnauthorized, "mfa_required", "Multi-factor authentication code required")
	ErrInvalidMFA       = New(http.StatusUnauthorized, "invalid_mfa", "Invalid authentication code")
	ErrAccountDisabled  = New(http.StatusForbidden, "account_disabled", "This account has been disabled")
	ErrRateLimit        = New(http.StatusTooManyRequests, "rate_limit", "Too many requests. Please try again later")
	ErrInternal         = New(http.StatusInternalServerError, "internal_error", "An unexpected error occurred")
	ErrRegistrationClosed = New(http.StatusForbidden, "registration_closed", "Registration is not open")
	ErrInvalidInvite    = New(http.StatusBadRequest, "invalid_invite", "Invalid or expired invite code")
)
