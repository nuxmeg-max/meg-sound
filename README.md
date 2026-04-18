# MEG Music

Website pemutar musik berbasis YouTube dengan akun per-device via Firebase.

## Struktur File

```
meg-music/
├── index.html   → Struktur halaman
├── style.css    → Styling & tema
├── app.js       → Logic, Firebase, API, player
├── vercel.json  → Config deploy Vercel
└── README.md    → Dokumentasi
```

## Fitur

- 🎵 Search & play musik dari YouTube (MP3)
- 👤 Input nama pertama kali masuk — tersimpan per device
- ♥  Like lagu — tersimpan di Firebase
- 📋 Playlist pribadi — klik kanan card untuk tambah
- 🌗 Dark / Light mode
- ⌨️ Keyboard: `Space` play/pause, `←→` prev/next
- 📱 Responsive mobile

## Cara Tambah ke Playlist

- **Desktop**: Klik kanan pada card lagu → otomatis masuk playlist
- **Mobile**: Tekan lama pada card lagu

## Deploy ke Vercel

1. Upload semua file ke GitHub repo baru
2. Buka vercel.com → Add New Project → import repo
3. Klik Deploy ✅

## Firestore Rules (Penting!)

Setelah deploy, ganti Firestore rules di Firebase Console agar lebih aman:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if true;
    }
  }
}
```
