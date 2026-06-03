ALTER TABLE user_push_tokens
  DROP CONSTRAINT IF EXISTS user_push_tokens_platform_check;

ALTER TABLE user_push_tokens
  ADD CONSTRAINT user_push_tokens_platform_check
  CHECK (platform IN ('apns', 'fcm'));
