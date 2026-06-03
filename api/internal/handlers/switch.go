package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/ps-vault/ps-vault/internal/apierr"
	"github.com/ps-vault/ps-vault/internal/middleware"
	"github.com/ps-vault/ps-vault/internal/respond"
	"github.com/ps-vault/ps-vault/internal/services"
)

type SwitchHandler struct {
	svc *services.SwitchService
}

func (h *SwitchHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	sw, err := h.svc.Get(r.Context(), userID)
	if err != nil {
		respond.Error(w, apierr.ErrInternal)
		return
	}
	respond.JSON(w, http.StatusOK, sw)
}

func (h *SwitchHandler) Update(w http.ResponseWriter, r *http.Request) {
	var req struct {
		CheckInIntervalDays      *int    `json:"check_in_interval_days"`
		Reminder1DaysBefore      *int    `json:"reminder1_days_before"`
		Reminder2HoursBefore     *int    `json:"reminder2_hours_before"`
		FinalWarningHoursBefore  *int    `json:"final_warning_hours_before"`
		AbortWindowHours         *int    `json:"abort_window_hours"`
		DeathReportResponseHours *int    `json:"death_report_response_hours"`
		MaxPauseDays             *int    `json:"max_pause_days"`
		IsActive                 *bool   `json:"is_active"`
		PreferredCheckinHour     *int    `json:"preferred_checkin_hour"`
		ClearPreferredHour       *bool   `json:"clear_preferred_hour"`
		Timezone                 *string `json:"timezone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}

	userID := middleware.UserIDFromContext(r.Context())
	sw, err := h.svc.Update(r.Context(), userID, services.UpdateSwitchInput{
		CheckInIntervalDays:      req.CheckInIntervalDays,
		Reminder1DaysBefore:      req.Reminder1DaysBefore,
		Reminder2HoursBefore:     req.Reminder2HoursBefore,
		FinalWarningHoursBefore:  req.FinalWarningHoursBefore,
		AbortWindowHours:         req.AbortWindowHours,
		DeathReportResponseHours: req.DeathReportResponseHours,
		MaxPauseDays:             req.MaxPauseDays,
		IsActive:                 req.IsActive,
		PreferredCheckinHour:     req.PreferredCheckinHour,
		ClearPreferredHour:       req.ClearPreferredHour != nil && *req.ClearPreferredHour,
		Timezone:                 req.Timezone,
	})
	if err != nil {
		respond.Error(w, apierr.ErrInternal)
		return
	}
	respond.JSON(w, http.StatusOK, sw)
}

func (h *SwitchHandler) CheckIn(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	sw, err := h.svc.CheckIn(r.Context(), userID, "web", r.RemoteAddr)
	if err != nil {
		respond.Error(w, apierr.ErrInternal)
		return
	}
	respond.JSON(w, http.StatusOK, sw)
}

func (h *SwitchHandler) Pause(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ResumeAt string `json:"resume_at"`
		Reason   string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respond.Error(w, apierr.ErrInvalidInput)
		return
	}

	resumeAt, err := time.Parse(time.RFC3339, req.ResumeAt)
	if err != nil {
		respond.Error(w, apierr.New(http.StatusBadRequest, "invalid_date",
			"resume_at must be a valid RFC3339 date"))
		return
	}

	userID := middleware.UserIDFromContext(r.Context())
	sw, err := h.svc.Pause(r.Context(), userID, resumeAt, req.Reason)
	if err != nil {
		respond.Error(w, apierr.ErrInternal)
		return
	}
	respond.JSON(w, http.StatusOK, sw)
}

func (h *SwitchHandler) Resume(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	sw, err := h.svc.Resume(r.Context(), userID)
	if err != nil {
		respond.Error(w, apierr.ErrInternal)
		return
	}
	respond.JSON(w, http.StatusOK, sw)
}

func (h *SwitchHandler) Abort(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	sw, err := h.svc.Abort(r.Context(), userID)
	if err != nil {
		respond.Error(w, apierr.ErrInternal)
		return
	}
	respond.JSON(w, http.StatusOK, sw)
}

func (h *SwitchHandler) AbortByToken(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" {
		respond.Error(w, apierr.New(http.StatusBadRequest, "missing_token", "Token is required"))
		return
	}
	if err := h.svc.AbortByToken(r.Context(), req.Token); err != nil {
		respond.Error(w, apierr.New(http.StatusBadRequest, "abort_failed", err.Error()))
		return
	}
	respond.JSON(w, http.StatusOK, map[string]string{"status": "aborted"})
}

func (h *SwitchHandler) RevokeDeliveries(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	n, err := h.svc.RevokeDeliveries(r.Context(), userID)
	if err != nil {
		respond.Error(w, apierr.ErrInternal)
		return
	}
	respond.JSON(w, http.StatusOK, map[string]interface{}{"revoked": n})
}

func (h *SwitchHandler) History(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	checkins, err := h.svc.History(r.Context(), userID)
	if err != nil {
		respond.Error(w, apierr.ErrInternal)
		return
	}
	respond.JSON(w, http.StatusOK, checkins)
}

func (h *SwitchHandler) Test(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	if err := h.svc.RunTest(r.Context(), userID); err != nil {
		respond.Error(w, apierr.ErrInternal)
		return
	}
	respond.JSON(w, http.StatusOK, map[string]string{
		"status": "test_sent",
		"note":   "Test emails have been sent to your address only. No beneficiaries were notified.",
	})
}

// CheckInByEmailToken handles single-use email check-in links (public, no auth required).
func (h *SwitchHandler) CheckInByEmailToken(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		respond.Error(w, apierr.New(http.StatusBadRequest, "missing_token", "Check-in token is required"))
		return
	}

	if err := h.svc.CheckInByEmailToken(r.Context(), token, r.RemoteAddr); err != nil {
		respond.Error(w, apierr.New(http.StatusBadRequest, "invalid_token", "This check-in link is invalid or has already been used"))
		return
	}

	respond.JSON(w, http.StatusOK, map[string]string{"status": "checked_in"})
}
