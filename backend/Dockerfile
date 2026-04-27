FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY . .

# Collect static files (for Whitenoise)
RUN python manage.py collectstatic --noinput

# Expose port (Railway sets $PORT automatically)
EXPOSE 8000

# Use gunicorn for production WSGI server
CMD ["gunicorn", "payout_engine.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "120"]
