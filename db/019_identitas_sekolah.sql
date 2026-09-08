-- =====================================================================
-- 019_identitas_sekolah.sql: Pengaturan Identitas & Logo Sekolah
-- =====================================================================
-- Menyimpan nama resmi sekolah, nama singkat/brand, logo portrait (kotak),
-- dan logo landscape (horizontal/banner) di tabel kebijakan.
-- =====================================================================

INSERT INTO kebijakan (kunci, nilai, keterangan) VALUES
('sekolah_nama',           '"Semesta Bilingual Boarding School"', 'Nama resmi sekolah / yayasan'),
('sekolah_nama_singkat',   '"Smart Campus"',                      'Nama singkat / brand aplikasi'),
('sekolah_logo_portrait',  'null',                                'Data URL logo sekolah format portrait / kotak (1:1)'),
('sekolah_logo_landscape', 'null',                                'Data URL logo sekolah format landscape / horizontal')
ON CONFLICT (kunci) DO NOTHING;
