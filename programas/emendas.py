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
_S = r"(?:[ \t]*\.[ \t]*|[ \t])"  # separador: ponto (com espaços soltos) ou só um espaço
RE_DOT = re.compile(r"(?<![\d.])(\d{2})" + _S + r"(\d{3})" + _S + r"(\d{2})" + _S + r"(\d{3})" + _S + r"(\d{4})" + _S +
                    r"(\d{4})" + _S + r"(\d)" + _S + r"(\d)" + _S + r"(\d{2})" + _S + r"(\d{2})" + _S + r"(\d{4,5})(?![\d,])")
RE_DOT_TXT = re.compile(r"(\d{2})\.(\d{3})\.(\d{2})\.(\d{3})\.(\d{4})\.(\d{4})\.(\d)\.(\d)\.(\d{2})\.(\d{2})\.(\d{4,5})")
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
        txt = subprocess.run(["pdftotext", "-layout", str(p), "-"], capture_output=True, text=True, timeout=60).stdout
    except Exception:
        txt = ""
    if not RE_DOT.search(txt):  # PDF digitalizado (imagem): tenta OCR
        txt = ocr_pdf(p) or txt
    return txt


def ocr_pdf(p):
    import tempfile
    try:
        with tempfile.TemporaryDirectory() as d:
            subprocess.run(["pdftoppm", "-r", "250", "-gray", "-png", str(p), f"{d}/pg"], check=True, timeout=180)
            partes = []
            for img in sorted(Path(d).glob("pg*.png")):
                r = subprocess.run(["tesseract", str(img), "-", "-l", "por", "--psm", "6"], capture_output=True, text=True, timeout=180)
                partes.append(r.stdout)
        txt = "\n".join(partes)
        # OCR troca ponto por vírgula e põe espaços dentro dos códigos
        txt = re.sub(r"(?<=\d)\s*[.,]\s*(?=\d{2,4}\b)", ".", txt)
        return "[OCR]\n" + txt
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
        vals = RE_VALOR.findall(resto)  # colunas: valor inicial | valor remanejado | valor atualizado
        if len(vals) >= 3: v = vals[1]
        elif len(vals) == 2: v = vals[0] if vals[0] == vals[1] else vals[1]  # sem a coluna inicial, ou sem a atualizada
        else: v = vals[0] if vals else None
        papel = None
        for pos, p in marcas:
            if pos < m.start(): papel = p
        dots.append({"dotacao": ".".join(m.groups()), "valor": brl(v) if v else None, "papel_texto": papel})
    # códigos escritos errado na própria emenda (dígito faltando, ponto a menos): guarda com alerta
    estritos = {m.start() for m in RE_DOT.finditer(txt)}
    pos = 0
    for linha in txt.splitlines(keepends=True):
        m = re.match(r"\s*(\d{2}[\d. ]{12,48}\d{2,4})(?=\s{2,}|\s*$)", linha)
        if m and m.group(1).count(".") >= 6 and not any(pos <= e < pos + len(linha) for e in estritos):
            vals = RE_VALOR.findall(linha[m.end():])
            v = vals[1] if len(vals) >= 3 else (vals[0] if len(vals) == 2 and vals[0] == vals[1] else (vals[-1] if vals else None))
            papel = None
            for p_, nome in marcas:
                if p_ < pos: papel = nome
            dots.append({"dotacao": re.sub(r"\s+", "", m.group(1)), "valor": brl(v) if v else None,
                         "papel_texto": papel, "malformada": True})
        pos += len(linha)
    tot = [brl(x) for x in RE_TOTAL.findall(txt)]
    cnpjs = sorted(set(RE_CNPJ.findall(txt)))
    return dots, (min(tot) if tot else None), cnpjs


