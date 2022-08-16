#!/bin/bash

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
TEST_DB="paradb_test"
POSTGRES_USER="postgres"

echo "Dropping database: $TEST_DB"
sudo -u postgres -E dropdb --if-exists "$TEST_DB"
sudo -u postgres -E createdb "$TEST_DB"
sudo -u postgres -E psql -d "$TEST_DB" -f "$SCRIPT_DIR/../db/init.sql"

echo "Running tests..."
yarn jest
