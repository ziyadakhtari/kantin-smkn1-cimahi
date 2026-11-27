/* ============================================================
   pengumuman.js  |  Menampilkan pengumuman terbaru di strip oranye
   Dipakai di beranda (index.html) dan dashboard pembeli.
   Membutuhkan elemen #pengumuman dan #pengumuman-isi, serta variabel "db".
   Pengumuman bisa dibaca siapa saja selama statusnya Tampil (aturan RLS).
   ============================================================ */
(function () {
  'use strict';

  var kotak = document.getElementById('pengumuman');
  var isi = document.getElementById('pengumuman-isi');
  if (!kotak || !isi || typeof db === 'undefined') return;

  function muat() {
    db.from('pengumuman')
      .select('isi')
      .eq('aktif', true)
      .order('dibuat_pada', { ascending: false })
      .limit(1)
      .then(function (hasil) {
        var baris = hasil && hasil.data && hasil.data[0];
        if (hasil.error || !baris) { kotak.hidden = true; return; }
        isi.textContent = baris.isi;     // textContent: aman dari kode berbahaya
        kotak.hidden = false;
      });
  }

  muat();

  // Berubah sendiri saat pengelola menerbitkan atau menyembunyikan pengumuman
  try {
    db.channel('pengumuman-publik')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pengumuman' }, muat)
      .subscribe();
  } catch (e) { /* tanpa realtime pun tetap jalan, cukup muat ulang halaman */ }
})();
