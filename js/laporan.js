/* ============================================================
   laporan.js  |  Dashboard penjual: Laporan Penjualan
   Angka dihitung di database oleh fungsi laporan_penjualan()
   (sql/06-laporan.sql), jadi tetap benar walau pesanan sangat banyak.
   Penjualan = pesanan berstatus "selesai".
   ============================================================ */
(function () {
  'use strict';

  var $ = Alat.$, buat = Alat.buat, pesan = Alat.pesan;
  var HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  var BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var MAKS_HARI = 93;     // sama dengan batas di fungsi database

  var pilihan = 'hari-ini';
  var nomorMuat = 0;      // hanya hasil permintaan terakhir yang ditampilkan

  /* ---------- Tanggal (selalu waktu Indonesia Barat) ---------- */
  function hariIniWIB() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); }   // YYYY-MM-DD
  function geser(tgl, hari) {
    var d = new Date(tgl + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + hari);
    return d.toISOString().slice(0, 10);
  }
  function selisihHari(dari, sampai) { return Math.round((new Date(sampai + 'T00:00:00Z') - new Date(dari + 'T00:00:00Z')) / 86400000); }
  function labelTanggal(tgl, panjang) {
    var d = new Date(tgl + 'T00:00:00Z');
    var isi = d.getUTCDate() + ' ' + BULAN[d.getUTCMonth()];
    return panjang ? HARI[d.getUTCDay()] + ', ' + isi + ' ' + d.getUTCFullYear() : HARI[d.getUTCDay()] + ' ' + isi;
  }

  function rentang() {
    var hari = hariIniWIB();
    if (pilihan === 'hari-ini') return { dari: hari, sampai: hari };
    if (pilihan === '7-hari') return { dari: geser(hari, -6), sampai: hari };
    if (pilihan === '30-hari') return { dari: geser(hari, -29), sampai: hari };
    return { dari: $('lap-dari').value, sampai: $('lap-sampai').value };
  }

  /* ---------- Menggambar ---------- */
  function sel(angka, label, kelas) {
    var d = buat('div', kelas || '');
    d.appendChild(buat('span', 'statistik-angka', angka));
    d.appendChild(buat('span', 'statistik-label', label));
    return d;
  }

  function batang(nilai, maks) {
    var b = buat('span', 'batang'); b.setAttribute('aria-hidden', 'true');
    var isi = buat('span', 'batang-isi');
    isi.style.width = (maks > 0 ? Math.max(nilai > 0 ? 2 : 0, Math.round(nilai / maks * 100)) : 0) + '%';
    b.appendChild(isi);
    return b;
  }

  function gambar(data) {
    var wadah = $('isi-laporan');
    wadah.textContent = '';
    var r = data.ringkasan;

    var teksRentang = data.dari === data.sampai ? labelTanggal(data.dari, true) : labelTanggal(data.dari, true) + ' sampai ' + labelTanggal(data.sampai, true);
    $('rentang-teks').textContent = 'Menampilkan: ' + teksRentang + '.';

    var rata = r.pesanan_selesai > 0 ? Math.round(r.pendapatan / r.pesanan_selesai) : 0;
    var stat = buat('div', 'statistik');
    stat.appendChild(sel(Alat.rupiah(r.pendapatan), 'Pendapatan dari pesanan selesai'));
    stat.appendChild(sel(String(r.pesanan_selesai), 'Pesanan selesai'));
    stat.appendChild(sel(Alat.rupiah(rata), 'Rata-rata tiap pesanan'));
    wadah.appendChild(stat);

    // Rincian kecil: cara bayar dan pesanan yang tidak masuk pendapatan
    var rinci = buat('dl', 'rincian-laporan');
    [['Dibayar Cash', r.cash + ' pesanan'], ['Dibayar QRIS', r.qris + ' pesanan'],
     ['Dibatalkan', r.dibatalkan + ' pesanan'], ['Masih berjalan', r.berjalan + ' pesanan']].forEach(function (x) {
      var d = buat('div');
      d.appendChild(buat('dt', '', x[0]));
      d.appendChild(buat('dd', '', x[1]));
      rinci.appendChild(d);
    });
    wadah.appendChild(rinci);

    if (r.pesanan_selesai === 0) {
      wadah.appendChild(Alat.kosong('Belum ada penjualan di rentang ini',
        r.berjalan > 0 ? 'Ada pesanan yang masih berjalan. Pendapatan dihitung setelah pesanan ditandai Selesai.' : 'Pilih rentang tanggal lain, atau tunggu pesanan pertama selesai.'));
      return;
    }

    /* Penjualan per hari */
    wadah.appendChild(buat('h3', 'sub-judul', 'Penjualan per hari'));
    var maksUang = data.per_hari.reduce(function (a, x) { return Math.max(a, x.pendapatan); }, 0);
    var daftar = buat('ul', 'baris-batang');
    data.per_hari.forEach(function (x) {
      var li = buat('li', x.pesanan === 0 ? 'kosong-hari' : '');
      li.appendChild(buat('span', 'batang-label', labelTanggal(x.tanggal)));
      li.appendChild(batang(x.pendapatan, maksUang));
      li.appendChild(buat('span', 'batang-nilai', x.pesanan === 0 ? 'Tidak ada' : Alat.rupiah(x.pendapatan) + ' (' + x.pesanan + ')'));
      daftar.appendChild(li);
    });
    wadah.appendChild(daftar);
    wadah.appendChild(buat('p', 'kecil', 'Angka dalam kurung adalah jumlah pesanan selesai.'));

    /* Menu terlaris: urutan peringkat yang nyata, jadi memakai daftar bernomor */
    wadah.appendChild(buat('h3', 'sub-judul', 'Menu terlaris'));
    if (!data.menu_terlaris.length) { wadah.appendChild(buat('p', 'kecil', 'Belum ada data menu.')); return; }
    var maksPorsi = data.menu_terlaris.reduce(function (a, x) { return Math.max(a, x.jumlah); }, 0);
    var ol = buat('ol', 'baris-batang peringkat');
    data.menu_terlaris.forEach(function (x) {
      var li = buat('li');
      li.appendChild(buat('span', 'batang-label', x.nama));
      li.appendChild(batang(x.jumlah, maksPorsi));
      li.appendChild(buat('span', 'batang-nilai', x.jumlah + ' porsi, ' + Alat.rupiah(x.pendapatan)));
      ol.appendChild(li);
    });
    wadah.appendChild(ol);
    wadah.appendChild(buat('p', 'kecil', 'Maksimal 10 menu teratas, diurutkan dari jumlah porsi terbanyak.'));
  }

  /* ---------- Memuat ---------- */
  function muat() {
    var r = rentang();
    pesan('pesan-laporan', '');
    if (!r.dari || !r.sampai) return pesan('pesan-laporan', 'Isi tanggal mulai dan tanggal akhir.');
    if (r.dari > r.sampai) return pesan('pesan-laporan', 'Tanggal mulai tidak boleh setelah tanggal akhir.');
    if (selisihHari(r.dari, r.sampai) >= MAKS_HARI) return pesan('pesan-laporan', 'Rentang paling lama ' + MAKS_HARI + ' hari. Persempit tanggalnya.');

    var nomor = ++nomorMuat;
    $('isi-laporan').setAttribute('aria-busy', 'true');
    db.rpc('laporan_penjualan', { p_dari: r.dari, p_sampai: r.sampai }).then(function (h) {
      if (nomor !== nomorMuat) return;               // ada permintaan yang lebih baru
      $('isi-laporan').removeAttribute('aria-busy');
      if (h.error) {
        var tidakAda = /laporan_penjualan|schema cache|does not exist/i.test(h.error.message || '');
        return pesan('pesan-laporan', h.error.code === 'P0001' ? h.error.message
          : (tidakAda ? 'Fitur laporan belum dipasang di database. Jalankan sql/06-laporan.sql di Supabase.' : Alat.galatRamah(h.error)));
      }
      gambar(h.data);
    }, function (g) {
      if (nomor !== nomorMuat) return;
      $('isi-laporan').removeAttribute('aria-busy');
      pesan('pesan-laporan', Alat.galatRamah(g));
    });
  }

  function mulai() {
    var hari = hariIniWIB();
    $('lap-dari').value = geser(hari, -6); $('lap-sampai').value = hari;
    $('lap-sampai').max = hari; $('lap-dari').max = hari;

    document.querySelectorAll('[data-rentang]').forEach(function (b) {
      b.addEventListener('click', function () {
        pilihan = b.getAttribute('data-rentang');
        document.querySelectorAll('[data-rentang]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        $('form-rentang').hidden = pilihan !== 'tanggal';
        if (pilihan !== 'tanggal') muat();
      });
    });
    $('form-rentang').addEventListener('submit', function (e) { e.preventDefault(); muat(); });
    $('tombol-segarkan-laporan').addEventListener('click', muat);
    muat();
  }

  // Dijalankan setelah penjual terverifikasi (fungsi database juga memeriksanya lagi)
  if (window.profilSaya) mulai();
  else document.addEventListener('profil-siap', mulai);
})();
