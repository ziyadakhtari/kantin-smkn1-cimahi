/* ============================================================
   halaman-auth.js  |  Menghubungkan form login/daftar ke Auth
   Form memakai atribut: data-form="masuk" | "daftar-pembeli" | "daftar-penjual"
   ============================================================ */
(function () {
  'use strict';

  var form = document.querySelector('[data-form]');
  if (!form) return;

  var jenisForm = form.getAttribute('data-form');
  var kotakPesan = document.getElementById('pesan');
  var tombolKirim = form.querySelector('[type="submit"]');
  var teksTombol = tombolKirim.textContent;

  Auth.alihkanJikaSudahMasuk();

  function tampilkanPesan(teks, jenis) {
    kotakPesan.textContent = teks;
    kotakPesan.className = 'pesan pesan-' + (jenis || 'galat');
    kotakPesan.hidden = false;
    kotakPesan.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function sembunyikanPesan() { kotakPesan.hidden = true; }

  function sibuk(ya) {
    tombolKirim.disabled = ya;
    tombolKirim.textContent = ya ? 'Memproses...' : teksTombol;
  }

  function nilai(nama) {
    var el = form.elements[nama];
    return el ? String(el.value).trim() : '';
  }

  // Pesan dari penjaga halaman (mis. akun dinonaktifkan saat sedang membuka dashboard)
  var parameter = new URLSearchParams(window.location.search);
  var statusDariUrl = parameter.get('status');
  if (jenisForm === 'masuk' && statusDariUrl && Auth.pesanStatus[statusDariUrl]) {
    tampilkanPesan(Auth.pesanStatus[statusDariUrl], statusDariUrl === 'menunggu' ? 'info' : 'galat');
  }

  // Tampilkan/sembunyikan password
  form.querySelectorAll('[data-lihat-password]').forEach(function (tombol) {
    tombol.addEventListener('click', function () {
      var isian = document.getElementById(tombol.getAttribute('data-lihat-password'));
      var tampil = isian.type === 'password';
      isian.type = tampil ? 'text' : 'password';
      tombol.textContent = tampil ? 'Sembunyikan' : 'Tampilkan';
      tombol.setAttribute('aria-pressed', tampil ? 'true' : 'false');
    });
  });

  // Kelas/jurusan hanya untuk siswa
  var bagianKelas = document.getElementById('bagian-kelas');
  if (bagianKelas) {
    var atur = function () {
      var terpilih = form.querySelector('input[name="jenis"]:checked');
      var siswa = terpilih && terpilih.value === 'siswa';
      bagianKelas.hidden = !siswa;
      form.elements.kelas.required = !!siswa;
    };
    form.querySelectorAll('input[name="jenis"]').forEach(function (r) { r.addEventListener('change', atur); });
    atur();
  }

  function periksaPassword() {
    var pw = form.elements.password.value;
    if (pw.length < 8) return 'Password minimal 8 karakter.';
    var ulang = form.elements.ulangi_password;
    if (ulang && ulang.value !== pw) return 'Password dan pengulangannya belum sama.';
    return '';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    sembunyikanPesan();

    var proses;

    if (jenisForm === 'masuk') {
      proses = Auth.masuk(nilai('email'), form.elements.password.value);

    } else if (jenisForm === 'daftar-pembeli') {
      var galatPw = periksaPassword();
      if (galatPw) return tampilkanPesan(galatPw);
      var jenis = form.querySelector('input[name="jenis"]:checked');
      if (!jenis) return tampilkanPesan('Pilih dulu jenis penggunamu: siswa, guru, atau pegawai.');
      proses = Auth.daftarPembeli({
        nama: nilai('nama'), email: nilai('email'), password: form.elements.password.value,
        jenis: jenis.value, kelas: nilai('kelas')
      });

    } else if (jenisForm === 'daftar-penjual') {
      var galatPw2 = periksaPassword();
      if (galatPw2) return tampilkanPesan(galatPw2);
      proses = Auth.daftarPenjual({
        nama: nilai('nama'), namaKantin: nilai('nama_kantin'), email: nilai('email'),
        noHp: nilai('no_hp'), password: form.elements.password.value
      });
    }

    sibuk(true);
    proses.then(function (hasil) {
      if (hasil.berhasil && jenisForm === 'daftar-penjual') {
        document.getElementById('bagian-form').hidden = true;
        document.getElementById('bagian-selesai').hidden = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (hasil.berhasil) return;                 // halaman sedang dialihkan
      sibuk(false);
      if (hasil.info && !hasil.galat) return tampilkanPesan(hasil.info, 'info');
      tampilkanPesan(hasil.galat, hasil.jenis || 'galat');
    });
  });
})();
