\pset pager off
SELECT berkas, COUNT(*) FILTER (WHERE lolos) AS lolos, COUNT(*) FILTER (WHERE NOT lolos) AS gagal
  FROM uji_hasil GROUP BY berkas ORDER BY berkas;
\echo '--- yang GAGAL (kosong = semua lolos) ---'
SELECT no, berkas, nama, pesan FROM uji_hasil WHERE NOT lolos ORDER BY no;
SELECT COUNT(*) FILTER (WHERE NOT lolos) > 0 AS gagal FROM uji_hasil \gset
\if :gagal
  \echo 'ADA UJI GAGAL'
  \set ON_ERROR_STOP on
  DO $$ BEGIN RAISE EXCEPTION 'ADA UJI GAGAL'; END $$;
\endif
\echo 'SEMUA UJI LOLOS'
