-- ============================================================
-- 03-fungsi.sql  |  Kantin SMK Negeri 1 Cimahi
-- Fungsi database: pendaftaran otomatis, buat pesanan, ubah status.
-- Jalankan KETIGA.
-- ============================================================

-- ------------------------------------------------------------
-- A. Saat akun baru dibuat di Supabase Auth -> buat profil otomatis.
--    Peran hanya boleh 'penjual' atau 'pembeli'. Apa pun yang dikirim
--    dari frontend (termasuk 'pengelola') diubah menjadi 'pembeli'.
-- ------------------------------------------------------------
create or replace function public.tangani_pengguna_baru()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta   jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_peran  text  := coalesce(v_meta->>'peran', 'pembeli');
  v_nama   text  := coalesce(nullif(trim(v_meta->>'nama'), ''), 'Pengguna');
  v_jenis  text  := v_meta->>'jenis_pembeli';
begin
  if v_peran not in ('penjual', 'pembeli') then
    v_peran := 'pembeli';
  end if;
  if v_jenis is not null and v_jenis not in ('siswa', 'guru', 'pegawai') then
    v_jenis := null;
  end if;

  insert into public.profil (id, nama, no_hp, peran, jenis_pembeli, kelas_jurusan, status_akun)
  values (
    new.id,
    left(v_nama, 100),
    left(nullif(v_meta->>'no_hp', ''), 20),
    v_peran,
    case when v_peran = 'pembeli' then v_jenis end,
    case when v_peran = 'pembeli' and v_jenis = 'siswa'
         then left(nullif(v_meta->>'kelas_jurusan', ''), 50) end,
    case when v_peran = 'penjual' then 'menunggu' else 'aktif' end
  );

  if v_peran = 'penjual' then
    insert into public.kantin (pemilik_id, nama)
    values (new.id, left(coalesce(nullif(trim(v_meta->>'nama_kantin'), ''), 'Kantin ' || v_nama), 100));
  end if;

  return new;
end;
$$;

drop trigger if exists pada_pengguna_baru on auth.users;
create trigger pada_pengguna_baru
  after insert on auth.users
  for each row execute function public.tangani_pengguna_baru();

