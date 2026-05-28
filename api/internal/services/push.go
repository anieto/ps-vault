package services

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"

	"github.com/ps-vault/ps-vault/internal/models"
	"github.com/ps-vault/ps-vault/internal/repository"
)

const expoPushURL = "https://exp.host/--/expo-push/send"

type PushService struct {
	repos *repository.Repos
}

type pushMessage struct {
	To    string         `json:"to"`
	Title string         `json:"title"`
	Body  string         `json:"body"`
	Data  map[string]any `json:"data,omitempty"`
}

// RegisterToken saves an Expo push token for a user.
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

// SendToUser looks up all push tokens for the user and sends a notification to each.
func (s *PushService) SendToUser(ctx context.Context, userID, title, body string, data map[string]any) {
	tokens, err := s.repos.PushTokens.GetByUserID(ctx, userID)
	if err != nil || len(tokens) == 0 {
		return
	}

	messages := make([]pushMessage, 0, len(tokens))
	for _, t := range tokens {
		messages = append(messages, pushMessage{
			To:    t.Token,
			Title: title,
			Body:  body,
			Data:  data,
		})
	}

	payload, err := json.Marshal(messages)
	if err != nil {
		log.Printf("push: marshal error: %v", err)
		return
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, expoPushURL, bytes.NewReader(payload))
	if err != nil {
		log.Printf("push: request error: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Accept-Encoding", "gzip, deflate")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("push: send error for user %s: %v", userID, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		log.Printf("push: expo responded %d for user %s", resp.StatusCode, userID)
	}
}
