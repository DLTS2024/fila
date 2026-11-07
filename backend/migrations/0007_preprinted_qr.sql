CREATE TABLE qr_batches (
 batch_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 request_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 label_count SMALLINT UNSIGNED NOT NULL,
 created_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 layout_version TINYINT UNSIGNED NOT NULL DEFAULT 1,
 UNIQUE KEY uq_qr_batch_request(created_by,request_key),
 CONSTRAINT fk_qr_batch_actor FOREIGN KEY(created_by) REFERENCES users(id),
 CONSTRAINT ck_qr_batch_count CHECK(label_count IN (50,100,250,500))
) ENGINE=InnoDB;
CREATE TABLE qr_labels (
 label_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 batch_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 ordinal SMALLINT UNSIGNED NOT NULL,
 state ENUM('UNUSED','ASSIGNED','RETIRED') NOT NULL DEFAULT 'UNUSED',
 spool_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 assigned_at DATETIME(6) NULL,
 retired_at DATETIME(6) NULL,
 lifecycle_guard TINYINT UNSIGNED NOT NULL DEFAULT 1,
 active_spool_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin GENERATED ALWAYS AS (CASE WHEN state='ASSIGNED' THEN RTRIM(spool_id) ELSE NULL END) STORED,
 UNIQUE KEY uq_qr_batch_ordinal(batch_id,ordinal),
 UNIQUE KEY uq_qr_active_spool(active_spool_id),
 CONSTRAINT fk_qr_label_batch FOREIGN KEY(batch_id) REFERENCES qr_batches(batch_id),
 CONSTRAINT fk_qr_label_spool FOREIGN KEY(spool_id) REFERENCES spools(id),
 CONSTRAINT ck_qr_lifecycle_guard CHECK(lifecycle_guard=1),
 CONSTRAINT ck_qr_label_state CHECK((state='UNUSED' AND spool_id IS NULL AND assigned_at IS NULL AND retired_at IS NULL) OR (state='ASSIGNED' AND spool_id IS NOT NULL AND assigned_at IS NOT NULL AND retired_at IS NULL) OR (state='RETIRED' AND spool_id IS NOT NULL AND assigned_at IS NOT NULL AND retired_at IS NOT NULL))
) ENGINE=InnoDB;
CREATE TRIGGER qr_label_lifecycle BEFORE UPDATE ON qr_labels FOR EACH ROW SET NEW.lifecycle_guard=IF(NEW.label_id=OLD.label_id AND NEW.batch_id=OLD.batch_id AND NEW.ordinal=OLD.ordinal AND ((OLD.state='UNUSED' AND NEW.state='ASSIGNED') OR (OLD.state='ASSIGNED' AND NEW.state='RETIRED' AND (NEW.spool_id <=> OLD.spool_id) AND (NEW.assigned_at <=> OLD.assigned_at))),1,0);
CREATE TRIGGER qr_label_initial BEFORE INSERT ON qr_labels FOR EACH ROW SET NEW.lifecycle_guard=IF(NEW.state='UNUSED' AND NEW.spool_id IS NULL,1,0);
CREATE TRIGGER qr_label_no_delete BEFORE DELETE ON qr_labels FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='QR identifiers cannot be deleted or reused';
CREATE TABLE qr_label_events (
 event_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 label_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 actor_id BIGINT UNSIGNED NOT NULL,
 event_type ENUM('ASSIGNED','RETIRED') NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT fk_qr_event_label FOREIGN KEY(label_id) REFERENCES qr_labels(label_id),
 CONSTRAINT fk_qr_event_actor FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB;
