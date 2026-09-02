/** Format rupiah bulat: 15000 -> "Rp 15.000". Uang selalu integer (PRD §5-4). */
export function rp(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

/** Angka polos berpemisah ribuan: 15000 -> "15.000" (untuk kolom tabel). */
export function ribuan(n: number): string {
  return n.toLocaleString("id-ID");
}
