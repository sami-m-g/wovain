# . gcloud-python.sh
# Sets $py to a Python 3 for the deploy jobs' small API calls: python3 when
# it is on PATH, else the one gcloud bundles (the gcloud image has neither
# curl nor python3). That bundled Python finds no CA certificates of its own,
# so SSL_CERT_FILE points at the system bundle or gcloud's certifi copy.
py=$(command -v python3 || gcloud info --format='value(basic.python_location)')
if [ -z "$SSL_CERT_FILE" ]; then
  sdk=$(gcloud info --format='value(installation.sdk_root)' 2>/dev/null || true)
  for f in /etc/ssl/certs/ca-certificates.crt "$sdk/lib/third_party/certifi/cacert.pem"; do
    if [ -f "$f" ]; then
      export SSL_CERT_FILE="$f"
      break
    fi
  done
fi
