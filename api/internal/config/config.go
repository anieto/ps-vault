package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	Env  string
	Port string

	BaseURL           string
	AppName           string
	JWTSecret         string
	EncryptionPepper  string

	DBType string
	DBURL  string
	SQLitePath string

	StorageBackend    string
	StorageLocalPath  string
	MaxFileSizeMB     int64
	S3Endpoint        string
	S3Bucket          string
	S3Region          string
	S3AccessKey       string
	S3SecretKey       string

	SMTPHost     string
	SMTPPort     int
	SMTPUser     string
	SMTPPass     string
	SMTPTLS      string
	SMTPFrom     string
	SMTPFromName string

	SMSProvider      string
	TwilioAccountSID string
	TwilioAuthToken  string
	TwilioFromNumber string

	ServerHealthEmail string
	ServerHealthAlertHours int

	RegistrationMode string
	AdminEmail       string

	PUID int
	PGID int
}

func Load() (*Config, error) {
	cfg := &Config{
		Env:              getEnv("PSVAULT_ENV", "production"),
		Port:             getEnv("PSVAULT_API_PORT", "8080"),
		BaseURL:          getEnv("PSVAULT_BASE_URL", "http://localhost:3000"),
		AppName:          getEnv("PSVAULT_APP_NAME", "P.S. Vault"),
		JWTSecret:        getEnv("PSVAULT_JWT_SECRET", ""),
		EncryptionPepper: getEnv("PSVAULT_ENCRYPTION_PEPPER", ""),

		DBType:     getEnv("PSVAULT_DB_TYPE", "postgres"),
		DBURL:      getEnv("PSVAULT_DB_URL", ""),
		SQLitePath: getEnv("PSVAULT_SQLITE_PATH", "/config/psvault.db"),

		StorageBackend:   getEnv("PSVAULT_STORAGE_BACKEND", "local"),
		StorageLocalPath: getEnv("PSVAULT_STORAGE_LOCAL_PATH", "/data/files"),
		MaxFileSizeMB:    getEnvInt64("PSVAULT_MAX_FILE_SIZE_MB", 100),
		S3Endpoint:       getEnv("PSVAULT_S3_ENDPOINT", ""),
		S3Bucket:         getEnv("PSVAULT_S3_BUCKET", ""),
		S3Region:         getEnv("PSVAULT_S3_REGION", ""),
		S3AccessKey:      getEnv("PSVAULT_S3_ACCESS_KEY", ""),
		S3SecretKey:      getEnv("PSVAULT_S3_SECRET_KEY", ""),

		SMTPHost:     getEnv("PSVAULT_SMTP_HOST", ""),
		SMTPPort:     getEnvInt("PSVAULT_SMTP_PORT", 587),
		SMTPUser:     getEnv("PSVAULT_SMTP_USER", ""),
		SMTPPass:     getEnv("PSVAULT_SMTP_PASS", ""),
		SMTPTLS:      getEnv("PSVAULT_SMTP_TLS", "starttls"),
		SMTPFrom:     getEnv("PSVAULT_SMTP_FROM", ""),
		SMTPFromName: getEnv("PSVAULT_SMTP_FROM_NAME", "P.S. Vault"),

		SMSProvider:      getEnv("PSVAULT_SMS_PROVIDER", ""),
		TwilioAccountSID: getEnv("PSVAULT_TWILIO_ACCOUNT_SID", ""),
		TwilioAuthToken:  getEnv("PSVAULT_TWILIO_AUTH_TOKEN", ""),
		TwilioFromNumber: getEnv("PSVAULT_TWILIO_FROM_NUMBER", ""),

		ServerHealthEmail:      getEnv("PSVAULT_SERVER_HEALTH_EMAIL", ""),
		ServerHealthAlertHours: getEnvInt("PSVAULT_SERVER_HEALTH_ALERT_HOURS", 4),

		RegistrationMode: getEnv("PSVAULT_REGISTRATION_MODE", "invite"),
		AdminEmail:       getEnv("PSVAULT_ADMIN_EMAIL", ""),

		PUID: getEnvInt("PUID", 99),
		PGID: getEnvInt("PGID", 100),
	}

	if err := cfg.validate(); err != nil {
		return nil, err
	}

	return cfg, nil
}

func (c *Config) validate() error {
	if c.JWTSecret == "" {
		return fmt.Errorf("PSVAULT_JWT_SECRET is required")
	}
	if c.EncryptionPepper == "" {
		return fmt.Errorf("PSVAULT_ENCRYPTION_PEPPER is required")
	}
	if c.SMTPHost == "" {
		return fmt.Errorf("PSVAULT_SMTP_HOST is required")
	}
	if c.SMTPFrom == "" {
		return fmt.Errorf("PSVAULT_SMTP_FROM is required")
	}
	if c.DBType == "postgres" && c.DBURL == "" {
		return fmt.Errorf("PSVAULT_DB_URL is required when PSVAULT_DB_TYPE=postgres")
	}
	return nil
}

func (c *Config) IsDevelopment() bool {
	return c.Env == "development"
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}

func getEnvInt64(key string, fallback int64) int64 {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.ParseInt(v, 10, 64); err == nil {
			return i
		}
	}
	return fallback
}
