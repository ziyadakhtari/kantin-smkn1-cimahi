/* ============================================================
   pesanan-penjual.js  |  Dashboard penjual: Pesanan Masuk
   - Pesanan baru muncul otomatis (realtime + cek ulang tiap 30 detik)
   - Penjual mengubah status lewat fungsi database ubah_status_pesanan
   - Pemberitahuan pesanan baru, supaya penjual tidak perlu scroll ke atas
     untuk tahu ada pesanan:
       1. bunyi (aset/bunyi-pesanan.mp3)
       2. banner melayang "Lihat pesanan" saat bagian ini tidak terlihat
       3. angka di tab "Pesanan Masuk" dan di judul tab browser
       4. getar (HP) dan notifikasi layar (jika diizinkan)
   ============================================================ */
(function () {
  'use strict';

  var $ = Alat.$, buat = Alat.buat, pesan = Alat.pesan;

  var BERIKUTNYA = {
    diterima:     { ke: 'diproses',     teks: 'Proses pesanan',           selesai: 'diproses' },
    diproses:     { ke: 'siap_diambil', teks: 'Tandai siap diambil',      selesai: 'siap diambil' },
    siap_diambil: { ke: 'selesai',      teks: 'Selesai: sudah diambil dan dibayar', selesai: 'selesai' }
  };
  var STATUS = { diterima: 'Baru', diproses: 'Diproses', siap_diambil: 'Siap diambil', selesai: 'Selesai', dibatalkan: 'Dibatalkan' };
  var NAMA_BAYAR = { cash: 'Cash', qris: 'QRIS' };
  var PILIH = 'id, nomor_antrean, status, metode_bayar, catatan, total, tanggal, dibuat_pada, pembeli:pembeli_id(nama), item_pesanan(nama_menu, jumlah, harga_satuan)';
  var KUNCI_SUARA = 'kantin-suara-penjual';
  var JEDA_CEK_ULANG = 30000;

  var kantin = null;
  var judulAsli = document.title;
  var idDikenal = null;              // semua id pesanan yang pernah dimuat (null = belum pernah muat)
  var jumlahBaru = 0;                // pesanan berstatus "diterima" saat ini
  var belumDilihat = 0;              // pesanan baru yang belum sempat dilihat penjual
  var bagianTerlihat = true;
  var sedangMuat = false;
  var muatLagi = false;
  var penunda = null;

  /* ============================================================
     SUARA
     ============================================================ */
  var bunyi = null;
  var suaraHidup = true;             // pilihan penjual (disimpan di browser ini)
  var suaraSiap = false;             // browser sudah mengizinkan memutar suara

  try { suaraHidup = localStorage.getItem(KUNCI_SUARA) !== 'mati'; } catch (e) { /* abaikan */ }
  try { bunyi = new Audio('aset/bunyi-pesanan.mp3'); bunyi.preload = 'auto'; } catch (e) { bunyi = null; }

  // Browser hanya mengizinkan suara otomatis setelah pengguna menyentuh halaman.
  // Jadi ketukan pertama di mana saja "membuka kunci" suara (tanpa bunyi terdengar).
  function bukaKunciSuara() {
    if (suaraSiap || !bunyi) return;
    try {
      bunyi.volume = 0;
      var p = bunyi.play();
      if (p && p.then) {
        p.then(function () {
          bunyi.pause(); bunyi.currentTime = 0; bunyi.volume = 1;
          suaraSiap = true; gambarSuara();
        }, function () { bunyi.volume = 1; });
      }
    } catch (e) { bunyi.volume = 1; }
  }
  // Dipasang pada akhir ketukan (bukan saat jari menekan), supaya perubahan teks keterangan
  // tidak menggeser tombol yang sedang ditekan dan membuat ketukan pertama meleset.
  ['click', 'touchend', 'keydown'].forEach(function (nama) {
    document.addEventListener(nama, bukaKunciSuara, { passive: true });
  });

  function putarBunyi(paksa) {
    if (!bunyi || (!suaraHidup && !paksa)) return;
    if (!bunyi.paused && bunyi.currentTime > 0 && !bunyi.ended) return;   // sedang berbunyi: jangan ditumpuk
    try {
      bunyi.volume = 1; bunyi.currentTime = 0;
      var p = bunyi.play();
      if (p && p.catch) p.catch(function () { suaraSiap = false; gambarSuara(); });
    } catch (e) { suaraSiap = false; gambarSuara(); }
  }

  function gambarSuara() {
    var tb = $('tombol-suara'), ket = $('ket-suara');
    if (!tb) return;
    tb.textContent = suaraHidup ? 'Suara: hidup' : 'Suara: mati';
    tb.setAttribute('aria-pressed', suaraHidup ? 'true' : 'false');
    if (!bunyi) ket.textContent = 'Browser ini tidak mendukung suara notifikasi.';
    else if (!suaraHidup) ket.textContent = 'Suara dimatikan. Kamu tetap melihat banner dan angka di tab saat ada pesanan baru.';
    else if (!suaraSiap) ket.textContent = 'Ketuk di mana saja pada halaman ini sekali supaya suara bisa berbunyi saat ada pesanan baru.';
    else ket.textContent = 'Suara aktif. Kamu akan mendengar bunyi saat ada pesanan baru.';
  }

  /* ============================================================
     NOTIFIKASI PESANAN BARU
     ============================================================ */
  function gambarNotifLayar() {
    var tb = $('tombol-notif-layar');
    var bisa = 'Notification' in window;
    tb.hidden = !(bisa && Notification.permission === 'default');
  }

  function kirimNotifLayar(baru) {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
    try {
      var n = new Notification(baru.length === 1 ? 'Pesanan baru nomor ' + baru[0].nomor_antrean : baru.length + ' pesanan baru', {
        body: (kantin && kantin.nama ? kantin.nama + ': ' : '') + 'ada pesanan yang menunggu diproses.',
        tag: 'pesanan-baru'
      });
      n.onclick = function () { window.focus(); Alat.gulirKe($('pesanan-masuk')); n.close(); };
    } catch (e) { /* notifikasi tidak didukung (mis. beberapa HP): banner dan suara tetap jalan */ }
  }

  function umumkan(baru) {
    putarBunyi(false);
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { /* abaikan */ }
    kirimNotifLayar(baru);
    belumDilihat += baru.length;
    periksaDilihat();
  }

  function gambarBanner() {
    var b = $('banner-pesanan-baru');
    if (!b) return;
    if (belumDilihat > 0 && !(bagianTerlihat && !document.hidden)) {
      $('teks-banner').textContent = belumDilihat === 1 ? 'Ada 1 pesanan baru.' : 'Ada ' + belumDilihat + ' pesanan baru.';
      b.hidden = false;
    } else b.hidden = true;
  }

  // Pesanan dianggap "sudah dilihat" kalau bagian Pesanan Masuk terlihat dan tab browser sedang dibuka
  function periksaDilihat() {
    if (bagianTerlihat && !document.hidden) belumDilihat = 0;
    gambarBanner();
  }

  function gambarPetunjukLuar() {
    var lencana = $('badge-pesanan-masuk');
    lencana.hidden = jumlahBaru === 0;
    lencana.textContent = String(jumlahBaru);
    document.title = jumlahBaru ? '(' + jumlahBaru + ' pesanan baru) ' + judulAsli : judulAsli;
  }

  /* ============================================================
     MEMUAT DAN MENGGAMBAR
     ============================================================ */
  function hariIniWIB() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });   // format YYYY-MM-DD
  }
  function jam(iso) {
    try { return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).replace(':', '.'); }
    catch (e) { return ''; }
  }
  function lamaTunggu(iso) {
    var menit = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
    if (menit < 1) return 'baru saja';
    if (menit < 60) return menit + ' menit lalu';
    return Math.floor(menit / 60) + ' jam ' + (menit % 60) + ' menit lalu';
  }
  function namaPembeli(p) { return p.pembeli && p.pembeli.nama ? p.pembeli.nama : 'Pembeli'; }
  function galatPesan(g) { return g && g.code === 'P0001' ? g.message : Alat.galatRamah(g); }   // pesan fungsi database memang ditulis untuk pengguna

  function muat() {
    if (sedangMuat) { muatLagi = true; return Promise.resolve(); }
    sedangMuat = true;
    return Promise.all([
      db.from('pesanan').select(PILIH).eq('kantin_id', kantin.id)
        .in('status', ['diterima', 'diproses', 'siap_diambil'])
        .order('dibuat_pada', { ascending: true }),
      db.from('pesanan').select(PILIH).eq('kantin_id', kantin.id).eq('tanggal', hariIniWIB())
        .in('status', ['selesai', 'dibatalkan'])
        .order('diperbarui_pada', { ascending: false }).limit(30)
    ]).then(function (h) {
      if (h[0].error || h[1].error) { pesan('pesan-pesanan-masuk', Alat.galatRamah(h[0].error || h[1].error)); return; }
      pesan('pesan-pesanan-masuk', '');
      var aktif = h[0].data || [], selesai = h[1].data || [];

      // Pesanan baru = berstatus "diterima" dan belum pernah kita lihat di muatan sebelumnya
      var baru = [];
      if (idDikenal) baru = aktif.filter(function (p) { return p.status === 'diterima' && !idDikenal[p.id]; });
      idDikenal = idDikenal || {};
      aktif.concat(selesai).forEach(function (p) { idDikenal[p.id] = true; });

      jumlahBaru = aktif.filter(function (p) { return p.status === 'diterima'; }).length;
      gambarKelompok('baru', aktif.filter(function (p) { return p.status === 'diterima'; }), 'Belum ada pesanan baru. Halaman ini diperbarui otomatis.');
      gambarKelompok('diproses', aktif.filter(function (p) { return p.status === 'diproses'; }), 'Tidak ada pesanan yang sedang diproses.');
      gambarKelompok('siap', aktif.filter(function (p) { return p.status === 'siap_diambil'; }), 'Tidak ada pesanan yang menunggu diambil.');
      gambarSelesai(selesai);
      gambarPetunjukLuar();
      if (baru.length) umumkan(baru);
    }).then(function () {
      sedangMuat = false;
      if (muatLagi) { muatLagi = false; return muat(); }
    }, function (g) {
      sedangMuat = false;
      pesan('pesan-pesanan-masuk', Alat.galatRamah(g));
    });
  }

  function gambarKelompok(nama, daftar, teksKosong) {
    $('hitung-' + nama).textContent = String(daftar.length);
    var wadah = $('daftar-' + nama);
    wadah.textContent = '';
    if (!daftar.length) { wadah.className = ''; wadah.appendChild(buat('p', 'kecil kelompok-kosong', teksKosong)); return; }
    wadah.className = 'grid-pesanan';
    daftar.forEach(function (p) { wadah.appendChild(kartuPesanan(p)); });
  }

  function kartuPesanan(p) {
    var kartu = buat('article', 'kartu-pesanan status-' + p.status);

    var kepala = buat('div', 'kartu-pesanan-kepala');
    kepala.appendChild(buat('span', 'nomor-besar', String(p.nomor_antrean)));
    var info = buat('div', 'kartu-pesanan-info');
    info.appendChild(buat('strong', '', namaPembeli(p)));
    var sub = buat('span', 'kecil');
    sub.appendChild(document.createTextNode(jam(p.dibuat_pada) + ', '));
    var tunggu = buat('span', '', lamaTunggu(p.dibuat_pada));
    tunggu.setAttribute('data-dibuat', p.dibuat_pada);
    sub.appendChild(tunggu);
    info.appendChild(sub);
    kepala.appendChild(info);
    kepala.appendChild(buat('span', 'badge ' + (p.metode_bayar === 'qris' ? 'badge-buka' : ''), NAMA_BAYAR[p.metode_bayar] || p.metode_bayar));
    kartu.appendChild(kepala);

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
    kartu.appendChild(ul);

    if (p.catatan) kartu.appendChild(buat('p', 'catatan-pesanan', 'Catatan: ' + p.catatan));
    kartu.appendChild(buat('p', 'kecil', p.metode_bayar === 'qris'
      ? 'Dibayar QRIS saat diambil. Cek bukti bayarnya.'
      : 'Terima uang ' + Alat.rupiah(p.total) + ' saat diambil.'));

    var langkah = BERIKUTNYA[p.status];
    if (langkah) {
      var aksi = buat('div', 'baris-aksi baris-aksi-kiri');
      aksi.appendChild(Alat.tombol(langkah.teks, 'tombol-utama', function (b) { ubahStatus(p, langkah.ke, kartu, b); }));
      aksi.appendChild(Alat.tombolKonfirmasi('Batalkan', 'Yakin batalkan?', function (b) { ubahStatus(p, 'dibatalkan', kartu, b); }));
      kartu.appendChild(aksi);
    }
    return kartu;
  }

  function gambarSelesai(daftar) {
    $('hitung-selesai').textContent = String(daftar.length);
    var wadah = $('daftar-selesai');
    wadah.textContent = '';
    if (!daftar.length) { wadah.className = ''; wadah.appendChild(buat('p', 'kecil kelompok-kosong', 'Belum ada pesanan yang selesai hari ini.')); return; }
    wadah.className = 'daftar';
    daftar.forEach(function (p) {
      var baris = buat('div', 'baris-akun');
      var kiri = buat('div');
      kiri.appendChild(buat('h3', '', 'Antrean ' + p.nomor_antrean + ', ' + namaPembeli(p)));
      kiri.appendChild(buat('p', '', jam(p.dibuat_pada) + '  |  ' + Alat.rupiah(p.total) + '  |  ' + (NAMA_BAYAR[p.metode_bayar] || p.metode_bayar)));
      baris.appendChild(kiri);
      baris.appendChild(buat('span', 'badge ' + (p.status === 'dibatalkan' ? 'badge-batal' : ''), STATUS[p.status]));
      wadah.appendChild(baris);
    });
  }

  function perbaruiLamaTunggu() {
    document.querySelectorAll('[data-dibuat]').forEach(function (el) { el.textContent = lamaTunggu(el.getAttribute('data-dibuat')); });
  }

  /* ---------- Mengubah status ---------- */
  function ubahStatus(p, tujuan, kartu, tombolDitekan) {
    pesan('pesan-pesanan-masuk', '');
    kartu.querySelectorAll('button').forEach(function (x) { x.disabled = true; });     // cegah klik ganda
    db.rpc('ubah_status_pesanan', { p_pesanan_id: p.id, p_status: tujuan }).then(function (h) {
      if (h.error) {
        pesan('pesan-pesanan-masuk', galatPesan(h.error));
        return muat().then(function () { pesan('pesan-pesanan-masuk', galatPesan(h.error)); });
      }
      var teks = tujuan === 'dibatalkan'
        ? 'Pesanan nomor ' + p.nomor_antrean + ' dibatalkan. Stok dikembalikan.'
        : 'Pesanan nomor ' + p.nomor_antrean + ' ' + BERIKUTNYA[p.status].selesai + '.';
      return muat().then(function () { pesan('pesan-pesanan-masuk', teks, 'sukses'); });
    }, function (g) {
      pesan('pesan-pesanan-masuk', Alat.galatRamah(g));
      kartu.querySelectorAll('button').forEach(function (x) { x.disabled = false; });
    });
  }

  /* ============================================================
     MULAI
     ============================================================ */
  function segarkan() {
    clearTimeout(penunda);
    penunda = setTimeout(muat, 300);
  }

  function mulai(k) {
    kantin = k;

    $('tombol-suara').addEventListener('click', function () {
      suaraHidup = !suaraHidup;
      try { localStorage.setItem(KUNCI_SUARA, suaraHidup ? 'hidup' : 'mati'); } catch (e) { /* abaikan */ }
      gambarSuara();
    });
    $('tombol-coba-suara').addEventListener('click', function () { bukaKunciSuara(); putarBunyi(true); });
    $('tombol-notif-layar').addEventListener('click', function () {
      try { Notification.requestPermission().then(gambarNotifLayar, gambarNotifLayar); } catch (e) { gambarNotifLayar(); }
    });
    $('tombol-lihat-pesanan').addEventListener('click', function () { Alat.gulirKe($('pesanan-masuk')); });
    gambarSuara();
    gambarNotifLayar();

    // Banner hanya muncul saat bagian Pesanan Masuk tidak terlihat di layar
    var bagian = $('pesanan-masuk');
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        var e = entries[entries.length - 1];
        var tinggiCukup = Math.min(200, e.boundingClientRect.height * 0.5);
        bagianTerlihat = e.isIntersecting && e.intersectionRect.height >= tinggiCukup;
        periksaDilihat();
      }, { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] }).observe(bagian);
    }
    document.addEventListener('visibilitychange', function () {
      periksaDilihat();
      if (!document.hidden) muat();       // kembali ke tab ini: segarkan langsung
    });

    muat();
    setInterval(muat, JEDA_CEK_ULANG);    // jaring pengaman jika koneksi realtime terputus
    setInterval(perbaruiLamaTunggu, 30000);

    try {
      db.channel('pesanan-kantin')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pesanan', filter: 'kantin_id=eq.' + kantin.id }, segarkan)
        .subscribe();
    } catch (e) { /* tanpa realtime pun tetap jalan lewat pengecekan berkala */ }
  }

  if (window.kantinSaya) mulai(window.kantinSaya);
  else document.addEventListener('kantin-siap', function (e) { mulai(e.detail); });
})();
