/* ============================================================
   auth.js  |  Login, pendaftaran, dan penjaga halaman per peran
   Membutuhkan: supabase-js (CDN) dan js/supabase-client.js (variabel "db").

   PENTING: penjaga halaman di sini hanya untuk kenyamanan tampilan
   (mengarahkan orang ke dashboard yang benar). Keamanan sebenarnya ada
   di aturan RLS di database. Peran selalu dibaca dari tabel "profil",
   TIDAK PERNAH dari data yang dikirim browser.
   ============================================================ */
var Auth = (function () {
  'use strict';

  var HALAMAN_PERAN = {
    pengelola: 'pengelola.html',
    penjual:   'penjual.html',
    pembeli:   'pembeli.html'
  };

  var PESAN_STATUS = {
    menunggu: 'Pendaftaranmu sedang menunggu persetujuan pengelola kantin. Coba masuk lagi nanti.',
    ditolak:  'Maaf, pendaftaran penjual ditolak oleh pengelola kantin. Hubungi pengelola kantin jika ada pertanyaan.',
    nonaktif: 'Akunmu sedang dinonaktifkan. Hubungi pengelola kantin untuk mengaktifkannya kembali.'
  };

  /* ---------- Pesan galat ramah ---------- */
  function terjemahGalat(galat) {
    var teks = ((galat && galat.message) || '').toLowerCase();
    if (teks.indexOf('invalid login credentials') > -1) return 'Email atau password salah.';
    if (teks.indexOf('already registered') > -1 || teks.indexOf('already been registered') > -1) return 'Email ini sudah terdaftar. Silakan masuk.';
    if (teks.indexOf('password should be at least') > -1) return 'Password minimal 8 karakter.';
    if (teks.indexOf('unable to validate email') > -1 || teks.indexOf('invalid email') > -1) return 'Format email belum benar.';
    if (teks.indexOf('rate limit') > -1 || teks.indexOf('too many') > -1) return 'Terlalu sering mencoba. Tunggu beberapa menit lalu coba lagi.';
    if (teks.indexOf('failed to fetch') > -1 || teks.indexOf('network') > -1) return 'Tidak bisa terhubung ke server. Periksa koneksi internetmu.';
    if (teks.indexOf('email not confirmed') > -1) return 'Email belum dikonfirmasi. Cek kotak masuk emailmu.';
    return 'Terjadi masalah. Coba lagi sebentar lagi.';
  }

  /* ---------- Data pengguna ---------- */
  function ambilPengguna() {
    return db.auth.getSession().then(function (hasil) {
      var sesi = hasil && hasil.data && hasil.data.session;
      return sesi ? sesi.user : null;
    });
  }

  function ambilProfil(idPengguna) {
    return db.from('profil')
      .select('id, nama, peran, status_akun, jenis_pembeli, kelas_jurusan')
      .eq('id', idPengguna)
      .maybeSingle()
      .then(function (hasil) {
        if (hasil.error) throw hasil.error;
        return hasil.data;
      });
  }

  function alihkanKeDashboard(profil) {
    window.location.replace(HALAMAN_PERAN[profil.peran] || 'index.html');
  }

  /* ---------- Masuk ---------- */
  // Mengembalikan { galat: 'teks' } jika gagal. Jika berhasil, halaman dialihkan.
  function masuk(email, password) {
    return db.auth.signInWithPassword({ email: email, password: password })
      .then(function (hasil) {
        if (hasil.error) return { galat: terjemahGalat(hasil.error) };
        return ambilProfil(hasil.data.user.id).then(function (profil) {
          if (!profil) {
            return db.auth.signOut().then(function () {
              return { galat: 'Profil akunmu tidak ditemukan. Hubungi pengelola kantin.' };
            });
          }
          if (profil.status_akun !== 'aktif') {
            return db.auth.signOut().then(function () {
              return { galat: PESAN_STATUS[profil.status_akun] || 'Akunmu belum bisa dipakai.', jenis: profil.status_akun === 'menunggu' ? 'info' : 'galat' };
            });
          }
          alihkanKeDashboard(profil);
          return { berhasil: true };
        });
      })
      .catch(function (galat) { return { galat: terjemahGalat(galat) }; });
  }

  /* ---------- Daftar pembeli ---------- */
  function daftarPembeli(d) {
    return db.auth.signUp({
      email: d.email,
      password: d.password,
      options: { data: {
        peran: 'pembeli',
        nama: d.nama,
        jenis_pembeli: d.jenis,
        kelas_jurusan: d.jenis === 'siswa' ? d.kelas : ''
      } }
    }).then(function (hasil) {
      if (hasil.error) return { galat: terjemahGalat(hasil.error) };
      if (!hasil.data.session) {
        // Konfirmasi email masih menyala di Supabase
        return { info: 'Pendaftaran berhasil. Buka emailmu dan klik tautan konfirmasi, lalu masuk.' };
      }
      window.location.replace(HALAMAN_PERAN.pembeli);   // langsung aktif
      return { berhasil: true };
    }).catch(function (galat) { return { galat: terjemahGalat(galat) }; });
  }

  /* ---------- Daftar penjual (menunggu persetujuan) ---------- */
  function daftarPenjual(d) {
    return db.auth.signUp({
      email: d.email,
      password: d.password,
      options: { data: {
        peran: 'penjual',
        nama: d.nama,
        nama_kantin: d.namaKantin,
        no_hp: d.noHp
      } }
    }).then(function (hasil) {
      if (hasil.error) return { galat: terjemahGalat(hasil.error) };
      // Penjual belum boleh masuk sebelum disetujui: keluarkan sesi yang baru terbentuk.
      return db.auth.signOut().then(function () { return { berhasil: true }; });
    }).catch(function (galat) { return { galat: terjemahGalat(galat) }; });
  }

  /* ---------- Penjaga halaman dashboard ---------- */
  // Panggil di dashboard: Auth.jagaHalaman('pembeli').then(function (profil) { ... })
  function jagaHalaman(peranDiizinkan) {
    return ambilPengguna().then(function (pengguna) {
      if (!pengguna) {
        window.location.replace('login.html');
        return new Promise(function () {});
      }
      return ambilProfil(pengguna.id).then(function (profil) {
        if (!profil || profil.status_akun !== 'aktif') {
          return db.auth.signOut().then(function () {
            window.location.replace('login.html?status=' + encodeURIComponent(profil ? profil.status_akun : 'tanpa-profil'));
            return new Promise(function () {});
          });
        }
        if (profil.peran !== peranDiizinkan) {      // blokir dashboard peran lain
          alihkanKeDashboard(profil);
          return new Promise(function () {});
        }
        document.body.classList.remove('memeriksa');
        return profil;
      });
    }).catch(function () {
      window.location.replace('login.html');
      return new Promise(function () {});
    });
  }

  // Dipakai di halaman login/daftar: jika sudah masuk, langsung ke dashboard.
  function alihkanJikaSudahMasuk() {
    return ambilPengguna().then(function (pengguna) {
      if (!pengguna) return;
      return ambilProfil(pengguna.id).then(function (profil) {
        if (profil && profil.status_akun === 'aktif') alihkanKeDashboard(profil);
      });
    }).catch(function () {});
  }

  function keluar() {
    return db.auth.signOut().then(function () { window.location.replace('index.html'); });
  }

  return {
    masuk: masuk,
    daftarPembeli: daftarPembeli,
    daftarPenjual: daftarPenjual,
    jagaHalaman: jagaHalaman,
    alihkanJikaSudahMasuk: alihkanJikaSudahMasuk,
    keluar: keluar,
    pesanStatus: PESAN_STATUS
  };
})();
