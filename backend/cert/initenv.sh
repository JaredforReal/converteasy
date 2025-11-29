#!/bin/sh
# initenv.sh - placeholder initialization script
# This script is intentionally minimal and safe. In production,
# mount a real init script (via k8s Secret/ConfigMap) to /app/cert/initenv.sh

set -e

log() { echo "[initenv] $(date -u +%Y-%m-%dT%H:%M:%SZ) - $*"; }

CERT_DIR="/app/cert"

log "initenv: start"

# Ensure directory exists
if [ ! -d "$CERT_DIR" ]; then
  log "creating $CERT_DIR"
  mkdir -p "$CERT_DIR"
fi

# If a real script is mounted (e.g. by k8s Secret), don't overwrite it.
if [ -f "$CERT_DIR/initenv.sh" ] && [ "$(readlink -f "$CERT_DIR/initenv.sh")" != "/app/cert/initenv.sh" ]; then
  # If someone mounted a script, leave it alone.
  log "external initenv.sh present, skipping placeholder write"
fi

# Create a placeholder file only if nothing exists at that path
if [ ! -f "$CERT_DIR/initenv.sh" ]; then
  cat > "$CERT_DIR/initenv.sh" <<'EOF'
#!/bin/sh
# placeholder: no-op initialization
set -e
echo "[initenv] placeholder - nothing to do"
exit 0
EOF
  chmod 700 "$CERT_DIR/initenv.sh" || true
  log "placeholder initenv.sh created"
else
  log "initenv.sh already exists"
fi

# Ensure uploads dir exists and has safe permissions
if [ ! -d /app/uploads ]; then
  mkdir -p /app/uploads
fi
chmod 700 /app/uploads || true

log "initenv: done"
exit 0
