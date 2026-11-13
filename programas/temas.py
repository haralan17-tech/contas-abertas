"""Temas especiais a partir dos arquivos do TCE-PR (SIM-AM): fontes de recursos (Sankeys), aluguéis,
obras, contratações sem licitação e transporte coletivo. Usado por processar.py."""
import collections, csv, json, os, re
import xml.etree.ElementTree as ET

from processar import achar, xml_iter, capitaliza, formata_doc, rotulo, _pag_mes_por_empenho

# ------------------------------------------------------------------ classificações
def grupo_fonte(ds):
    d = (ds or "").upper()
    if "RPPS" in d or "PREVID" in d or "COMPENSAÇÃO ENTRE REGIMES" in d:
        return "Previdência dos servidores"
    if "ROYALT" in d or "ITAIPU" in d:
        return "Royalties de Itaipu"
    if "FUNDEB" in d:
        return "Fundeb"
    if "EDUCA" in d or "MERENDA" in d or "PNAE" in d or "PNATE" in d:
        return "Educação: impostos e repasses"
    if "15%" in d or "E.C. 29" in d:
        return "Saúde: recursos próprios"
    if any(k in d for k in ("ATENÇÃO", "SAÚDE", "SUS", "VIGILÂNCIA", "ASSISTÊNCIA FARMAC", "HOSPITAL")):
        return "Saúde: repasses do SUS"
    if "DESVINCULA" in d or "DRM" in d:
        return "Recursos desvinculados (DRM)"
    if "ORDINÁRIOS" in d or "LIVRES" in d or "TESOURO" in d:
        return "Recursos livres"
    if "OPERAÇ" in d and "CRÉDITO" in d:
        return "Empréstimos"
    if "COSIP" in d or "TAXA" in d:
        return "Taxas e iluminação pública"
    if "ASSISTÊNCIA SOCIAL" in d or "SUAS" in d or "CRIANÇA" in d:
        return "Assistência social: repasses"
    return "Outras fontes"


def grupo_natureza(elem):
    e = str(elem)
    if e in {"01", "03", "04", "05", "07", "11", "13", "16", "46", "49", "94", "96", "08", "09"}:
        return "Pessoal e encargos"
    if e in {"30", "32", "31"}:
        return "Materiais e medicamentos"
    if e in {"35", "36", "37", "39", "40", "34"}:
        return "Serviços contratados"
    if e in {"41", "42", "43", "45", "50", "81", "85"}:
        return "Repasses a entidades"
    if e in {"51"}:
        return "Obras"
    if e in {"52", "61"}:
        return "Equipamentos e imóveis"
    if e in {"21", "22", "71", "77"}:
        return "Dívida"
    if e in {"14", "33"}:
        return "Diárias e passagens"
    return "Outras despesas"


def dms_para_decimal(txt):
    """'25°34'56.4 Sul, 54°34'11.1 Oeste' -> (-25.5823, -54.5697)."""
    partes = re.findall(r"(\d+)\s*°\s*(\d+)\s*'\s*([\d.,]+)?\s*\"?\s*(Sul|Norte|Oeste|Leste|S|N|O|W|L|E)", txt or "", re.I)
    if len(partes) < 2:
        return None, None
    def conv(g, m, sg, h):
        v = int(g) + int(m) / 60 + float((sg or "0").replace(",", ".")) / 3600
        return -v if h.upper()[0] in "SOW" else v
    return round(conv(*partes[0]), 6), round(conv(*partes[1]), 6)


def limite_de(ano, corte_mes):
    return f"{ano}-{corte_mes + 1:02d}" if corte_mes < 12 else f"{ano + 1}-01"


def carregar_empenhos(pasta, ano):
    f = achar(pasta, ano, "Empenho")
    emp = {}
    for a in xml_iter(f, "Empenho"):
        if a.get("cdModalidade") == "91":
            continue
        emp[a["idEmpenho"]] = {k: a.get(k, "") for k in (
            "vlEmpenho", "dtEmpenho", "sgDocCredor", "nrDocCredor", "nmCredor", "dsFuncao", "dsSubFuncao",
            "dsDesdobramento", "dsHistorico", "nmEntidade", "cdElemento", "cdDesdobramento", "nmOrgao", "nmUnidade",
            "dsFontePadrao", "dsAplicacaoFonte")}
    return emp


