CREATE TABLE vault_files (
  id            UUID        PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vault_id      UUID        NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  storage_token TEXT        NOT NULL UNIQUE,
  storage_path  TEXT        NOT NULL,
  size_bytes    BIGINT      NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON vault_files(user_id);
CREATE INDEX ON vault_files(vault_id);
