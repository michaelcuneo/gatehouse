#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "GateHouse host setup must run as root (use sudo)." >&2
  exit 77
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
gatehouse_user="${GATEHOUSE_USER:-${SUDO_USER:-}}"

if [[ -z "$gatehouse_user" || "$gatehouse_user" == "root" ]]; then
  echo "Unable to determine the non-root GateHouse user." >&2
  echo "Run with sudo or set GATEHOUSE_USER=<username>." >&2
  exit 64
fi

if ! id "$gatehouse_user" >/dev/null 2>&1; then
  echo "GateHouse user does not exist: $gatehouse_user" >&2
  exit 67
fi

for command in nginx systemctl visudo; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command is missing: $command" >&2
    exit 69
  fi
done

helpers=(
  route-manager-apply
  route-manager-remove
  gatehouse-service-apply
  gatehouse-service-remove
)

for helper in "${helpers[@]}"; do
  install -m 0755 "$script_dir/$helper" "/usr/local/bin/$helper"
done

sudoers="/etc/sudoers.d/gatehouse-$gatehouse_user"
cat > "$sudoers" <<EOF
$gatehouse_user ALL=(root) NOPASSWD: /usr/local/bin/route-manager-apply
$gatehouse_user ALL=(root) NOPASSWD: /usr/local/bin/route-manager-remove
$gatehouse_user ALL=(root) NOPASSWD: /usr/local/bin/gatehouse-service-apply
$gatehouse_user ALL=(root) NOPASSWD: /usr/local/bin/gatehouse-service-remove
EOF

chmod 0440 "$sudoers"
visudo -cf "$sudoers" >/dev/null

nginx -t

echo "GateHouse Linux host helpers installed for user: $gatehouse_user"
echo "GateHouse application processes should continue to run as that non-root user."
