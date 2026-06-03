package database

import (
	"embed"
	"fmt"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/database/sqlite3"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	_ "github.com/mattn/go-sqlite3"
	"github.com/ps-vault/ps-vault/internal/config"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

func Connect(cfg *config.Config) (*sqlx.DB, error) {
	var db *sqlx.DB
	var err error

	switch cfg.DBType {
	case "postgres":
		db, err = sqlx.Connect("postgres", cfg.DBURL)
	case "sqlite":
		db, err = sqlx.Connect("sqlite3", cfg.SQLitePath+"?_foreign_keys=on&_journal_mode=WAL")
	default:
		return nil, fmt.Errorf("unsupported database type: %s", cfg.DBType)
	}

	if err != nil {
		return nil, fmt.Errorf("connecting to database: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)

	return db, nil
}

func Migrate(db *sqlx.DB, dbType string) error {
	src, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		return fmt.Errorf("creating migration source: %w", err)
	}

	var m *migrate.Migrate

	switch dbType {
	case "postgres":
		driver, err := postgres.WithInstance(db.DB, &postgres.Config{})
		if err != nil {
			return fmt.Errorf("creating postgres migration driver: %w", err)
		}
		m, err = migrate.NewWithInstance("iofs", src, "postgres", driver)
		if err != nil {
			return fmt.Errorf("creating migrator: %w", err)
		}
	case "sqlite":
		driver, err := sqlite3.WithInstance(db.DB, &sqlite3.Config{})
		if err != nil {
			return fmt.Errorf("creating sqlite migration driver: %w", err)
		}
		m, err = migrate.NewWithInstance("iofs", src, "sqlite3", driver)
		if err != nil {
			return fmt.Errorf("creating migrator: %w", err)
		}
	default:
		return fmt.Errorf("unsupported database type: %s", dbType)
	}

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("running migrations: %w", err)
	}

	return nil
}
