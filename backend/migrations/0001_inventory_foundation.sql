CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'admin',
  active TINYINT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_users_email (email),
  CONSTRAINT ck_users_role CHECK (role = 'admin'),
  CONSTRAINT ck_users_active CHECK (active IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE brands (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_brands_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tare_profiles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  spool_type VARCHAR(100) NOT NULL,
  nominal_capacity_g DECIMAL(10,2) NOT NULL,
  empty_mass_g DECIMAL(10,2) NOT NULL,
  verified_at DATETIME(6) NULL,
  notes VARCHAR(500) NOT NULL DEFAULT '',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_tare_profile (brand_id, spool_type, nominal_capacity_g),
  CONSTRAINT fk_tare_brand FOREIGN KEY (brand_id) REFERENCES brands(id),
  CONSTRAINT ck_tare_mass CHECK (empty_mass_g >= 0 AND nominal_capacity_g > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE catalogue_products (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  brand_id BIGINT UNSIGNED NOT NULL,
  tare_profile_id BIGINT UNSIGNED NULL,
  name VARCHAR(150) NOT NULL,
  material VARCHAR(30) NOT NULL,
  color_name VARCHAR(60) NOT NULL,
  color_hex CHAR(7) CHARACTER SET ascii NOT NULL,
  diameter_mm DECIMAL(4,2) NOT NULL DEFAULT 1.75,
  nozzle_c SMALLINT UNSIGNED NULL,
  bed_c SMALLINT UNSIGNED NULL,
  price DECIMAL(10,2) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY ix_catalogue_material (material),
  CONSTRAINT fk_catalogue_brand FOREIGN KEY (brand_id) REFERENCES brands(id),
  CONSTRAINT fk_catalogue_tare FOREIGN KEY (tare_profile_id) REFERENCES tare_profiles(id),
  CONSTRAINT ck_catalogue_values CHECK (diameter_mm > 0 AND diameter_mm <= 5 AND (price IS NULL OR price >= 0) AND (nozzle_c IS NULL OR nozzle_c <= 500) AND (bed_c IS NULL OR bed_c <= 200))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE spool_code_sequences (
  prefix VARCHAR(99) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  next_number BIGINT UNSIGNED NOT NULL DEFAULT 1,
  CONSTRAINT ck_sequence CHECK (next_number > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE spools (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  code VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(150) NOT NULL,
  brand_id BIGINT UNSIGNED NOT NULL,
  catalogue_product_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  tare_profile_id BIGINT UNSIGNED NULL,
  tare_override_g DECIMAL(10,2) NULL,
  material VARCHAR(30) NOT NULL,
  color_name VARCHAR(60) NOT NULL,
  color_hex CHAR(7) CHARACTER SET ascii NOT NULL,
  nominal_capacity_g DECIMAL(10,2) NOT NULL,
  initial_filament_g DECIMAL(10,2) NOT NULL,
  remaining_g DECIMAL(10,2) NOT NULL,
  last_gross_g DECIMAL(10,2) NULL,
  measured TINYINT UNSIGNED NOT NULL DEFAULT 0,
  location VARCHAR(150) NOT NULL DEFAULT 'Shelf',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_spool_code (code),
  KEY ix_spool_material (material),
  KEY ix_spool_status_mass (status, remaining_g),
  CONSTRAINT fk_spool_brand FOREIGN KEY (brand_id) REFERENCES brands(id),
  CONSTRAINT fk_spool_catalogue FOREIGN KEY (catalogue_product_id) REFERENCES catalogue_products(id),
  CONSTRAINT fk_spool_tare FOREIGN KEY (tare_profile_id) REFERENCES tare_profiles(id),
  CONSTRAINT ck_spool_mass CHECK (nominal_capacity_g > 0 AND initial_filament_g >= 0 AND initial_filament_g <= nominal_capacity_g AND remaining_g >= 0 AND remaining_g <= nominal_capacity_g AND (tare_override_g IS NULL OR tare_override_g >= 0) AND (last_gross_g IS NULL OR last_gross_g >= 0)),
  CONSTRAINT ck_spool_state CHECK (measured IN (0,1) AND status IN ('active','archived') AND version > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE measurements (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  spool_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  gross_g DECIMAL(10,2) NOT NULL,
  effective_tare_g DECIMAL(10,2) NOT NULL,
  net_g DECIMAL(10,2) NOT NULL,
  source VARCHAR(20) NOT NULL,
  device_id VARCHAR(100) NULL,
  device_sequence BIGINT UNSIGNED NULL,
  stable TINYINT UNSIGNED NOT NULL,
  received_at DATETIME(6) NOT NULL,
  confirmed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  confirmed_by BIGINT UNSIGNED NOT NULL,
  KEY ix_measurements_spool_time (spool_id, confirmed_at),
  CONSTRAINT fk_measurement_spool FOREIGN KEY (spool_id) REFERENCES spools(id),
  CONSTRAINT fk_measurement_user FOREIGN KEY (confirmed_by) REFERENCES users(id),
  CONSTRAINT ck_measurement_mass CHECK (gross_g >= effective_tare_g AND effective_tare_g >= 0 AND net_g = gross_g - effective_tare_g),
  CONSTRAINT ck_measurement_source CHECK (source IN ('manual','usb','legacy') AND stable IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE activity_events (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  actor_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  note VARCHAR(1000) NOT NULL DEFAULT '',
  details_json LONGTEXT NULL,
  undo_of CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_event_undo (undo_of),
  KEY ix_activity_time (created_at, id),
  CONSTRAINT fk_event_actor FOREIGN KEY (actor_id) REFERENCES users(id),
  CONSTRAINT fk_event_undo FOREIGN KEY (undo_of) REFERENCES activity_events(id),
  CONSTRAINT ck_event_json CHECK (details_json IS NULL OR JSON_VALID(details_json))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE activity_changes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  spool_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  before_g DECIMAL(10,2) NOT NULL,
  after_g DECIMAL(10,2) NOT NULL,
  measured_before TINYINT UNSIGNED NOT NULL,
  measured_after TINYINT UNSIGNED NOT NULL,
  UNIQUE KEY uq_event_spool (event_id, spool_id),
  KEY ix_changes_spool (spool_id, id),
  CONSTRAINT fk_change_event FOREIGN KEY (event_id) REFERENCES activity_events(id),
  CONSTRAINT fk_change_spool FOREIGN KEY (spool_id) REFERENCES spools(id),
  CONSTRAINT ck_change_mass CHECK (before_g >= 0 AND after_g >= 0 AND measured_before IN (0,1) AND measured_after IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE printers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_printer_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE printer_slots (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  printer_id BIGINT UNSIGNED NOT NULL,
  slot_number SMALLINT UNSIGNED NOT NULL,
  spool_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  UNIQUE KEY uq_printer_slot (printer_id, slot_number),
  UNIQUE KEY uq_slot_spool (spool_id),
  CONSTRAINT fk_slot_printer FOREIGN KEY (printer_id) REFERENCES printers(id),
  CONSTRAINT fk_slot_spool FOREIGN KEY (spool_id) REFERENCES spools(id),
  CONSTRAINT ck_slot_number CHECK (slot_number > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE nfc_tags (
  uid VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  spool_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  linked_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_nfc_spool (spool_id),
  CONSTRAINT fk_nfc_spool FOREIGN KEY (spool_id) REFERENCES spools(id),
  CONSTRAINT ck_nfc_uid CHECK (uid REGEXP '^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE idempotency_keys (
  user_id BIGINT UNSIGNED NOT NULL,
  request_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  route VARCHAR(200) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  response_status SMALLINT UNSIGNED NULL,
  response_json LONGTEXT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  expires_at DATETIME(6) NOT NULL,
  PRIMARY KEY (user_id, request_key),
  KEY ix_idempotency_expiry (expires_at),
  CONSTRAINT fk_idempotency_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT ck_idempotency_json CHECK (response_json IS NULL OR JSON_VALID(response_json))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
