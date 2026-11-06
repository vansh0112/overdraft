#!/bin/sh
# Starts every backend process together; if one stops, all stop and the host restarts the container.
set -e
mkdir -p python/.state
# On a new volume, restore the services' progress (their read positions on Hedera, what they already wrote
# to Arkiv and deposited on 0G), so nothing is written or paid twice. STATE_SEED is base64 of gzipped JSON,
# {file name: contents}.
if [ -n "$STATE_SEED" ] && [ -z "$(ls -A python/.state)" ]; then
  python/.venv/bin/python - <<'PY'
import base64, gzip, json, os, pathlib
files = json.loads(gzip.decompress(base64.b64decode(os.environ["STATE_SEED"])))
for name, text in files.items():
    (pathlib.Path("python/.state") / pathlib.Path(name).name).write_text(text)
print("restored service state:", ", ".join(sorted(files)))
PY
fi
# honcho gives each process its own PORT, so the API gets the host's port under another name.
export API_PORT="${PORT:-8000}"
exec python/.venv/bin/honcho start -f deploy/Procfile
