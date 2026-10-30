ALTER TABLE brands ADD active TINYINT UNSIGNED NOT NULL DEFAULT 1, ADD version BIGINT UNSIGNED NOT NULL DEFAULT 1, ADD CONSTRAINT ck_brand_active CHECK (active IN (0,1));
ALTER TABLE tare_profiles ADD active TINYINT UNSIGNED NOT NULL DEFAULT 1, ADD version BIGINT UNSIGNED NOT NULL DEFAULT 1, ADD CONSTRAINT ck_profile_active CHECK (active IN (0,1));
ALTER TABLE spools ADD spool_type VARCHAR(100) NOT NULL DEFAULT 'Unspecified', ADD registration_kind VARCHAR(20) NOT NULL DEFAULT 'partial', ADD tare_default_g DECIMAL(10,2) NULL, ADD CONSTRAINT ck_registration_kind CHECK (registration_kind IN ('sealed','partial')), ADD CONSTRAINT ck_spool_default_tare CHECK (tare_default_g IS NULL OR tare_default_g >= 0);
UPDATE spools s JOIN tare_profiles t ON t.id = s.tare_profile_id SET s.tare_default_g = t.empty_mass_g, s.spool_type = t.spool_type;
SET @dloop_drop_mass = IF(LOCATE('MariaDB', VERSION()) > 0, 'ALTER TABLE spools DROP CONSTRAINT ck_spool_mass', 'ALTER TABLE spools DROP CHECK ck_spool_mass');
PREPARE dloop_mass_stmt FROM @dloop_drop_mass;
EXECUTE dloop_mass_stmt;
DEALLOCATE PREPARE dloop_mass_stmt;
ALTER TABLE spools ADD CONSTRAINT ck_spool_mass CHECK (nominal_capacity_g > 0 AND nominal_capacity_g <= 100000 AND initial_filament_g >= 0 AND initial_filament_g <= 100000 AND remaining_g >= 0 AND remaining_g <= 100000 AND (tare_override_g IS NULL OR tare_override_g >= 0) AND (last_gross_g IS NULL OR last_gross_g >= 0));
ALTER TABLE activity_events ADD sequence BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, ADD UNIQUE KEY uq_event_sequence (sequence);

CREATE TABLE studio_revision (
  id TINYINT UNSIGNED PRIMARY KEY,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT ck_studio_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO studio_revision (id, revision) VALUES (1, 0);

INSERT INTO printers (name) VALUES ('Anycubic Kobra 3'), ('Creality SPARKX i7');
INSERT INTO printer_slots (printer_id, slot_number) SELECT id, 1 FROM printers WHERE name IN ('Anycubic Kobra 3','Creality SPARKX i7');
INSERT INTO printer_slots (printer_id, slot_number) SELECT id, 2 FROM printers WHERE name = 'Creality SPARKX i7';
INSERT INTO printer_slots (printer_id, slot_number) SELECT id, 3 FROM printers WHERE name = 'Creality SPARKX i7';
INSERT INTO printer_slots (printer_id, slot_number) SELECT id, 4 FROM printers WHERE name = 'Creality SPARKX i7';
