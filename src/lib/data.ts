/**
 * Data contoh (mock) untuk seluruh halaman — SATU sumber untuk semua route.
 * Saat backend masuk (Fase 1a), modul ini digantikan pemanggilan API;
 * bentuk tipenya sengaja mengikuti skema 01_core.sql.
 */

export type StatusSiswa = "aktif" | "cuti" | "pindah" | "lulus" | "keluar";
export type StatusKartu = "aktif" | "hilang" | "rusak" | "diganti" | "ditarik" | "belum";
export type JenisTransaksi = "belanja" | "topup" | "refund" | "koreksi" | "denda" | "penarikan";

export interface Siswa {
  nis: string;
  nama: string;
  kelas: string;
  jenjang: "SMP" | "SMA";
  boarding: boolean;
  status: StatusSiswa;
  kartu: StatusKartu;
  saldoRp: number;
  pinTerkunci?: boolean;
}

export interface Transaksi {
  waktu: string;
  siswa: string;
  kelas: string;
  terminal: string;
  jenis: JenisTransaksi;
  nominalRp: number; // negatif = keluar dari wallet siswa
}

export const SISWA: Siswa[] = [
  { nis: "26001", nama: "Rafif Gamma Wisanggeni", kelas: "7.A", jenjang: "SMP", boarding: true, status: "aktif", kartu: "hilang", saldoRp: 200000 },
  { nis: "26002", nama: "Aishabilla Piliang", kelas: "7.A", jenjang: "SMP", boarding: true, status: "aktif", kartu: "aktif", saldoRp: 86500 },
  { nis: "25017", nama: "Keenan Alvaro", kelas: "8.B", jenjang: "SMP", boarding: true, status: "aktif", kartu: "aktif", saldoRp: 4000 },
  { nis: "24031", nama: "Nayla Puspita", kelas: "9.C", jenjang: "SMP", boarding: true, status: "aktif", kartu: "aktif", saldoRp: 1500 },
  { nis: "23008", nama: "Alfian Pratama", kelas: "10.A", jenjang: "SMA", boarding: true, status: "aktif", kartu: "aktif", saldoRp: 122000, pinTerkunci: true },
  { nis: "22044", nama: "Salsabila Zahra", kelas: "11.B", jenjang: "SMA", boarding: true, status: "aktif", kartu: "aktif", saldoRp: 57500 },
  { nis: "21002", nama: "Bagas Nur Ramadhan", kelas: "12.A", jenjang: "SMA", boarding: true, status: "aktif", kartu: "aktif", saldoRp: 31000 },
  { nis: "20015", nama: "Davin Mahesa", kelas: "—", jenjang: "SMA", boarding: false, status: "lulus", kartu: "ditarik", saldoRp: 0 },
];

export const TRANSAKSI_TERAKHIR: Transaksi[] = [
  { waktu: "12.47", siswa: "Aishabilla Piliang", kelas: "7.A", terminal: "KANTIN-01", jenis: "belanja", nominalRp: -15000 },
  { waktu: "12.46", siswa: "Keenan Alvaro", kelas: "8.B", terminal: "KANTIN-02", jenis: "belanja", nominalRp: -12000 },
  { waktu: "12.44", siswa: "Salsabila Zahra", kelas: "11.B", terminal: "KANTIN-01", jenis: "belanja", nominalRp: -18500 },
  { waktu: "12.41", siswa: "Rafif G. Wisanggeni", kelas: "7.A", terminal: "mayar.id", jenis: "topup", nominalRp: 200000 },
  { waktu: "12.39", siswa: "Alfian Pratama", kelas: "10.A", terminal: "KANTIN-02", jenis: "belanja", nominalRp: -9000 },
  { waktu: "12.31", siswa: "Nayla Puspita", kelas: "9.C", terminal: "Keuangan", jenis: "refund", nominalRp: 15000 },
  { waktu: "12.28", siswa: "Bagas Nur Ramadhan", kelas: "12.A", terminal: "KANTIN-01", jenis: "belanja", nominalRp: -16000 },
];

export const TRANSAKSI_PER_JAM: { jam: number; jumlah: number }[] = [
  { jam: 6, jumlah: 4 }, { jam: 7, jumlah: 18 }, { jam: 8, jumlah: 9 }, { jam: 9, jumlah: 86 },
  { jam: 10, jumlah: 31 }, { jam: 11, jumlah: 12 }, { jam: 12, jumlah: 124 }, { jam: 13, jumlah: 52 },
  { jam: 14, jumlah: 11 }, { jam: 15, jumlah: 38 }, { jam: 16, jumlah: 21 }, { jam: 17, jumlah: 9 },
  { jam: 18, jumlah: 26 }, { jam: 19, jumlah: 14 }, { jam: 20, jumlah: 8 }, { jam: 21, jumlah: 3 },
];

