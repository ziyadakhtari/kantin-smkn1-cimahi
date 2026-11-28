# Pelayanan Kantin SMK Negeri 1 Cimahi

Website pemesanan kantin sekolah. Siswa, guru, dan pegawai memesan makanan dan minuman secara online, lalu mengambil sendiri di kantin dengan nomor antrean. Pembayaran Cash atau QRIS dilakukan di kantin saat pesanan diambil.

## Tiga peran

| Peran | Cara mendapat akun | Bisa apa |
|---|---|---|
| Pembeli | Daftar sendiri, langsung aktif | Lihat menu, pesan, pantau status, riwayat |
| Penjual | Daftar sendiri, **menunggu persetujuan pengelola** | Atur profil kantin dan menu, terima dan proses pesanan, lihat laporan penjualan |
| Pengelola | Dibuat manual di dashboard Supabase | Setujui penjual, kelola akun, pengumuman |

## Teknologi

- HTML, CSS, dan JavaScript biasa (tanpa framework)
- GSAP + ScrollTrigger, Motion, Lenis (dari CDN) untuk animasi dan scroll
- Supabase: Auth, PostgreSQL, Storage, Realtime
- GitHub Pages untuk publikasi

## Struktur folder

```
index.html, login.html, daftar-*.html     halaman publik
pembeli.html, penjual.html, pengelola.html dashboard per peran
css/        tema, komponen, gaya halaman
js/         logika tiap halaman (supabase-client.js berisi koneksi)
sql/        skrip database, dijalankan berurutan 01 sampai 06
aset/       gambar latar, logo, favicon, bunyi notifikasi
PANDUAN*.md langkah pemasangan tiap tahap
```

## Keamanan singkat

- `js/supabase-client.js` hanya berisi **Project URL** dan kunci **anon/publishable**. Kunci ini memang untuk browser, dan data dilindungi aturan RLS di database.
- Kunci `service_role` / `secret` dan password database **tidak boleh** ada di repository ini.
- Semua tabel memakai RLS. Peran akun tidak bisa diubah sendiri oleh pengguna. Harga dan total pesanan dihitung di database, bukan di browser.

## Memasang dari nol

Ikuti `PANDUAN.md`, lalu `PANDUAN-TAHAP-4.md` dan seterusnya sesuai urutan.
