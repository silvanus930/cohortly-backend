-- Executed once when the data volume is first initialised.
-- Creates the database used by the e2e test suite so that
-- local runs and CI share the same connection settings.
CREATE DATABASE cohortly_test;