/* ===== Kantin ===== */
export interface MenuKantin { nama: string; kategori: "Makanan berat" | "Jajanan" | "Minuman"; hargaRp: number; aktif: boolean; catatan?: string }
export const MENU_KANTIN: MenuKantin[] = [
  { nama: "Nasi ayam geprek", kategori: "Makanan berat", hargaRp: 12000, aktif: true },
  { nama: "Nasi ayam + teh (paket)", kategori: "Makanan berat", hargaRp: 15000, aktif: true },
  { nama: "Mie ayam bakso", kategori: "Makanan berat", hargaRp: 13000, aktif: true },
  { nama: "Roti bakar coklat", kategori: "Jajanan", hargaRp: 8000, aktif: true },
  { nama: "Teh manis dingin", kategori: "Minuman", hargaRp: 4000, aktif: true },
  { nama: "Susu kotak", kategori: "Minuman", hargaRp: 6000, aktif: true },
  { nama: "Es buah", kategori: "Minuman", hargaRp: 7000, aktif: false, catatan: "stok habis" },
  { nama: "Batagor", kategori: "Jajanan", hargaRp: 9000, aktif: false },
];
export const TERLARIS_KANTIN = [
  { menu: "Nasi ayam geprek", porsi: 512, omzetRp: 6144000 },
  { menu: "Paket nasi ayam + teh", porsi: 348, omzetRp: 5220000 },
  { menu: "Mie ayam bakso", porsi: 301, omzetRp: 3913000 },
  { menu: "Teh manis dingin", porsi: 644, omzetRp: 2576000 },
  { menu: "Roti bakar coklat", porsi: 228, omzetRp: 1824000 },
];

/* ===== Perangkat ===== */
export type StatusDevice = "online" | "offline" | "nonaktif" | "disiapkan" | "cache";
export interface Device {
  kode: string; layanan: string; lokasi: string; status: StatusDevice;
  terakhir: string; limitOffline: string; antrian: string; aksi: string[];
}
export const DEVICES: Device[] = [
  { kode: "KANTIN-01", layanan: "kantin", lokasi: "Kantin Utama", status: "online", terakhir: "baru saja", limitOffline: "25.000", antrian: "0", aksi: ["Rotasi key", "Nonaktifkan"] },
  { kode: "KANTIN-02", layanan: "kantin", lokasi: "Kantin Utama", status: "online", terakhir: "baru saja", limitOffline: "25.000", antrian: "0", aksi: ["Rotasi key", "Nonaktifkan"] },
  { kode: "TOPUP-TU", layanan: "topup", lokasi: "Tata Usaha", status: "offline", terakhir: "12.41", limitOffline: "—", antrian: "3", aksi: ["Lihat antrian"] },
  { kode: "LNDRY-01", layanan: "laundry", lokasi: "Asrama Putra", status: "online", terakhir: "baru saja", limitOffline: "0 (bayar wajib PIN)", antrian: "0", aksi: ["Rotasi key", "Nonaktifkan"] },
  { kode: "VEND-01", layanan: "vending", lokasi: "Gd. Akademik lt. 1", status: "online", terakhir: "baru saja", limitOffline: "0 (tanpa penjaga)", antrian: "—", aksi: ["Rotasi key", "Nonaktifkan"] },
  { kode: "VEND-02", layanan: "vending", lokasi: "Asrama Putra", status: "online", terakhir: "baru saja", limitOffline: "0", antrian: "—", aksi: ["Jam aktif", "Nonaktifkan"] },
  { kode: "PERPUS-01", layanan: "perpustakaan", lokasi: "Gd. Perpustakaan", status: "online", terakhir: "baru saja", limitOffline: "0 (denda wajib PIN)", antrian: "0", aksi: ["Rotasi key", "Nonaktifkan"] },
  { kode: "LOKER-A", layanan: "locker", lokasi: "Asrama Putra · 120 pintu", status: "online", terakhir: "baru saja", limitOffline: "— (akses, tanpa uang)", antrian: "0", aksi: ["Rotasi key", "Sinkron daftar kartu"] },
  { kode: "LOKER-B", layanan: "locker", lokasi: "Asrama Putri · 120 pintu", status: "online", terakhir: "baru saja", limitOffline: "—", antrian: "0", aksi: ["Rotasi key", "Sinkron daftar kartu"] },
  { kode: "LOKER-C", layanan: "locker", lokasi: "Gd. Akademik · 132 pintu", status: "cache", terakhir: "11.05", limitOffline: "—", antrian: "0", aksi: ["Paksa sinkron"] },
  { kode: "KANTIN-LAMA", layanan: "kantin", lokasi: "—", status: "nonaktif", terakhir: "12 Agu", limitOffline: "—", antrian: "—", aksi: [] },
];

