CREATE TABLE scale_devices (
 device_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 credential_version INT UNSIGNED NOT NULL DEFAULT 1,
 enabled TINYINT UNSIGNED NOT NULL DEFAULT 1,
 active_boot CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT ck_scale_device_enabled CHECK (enabled IN (0,1))
) ENGINE=InnoDB;
CREATE TABLE scale_device_boots (
 device_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 boot_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 last_sequence BIGINT UNSIGNED NOT NULL,
 PRIMARY KEY(device_id,boot_id),
 CONSTRAINT fk_scale_boot_device FOREIGN KEY(device_id) REFERENCES scale_devices(device_id)
) ENGINE=InnoDB;
CREATE TABLE scale_live_readings (
 device_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 boot_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 sequence_number BIGINT UNSIGNED NOT NULL,
 credential_version INT UNSIGNED NOT NULL,
 frame_json TEXT NOT NULL,
 received_ms BIGINT UNSIGNED NOT NULL,
 sent_ms BIGINT UNSIGNED NOT NULL,
 received_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT fk_scale_live_device FOREIGN KEY(device_id) REFERENCES scale_devices(device_id)
) ENGINE=InnoDB;
