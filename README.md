# 🛡️ BypassDNS

Discord ve benzeri engellenmiş servislere erişim sağlamak için geliştirilmiş, şık bir web paneline sahip yerel DNS-over-HTTPS (DoH) Proxy aracı.

![BypassDNS Dashboard](https://via.placeholder.com/800x400.png?text=BypassDNS+Premium+Dashboard)

## 🌟 Özellikler

- **DPI Bypass (DNS Seviyesi):** ISS'nizin DNS tabanlı engellemelerini aşmak için sorguları HTTPS üzerinden (DoH) şifreler.
- **Premium Web Dashboard:** Canlı loglar, istatistikler ve tek tıkla kontroller sunan modern, dark-theme arayüz.
- **Yerel Önbellek (Cache):** Sık ziyaret edilen adresler için milisaniyelik yanıt süreleri.
- **Tek Tıkla Windows Entegrasyonu:** Windows DNS ayarlarınızı otomatik olarak proxy'ye yönlendirir.
- **Çoklu Sağlayıcı:** Cloudflare, Google, Quad9 ve AdGuard DoH sunucuları arasında geçiş imkanı.

## 🚀 Kurulum

1. Bu projeyi bir klasöre çıkartın.
2. Node.js'in bilgisayarınızda kurulu olduğundan emin olun.
3. Terminali (veya PowerShell'i) proje klasöründe açın ve bağımlılıkları yükleyin:

```bash
npm install
```

## 🎮 Kullanım

> [!IMPORTANT]
> Uygulamanın Windows DNS ayarlarını değiştirebilmesi ve Port 53'ü (DNS portu) dinleyebilmesi için **Yönetici Olarak Çalıştırılması** gerekir.

1. **PowerShell'i Yönetici Olarak Çalıştırın** (Başlat menüsüne PowerShell yazın, sağ tıklayıp "Yönetici olarak çalıştır" deyin).
2. Proje klasörüne gidin: `cd path\to\bypass-dns`
3. Sunucuyu başlatın:

```bash
npm start
```

4. Tarayıcınızda [http://localhost:3000](http://localhost:3000) adresini açın.
5. Dashboard üzerindeki **"Bypass'ı Başlat"** butonuna tıklayın.
6. Discord'a (veya erişmek istediğiniz diğer servislere) girmeyi deneyin!

## 🛑 Kapatma ve Normale Dönme

Aracı kullanmayı bitirdiğinizde:
1. Dashboard üzerinden **"Orijinale Dön"** butonuna tıklayarak DNS ayarlarınızı eski haline getirin.
2. Konsol ekranında `Ctrl + C` tuşlarına basarak proxy sunucusunu durdurun.

---
*Not: Bu araç DNS tabanlı engellemeleri aşmak içindir. Eğer engelleme gelişmiş (SNI veya IP tabanlı) DPI seviyesindeyse, tam teşekküllü GoodbyeDPI veya bir VPN kullanmanız gerekebilir.*