# ------------------------------------------------------------------ principal
def processar_temas(pasta, ano, corte_mes, folha_cnpj, eh_proprio):
    emp = carregar_empenhos(pasta, ano)
    if not emp:
        return None
    limite = limite_de(ano, corte_mes)
    pm = _pag_mes_por_empenho(achar(pasta, ano, "EmpenhoPagamento"), achar(pasta, ano, "EmpenhoPagamentoEstorno"), emp, limite)
    pago = {i: sum(m) for i, m in pm.items()}
    out = {}

    # --- fluxos para os diagramas de Sankey
    fl = collections.Counter()
    roy = collections.Counter()
    for i, a in emp.items():
        v = pago.get(i, 0.0)
        if v <= 0:
            continue
        fonte = grupo_fonte(a["dsFontePadrao"])
        nat = grupo_natureza(a["cdElemento"])
        fl[(fonte, a["dsFuncao"], a["dsSubFuncao"], nat)] += v
        if fonte == "Royalties de Itaipu":
            nome = re.sub(r"\s+", " ", a["nmCredor"]).strip()
            if eh_proprio(nome, a["nrDocCredor"]):
                nome = "Folha de pagamento"
            roy[(a["dsFuncao"], capitaliza(nome) if nome != "Folha de pagamento" else nome)] += v
    out["fluxos"] = {"colunas": ["fonte", "funcao", "subfuncao", "natureza", "valor"],
                     "linhas": [[k[0], k[1], k[2], k[3], round(v, 2)] for k, v in fl.items() if v >= 1]}
    out["royalties_credores"] = [[f, c, round(v, 2)] for (f, c), v in roy.most_common() if v >= 1]

    # --- aluguéis de imóveis
    alug = {}
    mens = [0.0] * corte_mes
    for i, a in emp.items():
        d = (a["dsDesdobramento"] or "").upper()
        if not re.search(r"LOCA[CÇ][AÃ]O DE IM[OÓ]VE", d):
            continue
        nome = re.sub(r"\s+", " ", a["nmCredor"]).strip()
        k = (nome, a["nrDocCredor"].strip())
        c = alug.setdefault(k, {"nome": nome, "documento": formata_doc(a["sgDocCredor"], a["nrDocCredor"]),
                                "tipo": "Pessoa física" if a["sgDocCredor"].strip() == "CPF" else "Empresa ou entidade",
                                "pago": 0.0, "empenhado": 0.0, "orgaos": collections.Counter(), "imoveis": []})
        c["pago"] += pago.get(i, 0.0)
        if a["dtEmpenho"] < limite:
            c["empenhado"] += float(a["vlEmpenho"] or 0)
        c["orgaos"][capitaliza(a["nmOrgao"])] += max(pago.get(i, 0.0), 0.01)
        h = re.sub(r"\s+", " ", a["dsHistorico"]).strip()
        if h and h[:120] not in [x[:120] for x in c["imoveis"]]:
            c["imoveis"].append(h[:260])
        for m, v in enumerate(pm.get(i, [0.0] * 12)[:corte_mes]):
            mens[m] += v
    lista = []
    for c in alug.values():
        lista.append({"nome": c["nome"], "documento": c["documento"], "tipo": c["tipo"], "pago": round(c["pago"], 2),
                      "empenhado": round(c["empenhado"], 2), "orgao": c["orgaos"].most_common(1)[0][0],
                      "imoveis": c["imoveis"][:4]})
    lista.sort(key=lambda x: -x["pago"])
    contratos_loc = []
    fc = achar(pasta, ano, "Contrato")
    if fc:
        for a in xml_iter(fc, "Contrato"):
            obj = rotulo(a.get("dsObjeto", ""))
            if re.search(r"LOCA[CÇ][AÃ]O\s+DE\s+(UM\s+)?IM[OÓ]VE|ALUGUEL DE IM", obj.upper()):
                contratos_loc.append({"contratado": rotulo(a.get("nmContratado", "")), "valor": float(a.get("vlContrato") or 0),
                                      "inicio": a.get("dtInicio", "")[:10], "fim": a.get("dtFim", "")[:10],
                                      "entidade": capitaliza(a.get("nmEntidade", "")), "objeto": obj[:260],
                                      "numero": f"{a.get('nrContrato', '')}/{a.get('nrAnoContrato', '')}"})
    contratos_loc.sort(key=lambda x: -x["valor"])
    out["alugueis"] = {"credores": lista, "mensal": [round(x, 2) for x in mens], "contratos": contratos_loc}

    # --- obras
    obras = []
    fi = achar(pasta, ano, "Intervencao")
    bens = collections.defaultdict(list)
    fb = achar(pasta, ano, "IntervencaoBem")
    if fb:
        for a in xml_iter(fb, "IntervencaoBem"):
            lat, lon = dms_para_decimal(a.get("dsCoordenadaGeografica", ""))
            bens[a["idIntervencao"]].append({"bem": rotulo(a.get("dsBem", "")), "endereco": rotulo(a.get("nmLogradouro", "")).strip(" ,"),
                                             "coord": rotulo(a.get("dsCoordenadaGeografica", "")), "lat": lat, "lon": lon})
    if fi:
        for a in xml_iter(fi, "Intervencao"):
            obras.append({"nome": rotulo(a.get("nmIntervencao", "")), "valor": float(a.get("vlIntervencao") or 0),
                          "inicio": a.get("dtInicio", "")[:10], "prazo_dias": int(float(a.get("nrPrazoExecucao") or 0)),
                          "situacao": rotulo(a.get("dsSituacao", "")), "regime": rotulo(a.get("dsTipoRegimeIntervencao", "")),
                          "ultima_medicao": a.get("dtUltimaMedicao", "")[:10], "entidade": capitaliza(a.get("nmEntidade", "")),
                          "locais": bens.get(a["idIntervencao"], [])})
    obras.sort(key=lambda x: -x["valor"])
    ob = {}
    for i, a in emp.items():
        if a["cdElemento"] != "51":
            continue
        nome = re.sub(r"\s+", " ", a["nmCredor"]).strip()
        c = ob.setdefault(nome, {"nome": nome, "documento": formata_doc(a["sgDocCredor"], a["nrDocCredor"]), "pago": 0.0,
                                 "empenhado": 0.0, "orgao": collections.Counter(), "historicos": []})
        c["pago"] += pago.get(i, 0.0)
        if a["dtEmpenho"] < limite:
            c["empenhado"] += float(a["vlEmpenho"] or 0)
        c["orgao"][capitaliza(a["nmOrgao"])] += max(pago.get(i, 0.0), 0.01)
        h = re.sub(r"\s+", " ", a["dsHistorico"]).strip()[:240]
        if h and len(c["historicos"]) < 3 and h[:80] not in [x[:80] for x in c["historicos"]]:
            c["historicos"].append(h)
    emp_obras = sorted([{**{k: v for k, v in c.items() if k not in ("orgao",)}, "pago": round(c["pago"], 2),
                         "empenhado": round(c["empenhado"], 2), "orgao": c["orgao"].most_common(1)[0][0]} for c in ob.values()
                        if c["pago"] > 0.5 or c["empenhado"] > 0.5], key=lambda x: -x["pago"])
    out["obras"] = {"intervencoes": obras, "pagamentos": emp_obras}

    # --- contratações sem licitação (processos de dispensa e inexigibilidade do ano)
    fl_ = achar(pasta, ano, "Licitacao")
    procs = {}
    resumo = collections.defaultdict(lambda: {"qtd": 0, "valor": 0.0})
    if fl_:
        for a in xml_iter(fl_, "Licitacao"):
            if "dtAbertura" in a or "dsModalidadeLicitacao" in a:
                mod = rotulo(a.get("dsModalidadeLicitacao", ""))
                if not a.get("idLicitacao"):
                    continue
                grupo = "Dispensa" if "Dispensa" in mod else "Inexigibilidade" if "Inexig" in mod else \
                        "Pregão" if "Preg" in mod else "Concorrência" if "Concorr" in mod else mod or "Outra"
                v = float(a.get("vlLicitacao") or 0)
                resumo[grupo]["qtd"] += 1
                resumo[grupo]["valor"] += v
                if grupo in ("Dispensa", "Inexigibilidade"):
                    procs[a["idLicitacao"]] = {"modalidade": grupo, "numero": f"{a.get('nrLicitacao', '')}/{a.get('nrAnoLicitacao', '')}",
                                               "entidade": capitaliza(a.get("nmEntidade", "")), "data": (a.get("dtAbertura") or a.get("dtEdital") or "")[:10],
                                               "valor": v, "objeto": rotulo(a.get("dsObjeto", ""))[:300],
                                               "situacao": rotulo(a.get("dsTipoSituacaoLicitacao", "")),
                                               "classe": rotulo(a.get("dsClassificacaoObjetoLicitacao", "")),
                                               "fornecedores": collections.Counter(), "pago": 0.0}
    fv = achar(pasta, ano, "LicitacaoVencedor")
    if fv:
        for a in xml_iter(fv, "LicitacaoVencedor"):
            p = procs.get(a.get("idlicitacao") or a.get("idLicitacao"))
            if p is None:
                continue
            q = float(a.get("nrQuantidadeVencedorLicitacao") or a.get("nrQuantidade") or 0)
            u = float(a.get("vlLicitacaoVencedorLicitacao") or 0)
            p["fornecedores"][rotulo(a.get("nmPessoa", ""))] += q * u
    fx = achar(pasta, ano, "LicitacaoXEmpenho")
    if fx:
        for a in xml_iter(fx, "LicitacaoXEmpenho"):
            p = procs.get(a.get("idLicitacao"))
            if p is not None:
                p["pago"] += pago.get(a.get("idEmpenho"), 0.0)
    sem = []
    for p in procs.values():
        forn = [{"nome": n, "valor": round(v, 2)} for n, v in p["fornecedores"].most_common(5) if n]
        sem.append({**{k: v for k, v in p.items() if k != "fornecedores"}, "valor": round(p["valor"], 2), "pago": round(p["pago"], 2),
                    "fornecedores": forn})
    sem.sort(key=lambda x: -max(x["valor"], x["pago"]))
    out["sem_licitacao"] = {"processos": sem, "resumo": {k: {"qtd": v["qtd"], "valor": round(v["valor"], 2)} for k, v in resumo.items()}}

    # --- transporte coletivo: pagamentos à concessionária
    tr = collections.Counter()
    trm = [0.0] * corte_mes
    for i, a in emp.items():
        if (a["dsDesdobramento"] or "").upper().startswith("SERVIÇOS DE TRANSPORTE COLETIVO"):
            tr[capitaliza(re.sub(r"\s+", " ", a["nmCredor"]).strip())] += pago.get(i, 0.0)
            for m, v in enumerate(pm.get(i, [0.0] * 12)[:corte_mes]):
                trm[m] += v
    out["transporte_pagamentos"] = {"credores": [{"nome": k, "valor": round(v, 2)} for k, v in tr.most_common()],
                                    "mensal": [round(x, 2) for x in trm]}
    return out


