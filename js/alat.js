/* ============================================================
   alat.js  |  Alat kecil yang dipakai bersama oleh dashboard
   (dipakai mulai Tahap 6; dashboard pengelola punya salinan sendiri)
   ============================================================ */
var Alat = (function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  // Membuat elemen. Teks selalu lewat textContent, jadi aman dari kode berbahaya.
  function buat(tag, kelas, teks) {
    var e = document.createElement(tag);
    if (kelas) e.className = kelas;
    if (teks !== undefined && teks !== null) e.textContent = teks;
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

  function kosong(judul, teks) {
    var k = buat('div', 'kosong');
    k.innerHTML = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M6 14h36v7a3 3 0 0 0 0 6v7H6v-7a3 3 0 0 0 0-6z"/><path d="M30 14v20" stroke-dasharray="3 3"/></svg>';
    k.appendChild(buat('h3', '', judul));
    k.appendChild(buat('p', '', teks));
    return k;
  }

  function rupiah(angka) {
    return 'Rp' + Number(angka || 0).toLocaleString('id-ID');
  }

  function tanggal(iso) {
    try { return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch (e) { return ''; }
  }

  function galatRamah(g) {
    if (g && g.untukPengguna) return g.message;       // pesan dari kita sendiri sudah ramah
    var t = ((g && g.message) || '').toLowerCase();
    if (t.indexOf('failed to fetch') > -1 || t.indexOf('network') > -1) return 'Tidak bisa terhubung ke server. Periksa koneksi internetmu.';
    if (t.indexOf('row-level security') > -1 || t.indexOf('permission denied') > -1) return 'Aksi ini tidak diizinkan untuk akunmu.';
    if (t.indexOf('maximum allowed size') > -1 || t.indexOf('too large') > -1) return 'Ukuran file terlalu besar.';
    if (t.indexOf('mime') > -1) return 'Jenis file tidak didukung. Pakai JPG, PNG, atau WebP.';
    return 'Terjadi masalah. Coba lagi sebentar lagi.';
  }

  // Menggulir ke elemen dengan memperhitungkan tab menempel di atas
  function gulirKe(el) {
    var tab = document.querySelector('.tab-nav');
    var offset = -((tab ? tab.offsetHeight : 0) + 12);
    if (window.lenis) window.lenis.scrollTo(el, { offset: offset, duration: 1 });
    else window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + offset, behavior: 'smooth' });
  }

  /* ---------- Gambar ---------- */
  // Mengecilkan gambar di browser sebelum diunggah (hemat kuota dan di bawah batas 2 MB).
  // Mengembalikan Promise<Blob>.
  function galatGambar(teks) { var e = new Error(teks); e.untukPengguna = true; return e; }

  function kecilkanGambar(file, sisiMaks, kualitas) {
    return new Promise(function (selesai, gagal) {
      if (!file || file.type.indexOf('image/') !== 0) return gagal(galatGambar('File harus berupa gambar (JPG, PNG, atau WebP).'));
      if (file.size > 15 * 1024 * 1024) return gagal(galatGambar('Gambar terlalu besar. Pilih gambar di bawah 15 MB.'));
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var skala = Math.min(1, sisiMaks / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * skala));
        c.height = Math.max(1, Math.round(img.height * skala));
        var x = c.getContext('2d');
        x.fillStyle = '#ffffff';              // gambar transparan dilatari putih
        x.fillRect(0, 0, c.width, c.height);
        x.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (blob) {
          if (blob) selesai(blob); else gagal(galatGambar('Gambar tidak bisa diproses.'));
        }, 'image/webp', kualitas);
      };
      img.onerror = function () { URL.revokeObjectURL(url); gagal(galatGambar('Gambar tidak bisa dibaca. Coba file lain.')); };
      img.src = url;
    });
  }

  function ekstensi(tipe) {
    return { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }[tipe] || 'webp';
  }

  // Dari alamat publik penyimpanan menjadi jalur file, untuk menghapus file lama.
  function jalurDariUrl(url, bucket) {
    if (!url) return null;
    var penanda = '/' + bucket + '/';
    var i = url.indexOf(penanda);
    if (i < 0) return null;
    try { return decodeURIComponent(url.slice(i + penanda.length).split('?')[0]); } catch (e) { return null; }
  }

  function namaBerkas(awalan, tipe) {
    return awalan + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ekstensi(tipe);
  }

  return {
    $: $, buat: buat, tombol: tombol, tombolKonfirmasi: tombolKonfirmasi, pesan: pesan, kosong: kosong,
    rupiah: rupiah, tanggal: tanggal, galatRamah: galatRamah, gulirKe: gulirKe,
    kecilkanGambar: kecilkanGambar, ekstensi: ekstensi, jalurDariUrl: jalurDariUrl, namaBerkas: namaBerkas
  };
})();