-- ------------------------------------------------------------
-- B. Fungsi internal: kembalikan stok saat pesanan dibatalkan.
--    Tidak bisa dipanggil dari frontend (hak execute dicabut di bawah).
-- ------------------------------------------------------------
create or replace function public._kembalikan_stok(p_pesanan_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.menu m
     set stok = m.stok + i.jumlah
    from public.item_pesanan i
   where i.pesanan_id = p_pesanan_id
     and i.menu_id = m.id
     and m.stok is not null
$$;

revoke all on function public._kembalikan_stok(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- C. BUAT PESANAN. Frontend hanya mengirim: kantin, metode bayar,
--    catatan, dan daftar [{menu_id, jumlah}]. Harga, total, stok,
--    dan nomor antrean semuanya dihitung di sini.
-- ------------------------------------------------------------
create or replace function public.buat_pesanan(
  p_kantin_id uuid,
  p_metode    text,
  p_catatan   text,
  p_item      jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_kantin     public.kantin%rowtype;
  v_menu       public.menu%rowtype;
  v_tanggal    date := ((now() at time zone 'Asia/Jakarta')::date);
  v_nomor      integer;
  v_total      integer := 0;
  v_pesanan_id uuid;
  r            record;
begin
  if v_uid is null then
    raise exception 'Silakan masuk dulu.';
  end if;

  if not exists (
    select 1 from public.profil
    where id = v_uid and peran = 'pembeli' and status_akun = 'aktif'
  ) then
    raise exception 'Hanya pembeli dengan akun aktif yang bisa memesan.';
  end if;

  if p_metode not in ('cash', 'qris') then
    raise exception 'Metode bayar tidak valid.';
  end if;

  if p_item is null or jsonb_typeof(p_item) <> 'array' or jsonb_array_length(p_item) = 0 then
    raise exception 'Keranjang masih kosong.';
  end if;
  if jsonb_array_length(p_item) > 50 then
    raise exception 'Terlalu banyak menu dalam satu pesanan.';
  end if;

  select * into v_kantin from public.kantin where id = p_kantin_id;
  if not found or not public.pemilik_aktif(v_kantin.pemilik_id) then
    raise exception 'Kantin tidak ditemukan.';
  end if;
  if not v_kantin.sedang_buka then
    raise exception 'Kantin sedang tutup.';
  end if;
  if p_metode = 'qris' and v_kantin.url_qris is null then
    raise exception 'Kantin ini belum menyediakan QRIS.';
  end if;

  -- Nomor antrean: urut per kantin, kembali ke 1 setiap hari (WIB). Atomik.
  insert into public.antrean_harian (kantin_id, tanggal, terakhir)
  values (p_kantin_id, v_tanggal, 1)
  on conflict (kantin_id, tanggal)
  do update set terakhir = public.antrean_harian.terakhir + 1
  returning terakhir into v_nomor;

  insert into public.pesanan (pembeli_id, kantin_id, tanggal, nomor_antrean, metode_bayar, catatan, total)
  values (v_uid, p_kantin_id, v_tanggal, v_nomor, p_metode, left(nullif(trim(p_catatan), ''), 300), 0)
  returning id into v_pesanan_id;

  -- Urut menu_id agar kunci baris selalu dalam urutan sama (mencegah deadlock).
  for r in
    select (e->>'menu_id')::uuid as menu_id,
           sum((e->>'jumlah')::integer) as jumlah
      from jsonb_array_elements(p_item) as e
     group by 1
     order by 1
  loop
    if r.jumlah < 1 or r.jumlah > 99 then
      raise exception 'Jumlah menu tidak valid.';
    end if;

    select * into v_menu
      from public.menu
     where id = r.menu_id and kantin_id = p_kantin_id
       for update;
    if not found then
      raise exception 'Ada menu yang tidak tersedia di kantin ini.';
    end if;

    if v_menu.habis or (v_menu.stok is not null and v_menu.stok < r.jumlah) then
      raise exception 'Menu "%" sudah habis atau stoknya kurang.', v_menu.nama;
    end if;

    insert into public.item_pesanan (pesanan_id, menu_id, nama_menu, jumlah, harga_satuan)
    values (v_pesanan_id, v_menu.id, v_menu.nama, r.jumlah, v_menu.harga);   -- harga dari database

    if v_menu.stok is not null then
      update public.menu set stok = stok - r.jumlah where id = v_menu.id;
    end if;

    v_total := v_total + v_menu.harga * r.jumlah;
  end loop;

  update public.pesanan set total = v_total where id = v_pesanan_id;

  return jsonb_build_object('id', v_pesanan_id, 'nomor_antrean', v_nomor, 'total', v_total);
end;
$$;

-- ------------------------------------------------------------
-- D. UBAH STATUS PESANAN (oleh penjual pemilik kantin)
--    diterima -> diproses -> siap_diambil -> selesai
--    Penjual juga boleh membatalkan sebelum selesai (stok dikembalikan).
-- ------------------------------------------------------------
create or replace function public.ubah_status_pesanan(p_pesanan_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pesanan public.pesanan%rowtype;
begin
  if not public.akun_aktif() then
    raise exception 'Akun belum aktif.';
  end if;

  select * into v_pesanan from public.pesanan where id = p_pesanan_id for update;
  if not found or v_pesanan.kantin_id is distinct from public.kantin_saya() then
    raise exception 'Pesanan tidak ditemukan.';
  end if;

  if not (
       (v_pesanan.status = 'diterima'     and p_status in ('diproses', 'dibatalkan'))
    or (v_pesanan.status = 'diproses'     and p_status in ('siap_diambil', 'dibatalkan'))
    or (v_pesanan.status = 'siap_diambil' and p_status in ('selesai', 'dibatalkan'))
  ) then
    raise exception 'Status tidak bisa diubah dari "%" ke "%".', v_pesanan.status, p_status;
  end if;

  update public.pesanan set status = p_status, diperbarui_pada = now() where id = p_pesanan_id;

  if p_status = 'dibatalkan' then
    perform public._kembalikan_stok(p_pesanan_id);
  end if;
end;
$$;

-- ------------------------------------------------------------
-- E. PEMBELI MEMBATALKAN PESANAN (hanya selama status "diterima")
-- ------------------------------------------------------------
create or replace function public.batalkan_pesanan(p_pesanan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pesanan public.pesanan%rowtype;
begin
  select * into v_pesanan from public.pesanan
   where id = p_pesanan_id and pembeli_id = auth.uid()
     for update;
  if not found then
    raise exception 'Pesanan tidak ditemukan.';
  end if;
  if v_pesanan.status <> 'diterima' then
    raise exception 'Pesanan sudah diproses, tidak bisa dibatalkan.';
  end if;

  update public.pesanan set status = 'dibatalkan', diperbarui_pada = now() where id = p_pesanan_id;
  perform public._kembalikan_stok(p_pesanan_id);
end;
$$;

-- ------------------------------------------------------------
-- F. PENGELOLA: setujui / tolak / nonaktifkan / aktifkan akun
-- ------------------------------------------------------------
create or replace function public.atur_status_akun(p_user_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profil%rowtype;
begin
  if not public.adalah_pengelola() then
    raise exception 'Hanya pengelola yang boleh mengubah status akun.';
  end if;
  if p_status not in ('aktif', 'ditolak', 'nonaktif') then
    raise exception 'Status tidak valid.';
  end if;

  select * into v_target from public.profil where id = p_user_id;
  if not found then
    raise exception 'Akun tidak ditemukan.';
  end if;
  if v_target.peran = 'pengelola' then
    raise exception 'Akun pengelola tidak bisa diubah dari sini.';
  end if;
  if p_status = 'ditolak' and v_target.peran <> 'penjual' then
    raise exception 'Hanya pendaftaran penjual yang bisa ditolak.';
  end if;

  update public.profil set status_akun = p_status where id = p_user_id;

  -- Penjual yang tidak aktif: kantinnya otomatis ditutup.
  if p_status <> 'aktif' then
    update public.kantin set sedang_buka = false where pemilik_id = p_user_id;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- Hak execute: hanya pengguna yang sudah masuk (authenticated).
-- ------------------------------------------------------------
revoke all on function
  public.buat_pesanan(uuid, text, text, jsonb),
  public.ubah_status_pesanan(uuid, text),
  public.batalkan_pesanan(uuid),
  public.atur_status_akun(uuid, text)
from public, anon;

grant execute on function
  public.buat_pesanan(uuid, text, text, jsonb),
  public.ubah_status_pesanan(uuid, text),
  public.batalkan_pesanan(uuid),
  public.atur_status_akun(uuid, text)
to authenticated;
