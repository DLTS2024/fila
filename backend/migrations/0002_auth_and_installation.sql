CREATE TABLE login_throttles (
  bucket CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  attempts INT UNSIGNED NOT NULL,
  window_started DATETIME(6) NOT NULL,
  KEY ix_throttle_window (window_started)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE installation_state (
  id TINYINT UNSIGNED PRIMARY KEY,
  initialized_at DATETIME(6) NULL,
  CONSTRAINT ck_installation_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO installation_state (id, initialized_at) VALUES (1, NULL);