/* ===== Laundry ===== */
export type StatusLaundry = "diterima" | "dicuci" | "siap" | "menunggak";
export interface OrderLaundry {
  order: string; siswa: string; ket: string; isi: string; masuk: string; rak: string;
  status: StatusLaundry; tagihanRp: number; hariTelat?: number;
}
export const ORDER_LAUNDRY: OrderLaundry[] = [
  { order: "LDY-0921", siswa: "Keenan Alvaro", ket: "8.B · Putra", isi: "4,0 kg kiloan", masuk: "01 Sep", rak: "—", status: "diterima", tagihanRp: 28000 },
  { order: "LDY-0920", siswa: "Bagas N. Ramadhan", ket: "12.A · Putra", isi: "3,0 kg + 1 jas (express)", masuk: "01 Sep", rak: "—", status: "dicuci", tagihanRp: 54000 },
  { order: "LDY-0912", siswa: "Rafif G. Wisanggeni", ket: "7.A · Putra", isi: "3,5 kg kiloan", masuk: "30 Agu", rak: "B-14", status: "siap", tagihanRp: 24500 },
  { order: "LDY-0907", siswa: "Alfian Pratama", ket: "10.A · Putra", isi: "2,5 kg + sepatu", masuk: "29 Agu", rak: "B-09", status: "siap", tagihanRp: 37500 },
  { order: "LDY-0871", siswa: "Davin Mahesa", ket: "alumni", isi: "2,0 kg kiloan", masuk: "22 Agu", rak: "A-02", status: "menunggak", tagihanRp: 14000, hariTelat: 10 },
];
export const TARIF_LAUNDRY = [
  { layanan: "Kiloan (min 2 kg)", tarif: "7.000 / kg" },
  { layanan: "Express — selesai 1 hari", tarif: "+50%" },
  { layanan: "Seragam (satuan)", tarif: "6.000" },
  { layanan: "Jas / blazer", tarif: "15.000" },
  { layanan: "Sepatu", tarif: "20.000" },
  { layanan: "Bed cover", tarif: "25.000" },
];

/* ===== Loker ===== */
export interface BlokLoker {
  jumlah: number; rusak: number[]; kosong: number[] | "pola"; area: string; biaya: string; nama: string[];
}
export const LOKER: Record<"A" | "B" | "C", BlokLoker> = {
  A: { jumlah: 120, rusak: [14, 52], kosong: [], area: "Asrama Putra", biaya: "Gratis — fasilitas asrama",
    nama: ["Fikri Ardiansyah · 9.A", "Raka Dwi Putra · 8.A", "Yusuf Maulana · 11.A", "Damar Aji Pangestu · 7.B", "Ilham Saputra · 10.B", "Farel Anggara · 12.A"] },
  B: { jumlah: 120, rusak: [77], kosong: [5, 19, 102], area: "Asrama Putri", biaya: "Gratis — fasilitas asrama",
    nama: ["Aqila Rahmadani · 7.A", "Zahra Amelia · 8.C", "Naura Safitri · 9.B", "Kirana Ayu · 10.A", "Talita Zahran · 11.B", "Dinda Permata · 12.B"] },
  C: { jumlah: 132, rusak: [21], kosong: "pola", area: "Gedung Akademik", biaya: "Gratis — fasilitas sekolah",
    nama: ["Keenan Alvaro · 8.B", "Salsabila Zahra · 11.B", "Bagas N. Ramadhan · 12.A", "Nayla Puspita · 9.C", "Alfian Pratama · 10.A", "Aishabilla Piliang · 7.A"] },
};
export type StatusLoker = "isi" | "kosong" | "rusak";
export function statusLoker(blok: "A" | "B" | "C", nomor: number): StatusLoker {
  const b = LOKER[blok];
  if (b.rusak.includes(nomor)) return "rusak";
  if (b.kosong === "pola" ? nomor % 5 === 0 && nomor <= 120 : b.kosong.includes(nomor)) return "kosong";
  return "isi";
}

