#!/usr/bin/env python3
"""Preserva tags/outlines do Chrome e normaliza metadados do relatório."""

from __future__ import annotations

import argparse
import datetime as dt
import html
import os
import re
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import BooleanObject, DictionaryObject, NameObject, TextStringObject


def pdf_date(timestamp: int) -> str:
    value = dt.datetime.fromtimestamp(timestamp, tz=dt.timezone.utc)
    return value.strftime("D:%Y%m%d%H%M%S+00'00'")


def source_heading_titles(source: Path) -> list[str]:
    markup = source.read_text(encoding="utf-8")
    matches = re.findall(r"<h[1-3][^>]*>(.*?)</h[1-3]>", markup, flags=re.IGNORECASE | re.DOTALL)
    return [
        " ".join(html.unescape(re.sub(r"<[^>]+>", "", match)).split())
        for match in matches
    ]


def outline_nodes(parent: DictionaryObject):
    current = parent.get("/First")
    while current is not None:
        node = current.get_object()
        yield node
        if node.get("/First") is not None:
            yield from outline_nodes(node)
        current = node.get("/Next")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--author", required=True)
    parser.add_argument("--subject", required=True)
    parser.add_argument("--keywords", required=True)
    args = parser.parse_args()

    reader = PdfReader(args.input)
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    writer.pdf_header = reader.pdf_header if reader.pdf_header >= "%PDF-1.4" else "%PDF-1.4"

    source_epoch = int(os.environ.get("SOURCE_DATE_EPOCH", int(args.source.stat().st_mtime)))
    old_metadata = dict(reader.metadata or {})
    title = old_metadata.get("/Title", "Relatório técnico do Experimento OE-A")
    metadata = {
        "/Title": title,
        "/Author": args.author,
        "/Subject": args.subject,
        "/Keywords": args.keywords,
        "/Creator": "Google Chrome + scripts/build-report-pdf.mjs",
        "/Producer": f"{old_metadata.get('/Producer', 'Skia/PDF')}; metadados normalizados por pypdf",
        "/CreationDate": pdf_date(source_epoch),
        "/ModDate": pdf_date(source_epoch),
    }
    writer.add_metadata(metadata)

    root = writer._root_object  # pypdf não expõe setters públicos para estes campos do catálogo.
    root[NameObject("/Lang")] = TextStringObject("pt-BR")
    root[NameObject("/PageMode")] = NameObject("/UseOutlines")
    mark_info = root.get("/MarkInfo")
    if mark_info is None:
        mark_info = DictionaryObject()
        root[NameObject("/MarkInfo")] = mark_info
    mark_info[NameObject("/Marked")] = BooleanObject(True)

    viewer = root.get("/ViewerPreferences")
    if viewer is None:
        viewer = DictionaryObject()
        root[NameObject("/ViewerPreferences")] = viewer
    viewer[NameObject("/DisplayDocTitle")] = BooleanObject(True)

    # O Chrome às vezes remove espaços de títulos que quebram visualmente de linha.
    # Os destinos de página permanecem os do Chrome; somente o texto é restaurado do HTML.
    outlines = root.get("/Outlines")
    headings = source_heading_titles(args.source)
    if outlines is not None:
        nodes = list(outline_nodes(outlines.get_object()))
        if len(nodes) == len(headings):
            for node, heading in zip(nodes, headings):
                node[NameObject("/Title")] = TextStringObject(heading)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(args.output.suffix + ".tmp")
    with temporary.open("wb") as stream:
        writer.write(stream)
    temporary.replace(args.output)


if __name__ == "__main__":
    main()
