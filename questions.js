// Bank soal "Cerdas Cermat Sister"
// answer = indeks jawaban benar (0 = A, 1 = B, 2 = C, 3 = D)

module.exports = [
  {
    text: 'Pola arsitektur di mana satu pihak meminta layanan dan pihak lain memprosesnya lalu membalas disebut...',
    options: ['Peer-to-Peer', 'Client-Server', 'Batch Processing', 'Monolithic'],
    answer: 1,
    explanation: 'Client mengirim request, server memproses dan mengirim response.',
  },
  {
    text: 'Protokol transport yang berorientasi koneksi dan menjamin data sampai secara berurutan adalah...',
    options: ['UDP', 'ICMP', 'TCP', 'ARP'],
    answer: 2,
    explanation: 'TCP memakai handshake, acknowledgement, dan retransmisi.',
  },
  {
    text: 'Modul bawaan Node.js yang dipakai untuk membuat TCP socket adalah...',
    options: ['http', 'net', 'fs', 'path'],
    answer: 1,
    explanation: 'Modul net menyediakan createServer() dan createConnection().',
  },
  {
    text: 'Pertukaran data antar proses/node melalui jaringan dengan mengirim dan menerima pesan disebut...',
    options: ['Shared memory', 'Message passing', 'Multithreading', 'Caching'],
    answer: 1,
    explanation: 'Pada sistem terdistribusi tidak ada memori bersama, jadi komunikasi lewat message passing.',
  },
  {
    text: 'Port default protokol HTTP adalah...',
    options: ['21', '22', '443', '80'],
    answer: 3,
    explanation: 'HTTP memakai port 80, sedangkan HTTPS memakai port 443.',
  },
  {
    text: 'RPC adalah singkatan dari...',
    options: [
      'Remote Procedure Call',
      'Rapid Process Control',
      'Reliable Packet Channel',
      'Resource Provisioning Cluster',
    ],
    answer: 0,
    explanation: 'RPC memungkinkan pemanggilan fungsi di komputer lain seolah-olah lokal.',
  },
  {
    text: 'TCP berada pada layer ke berapa dalam model OSI?',
    options: ['Layer 2 (Data Link)', 'Layer 3 (Network)', 'Layer 4 (Transport)', 'Layer 7 (Application)'],
    answer: 2,
    explanation: 'TCP dan UDP berada di Layer 4 (Transport).',
  },
  {
    text: 'Tiga properti pada Teorema CAP adalah...',
    options: [
      'Concurrency, Atomicity, Performance',
      'Consistency, Availability, Partition tolerance',
      'Cache, Availability, Persistence',
      'Consistency, Authentication, Parallelism',
    ],
    answer: 1,
    explanation: 'Sistem terdistribusi tidak bisa menjamin ketiganya sekaligus saat terjadi partisi jaringan.',
  },
  {
    text: 'Proses mengubah objek/data menjadi format yang bisa dikirim lewat jaringan disebut...',
    options: ['Kompilasi', 'Enkripsi', 'Serialisasi (marshalling)', 'Defragmentasi'],
    answer: 2,
    explanation: 'Contoh format serialisasi: JSON, XML, Protocol Buffers.',
  },
  {
    text: 'Fungsi utama load balancer pada sistem terdistribusi adalah...',
    options: [
      'Mengenkripsi seluruh data',
      'Menyimpan backup database',
      'Membagi beban permintaan ke beberapa server',
      'Mengompilasi kode program',
    ],
    answer: 2,
    explanation: 'Beban terbagi rata sehingga tidak ada satu server yang kelebihan beban.',
  },
  {
    text: 'Tujuan utama replikasi data pada sistem terdistribusi adalah...',
    options: [
      'Mengurangi jumlah server',
      'Meningkatkan ketersediaan dan toleransi kegagalan',
      'Menghapus data lama',
      'Mempercepat kompilasi',
    ],
    answer: 1,
    explanation: 'Jika satu node mati, salinan data di node lain tetap bisa dipakai.',
  },
  {
    text: 'Perbedaan utama UDP dibanding TCP adalah...',
    options: [
      'UDP lebih lambat karena ada handshake',
      'UDP menjamin urutan paket',
      'UDP tanpa koneksi dan tanpa jaminan pengiriman',
      'UDP hanya bisa dipakai di localhost',
    ],
    answer: 2,
    explanation: 'UDP lebih ringan dan cepat, tetapi paket bisa hilang atau tertukar urutannya.',
  },
];
