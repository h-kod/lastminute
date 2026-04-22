# Lastminute

Google News RSS kaynaklarından çoklu panel ile haber izleme uygulaması.

## Özellikler

- Açılışta 4 sekme: Global, Türkiye, ABD, Trend 50.
- En fazla 10 sekme ekleme.
- Her sekme için düzenleme: başlık, bölge, dil, arama terimi, haber tazeliği.
- Google News sorgularında `when:1h`, `when:3h`, `when:5h`, `when:10h` veya `when:1d` filtresi.
- Her sekmede başlıktaki saat butonu ile zamana göre sıralama.
- Sekme başlığı kart üzerinden doğrudan anahtar kelime olarak düzenlenebilir.
- Kart başlığı 3 karakterlik aralıklarla otomatik arama tetikler.
- Kart üstünde TR'ye çevir ve kompakt silme onayı bulunur.
- Üst bar otomatik yenileme: 5, 15, 30, 60 saniye.
- Sekme yönetimi: düzenle, yeniden konumlandır, sil.
- Okunan haberleri gizleme.
- Koyu, düşük beyazlı tema.
- Yerel sunucu ile çalışır, RSS proxy `/api/feed` üzerinden hizmet verir.

## Çalıştırma

```bash
node server.js
```

Ardından `http://localhost:8080` adresine gidin.
