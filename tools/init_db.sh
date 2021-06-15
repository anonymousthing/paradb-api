#!/usr/bin/env bash

HERE="$(realpath "${0}" | xargs dirname)"

psql -d paradb -f "$HERE/../db/init.sql"
psql -d paradb -f "$HERE/../db/fake_data.sql"
