/* ============================================================
   pengelola.js  |  Dashboard pengelola
   Bagian: Ringkasan, Persetujuan Penjual, Kelola Akun, Pengumuman.
   Dijalankan setelah dashboard-umum.js memastikan pengguna adalah pengelola.
   Semua perubahan lewat fungsi database (rpc) atau tabel yang dijaga RLS,
   jadi hanya pengelola asli yang bisa melakukannya, walau tombolnya terlihat.
   ============================================================ */
(function () {
  'use strict';

  var semuaAkun = [];
  var filterPeran = 'penjual';
  var kataCari = '';
  var profilPengelola = null;

  /* ---------- Alat kecil ---------- */
  function $(id) { return document.getElementById(id); }

  function buat(tag, kelas, teks) {
    var e = document.createElement(tag);
    if (kelas) e.className = kelas;
    if (teks !== undefined && teks !== null) e.textContent = teks;   // textContent: aman dari kode berbahaya
    return e;
  }

  function tombol(teks, kelas, klik) {
    var b = buat('button', 'tombol tombol-kecil ' + kelas, teks);
    b.type = 'button';
    b.addEventListener('click', function () { klik(b); });
    return b;
  }

  // Tombol dua langkah: klik pertama meminta "Yakin?", klik kedua menjalankan.
  function tombolKonfirmasi(teks, teksYakin, aksi) {
    var penunda;
    var b = tombol(teks, 'tombol-garis', function () {
      if (b.dataset.yakin === '1') {
        clearTimeout(penunda);
        b.dataset.yakin = '0';
        aksi(b);
        return;
      }
      b.dataset.yakin = '1';
      b.textContent = teksYakin;
      b.classList.add('tombol-bahaya');
      penunda = setTimeout(function () {
        b.dataset.yakin = '0';
        b.textContent = teks;
        b.classList.remove('tombol-bahaya');
      }, 4000);
    });
    return b;
  }

  function pesan(idKotak, teks, jenis) {
    var k = $(idKotak);
    if (!k) return;
    if (!teks) { k.hidden = true; return; }
    k.textContent = teks;
    k.className = 'pesan pesan-' + (jenis || 'galat');
    k.hidden = false;
  }

  function tanggal(iso) {
    try { return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch (e) { return ''; }
  }

  function kosong(judul, teks) {
    var k = buat('div', 'kosong');
    k.innerHTML = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M6 14h36v7a3 3 0 0 0 0 6v7H6v-7a3 3 0 0 0 0-6z"/><path d="M30 14v20" stroke-dasharray="3 3"/></svg>';
    k.appendChild(buat('h3', '', judul));
    k.appendChild(buat('p', '', teks));
    return k;
  }

  function animasikan(wadah) { if (window.Animasi) window.Animasi.kartu(wadah); }

  function badgeStatus(status) {
    var peta = {
      aktif:    ['badge', 'Aktif'],
      menunggu: ['badge badge-siap', 'Menunggu'],
      ditolak:  ['badge badge-batal', 'Ditolak'],
      nonaktif: ['badge badge-batal', 'Nonaktif']
    };
    var p = peta[status] || ['badge', status];
    return buat('span', p[0], p[1]);
  }

  function galatRamah(g) {
    var t = (g && g.message) || '';
    if (t.toLowerCase().indexOf('failed to fetch') > -1) return 'Tidak bisa terhubung ke server. Periksa koneksi internetmu.';
    if (t.toLowerCase().indexOf('hanya pengelola') > -1) return 'Aksi ini hanya untuk pengelola.';
    return 'Terjadi masalah: ' + t;
  }

  /* ---------- Ringkasan ---------- */
  function muatRingkasan() {
    return db.rpc('ringkasan_pengelola').then(function (h) {
      var wadah = $('daftar-ringkasan');
      wadah.textContent = '';
      if (h.error) {
        pesan('pesan-ringkasan', galatRamah(h.error));
        $('stat-pesanan').textContent = '-';
        $('stat-buka').textContent = '-';
        return;
      }
      pesan('pesan-ringkasan', '');
      var data = h.data || [];
      var total = 0, buka = 0;
      data.forEach(function (k) { total += Number(k.pesanan_hari_ini) || 0; if (k.sedang_buka) buka += 1; });
      $('stat-pesanan').textContent = String(total);
      $('stat-buka').textContent = buka + ' dari ' + data.length;

      if (!data.length) {
        wadah.appendChild(kosong('Belum ada kantin aktif', 'Kantin muncul di sini setelah pendaftaran penjual disetujui.'));
        return;
      }
      data.forEach(function (k) {
        var kartu = buat('article', 'kartu');
        kartu.setAttribute('data-kartu', '');
        var isi = buat('div', 'kartu-isi');
        var baris = buat('div', 'kartu-baris');
        baris.style.marginTop = '0'; baris.style.paddingTop = '0';
        baris.appendChild(buat('h3', '', k.nama_kantin));
        baris.appendChild(buat('span', k.sedang_buka ? 'badge badge-buka' : 'badge badge-batal', k.sedang_buka ? 'Buka' : 'Tutup'));
        isi.appendChild(baris);
        isi.appendChild(buat('p', '', 'Pemilik: ' + k.nama_pemilik));
        isi.appendChild(buat('p', '', 'Pesanan hari ini: ' + k.pesanan_hari_ini));
        isi.appendChild(buat('p', '', 'Sudah selesai: ' + k.pesanan_selesai));
        kartu.appendChild(isi);
        wadah.appendChild(kartu);
      });
      animasikan(wadah);
    });
  }

  /* ---------- Akun (dipakai oleh Persetujuan dan Kelola Akun) ---------- */
  function muatAkun() {
    return db.rpc('daftar_akun').then(function (h) {
      if (h.error) {
        var teks = galatRamah(h.error);
        pesan('pesan-persetujuan', teks);
        pesan('pesan-akun', teks);
        $('daftar-menunggu').textContent = '';
        $('daftar-akun').textContent = '';
        return;
      }
      pesan('pesan-persetujuan', '');
      pesan('pesan-akun', '');
      semuaAkun = h.data || [];
      var menunggu = semuaAkun.filter(function (a) { return a.peran === 'penjual' && a.status_akun === 'menunggu'; });

      $('stat-menunggu').textContent = String(menunggu.length);
      $('kotak-menunggu').classList.toggle('perlu', menunggu.length > 0);
      var badge = $('badge-menunggu');
      badge.textContent = String(menunggu.length);
      badge.hidden = menunggu.length === 0;

      gambarPersetujuan();
      gambarAkun();
    });
  }

  function ubahStatus(idAkun, status, idPesan, teksBerhasil) {
    pesan(idPesan, '');
    return db.rpc('atur_status_akun', { p_user_id: idAkun, p_status: status }).then(function (h) {
      if (h.error) { pesan(idPesan, galatRamah(h.error)); return; }
      pesan(idPesan, teksBerhasil, 'sukses');
      return Promise.all([muatAkun(), muatRingkasan()]);
    }).catch(function (g) { pesan(idPesan, galatRamah(g)); });
  }

  /* ---------- Persetujuan penjual ---------- */
  function kartuPendaftar(a, bolehTolak) {
    var kartu = buat('article', 'kartu');
    kartu.setAttribute('data-kartu', '');
    var isi = buat('div', 'kartu-isi');
    isi.appendChild(buat('h3', '', a.nama_kantin || 'Kantin tanpa nama'));
    isi.appendChild(buat('p', '', 'Pemilik: ' + a.nama));
    isi.appendChild(buat('p', '', 'Email: ' + a.email));
    isi.appendChild(buat('p', '', 'Nomor HP: ' + (a.no_hp || '-')));
    isi.appendChild(buat('p', 'kecil', 'Mendaftar ' + tanggal(a.dibuat_pada)));

    var baris = buat('div', 'kartu-baris');
    baris.style.flexWrap = 'wrap'; baris.style.justifyContent = 'flex-start';
    baris.appendChild(tombol('Setujui', 'tombol-utama', function (b) {
      b.disabled = true;
      ubahStatus(a.id, 'aktif', 'pesan-persetujuan', 'Penjual ' + a.nama + ' disetujui. Dia sekarang bisa masuk dan berjualan.');
    }));
    if (bolehTolak) {
      baris.appendChild(tombolKonfirmasi('Tolak', 'Yakin tolak?', function (b) {
        b.disabled = true;
        ubahStatus(a.id, 'ditolak', 'pesan-persetujuan', 'Pendaftaran ' + a.nama + ' ditolak.');
      }));
    }
    isi.appendChild(baris);
    kartu.appendChild(isi);
    return kartu;
  }

  function gambarPersetujuan() {
    var urut = function (a, b) { return new Date(a.dibuat_pada) - new Date(b.dibuat_pada); };   // paling lama menunggu di atas
    var menunggu = semuaAkun.filter(function (a) { return a.peran === 'penjual' && a.status_akun === 'menunggu'; }).sort(urut);
    var ditolak  = semuaAkun.filter(function (a) { return a.peran === 'penjual' && a.status_akun === 'ditolak'; }).sort(urut);

    var wadah = $('daftar-menunggu');
    wadah.textContent = '';
    if (!menunggu.length) {
      wadah.style.display = 'block';
      wadah.appendChild(kosong('Tidak ada pendaftaran yang menunggu', 'Pendaftaran penjual baru akan muncul di sini.'));
    } else {
      wadah.style.display = '';
      menunggu.forEach(function (a) { wadah.appendChild(kartuPendaftar(a, true)); });
    }

    var wadahTolak = $('daftar-ditolak');
    wadahTolak.textContent = '';
    $('blok-ditolak').hidden = ditolak.length === 0;
    ditolak.forEach(function (a) { wadahTolak.appendChild(kartuPendaftar(a, false)); });

    animasikan($('persetujuan'));
  }

  /* ---------- Kelola akun ---------- */
  function gambarAkun() {
    var wadah = $('daftar-akun');
    wadah.textContent = '';
    var cari = kataCari.toLowerCase();

    var daftar = semuaAkun.filter(function (a) {
      if (a.peran !== filterPeran) return false;
      if (!cari) return true;
      return [a.nama, a.email, a.nama_kantin, a.kelas_jurusan].join(' ').toLowerCase().indexOf(cari) > -1;
    });

    if (!daftar.length) {
      wadah.className = '';
      wadah.appendChild(kosong(cari ? 'Tidak ada yang cocok' : 'Belum ada akun', cari ? 'Coba kata kunci lain.' : 'Akun yang mendaftar akan muncul di sini.'));
      return;
    }
    wadah.className = 'daftar';

    daftar.forEach(function (a) {
      var baris = buat('div', 'baris-akun');
      var info = buat('div');
      info.appendChild(buat('h3', '', a.nama));
      if (a.peran === 'penjual') {
        info.appendChild(buat('p', '', 'Kantin: ' + (a.nama_kantin || '-')));
        info.appendChild(buat('p', '', 'Nomor HP: ' + (a.no_hp || '-')));
      } else {
        var jenis = a.jenis_pembeli ? a.jenis_pembeli.charAt(0).toUpperCase() + a.jenis_pembeli.slice(1) : '-';
        info.appendChild(buat('p', '', 'Jenis: ' + jenis + (a.kelas_jurusan ? ', ' + a.kelas_jurusan : '')));
      }
      info.appendChild(buat('p', '', 'Email: ' + a.email));
      baris.appendChild(info);

      var aksi = buat('div', 'baris-aksi');
      aksi.appendChild(badgeStatus(a.status_akun));
      if (a.status_akun === 'aktif') {
        aksi.appendChild(tombolKonfirmasi('Nonaktifkan', 'Yakin nonaktifkan?', function (b) {
          b.disabled = true;
          ubahStatus(a.id, 'nonaktif', 'pesan-akun', 'Akun ' + a.nama + ' dinonaktifkan.');
        }));
      } else if (a.status_akun === 'nonaktif') {
        aksi.appendChild(tombol('Aktifkan', 'tombol-utama', function (b) {
          b.disabled = true;
          ubahStatus(a.id, 'aktif', 'pesan-akun', 'Akun ' + a.nama + ' diaktifkan kembali.');
        }));
      } else {
        aksi.appendChild(buat('p', 'kecil', 'Atur di Persetujuan Penjual.'));
      }
      baris.appendChild(aksi);
      wadah.appendChild(baris);
    });
  }

  /* ---------- Pengumuman ---------- */
  function muatPengumuman() {
    return db.from('pengumuman')
      .select('id, isi, aktif, dibuat_pada')
      .order('dibuat_pada', { ascending: false })
      .then(function (h) {
        var wadah = $('daftar-pengumuman');
        wadah.textContent = '';
        if (h.error) { pesan('pesan-pengumuman', galatRamah(h.error)); return; }
        var data = h.data || [];
        if (!data.length) {
          wadah.className = '';
          wadah.appendChild(kosong('Belum ada pengumuman', 'Tulis pengumuman pertamamu di atas.'));
          return;
        }
        wadah.className = 'daftar';
        data.forEach(function (p) {
          var baris = buat('div', 'baris-akun');
          var info = buat('div');
          info.appendChild(buat('p', '', p.isi));
          info.lastChild.style.fontSize = '1rem';
          info.appendChild(buat('p', 'kecil', 'Diterbitkan ' + tanggal(p.dibuat_pada)));
          baris.appendChild(info);

          var aksi = buat('div', 'baris-aksi');
          aksi.appendChild(buat('span', p.aktif ? 'badge badge-buka' : 'badge badge-batal', p.aktif ? 'Tampil' : 'Disembunyikan'));
          aksi.appendChild(tombol(p.aktif ? 'Sembunyikan' : 'Tampilkan', 'tombol-garis', function (b) {
            b.disabled = true;
            db.from('pengumuman').update({ aktif: !p.aktif }).eq('id', p.id).then(function (r) {
              if (r.error) { pesan('pesan-pengumuman', galatRamah(r.error)); b.disabled = false; return; }
              pesan('pesan-pengumuman', p.aktif ? 'Pengumuman disembunyikan.' : 'Pengumuman ditampilkan.', 'sukses');
              muatPengumuman();
            });
          }));
          aksi.appendChild(tombolKonfirmasi('Hapus', 'Yakin hapus?', function (b) {
            b.disabled = true;
            db.from('pengumuman').delete().eq('id', p.id).then(function (r) {
              if (r.error) { pesan('pesan-pengumuman', galatRamah(r.error)); b.disabled = false; return; }
              pesan('pesan-pengumuman', 'Pengumuman dihapus.', 'sukses');
              muatPengumuman();
            });
          }));
          baris.appendChild(aksi);
          wadah.appendChild(baris);
        });
      });
  }

  function aturFormPengumuman() {
    var form = $('form-pengumuman');
    var isian = $('isi-pengumuman');
    var hitung = $('hitung-huruf');

    isian.addEventListener('input', function () { hitung.textContent = isian.value.length + ' / 300'; });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var teks = isian.value.trim();
      if (!teks) return pesan('pesan-pengumuman', 'Tulis isi pengumuman dulu.');
      if (teks.length > 300) return pesan('pesan-pengumuman', 'Pengumuman maksimal 300 huruf.');

      var tombolKirim = form.querySelector('[type="submit"]');
      tombolKirim.disabled = true;
      db.from('pengumuman').insert({ isi: teks, dibuat_oleh: profilPengelola.id }).then(function (r) {
        tombolKirim.disabled = false;
        if (r.error) return pesan('pesan-pengumuman', galatRamah(r.error));
        isian.value = '';
        hitung.textContent = '0 / 300';
        pesan('pesan-pengumuman', 'Pengumuman diterbitkan.', 'sukses');
        muatPengumuman();
      });
    });
  }

  /* ---------- Mulai ---------- */
  function muatSemua() {
    return Promise.all([muatRingkasan(), muatAkun(), muatPengumuman()]);
  }

  function mulai(profil) {
    profilPengelola = profil;

    document.querySelectorAll('[data-filter-peran]').forEach(function (b) {
      b.addEventListener('click', function () {
        filterPeran = b.getAttribute('data-filter-peran');
        document.querySelectorAll('[data-filter-peran]').forEach(function (x) {
          x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
        });
        gambarAkun();
      });
    });

    $('cari-akun').addEventListener('input', function (e) { kataCari = e.target.value.trim(); gambarAkun(); });

    document.querySelectorAll('[data-muat-ulang]').forEach(function (b) {
      b.addEventListener('click', function () {
        b.disabled = true;
        muatSemua().then(function () { b.disabled = false; });
      });
    });

    aturFormPengumuman();
    muatSemua();
  }

  if (window.profilSaya) mulai(window.profilSaya);
  else document.addEventListener('profil-siap', function (e) { mulai(e.detail); });
})();
