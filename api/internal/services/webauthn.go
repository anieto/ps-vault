package services

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/google/uuid"
	"github.com/ps-vault/ps-vault/internal/config"
	"github.com/ps-vault/ps-vault/internal/models"
	"github.com/ps-vault/ps-vault/internal/repository"
)

// webAuthnUser wraps a models.User to satisfy the webauthn.User interface.
type webAuthnUser struct {
	user        *models.User
	credentials []webauthn.Credential
}

func (u *webAuthnUser) WebAuthnID() []byte {
	return []byte(u.user.ID)
}

func (u *webAuthnUser) WebAuthnName() string {
	return u.user.Email
}

func (u *webAuthnUser) WebAuthnDisplayName() string {
	return u.user.DisplayName
}

func (u *webAuthnUser) WebAuthnCredentials() []webauthn.Credential {
	return u.credentials
}

// WebAuthnService handles passkey registration and authentication.
type WebAuthnService struct {
	wapi  *webauthn.WebAuthn
	repos *repository.Repos
}

func NewWebAuthnService(cfg *config.Config, repos *repository.Repos) (*WebAuthnService, error) {
	wapi, err := webauthn.New(&webauthn.Config{
		RPID:          cfg.WebAuthnRPID(),
		RPDisplayName: cfg.AppName,
		RPOrigins:     cfg.WebAuthnOrigins(),
	})
	if err != nil {
		return nil, err
	}
	return &WebAuthnService{wapi: wapi, repos: repos}, nil
}

// BeginRegistration generates a WebAuthn credential creation challenge.
// Requires the user to have TOTP enabled.
func (s *WebAuthnService) BeginRegistration(ctx context.Context, user *models.User) (string, *protocol.CredentialCreation, error) {
	if !user.MFAEnabled {
		return "", nil, errors.New("two-factor authentication must be enabled before adding a passkey")
	}

	credentials, err := s.loadCredentials(ctx, user.ID)
	if err != nil {
		return "", nil, err
	}

	waUser := &webAuthnUser{user: user, credentials: credentials}
	creation, sessionData, err := s.wapi.BeginRegistration(waUser,
		webauthn.WithExclusions(credentialDescriptors(credentials)),
	)
	if err != nil {
		return "", nil, err
	}

	sessionJSON, err := json.Marshal(sessionData)
	if err != nil {
		return "", nil, err
	}

	challengeID, err := s.repos.Passkeys.CreateChallenge(ctx, user.ID, string(sessionJSON), "registration")
	if err != nil {
		return "", nil, err
	}

	return challengeID, creation, nil
}

// FinishRegistration verifies the attestation and stores the new passkey.
func (s *WebAuthnService) FinishRegistration(ctx context.Context, user *models.User, challengeID, name string, r *http.Request) (*models.Passkey, error) {
	challenge, err := s.repos.Passkeys.GetChallenge(ctx, challengeID, user.ID, "registration")
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("challenge not found or expired")
		}
		return nil, err
	}

	var sessionData webauthn.SessionData
	if err := json.Unmarshal([]byte(challenge.SessionData), &sessionData); err != nil {
		return nil, err
	}

	credentials, err := s.loadCredentials(ctx, user.ID)
	if err != nil {
		return nil, err
	}

	waUser := &webAuthnUser{user: user, credentials: credentials}
	credential, err := s.wapi.FinishRegistration(waUser, sessionData, r)
	if err != nil {
		return nil, err
	}

	_ = s.repos.Passkeys.DeleteChallenge(ctx, challengeID)

	transportsJSON, _ := json.Marshal(credential.Transport)
	passkey := &models.Passkey{
		ID:           uuid.New().String(),
		UserID:       user.ID,
		Name:         name,
		CredentialID: base64.RawURLEncoding.EncodeToString(credential.ID),
		PublicKey:    base64.RawURLEncoding.EncodeToString(credential.PublicKey),
		AAGUID:       formatAAGUID(credential.Authenticator.AAGUID),
		SignCount:     credential.Authenticator.SignCount,
		Transports:   string(transportsJSON),
	}

	if err := s.repos.Passkeys.Create(ctx, passkey); err != nil {
		return nil, err
	}

	return passkey, nil
}

