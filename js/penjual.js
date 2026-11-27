/* ============================================================
   penjual.js  |  Dashboard penjual, bagian Kelola Menu dan Profil Kantin
   Dijalankan setelah dashboard-umum.js memastikan pengguna adalah penjual aktif.
   Semua perubahan dicek lagi oleh aturan RLS di database:
   penjual hanya bisa mengubah kantin dan menu miliknya sendiri.
   ============================================================ */
(function () {
  'use strict';

  var $ = Alat.$, buat = Alat.buat, pesan = Alat.pesan;

  var NAMA_KATEGORI = { makanan_berat: 'Makanan berat', jajanan: 'Jajanan', minuman: 'Minuman' };

  var profil = null;
  var kantin = null;
  var semuaMenu = [];
  var filterKategori = 'semua';
  var sedangUbah = null;     // menu yang sedang diubah (null = menambah menu baru)
  var fotoBaru = null;       // Blob foto yang dipilih
  var hapusFoto = false;
  var urlPratinjau = null;

  /* ---------- Berkas di penyimpanan ---------- */
  function hapusBerkas(bucket, url) {
    var jalur = Alat.jalurDariUrl(url, bucket);
    if (!jalur) return Promise.resolve();
    return db.storage.from(bucket).remove([jalur]).then(function () {}, function () {});   // gagal hapus file lama tidak perlu mengganggu pengguna
  }

  function unggah(bucket, awalan, blob) {
    var jalur = kantin.id + '/' + Alat.namaBerkas(awalan, blob.type);     // folder = id kantin (aturan RLS penyimpanan)
    return db.storage.from(bucket).upload(jalur, blob, { contentType: blob.type }).then(function (h) {
      if (h.error) throw h.error;
      return { jalur: jalur, url: db.storage.from(bucket).getPublicUrl(jalur).data.publicUrl };
    });
  }

  function sibuk(tombolEl, ya, teksAwal, teksSibuk) {
    tombolEl.disabled = ya;
    tombolEl.textContent = ya ? (teksSibuk || 'Menyimpan...') : teksAwal;
  }

  /* ============================================================
     PROFIL KANTIN
     ============================================================ */
  function gambarStatus() {
    var buka = !!kantin.sedang_buka;
    $('teks-status').textContent = buka ? 'Kantin sedang buka' : 'Kantin sedang tutup';
    $('teks-status-ket').textContent = buka
      ? 'Pembeli bisa melihat menumu dan membuat pesanan.'
      : 'Pembeli tidak bisa membuat pesanan baru saat kantin tutup.';
    var tb = $('tombol-buka-tutup');
    tb.textContent = buka ? 'Tutup kantin' : 'Buka kantin';
    tb.className = 'tombol ' + (buka ? 'tombol-garis' : 'tombol-utama');
    tb.disabled = false;
    var lencana = $('badge-status-kantin');
    lencana.textContent = buka ? 'Kantin buka' : 'Kantin tutup';
    lencana.className = 'badge ' + (buka ? 'badge-buka' : 'badge-batal');
  }

  function gambarQris() {
    var kotak = $('pratinjau-qris');
    var img = kotak.querySelector('img');
    var ada = !!kantin.url_qris;
    kotak.hidden = !ada;
    img.src = ada ? kantin.url_qris : '';
    $('tombol-hapus-qris-tempat').textContent = '';
    if (ada) {
      $('tombol-hapus-qris-tempat').appendChild(Alat.tombolKonfirmasi('Hapus QRIS', 'Yakin hapus QRIS?', function (b) {
        b.disabled = true;
        var lama = kantin.url_qris;
        db.from('kantin').update({ url_qris: null }).eq('id', kantin.id).then(function (h) {
          if (h.error) { pesan('pesan-profil', Alat.galatRamah(h.error)); b.disabled = false; return; }
          kantin.url_qris = null;
          hapusBerkas('qris', lama);
          gambarQris();
          pesan('pesan-profil', 'QRIS dihapus. Pembeli tidak akan melihat pilihan bayar QRIS.', 'sukses');
        });
      }));
    }
    $('ket-qris').textContent = ada
      ? 'Pembeli akan melihat gambar ini saat memilih bayar dengan QRIS.'
      : 'Belum ada QRIS. Pilihan bayar QRIS baru muncul bagi pembeli setelah kamu mengunggahnya.';
  }

  function isiProfil() {
    $('profil-nama').value = kantin.nama || '';
    $('profil-deskripsi').value = kantin.deskripsi || '';
    gambarStatus();
    gambarQris();
  }

  function aturProfil() {
    $('tombol-buka-tutup').addEventListener('click', function (e) {
      var tb = e.currentTarget;
      tb.disabled = true;
      pesan('pesan-profil', '');
      var tujuan = !kantin.sedang_buka;
      db.from('kantin').update({ sedang_buka: tujuan }).eq('id', kantin.id).then(function (h) {
        if (h.error) { pesan('pesan-profil', Alat.galatRamah(h.error)); tb.disabled = false; return; }
        kantin.sedang_buka = tujuan;
        gambarStatus();
        pesan('pesan-profil', tujuan ? 'Kantin dibuka. Pembeli sudah bisa memesan.' : 'Kantin ditutup. Pesanan baru tidak diterima.', 'sukses');
      });
    });

    $('form-profil').addEventListener('submit', function (e) {
      e.preventDefault();
      var nama = $('profil-nama').value.trim();
      if (!nama) return pesan('pesan-profil', 'Nama kantin tidak boleh kosong.');
      var simpan = e.currentTarget.querySelector('[type="submit"]');
      sibuk(simpan, true, 'Simpan profil');
      db.from('kantin').update({ nama: nama, deskripsi: $('profil-deskripsi').value.trim() || null }).eq('id', kantin.id).then(function (h) {
        sibuk(simpan, false, 'Simpan profil');
        if (h.error) return pesan('pesan-profil', Alat.galatRamah(h.error));
        kantin.nama = nama;
        kantin.deskripsi = $('profil-deskripsi').value.trim() || null;
        pesan('pesan-profil', 'Profil kantin disimpan.', 'sukses');
      });
    });

    $('berkas-qris').addEventListener('change', function (e) {
      var berkas = e.target.files && e.target.files[0];
      if (!berkas) return;
      pesan('pesan-profil', 'Mengunggah QRIS...', 'info');
      Alat.kecilkanGambar(berkas, 1200, 0.92)          // kualitas tinggi supaya kode QR tetap tajam
        .then(function (blob) { return unggah('qris', 'qris', blob); })
        .then(function (hasil) {
          var lama = kantin.url_qris;
          return db.from('kantin').update({ url_qris: hasil.url }).eq('id', kantin.id).then(function (h) {
            if (h.error) { db.storage.from('qris').remove([hasil.jalur]); throw h.error; }
            kantin.url_qris = hasil.url;
            if (lama) hapusBerkas('qris', lama);
            gambarQris();
            pesan('pesan-profil', 'QRIS berhasil diunggah.', 'sukses');
          });
        })
        .catch(function (g) { pesan('pesan-profil', Alat.galatRamah(g)); })
        .then(function () { e.target.value = ''; });
    });
  }

  /* ============================================================
     KELOLA MENU
     ============================================================ */
  function muatMenu() {
    return db.from('menu')
      .select('id, nama, deskripsi, harga, kategori, stok, habis, url_foto, dibuat_pada')
      .eq('kantin_id', kantin.id)
      .order('dibuat_pada', { ascending: false })
      .then(function (h) {
        if (h.error) { pesan('pesan-menu', Alat.galatRamah(h.error)); return; }
        semuaMenu = h.data || [];
        gambarMenu();
      });
  }

  function gambarMenu() {
    var wadah = $('daftar-menu');
    wadah.textContent = '';
    var daftar = semuaMenu.filter(function (m) { return filterKategori === 'semua' || m.kategori === filterKategori; });

    if (!daftar.length) {
      wadah.className = '';
      wadah.appendChild(semuaMenu.length
        ? Alat.kosong('Tidak ada menu di kategori ini', 'Pilih kategori lain atau tambah menu baru.')
        : Alat.kosong('Belum ada menu', 'Tambah menu pertamamu supaya pembeli bisa memesan.'));
      return;
    }
    wadah.className = 'grid-kartu';
    daftar.forEach(function (m) { wadah.appendChild(kartuMenu(m)); });
    if (window.Animasi) window.Animasi.kartu(wadah);
  }

  function kartuMenu(m) {
    var kartu = buat('article', 'kartu' + (m.habis ? ' is-habis' : ''));
    kartu.setAttribute('data-kartu', '');

    var foto = buat('div', 'kartu-foto');
    if (m.url_foto) {
      var img = buat('img');
      img.src = m.url_foto; img.alt = ''; img.loading = 'lazy';
      foto.appendChild(img);
    }
    if (m.habis) foto.appendChild(buat('span', 'label-habis', 'Habis'));
    kartu.appendChild(foto);

    var isi = buat('div', 'kartu-isi');
    isi.appendChild(buat('h3', '', m.nama));
    if (m.deskripsi) isi.appendChild(buat('p', '', m.deskripsi));
    isi.appendChild(buat('p', 'kecil', 'Kategori: ' + (NAMA_KATEGORI[m.kategori] || m.kategori)));
    isi.appendChild(buat('p', 'kecil', m.stok === null || m.stok === undefined ? 'Stok tidak dibatasi' : 'Stok: ' + m.stok));

    var baris = buat('div', 'kartu-baris');
    baris.appendChild(buat('span', 'harga', Alat.rupiah(m.harga)));
    isi.appendChild(baris);

    var aksi = buat('div', 'aksi-kartu');
    aksi.appendChild(Alat.tombol('Ubah', 'tombol-garis', function () { bukaForm(m); }));
    aksi.appendChild(Alat.tombol(m.habis ? 'Tersedia lagi' : 'Tandai habis', 'tombol-garis', function (b) { ubahHabis(m, b); }));
    aksi.appendChild(Alat.tombolKonfirmasi('Hapus', 'Yakin hapus?', function (b) { hapusMenu(m, b); }));
    isi.appendChild(aksi);

    kartu.appendChild(isi);
    return kartu;
  }

  function ubahHabis(m, b) {
    pesan('pesan-menu', '');
    if (m.habis && m.stok === 0) {
      pesan('pesan-menu', 'Stok "' + m.nama + '" masih 0. Isi stok dulu lewat tombol Ubah.', 'info');
      bukaForm(m, true);
      return;
    }
    b.disabled = true;
    db.from('menu').update({ habis: !m.habis }).eq('id', m.id).then(function (h) {
      if (h.error) { pesan('pesan-menu', Alat.galatRamah(h.error)); b.disabled = false; return; }
      pesan('pesan-menu', '"' + m.nama + '" ' + (m.habis ? 'tersedia lagi.' : 'ditandai habis.'), 'sukses');
      muatMenu();
    });
  }

  function hapusMenu(m, b) {
    b.disabled = true;
    db.from('menu').delete().eq('id', m.id).then(function (h) {
      if (h.error) { pesan('pesan-menu', Alat.galatRamah(h.error)); b.disabled = false; return; }
      hapusBerkas('foto-menu', m.url_foto);
      pesan('pesan-menu', 'Menu "' + m.nama + '" dihapus.', 'sukses');
      muatMenu();
    });
  }

  /* ---------- Form tambah/ubah menu ---------- */
  function setPratinjau(url) {
    var kotak = $('pratinjau-foto');
    kotak.hidden = !url;
    kotak.querySelector('img').src = url || '';
    $('tombol-hapus-foto').hidden = !url;
  }

  function tutupForm() {
    $('form-menu').hidden = true;
    sedangUbah = null; fotoBaru = null; hapusFoto = false;
    if (urlPratinjau) { URL.revokeObjectURL(urlPratinjau); urlPratinjau = null; }
    $('form-menu').reset();
    $('berkas-foto').value = '';
    setPratinjau('');
  }

  function bukaForm(m, fokusStok) {
    tutupForm();
    sedangUbah = m || null;
    pesan('pesan-form-menu', '');
    $('judul-form-menu').textContent = m ? 'Ubah menu' : 'Tambah menu';
    $('menu-nama').value = m ? m.nama : '';
    $('menu-deskripsi').value = m && m.deskripsi ? m.deskripsi : '';
    $('menu-harga').value = m ? m.harga : '';
    $('menu-stok').value = m && m.stok !== null && m.stok !== undefined ? m.stok : '';
    var radio = document.querySelector('input[name="kategori"][value="' + (m ? m.kategori : 'makanan_berat') + '"]');
    if (radio) radio.checked = true;
    setPratinjau(m && m.url_foto ? m.url_foto : '');
    $('form-menu').hidden = false;
    Alat.gulirKe($('form-menu'));
    setTimeout(function () { (fokusStok ? $('menu-stok') : $('menu-nama')).focus({ preventScroll: true }); }, 350);
  }

  function aturFormMenu() {
    $('tombol-tambah-menu').addEventListener('click', function () { bukaForm(null); });
    $('tombol-batal-menu').addEventListener('click', tutupForm);

    document.querySelectorAll('[data-filter-kategori]').forEach(function (b) {
      b.addEventListener('click', function () {
        filterKategori = b.getAttribute('data-filter-kategori');
        document.querySelectorAll('[data-filter-kategori]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        gambarMenu();
      });
    });

    $('berkas-foto').addEventListener('change', function (e) {
      var berkas = e.target.files && e.target.files[0];
      if (!berkas) return;
      pesan('pesan-form-menu', '');
      Alat.kecilkanGambar(berkas, 1000, 0.82).then(function (blob) {
        fotoBaru = blob; hapusFoto = false;
        if (urlPratinjau) URL.revokeObjectURL(urlPratinjau);
        urlPratinjau = URL.createObjectURL(blob);
        setPratinjau(urlPratinjau);
      }).catch(function (g) {
        e.target.value = '';
        pesan('pesan-form-menu', Alat.galatRamah(g));
      });
    });

    $('tombol-hapus-foto').addEventListener('click', function () {
      fotoBaru = null; hapusFoto = true;
      $('berkas-foto').value = '';
      setPratinjau('');
    });

    $('form-menu').addEventListener('submit', function (e) {
      e.preventDefault();
      pesan('pesan-form-menu', '');

      var nama = $('menu-nama').value.trim();
      var harga = Number($('menu-harga').value);
      var teksStok = $('menu-stok').value.trim();
      var stok = teksStok === '' ? null : Number(teksStok);
      var pilih = document.querySelector('input[name="kategori"]:checked');

      if (!nama) return pesan('pesan-form-menu', 'Nama menu tidak boleh kosong.');
      if ($('menu-harga').value.trim() === '' || !Number.isInteger(harga) || harga < 0) return pesan('pesan-form-menu', 'Harga harus berupa angka bulat, mulai dari 0.');
      if (harga > 10000000) return pesan('pesan-form-menu', 'Harga terlalu besar. Periksa lagi angkanya.');
      if (stok !== null && (!Number.isInteger(stok) || stok < 0)) return pesan('pesan-form-menu', 'Stok harus berupa angka bulat, mulai dari 0. Kosongkan jika tidak dibatasi.');
      if (!pilih) return pesan('pesan-form-menu', 'Pilih kategori menu.');

      var data = {
        nama: nama,
        deskripsi: $('menu-deskripsi').value.trim() || null,
        harga: harga,
        kategori: pilih.value,
        stok: stok
      };
      var urlLama = sedangUbah ? sedangUbah.url_foto : null;
      var jalurBaru = null;
      var simpan = $('tombol-simpan-menu');
      sibuk(simpan, true, 'Simpan menu');

      var langkah = Promise.resolve();
      if (fotoBaru) {
        langkah = unggah('foto-menu', 'menu', fotoBaru).then(function (hasil) {
          jalurBaru = hasil.jalur; data.url_foto = hasil.url;
        });
      } else if (hapusFoto && sedangUbah) {
        data.url_foto = null;
      }

      langkah.then(function () {
        // "habis" sengaja tidak dikirim: database yang mengatur (stok 0 = otomatis habis)
        return sedangUbah
          ? db.from('menu').update(data).eq('id', sedangUbah.id)
          : db.from('menu').insert(Object.assign({ kantin_id: kantin.id }, data));
      }).then(function (h) {
        if (h.error) {
          if (jalurBaru) db.storage.from('foto-menu').remove([jalurBaru]);   // bersihkan foto yang sudah terunggah
          throw h.error;
        }
        if (urlLama && (jalurBaru || hapusFoto)) hapusBerkas('foto-menu', urlLama);
        var nama2 = data.nama;
        var tambah = !sedangUbah;
        tutupForm();
        pesan('pesan-menu', 'Menu "' + nama2 + '" ' + (tambah ? 'ditambahkan.' : 'diperbarui.'), 'sukses');
        return muatMenu();
      }).catch(function (g) {
        pesan('pesan-form-menu', Alat.galatRamah(g));
      }).then(function () {
        sibuk(simpan, false, 'Simpan menu');
      });
    });
  }

  /* ============================================================
     MULAI
     ============================================================ */
  function mulai(p) {
    profil = p;
    aturProfil();
    aturFormMenu();

    db.from('kantin')
      .select('id, nama, deskripsi, sedang_buka, url_qris')
      .eq('pemilik_id', profil.id)
      .maybeSingle()
      .then(function (h) {
        if (h.error || !h.data) {
          var teks = 'Data kantinmu tidak ditemukan. Hubungi pengelola kantin.';
          pesan('pesan-menu', teks); pesan('pesan-profil', teks);
          $('tombol-tambah-menu').disabled = true;
          return;
        }
        kantin = h.data;
        isiProfil();
        muatMenu();

        // Stok berubah sendiri saat pembeli memesan: muat ulang otomatis
        try {
          db.channel('menu-saya')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'menu', filter: 'kantin_id=eq.' + kantin.id }, function () { muatMenu(); })
            .subscribe();
        } catch (e) { /* tanpa realtime pun tetap jalan */ }
      });
  }

  if (window.profilSaya) mulai(window.profilSaya);
  else document.addEventListener('profil-siap', function (e) { mulai(e.detail); });
})();
