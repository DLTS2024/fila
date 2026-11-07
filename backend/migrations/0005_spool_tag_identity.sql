ALTER TABLE spools ADD tag_token CHAR(48) CHARACTER SET ascii COLLATE ascii_bin NULL, ADD UNIQUE KEY uq_spool_tag_token (tag_token);
