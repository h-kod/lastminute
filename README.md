# Lastminute

Google News RSS kaynaklarından TweetDeck tarzı çoklu panel haber izleme uygulaması.

## Özellikler

- Açılışta 4 sekme: Global, Türkiye, ABD, Trend 50.
- En fazla 10 sekme.
- Her sekme düzenlenebilir (başlık, bölge, dil, arama terimi).
- Sekme başlığında zamana göre sıralama butonu (yeni→eski / eski→yeni).
- Header'da 5, 15, 30, 60 saniye otomatik yenileme seçimleri.
- Sekme yönetimi: düzenleme, yer değişimi, silme.

## Çalıştırma

```bash
python3 -m http.server 8080
```

Ardından `http://localhost:8080` adresini açın.
