#!/usr/bin/env bash
# =====================================================================
# Migrasi skema — jalankan file .sql bernomor yang belum pernah dijalankan.
#
#   DATABASE_URL=postgres://user:pass@host/smartcampus ./db/migrate.sh
#   ./db/migrate.sh --reset      # HANYA dev: drop & buat ulang database
#   ./db/migrate.sh --uji        # migrasi ke DB sementara + jalankan semua uji
#
# Setiap file dijalankan dalam SATU transaksi (psql -1): gagal di tengah =
# tidak ada yang berubah. File yang sudah jalan dicatat di tabel
# skema_migrasi dan tidak diulang. Jangan pernah mengedit file yang sudah
# dijalankan di produksi — buat file bernomor berikutnya.
# =====================================================================
set -euo pipefail
# Jalur mutlak skrip ini DULU, sebelum cd. Mode --uji memanggil dirinya
# sendiri; dengan "$0" relatif (mis. `bash db/migrate.sh`) pemanggilan itu
# gagal "No such file or directory" setelah cd — persis yang terjadi pada
# `npm run db:uji`.
SKRIP="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$0")"

: "${DATABASE_URL:?DATABASE_URL belum di-set (contoh: postgres://smartcampus:rahasia@localhost/smartcampus)}"
PSQL="psql -X -q -v ON_ERROR_STOP=1"

if [[ "${1:-}" == "--uji" ]]; then
    # DB sementara supaya uji tidak menyentuh data asli
    UJI_DB="smartcampus_uji_$$"
    ADMIN_URL="${DATABASE_URL%/*}/postgres"
    $PSQL "$ADMIN_URL" -c "CREATE DATABASE $UJI_DB"
    trap '$PSQL "$ADMIN_URL" -c "DROP DATABASE IF EXISTS $UJI_DB" >/dev/null' EXIT
    export DATABASE_URL="${DATABASE_URL%/*}/$UJI_DB"
    "$SKRIP"
    for f in uji/[0-9]*.sql; do
        echo "── uji: $f"
        # stdout dibuang di sini (portabel di bash mana pun, termasuk Git Bash
        # di Windows); stderr tetap tampil supaya kegagalan kelihatan.
        $PSQL "$DATABASE_URL" -f "$f" > /dev/null
    done
    echo "── ringkasan"
    $PSQL "$DATABASE_URL" -f uji/_ringkasan.sql
    exit 0
fi

if [[ "${1:-}" == "--reset" ]]; then
    DB="${DATABASE_URL##*/}"; DB="${DB%%\?*}"
    ADMIN_URL="${DATABASE_URL%/*}/postgres"
    echo "!! RESET database $DB (semua data hilang) — hanya untuk dev"
    $PSQL "$ADMIN_URL" -c "DROP DATABASE IF EXISTS \"$DB\"" -c "CREATE DATABASE \"$DB\""
fi

$PSQL "$DATABASE_URL" -c "CREATE TABLE IF NOT EXISTS skema_migrasi (
    berkas TEXT PRIMARY KEY, dijalankan TIMESTAMPTZ NOT NULL DEFAULT now())"

for f in [0-9][0-9][0-9]_*.sql; do
    sudah=$($PSQL -At "$DATABASE_URL" -c "SELECT 1 FROM skema_migrasi WHERE berkas = '$f'")
    if [[ "$sudah" == "1" ]]; then continue; fi
    echo "── migrasi: $f"
    $PSQL -1 "$DATABASE_URL" -f "$f" -c "INSERT INTO skema_migrasi (berkas) VALUES ('$f')"
done
echo "migrasi selesai."
