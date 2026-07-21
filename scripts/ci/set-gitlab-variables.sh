#!/usr/bin/env bash
# Khai CI/CD Variables lên GitLab từ .env.local (+ optional profile cho OPS) qua glab CLI.
#
# CHẠY TRÊN MÁY BẠN (không phải trong repo/agent). Yêu cầu:
#   1) glab đã cài + `glab auth login` (host gitlab.sapp.edu.vn).
#   2) Chạy trong thư mục repo (glab tự nhận project từ git remote), hoặc thêm -R <group/project>.
#
# AN TOÀN:
#   - KHÔNG in giá trị secret ra màn hình (chỉ in tên biến + trạng thái).
#   - MẶC ĐỊNH dry-run (chỉ xem sẽ set gì). Phải --apply mới set thật.
#   - Chỉ set biến CÓ giá trị thật trong env (bỏ qua rỗng/placeholder <...>).
#   - Secret (token/password) set --masked --protected; URL/email/username set --protected.
#
# Dùng:
#   bash scripts/ci/set-gitlab-variables.sh                 # dry-run, đọc .env.local
#   bash scripts/ci/set-gitlab-variables.sh --apply         # set thật
#   bash scripts/ci/set-gitlab-variables.sh --ops-from profiles/CI/task.env --apply
#   bash scripts/ci/set-gitlab-variables.sh --env-file .env --apply

set -euo pipefail

APPLY=0
ENV_FILES=(".env.local" ".env")
OPS_FROM=""
REPO_FLAG=()

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --env-file) ENV_FILES=("$2"); shift 2 ;;
    --ops-from) OPS_FROM="$2"; shift 2 ;;
    -R|--repo) REPO_FLAG=(-R "$2"); shift 2 ;;
    *) echo "Tham số lạ: $1"; exit 2 ;;
  esac
done

if ! command -v glab >/dev/null 2>&1; then
  echo "ERROR: chưa cài glab. Xem https://gitlab.com/gitlab-org/cli"; exit 1
fi
if ! glab auth status >/dev/null 2>&1; then
  echo "ERROR: chưa đăng nhập glab. Chạy: glab auth login --hostname gitlab.sapp.edu.vn"; exit 1
fi

# Đọc value của KEY từ danh sách file (ưu tiên OPS_FROM cho OPS_*, rồi ENV_FILES). Không in value.
get_val() {
  local key="$1"; local files=()
  case "$key" in OPS_*) [ -n "$OPS_FROM" ] && files+=("$OPS_FROM") ;; esac
  files+=("${ENV_FILES[@]}")
  local f line val
  for f in "${files[@]}"; do
    [ -f "$f" ] || continue
    line="$(grep -E "^${key}=" "$f" | tail -n1 || true)"
    [ -n "$line" ] || continue
    val="${line#*=}"
    val="${val%\"}"; val="${val#\"}"; val="${val%\'}"; val="${val#\'}"
    printf '%s' "$val"; return 0
  done
  return 1
}
usable() { [ -n "${1:-}" ] && [[ ! "${1:-}" =~ ^\<.*\>$ ]]; }

# masked=1 → --masked --protected (token/password); masked=0 → --protected (URL/email/username)
set_one() {
  local key="$1" masked="$2" val
  val="$(get_val "$key" || true)"
  if ! usable "$val"; then
    printf '  SKIP  %-24s (không có giá trị trong env)\n' "$key"; return 0
  fi
  local tag="protected"; [ "$masked" = "1" ] && tag="masked+protected"
  if [ "$APPLY" = "0" ]; then
    printf '  WOULD %-24s [%s]\n' "$key" "$tag"; return 0
  fi
  local flags=(--protected); [ "$masked" = "1" ] && flags=(--masked --protected)
  if glab variable set "$key" "$val" "${flags[@]}" "${REPO_FLAG[@]}" >/dev/null 2>&1; then
    printf '  SET   %-24s [%s]\n' "$key" "$tag"
  else
    # Masking có thể bị GitLab từ chối (value không đạt rule mask) → thử lại chỉ protected.
    if [ "$masked" = "1" ] && glab variable set "$key" "$val" --protected "${REPO_FLAG[@]}" >/dev/null 2>&1; then
      printf '  SET   %-24s [protected] (mask bị từ chối, đã set không mask)\n' "$key"
    else
      printf '  FAIL  %-24s (glab variable set lỗi)\n' "$key"
    fi
  fi
}

echo "GitLab CI Variables — nguồn: ${ENV_FILES[*]}${OPS_FROM:+ + $OPS_FROM (OPS_*)}"
[ "$APPLY" = "0" ] && echo "MODE: DRY-RUN (thêm --apply để set thật)" || echo "MODE: APPLY (set thật)"
echo "Repo: $(glab repo view 2>/dev/null | head -1 || echo '(auto từ git remote)')"
echo

echo "[Jira / Xray / Confluence — cho integration-check]"
set_one JIRA_BASE_URL        0
set_one JIRA_EMAIL           0
set_one JIRA_API_TOKEN       1
set_one XRAY_CLIENT_ID       1
set_one XRAY_CLIENT_SECRET   1
set_one CONFLUENCE_URL       0
set_one CONFLUENCE_USERNAME  0
set_one CONFLUENCE_API_TOKEN 1

echo
echo "[OPS — cho task-execute / regression (nên là account test UAT riêng cho CI)]"
set_one OPS_BASE_URL         0
set_one OPS_USERNAME         0
set_one OPS_PASSWORD         1
set_one OPS_USERNAME_LOW     0
set_one OPS_PASSWORD_LOW     1
set_one OPS_USERNAME_HIGH    0
set_one OPS_PASSWORD_HIGH    1

echo
if [ "$APPLY" = "0" ]; then
  echo "Xem OK thì chạy lại với --apply. Nhớ: OPS_BASE_URL phải trỏ UAT/staging (không prod)."
else
  echo "Xong. Kiểm: Settings → CI/CD → Variables. Đảm bảo scope Protected branches, không lộ cho fork MR."
fi
