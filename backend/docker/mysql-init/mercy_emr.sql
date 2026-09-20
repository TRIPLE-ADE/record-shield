-- Mercy General's mock EMR gets its own database and credential. RecordShield never uses them;
-- only the mock EMR process does. Runs automatically on a fresh MySQL volume.
CREATE DATABASE IF NOT EXISTS mercy_emr;
CREATE USER IF NOT EXISTS 'mercy_emr'@'%' IDENTIFIED BY 'mercy_emr';
GRANT ALL PRIVILEGES ON mercy_emr.* TO 'mercy_emr'@'%';
FLUSH PRIVILEGES;