# ------------------------------------------------------------------ dados do OSB (planilhas preenchidas pela equipe)
def ler_csv(caminho):
    if not caminho or not os.path.exists(caminho):
        return []
    with open(caminho, encoding="utf-8-sig") as f:
        return [{k.strip(): (v or "").strip() for k, v in r.items()} for r in csv.DictReader(f, delimiter=";")]


# ------------------------------------------------------------------ licitações acompanhadas pelo OSB
# Lê a planilha "Acompanhamento de Licitações" (xlsx, 1ª aba) ou, se não houver, o CSV antigo (;).
# Colunas: Processo, Órgão, Objeto, Modalidade, Data_sessão, Valor_estimado, Valor_contratado, Economia, Situação, Observação, Link
def _num(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return round(float(v), 2)
    s = str(v).strip().replace("R$", "").replace(" ", "")
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def _data(v):
    import datetime as _dt
    if isinstance(v, (_dt.datetime, _dt.date)):
        return v.strftime("%Y-%m-%d")
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", str(v or ""))
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    m = re.match(r"\d{4}-\d{2}-\d{2}", str(v or ""))
    return m.group(0) if m else ""


def ler_licitacoes(pasta):
    xl = sorted(f for f in os.listdir(pasta) if f.lower().startswith("licitacoes_monitoradas") and f.lower().endswith(".xlsx")) if os.path.isdir(pasta) else []
    if xl:
        import openpyxl
        ws = openpyxl.load_workbook(os.path.join(pasta, xl[-1]), read_only=True, data_only=True).worksheets[0]
        it = ws.iter_rows(values_only=True)
        cab = [str(c or "").strip() for c in next(it)]
        brutas = [dict(zip(cab, r)) for r in it]
    else:
        brutas = ler_csv(os.path.join(pasta, "licitacoes_monitoradas.csv"))
    norm = lambda k: re.sub(r"[^a-z]", "", k.lower().translate(str.maketrans("áàâãéêíóôõúç", "aaaaeeiooouc")))
    saida = []
    for r in brutas:
        r = {norm(k): v for k, v in r.items()}
        if not str(r.get("processo") or "").strip():
            continue
        est, con, eco = _num(r.get("valorestimado")), _num(r.get("valorcontratado")), _num(r.get("economia"))
        if eco is None and est is not None and con is not None:
            eco = round(est - con, 2)
        txt = lambda k: re.sub(r"\s+", " ", str(r.get(k) or "")).replace("\u200b", "").strip()
        saida.append({"processo": txt("processo"), "orgao": txt("orgao"), "objeto": txt("objeto"), "modalidade": txt("modalidade"),
                      "data": _data(r.get("datasessao")), "est": est, "con": con, "eco": eco, "situacao": txt("situacao"),
                      "obs": txt("observacao"), "link": txt("link")})
    return saida


# ------------------------------------------------------------------ mapa Foco na Obra (KML exportado do Google My Maps)
def ler_foco_na_obra(caminho):
    if not caminho or not os.path.exists(caminho):
        return None
    ns = {"k": "http://www.opengis.net/kml/2.2"}
    raiz = ET.parse(caminho).getroot()
    doc = raiz.find("k:Document", ns)
    obras = []
    form = ""
    for pasta in doc.findall("k:Folder", ns):
        cat = rotulo(pasta.findtext("k:name", "", ns)).strip(" :")
        for pm in pasta.findall("k:Placemark", ns):
            nome = rotulo(pm.findtext("k:name", "", ns)).strip(" .")
            desc = pm.findtext("k:description", "", ns) or ""
            linhas = [re.sub(r"\s+", " ", l).strip() for l in re.split(r"<br\s*/?>", desc)]
            campos, ult = {}, None
            processo = linhas[0] if linhas else ""
            for l in linhas[1:]:
                if l.startswith("http"):
                    if "docs.google.com/forms" in l:
                        form = l.strip()
                    continue
                m = re.match(r"([^:]{3,40}):\s*(.*)$", l)
                if m and not l.lower().startswith("deixe"):
                    ult = m.group(1).strip().lower()
                    campos[ult] = m.group(2).strip()
                elif ult and l and not l.lower().startswith("deixe"):
                    campos[ult] = (campos[ult] + " " + l).strip()
            # "Status: PARALISADA  Empressa: X" na mesma linha
            st = campos.get("status", "")
            m = re.search(r"\s+Empres+a:\s*(.*)$", st)
            if m:
                campos["empresa"] = m.group(1)
                st = st[:m.start()]
            def valor(txt):
                m = re.search(r"(\d[\d.]*,\d{1,2})(?!\d)(?!\s*%)", txt or "")
                return float(m.group(1).replace(".", "").replace(",", ".")) if m else None
            exe = campos.get("valor executado até o momento", "")
            pct = re.search(r"([\d.,]+)\s*%", st) or re.search(r"([\d.,]+)\s*%", exe)
            situ = re.sub(r"\(.*?\)", "", st).replace("Edital:", "").strip(" :")
            sl = situ.lower()
            grupo = ("Paralisada" if re.search(r"parali|suspens", sl) else "Em andamento" if "andamento" in sl else
                     "Concluída" if "conclu" in sl else "Em licitação" if "edital" in sl else
                     "Não iniciada" if re.search(r"iniciar|ordem de servi|contrata", sl) else "Sem informação")
            coords = (pm.findtext("k:Point/k:coordinates", "", ns) or "").strip().split(",")
            try:
                lon, lat = float(coords[0]), float(coords[1])
            except (ValueError, IndexError):
                lon = lat = None
            obras.append({
                "nome": nome, "categoria": capitaliza(cat), "processo": re.sub(r"\s+", " ", processo).strip(),
                "valor_edital": valor(campos.get("valor do edital")), "contrato": campos.get("n° do contrato", ""),
                "valor_contratado": valor(campos.get("valor contratado")), "valor_executado": valor(exe),
                "pct_executado": float(pct.group(1).replace(",", ".").rstrip(".")) if pct else None,
                "ultima_medicao": campos.get("data da última medição", ""), "inicio": campos.get("data de início", ""),
                "termino": campos.get("previsão de término", ""), "situacao": capitaliza(situ) if situ else "Não informada", "grupo": grupo,
                "empresa": campos.get("empresa", "").strip(" ,"), "cnpj": campos.get("cnpj", ""), "lat": lat, "lon": lon})
    return {"obras": obras, "formulario": form,
            "descricao": "Mapa Foco na Obra, mantido pelos voluntários do OSB Foz do Iguaçu (exportação KML)."}
