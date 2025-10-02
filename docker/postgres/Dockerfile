FROM postgres:15

# Install pgvector package from Debian repositories (more portable than building from source)
RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-15-pgvector ca-certificates \
  && rm -rf /var/lib/apt/lists/*

CMD ["postgres"]
