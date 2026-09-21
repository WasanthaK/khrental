#!/bin/sh
set -e
npm run generate-env-config
exec node server.js
