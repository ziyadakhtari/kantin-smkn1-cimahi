# Panduan Kantin SMK Negeri 1 Cimahi

Panduan ini dikerjakan berurutan. Setiap tahap ada bagian **Cara menguji**.
Jangan lanjut ke tahap berikutnya sebelum pengujian tahap ini berhasil.

---

## Tahap 1. Persiapan Supabase dan GitHub

### 1A. Buat project Supabase
1. Buka https://supabase.com, daftar atau masuk, lalu klik **New project**.
2. Isi nama (misalnya `kantin-smkn1-cimahi`), buat **Database Password** dan simpan di tempat aman, pilih region terdekat (Singapore), lalu **Create new project**. Tunggu 1 sampai 2 menit.
3. Buka **Project Settings > API**. Catat dua hal:
   - **Project URL** (bentuknya `https://xxxx.supabase.co`)
   - **Kunci publik**: bernama `anon` atau `publishable`
4. Buka `js/supabase-client.js`, lalu ganti dua nilai `GANTI-...` dengan data di atas.

### Kunci mana yang aman?
| Kunci | Boleh di frontend/GitHub? | Alasan |
|---|---|---|
| `anon` / `publishable` | **Boleh** | Kunci ini memang untuk browser. Data tetap dilindungi aturan RLS di database. |
| `service_role` / `secret` | **TIDAK BOLEH** | Mengabaikan semua RLS. Siapa pun yang memegangnya bisa membaca dan menghapus semua data. |
| Password database | **TIDAK BOLEH** | Akses penuh ke database. |

Jika kunci `service_role` pernah tersalin ke GitHub, anggap sudah bocor. Buat ulang kuncinya di Supabase.

### 1B. Atur login (Authentication)
1. **Authentication > Sign In / Providers > Email**: matikan **Confirm email**. Dengan begitu pembeli langsung aktif setelah daftar, tanpa klik tautan di email.
2. **Authentication > URL Configuration**: isi **Site URL** dengan alamat GitHub Pages kamu (lihat 1D), misalnya `https://USERNAME.github.io/kantin-smkn1-cimahi/`.

### 1C. Buat repo GitHub
1. Buka https://github.com, klik **New repository**, beri nama `kantin-smkn1-cimahi`, pilih **Public**, lalu **Create repository**.
2. Klik **uploading an existing file**, tarik semua isi folder proyek ini (termasuk folder `css`, `js`, `aset`, `sql`, dan file `.nojekyll`), lalu **Commit changes**.

### 1D. Aktifkan GitHub Pages
1. Di repo, buka **Settings > Pages**.
2. Pada **Build and deployment**, pilih **Deploy from a branch**, branch `main`, folder `/ (root)`, lalu **Save**.
3. Tunggu 1 sampai 3 menit. Alamatnya: `https://USERNAME.github.io/kantin-smkn1-cimahi/`.

**Cara menguji Tahap 1**
- Buka alamat GitHub Pages. Beranda tampil dengan latar gelap dan tombol oranye.
- Di Supabase, buka **Project Settings > API** dan pastikan kamu hanya menyalin Project URL dan kunci `anon`/`publishable` ke `supabase-client.js`.

---

## Tahap 2. Database

Buka **Supabase > SQL Editor > New query**. Jalankan empat file di folder `sql/` **berurutan**.
Caranya: buka file, salin seluruh isinya, tempel di SQL Editor, klik **Run**, lalu tunggu hasil "Success".

| Urutan | File | Isinya |
|---|---|---|
| 1 | `01-tabel.sql` | Semua tabel |
| 2 | `02-keamanan-rls.sql` | Aturan keamanan (RLS) dan hak akses |
| 3 | `03-fungsi.sql` | Pendaftaran otomatis, buat pesanan, ubah status, setujui penjual |
| 4 | `04-storage-realtime.sql` | Tempat foto dan Realtime |

Jika file 4 menampilkan error `already member of publication`, abaikan. Artinya Realtime sudah aktif.

### Membuat akun Pengelola (tanpa menyimpan email atau password di kode)
Akun ini dibuat manual di dashboard. Tidak ada halaman daftar untuk peran ini.

