# 🌐 Настройка поддомена brain.vendra.uz без изменения основного сайта

У вас есть домен **`vendra.uz`**, на котором работает ваш основной сайт. Вы можете легко подключить координационный сервер VendraCode через отдельный поддомен, **вообще не затрагивая основной сайт**.

---

### Архитектура поддоменов

| Домен / Поддомен | Назначение | Как работает |
|---|---|---|
| `vendra.uz` | Ваш существующий сайт | **Не трогаем** (работает как раньше на текущем хостинге) |
| `brain.vendra.uz` | Сервер координации The Shared Brain | Направляется на порт `4000` (Node.js WebSocket + REST API) |
| `share.vendra.uz` | Страницы приглашения в сессии | Опционально для ссылок общего доступа |

---

### Шаг 1. Добавить DNS-запись (в панели регистратора или Cloudflare)

Зайдите в управление DNS для домена `vendra.uz` (на Cloudflare, Beget, Reg.ru или у вашего регистратора) и добавьте **одну** запись:

- **Тип записи**: `A`
- **Имя (Name)**: `brain`
- **Значение (IPv4 address)**: IP-адрес вашего сервера (VPS)
- **TTL**: `Auto` (или `300`)
- **Прокси (Cloudflare)**: Можно включить оранжевое облако (Proxy ON) или DNS only. Если используете Cloudflare с WebSockets, WebSockets поддерживаются по умолчанию!

*После этого `brain.vendra.uz` будет указывать на ваш VPS, а `vendra.uz` останется на прежнем месте.*

---

### Шаг 2. Запуск Coordination Server на VPS

На вашем сервере в папке `VendraCode`:

```bash
# 1. Установите зависимости
npm install ws

# 2. Запустите сервер координации
node server/brain-server.js

# Для постоянной работы в фоне через PM2:
npm install -g pm2
pm2 start server/brain-server.js --name "vendra-brain"
pm2 save
```

Сервер запустится на порту `4000` и будет принимать WebSocket-подключения и REST-запросы.

---

### Шаг 3. Настройка Nginx с бесплатным SSL-сертификатом

Скопируйте конфиг:
```bash
sudo cp server/nginx-vendra.conf /etc/nginx/sites-available/brain.vendra.uz
sudo ln -s /etc/nginx/sites-available/brain.vendra.uz /etc/nginx/sites-enabled/
```

Получите бесплатный SSL-сертификат через Certbot:
```bash
sudo certbot --nginx -d brain.vendra.uz
sudo nginx -t && sudo systemctl reload nginx
```

Теперь ваш координационный сервер доступен по безопасному протоколу:
- **WebSocket**: `wss://brain.vendra.uz`
- **HTTPS**: `https://brain.vendra.uz/health`

---

### Шаг 4. Подключение VendraCode IDE к brain.vendra.uz

В приложении VendraCode:
1. Перейдите в **Settings** › **Agents & Providers**.
2. В поле **The Shared Brain Server URL** укажите: `wss://brain.vendra.uz`.
3. При нажатии на **Share Session** в шапке приложения генерируется ссылка:
   `https://brain.vendra.uz/session/lobby-join-race`
4. Все агенты на вашем компьютере и компьютерах ваших друзей синхронизируются через `brain.vendra.uz` в режиме реального времени!
