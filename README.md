# edu-video-compiler

Repo pribadi untuk satu orang: mengubah **satu file episode** menjadi master 16:9
(YouTube long-form) + beberapa Short 9:16, **dengan narasi suara**, dalam **dua bahasa** (id, en).

Repo ini publik, tapi isinya alat dan skrip pribadi. Video hasil render tidak
disimpan di git — hasilnya masuk GitHub Release / artefak Actions / laptop.

## Alur

```
episodes/<slug>/episode.yml
        |
        +-- validate --> gate compliance (gagal = berhenti di sini)
        +-- tts      --> public/audio/<slug>/<locale>/sN.wav  +  dist/audio/<slug>.json
        +-- plan     --> dist/plan/*.json   (timeline = durasi audio, tanpa angka manual)
        +-- render   --> out/*.mp4          (video + narasi)
```

`episode.yml` adalah satu-satunya sumber **isi**. Audio adalah satu-satunya sumber
**waktu**: skema scene tidak punya `duration_s` sama sekali. Kalau narasi 24,36
detik, slide dapat 24,36 detik — tidak ada audio terpotong dan tidak ada gambar
yang menggantung. Karena itu `plan` menolak jalan sebelum audio ada.

Hasil ukur `why-you-forget` (9 scene, 8 file, run Actions `45360954077`):

| Output | Durasi MP4 |
| --- | --- |
| `why-you-forget.id.long.mp4` | 5:36 (336,32 s) |
| `why-you-forget.en.long.mp4` | 4:28 (267,65 s) |
| id short sh1 / sh2 / sh3 | 46,19 / 38,51 / 41,07 s |
| en short sh1 / sh2 / sh3 | 36,37 / 30,21 / 32,09 s |

Selisih dengan plan maksimal 0,02 detik, dan semuanya membawa track audio.

## Sekali setup

```bash
npm ci                                  # reproducible, butuh package-lock.json
npm run font                            # unduh font render ke public/fonts (sekali, 48 KB)
python3 -m venv .venv
.venv/bin/pip install piper-tts
.venv/bin/python -m piper.download_voices en_US-lessac-medium id_ID-news_tts-medium --download-dir voices
```

Voice dan font tidak masuk git (61 MB per model suara). `voices/`, `public/audio/`,
`public/fonts/` ada di `.gitignore`.

## Perintah

```bash
npm run validate                                          # gate compliance semua episode
npm run tts -- why-you-forget --locales id,en --piper .venv/bin/piper
npm run plan -- why-you-forget --locales id,en             # wajib setelah tts
npm run describe -- why-you-forget --locale en             # deskripsi + chapter + sumber
npm run topic -- --keywords "memory,spacing,recall"        # cek ide baru sebelum menulis
npm run studio                                             # pratinjau Remotion
npm run render:short -- out/test.mp4 --props=dist/plan/why-you-forget.en.short-sh1.json
```

Render penuh (8 file: 2 bahasa x master + 3 Short) lewat GitHub Actions:
**Actions -> render -> Run workflow**, isi `slug`. Job `plan` yang menyintesis
narasi, lalu 8 job render paralel memakainya. `publish_release: false` = hasil
hanya jadi artefak, tanpa Release.

## Narasi (Piper)

- Gratis, lokal, CPU-only. Suara default: `id_ID-news_tts-medium`, `en_US-lessac-medium`.
- Ganti per episode di `episode.yml`:

  ```yaml
  tts:
    id: { voice: id_ID-news_tts-medium, length_scale: 0.95, tail_s: 0.5 }
    en: { voice: en_US-lessac-medium, length_scale: 0.95, tail_s: 0.5 }
  ```

  `length_scale` < 1 = lebih lambat. `tail_s` = jeda setelah kalimat terakhir.
- Tiap voice punya lisensinya sendiri. Cek sebelum dipakai komersial.
- Short memakai audio scene yang sama dengan master, jadi Short tidak pernah
  berbeda dari video panjangnya.

## Tampilan

- Satu scene = satu frame: judul kecil (warna aksen) di atas, lalu 2-4 poin
  pendek dari `points:`. Kalau `points` tidak ada, teks skrip lengkap yang
  ditampilkan (dan mengecil sendiri) — tapi naskah 30 detik di layar adalah
  dinding teks, jadi `points` hampir selalu lebih baik.
- **Font di-bundle.** Host tanpa font sama sekali (container minimal, tanpa
  fontconfig) membuat Chromium menggambar nol glyph: videonya jadi background
  kosong padahal semua pengecekan durasi lolos. Karena itu
  `scripts/ensure-font.mjs` mengunduh satu file WOFF2 ke `public/fonts/`, dan
  `remotion/fonts.ts` memuatnya sebelum frame pertama dirender. Tanpa langkah ini,
  MP4 tetap terbentuk, tetap punya durasi benar, tetap punya audio — dan kosong.

## Render di luar Actions

Render lokal jalan tanpa root, asal library Chromium tersedia:

```bash
npx remotion browser ensure
mkdir -p .libs && cd .libs && \
  curl -fsSLO http://archive.ubuntu.com/ubuntu/pool/main/n/nspr/libnspr4_4.35-1.1build1_amd64.deb && \
  curl -fsSLO http://archive.ubuntu.com/ubuntu/pool/main/n/nss/libnss3_3.98-1build1_amd64.deb && \
  for f in *.deb; do dpkg-deb -x "$f" root; done && cd ..
export LD_LIBRARY_PATH="$PWD/.libs/root/usr/lib/x86_64-linux-gnu"
npm run font
npx remotion render remotion/index.ts Short out/test.mp4 --props=dist/plan/why-you-forget.id.short-sh3.json
```

## Yang memblokir render

Gate di `src/compliance.ts` + `src/cli.ts`, sengaja keras, karena ini yang
membedakan "video edukasi" dari "template AI yang tidak layak monetisasi":

| Rule | Di mana | Kenapa |
| --- | --- | --- |
| `min_original_assets` | validate | minimal 2 aset buatan sendiri per episode |
| `claim_source` | validate | setiap klaim wajib punya URL sumber nyata |
| `thesis_duplicate` | validate | kemiripan kata kunci >= 60% dengan episode lama ditolak |
| `script_duplicate` | validate | skrip identik dengan episode lain ditolak |
| `sensitive_needs_human` | validate | topik sensitif wajib presenter manusia |
| `aigc_undisclosed` | validate | suara sintetis wajib `disclosure.aigc: true` |
| `cml_asset` | validate | lagu TikTok Commercial Music Library tidak boleh masuk MP4 |
| `narration` | plan | scene tanpa audio = tidak ada timeline, plan gagal |
| `duration` | plan | 4-15 menit untuk `status: ready`; `draft` hanya warning |

Warning (tidak memblokir): Short > 60 detik, hook terlalu panjang, tanpa
related-video link, tanpa CTA, klaim yang tidak pernah diucapkan.

## Yang tidak boleh masuk repo

- API key, cookie, session TikTok/YouTube (pakai Actions secrets kalau nanti perlu)
- file media besar: video ke Release, audio ke `public/audio/` (ignored)
- lagu dari TikTok Commercial Music Library

## Reproducible builds

`package.json` memakai versi **persis** (tanpa `^`), dan `package-lock.json`
di-commit. Kalau menambah dependency: jalankan **Actions -> lockfile -> Run
workflow**, lalu `npm ci` di runner akan memakai isi lockfile yang sama.