1. **Authentication > Users > Add user > Create new user**.
2. Isi email dan password pengelola. Centang **Auto Confirm User**. Klik **Create user**.
3. Buka **SQL Editor**, lalu jalankan skrip ini setelah mengganti email-nya dengan email pengelola tadi:

```sql
insert into public.profil (id, nama, peran, status_akun)
select id, 'Pengelola Kantin', 'pengelola', 'aktif'
from auth.users
where email = 'GANTI-DENGAN-EMAIL-PENGELOLA'
on conflict (id) do update
  set peran = 'pengelola', status_akun = 'aktif', nama = 'Pengelola Kantin';
```

Jangan menyimpan skrip yang sudah berisi email asli di GitHub.

### Cara menguji Tahap 2
1. Cek RLS aktif di semua tabel. Jalankan:
   ```sql
   select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
   ```
   Harus ada 7 tabel dan semuanya `true`.
2. Cek akun pengelola:
   ```sql
   select nama, peran, status_akun from public.profil;
   ```
   Harus ada satu baris: `Pengelola Kantin | pengelola | aktif`.
3. Buka **Database > Tables** dan pastikan tiap tabel bertanda **RLS enabled**.
4. Buka **Storage** dan pastikan ada dua bucket: `foto-menu` dan `qris`.
5. Buka **Advisors > Security Advisor** (jika ada). Tidak boleh ada peringatan merah soal "RLS disabled".

Skrip SQL ini sudah saya uji di PostgreSQL lokal dengan akun palsu. Hasilnya:
- Pembeli tidak bisa mengubah peran sendiri.
- Penjual yang belum disetujui tidak bisa menambah menu.
- Harga dihitung ulang di database walau frontend mengirim harga palsu.
- Nomor antrean urut, stok berkurang, dan menu otomatis habis saat stok 0.
- Pembatalan mengembalikan stok.
- Pembeli lain tidak bisa melihat pesanan orang lain.

Saya belum menguji di Supabase asli, jadi jika ada pesan error saat menjalankan SQL, kirim pesannya ke saya.

---

## Tahap 3. Fondasi tampilan

Palet: Midnight Black `#090A10` (60%), Electric Blue `#2F6BFF` (30%), Sunset Orange `#FF7A1A` (10%).
Tanpa kartu kaca, emoji, efek berkilau, atau bayangan lembut.

### Cara menguji Tahap 3
Buka `index.html` dan `uji-tampilan.html` (di GitHub Pages atau klik dua kali di komputer, tetapi butuh internet untuk font dan library).

- [ ] Latar gelap, judul biru, tombol oranye, tanpa bayangan di kartu.
- [ ] Judul muncul **kata demi kata** saat di-scroll (GSAP).
- [ ] Scroll terasa halus (Lenis).
- [ ] Kartu muncul pelan saat terlihat, naik sedikit saat disorot mouse atau ditekan jari (Motion).
- [ ] Di `uji-tampilan.html`, tab menempel di atas. Saat di-scroll, tab aktif berpindah sendiri. Saat tab diklik, halaman menggulir ke bagiannya.
- [ ] Nomor antrean di beranda berhitung naik sekali saat halaman dibuka.
- [ ] Buka di HP (atau perkecil lebar jendela ke 390 piksel): tidak ada geser samping.
- [ ] Aktifkan "Kurangi gerakan" di pengaturan sistem: semua animasi berhenti dan isi tetap terbaca.

### Hal yang perlu kamu siapkan
- **Logo sekolah:** simpan sebagai `aset/logo-smkn1-cimahi.png`, lalu ganti `<svg>` di `.logo-slot` pada `index.html` dengan `<img src="aset/logo-smkn1-cimahi.png" alt="Logo SMK Negeri 1 Cimahi">`.
- **Foto latar:** tiga foto referensi sudah dikecilkan ke WebP di `aset/`. Pastikan kamu punya hak memakainya, terutama yang dari situs stok.
- Hapus `uji-tampilan.html` sebelum website dipakai siswa.
