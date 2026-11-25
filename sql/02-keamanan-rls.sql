-- ============================================================
-- 02-keamanan-rls.sql  |  Kantin SMK Negeri 1 Cimahi
-- Row Level Security (RLS) + hak akses. Jalankan KEDUA.
-- RLS = aturan di database tentang baris mana yang boleh dilihat/diubah
-- oleh siapa. Ini yang benar-benar melindungi data, bukan kode frontend.
-- ============================================================

-- ---------- Fungsi bantu (dipakai oleh aturan di bawah) ----------
-- "security definer" = berjalan dengan hak pemilik fungsi, supaya aturan
-- tidak saling memanggil tanpa akhir. search_path dikunci demi keamanan.

create or replace function public.akun_aktif()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select status_akun = 'aktif' from public.profil where id = auth.uid()), false)
$$;

create or replace function public.adalah_pengelola()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profil
    where id = auth.uid() and peran = 'pengelola' and status_akun = 'aktif'
  )
$$;

create or replace function public.kantin_saya()
returns uuid language sql stable security definer set search_path = ''
as $$
  select id from public.kantin where pemilik_id = auth.uid()
$$;

create or replace function public.pemilik_aktif(p_pemilik uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profil where id = p_pemilik and status_akun = 'aktif')
$$;

revoke all on function public.akun_aktif(), public.adalah_pengelola(),
  public.kantin_saya(), public.pemilik_aktif(uuid) from public, anon;
grant execute on function public.akun_aktif(), public.adalah_pengelola(),
  public.kantin_saya(), public.pemilik_aktif(uuid) to authenticated;

-- ---------- Aktifkan RLS di SEMUA tabel ----------
alter table public.profil         enable row level security;
alter table public.kantin         enable row level security;
alter table public.menu           enable row level security;
alter table public.pesanan        enable row level security;
alter table public.item_pesanan   enable row level security;
alter table public.pengumuman     enable row level security;
alter table public.antrean_harian enable row level security;

-- ---------- Hak akses tingkat kolom ----------
-- Mulai dari nol, lalu beri hanya yang perlu.
revoke all on public.profil, public.kantin, public.menu, public.pesanan,
  public.item_pesanan, public.pengumuman, public.antrean_harian
  from anon, authenticated;

grant select on public.profil, public.kantin, public.menu, public.pesanan,
  public.item_pesanan, public.pengumuman to authenticated;
grant select on public.pengumuman to anon;

-- Pengguna HANYA boleh mengubah kolom ini di profilnya sendiri.
-- Kolom "peran" dan "status_akun" tidak ada di daftar -> tidak bisa diubah sendiri.
grant update (nama, no_hp, jenis_pembeli, kelas_jurusan) on public.profil to authenticated;

-- Pemilik hanya boleh mengubah kolom ini di kantinnya.
grant update (nama, deskripsi, sedang_buka, url_qris) on public.kantin to authenticated;

grant insert, update, delete on public.menu to authenticated;
grant insert, update, delete on public.pengumuman to authenticated;
-- pesanan & item_pesanan: tidak ada insert/update langsung.
-- Semua lewat fungsi di 03-fungsi.sql (harga & stok dihitung di database).

-- ---------- PROFIL ----------
drop policy if exists profil_baca on public.profil;
create policy profil_baca on public.profil for select to authenticated
using (
  id = auth.uid()
  or public.adalah_pengelola()
  or exists (   -- penjual boleh melihat nama pembeli yang memesan di kantinnya
    select 1 from public.pesanan p
    where p.pembeli_id = profil.id and p.kantin_id = public.kantin_saya()
  )
);

drop policy if exists profil_ubah_sendiri on public.profil;
create policy profil_ubah_sendiri on public.profil for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

-- ---------- KANTIN ----------
drop policy if exists kantin_baca on public.kantin;
create policy kantin_baca on public.kantin for select to authenticated
using (
  pemilik_id = auth.uid()
  or public.adalah_pengelola()
  or public.pemilik_aktif(pemilik_id)     -- pembeli hanya melihat kantin milik penjual yang disetujui
);

drop policy if exists kantin_ubah on public.kantin;
create policy kantin_ubah on public.kantin for update to authenticated
using (pemilik_id = auth.uid() and public.akun_aktif())
with check (pemilik_id = auth.uid() and public.akun_aktif());

-- ---------- MENU ----------
drop policy if exists menu_baca on public.menu;
create policy menu_baca on public.menu for select to authenticated
using (exists (select 1 from public.kantin k where k.id = menu.kantin_id));  -- ikut aturan kantin

drop policy if exists menu_tambah on public.menu;
create policy menu_tambah on public.menu for insert to authenticated
with check (kantin_id = public.kantin_saya() and public.akun_aktif());

drop policy if exists menu_ubah on public.menu;
create policy menu_ubah on public.menu for update to authenticated
using (kantin_id = public.kantin_saya() and public.akun_aktif())
with check (kantin_id = public.kantin_saya() and public.akun_aktif());

drop policy if exists menu_hapus on public.menu;
create policy menu_hapus on public.menu for delete to authenticated
using (kantin_id = public.kantin_saya() and public.akun_aktif());

-- ---------- PESANAN ----------
drop policy if exists pesanan_baca on public.pesanan;
create policy pesanan_baca on public.pesanan for select to authenticated
using (
  pembeli_id = auth.uid()
  or kantin_id = public.kantin_saya()
  or public.adalah_pengelola()
);

-- ---------- ITEM PESANAN ----------
drop policy if exists item_pesanan_baca on public.item_pesanan;
create policy item_pesanan_baca on public.item_pesanan for select to authenticated
using (exists (select 1 from public.pesanan p where p.id = item_pesanan.pesanan_id));  -- ikut aturan pesanan

-- ---------- PENGUMUMAN ----------
drop policy if exists pengumuman_baca_umum on public.pengumuman;
create policy pengumuman_baca_umum on public.pengumuman for select to anon, authenticated
using (aktif = true);

drop policy if exists pengumuman_baca_pengelola on public.pengumuman;
create policy pengumuman_baca_pengelola on public.pengumuman for select to authenticated
using (public.adalah_pengelola());

drop policy if exists pengumuman_tulis on public.pengumuman;
create policy pengumuman_tulis on public.pengumuman for all to authenticated
using (public.adalah_pengelola()) with check (public.adalah_pengelola());

-- ---------- ANTREAN_HARIAN ----------
-- Sengaja tanpa aturan apa pun: tidak ada pengguna yang boleh menyentuhnya langsung.
