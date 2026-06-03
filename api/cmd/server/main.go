package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"github.com/ps-vault/ps-vault/internal/config"
	"github.com/ps-vault/ps-vault/internal/database"
	"github.com/ps-vault/ps-vault/internal/handlers"
	"github.com/ps-vault/ps-vault/internal/repository"
	"github.com/ps-vault/ps-vault/internal/router"
	"github.com/ps-vault/ps-vault/internal/services"
)

func main() {
	// Load .env in development
	_ = godotenv.Load()

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("loading config: %v", err)
	}

	db, err := database.Connect(cfg)
	if err != nil {
		log.Fatalf("connecting to database: %v", err)
	}
	defer db.Close()

	log.Println("running database migrations...")
	if err := database.Migrate(db, cfg.DBType); err != nil {
		log.Fatalf("running migrations: %v", err)
	}
	log.Println("migrations complete")

	// Ensure storage directory exists
	if cfg.StorageBackend == "local" {
		if err := os.MkdirAll(cfg.StorageLocalPath, 0750); err != nil {
			log.Fatalf("creating storage directory: %v", err)
		}
	}

	// Wire up layers
	repos := repository.New(db)
	svcs := services.New(cfg, repos)

	// Seed env-var-backed config so deployment settings win over migration defaults
	svcs.Admin.SeedDefaults(context.Background())

	h := handlers.New(cfg, svcs)

	// Start background switch checker
	go svcs.Switch.RunChecker(context.Background())

	// Start cascade tier scheduler
	go svcs.Cascade.RunCascadeChecker(context.Background())

	// Build HTTP server
	addr := fmt.Sprintf(":%s", cfg.Port)
	srv := &http.Server{
		Addr:         addr,
		Handler:      router.New(cfg, h),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server
	serverErr := make(chan error, 1)
	go func() {
		log.Printf("P.S. Vault API listening on %s", addr)
		serverErr <- srv.ListenAndServe()
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-serverErr:
		log.Fatalf("server error: %v", err)
	case sig := <-quit:
		log.Printf("received signal %s, shutting down...", sig)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("graceful shutdown failed: %v", err)
	}

	log.Println("server stopped")
}
