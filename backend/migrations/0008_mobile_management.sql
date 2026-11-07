-- Additive metadata only. Existing printer IDs, names, slots and assignments stay intact.
ALTER TABLE printers ADD brand VARCHAR(100) NOT NULL DEFAULT '', ADD model VARCHAR(100) NOT NULL DEFAULT '', ADD nickname VARCHAR(100) NOT NULL DEFAULT '', ADD colour_mode VARCHAR(10) NOT NULL DEFAULT 'single', ADD active TINYINT UNSIGNED NOT NULL DEFAULT 1, ADD version BIGINT UNSIGNED NOT NULL DEFAULT 1, ADD CONSTRAINT ck_printer_management CHECK (active IN (0,1) AND colour_mode IN ('single','multi') AND version > 0);
UPDATE printers SET colour_mode=CASE WHEN (SELECT COUNT(*) FROM printer_slots s WHERE s.printer_id=printers.id)>1 THEN 'multi' ELSE 'single' END;
UPDATE printers SET brand='Anycubic', model='Kobra 3' WHERE name='Anycubic Kobra 3';
UPDATE printers SET brand='Creality', model='SparkX i7', colour_mode='multi' WHERE name='Creality SPARKX i7';
ALTER TABLE catalogue_products ADD active TINYINT UNSIGNED NOT NULL DEFAULT 1, ADD version BIGINT UNSIGNED NOT NULL DEFAULT 1, ADD CONSTRAINT ck_product_management CHECK (active IN (0,1) AND version > 0);
