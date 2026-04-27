FROM python:3.11-slim
WORKDIR /app

# Install PostgreSQL CLI for dbshell
RUN apt-get update && apt-get install -y postgresql-client && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN python manage.py collectstatic --noinput

EXPOSE 8000
CMD ["gunicorn", "payout_engine.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "120"]