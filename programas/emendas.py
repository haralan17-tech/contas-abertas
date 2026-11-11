#!/usr/bin/env python3
"""
emendas.py — Caminho das emendas impositivas de Foz do Iguaçu
Câmara (SAPL) -> dotação na LOA -> empenhos e pagamentos da Prefeitura (TCE-PR / SIM-AM)

Por que este caminho:
  O SIM-AM só passa a marcar emendas a partir da remessa de janeiro de 2027
  (Nota SIM-AM 004/2026), e mesmo assim só o TIPO (1110 individual, 1120 bancada...),
  sem número da emenda nem vereador. Em 2026 não há marca nenhuma.
  A ponte possível é a DOTAÇÃO que vem escrita em cada PDF de emenda no SAPL
  (ex.: 12.003.12.361.0310.2301.4.4.50.42.1000) e o CNPJ do beneficiário.

Uso (em máquina com internet):
  python emendas.py baixar   --ano-sapl 2025 --saida fontes_osb/emendas
  python emendas.py extrair  --saida fontes_osb/emendas
  python emendas.py cruzar   --saida fontes_osb/emendas --tce PASTA_TCE --ano 2026
     (PASTA_TCE = a mesma do processar.py: AAAA_410830_Empenho.xml, _EmpenhoPagamento.xml, _EmpenhoPagamentoEstorno.xml)
  ou, com CSV:  --empenhos Empenho.csv [--pagamentos Pagamento.csv]

  ano-sapl = ano em que as emendas foram apresentadas (2025 -> orçamento de 2026).
  Tipo de matéria 46 = "Emenda ao Orçamento" (EMORÇ) no SAPL de Foz.
"""
import argparse, csv, glob, json, re, subprocess, sys, time, unicodedata
from collections import Counter, defaultdict
from pathlib import Path

SAPL = "https://sapl.fozdoiguacu.pr.leg.br"
TIPO_EMENDA = 46

# 07.001.04.123.0140.2035.3.3.90.39.1000
RE_DOT = re.compile(r"(\d{2})\.(\d{3})\.(\d{2})\.(\d{3})\.(\d{4})\.(\d{4})\.(\d)\.(\d)\.(\d{2})\.(\d{2})\.(\d{4,5})")
RE_CNPJ = re.compile(r"\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}")
RE_VALOR = re.compile(r"\d{1,3}(?:\.\d{3})*,\d{2}")
RE_TOTAL = re.compile(r"TOTAL\s+(\d{1,3}(?:\.\d{3})*,\d{2})", re.I)


def brl(s):
    return float(s.replace(".", "").replace(",", "."))


def norm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", s.lower())


def so_digitos(s):
    return re.sub(r"\D", "", str(s or ""))


# ---------------------------------------------------------------- baixar
def baixar(a):
    import requests
    out = Path(a.saida); (out / "pdf").mkdir(parents=True, exist_ok=True)
    s = requests.Session(); s.headers["User-Agent"] = "OSB-Foz contas-abertas"
    materias, url = [], f"{SAPL}/api/materia/materialegislativa/?tipo={TIPO_EMENDA}&ano={a.ano_sapl}&page_size=100"
    while url:
        r = s.get(url, timeout=60); r.raise_for_status(); j = r.json()
        materias += j.get("results", [])
        url = (j.get("pagination", {}).get("links", {}) or {}).get("next") or j.get("next")
        time.sleep(a.pausa)
    print(f"{len(materias)} emendas no SAPL ({a.ano_sapl})")
    autores_cache = {}
    for m in materias:
        r = s.get(f"{SAPL}/api/materia/autoria/?materia={m['id']}", timeout=60)
        nomes = []
        for au in (r.json().get("results", []) if r.ok else []):
            aid = au.get("autor")
            if aid not in autores_cache:
                ra = s.get(f"{SAPL}/api/base/autor/{aid}/", timeout=60)
                autores_cache[aid] = ra.json().get("nome", str(aid)) if ra.ok else str(aid)
            nomes.append(autores_cache[aid])
        m["autores"] = nomes
        pdf = out / "pdf" / f"{m['numero']:0>3}_{m['ano']}.pdf"
        if m.get("texto_original") and not pdf.exists():
            rp = s.get(m["texto_original"], timeout=120)
            if rp.ok: pdf.write_bytes(rp.content)
        time.sleep(a.pausa)
    (out / "sapl_emendas.json").write_text(json.dumps(materias, ensure_ascii=False, indent=1))


# ---------------------------------------------------------------- extrair
def texto_pdf(p):
    try:
        return subprocess.run(["pdftotext", "-layout", str(p), "-"], capture_output=True, text=True, timeout=60).stdout
    except Exception:
        return ""


