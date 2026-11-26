/* ============================================================
   dashboard-umum.js  |  Dipakai semua dashboard
   - memeriksa login dan peran (dashboard peran lain diblokir)
   - mengisi nama pengguna, tombol Keluar
   ============================================================ */
(function () {
  'use strict';

  var peran = document.body.getAttribute('data-peran');

  document.querySelectorAll('[data-keluar]').forEach(function (tombol) {
    tombol.addEventListener('click', function () { Auth.keluar(); });
  });

  Auth.jagaHalaman(peran).then(function (profil) {
    window.profilSaya = profil;
    document.querySelectorAll('[data-nama-pengguna]').forEach(function (el) { el.textContent = profil.nama; });
    var sapa = document.querySelector('[data-sapa]');
    if (sapa) sapa.textContent = 'Halo, ' + profil.nama + '. ' + sapa.textContent;
    // File lain (tahap berikutnya) bisa mendengarkan peristiwa ini
    document.dispatchEvent(new CustomEvent('profil-siap', { detail: profil }));
  });
})();
