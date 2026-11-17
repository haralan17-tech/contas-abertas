"""Extrai dos ZIPs do TCE-PR (SIM-AM) tudo o que é necessário para a página de publicidade.

Uso: python programas/publicidade_extrair.py PASTA_COM_ZIPS SAIDA
A pasta tem os ZIPs <ano>_410830_Despesa.zip e <ano>_410830_Contrato.zip de vários anos.
Grava em SAIDA:
  empenhos.jsonl     empenhos de publicidade (todos os anos, todos os atributos)
  pagamentos.jsonl   pagamentos e estornos desses empenhos, em qualquer ano
  liquidacoes.jsonl  liquidações e estornos desses empenhos
  contratos.jsonl    contratos de publicidade/propaganda/comunicação
  desdobramentos.json  totais empenhados por desdobramento do elemento 39 (para conferir os códigos)
"""
import collections, io, json, os, re, sys, zipfile
import xml.etree.ElementTree as ET

PASTA, SAIDA = sys.argv[1], sys.argv[2]
os.makedirs(SAIDA, exist_ok=True)
RX_DESD = re.compile(r"PUBLICIDADE|PROPAGANDA|DIVULGA", re.I)
RX_OBJ = re.compile(r"publicidade|propaganda|ag[êe]ncia de|marketing|divulga[çc][ãa]o|publica[çc][õo]es? (legais|de atos|de avisos|em jornal)", re.I)


def membros(zipname, sufixo):
    z = zipfile.ZipFile(zipname)
    for n in z.namelist():
        if n.endswith(sufixo):
            yield n, z.open(n)


def iterar(fh, tag):
    for ev, el in ET.iterparse(fh):
        if el.tag == tag:
            yield dict(el.attrib)
        el.clear()


zips = sorted(f for f in os.listdir(PASTA) if f.endswith(".zip"))
print("ZIPs:", zips)
emp, ids, desd = [], set(), collections.Counter()
for z in [f for f in zips if f.endswith("Despesa.zip")]:
    for n, fh in membros(os.path.join(PASTA, z), "_Empenho.xml"):
        for a in iterar(fh, "Empenho"):
            if a.get("cdElemento") == "39":
                desd[f'{a.get("nrAnoEmpenho")}|{a.get("cdDesdobramento")}|{a.get("dsDesdobramento")}'] += float(a.get("vlEmpenho") or 0)
            if RX_DESD.search(a.get("dsDesdobramento", "")) or (a.get("cdElemento") == "39" and a.get("cdDesdobramento") in ("88", "90", "63")):
                emp.append(a); ids.add(a["idEmpenho"])
        print(z, n, "empenhos de publicidade até agora:", len(emp))
with open(os.path.join(SAIDA, "empenhos.jsonl"), "w") as f:
    for a in emp: f.write(json.dumps(a, ensure_ascii=False) + "\n")
with open(os.path.join(SAIDA, "desdobramentos.json"), "w") as f:
    json.dump(dict(sorted(desd.items())), f, ensure_ascii=False, indent=0)

for arq, tags, nome in [("_EmpenhoPagamento.xml", ["EmpenhoPagamento"], "pagamentos.jsonl"),
                        ("_EmpenhoPagamentoEstorno.xml", ["EmpenhoPagamentoEstorno"], "pagamentos_estorno.jsonl"),
                        ("_EmpenhoLiquidacao.xml", ["EmpenhoLiquidacao"], "liquidacoes.jsonl"),
                        ("_EmpenhoLiquidacaoEstorno.xml", ["EmpenhoLiquidacaoEstorno"], "liquidacoes_estorno.jsonl")]:
    k = 0
    with open(os.path.join(SAIDA, nome), "w") as out:
        for z in [f for f in zips if f.endswith("Despesa.zip")]:
            for n, fh in membros(os.path.join(PASTA, z), arq):
                for t in tags:
                    pass
                for ev, el in ET.iterparse(fh):
                    if el.attrib.get("idEmpenho") in ids:
                        r = dict(el.attrib); r["_tag"] = el.tag; r["_arquivo"] = n
                        out.write(json.dumps(r, ensure_ascii=False) + "\n"); k += 1
                    el.clear()
    print(nome, k)

k = 0
with open(os.path.join(SAIDA, "contratos.jsonl"), "w") as out:
    for z in [f for f in zips if f.endswith("Contrato.zip")]:
        for n, fh in membros(os.path.join(PASTA, z), "_Contrato.xml"):
            for a in iterar(fh, "Contrato"):
                if RX_OBJ.search(a.get("dsObjeto", "")):
                    a["_arquivo"] = n; out.write(json.dumps(a, ensure_ascii=False) + "\n"); k += 1
print("contratos", k)
