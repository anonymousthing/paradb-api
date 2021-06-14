#!/usr/bin/env bash

HERE="$(realpath "${0}" | xargs dirname)"

psql -d paradb -f "$HERE/init.sql"
psql -d paradb -f "$HERE/fake_data.sql"
