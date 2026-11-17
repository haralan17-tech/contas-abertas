"""Gera fontes_osb/publicidade/publicidade.json a partir da extração dos ZIPs do TCE-PR
(programas/publicidade_extrair.py). Publicidade = elemento 33.90.39, desdobramentos
88 (publicidade e propaganda), 90 (publicidade legal) e 63 só "impressos para divulgação".
Pago = pagamentos pela data da operação, menos estornos; inclui restos a pagar de anos anteriores
quando o empenho de origem está nos arquivos (2022 não está: o pago de 2023 pode estar subestimado).

Uso: python programas/publicidade.py [AAAA-MM]   (último mês considerado; padrão 2026-08)
"""
import collections, json, os, re, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
EX = os.path.join(AQUI, "fontes_osb", "publicidade", "extraido")
SAIDA = os.path.join(AQUI, "fontes_osb", "publicidade", "publicidade.json")
CORTE = sys.argv[1] if len(sys.argv) > 1 else "2026-08"
f = lambda x: float(x or 0)
jl = lambda n: [json.loads(l) for l in open(os.path.join(EX, n), encoding="utf-8")]

CAT = {"88": "Propaganda e campanhas", "90": "Publicidade legal (editais e avisos)", "63": "Impressos de divulgação"}
def ent(e):
    n = e["nmEntidade"].upper()
    return "CMFI" if "CÂMARA" in n else "PMFI" if n.startswith("MUNICÍPIO") else "Outros"
def capit(s):
    s = re.sub(r"\s+", " ", s or "").strip()
    pequenas = {"de", "da", "do", "das", "dos", "e"}
    return " ".join(w.lower() if w.lower() in pequenas and i else (w if len(w) <= 3 and w.isupper() and w not in ("SMS",) and False else w.capitalize()) for i, w in enumerate(s.lower().split()))
def orgao(e):
    if ent(e) == "CMFI": return "Câmara Municipal"
    o = re.sub(r"^SECRETARIA MUNICIPAL\s+(D[AEO]S?\s+)?", "", e.get("nmOrgao", "").upper()).strip(" .")
    return capit(o) if ent(e) == "PMFI" else capit(e["nmEntidade"])

E = {}
for e in jl("empenhos.jsonl"):
    if e["cdDesdobramento"] == "63" and "DIVULGA" not in e["dsDesdobramento"].upper():
        continue
    E[e["idEmpenho"]] = e

pag = collections.defaultdict(float)          # (idEmpenho, AAAA-MM) -> valor
for p in jl("pagamentos.jsonl"):
    if p["idEmpenho"] in E and p["dtOperacao"][:7] <= CORTE:
        pag[(p["idEmpenho"], p["dtOperacao"][:7])] += f(p["vlOperacao"])
for p in jl("pagamentos_estorno.jsonl"):
    if p["idEmpenho"] in E and p.get("dtEstorno", "")[:7] <= CORTE:
        pag[(p["idEmpenho"], p["dtEstorno"][:7])] -= f(p.get("vlEstorno"))

anos = sorted({e["nrAnoEmpenho"] for e in E.values()} | {m[:4] for _, m in pag})
mes_corte = int(CORTE[5:7])
R = {a: {k: {"empenhado": 0.0, "pago": 0.0, "pago_restos": 0.0, "pago_periodo": 0.0} for k in ("PMFI", "CMFI", "Outros")} for a in anos}
cat_ano = {a: collections.defaultdict(float) for a in anos}
mensal = collections.defaultdict(lambda: collections.defaultdict(float))
forn = {}
sec = collections.defaultdict(lambda: collections.defaultdict(float))
pago_emp = collections.defaultdict(float)
for e in E.values():
    a = e["nrAnoEmpenho"]
    R[a][ent(e)]["empenhado"] += f(e["vlEmpenho"]) - f(e.get("vlEstornoEmpenho"))
