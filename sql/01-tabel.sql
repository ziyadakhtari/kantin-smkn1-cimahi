-- ============================================================
-- 01-tabel.sql  |  Kantin SMK Negeri 1 Cimahi
-- Membuat semua tabel. Jalankan PERTAMA di Supabase > SQL Editor.
-- Aman dijalankan ulang (memakai "if not exists").
-- ============================================================

-- 1. PROFIL: satu baris untuk setiap akun (pengelola, penjual, pembeli)
create table if not exists public.profil (
  id             uuid primary key references auth.users(id) on delete cascade,
  nama           text not null,
  no_hp          text,
  peran          text not null default 'pembeli'
                   check (peran in ('pengelola', 'penjual', 'pembeli')),
  jenis_pembeli  text check (jenis_pembeli in ('siswa', 'guru', 'pegawai')),
  kelas_jurusan  text,
  status_akun    text not null default 'aktif'
                   check (status_akun in ('menunggu', 'aktif', 'ditolak', 'nonaktif')),
  dibuat_pada    timestamptz not null default now()
);

-- 2. KANTIN: satu penjual memiliki satu kantin/lapak
create table if not exists public.kantin (
  id           uuid primary key default gen_random_uuid(),
  pemilik_id   uuid not null unique references public.profil(id) on delete cascade,
  nama         text not null,
  deskripsi    text,
  sedang_buka  boolean not null default false,
  url_qris     text,
  dibuat_pada  timestamptz not null default now()
);

-- 3. MENU
-- stok kosong (null) = tidak dibatasi; penjual cukup memakai tombol "Habis".
create table if not exists public.menu (
  id           uuid primary key default gen_random_uuid(),
  kantin_id    uuid not null references public.kantin(id) on delete cascade,
  nama         text not null,
  deskripsi    text,
  harga        integer not null check (harga >= 0),
  kategori     text not null check (kategori in ('makanan_berat', 'jajanan', 'minuman')),
  stok         integer check (stok is null or stok >= 0),
  habis        boolean not null default false,
  url_foto     text,
  dibuat_pada  timestamptz not null default now()
);
create index if not exists menu_kantin_idx on public.menu (kantin_id);

-- Jika stok mencapai 0, menu otomatis berstatus habis.
-- Jika stok diisi lagi dari 0, status habis otomatis dilepas.
create or replace function public.menu_sinkron_habis()
returns trigger
language plpgsql
as $$
begin
  if new.stok is not null and new.stok = 0 then
    new.habis := true;
  elsif tg_op = 'UPDATE'
        and old.stok is not null and old.stok = 0
        and new.stok is distinct from old.stok
        and new.habis = old.habis then
    new.habis := false;
  end if;
  return new;
end;
$$;

drop trigger if exists menu_sinkron_habis on public.menu;
create trigger menu_sinkron_habis
  before insert or update on public.menu
  for each row execute function public.menu_sinkron_habis();

-- 4. PESANAN
create table if not exists public.pesanan (
  id                uuid primary key default gen_random_uuid(),
  pembeli_id        uuid not null references public.profil(id),
  kantin_id         uuid not null references public.kantin(id),
  tanggal           date not null default ((now() at time zone 'Asia/Jakarta')::date),
  nomor_antrean     integer not null,
  status            text not null default 'diterima'
                      check (status in ('diterima', 'diproses', 'siap_diambil', 'selesai', 'dibatalkan')),
  metode_bayar      text not null check (metode_bayar in ('cash', 'qris')),
  catatan           text,
  total             integer not null default 0 check (total >= 0),
  dibuat_pada       timestamptz not null default now(),
  diperbarui_pada   timestamptz not null default now(),
  unique (kantin_id, tanggal, nomor_antrean)
);
create index if not exists pesanan_pembeli_idx on public.pesanan (pembeli_id, dibuat_pada desc);
create index if not exists pesanan_kantin_idx  on public.pesanan (kantin_id, tanggal, status);

-- 5. ITEM PESANAN
-- nama_menu disalin saat memesan supaya riwayat tetap utuh walau menu dihapus.
create table if not exists public.item_pesanan (
  id             uuid primary key default gen_random_uuid(),
  pesanan_id     uuid not null references public.pesanan(id) on delete cascade,
  menu_id        uuid references public.menu(id) on delete set null,
  nama_menu      text not null,
  jumlah         integer not null check (jumlah > 0),
  harga_satuan   integer not null check (harga_satuan >= 0)
);
create index if not exists item_pesanan_pesanan_idx on public.item_pesanan (pesanan_id);

-- 6. PENGUMUMAN
create table if not exists public.pengumuman (
  id           uuid primary key default gen_random_uuid(),
  isi          text not null check (char_length(isi) between 1 and 300),
  aktif        boolean not null default true,
  dibuat_oleh  uuid references public.profil(id) on delete set null,
  dibuat_pada  timestamptz not null default now()
);

-- 7. ANTREAN_HARIAN (tabel bantu): nomor antrean terakhir per kantin per hari
create table if not exists public.antrean_harian (
  kantin_id  uuid not null references public.kantin(id) on delete cascade,
  tanggal    date not null,
  terakhir   integer not null default 0,
  primary key (kantin_id, tanggal)
);
