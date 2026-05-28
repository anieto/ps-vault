CREATE TABLE IF NOT EXISTS user_push_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT        NOT NULL,
  platform   TEXT        NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMP   NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, token)
);
