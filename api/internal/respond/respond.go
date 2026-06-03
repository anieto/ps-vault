package respond

import (
	"encoding/json"
	"net/http"

	"github.com/ps-vault/ps-vault/internal/apierr"
)

type envelope struct {
	Data  interface{}  `json:"data"`
	Error *errorBody   `json:"error"`
}

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func JSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(envelope{Data: data, Error: nil})
}

func Error(w http.ResponseWriter, err error) {
	var apiErr *apierr.APIError
	switch e := err.(type) {
	case *apierr.APIError:
		apiErr = e
	default:
		apiErr = apierr.ErrInternal
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(apiErr.Status)
	json.NewEncoder(w).Encode(envelope{
		Data: nil,
		Error: &errorBody{
			Code:    apiErr.Code,
			Message: apiErr.Message,
		},
	})
}

func NoContent(w http.ResponseWriter) {
	w.WriteHeader(http.StatusNoContent)
}
