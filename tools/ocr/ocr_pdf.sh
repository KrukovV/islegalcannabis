#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: ocr_pdf.sh <input.pdf> <output.txt>" >&2
  exit 2
fi

IN="$1"
OUT="$2"

if command -v ocrmypdf >/dev/null 2>&1; then
  TMP="$(mktemp -d)"
  OCR_PDF="${TMP}/ocr.pdf"
  ocrmypdf --skip-text "$IN" "$OCR_PDF" >/dev/null
  if command -v pdftotext >/dev/null 2>&1; then
    pdftotext "$OCR_PDF" "$OUT"
  else
    echo "missing pdftotext for OCR output" >&2
    exit 3
  fi
  rm -rf "$TMP"
  exit 0
fi

if command -v tesseract >/dev/null 2>&1; then
  if command -v pdftoppm >/dev/null 2>&1; then
    TMP="$(mktemp -d)"
    pdftoppm "$IN" "${TMP}/page" -png >/dev/null
    for img in "${TMP}"/page-*.png; do
      tesseract "$img" "${img%.png}" >/dev/null
    done
    cat "${TMP}"/page-*.txt > "$OUT"
    rm -rf "$TMP"
    exit 0
  else
    echo "missing pdftoppm for OCR" >&2
    exit 3
  fi
fi

echo "OCR tool not available" >&2
exit 4
