# NewsDeck

Google News RSS kaynaklarından çoklu panel (TweetDeck tarzı) haber izleme uygulaması.

## Özellikler

- Açılışta 4 tab: Global, Türkiye, ABD, Trend 50.
- En fazla 10 tab ekleme.
- Her tab için bölge, dil ve arama terimi seçimi.
- Tab yönetimi: sıralama, yeniden konumlandırma, silme.
- Haber sıralama seçenekleri: zamana göre, başlığa göre, kanala göre.
- Okunan haberleri gizleme.

## Çalıştırma

Statik dosya sunucusu ile açın:

```bash
python3 -m http.server 8080
```

Ardından `http://localhost:8080` adresine gidin.