// BeginAuthentication generates a WebAuthn assertion challenge for a user's passkeys.
func (s *WebAuthnService) BeginAuthentication(ctx context.Context, user *models.User) (string, *protocol.CredentialAssertion, error) {
	credentials, err := s.loadCredentials(ctx, user.ID)
	if err != nil {
		return "", nil, err
	}
	if len(credentials) == 0 {
		return "", nil, errors.New("no passkeys registered")
	}

	waUser := &webAuthnUser{user: user, credentials: credentials}
	assertion, sessionData, err := s.wapi.BeginLogin(waUser)
	if err != nil {
		return "", nil, err
	}

	sessionJSON, err := json.Marshal(sessionData)
	if err != nil {
		return "", nil, err
	}

	challengeID, err := s.repos.Passkeys.CreateChallenge(ctx, user.ID, string(sessionJSON), "authentication")
	if err != nil {
		return "", nil, err
	}

	return challengeID, assertion, nil
}

// FinishAuthentication verifies the assertion and updates the passkey sign count.
func (s *WebAuthnService) FinishAuthentication(ctx context.Context, user *models.User, challengeID string, r *http.Request) error {
	challenge, err := s.repos.Passkeys.GetChallenge(ctx, challengeID, user.ID, "authentication")
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return errors.New("challenge not found or expired")
		}
		return err
	}

	var sessionData webauthn.SessionData
	if err := json.Unmarshal([]byte(challenge.SessionData), &sessionData); err != nil {
		return err
	}

	credentials, err := s.loadCredentials(ctx, user.ID)
	if err != nil {
		return err
	}

	waUser := &webAuthnUser{user: user, credentials: credentials}
	credential, err := s.wapi.FinishLogin(waUser, sessionData, r)
	if err != nil {
		return err
	}

	_ = s.repos.Passkeys.DeleteChallenge(ctx, challengeID)

	credID := base64.RawURLEncoding.EncodeToString(credential.ID)
	pk, err := s.repos.Passkeys.GetByCredentialID(ctx, credID)
	if err == nil {
		_ = s.repos.Passkeys.UpdateAfterAuth(ctx, pk.ID, credential.Authenticator.SignCount)
	}

	return nil
}

// loadCredentials fetches a user's passkeys and converts them to webauthn.Credential.
func (s *WebAuthnService) loadCredentials(ctx context.Context, userID string) ([]webauthn.Credential, error) {
	passkeys, err := s.repos.Passkeys.ListByUser(ctx, userID)
	if err != nil {
		return nil, err
	}

	creds := make([]webauthn.Credential, 0, len(passkeys))
	for _, pk := range passkeys {
		credID, err := base64.RawURLEncoding.DecodeString(pk.CredentialID)
		if err != nil {
			continue
		}
		pubKey, err := base64.RawURLEncoding.DecodeString(pk.PublicKey)
		if err != nil {
			continue
		}

		var transports []protocol.AuthenticatorTransport
		_ = json.Unmarshal([]byte(pk.Transports), &transports)

		creds = append(creds, webauthn.Credential{
			ID:        credID,
			PublicKey: pubKey,
			Authenticator: webauthn.Authenticator{
				SignCount: pk.SignCount,
			},
			Transport: transports,
		})
	}
	return creds, nil
}

func credentialDescriptors(creds []webauthn.Credential) []protocol.CredentialDescriptor {
	descs := make([]protocol.CredentialDescriptor, len(creds))
	for i, c := range creds {
		descs[i] = protocol.CredentialDescriptor{
			Type:            protocol.PublicKeyCredentialType,
			CredentialID:    c.ID,
			Transport:       c.Transport,
		}
	}
	return descs
}

// ListPasskeys returns all passkeys for a user (safe for API response — no credential material).
func (s *WebAuthnService) ListPasskeys(ctx context.Context, userID string) ([]models.Passkey, error) {
	return s.repos.Passkeys.ListByUser(ctx, userID)
}

// RenamePasskey renames a passkey owned by the given user.
func (s *WebAuthnService) RenamePasskey(ctx context.Context, id, userID, name string) error {
	return s.repos.Passkeys.Rename(ctx, id, userID, name)
}

// DeletePasskey deletes a passkey owned by the given user.
func (s *WebAuthnService) DeletePasskey(ctx context.Context, id, userID string) error {
	return s.repos.Passkeys.Delete(ctx, id, userID)
}

// GetChallengeOwner returns the userID associated with a challenge, for unauthenticated finish flows.
func (s *WebAuthnService) GetChallengeOwner(ctx context.Context, challengeID string) (string, error) {
	challenge, err := s.repos.Passkeys.GetChallengeByID(ctx, challengeID, "authentication")
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", errors.New("challenge not found or expired")
		}
		return "", err
	}
	return challenge.UserID, nil
}

func formatAAGUID(aaguid []byte) string {
	if len(aaguid) == 0 {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(aaguid)
}
