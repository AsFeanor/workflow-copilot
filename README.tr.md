# Workflow Copilot

**Operasyon verilerini okuyan, yanıtlarını kayıtlarla ilişkilendiren ve takip önerileri hazırlayan AI asistanı.**

[English](README.md) · [Mimari](docs/architecture.md) · [Değerlendirme yaklaşımı](eval/README.md)

“Bu hafta hangi aktif üyelikler bitiyor?” sorusunu yanıtlarken süresi geçmiş üyelikleri, pasif üyeleri ve iptal edilmiş dersleri doğru ayırmak gerekir. Workflow Copilot bu iş kurallarını TypeScript araçlarında uygular; AI, soruyu araştırmak için bu araçları kullanır.

İlk kullanım senaryosu [kickbox yönetim uygulamamdan](https://github.com/AsFeanor/kickbox-management-app) esinleniyor. Proje bağımsız bir mühendislik prototipidir; mevcut uygulamanın veritabanına bağlı değildir ve örnek veriler tamamen kurgusaldır.

## Hemen dene

**Node.js 24 veya üzeri** gerekir. Kurulması gereken paket bağımlılığı yoktur.

```sh
node src/cli.ts --demo
```

Demo, sabit bir senaryoyu gerçek araç döngüsü ve yanıt doğrulamasından geçirir. Sağlayıcı önceden yazılmıştır; **AI modeli çağrılmaz, API anahtarı ve internet gerekmez**. Bu ayrım terminal çıktısında da belirtilir.

2026-09-05 tarihli örnek veri içinde yedi günlük aralıkta biten üç aktif üyelik bulunur. Her sonuç ilgili üye kaydını gösterir; takip önerileri `DRAFT` olarak işaretlenir. Kimseye mesaj gönderilmez ve hiçbir kayıt değiştirilmez.

JSON çıktısı almak için:

```sh
node src/cli.ts --demo --json
```

## Gerçek modelle çalıştır

`.env.example` dosyasını `.env` adıyla kopyala. Kendi `OPENAI_API_KEY` ve `OPENAI_MODEL` değerlerini doldur. Modelin hesabında erişilebilir olması, Responses araç çağrılarını ve yapılandırılmış yanıtları desteklemesi gerekir.

```sh
node --env-file-if-exists=.env src/cli.ts "Önümüzdeki yedi gün içinde hangi aktif üyelikler bitiyor? Kaynaklarıyla takip taslakları hazırla."
```

Farklı bir veri dosyası için [örnek JSON biçimini](data/demo.json) kullan:

```sh
node --env-file-if-exists=.env src/cli.ts "Yaklaşan dersleri özetle." --data snapshot.json --json
```

Bu modda soru ve araçların seçtiği kayıtlar OpenAI'a gönderilir; API kullanımı ücretli olabilir. `store: false` kullanılması genel bir veri saklanmama garantisi değildir. Varsayılan veri dosyası bu modda da kurgusaldır. İlk sürümde gerçek API çağrısı yapılmadı; bağlantı davranışı sahte HTTP yanıtlarıyla test edildi.

## Mühendislik kararları

- İş kuralları modelin yorumuna bırakılmaz: tarih aralıkları ve durum filtreleri kodda uygulanır.
- Yalnızca üç okuma aracı vardır; bilinmeyen işlemler ve hatalı parametreler reddedilir.
- Bulgular yalnızca başarıyla okunan kayıtları kaynak gösterebilir. Bir takip taslağı kendi üye kaydına referans vermelidir.
- Varsayılan sınır, soru başına dört sağlayıcı çağrısı ve sekiz araç çağrısıdır.
- Araçların sonuç durumu, süresi ve kaynakları izlenebilir. Canlı modda sağlayıcının bildirdiği token kullanımı da gösterilir.

Kaynak kontrolü, kaydın okunduğunu doğrular; **modelin o kayıt hakkında söylediği her şeyin doğru olduğunu kanıtlamaz**. Özetler ve takip önerileri insan incelemesi gerektirir.

## Kontroller

```sh
node --test tests/*.test.ts
node eval/run.ts
```

İlk sürümde **23 test** ve **6 deterministik senaryo** geçiyor. Kontroller tarih sınırlarını, veri bütünlüğünü, kaynak doğrulamasını, çağrı sınırlarını ve bağlantı hatalarını kapsıyor. Bunlar model doğruluk ölçümü değildir.

Bu sürüm komut satırında çalışan bir prototiptir. Üretim veritabanı, kullanıcı girişi, çok kiracılı yetkilendirme ve işlem gönderme katmanı henüz yoktur. Sonraki aşama, gerçek model değerlendirmesi ve yetki sınırları belirlenmiş bir veritabanı bağlantısıdır.
