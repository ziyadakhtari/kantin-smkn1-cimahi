/* ============================================================
   pembeli.js  |  Dashboard pembeli: Kantin dan Menu, Keranjang, Profil
   (Pesanan Aktif dan Riwayat dikerjakan di Tahap 8)

   Aturan penting:
   - Keranjang hanya untuk tampilan. Harga dan total yang SAH dihitung
     di database oleh fungsi buat_pesanan(), jadi tidak bisa dicurangi.
   - Satu pesanan = satu kantin (nomor antrean dibuat per kantin).
   ============================================================ */
(function () {
  'use strict';

  var $ = Alat.$, buat = Alat.buat, pesan = Alat.pesan;
  var NAMA_KATEGORI = { makanan_berat: 'Makanan berat', jajanan: 'Jajanan', minuman: 'Minuman' };
  var NAMA_BAYAR = { cash: 'Cash', qris: 'QRIS' };
  var MAKS_JUMLAH = 99;

  var profil = null;
  var semuaKantin = [];
  var semuaMenu = [];
  var kantinDipilih = null;
  var filterKategori = 'semua';
  var keranjang = { kantinId: null, item: {} };     // item: { menuId: jumlah }
  var sedangKirim = false;
  var penundaMuat = null;

  /* ---------- Penyimpanan keranjang (per akun, di browser ini saja) ---------- */
  function kunciSimpan() { return 'kantin-keranjang-' + profil.id; }
  function bacaKeranjang() {
    try {
      var d = JSON.parse(localStorage.getItem(kunciSimpan()) || 'null');
      if (d && typeof d === 'object' && d.item && typeof d.item === 'object') {
        var bersih = {};
        Object.keys(d.item).forEach(function (k) {
          var n = Math.floor(Number(d.item[k]));
          if (n >= 1 && n <= MAKS_JUMLAH) bersih[k] = n;
        });
        keranjang = { kantinId: Object.keys(bersih).length ? (d.kantinId || null) : null, item: bersih };
      }
    } catch (e) { /* data rusak: mulai dari keranjang kosong */ }
  }
  function simpanKeranjang() {
    try { localStorage.setItem(kunciSimpan(), JSON.stringify(keranjang)); } catch (e) { /* penyimpanan penuh/dimatikan: keranjang tetap jalan sampai halaman ditutup */ }
  }

  /* ---------- Bantu ---------- */
  function cariKantin(id) { return semuaKantin.filter(function (k) { return k.id === id; })[0] || null; }
  function cariMenu(id) { return semuaMenu.filter(function (m) { return m.id === id; })[0] || null; }
  function menuKantin(id) { return semuaMenu.filter(function (m) { return m.kantin_id === id; }); }
  function jumlahDi(menuId) { return keranjang.item[menuId] || 0; }
  function maksUntuk(m) { return m.stok === null || m.stok === undefined ? MAKS_JUMLAH : Math.min(MAKS_JUMLAH, m.stok); }
  function jumlahTotal() { return Object.keys(keranjang.item).reduce(function (a, k) { return a + keranjang.item[k]; }, 0); }

  function stepper(jumlah, maks, kurang, tambah) {
    var w = buat('div', 'stepper');
    var min = buat('button', 'tombol-bulat', '−');
    min.type = 'button'; min.setAttribute('aria-label', 'Kurangi jumlah');
    min.addEventListener('click', kurang);
    var angka = buat('span', 'stepper-angka', String(jumlah));
    angka.setAttribute('aria-live', 'polite');
    var plus = buat('button', 'tombol-bulat', '+');
    plus.type = 'button'; plus.setAttribute('aria-label', 'Tambah jumlah');
    plus.disabled = jumlah >= maks;
    plus.addEventListener('click', tambah);
    w.appendChild(min); w.appendChild(angka); w.appendChild(plus);
    return w;
  }

  /* ============================================================
     MEMUAT DATA
     ============================================================ */
  function muatData(animasi) {
    return Promise.all([
      db.from('kantin').select('id, nama, deskripsi, sedang_buka, url_qris').order('nama', { ascending: true }),
      db.from('menu').select('id, kantin_id, nama, deskripsi, harga, kategori, stok, habis, url_foto, dibuat_pada').order('nama', { ascending: true })
    ]).then(function (h) {
      if (h[0].error || h[1].error) {
        pesan('pesan-katalog', Alat.galatRamah(h[0].error || h[1].error));
        if (!semuaKantin.length) $('daftar-kantin').textContent = '';
        return;
      }
      pesan('pesan-katalog', '');
      semuaKantin = h[0].data || [];
      semuaMenu = h[1].data || [];
      if (!kantinDipilih || !cariKantin(kantinDipilih)) kantinDipilih = pilihAwal();
      rapikanKeranjang();
      gambarKantin();
      gambarMenu(animasi !== false);
      gambarKeranjang();
    });
  }

  function pilihAwal() {
    if (keranjang.kantinId && cariKantin(keranjang.kantinId)) return keranjang.kantinId;
    var buka = semuaKantin.filter(function (k) { return k.sedang_buka; })[0];
    return buka ? buka.id : (semuaKantin[0] ? semuaKantin[0].id : null);
  }

  // Membuang menu yang sudah dihapus, dan menyesuaikan jumlah dengan stok terbaru
  function rapikanKeranjang() {
    var dibuang = 0, disesuaikan = 0;
    Object.keys(keranjang.item).forEach(function (id) {
      var m = cariMenu(id);
      if (!m || m.kantin_id !== keranjang.kantinId) { delete keranjang.item[id]; dibuang++; return; }
      if (!m.habis && keranjang.item[id] > maksUntuk(m)) { keranjang.item[id] = maksUntuk(m); disesuaikan++; }
    });
    if (!Object.keys(keranjang.item).length) keranjang.kantinId = null;
    if (dibuang || disesuaikan) {
      simpanKeranjang();
      pesan('pesan-keranjang', dibuang
        ? 'Ada menu yang sudah tidak dijual dan dikeluarkan dari keranjang.'
        : 'Jumlah di keranjang disesuaikan dengan stok yang tersisa.', 'info');
    }
  }

  /* ============================================================
     KANTIN DAN MENU
     ============================================================ */
  function gambarKantin() {
    var wadah = $('daftar-kantin');
    wadah.textContent = '';
    if (!semuaKantin.length) {
      wadah.className = '';
      wadah.appendChild(Alat.kosong('Belum ada kantin', 'Kantin akan muncul di sini setelah penjual disetujui pengelola.'));
      return;
    }
    wadah.className = 'pilih-kantin';
    semuaKantin.forEach(function (k) {
      var b = buat('button', 'kartu-kantin');
      b.type = 'button';
      b.setAttribute('aria-pressed', k.id === kantinDipilih ? 'true' : 'false');
      b.appendChild(buat('strong', '', k.nama));
      var lencana = buat('span', 'badge ' + (k.sedang_buka ? 'badge-buka' : 'badge-batal'), k.sedang_buka ? 'Buka' : 'Tutup');
      b.appendChild(lencana);
      b.addEventListener('click', function () {
        if (kantinDipilih === k.id) return;
        kantinDipilih = k.id; filterKategori = 'semua';
        aturTombolFilter();
        gambarKantin(); gambarMenu(true);
      });
      wadah.appendChild(b);
    });
  }

  function aturTombolFilter() {
    document.querySelectorAll('[data-filter-kategori]').forEach(function (x) {
      x.setAttribute('aria-pressed', x.getAttribute('data-filter-kategori') === filterKategori ? 'true' : 'false');
    });
  }

  function gambarMenu(animasi) {
    var info = $('info-kantin');
    var wadah = $('daftar-menu-pembeli');
    info.textContent = '';
    wadah.textContent = '';
    var k = cariKantin(kantinDipilih);
    if (!k) { info.hidden = true; $('alat-filter').hidden = true; wadah.className = ''; return; }

    info.hidden = false; $('alat-filter').hidden = false;
    var kepala = buat('div', 'info-kantin-kepala');
    kepala.appendChild(buat('h3', '', k.nama));
    kepala.appendChild(buat('span', 'badge ' + (k.sedang_buka ? 'badge-buka' : 'badge-batal'), k.sedang_buka ? 'Sedang buka' : 'Sedang tutup'));
    info.appendChild(kepala);
    if (k.deskripsi) info.appendChild(buat('p', 'kecil', k.deskripsi));
    if (!k.sedang_buka) info.appendChild(buat('p', 'pesan pesan-info', 'Kantin ini sedang tutup. Kamu masih bisa melihat menunya, tetapi belum bisa memesan.'));

    var daftar = menuKantin(k.id).filter(function (m) { return filterKategori === 'semua' || m.kategori === filterKategori; });
    if (!daftar.length) {
      wadah.className = '';
      wadah.appendChild(menuKantin(k.id).length
        ? Alat.kosong('Tidak ada menu di kategori ini', 'Pilih kategori lain.')
        : Alat.kosong('Belum ada menu', 'Penjual belum menambahkan menu. Coba lagi nanti.'));
      return;
    }
    wadah.className = 'grid-kartu';
    daftar.forEach(function (m) { wadah.appendChild(kartuMenu(m, k)); });
    if (animasi && window.Animasi) window.Animasi.kartu(wadah);
  }

  function kartuMenu(m, k) {
    var kartu = buat('article', 'kartu' + (m.habis ? ' is-habis' : ''));
    kartu.setAttribute('data-kartu', '');

    var foto = buat('div', 'kartu-foto');
    if (m.url_foto) { var img = buat('img'); img.src = m.url_foto; img.alt = ''; img.loading = 'lazy'; foto.appendChild(img); }
    if (m.habis) foto.appendChild(buat('span', 'label-habis', 'Habis'));
    kartu.appendChild(foto);

    var isi = buat('div', 'kartu-isi');
    isi.appendChild(buat('h3', '', m.nama));
    if (m.deskripsi) isi.appendChild(buat('p', '', m.deskripsi));
    isi.appendChild(buat('p', 'kecil', NAMA_KATEGORI[m.kategori] || m.kategori));
    if (!m.habis && m.stok !== null && m.stok !== undefined && m.stok <= 5) isi.appendChild(buat('p', 'kecil stok-tipis', 'Sisa ' + m.stok));

    var baris = buat('div', 'kartu-baris');
    baris.appendChild(buat('span', 'harga', Alat.rupiah(m.harga)));
    var aksi = buat('div', 'aksi-menu');
    baris.appendChild(aksi);
    isi.appendChild(baris);
    kartu.appendChild(isi);
    isiAksi(aksi, m, k);
    return kartu;
  }

  // Bagian tombol di kartu menu. Digambar ulang sendiri saat jumlah berubah.
  function isiAksi(aksi, m, k) {
    aksi.textContent = '';
    var n = jumlahDi(m.id);
    if (m.habis) { var d = Alat.tombol('Habis', 'tombol-garis', function () {}); d.disabled = true; aksi.appendChild(d); return; }
    if (!k.sedang_buka) { var t = Alat.tombol('Tutup', 'tombol-garis', function () {}); t.disabled = true; aksi.appendChild(t); return; }
    if (n === 0) {
      aksi.appendChild(Alat.tombol('Tambah', 'tombol-utama', function () { tambahKeKeranjang(m, aksi, k); }));
      return;
    }
    aksi.appendChild(stepper(n, maksUntuk(m),
      function () { ubahJumlah(m, n - 1, aksi, k); },
      function () { ubahJumlah(m, n + 1, aksi, k); }));
  }

  /* ============================================================
     KERANJANG
     ============================================================ */
  function tambahKeKeranjang(m, aksi, k) {
    pesan('pesan-katalog', '');
    pesan('pesan-keranjang', '');
    if (keranjang.kantinId && keranjang.kantinId !== m.kantin_id && jumlahTotal() > 0) {
      return tanyaGantiKantin(m, aksi, k);
    }
    keranjang.kantinId = m.kantin_id;
    ubahJumlah(m, 1, aksi, k);
  }

  function tanyaGantiKantin(m, aksi, k) {
    var lama = cariKantin(keranjang.kantinId);
    var kotak = $('peringatan-kantin');
    kotak.textContent = '';
    kotak.appendChild(buat('p', '', 'Keranjangmu berisi menu dari ' + (lama ? lama.nama : 'kantin lain') + '. Satu pesanan hanya untuk satu kantin.'));
    var baris = buat('div', 'baris-aksi baris-aksi-kiri');
    baris.appendChild(Alat.tombol('Kosongkan keranjang dan pesan di sini', 'tombol-utama', function () {
      keranjang = { kantinId: m.kantin_id, item: {} };
      kotak.hidden = true;
      ubahJumlah(m, 1, aksi, k);
    }));
    baris.appendChild(Alat.tombol('Batal', 'tombol-garis', function () { kotak.hidden = true; }));
    kotak.appendChild(baris);
    kotak.hidden = false;
  }

  function ubahJumlah(m, n, aksi, k) {
    n = Math.max(0, Math.min(n, maksUntuk(m)));
    if (n === 0) delete keranjang.item[m.id]; else keranjang.item[m.id] = n;
    if (!Object.keys(keranjang.item).length) keranjang.kantinId = null;
    simpanKeranjang();
    if (aksi) isiAksi(aksi, m, k);
    gambarKeranjang();
  }

  function gambarKeranjang() {
    var ids = Object.keys(keranjang.item);
    var lencana = $('badge-keranjang');
    var total = jumlahTotal();
    lencana.hidden = total === 0;
    lencana.textContent = String(total);

    var wadah = $('isi-keranjang');
    var form = $('form-checkout');
    wadah.textContent = '';

    if (!ids.length) {
      form.hidden = true;
      var kos = Alat.kosong('Keranjang masih kosong', 'Pilih menu di bagian Kantin dan Menu, lalu tekan Tambah.');
      var ke = Alat.tombol('Lihat menu', 'tombol-utama', function () { Alat.gulirKe($('kantin')); });
      kos.appendChild(ke);
      wadah.appendChild(kos);
      return;
    }

    var k = cariKantin(keranjang.kantinId);
    var kepala = buat('div', 'info-kantin-kepala');
    kepala.appendChild(buat('h3', '', 'Pesanan dari ' + (k ? k.nama : 'kantin')));
    if (k) kepala.appendChild(buat('span', 'badge ' + (k.sedang_buka ? 'badge-buka' : 'badge-batal'), k.sedang_buka ? 'Sedang buka' : 'Sedang tutup'));
    wadah.appendChild(kepala);

    var daftar = buat('div', 'daftar');
    var jumlahUang = 0, bisaPesan = !!k && k.sedang_buka;
    ids.forEach(function (id) {
      var m = cariMenu(id);
      if (!m) return;
      var n = keranjang.item[id];
      var ok = !m.habis;
      if (!ok) bisaPesan = false;
      if (ok) jumlahUang += m.harga * n;

      var baris = buat('div', 'baris-akun baris-keranjang');
      var kiri = buat('div');
      kiri.appendChild(buat('h3', '', m.nama));
      kiri.appendChild(buat('p', '', ok ? Alat.rupiah(m.harga) + ' x ' + n + ' = ' + Alat.rupiah(m.harga * n) : 'Menu ini sudah habis. Hapus dari keranjang untuk melanjutkan.'));
      baris.appendChild(kiri);

      var kanan = buat('div', 'baris-aksi');
      if (ok) {
        kanan.appendChild(stepper(n, maksUntuk(m),
          function () { ubahJumlah(m, n - 1, null, k); refreshMenuAksi(); },
          function () { ubahJumlah(m, n + 1, null, k); refreshMenuAksi(); }));
      }
      kanan.appendChild(Alat.tombol('Hapus', 'tombol-garis', function () { ubahJumlah(m, 0, null, k); refreshMenuAksi(); }));
      baris.appendChild(kanan);
      daftar.appendChild(baris);
    });
    wadah.appendChild(daftar);

    $('total-keranjang').textContent = Alat.rupiah(jumlahUang);
    form.hidden = false;

    // QRIS hanya bisa dipilih kalau kantin sudah mengunggah QRIS
    var adaQris = !!(k && k.url_qris);
    var radioQris = form.querySelector('input[name="metode"][value="qris"]');
    radioQris.disabled = !adaQris;
    if (!adaQris && radioQris.checked) form.querySelector('input[name="metode"][value="cash"]').checked = true;
    $('ket-qris-bayar').textContent = adaQris ? 'QRIS ditunjukkan dan dibayar di kantin saat mengambil pesanan.' : 'Kantin ini belum menyediakan QRIS, jadi bayarnya Cash.';

    var kirim = $('tombol-kirim-pesanan');
    kirim.disabled = !bisaPesan || sedangKirim;
    $('ket-kirim').textContent = !k || !k.sedang_buka ? 'Kantin sedang tutup, pesanan belum bisa dikirim.' : (!bisaPesan ? 'Ada menu yang habis. Hapus dulu dari keranjang.' : '');
  }

  // Setelah keranjang berubah dari bagian Keranjang, kartu menu ikut disegarkan
  function refreshMenuAksi() { gambarMenu(false); }

  /* ---------- Checkout ---------- */
  function aturCheckout() {
    $('catatan-pesanan').addEventListener('input', function () {
      $('hitung-catatan').textContent = $('catatan-pesanan').value.length + ' / 300';
    });

    $('form-checkout').addEventListener('submit', function (e) {
      e.preventDefault();
      if (sedangKirim) return;                        // cegah klik ganda = pesanan ganda
      pesan('pesan-keranjang', '');
      var k = cariKantin(keranjang.kantinId);
      var ids = Object.keys(keranjang.item);
      if (!k || !ids.length) return pesan('pesan-keranjang', 'Keranjang masih kosong.');
      var metode = e.currentTarget.querySelector('input[name="metode"]:checked');
      if (!metode) return pesan('pesan-keranjang', 'Pilih cara bayar: Cash atau QRIS.');

      sedangKirim = true;
      var kirim = $('tombol-kirim-pesanan');
      kirim.disabled = true; kirim.textContent = 'Mengirim pesanan...';

      var item = ids.map(function (id) { return { menu_id: id, jumlah: keranjang.item[id] }; });
      var catatan = $('catatan-pesanan').value.trim();

      db.rpc('buat_pesanan', { p_kantin_id: k.id, p_metode: metode.value, p_catatan: catatan || null, p_item: item })
        .then(function (h) {
          sedangKirim = false;
          kirim.textContent = 'Kirim pesanan';
          if (h.error) {
            // Pesan dari fungsi database (kode P0001) memang ditulis untuk pembeli; galat lain disamarkan
            pesan('pesan-keranjang', h.error.code === 'P0001' ? h.error.message : Alat.galatRamah(h.error));
            return muatData(false);
          }
          var hasil = h.data || {};
          var kantinSaat = k;
          keranjang = { kantinId: null, item: {} };
          simpanKeranjang();
          $('catatan-pesanan').value = ''; $('hitung-catatan').textContent = '0 / 300';
          tampilkanTiket(kantinSaat, hasil, metode.value);
          return muatData(false).then(function () { Alat.gulirKe($('keranjang')); });
        }, function (g) {
          sedangKirim = false; kirim.textContent = 'Kirim pesanan';
          pesan('pesan-keranjang', Alat.galatRamah(g));
          gambarKeranjang();
        });
    });
  }

  function tampilkanTiket(k, hasil, metode) {
    var w = $('hasil-pesanan');
    w.textContent = '';
    w.appendChild(buat('h3', '', 'Pesanan terkirim'));
    var tiket = buat('div', 'tiket');
    tiket.setAttribute('role', 'group');
    tiket.setAttribute('aria-label', 'Nomor antrean ' + hasil.nomor_antrean);
    var utama = buat('div', 'tiket-utama');
    utama.appendChild(buat('p', 'nama-kantin', k.nama));
    utama.appendChild(buat('p', '', 'Total ' + Alat.rupiah(hasil.total)));
    utama.appendChild(buat('p', '', 'Bayar ' + NAMA_BAYAR[metode] + ' di kantin'));
    utama.appendChild(buat('span', 'badge badge-buka', 'Diterima'));
    tiket.appendChild(utama);
    var nomor = buat('div', 'tiket-nomor');
    nomor.appendChild(buat('span', '', String(hasil.nomor_antrean)));
    tiket.appendChild(nomor);
    w.appendChild(tiket);
    w.appendChild(buat('p', 'kecil', 'Sebutkan nomor antreanmu ke penjual. Pantau statusnya di bagian Pesanan Aktif.'));
    if (metode === 'qris' && k.url_qris) {
      var q = buat('div', 'pratinjau pratinjau-qris');
      var img = buat('img'); img.src = k.url_qris; img.alt = 'QRIS ' + k.nama;
      q.appendChild(img); w.appendChild(q);
    }
    var tutup = Alat.tombol('Tutup', 'tombol-garis', function () { w.hidden = true; w.textContent = ''; });
    w.appendChild(tutup);
    w.hidden = false;
  }

  /* ============================================================
     PROFIL
     ============================================================ */
  function aturKelas() {
    var jenis = document.querySelector('#form-profil-pembeli input[name="jenis"]:checked');
    var siswa = jenis && jenis.value === 'siswa';
    $('bagian-kelas-profil').hidden = !siswa;
  }

  function muatProfil() {
    db.from('profil').select('nama, no_hp, jenis_pembeli, kelas_jurusan').eq('id', profil.id).maybeSingle().then(function (h) {
      if (h.error || !h.data) return pesan('pesan-profil-pembeli', 'Data profil belum bisa dimuat. Muat ulang halaman.');
      var d = h.data;
      $('prof-nama').value = d.nama || '';
      $('prof-hp').value = d.no_hp || '';
      $('prof-kelas').value = d.kelas_jurusan || '';
      var r = d.jenis_pembeli ? document.querySelector('#form-profil-pembeli input[name="jenis"][value="' + d.jenis_pembeli + '"]') : null;
      if (r) r.checked = true;
      aturKelas();
    });
  }

  function aturProfil() {
    document.querySelectorAll('#form-profil-pembeli input[name="jenis"]').forEach(function (r) { r.addEventListener('change', aturKelas); });
    $('form-profil-pembeli').addEventListener('submit', function (e) {
      e.preventDefault();
      var nama = $('prof-nama').value.trim();
      var hp = $('prof-hp').value.trim();
      var jenis = document.querySelector('#form-profil-pembeli input[name="jenis"]:checked');
      var kelas = $('prof-kelas').value.trim();
      if (!nama) return pesan('pesan-profil-pembeli', 'Nama tidak boleh kosong.');
      if (hp && !/^[0-9+\s-]{8,16}$/.test(hp)) return pesan('pesan-profil-pembeli', 'Nomor HP tidak valid. Pakai angka saja, 8 sampai 16 karakter.');
      if (!jenis) return pesan('pesan-profil-pembeli', 'Pilih jenis penggunamu: siswa, guru, atau pegawai.');
      if (jenis.value === 'siswa' && !kelas) return pesan('pesan-profil-pembeli', 'Isi kelas dan jurusanmu.');

      var simpan = e.currentTarget.querySelector('[type="submit"]');
      simpan.disabled = true; simpan.textContent = 'Menyimpan...';
      db.from('profil').update({
        nama: nama, no_hp: hp || null, jenis_pembeli: jenis.value, kelas_jurusan: jenis.value === 'siswa' ? kelas : null
      }).eq('id', profil.id).then(function (h) {
        simpan.disabled = false; simpan.textContent = 'Simpan profil';
        if (h.error) return pesan('pesan-profil-pembeli', Alat.galatRamah(h.error));
        document.querySelectorAll('[data-nama-pengguna]').forEach(function (el) { el.textContent = nama; });
        pesan('pesan-profil-pembeli', 'Profil disimpan.', 'sukses');
      });
    });
  }

  /* ============================================================
     MULAI
     ============================================================ */
  function mulai(p) {
    profil = p;
    bacaKeranjang();
    aturCheckout();
    aturProfil();

    document.querySelectorAll('[data-filter-kategori]').forEach(function (b) {
      b.addEventListener('click', function () {
        filterKategori = b.getAttribute('data-filter-kategori');
        aturTombolFilter();
        gambarMenu(true);
      });
    });

    muatData(true);
    muatProfil();

    // Menu dan status kantin berubah sendiri (stok habis, kantin buka/tutup)
    try {
      var segarkan = function () {
        clearTimeout(penundaMuat);
        penundaMuat = setTimeout(function () { muatData(false); }, 500);
      };
      db.channel('katalog')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'menu' }, segarkan)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'kantin' }, segarkan)
        .subscribe();
    } catch (e) { /* tanpa realtime pun tetap jalan */ }
  }

  if (window.profilSaya) mulai(window.profilSaya);
  else document.addEventListener('profil-siap', function (e) { mulai(e.detail); });
})();
