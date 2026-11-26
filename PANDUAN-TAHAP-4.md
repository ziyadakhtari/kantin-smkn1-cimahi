# Tahap 4: Login, Daftar, dan Pengalihan per Peran

## Isi paket ini (file baru dan file yang berubah)
```
login.html               daftar-pembeli.html      daftar-penjual.html
pembeli.html             penjual.html             pengelola.html      (kerangka dashboard)
css/halaman.css          (DIPERBARUI: gaya halaman masuk/daftar)
js/auth.js               js/halaman-auth.js       js/dashboard-umum.js
```
**Jangan timpa `js/supabase-client.js`.** File itu sudah berisi URL dan kunci kamu, dan tidak ada di paket ini.

## Cara memasukkan ke GitHub
1. Ekstrak `kantin-tahap-4.zip`.
2. Di repo GitHub, klik **Add file > Upload files**.
3. Tarik **isi** folder hasil ekstrak (6 file `.html`, folder `css`, folder `js`, dan file `PANDUAN-TAHAP-4.md`). File lama dengan nama sama, yaitu `css/halaman.css`, akan tergantikan. Di GitHub, folder `css` dan `js` yang ditarik akan digabung dengan folder lama.
4. Klik **Commit changes**. Tunggu 1 sampai 3 menit sampai GitHub Pages ter-update, lalu muat ulang dengan **Ctrl+F5**.

Pastikan di repo ada folder `js` dengan 6 file: `animasi.js`, `auth.js`, `dashboard-umum.js`, `halaman-auth.js`, `scrollspy.js`, `supabase-client.js`.

## Cara menguji
Buka situsmu di GitHub Pages, lalu kerjakan berurutan.

**1. Pembeli**
- [ ] Klik **Masuk > Daftar sebagai pembeli**. Pilih **Siswa**: kolom Kelas dan jurusan muncul. Pilih **Guru**: kolom itu hilang.
- [ ] Isi form lalu klik **Buat akun**. Kamu langsung masuk ke **Dashboard pembeli** dan namamu tampil di sapaan.
- [ ] Coba ketik alamat `.../penjual.html` dan `.../pengelola.html`. Kamu harus dikembalikan ke dashboard pembeli.
- [ ] Klik **Keluar**. Kamu kembali ke beranda.
- [ ] Buka `.../pembeli.html` saat sudah keluar. Kamu harus diarahkan ke halaman masuk.

**2. Penjual**
- [ ] Daftar sebagai penjual dengan email lain. Layar "Pendaftaran terkirim" muncul.
- [ ] Coba masuk dengan akun penjual itu. Muncul pesan bahwa pendaftaran menunggu persetujuan, dan kamu tidak masuk ke dashboard.
- [ ] Di Supabase > **Table Editor > kantin**: muncul kantin baru milik penjual itu.

**3. Setujui penjual (sementara lewat SQL)**
Halaman persetujuan di dashboard pengelola baru dibuat di Tahap 5. Untuk sekarang, jalankan di **SQL Editor** dengan mengganti emailnya:
```sql
update public.profil set status_akun = 'aktif'
where id = (select id from auth.users where lower(email) = lower('EMAIL-PENJUAL-TADI'));
```
- [ ] Masuk lagi dengan akun penjual itu. Kamu masuk ke **Dashboard penjual**.
- [ ] Untuk menguji penolakan, ganti `'aktif'` dengan `'ditolak'`, jalankan, lalu coba masuk. Pesan penolakan harus tampil jelas. Sesudah itu kembalikan ke `'aktif'` jika perlu.

**4. Pengelola**
- [ ] Masuk dengan akun pengelola yang dibuat di Tahap 2. Kamu masuk ke **Dashboard pengelola**.

**5. Peran tidak bisa diubah sendiri (uji keamanan)**
- [ ] Masuk sebagai pembeli, lalu tekan **F12 > Console**, tempel dan Enter:
```js
const { data } = await db.auth.getUser();
await db.from('profil').update({ peran: 'pengelola' }).eq('id', data.user.id)
```
Hasil yang benar: ada `error` dengan pesan `permission denied for table profil`. Jika perannya malah berubah, kabari saya.

**6. Tampilan**
- [ ] Di HP atau jendela selebar 390 piksel: form tidak melebar, tombol mudah ditekan, dan tab dashboard bisa digeser ke samping.
- [ ] Gulir dashboard: tab yang aktif berpindah otomatis dan menandai bagian yang sedang tampil.

## Jika ada masalah
| Gejala | Penyebab dan solusi |
|---|---|
| Setelah daftar pembeli muncul "Buka emailmu dan klik tautan konfirmasi" | **Confirm email** di Supabase masih menyala. Matikan di Authentication > Sign In / Providers > Email. |
| Tombol Masuk atau Daftar tidak berbuat apa-apa | Buka **F12 > Console**. Jika ada tulisan seperti `supabase is not defined` atau `Invalid API key`, periksa isi `js/supabase-client.js` (URL dan kunci publishable). |
| "Terlalu sering mencoba" | Batas percobaan dari Supabase. Tunggu beberapa menit. |
| Halaman dashboard kosong lalu kembali ke login | Akun tidak punya profil atau belum aktif. Cek tabel `profil` di Supabase. |
| Pesan "Profil akunmu tidak ditemukan" | Akun dibuat sebelum SQL `03-fungsi.sql` dijalankan. Jalankan file itu, lalu daftar ulang dengan email lain. |

## Catatan keamanan
- Penjagaan halaman di JavaScript hanya mengarahkan pengguna ke dashboard yang benar. Yang benar-benar melindungi data adalah aturan RLS di database, yang sudah kita pasang di Tahap 2.
- Peran selalu dibaca dari tabel `profil`. Peran yang dikirim saat mendaftar hanya diterima jika `penjual` atau `pembeli`, dan apa pun selain itu dijadikan `pembeli` oleh database.
