# Интернет-метр

Веб-приложение для измерения скорости интернета: пинг, скачивание и загрузка — прямо в браузере, без сторонних сервисов.

## О проекте

Сервер на **FastAPI** отдаёт HTML-страницу и три простых эндпоинта:
- `GET /api/ping` — для замера задержки;
- `GET /api/download?size=<байт>` — стримит произвольное количество байт для теста скачивания (до 50 МБ);
- `POST /api/upload` — принимает поток данных от клиента и возвращает реально полученный размер (до 20 МБ).

Замеры выполняются на стороне браузера в JavaScript: страница вызывает API сервера и считает скорость по времени и объёму переданных данных.

## Структура проекта

```
internet_checker/
├── main.py              # FastAPI-приложение и эндпоинты (/, /api/ping, /api/download, /api/upload)
├── requirements.txt     # Python-зависимости (FastAPI, Uvicorn, Jinja2)
├── templates/
│   └── index.html       # Главная страница приложения
├── static/
│   ├── css/style.css    # Стили
│   └── js/app.js        # Клиентская логика замеров
├── nginx/
│   └── nginx.conf       # Конфиг Nginx (для запуска через Docker Compose)
├── Dockerfile           # Образ приложения
└── docker-compose.yml   # Сборка app + nginx
```

## Локальный запуск

### Требования
- Python 3.10 или новее

### Windows (PowerShell)

```powershell
# 1. Перейдите в папку проекта
cd internet_checker

# 2. Создайте виртуальное окружение
python -m venv .venv

# 3. Активируйте его
.\.venv\Scripts\Activate.ps1
```

> Если появится ошибка про политику выполнения скриптов — выполните один раз:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```
> Затем повторите шаг 3.

```powershell
# 4. Установите зависимости
pip install -r requirements.txt

# 5. Запустите сервер
uvicorn main:app --reload
```

Откройте в браузере: **http://127.0.0.1:8000**

### Linux / macOS

```bash
cd internet_checker
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Откройте в браузере: **http://127.0.0.1:8000**