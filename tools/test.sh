#!/bin/bash

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
TEST_DB="paradb_test"

echo "Dropping database: $TEST_DB"
dropdb "$TEST_DB"
createdb "$TEST_DB"
psql -d "$TEST_DB" -f "$SCRIPT_DIR/../db/init.sql"

echo "Running tests..."
yarn jest
