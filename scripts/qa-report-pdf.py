#!/usr/bin/env python3
"""QA estrutural e renderização visual do PDF do relatório."""

from __future__ import annotations

import argparse
import shutil
import struct
import subprocess
import sys
from pathlib import Path

from pypdf import PdfReader


def flatten_outline(items: list) -> list:
    flattened = []
    for item in items:
        if isinstance(item, list):
            flattened.extend(flatten_outline(item))
        else:
            flattened.append(item)
    return flattened


def png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as stream:
        header = stream.read(24)
    if header[:8] != b"\x89PNG\r\n\x1a\n" or header[12:16] != b"IHDR":
        raise ValueError(f"PNG inválido: {path}")
    return struct.unpack(">II", header[16:24])


def check(condition: bool, message: str, errors: list[str]) -> None:
    if condition:
        print(f"OK   {message}")
    else:
        print(f"FALHA {message}")
        errors.append(message)


def render(pdf: Path, directory: Path, page_count: int, errors: list[str]) -> None:
    renderer = shutil.which("pdftoppm")
    check(renderer is not None, "Poppler/pdftoppm disponível", errors)
    if renderer is None:
        return
    if directory.exists():
        shutil.rmtree(directory)
    directory.mkdir(parents=True)
    prefix = directory / "page"
    subprocess.run(
        [renderer, "-png", "-r", "120", str(pdf), str(prefix)],
        check=True,
        stdout=subprocess.DEVNULL,
    )
    pages = sorted(directory.glob("page-*.png"))
    check(len(pages) == page_count, f"{page_count} páginas renderizadas para PNG", errors)
    if pages:
        dimensions = {png_dimensions(page) for page in pages}
        check(len(dimensions) == 1, "dimensões de renderização consistentes", errors)
        check(all(page.stat().st_size > 20_000 for page in pages), "PNGs não vazios", errors)
        print(f"INFO inspeção visual: {directory}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--render-dir", type=Path)
    args = parser.parse_args()

    reader = PdfReader(args.pdf)
    root = reader.trailer["/Root"]
    metadata = reader.metadata or {}
    errors: list[str] = []

    check(len(reader.pages) >= 30, f"documento completo ({len(reader.pages)} páginas)", errors)
    check(reader.pdf_header >= "%PDF-1.4", f"versão do PDF compatível com tags ({reader.pdf_header})", errors)
    check(metadata.get("/Author") == "João Carlos Queiroz", "metadado de autoria", errors)
    check(bool(metadata.get("/Title")), "metadado de título", errors)
    check(root.get("/Lang") == "pt-BR", "idioma pt-BR no catálogo do PDF", errors)
    check(root.get("/StructTreeRoot") is not None, "árvore de estrutura semântica", errors)
    mark_info = root.get("/MarkInfo") or {}
    check(bool(mark_info.get("/Marked")), "PDF marcado/tagged", errors)
    outline = flatten_outline(reader.outline)
    check(len(outline) >= 25, f"bookmarks/outline ({len(outline)} entradas)", errors)
    check(all("respostaserradas" not in item.title and "eablações" not in item.title for item in outline),
          "espaçamento dos títulos no outline", errors)

    sizes = {
        (round(float(page.mediabox.width), 1), round(float(page.mediabox.height), 1))
        for page in reader.pages
    }
    check(sizes == {(612.0, 792.0)}, "todas as páginas em tamanho Letter", errors)

    text_by_page = [page.extract_text() or "" for page in reader.pages]
    full_text = "\n".join(text_by_page)
    check(all(text.strip() for text in text_by_page), "todas as páginas contêm texto extraível", errors)
    for marker in ("1 Introdução", "3 Método", "4 Resultados", "8 Conclusão", "Referências"):
        check(marker in full_text, f"seção presente: {marker}", errors)
    check("file:///" not in full_text and "about:blank" not in full_text, "sem URL local/cabeçalho do navegador", errors)
    check(len(text_by_page[-1].strip()) >= 100, "última página contém referências/rodapé, sem página vazia", errors)

    if args.render_dir:
        render(args.pdf, args.render_dir, len(reader.pages), errors)

    placeholders = full_text.count("[A preencher") + full_text.count("[completar:") + full_text.count("[Credenciais")
    if placeholders:
        print(f"AVISO conteúdo de origem contém {placeholders} placeholder(s) editorial(is); a geração não os altera.")

    if errors:
        print(f"\nQA falhou em {len(errors)} verificação(ões).", file=sys.stderr)
        raise SystemExit(1)
    print("\nQA aprovado.")


if __name__ == "__main__":
    main()