def extrair(a):
    out = Path(a.saida)
    meta = {f"{m['numero']:0>3}_{m['ano']}": m for m in json.loads((out / "sapl_emendas.json").read_text())} \
        if (out / "sapl_emendas.json").exists() else {}
    brutos = []
    arquivos = sorted((out / "pdf").glob("*.pdf")) + sorted((out / "pdf").glob("*.txt"))
    if not arquivos: arquivos = sorted((out / "txt").glob("*.txt"))  # usa o texto já extraído
    for pdf in arquivos:
        txt = pdf.read_text(errors="ignore") if pdf.suffix == ".txt" else texto_pdf(pdf)
        if pdf.suffix == ".pdf" and pdf.parent.name == "pdf":
            (out / "txt").mkdir(exist_ok=True); (out / "txt" / f"{pdf.stem}.txt").write_text(txt)
        if txt.startswith("[OCR]"):  # OCR escreve 25.000.00: o último ponto volta a ser vírgula dos centavos
            txt = re.sub(r"(?<![\d.])(\d{1,3}(?:\.\d{3})*)\.(\d{2})(?![\d.])", r"\1,\2", txt)
        dots, total, cnpjs = ler_emenda(txt)
        m = meta.get(pdf.stem, {})
        brutos.append({"ocr": txt.startswith("[OCR]"), "chave": pdf.stem, "numero": m.get("numero", pdf.stem.split("_")[0]),
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
            papel = d["papel_texto"] or ("origem" if freq[d["dotacao"]] >= limiar else "destino")
            (orig if papel == "origem" else dest).append(d)
        alertas = []
        if not b["dotacoes"]: alertas.append("PDF sem dotação legível (talvez imagem: precisa OCR)")
        if not dest: alertas.append("sem dotação de destino")
        sd = round(sum(d["valor"] or 0 for d in dest), 2)
        so = round(sum(d["valor"] or 0 for d in orig), 2)
        if dest and any(d["valor"] is None for d in dest) and so > sd:  # OCR perdeu um valor de destino
            sd = so; alertas.append("valor lido pela origem (OCR incompleto): conferir")
        b["total"] = sd or None
        if b["total"] is None and "sem valor total" not in alertas: alertas.append("sem valor total")
        if sd and so and abs(sd - so) > 0.01: alertas.append(f"destino {sd:,.2f} ≠ origem {so:,.2f}")
        if b.get("ocr"): alertas.append("lido por OCR: conferir")
        for d in b["dotacoes"]:
            if d.get("malformada"): alertas.append(f"código da dotação escrito errado na emenda: {d['dotacao']}")
        impositiva = not re.search(r"poder\s+executivo|modificativa", b["ementa"], re.I)
        if not impositiva: alertas = ["não é emenda impositiva (Executivo ou modificativa)"]
        linhas.append({**{k: b[k] for k in ("numero", "ano", "ementa", "url", "total", "cnpjs")}, "impositiva": impositiva,
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
    "fonte": ["cdfontepadrao", "cdfonte", "fonte", "cdfontedestinacao", "cdfonterecurso"], "idempenho": ["idempenho"], "nrempenho": ["nrempenho", "numeroempenho"],
    "anoempenho": ["nranoempenho", "anoempenho"], "credor_doc": ["nrdoccredor", "documentocredor", "cnpjcpfcredor", "nrdocumento"],
    "credor_nome": ["nmcredor", "nomecredor", "credor"], "valor": ["vlempenho", "valorempenho", "vloperacao", "valor"],
    "data": ["dtempenho", "dataempenho"], "historico": ["dshistorico", "historico"],
    "vlpago": ["vlpagamento", "valorpago", "vlpago", "vloperacao"], "vlestorno": ["vlestorno"], "vlanulado": ["vlestornoempenho", "vlanulacao", "vlanulado"],
}


def _mapear(colunas):
    mapa = {}
    for col in colunas:
        for interno, nomes in ALIAS.items():
            if norm(col) in nomes and interno not in mapa: mapa[interno] = col
    return mapa


def ler_xml(caminho, tag):
    import xml.etree.ElementTree as ET
    # atributos vazios não aparecem no XML: o mapa é montado com todos os nomes vistos, registro a registro
    regs, mapa, vistos = [], {}, set()
    for _, el in ET.iterparse(caminho):
        if el.tag == tag:
            novos = set(el.attrib) - vistos
            if novos:
                vistos |= novos; mapa = _mapear(sorted(vistos))
            regs.append({k: el.attrib.get(c, "") for k, c in mapa.items()}); el.clear()
    return regs, mapa


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
        return tuple(p) + (int(so_digitos(r["fonte"])[-3:] or -1),)
    except KeyError:
        return None


def chave_txt(dot):
    m = RE_DOT_TXT.fullmatch(dot)
    if not m: return None
    return tuple(int(x) for x in m.groups()[:10]) + (int(m.group(11)[-3:]),)


def val(x):
    x = str(x or "0").strip()
    try:
        return brl(x) if "," in x else float(x or 0)
    except ValueError:
        return 0.0


RE_CITA = re.compile(r"emendas?(.{0,120})", re.I | re.S)
RE_NUM = re.compile(r"(?<![\d/.])(\d{1,3})\s*/\s*(20\d\d)")
RE_CORTE = re.compile(r"\b(?:MI|Memorando|Of[ií]cio|Preg[aã]o|Processo|Contrato|Ata|Dispensa|Inexigibilidade|Lei|"
                      r"Empenho|Edital|Termo|Protocolo|SEI|Plano|Programa)\b", re.I)
RE_OUTRA_ESFERA = re.compile(r"federa|estadua|deputad|senador|sigtv|transferegov", re.I)


def citacoes(historico):
    """Números de emenda municipal citados no histórico do empenho: {(numero, ano), ...}"""
    h = re.sub(r"\s+", " ", historico or ""); achou = set()
    for m in RE_CITA.finditer(h):
        trecho = m.group(1)
        if RE_OUTRA_ESFERA.search(trecho[:40]): continue
        trecho = RE_CORTE.split(trecho)[0]
        for n, ano in RE_NUM.findall(trecho): achou.add((int(n), int(ano)))
    return achou


def cruzar(a):
    out = Path(a.saida)
    emendas = [e for e in json.loads((out / "emendas_extraidas.json").read_text()) if e.get("impositiva", True)]
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
    por_cita = defaultdict(list)
    for r in emp:
        for k in citacoes(r.get("historico")): por_cita[k].append(r)
    por_dot = defaultdict(list)
    for r in emp:
        k = chave_dot(r)
        if k: por_dot[k].append(r)
    # quanto das emendas cai em cada dotação (várias emendas podem dividir a mesma)
    emendas_na_dot = defaultdict(float)
    for e in emendas:
        for d, v in zip(e["dotacoes_destino"], e["valores_destino"]):
            if chave_txt(d): emendas_na_dot[chave_txt(d)] += v or 0
    valor_emenda = {(int(so_digitos(e["numero"]) or -1), int(so_digitos(e["ano"]) or -1)):
                    (e["total"] or sum(v or 0 for v in e["valores_destino"])) for e in emendas}
    res = []
    for e in emendas:
        cnpjs = {so_digitos(c) for c in e["cnpjs"]}
        forte, candidatos = [], []
        chave_e = (int(so_digitos(e["numero"]) or -1), int(so_digitos(e["ano"]) or -1))
        alvos = [("citação", r) for r in por_cita.get(chave_e, [])]
        alvos += [(d, r) for d in e["dotacoes_destino"] for r in por_dot.get(chave_txt(d), [])]
        if sem_codigo:
            alvos += [(None, r) for r in emp if cnpjs and so_digitos(r.get("credor_doc")) in cnpjs]
        vistos = set()
        for d, r in alvos:
                if idp(r) in vistos: continue
                vistos.add(idp(r))
                item = {"empenho": f"{so_digitos(r.get('nrempenho'))}/{so_digitos(r.get('anoempenho'))}",
                        "data": r.get("data", ""), "credor": r.get("credor_nome", ""), "doc": so_digitos(r.get("credor_doc")),
                        "empenhado": round(val(r.get("valor")) - val(r.get("vlanulado")), 2), "anulado": val(r.get("vlanulado")),
                        "pago": pagos.get(idp(r), 0.0),
                        "historico": re.sub(r"\s+", " ", r.get("historico") or "")[:300], "dotacao": d}
                cit = citacoes(r.get("historico"))
                cita = chave_e in cit
                cita_outra = bool(cit) and not cita  # empenho de outra emenda da mesma entidade
                item["vinculo"] = "histórico cita a emenda" if cita else ("CNPJ do beneficiário" if item["doc"] in cnpjs and not cita_outra else "")
                # citação com credor que não é o beneficiário de um repasse (modalidade 50): número provavelmente errado
                repasse = e["dotacoes_destino"] and all(".50." in d for d in e["dotacoes_destino"])
                item["credor_divergente"] = bool(cita and cnpjs and repasse and item["doc"] not in cnpjs)
                item["outras_emendas_no_empenho"] = len(cit) > 1
                # empenho que atende várias emendas: divide pelo valor de cada uma
                if cita and len(cit) > 1:
                    soma = sum(valor_emenda.get(k, 0) for k in cit)
                    item["fator"] = round(valor_emenda.get(chave_e, 0) / soma, 6) if soma else round(1 / len(cit), 6)
                else:
                    item["fator"] = 1.0
                if item["empenhado"] <= 0.005 and item["pago"] <= 0.005: continue  # empenho anulado
                (forte if item["vinculo"] else candidatos).append(item)
        if sem_codigo: candidatos = []  # sem dotação no arquivo, "mesma dotação" não tem sentido
        total = e["total"] or sum(v or 0 for v in e["valores_destino"])
        conta = [i for i in forte if not i["credor_divergente"]]
        emp_f = round(sum(i["empenhado"] * i["fator"] for i in conta), 2)
        pago_f = round(sum(i["pago"] * i["fator"] for i in conta), 2)
        forte_ok = [i for i in forte if not i["credor_divergente"]]
        if forte and not forte_ok:
            st = "citada só em empenho de outro credor (conferir)"
        elif forte and not total:
            st = "com execução (valor da emenda não lido)"
        elif forte:
            st = "paga" if tem_pag and pago_f >= 0.95 * total else ("empenhada" if emp_f >= 0.95 * total else "parcial")
        elif candidatos:
            st = "dotação movimentada, sem vínculo direto"
        else:
            st = "sem execução encontrada"
        partilhada = any(chave_txt(d) and emendas_na_dot[chave_txt(d)] > (v or 0) + 0.01
                         for d, v in zip(e["dotacoes_destino"], e["valores_destino"]))
        res.append({**e, "valor": total, "status": st, "empenhado_vinculado": emp_f, "pago_vinculado": pago_f,
                    "dotacao_partilhada": partilhada, "empenhos_vinculados": forte,
                    "empenhos_mesma_dotacao": sorted(candidatos, key=lambda i: -i["empenhado"])[:15]})
    conhecidas = {(int(so_digitos(e["numero"]) or -1), int(so_digitos(e["ano"]) or -1)) for e in emendas}
    orfas = {f"{n}/{ano}": round(sum(val(r.get("valor")) for r in rs), 2) for (n, ano), rs in por_cita.items()
             if (n, ano) not in conhecidas}
    (out / "empenhos_emendas_fora_da_lista.json").write_text(json.dumps(orfas, ensure_ascii=False, indent=1))
    (out / "emendas.json").write_text(json.dumps(res, ensure_ascii=False, indent=1))
    c = Counter(r["status"] for r in res)
    print(f"{len(res)} emendas | valor R$ {sum(r['valor'] or 0 for r in res):,.2f} | {dict(c)}")


# ---------------------------------------------------------------- painel
SITUACAO = {  # status interno -> (rótulo no site, ordem)
    "paga": ("Paga", 1),
    "empenhada": ("Empenhada, falta pagar", 2),
    "parcial": ("Executada em parte", 3),
    "com execução (valor da emenda não lido)": ("Com gasto (valor da emenda a confirmar)", 4),
    "dotação movimentada, sem vínculo direto": ("Sem vínculo claro", 5),
    "citada só em empenho de outro credor (conferir)": ("A conferir", 6),
    "sem execução encontrada": ("Nenhum gasto encontrado", 7),
}


def painel(a):
    """Resumo enxuto para o site (dados.json -> chave "emendas")."""
    out = Path(a.saida)
    r = json.loads((out / "emendas.json").read_text())
    extra = json.loads((out / "emendas_extraidas.json").read_text())
    nao_imp = sum(1 for e in extra if not e.get("impositiva", True))
    orfas = json.loads((out / "empenhos_emendas_fora_da_lista.json").read_text()) if (out / "empenhos_emendas_fora_da_lista.json").exists() else {}
    lista = []
    for e in r:
        valor = e["valor"] or 0
        autores = [re.sub(r"\s*\(Vereador[a]?\)", "", x).strip() for x in e["autores"].split(";") if x.strip()]
        ementa = re.sub(r"\s+", " ", e["ementa"])
        sem_ac = unicodedata.normalize("NFKD", ementa[:90]).encode("ascii", "ignore").decode().upper()
        area = "Saúde" if re.search(r"AREA\s+S?AU?DE|SAUDE|SAUDE", sem_ac) else ("Geral" if "GERAL" in sem_ac else "Não informada")
        objeto = re.sub(r"^.*?EXECU[CÇ][AÃ]O\s+OBRIGAT[OÓ]RIA\s*-?\s*(?:[AÁ]REA\s+\S+)?\s*", "", ementa, flags=re.I).strip(" -")
        alertas = [x for x in e.get("alertas_extracao", []) if not x.startswith("lido por OCR")]
        alertas = ["Valor lido pela origem do recurso (documento digitalizado): conferir" if x.startswith("valor lido pela origem") else x for x in alertas]
        if valor and e["empenhado_vinculado"] > 1.05 * valor:
            alertas.append("Empenhos que citam a emenda somam mais que o valor dela")
        if any(i.get("credor_divergente") for i in e["empenhos_vinculados"]):
            alertas.append("Empenho cita a emenda, mas o credor não é o beneficiário indicado")
        alertas = [x.replace("código da dotação escrito errado na emenda", "Código do orçamento escrito errado na emenda")
                    .replace("PDF sem dotação legível (talvez imagem: precisa OCR)", "Texto da emenda não pôde ser lido")
                    .replace("sem dotação de destino", "Sem dotação de destino").replace("sem valor total", "Sem valor")
                   for x in alertas]
        alertas = [re.sub(r"^destino .* ≠ origem .*$", "Valor de destino diferente do valor de origem", x) for x in alertas]
        if "Texto da emenda não pôde ser lido" in alertas:  # os outros dois são consequência deste
            alertas = [x for x in alertas if x not in ("Sem dotação de destino", "Sem valor")]
        alertas = list(dict.fromkeys(alertas))
        emp = sorted(e["empenhos_vinculados"], key=lambda i: -i["empenhado"])
        lista.append({
            "n": int(so_digitos(e["numero"]) or 0), "autores": autores, "area": area, "objeto": objeto[:400],
            "valor": round(valor, 2), "empenhado": e["empenhado_vinculado"], "pago": e["pago_vinculado"],
            "situacao": SITUACAO.get(e["status"], (e["status"], 9))[0], "url": e["url"],
            "alertas": alertas,
            "empenhos": [{"nr": i["empenho"], "data": i["data"][:10], "credor": i["credor"].strip()[:80],
                          "empenhado": round(i["empenhado"] * i.get("fator", 1), 2), "pago": round(i["pago"] * i.get("fator", 1), 2),
                          "vinculo": i["vinculo"], "dividido": i.get("fator", 1) < 1, "divergente": i.get("credor_divergente", False)}
                         for i in emp[:12]],
        })
    lista.sort(key=lambda x: x["n"])
    res = {"ano_orcamento": a.ano, "remessa_tce": a.remessa, "atualizado_em": a.atualizado,
           "nao_impositivas": nao_imp,
           "situacoes": [v[0] for v in sorted(SITUACAO.values(), key=lambda v: v[1])],
           "fora_da_lista": [{"emenda": k, "empenhado": v} for k, v in sorted(orfas.items(), key=lambda i: -i[1])],
           "lista": lista}
    (out / "painel_emendas.json").write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")))
    if a.dados:
        d = json.loads(Path(a.dados).read_text(encoding="utf-8")); d["emendas"] = res
        Path(a.dados).write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"painel: {len(lista)} emendas, R$ {sum(x['valor'] for x in lista):,.2f}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    b = sp.add_parser("baixar"); b.add_argument("--ano-sapl", type=int, default=2025); b.add_argument("--pausa", type=float, default=1.5)
    for p in (b, sp.add_parser("extrair"), c := sp.add_parser("cruzar")): p.add_argument("--saida", default="fontes_osb/emendas")
    g = c.add_mutually_exclusive_group(required=True); g.add_argument("--tce"); g.add_argument("--empenhos")
    c.add_argument("--ano", type=int, default=2026); c.add_argument("--pagamentos")
    pn = sp.add_parser("painel", help="gera o resumo para o site (e opcionalmente grava em dados.json)")
    pn.add_argument("--saida", default="fontes_osb/emendas"); pn.add_argument("--dados")
    pn.add_argument("--ano", type=int, default=2026); pn.add_argument("--remessa", default="")
    pn.add_argument("--atualizado", default=time.strftime("%Y-%m-%d"))
    a = ap.parse_args()
    {"baixar": baixar, "extrair": extrair, "cruzar": cruzar, "painel": painel}[a.cmd](a)
