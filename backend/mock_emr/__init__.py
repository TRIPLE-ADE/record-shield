"""Mercy General's mock EMR: a separate vendor system with its own schema and private API.

RecordShield reaches it only through MercyAdapter with a service credential. Nothing here
imports from ``app``; the vendor does not know RecordShield's canonical contract.
"""
