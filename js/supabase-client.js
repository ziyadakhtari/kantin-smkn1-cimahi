/* ============================================================
   supabase-client.js  |  Koneksi ke Supabase
   Dimuat SETELAH library supabase-js dari CDN.

   Isi dua nilai di bawah dari: Supabase > Project Settings > API
     - Project URL
     - kunci publik: "anon" (legacy) atau "publishable" (baru)

   JANGAN PERNAH menaruh kunci "service_role" / "secret" di sini
   atau di file mana pun di GitHub. Kunci itu mengabaikan semua
   aturan keamanan (RLS) dan siapa pun bisa membacanya di GitHub.
   ============================================================ */

const SUPABASE_URL = 'https://vjieiaxvuxmqzbcwcjht.supabase.co';
const SUPABASE_KUNCI_PUBLIK = 'sb_publishable_ZYmTk-pa5FM_rqtn7WJpJw_WvCNOEpZ';

// "db" dipakai oleh semua file JS lain: db.from('menu').select(...)
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KUNCI_PUBLIK);
