-- ============================================================
-- 04-storage-realtime.sql  |  Kantin SMK Negeri 1 Cimahi
-- Penyimpanan foto (menu & QRIS) dan Realtime. Jalankan KEEMPAT.
-- ============================================================

-- ---------- Penyimpanan foto ----------
-- Bucket publik: siapa pun yang punya tautan boleh MELIHAT gambar.
-- Mengunggah/mengubah/menghapus hanya untuk pemilik kantin, dan hanya di
-- folder bernama sesuai id kantinnya. Contoh jalur: <id-kantin>/nasi-goreng.webp
-- Batas 2 MB dan hanya JPG/PNG/WebP.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('foto-menu', 'foto-menu', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('qris',      'qris',      true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "penjual unggah ke folder kantinnya" on storage.objects;
create policy "penjual unggah ke folder kantinnya" on storage.objects
for insert to authenticated
with check (
  bucket_id in ('foto-menu', 'qris')
  and (storage.foldername(name))[1] = public.kantin_saya()::text
  and public.akun_aktif()
);

drop policy if exists "penjual ubah file kantinnya" on storage.objects;
create policy "penjual ubah file kantinnya" on storage.objects
for update to authenticated
using (
  bucket_id in ('foto-menu', 'qris')
  and (storage.foldername(name))[1] = public.kantin_saya()::text
  and public.akun_aktif()
);

drop policy if exists "penjual hapus file kantinnya" on storage.objects;
create policy "penjual hapus file kantinnya" on storage.objects
for delete to authenticated
using (
  bucket_id in ('foto-menu', 'qris')
  and (storage.foldername(name))[1] = public.kantin_saya()::text
  and public.akun_aktif()
);

-- ---------- Realtime ----------
-- Perubahan pada tabel-tabel ini dikirim langsung ke browser.
-- Realtime tetap mengikuti RLS: pembeli hanya menerima pesanannya sendiri.
-- Jika muncul error "already member of publication", abaikan saja.
alter publication supabase_realtime add table
  public.pesanan, public.menu, public.kantin, public.pengumuman;
