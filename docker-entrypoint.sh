#!/bin/sh
set -e

# next start runs the router and the render workers as separate processes.
# Without this, each one would pick its own random setup token, so the value
# printed in the logs would never match what /setup checks.
if [ -z "$SETUP_TOKEN" ]; then
  export SETUP_TOKEN="$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")"
fi

echo "Applying migrations..."
node scripts/migrate.mjs

exec node server.js
