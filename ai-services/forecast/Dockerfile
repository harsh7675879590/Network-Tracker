FROM python:3.11-slim AS build
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.11-slim
WORKDIR /app

RUN groupadd -g 1001 appgroup && \
    useradd -u 1001 -g appgroup -s /bin/bash appuser
USER appuser

COPY --from=build /install /usr/local
COPY . .

EXPOSE 8101

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=15s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8101/health')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8101"]
