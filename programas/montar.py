"""Monta a página do site Contas Abertas de Foz do Iguaçu.

Uso:
  python3 montar.py --dados dados.json --saida index.html               (página com os dados embutidos)
  python3 montar.py --dados dados.json --saida site/index.html --sem-embutir --validacao
      --sem-embutir: a página lê o arquivo dados.json publicado ao lado dela (GitHub Pages).
      --validacao:   faixa "versão em validação" e bloqueio de buscadores (noindex).
"""
import argparse, json
from pathlib import Path

aqui = Path(__file__).parent
ap = argparse.ArgumentParser()
ap.add_argument("dados_pos", nargs="?")
ap.add_argument("--dados", default="dados.json")
ap.add_argument("--saida", default=str(aqui / "index.html"))
ap.add_argument("--sem-embutir", action="store_true")
ap.add_argument("--validacao", action="store_true")
a = ap.parse_args()
arq = Path(a.dados_pos or a.dados)
if not arq.is_absolute() and not arq.exists():
    arq = aqui / arq
js = "null" if a.sem_embutir else json.dumps(json.loads(arq.read_text(encoding="utf-8")), ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
html = (aqui / "template.html").read_text(encoding="utf-8").replace("/*__DADOS__*/", js).replace("/*__JS__*/", (aqui / "app.js").read_text(encoding="utf-8"))
if a.validacao:
    html = html.replace("<head>", '<head>\n<meta name="robots" content="noindex, nofollow">', 1)
    faixa = ('<div class="faixa-validacao" role="note"><div class="wrap"><strong>Versão em validação.</strong> '
             'Este site ainda está sendo revisado pelo Observatório Social de Foz do Iguaçu e pode conter erros. '
             'Encontrou algum problema? Avise o OSB.</div></div>')
    html = html.replace("<body>", "<body>\n" + faixa, 1)
Path(a.saida).parent.mkdir(parents=True, exist_ok=True)
Path(a.saida).write_text(html, encoding="utf-8")
print(a.saida, len(html))
