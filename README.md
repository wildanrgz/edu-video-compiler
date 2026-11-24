# edu-video-compiler

Repo pribadi untuk satu orang: mengubah **satu file episode** menjadi master 16:9
(YouTube long-form) + beberapa Short 9:16, **dengan narasi suara**, dalam **dua bahasa** (id, en).

Repo ini publik, tapi isinya alat dan skrip pribadi. Video hasil render tidak
disimpan di git — hasilnya masuk GitHub Release / laptop.

## Alur

```
episodes/<slug>/episode.yml
        |
        +-- validate --> gate compliance (gagal = berhenti di sini)
        +-- tts      --> public/audio/<slug>/<locale>/sN.wav  +  dist/audio/<slug>.json
        +-- plan     --> dist/plan/*.json   (timeline mengikuti durasi audio asli)
        +-- render   --> out/*.mp4          (video + narasi)
```

`episode.yml` adalah satu-satunya sumber kebenaran. Satu episode, dua kolom
bahasa, dua output. **Durasi tiap scene diambil dari audio**, bukan dari angka
yang kamu tulis: kalau narasi 24,36 detik, slide dapat 24,36 detik. Tidak ada
audio yang terpotong atau gambar yang menggantung.

## Sekali setup

```bash
npm ci                                  # reproducible, butuh package-lock.json
python3 -m venv .venv
.venv/bin/pip install piper-tts
.venv/bin/python -m piper.download_voices en_US-lessac-medium id_ID-news_tts-medium --download-dir voices
```

Voice tidak masuk git (61 MB per model). `voices/` dan `public/audio/` ada di `.gitignore`.

## Perintah

```bash
npm run validate                                          # gate compliance semua episode
npm run tts -- why-you-forget --locales id,en --piper .venv/bin/piper
npm run plan -- why-you-forget --locales id,en
npm run describe -- why-you-forget --locale en             # deskripsi + chapter + sumber
npm run topic -- --keywords "memory,spacing,recall"        # cek ide baru sebelum menulis
npm run studio                                             # pratinjau Remotion
npm run render:long -- out/test.mp4 --props=dist/plan/why-you-forget.en.long.json
```

Render penuh (8 file: 2 bahasa × master + 3 Short) lewat GitHub Actions:
**Actions → render → Run workflow**, isi `slug`. Job `plan` yang menyintesis
narasi, lalu 8 job render paralel memakainya.

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

## Yang memblokir render

Gate di `src/compliance.ts` sengaja keras, karena ini yang membedakan
"video edukasi" dari "template AI yang tidak layak monetisasi":

| Rule | Kenapa |
| --- | --- |
| `min_original_assets` | minimal 2 aset buatan sendiri per episode |
| `claim_source` | setiap klaim wajib punya URL sumber nyata |
| `thesis_duplicate` | kemiripan kata kunci >= 60% dengan episode lama ditolak |
| `script_duplicate` | skrip identik dengan episode lain ditolak |
| `sensitive_needs_human` | topik sensitif wajib presenter manusia |
| `aigc_undisclosed` | suara sintetis wajib `disclosure.aigc: true` |
| `cml_asset` | lagu TikTok Commercial Music Library tidak boleh masuk MP4 |
| `duration_min` / `duration_max` | 4–15 menit untuk master |

Warning (tidak memblokir): scene tanpa narasi, Short > 60 detik, hook terlalu
panjang, tanpa related-video link, tanpa CTA, klaim yang tidak pernah diucapkan.

## Yang tidak boleh masuk repo

- API key, cookie, session TikTok/YouTube (pakai Actions secrets kalau nanti perlu)
- file media besar: video ke Release, audio ke `public/audio/` (ignored)
- lagu dari TikTok Commercial Music Library

## Reproducible builds

`package.json` memakai versi **persis** (tanpa `^`), dan `package-lock.json`
di-commit. Kalau menambah dependency: jalankan **Actions → lockfile → Run
workflow**, lalu `npm ci` di runner akan memakai isi lockfile yang sama.
