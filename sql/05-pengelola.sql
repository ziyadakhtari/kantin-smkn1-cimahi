-- ============================================================
-- 05-pengelola.sql  |  Kantin SMK Negeri 1 Cimahi
-- Fungsi untuk dashboard pengelola. Jalankan SETELAH file 01 sampai 04.
-- Aman dijalankan ulang.
-- Kedua fungsi menolak siapa pun yang bukan pengelola aktif.
-- ============================================================

-- A. Ringkasan: satu baris per kantin milik penjual yang sudah disetujui
create or replace function public.ringkasan_pengelola()
returns table (
  kantin_id         uuid,
  nama_kantin       text,
  nama_pemilik      text,
  sedang_buka       boolean,
  pesanan_hari_ini  bigint,   -- tidak termasuk yang dibatalkan
  pesanan_selesai   bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hari date := ((now() at time zone 'Asia/Jakarta')::date);
begin
  if not public.adalah_pengelola() then
    raise exception 'Hanya pengelola yang boleh melihat ringkasan.';
  end if;

  return query
  select k.id,
         k.nama,
         p.nama,
         k.sedang_buka,
         count(o.id) filter (where o.status <> 'dibatalkan'),
         count(o.id) filter (where o.status = 'selesai')
    from public.kantin k
    join public.profil p on p.id = k.pemilik_id
    left join public.pesanan o on o.kantin_id = k.id and o.tanggal = v_hari
   where p.status_akun = 'aktif'
   group by k.id, k.nama, p.nama, k.sedang_buka
   order by k.sedang_buka desc, k.nama;
end;
$$;

-- B. Daftar semua akun penjual dan pembeli, lengkap dengan email.
--    Email tersimpan di skema auth yang tidak bisa dibaca langsung dari browser,
--    jadi dibaca lewat fungsi ini.
create or replace function public.daftar_akun()
returns table (
  id             uuid,
  nama           text,
  email          text,
  no_hp          text,
  peran          text,
  jenis_pembeli  text,
  kelas_jurusan  text,
  status_akun    text,
  nama_kantin    text,
  dibuat_pada    timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.adalah_pengelola() then
    raise exception 'Hanya pengelola yang boleh melihat daftar akun.';
  end if;

  return query
  select p.id, p.nama, u.email::text, p.no_hp, p.peran, p.jenis_pembeli,
         p.kelas_jurusan, p.status_akun, k.nama, p.dibuat_pada
    from public.profil p
    join auth.users u on u.id = p.id
    left join public.kantin k on k.pemilik_id = p.id
   where p.peran <> 'pengelola'
   order by p.dibuat_pada desc;
end;
$$;

revoke all on function public.ringkasan_pengelola(), public.daftar_akun() from public, anon;
grant execute on function public.ringkasan_pengelola(), public.daftar_akun() to authenticated;
