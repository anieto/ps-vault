package services

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"

	"github.com/ps-vault/ps-vault/internal/config"
	"github.com/ps-vault/ps-vault/internal/models"
	"github.com/ps-vault/ps-vault/internal/repository"
)

type PushService struct {
	cfg   *config.Config
	repos *repository.Repos
}

func NewPushService(cfg *config.Config, repos *repository.Repos) *PushService {
	return &PushService{cfg: cfg, repos: repos}
}

type relayMessage struct {
	Token    string         `json:"token"`
	Platform string         `json:"platform"`
	Title    string         `json:"title"`
	Body     string         `json:"body"`
	Data     map[string]any `json:"data,omitempty"`
}

// RegisterToken saves a push token for a user.
func (s *PushService) RegisterToken(ctx context.Context, userID, token, platform string) error {
	return s.repos.PushTokens.Save(ctx, &models.PushToken{
		UserID:   userID,
		Token:    token,
		Platform: platform,
	})
}

// DeleteToken removes a specific push token for a user.
func (s *PushService) DeleteToken(ctx context.Context, userID, token string) error {
	return s.repos.PushTokens.DeleteByUserAndToken(ctx, userID, token)
}

// SendToUser looks up all push tokens for the user and sends a notification to each via the relay.
func (s *PushService) SendToUser(ctx context.Context, userID, title, body string, data map[string]any) {
	if s.cfg.PushRelayURL == "" {
		return
	}

	tokens, err := s.repos.PushTokens.GetByUserID(ctx, userID)
	if err != nil || len(tokens) == 0 {
		return
	}

	for _, t := range tokens {
		s.sendOne(ctx, userID, t, title, body, data)
	}
}

func (s *PushService) sendOne(ctx context.Context, userID string, t *models.PushToken, title, body string, data map[string]any) {
	msg := relayMessage{
		Token:    t.Token,
		Platform: t.Platform,
		Title:    title,
		Body:     body,
		Data:     data,
	}

	payload, err := json.Marshal(msg)
	if err != nil {
		log.Printf("push: marshal error: %v", err)
		return
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.cfg.PushRelayURL+"/send", bytes.NewReader(payload))
	if err != nil {
		log.Printf("push: request error: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.cfg.PushRelaySecret)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("push: relay error for user %s: %v", userID, err)
		return
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
		// success
	case http.StatusGone:
		// stale token — remove it
		if err := s.repos.PushTokens.DeleteByUserAndToken(ctx, userID, t.Token); err != nil {
			log.Printf("push: failed to delete stale token for user %s: %v", userID, err)
		}
	default:
		log.Printf("push: relay responded %d for user %s", resp.StatusCode, userID)
	}
}
