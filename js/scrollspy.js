/* ============================================================
   scrollspy.js  |  Tab menempel yang mengikuti posisi scroll
   - Tab aktif berubah sesuai bagian yang sedang tampil di layar.
   - Klik tab = smooth scroll ke bagian itu.

   Cara pakai di HTML:
     <nav class="tab-nav" data-tab-nav aria-label="Bagian halaman">
       <ul><li><a href="#pesanan">Pesanan</a></li> ...</ul>
     </nav>
     <section id="pesanan" class="bagian-tab"> ... </section>
   ============================================================ */
(function () {
  'use strict';

  function aktifkanScrollSpy(nav) {
    var tautan = Array.prototype.slice.call(nav.querySelectorAll('a[href^="#"]'));
    var bagian = tautan.map(function (a) { return document.querySelector(a.getAttribute('href')); });
    if (!tautan.length || bagian.some(function (b) { return !b; })) return;

    var terakhir = null;
    var menunggu = false;

    function geserTab(a) {
      var kiri = a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2;
      nav.scrollTo({ left: Math.max(0, kiri), behavior: 'smooth' });
    }

    function perbarui() {
      menunggu = false;
      var batas = nav.offsetHeight + 24;
      var aktif = 0;
      bagian.forEach(function (b, i) { if (b.getBoundingClientRect().top <= batas) aktif = i; });
      var diDasar = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (diDasar) aktif = bagian.length - 1;

      if (aktif === terakhir) return;
      terakhir = aktif;
      tautan.forEach(function (a, i) { a.setAttribute('aria-current', i === aktif ? 'true' : 'false'); });
      geserTab(tautan[aktif]);
    }

    function jadwalkan() {
      if (menunggu) return;
      menunggu = true;
      requestAnimationFrame(perbarui);
    }

    tautan.forEach(function (a, i) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var tujuan = bagian[i];
        var offset = -nav.offsetHeight;
        if (window.lenis) {
          window.lenis.scrollTo(tujuan, { offset: offset, duration: 1.2 });
        } else {
          var y = tujuan.getBoundingClientRect().top + window.scrollY + offset;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }
        if (history.replaceState) history.replaceState(null, '', a.getAttribute('href'));
      });
    });

    window.addEventListener('scroll', jadwalkan, { passive: true });
    window.addEventListener('resize', jadwalkan);
    perbarui();
  }

  window.aktifkanScrollSpy = aktifkanScrollSpy;

  function mulai() {
    document.querySelectorAll('[data-tab-nav]').forEach(aktifkanScrollSpy);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mulai);
  else mulai();
})();
