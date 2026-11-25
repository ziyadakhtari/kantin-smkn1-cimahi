/* ============================================================
   animasi.js  |  Lenis + GSAP/ScrollTrigger + Motion
   1. Lenis      : smooth scroll di seluruh halaman, terhubung ke ScrollTrigger
   2. GSAP       : judul ([data-judul]) muncul kata demi kata saat di-scroll
   3. Motion     : kartu ([data-kartu]) masuk saat terlihat; efek hover/sentuh
   Semua dimatikan otomatis jika pengguna memilih "kurangi gerakan".
   ============================================================ */
(function () {
  'use strict';

  var kurangiGerak = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var G  = window.gsap;
  var ST = window.ScrollTrigger;
  var M  = window.Motion;
  var punyaGSAP = !!(G && ST);

  if (punyaGSAP) G.registerPlugin(ST);

  /* ---------- 1. Lenis ---------- */
  var lenis = null;
  if (window.Lenis && !kurangiGerak) {
    lenis = new window.Lenis({ duration: 1.1, smoothWheel: true });
    if (punyaGSAP) {
      lenis.on('scroll', ST.update);                              // sinkron dengan ScrollTrigger
      G.ticker.add(function (waktu) { lenis.raf(waktu * 1000); });
      G.ticker.lagSmoothing(0);
    } else {
      var putar = function (waktu) { lenis.raf(waktu); requestAnimationFrame(putar); };
      requestAnimationFrame(putar);
    }
  }
  window.lenis = lenis;

  /* ---------- 2. Judul muncul per kata ---------- */
  function pecahKata(el) {
    if (el.dataset.terpecah) return false;
    var teks = el.textContent.trim();
    var kata = teks.split(/\s+/);
    el.setAttribute('aria-label', teks);          // pembaca layar membaca kalimat utuh
    el.textContent = '';
    kata.forEach(function (k, i) {
      var luar = document.createElement('span');
      luar.className = 'kata';
      luar.setAttribute('aria-hidden', 'true');
      var dalam = document.createElement('span');
      dalam.className = 'kata-isi';
      dalam.textContent = k;
      luar.appendChild(dalam);
      el.appendChild(luar);
      if (i < kata.length - 1) el.appendChild(document.createTextNode(' '));
    });
    el.dataset.terpecah = '1';
    return true;
  }

  function animasiJudul(induk) {
    if (kurangiGerak || !punyaGSAP) return;
    (induk || document).querySelectorAll('[data-judul]').forEach(function (el) {
      if (!pecahKata(el)) return;
      G.from(el.querySelectorAll('.kata-isi'), {
        yPercent: 115,
        duration: 0.85,
        ease: 'power3.out',
        stagger: 0.07,
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      });
    });
  }

  /* ---------- 3. Kartu: masuk + hover/sentuh ---------- */
  function animasiKartu(induk) {
    if (kurangiGerak || !M) return;
    var kartu = (induk || document).querySelectorAll('[data-kartu]:not([data-animasi])');
    kartu.forEach(function (el, i) {
      el.dataset.animasi = '1';

      // Masuk: sekali saja, pelan dan pendek
      if (M.inView && M.animate) {
        el.style.opacity = '0';
        var berhenti;
        berhenti = M.inView(el, function () {
          M.animate(el, { opacity: [0, 1], y: [14, 0] }, { duration: 0.5, delay: (i % 4) * 0.06, ease: 'easeOut' });
          if (berhenti) berhenti();
        }, { margin: '0px 0px -8% 0px' });
      }

      // Hover (mouse) : naik sedikit
      if (M.hover) {
        M.hover(el, function () {
          M.animate(el, { y: -4 }, { duration: 0.18 });
          return function () { M.animate(el, { y: 0 }, { duration: 0.18 }); };
        });
      }
      // Sentuh (HP) : menekan sedikit
      if (M.press) {
        M.press(el, function () {
          M.animate(el, { scale: 0.98 }, { duration: 0.12 });
          return function () { M.animate(el, { scale: 1 }, { duration: 0.18 }); };
        });
      }
    });
  }

  /* ---------- Satu momen saat halaman dibuka: nomor antrean berhitung ---------- */
  function hitungNomor() {
    document.querySelectorAll('[data-hitung]').forEach(function (el) {
      var tujuan = parseInt(el.getAttribute('data-hitung'), 10);
      if (isNaN(tujuan)) return;
      el.textContent = String(tujuan);
      if (kurangiGerak || !M || !M.animate) return;
      M.animate(0, tujuan, {
        duration: 1.4,
        ease: 'easeOut',
        onUpdate: function (v) { el.textContent = String(Math.round(v)); }
      });
    });
  }

  function mulai() {
    animasiJudul();
    animasiKartu();
    hitungNomor();
  }

  // Dipakai file lain setelah menambah konten secara dinamis (daftar menu, pesanan, dst.)
  window.Animasi = { judul: animasiJudul, kartu: animasiKartu };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mulai);
  else mulai();
})();
