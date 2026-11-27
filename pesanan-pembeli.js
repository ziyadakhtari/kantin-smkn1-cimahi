/* ============================================================
   pesanan-pembeli.js  |  Dashboard pembeli: Pesanan Aktif dan Riwayat
   - Pesanan Aktif: nomor antrean, alur status (realtime), batalkan
   - Riwayat: pesanan selesai/dibatalkan, detail, "muat lebih banyak"
   Pembeli hanya bisa membaca pesanannya sendiri (RLS). Pembatalan
   dicek lagi di database: hanya boleh saat status masih "diterima".
   ============================================================ */
(function () {
  'use strict';

  var $ = Alat.$, buat = Alat.buat, pesan = Alat.pesan;

  var STATUS = { diterima: 'Diterima', diproses: 'Diproses', siap_diambil: 'Siap diambil', selesai: 'Selesai', dibatalkan: 'Dibatalkan' };
  var URUTAN = ['diterima', 'diproses', 'siap_diambil', 'selesai'];
  var KETERANGAN = {
    diterima: 'Pesananmu sudah diterima. Menunggu penjual memprosesnya.',
    diproses: 'Pesananmu sedang disiapkan oleh penjual.',
    siap_diambil: 'Pesananmu sudah siap. Ambil di kantin dan sebutkan nomor antreanmu.'
  };
  var NAMA_BAYAR = { cash: 'Cash', qris: 'QRIS' };
  var UKURAN_HALAMAN = 10;
  var PILIH = 'id, nomor_antrean, status, metode_bayar, catatan, total, tanggal, dibuat_pada, kantin:kantin_id(nama, url_qris), item_pesanan(nama_menu, jumlah, harga_satuan)';

  var profil = null;
  var judulAsli = document.title;
  var statusSebelum = null;          // { idPesanan: status } dari muatan sebelumnya (null = belum pernah muat)
  var sayaBatalkan = {};             // pesanan yang baru saja saya batalkan sendiri (tidak perlu diberitahu lagi)
  var riwayat = [];
  var adaLagi = false;
  var penunda = null;

  function waktu(iso) {
    try { return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return ''; }
  }
  function namaKantin(p) { return p.kantin && p.kantin.nama ? p.kantin.nama : 'Kantin'; }
  function galatPesan(g) { return g && g.code === 'P0001' ? g.message : Alat.galatRamah(g); }   // pesan dari fungsi database ditulis untuk pembeli

  function daftarItem(p) {
    var ul = buat('ul', 'daftar-item');
    (p.item_pesanan || []).forEach(function (it) {
      var li = buat('li');
      li.appendChild(buat('span', '', it.jumlah + ' x ' + it.nama_menu));
      li.appendChild(buat('span', '', Alat.rupiah(it.jumlah * it.harga_satuan)));
      ul.appendChild(li);
    });
    var tot = buat('li', 'daftar-item-total');
    tot.appendChild(buat('span', '', 'Total'));
    tot.appendChild(buat('span', '', Alat.rupiah(p.total)));
    ul.appendChild(tot);
    return ul;
  }

  /* ============================================================
     PESANAN AKTIF
     ============================================================ */
  function muatAktif() {
    return db.from('pesanan').select(PILIH)
      .eq('pembeli_id', profil.id)
      .in('status', ['diterima', 'diproses', 'siap_diambil'])
      .order('dibuat_pada', { ascending: false })
      .then(function (h) {
        if (h.error) { pesan('pesan-pesanan', Alat.galatRamah(h.error)); return; }
        var daftar = h.data || [];
        beritahuPerubahan(daftar);
        gambarAktif(daftar);
      });
  }

  // Memberi tahu pembeli kalau status pesanannya berubah saat halaman terbuka
  function beritahuPerubahan(daftar) {
    var sekarang = {};
    daftar.forEach(function (p) { sekarang[p.id] = p.status; });
    var catatan = [];

    if (statusSebelum) {
      daftar.forEach(function (p) {
        if (statusSebelum[p.id] && statusSebelum[p.id] !== p.status) {
          if (p.status === 'siap_diambil') catatan.push('Pesanan nomor ' + p.nomor_antrean + ' di ' + namaKantin(p) + ' sudah siap diambil.');
          else if (p.status === 'diproses') catatan.push('Pesanan nomor ' + p.nomor_antrean + ' sedang diproses.');
        }
      });
      var hilang = Object.keys(statusSebelum).filter(function (id) { return !(id in sekarang) && !sayaBatalkan[id]; });
      if (hilang.length) {
        db.from('pesanan').select('id, nomor_antrean, status').in('id', hilang).then(function (h) {
          (h.data || []).forEach(function (p) {
            if (p.status === 'dibatalkan') pesan('pesan-pesanan', 'Pesanan nomor ' + p.nomor_antrean + ' dibatalkan oleh penjual. Stok sudah dikembalikan.', 'info');
            else if (p.status === 'selesai') pesan('pesan-pesanan', 'Pesanan nomor ' + p.nomor_antrean + ' selesai. Terima kasih!', 'sukses');
          });
        });
      }
    }
    if (catatan.length) pesan('pesan-pesanan', catatan.join(' '), 'sukses');
    statusSebelum = sekarang;

    // Petunjuk di luar halaman: angka di tab dan judul tab browser
    var n = daftar.length;
    var lencana = $('badge-pesanan');
    lencana.hidden = n === 0;
    lencana.textContent = String(n);
    var siap = daftar.filter(function (p) { return p.status === 'siap_diambil'; }).length;
    document.title = siap ? '(' + siap + ' siap diambil) ' + judulAsli : judulAsli;
  }

  function gambarAktif(daftar) {
    var wadah = $('daftar-aktif');
    wadah.textContent = '';
    if (!daftar.length) {
      var kos = Alat.kosong('Tidak ada pesanan aktif', 'Pesanan yang baru kamu kirim akan muncul di sini beserta nomor antreannya.');
      kos.appendChild(Alat.tombol('Lihat menu', 'tombol-utama', function () { Alat.gulirKe($('kantin')); }));
      wadah.appendChild(kos);
      return;
    }
    daftar.forEach(function (p) { wadah.appendChild(kartuAktif(p)); });
  }

  function kartuAktif(p) {
    var panel = buat('article', 'panel panel-pesanan' + (p.status === 'siap_diambil' ? ' is-siap' : ''));

    var tiket = buat('div', 'tiket');
    var utama = buat('div', 'tiket-utama');
    utama.appendChild(buat('p', 'nama-kantin', namaKantin(p)));
    utama.appendChild(buat('p', '', waktu(p.dibuat_pada)));
    utama.appendChild(buat('p', '', 'Bayar ' + (NAMA_BAYAR[p.metode_bayar] || p.metode_bayar) + ' di kantin'));
    utama.appendChild(buat('span', 'badge ' + (p.status === 'siap_diambil' ? 'badge-buka' : ''), STATUS[p.status]));
    tiket.appendChild(utama);
    var nomor = buat('div', 'tiket-nomor');
    nomor.appendChild(buat('span', '', String(p.nomor_antrean)));
    tiket.appendChild(nomor);
    tiket.setAttribute('role', 'group');
    tiket.setAttribute('aria-label', 'Nomor antrean ' + p.nomor_antrean + ', status ' + STATUS[p.status]);
    panel.appendChild(tiket);

    // Alur: urutan langkah yang nyata, jadi memakai penomoran
    var alur = buat('ol', 'alur');
    var idx = URUTAN.indexOf(p.status);
    URUTAN.forEach(function (s, i) {
      var li = buat('li', i < idx ? 'selesai' : (i === idx ? 'sekarang' : ''), STATUS[s]);
      if (i === idx) li.setAttribute('aria-current', 'step');
      alur.appendChild(li);
    });
    panel.appendChild(alur);

    panel.appendChild(buat('p', 'status-ket', KETERANGAN[p.status] || ''));
    panel.appendChild(daftarItem(p));
    if (p.catatan) panel.appendChild(buat('p', 'kecil', 'Catatan: ' + p.catatan));

    var aksi = buat('div', 'baris-aksi baris-aksi-kiri');
    if (p.metode_bayar === 'qris' && p.kantin && p.kantin.url_qris) {
      var qris = buat('div', 'pratinjau pratinjau-qris'); qris.hidden = true;
      var img = buat('img'); img.src = p.kantin.url_qris; img.alt = 'QRIS ' + namaKantin(p);
      qris.appendChild(img);
      aksi.appendChild(Alat.tombol('Tampilkan QRIS', 'tombol-garis', function (b) {
        qris.hidden = !qris.hidden; b.textContent = qris.hidden ? 'Tampilkan QRIS' : 'Sembunyikan QRIS';
      }));
      panel.appendChild(qris);
    }
    if (p.status === 'diterima') {
      aksi.appendChild(Alat.tombolKonfirmasi('Batalkan pesanan', 'Yakin batalkan?', function (b) { batalkan(p, b); }));
    } else {
      aksi.appendChild(buat('p', 'kecil', 'Pesanan yang sudah diproses tidak bisa dibatalkan.'));
    }
    panel.appendChild(aksi);
    return panel;
  }

  function batalkan(p, b) {
    b.disabled = true;
    pesan('pesan-pesanan', '');
    sayaBatalkan[p.id] = true;
    db.rpc('batalkan_pesanan', { p_pesanan_id: p.id }).then(function (h) {
      if (h.error) {
        delete sayaBatalkan[p.id];
        var teks = galatPesan(h.error);
        pesan('pesan-pesanan', teks);
        b.disabled = false;
        // Muat ulang supaya status terbaru tampil; pesan galatnya dipertahankan (tidak tertimpa pemberitahuan status)
        return muatAktif().then(function () { pesan('pesan-pesanan', teks); });
      }
      pesan('pesan-pesanan', 'Pesanan nomor ' + p.nomor_antrean + ' dibatalkan.', 'sukses');
      return Promise.all([muatAktif(), muatRiwayat(true)]);
    });
  }

  /* ============================================================
     RIWAYAT
     ============================================================ */
  function muatRiwayat(ulang) {
    var jumlah = ulang ? Math.max(UKURAN_HALAMAN, riwayat.length) : UKURAN_HALAMAN;
    var awal = ulang ? 0 : riwayat.length;
    return db.from('pesanan').select(PILIH)
      .eq('pembeli_id', profil.id)
      .in('status', ['selesai', 'dibatalkan'])
      .order('dibuat_pada', { ascending: false })
      .range(awal, awal + jumlah - 1)
      .then(function (h) {
        if (h.error) { pesan('pesan-riwayat', Alat.galatRamah(h.error)); return; }
        pesan('pesan-riwayat', '');
        var data = h.data || [];
        riwayat = ulang ? data : riwayat.concat(data);
        adaLagi = data.length === jumlah;
        gambarRiwayat();
      });
  }

  function gambarRiwayat() {
    var wadah = $('daftar-riwayat');
    wadah.textContent = '';
    $('tombol-muat-lagi').hidden = !adaLagi;
    if (!riwayat.length) {
      wadah.className = '';
      wadah.appendChild(Alat.kosong('Belum ada riwayat', 'Pesanan yang sudah selesai atau dibatalkan akan tercatat di sini.'));
      return;
    }
    wadah.className = 'daftar';
    riwayat.forEach(function (p) { wadah.appendChild(barisRiwayat(p)); });
  }

  function barisRiwayat(p) {
    var baris = buat('div', 'baris-akun baris-riwayat');
    var kiri = buat('div');
    kiri.appendChild(buat('h3', '', 'Antrean ' + p.nomor_antrean + ', ' + namaKantin(p)));
    kiri.appendChild(buat('p', '', waktu(p.dibuat_pada) + '  |  ' + Alat.rupiah(p.total) + '  |  ' + (NAMA_BAYAR[p.metode_bayar] || p.metode_bayar)));
    baris.appendChild(kiri);

    var kanan = buat('div', 'baris-aksi');
    kanan.appendChild(buat('span', 'badge ' + (p.status === 'dibatalkan' ? 'badge-batal' : ''), STATUS[p.status]));
    var rincian = buat('div', 'detail-pesanan'); rincian.hidden = true;
    rincian.appendChild(daftarItem(p));
    if (p.catatan) rincian.appendChild(buat('p', 'kecil', 'Catatan: ' + p.catatan));
    var tb = Alat.tombol('Lihat rincian', 'tombol-garis', function (b) {
      rincian.hidden = !rincian.hidden;
      b.textContent = rincian.hidden ? 'Lihat rincian' : 'Tutup rincian';
      b.setAttribute('aria-expanded', rincian.hidden ? 'false' : 'true');
    });
    tb.setAttribute('aria-expanded', 'false');
    kanan.appendChild(tb);
    baris.appendChild(kanan);
    baris.appendChild(rincian);
    return baris;
  }

  /* ============================================================
     MULAI
     ============================================================ */
  function segarkan() {
    clearTimeout(penunda);
    penunda = setTimeout(function () { muatAktif(); muatRiwayat(true); }, 300);
  }

  function mulai(p) {
    profil = p;
    $('tombol-muat-lagi').addEventListener('click', function (e) {
      var b = e.currentTarget; b.disabled = true;
      muatRiwayat(false).then(function () { b.disabled = false; });
    });

    muatAktif();
    muatRiwayat(true);

    // Dari bagian Keranjang: pesanan baru langsung muncul tanpa menunggu realtime
    document.addEventListener('pesanan-dibuat', segarkan);

    // Status berubah oleh penjual: tampil otomatis. Realtime hanya mengirim pesanan milik sendiri (RLS).
    try {
      db.channel('pesanan-saya')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pesanan', filter: 'pembeli_id=eq.' + profil.id }, segarkan)
        .subscribe();
    } catch (e) { /* tanpa realtime pun tetap jalan: muat ulang halaman */ }
  }

  if (window.profilSaya) mulai(window.profilSaya);
  else document.addEventListener('profil-siap', function (e) { mulai(e.detail); });
})();
