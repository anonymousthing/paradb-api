#!/bin/bash

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
TEST_DB="paradb_test"
POSTGRES_USER="postgres"

echo "Dropping database: $TEST_DB"
su -c "dropdb --if-exists \"$TEST_DB\"" "$POSTGRES_USER"
su -c "createdb \"$TEST_DB\"" "$POSTGRES_USER"
su -c "psql -d \"$TEST_DB\" -f \"$SCRIPT_DIR/../db/init.sql\"" "$POSTGRES_USER"

echo "Running tests..."
yarn jest