for (i, m), v in pag.items():
    e = E[i]; a = m[:4]; k = ent(e)
    R[a][k]["pago"] += v
    if a != e["nrAnoEmpenho"]: R[a][k]["pago_restos"] += v
    if int(m[5:7]) <= mes_corte: R[a][k]["pago_periodo"] += v
    cat_ano[a][CAT[e["cdDesdobramento"]]] += v
    mensal[m][k] += v
    doc = e["nrDocCredor"].strip(); nm = re.sub(r"\s+", " ", e["nmCredor"]).strip()
    F = forn.setdefault(doc, {"nome": nm, "doc": doc, "anos": collections.defaultdict(float), "entes": set(), "orgaos": set(), "cats": set()})
    F["anos"][a] += v; F["entes"].add(k); F["orgaos"].add(orgao(e)); F["cats"].add(CAT[e["cdDesdobramento"]])
    sec[(k, orgao(e))][a] += v
    pago_emp[i] += v

r2 = lambda x: round(x, 2)
saida = {
    "corte": CORTE, "anos": anos,
    "criterio": "Elemento 33.90.39, desdobramentos 88 (publicidade e propaganda), 90 (publicidade legal) e 63 (impressos para divulgação). Pago pela data do pagamento, menos estornos.",
    "por_ano": {a: {k: {kk: r2(vv) for kk, vv in v.items()} for k, v in R[a].items()} for a in anos},
    "categorias": {a: {k: r2(v) for k, v in cat_ano[a].items()} for a in anos},
    "mensal": [{"mes": m, **{k: r2(mensal[m][k]) for k in ("PMFI", "CMFI", "Outros")}} for m in sorted(mensal)],
    "fornecedores": sorted([{"nome": F["nome"], "doc": F["doc"], "anos": {a: r2(v) for a, v in F["anos"].items()}, "total": r2(sum(F["anos"].values())),
                             "entes": sorted(F["entes"]), "orgaos": sorted(F["orgaos"]), "cats": sorted(F["cats"])} for F in forn.values()], key=lambda x: -x["total"]),
    "secretarias": sorted([{"ente": k, "orgao": o, "anos": {a: r2(v) for a, v in d.items()}, "total": r2(sum(d.values()))} for (k, o), d in sec.items()], key=lambda x: -x["total"]),
    "empenhos": sorted([{"ano": e["nrAnoEmpenho"], "nr": e["nrEmpenho"], "data": e["dtEmpenho"][:10], "ente": ent(e), "orgao": orgao(e), "credor": re.sub(r"\s+", " ", e["nmCredor"]).strip(),
                         "doc": e["nrDocCredor"].strip(), "cat": CAT[e["cdDesdobramento"]], "empenhado": r2(f(e["vlEmpenho"]) - f(e.get("vlEstornoEmpenho"))), "pago": r2(pago_emp[i]),
                         "historico": re.sub(r"\s+", " ", e.get("dsHistorico", "")).strip()[:400]} for i, e in E.items()], key=lambda x: (x["ano"], x["data"]), reverse=True),
}
docs = {F["doc"] for F in forn.values()}
RX = re.compile(r"publicidade|propaganda|publica[çc][ãa]o|marketing|divulga", re.I)
contratos = []
for c in jl("contratos.jsonl"):
    if re.search(r"leiloeiro|coffee|concurso|estande", c["dsObjeto"], re.I):
        continue
    if c.get("nrDocContratado", "").strip() in docs or RX.search(c["dsObjeto"]):
        contratos.append({"ente": ent(c), "numero": c["nrContrato"], "ano": c["nrAnoContrato"], "contratado": re.sub(r"\s+", " ", c["nmContratado"]).strip(), "doc": c["nrDocContratado"].strip(),
                          "valor": f(c["vlContrato"]), "assinatura": c.get("dtAssinatura", "")[:10], "inicio": c.get("dtInicio", "")[:10], "fim": c.get("dtFim", "")[:10],
                          "objeto": re.sub(r"\s+", " ", c["dsObjeto"]).strip()[:400]})
saida["contratos"] = sorted(contratos, key=lambda c: c["assinatura"], reverse=True)
with open(SAIDA, "w", encoding="utf-8") as fh:
    json.dump(saida, fh, ensure_ascii=False, separators=(",", ":"))
print(SAIDA, len(E), "empenhos;", len(forn), "fornecedores;", len(contratos), "contratos")
for a in anos:
    t = {k: sum(R[a][x][k] for x in R[a]) for k in ("empenhado", "pago", "pago_restos", "pago_periodo")}
    print(a, {k: round(v / 1e6, 2) for k, v in t.items()})
