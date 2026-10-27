# JagoKuis

Kuis multiplayer real-time berbasis arsitektur **Client-Server**.
Server: Node.js (HTTP + **WebSocket**). Client: browser (HTML, CSS, JavaScript).
Tugas Kelompok Sistem Terdistribusi - Bahasa: **JavaScript**.

## Struktur File

```
jagokuis/
├── server.js        # Server HTTP + WebSocket, logika game
├── questions.js     # Bank soal
├── package.json
├── README.md
└── public/          # Sisi client (dibuka di browser)
    ├── index.html
    ├── style.css
    └── app.js
```

## Cara Menjalankan

1. Install Node.js LTS.
2. Buka folder proyek di VS Code, lalu di terminal: `npm install`
3. Jalankan server: `npm start`
4. Buka `http://localhost:3000` di browser.
5. Pemain lain membuka alamat `http://IP-SERVER:3000` (tampil di terminal) dari perangkat di Wi-Fi yang sama.
6. Pemain pertama menjadi **host** dan menekan **Mulai Permainan**.

## Elemen Pemain

- Karakter avatar unik (12 pilihan, tidak boleh kembar) dan warna unik per pemain
- Mahkota 👑 untuk host
- Combo 🔥 untuk jawaban benar beruntun (bonus poin)
- Kartu profil sendiri (avatar, skor, combo) dan perolehan poin per ronde di papan skor

## Aturan Skor

- Jawaban benar = 100 poin
- Bonus kecepatan = hingga 50 poin
- Bonus combo = +10 per jawaban benar beruntun (maksimal +30)
- Jawaban salah atau tidak menjawab memutus combo

## Protokol Pesan (JSON lewat WebSocket)

| Arah | Tipe pesan |
|---|---|
| Client → Server | `join`, `start`, `answer`, `chat` |
| Server → Client | `hello`, `welcome`, `players`, `gameStart`, `question`, `answered`, `result`, `final`, `chat`, `info`, `error` |

Contoh: `{"type":"join","name":"Andi","avatar":"🦊"}` dan `{"type":"answer","choice":"B"}`
