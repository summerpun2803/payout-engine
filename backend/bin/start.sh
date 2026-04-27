#!/bin/bash
set -e

echo "🔄 Running migrations..."
python manage.py migrate --noinput

echo "🌱 Seeding data..."
python manage.py seed_data || echo "⚠️ Seed data already exists (safe to ignore)"

echo "📦 Collecting static files..."
python manage.py collectstatic --noinput --clear

echo "🚀 Starting Gunicorn..."
exec gunicorn payout_engine.wsgi:application --bind 0.0.0.0:$PORT --workers 2
