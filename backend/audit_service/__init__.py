"""RecordShield's isolated audit process (PRD §10.1, §13; FR3/FR4).

Owns the only SQLite file in the system. Exposes an append-only, service-key-protected HTTP API:
there is no update or delete route. RecordShield never opens this file; it appends over HTTP and
reads back receipts. Checkpoints are deliberately kept outside this file by the application.
"""
