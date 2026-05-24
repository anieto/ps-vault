package handlers

import (
	"net/http"

	"github.com/ps-vault/ps-vault/internal/respond"
)

type HealthHandler struct{}

func (h *HealthHandler) Check(w http.ResponseWriter, r *http.Request) {
	respond.JSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"service": "ps-vault",
	})
}
