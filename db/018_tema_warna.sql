-- =====================================================================
-- 018_tema_warna.sql: Pengaturan Tema Warna Sistem Global
-- =====================================================================
-- Menyimpan konfigurasi palet warna antarmuka (accent, sidebar, soft, ink)
-- yang dapat dikonfigurasi langsung dari Dashboard Admin (Kebijakan).
-- =====================================================================

INSERT INTO kebijakan (kunci, nilai, keterangan) VALUES
('tema_warna', '{
  "id": "emerald",
  "nama": "Hijau Semesta (Default)",
  "accent": "#146c4f",
  "accent_ink": "#0f553e",
  "accent_soft": "#e3eee7",
  "side_bg": "#10231b",
  "side_ink": "#cfe0d7",
  "side_ink_2": "#7e968b",
  "side_active": "#1c3a2e"
}'::jsonb, 'Konfigurasi tema warna sistem global: accent, sidebar, dan aksen turunan')
ON CONFLICT (kunci) DO NOTHING;
