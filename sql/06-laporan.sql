-- ============================================================
-- 06-laporan.sql  |  Kantin SMK Negeri 1 Cimahi
-- Fungsi laporan penjualan untuk dashboard penjual.
-- Jalankan SETELAH file 01 sampai 05. Aman dijalankan ulang.
--
-- Aturan hitung:
--  - Penjualan = pesanan berstatus "selesai" (uang baru dianggap masuk
--    setelah pesanan diambil dan dibayar di kantin).
--  - Pesanan yang masih berjalan (diterima/diproses/siap diambil) dan
--    yang dibatalkan dihitung terpisah, tidak masuk pendapatan.
--  - Tanggal memakai tanggal WIB yang tersimpan di kolom pesanan.tanggal.
--  - Penjual hanya melihat laporan kantinnya sendiri.
-- ============================================================

create or replace function public.laporan_penjualan(p_dari date, p_sampai date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_kantin uuid := public.kantin_saya();
  v_ringkasan jsonb;
  v_per_hari jsonb;
  v_terlaris jsonb;
begin
  if not public.akun_aktif() or v_kantin is null then
    raise exception 'Hanya penjual dengan akun aktif yang boleh melihat laporan.';
  end if;
  if p_dari is null or p_sampai is null or p_dari > p_sampai then
    raise exception 'Rentang tanggal tidak valid.';
  end if;
  if p_sampai - p_dari > 92 then
    raise exception 'Rentang laporan paling lama 93 hari.';
  end if;

  select jsonb_build_object(
           'pesanan_selesai', count(*) filter (where status = 'selesai'),
           'pendapatan',      coalesce(sum(total) filter (where status = 'selesai'), 0),
           'cash',            count(*) filter (where status = 'selesai' and metode_bayar = 'cash'),
           'qris',            count(*) filter (where status = 'selesai' and metode_bayar = 'qris'),
           'dibatalkan',      count(*) filter (where status = 'dibatalkan'),
           'berjalan',        count(*) filter (where status in ('diterima', 'diproses', 'siap_diambil'))
         )
    into v_ringkasan
    from public.pesanan
   where kantin_id = v_kantin and tanggal between p_dari and p_sampai;

  -- Satu baris per hari, termasuk hari tanpa penjualan (angka 0)
  select coalesce(jsonb_agg(jsonb_build_object('tanggal', h.hari::date, 'pesanan', coalesce(d.jumlah, 0), 'pendapatan', coalesce(d.uang, 0)) order by h.hari), '[]'::jsonb)
    into v_per_hari
    from generate_series(p_dari, p_sampai, interval '1 day') as h(hari)
    left join (
      select tanggal, count(*) as jumlah, sum(total) as uang
        from public.pesanan
       where kantin_id = v_kantin and status = 'selesai' and tanggal between p_dari and p_sampai
       group by tanggal
    ) d on d.tanggal = h.hari::date;

  select coalesce(jsonb_agg(t order by t.jumlah desc, t.pendapatan desc, t.nama), '[]'::jsonb)
    into v_terlaris
    from (
      select i.nama_menu as nama, sum(i.jumlah)::int as jumlah, sum(i.jumlah * i.harga_satuan)::int as pendapatan
        from public.item_pesanan i
        join public.pesanan o on o.id = i.pesanan_id
       where o.kantin_id = v_kantin and o.status = 'selesai' and o.tanggal between p_dari and p_sampai
       group by i.nama_menu
       order by sum(i.jumlah) desc, sum(i.jumlah * i.harga_satuan) desc, i.nama_menu
       limit 10
    ) t;

  return jsonb_build_object('dari', p_dari, 'sampai', p_sampai,
                            'ringkasan', v_ringkasan, 'per_hari', v_per_hari, 'menu_terlaris', v_terlaris);
end;
$$;

revoke all on function public.laporan_penjualan(date, date) from public, anon;
grant execute on function public.laporan_penjualan(date, date) to authenticated;
