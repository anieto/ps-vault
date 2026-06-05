package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/ps-vault/ps-vault/internal/config"
)

type WellKnownHandler struct {
	cfg *config.Config
}

type assetLinksEntry struct {
	Relation []string         `json:"relation"`
	Target   assetLinksTarget `json:"target"`
}

type assetLinksTarget struct {
	Namespace              string   `json:"namespace"`
	PackageName            string   `json:"package_name"`
	SHA256CertFingerprints []string `json:"sha256_cert_fingerprints"`
}

// AssetLinks serves /.well-known/assetlinks.json for Android App Links verification.
// Configure PSVAULT_ANDROID_FINGERPRINTS with the comma-separated SHA-256 certificate
// fingerprints from `keytool -list -v -keystore your.keystore`.
func (h *WellKnownHandler) AssetLinks(w http.ResponseWriter, r *http.Request) {
	var fingerprints []string
	for _, fp := range strings.Split(h.cfg.AndroidFingerprints, ",") {
		if fp = strings.TrimSpace(fp); fp != "" {
			fingerprints = append(fingerprints, fp)
		}
	}

	entries := []assetLinksEntry{
		{
			Relation: []string{"delegate_permission/common.handle_all_urls"},
			Target: assetLinksTarget{
				Namespace:              "android_app",
				PackageName:            "dev.psvault.app",
				SHA256CertFingerprints: fingerprints,
			},
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entries)
}