/* ===== Perpustakaan ===== */
export const KATALOG = [
  { judul: "Bumi", pengarang: "Tere Liye", kategori: "Fiksi Indonesia", eks: 6, tersedia: 1 },
  { judul: "Laskar Pelangi", pengarang: "Andrea Hirata", kategori: "Fiksi Indonesia", eks: 5, tersedia: 3 },
  { judul: "Harry Potter and the Philosopher's Stone", pengarang: "J.K. Rowling", kategori: "Fiksi Inggris", eks: 4, tersedia: 2 },
  { judul: "Wonder", pengarang: "R.J. Palacio", kategori: "Fiksi Inggris", eks: 3, tersedia: 0 },
  { judul: "Diary of a Wimpy Kid", pengarang: "Jeff Kinney", kategori: "Fiksi Inggris", eks: 6, tersedia: 4 },
  { judul: "Sirah Nabawiyah untuk Remaja", pengarang: "—", kategori: "Agama", eks: 4, tersedia: 2 },
  { judul: "Ensiklopedia Sains Junior", pengarang: "—", kategori: "Referensi", eks: 2, tersedia: 2 },
];
export const PINJAMAN_AKTIF = [
  { siswa: "Keenan Alvaro", kelas: "8.B", buku: "Harry Potter #1", pinjam: "01 Sep", tempo: "08 Sep", status: "ok" as const },
  { siswa: "Aishabilla Piliang", kelas: "7.A", buku: "Laskar Pelangi", pinjam: "31 Agu", tempo: "07 Sep", status: "ok" as const },
  { siswa: "Rafif G. Wisanggeni", kelas: "7.A", buku: "Wonder", pinjam: "29 Agu", tempo: "05 Sep", status: "hampir" as const },
  { siswa: "Rafif G. Wisanggeni", kelas: "7.A", buku: "Bumi", pinjam: "22 Agu", tempo: "29 Agu", status: "telat" as const },
  { siswa: "Salsabila Zahra", kelas: "11.B", buku: "Atomic Habits for Teens", pinjam: "28 Agu", tempo: "11 Sep", status: "ok" as const },
];

/* ===== Vending ===== */
/** stok -1 = slot dinonaktifkan (sensor bermasalah) */
export interface SlotVending { slot: string; nama: string; hargaRp: number; stok: number; kapasitas: number }
export const VENDING: Record<"V1" | "V2", SlotVending[]> = {
  V1: [
    { slot: "A1", nama: "Air mineral 600 ml", hargaRp: 4000, stok: 18, kapasitas: 20 },
    { slot: "A2", nama: "Susu kotak", hargaRp: 6000, stok: 12, kapasitas: 15 },
    { slot: "A3", nama: "Roti cokelat", hargaRp: 8000, stok: 3, kapasitas: 12 },
    { slot: "A4", nama: "Yogurt drink", hargaRp: 7000, stok: 9, kapasitas: 12 },
    { slot: "B1", nama: "Isotonik", hargaRp: 7000, stok: 0, kapasitas: 12 },
    { slot: "B2", nama: "Keripik singkong", hargaRp: 5000, stok: 7, kapasitas: 15 },
    { slot: "B3", nama: "Biskuit gandum", hargaRp: 6000, stok: 11, kapasitas: 15 },
    { slot: "B4", nama: "Kacang panggang", hargaRp: 5000, stok: 6, kapasitas: 15 },
  ],
  V2: [
    { slot: "A1", nama: "Air mineral 600 ml", hargaRp: 4000, stok: 16, kapasitas: 20 },
    { slot: "A2", nama: "Susu kotak", hargaRp: 6000, stok: 14, kapasitas: 15 },
    { slot: "A3", nama: "Susu cokelat", hargaRp: 6000, stok: 2, kapasitas: 15 },
    { slot: "A4", nama: "Roti sobek", hargaRp: 8000, stok: 8, kapasitas: 12 },
    { slot: "B1", nama: "Yogurt drink", hargaRp: 7000, stok: 6, kapasitas: 12 },
    { slot: "B2", nama: "Biskuit gandum", hargaRp: 6000, stok: 13, kapasitas: 15 },
    { slot: "B3", nama: "Buah potong cup", hargaRp: 5000, stok: 4, kapasitas: 10 },
    { slot: "B4", nama: "Kacang panggang", hargaRp: 5000, stok: -1, kapasitas: 15 },
  ],
};

/* ===== PO kantin (untuk terminal kasir & portal) ===== */
export const PO_HARI_INI = [
  { kode: "PO-107", siswa: "Aishabilla Piliang", kelas: "7.A", isi: "Paket ayam + teh ×1 · Susu kotak ×1", totalRp: 21000, status: "siap" as const },
  { kode: "PO-101", siswa: "Salsabila Zahra", kelas: "11.B", isi: "Mie ayam bakso ×1", totalRp: 13000, status: "siap" as const },
  { kode: "PO-104", siswa: "Bagas N. Ramadhan", kelas: "12.A", isi: "Nasi ayam geprek ×2", totalRp: 24000, status: "diproses" as const },
];

/** Kartu contoh untuk simulasi tap di terminal kasir */
export const KARTU_SIM = {
  aisha: { nama: "Aishabilla Piliang", kelas: "7.A · SMP", foto: "AP", saldoRp: 86500, blokir: false },
  keenan: { nama: "Keenan Alvaro", kelas: "8.B · SMP", foto: "KA", saldoRp: 4000, blokir: false },
  rafif: { nama: "Rafif Gamma Wisanggeni", kelas: "7.A · SMP", foto: "RW", saldoRp: 200000, blokir: true },
} as const;
export type KunciKartu = keyof typeof KARTU_SIM;
