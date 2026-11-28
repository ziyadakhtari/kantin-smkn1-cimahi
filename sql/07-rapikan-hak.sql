-- ============================================================
-- 07-rapikan-hak.sql  |  Perapian hak akses sebelum dipakai
-- Mencabut hak EXECUTE dari dua fungsi trigger.
-- Fungsi trigger memang tidak bisa dipanggil lewat RPC, tetapi
-- sebaiknya tidak ada fungsi yang terbuka tanpa perlu.
-- Trigger tetap berjalan normal: hak EXECUTE hanya diperiksa
-- saat trigger dibuat, bukan saat trigger dijalankan.
-- Aman dijalankan berulang kali.
-- ============================================================

revoke all on function public.menu_sinkron_habis()      from public, anon, authenticated;
revoke all on function public.tangani_pengguna_baru()   from public, anon, authenticated;