def ler_emenda(txt):
    """Dotações com valor, papel (anular/suplementar) pela palavra-chave mais próxima antes."""
    marcas = [(m.start(), "origem") for m in re.finditer(r"anula", txt, re.I)]
    marcas += [(m.start(), "destino") for m in re.finditer(r"suplementa", txt, re.I)]
    marcas.sort()
    dots = []
    for m in RE_DOT.finditer(txt):
        resto = txt[m.end(): txt.find("\n", m.end()) if "\n" in txt[m.end():] else None]
        v = RE_VALOR.search(resto)
        papel = None
        for pos, p in marcas:
            if pos < m.start(): papel = p
        dots.append({"dotacao": m.group(0), "valor": brl(v.group(0)) if v else None, "papel_texto": papel})
    tot = [brl(x) for x in RE_TOTAL.findall(txt)]
    cnpjs = sorted(set(RE_CNPJ.findall(txt)))
    return dots, (min(tot) if tot else None), cnpjs


def extrair(a):
    out = Path(a.saida)
    meta = {f"{m['numero']:0>3}_{m['ano']}": m for m in json.loads((out / "sapl_emendas.json").read_text())} \
        if (out / "sapl_emendas.json").exists() else {}
    brutos = []
    for pdf in sorted((out / "pdf").glob("*.pdf")) + sorted((out / "pdf").glob("*.txt")):
        txt = pdf.read_text(errors="ignore") if pdf.suffix == ".txt" else texto_pdf(pdf)
        dots, total, cnpjs = ler_emenda(txt)
        m = meta.get(pdf.stem, {})
        brutos.append({"chave": pdf.stem, "numero": m.get("numero", pdf.stem.split("_")[0]),
                       "ano": m.get("ano", pdf.stem.split("_")[-1]), "autores": m.get("autores", []),
                       "ementa": (m.get("ementa") or "").strip(), "url": m.get("texto_original", ""),
                       "dotacoes": dots, "total": total, "cnpjs": cnpjs})
    # Dotações que aparecem em muitas emendas são as "reservas" da LOA (origem do dinheiro).
    freq = Counter(d["dotacao"] for b in brutos for d in {x["dotacao"]: x for x in b["dotacoes"]}.values())
    limiar = max(5, int(len(brutos) * 0.05))
    linhas = []
    for b in brutos:
        dest, orig = [], []
        for d in b["dotacoes"]:
            papel = "origem" if freq[d["dotacao"]] >= limiar else (d["papel_texto"] or "destino")
            (orig if papel == "origem" else dest).append(d)
        alertas = []
        if not b["dotacoes"]: alertas.append("PDF sem dotação legível (talvez imagem: precisa OCR)")
        if not dest: alertas.append("sem dotação de destino")
        if b["total"] is None: alertas.append("sem valor total")
        sd = sum(d["valor"] or 0 for d in dest)
        if b["total"] and dest and abs(sd - b["total"]) > 0.01: alertas.append(f"destino soma {sd:,.2f} ≠ total")
        linhas.append({**{k: b[k] for k in ("numero", "ano", "ementa", "url", "total", "cnpjs")},
                       "autores": "; ".join(b["autores"]),
                       "dotacoes_destino": [d["dotacao"] for d in dest],
                       "valores_destino": [d["valor"] for d in dest],
                       "dotacoes_origem": sorted({d["dotacao"] for d in orig}),
                       "alertas_extracao": alertas})
    (out / "emendas_extraidas.json").write_text(json.dumps(linhas, ensure_ascii=False, indent=1))
    with open(out / "emendas_extraidas.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["numero", "ano", "autores", "valor", "cnpj", "dotacao_destino", "dotacao_origem", "alertas", "ementa", "url"])
        for l in linhas:
            w.writerow([l["numero"], l["ano"], l["autores"], l["total"], " ".join(l["cnpjs"]),
                        " ".join(l["dotacoes_destino"]), " ".join(l["dotacoes_origem"]),
                        " | ".join(l["alertas_extracao"]), l["ementa"], l["url"]])
    ok = sum(1 for l in linhas if not l["alertas_extracao"])
    print(f"{len(linhas)} emendas lidas; {ok} sem alerta; reservas (origem) detectadas: "
          f"{[d for d, n in freq.items() if n >= limiar]}")


# ---------------------------------------------------------------- cruzar
ALIAS = {  # nomes possíveis das colunas nos arquivos do TCE-PR (PIT) -> nome interno
    "orgao": ["cdorgao", "orgao", "codorgao"], "unidade": ["cdunidade", "unidade", "codunidade"],
    "funcao": ["cdfuncao", "funcao"], "subfuncao": ["cdsubfuncao", "subfuncao"],
    "programa": ["cdprograma", "cdprogramaloa", "programa"], "projativ": ["cdprojetoatividade", "projetoatividade", "acao"],
    "categoria": ["cdcategoriaeconomica", "categoriaeconomica"], "grupo": ["cdgruponatureza", "gruponatureza"],
    "modalidade": ["cdmodalidade", "modalidade"], "elemento": ["cdelemento", "elemento"],
    "fonte": ["cdfonte", "fonte", "cdfontepadrao", "cdfontedestinacao", "cdfonterecurso"], "idempenho": ["idempenho"], "nrempenho": ["nrempenho", "numeroempenho"],
    "anoempenho": ["nranoempenho", "anoempenho"], "credor_doc": ["nrdoccredor", "documentocredor", "cnpjcpfcredor", "nrdocumento"],
    "credor_nome": ["nmcredor", "nomecredor", "credor"], "valor": ["vlempenho", "valorempenho", "vloperacao", "valor"],
    "data": ["dtempenho", "dataempenho"], "historico": ["dshistorico", "historico"],
    "vlpago": ["vlpagamento", "valorpago", "vlpago", "vloperacao"], "vlestorno": ["vlestorno"],
}


def _mapear(colunas):
    mapa = {}
    for col in colunas:
        for interno, nomes in ALIAS.items():
            if norm(col) in nomes and interno not in mapa: mapa[interno] = col
    return mapa


def ler_xml(caminho, tag):
    import xml.etree.ElementTree as ET
    regs, mapa = [], None
    for _, el in ET.iterparse(caminho):
        if el.tag == tag:
            if mapa is None: mapa = _mapear(el.attrib.keys())
            regs.append({k: el.attrib.get(c, "") for k, c in mapa.items()}); el.clear()
    return regs, mapa or {}


def achar_xml(pasta, ano, nome):
    r = glob.glob(str(Path(pasta) / "**" / f"{ano}_*_{nome}.xml"), recursive=True)
    return r[0] if r else None


def ler_csv(caminho):
    raw = Path(caminho).read_bytes()
    txt = raw.decode("utf-8-sig", errors="ignore") if raw[:3] == b"\xef\xbb\xbf" or b"\xc3" in raw[:5000] else raw.decode("latin-1")
    sep = ";" if txt[:2000].count(";") > txt[:2000].count(",") else ","
    rd = csv.DictReader(txt.splitlines(), delimiter=sep)
    mapa = _mapear(rd.fieldnames or [])
    return [{k: r.get(c, "") for k, c in mapa.items()} for r in rd], mapa


def chave_dot(r):
    try:
        p = [int(so_digitos(r[k]) or -1) for k in ("orgao", "unidade", "funcao", "subfuncao", "programa", "projativ",
                                                     "categoria", "grupo", "modalidade", "elemento")]
        return tuple(p) + (int(so_digitos(r["fonte"])[-4:] or -1),)
    except KeyError:
        return None


def chave_txt(dot):
    m = RE_DOT.fullmatch(dot)
    return tuple(int(x) for x in m.groups()[:10]) + (int(m.group(11)[-4:]),)


def val(x):
    x = str(x or "0").strip()
    try:
        return brl(x) if "," in x else float(x or 0)
    except ValueError:
        return 0.0


def cruzar(a):
    out = Path(a.saida)
    emendas = json.loads((out / "emendas_extraidas.json").read_text())
    pagos = defaultdict(float)
    def idp(r): return so_digitos(r.get("idempenho")) or f"{so_digitos(r.get('nrempenho'))}/{so_digitos(r.get('anoempenho'))}"
    if a.tce:
        f = achar_xml(a.tce, a.ano, "Empenho")
        if not f: sys.exit(f"Não achei {a.ano}_*_Empenho.xml em {a.tce}")
        emp, mapa = ler_xml(f, "Empenho")
        fp, fe = achar_xml(a.tce, a.ano, "EmpenhoPagamento"), achar_xml(a.tce, a.ano, "EmpenhoPagamentoEstorno")
        if fp:
            for r in ler_xml(fp, "EmpenhoPagamento")[0]: pagos[idp(r)] += val(r.get("vlpago"))
        if fe:
            for r in ler_xml(fe, "EmpenhoPagamentoEstorno")[0]: pagos[idp(r)] -= val(r.get("vlestorno"))
        tem_pag = bool(fp)
    else:
        emp, mapa = ler_csv(a.empenhos)
        tem_pag = bool(a.pagamentos)
        if a.pagamentos:
            for r in ler_csv(a.pagamentos)[0]: pagos[idp(r)] += val(r.get("vlpago") or r.get("valor"))
    if not {"valor", "credor_doc"} <= set(mapa): sys.exit(f"Campos de valor/credor não reconhecidos. Achados: {mapa}. Ajuste ALIAS.")
    sem_codigo = [k for k in ("orgao", "unidade", "funcao", "subfuncao", "programa", "projativ", "categoria", "grupo",
                              "modalidade", "elemento", "fonte") if k not in mapa]
    if sem_codigo:
        print(f"AVISO: o arquivo de empenhos não traz {sem_codigo}; o vínculo será só por CNPJ do beneficiário "
              f"ou citação da emenda no histórico (compras diretas ficam sem vínculo).")
    por_dot = defaultdict(list)
    for r in emp:
        k = chave_dot(r)
        if k: por_dot[k].append(r)
    # quanto das emendas cai em cada dotação (várias emendas podem dividir a mesma)
    emendas_na_dot = defaultdict(float)
    for e in emendas:
        for d, v in zip(e["dotacoes_destino"], e["valores_destino"]): emendas_na_dot[chave_txt(d)] += v or 0
    res = []
    for e in emendas:
        cnpjs = {so_digitos(c) for c in e["cnpjs"]}
        forte, candidatos = [], []
        alvos = [(d, r) for d in e["dotacoes_destino"] for r in por_dot.get(chave_txt(d), [])]
        if sem_codigo:  # sem códigos de dotação: procura o CNPJ do beneficiário em todos os empenhos
            alvos = [(None, r) for r in emp if (cnpjs and so_digitos(r.get("credor_doc")) in cnpjs)
                     or re.search(r"emenda", r.get("historico") or "", re.I)]
        for d, r in alvos:
                item = {"empenho": f"{so_digitos(r.get('nrempenho'))}/{so_digitos(r.get('anoempenho'))}",
                        "data": r.get("data", ""), "credor": r.get("credor_nome", ""), "doc": so_digitos(r.get("credor_doc")),
                        "empenhado": val(r.get("valor")), "pago": pagos.get(idp(r), 0.0),
                        "historico": (r.get("historico") or "")[:200], "dotacao": d}
                num = str(e["numero"]).lstrip("0")
                cita = re.search(rf"emenda\D{{0,15}}0*{num}\s*/\s*20\d\d", item["historico"], re.I)
                (forte if (item["doc"] in cnpjs or cita) else candidatos).append(item)
        if sem_codigo: candidatos = []  # sem dotação no arquivo, "mesma dotação" não tem sentido
        total = e["total"] or sum(v or 0 for v in e["valores_destino"])
        emp_f, pago_f = sum(i["empenhado"] for i in forte), sum(i["pago"] for i in forte)
        if forte:
            st = "paga" if tem_pag and pago_f >= 0.95 * total else ("empenhada" if emp_f >= 0.95 * total else "parcial")
        elif candidatos:
            st = "dotação movimentada, sem vínculo direto"
        else:
            st = "sem execução encontrada"
        partilhada = any(emendas_na_dot[chave_txt(d)] > (v or 0) + 0.01 for d, v in zip(e["dotacoes_destino"], e["valores_destino"]))
        res.append({**e, "valor": total, "status": st, "empenhado_vinculado": emp_f, "pago_vinculado": pago_f,
                    "dotacao_partilhada": partilhada, "empenhos_vinculados": forte,
                    "empenhos_mesma_dotacao": sorted(candidatos, key=lambda i: -i["empenhado"])[:15]})
    (out / "emendas.json").write_text(json.dumps(res, ensure_ascii=False, indent=1))
    c = Counter(r["status"] for r in res)
    print(f"{len(res)} emendas | valor R$ {sum(r['valor'] or 0 for r in res):,.2f} | {dict(c)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    b = sp.add_parser("baixar"); b.add_argument("--ano-sapl", type=int, default=2025); b.add_argument("--pausa", type=float, default=1.5)
    for p in (b, sp.add_parser("extrair"), c := sp.add_parser("cruzar")): p.add_argument("--saida", default="fontes_osb/emendas")
    g = c.add_mutually_exclusive_group(required=True); g.add_argument("--tce"); g.add_argument("--empenhos")
    c.add_argument("--ano", type=int, default=2026); c.add_argument("--pagamentos")
    a = ap.parse_args()
    {"baixar": baixar, "extrair": extrair, "cruzar": cruzar}[a.cmd](a)
