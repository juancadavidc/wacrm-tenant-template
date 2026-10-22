-- Set passwords for the roles that gotrue, storage-api, and postgrest use
-- to connect. The roles already exist in supabase/postgres; this just
-- applies the password that matches the value each service reads from its
-- environment.
--
-- '${POSTGRES_PASSWORD}' is resolved by the Postgres client when the file
-- is run via `psql -v ON_ERROR_STOP=1` — it does NOT use shell syntax.
-- The compose file passes POSTGRES_PASSWORD as an env var to the container
-- and psql picks it up via the :'VAR' notation.

ALTER USER authenticator     WITH PASSWORD :'POSTGRES_PASSWORD';
ALTER USER supabase_auth_admin WITH PASSWORD :'POSTGRES_PASSWORD';
ALTER USER supabase_storage_admin WITH PASSWORD :'POSTGRES_PASSWORD';
ALTER USER supabase_admin    WITH PASSWORD :'POSTGRES_PASSWORD';
