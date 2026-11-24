# edu-video-compiler

Repo pribadi untuk satu orang: mengubah **satu file episode** menjadi master 16:9
(YouTube long-form) + beberapa Short 9:16, dalam **dua bahasa** (id, en).

Repo ini publik, tapi isinya alat dan skrip pribadi. Video hasil render tidak
disimpan di git — hasilnya masuk GitHub Release / laptop.

## Alur

```
episodes/<slug>/episode.yml   ->  validate  ->  plan (dist/plan/*.json)  ->  render (mp4)
                                   |                    |
                              gate compliance      props untuk Remotion
```

`episode.yml` adalah satu-satunya sumber kebenaran. Tidak ada duplikasi skrip
per bahasa: satu episode, dua kolom bahasa, dua output.

## Perintah

```bash
npm install                   # sekali, lalu commit package-lock.json yang muncul
npm run validate              # cek semua episode (exit 1 kalau ada error)
npm run plan -- why-you-forget --locales id,en
npm run describe -- why-you-forget --locale en
npm run topic -- --keywords "memory,spacing,recall"   # sebelum menulis episode baru
npm run studio                # pratinjau Remotion
npm run render:short -- out/test.mp4 --props=dist/plan/why-you-forget.en.short-sh1.json
```

Render penuh (4 file per bahasa) lewat GitHub Actions:
**Actions → render → Run workflow**, isi `slug`.

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

Warning (tidak memblokir) menandai hal yang menurunkan performa: hook Short
tersebut terlalu panjang, tanpa related-video link, tanpa CTA, atau klaim yang
tidak pernah diucapkan di skrip.

## Yang tidak boleh masuk repo

- API key, cookie, session TikTok/YouTube (pakai Actions secrets kalau nanti perlu)
- file media besar; taruh di Release, bukan di git
- lagu dari TikTok Commercial Music Library

## Lisensi & biaya

Remotion gratis untuk individu; kalau nanti jadi tim >= 4 orang, perlu Company
License. Voice model TTS punya lisensi masing-masing — catat di `assets[].licence`
dan `credit`.
