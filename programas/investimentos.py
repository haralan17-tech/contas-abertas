"""Investimentos (grupo de natureza 4.4: obras, equipamentos, imóveis) a partir dos XML do TCE-PR (SIM-AM).

Uso: python programas/investimentos.py PASTA_TCE [ANOS] [CORTE]
  PASTA_TCE: pasta com os XML extraídos (procura <ano>_*_Empenho.xml etc. em subpastas)
  ANOS: anos a publicar, separados por vírgula (padrão 2025,2026); o ano anterior ao primeiro
        também é lido, para classificar restos a pagar
  CORTE: último mês considerado (AAAA-MM; padrão 2026-08)
Grava programas/fontes_osb/investimentos/investimentos.json (o processar.py inclui no dados.json).
Critério: categoria econômica 4 e grupo 4 (Investimentos), sem operações intraorçamentárias (modalidade 91).
Empenhado = empenhos do ano; liquidado e pago = operações feitas no ano (pago inclui restos a pagar).
"""
import collections, glob, json, os, re, sys
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from temas import grupo_fonte

PASTA = sys.argv[1]
ANOS = (sys.argv[2] if len(sys.argv) > 2 else "2025,2026").split(",")
CORTE = sys.argv[3] if len(sys.argv) > 3 else "2026-08"
SAIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fontes_osb", "investimentos", "investimentos.json")
LER = [str(int(ANOS[0]) - 1)] + ANOS
f = lambda x: float(x or 0)
ELEM = {"51": "Obras e instalações", "52": "Equipamentos e material permanente", "61": "Compra de imóveis", "41": "Repasses a entidades e escolas para investir",
        "42": "Repasses a entidades e escolas para investir", "93": "Indenizações e restituições", "92": "Contas de anos anteriores", "39": "Serviços ligados a obras", "30": "Asfalto e materiais para obras da Prefeitura"}

def achar(ano, nome):
    r = glob.glob(os.path.join(PASTA, "**", f"{ano}_*_{nome}.xml"), recursive=True)
    return r[0] if r else None

def it(arq, tag):
    if not arq: return
    for ev, el in ET.iterparse(arq):
        if el.tag == tag: yield dict(el.attrib)
        el.clear()

def ente(n):
    n = n.upper()
    return "CMFI" if "CÂMARA" in n else "PMFI" if n.startswith("MUNICÍPIO") else "Outros"

def cap(s):
    s = re.sub(r"\s+", " ", s or "").strip().lower()
    return re.sub(r"(^|\s)(\S)", lambda m: m.group(1) + m.group(2).upper(), s).replace(" De ", " de ").replace(" Da ", " da ").replace(" Do ", " do ").replace(" Das ", " das ").replace(" Dos ", " dos ").replace(" E ", " e ")

def orgao(a):
    if ente(a["nmEntidade"]) != "PMFI": return cap(a["nmEntidade"].split(" - ")[-1] if " - " in a["nmEntidade"] else a["nmEntidade"])
    return cap(re.sub(r"^SECRETARIA MUNICIPAL\s+(D[AEO]S?\s+)?", "", a.get("nmOrgao", "").upper()).strip(" ."))

FONTES = [("1009", "Empréstimos (operações de crédito)"), ("1018|1016|1017", "Emendas parlamentares federais"), ("1006", "Convênios com o governo federal"),
          ("1005", "Convênios com o governo do Estado"), ("505", "Royalties de Itaipu"), ("504", "Outros royalties e compensações"),
          ("501", "Venda de bens do município"), ("000|001|002", "Recursos livres do município"), ("104|1[0-9][0-9]$", "Educação"),
          ("303|500|3[0-9][0-9]|4[0-9][0-9]", "Saúde"), ("511|507|512|509", "Taxas, CIDE e iluminação pública")]
def fonte(cd, ds=""):
    cd = (cd or "").strip()
    for rx, nome in FONTES:
        if re.fullmatch(rx, cd): return nome
    g = grupo_fonte(ds)
    return {"Taxas e iluminação pública": "Taxas, CIDE e iluminação pública", "Saúde: repasses do SUS": "Saúde", "Saúde: recursos próprios": "Saúde",
            "Fundeb": "Educação", "Educação: impostos e repasses": "Educação", "Recursos livres": "Recursos livres do município",
            "Recursos desvinculados (DRM)": "Recursos livres do município", "Previdência dos servidores": "Outras fontes"}.get(g, g)

E = {}
for ano in LER:
    for a in it(achar(ano, "Empenho"), "Empenho"):
        if a.get("cdCategoriaEconomica") == "4" and a.get("cdGrupoNatureza") == "4" and a.get("cdModalidade") != "91":
            E[a["idEmpenho"]] = a
print("empenhos de investimento lidos:", len(E))

pag, liq = collections.defaultdict(float), collections.defaultdict(float)  # (id, AAAA-MM)
for ano in ANOS:
    for p in it(achar(ano, "EmpenhoPagamento"), "EmpenhoPagamento"):
        if p["idEmpenho"] in E: pag[(p["idEmpenho"], p["dtOperacao"][:7])] += f(p["vlOperacao"])
    for p in it(achar(ano, "EmpenhoPagamentoEstorno"), "EmpenhoPagamentoEstorno"):
        if p["idEmpenho"] in E: pag[(p["idEmpenho"], p["dtEstorno"][:7])] -= f(p["vlEstorno"])
    for p in it(achar(ano, "EmpenhoLiquidacao"), "EmpenhoLiquidacao"):
        if p["idEmpenho"] in E: liq[(p["idEmpenho"], p["dtLiquidacao"][:7])] += f(p.get("vlLiquidacaoBruto"))
    for p in it(achar(ano, "EmpenhoLiquidacaoEstorno"), "EmpenhoLiquidacaoEstorno"):
        if p["idEmpenho"] in E: liq[(p["idEmpenho"], p["dtEstorno"][:7])] -= f(p["vlEstorno"])

ok = lambda m: m[:4] in ANOS and m <= CORTE
saida = {"corte": CORTE, "anos": ANOS, "criterio": "Despesas de capital do grupo Investimentos (natureza 4.4), sem operações entre órgãos do próprio município. Empenhado: empenhos do ano. Liquidado e pago: operações feitas no ano, incluindo restos a pagar de anos anteriores.", "por_ano": {}}
lista = []
pago_emp = collections.defaultdict(lambda: collections.defaultdict(float))
liq_emp = collections.defaultdict(lambda: collections.defaultdict(float))
for (i, m), v in pag.items():
    if ok(m): pago_emp[i][m[:4]] += v
for (i, m), v in liq.items():
    if ok(m): liq_emp[i][m[:4]] += v

for ano in ANOS:
    R = {"empenhado": 0.0, "liquidado": 0.0, "pago": 0.0, "pago_restos": 0.0, "pago_periodo": 0.0}
    cat = collections.defaultdict(lambda: [0.0, 0.0]); fun = collections.defaultdict(float); org = collections.defaultdict(lambda: {"ente": "", "pago": 0.0, "empenhado": 0.0})
    fon = collections.defaultdict(float); cre = {}; mes = collections.defaultdict(float); desd = collections.defaultdict(float)
    mc = int(CORTE[5:7])
    for i, a in E.items():
        el = ELEM.get(a["cdElemento"], "Outros investimentos")
        if a["nrAnoEmpenho"] == ano and a["dtEmpenho"][:7] <= CORTE:
            vE = f(a["vlEmpenho"]) - f(a.get("vlEstornoEmpenho"))
            R["empenhado"] += vE; cat[el][0] += vE
            o = org[orgao(a)]; o["ente"] = ente(a["nmEntidade"]); o["empenhado"] += vE
        vL = liq_emp[i].get(ano, 0.0); R["liquidado"] += vL
        vP = pago_emp[i].get(ano, 0.0)
        if not vP: continue
        R["pago"] += vP
        if a["nrAnoEmpenho"] != ano: R["pago_restos"] += vP
        cat[el][1] += vP; fun[cap(a.get("dsFuncao", ""))] += vP; fon[fonte(a.get("cdFontePadrao"), a.get("dsFontePadrao"))] += vP
        o = org[orgao(a)]; o["ente"] = ente(a["nmEntidade"]); o["pago"] += vP
        if a["cdElemento"] == "52": desd[cap(a.get("dsDesdobramento", ""))] += vP
        doc = re.sub(r"\D", "", a.get("nrDocCredor", ""))
        c = cre.setdefault(doc, {"nome": re.sub(r"\s+", " ", a["nmCredor"]).strip(), "doc": doc, "pago": 0.0, "cats": set(), "orgaos": set()})
        c["pago"] += vP; c["cats"].add(el); c["orgaos"].add(orgao(a))
    for (i, m), v in pag.items():
        if m[:4] == ano and ok(m):
            mes[m] += v
            if int(m[5:7]) <= mc: R["pago_periodo"] += v
    r2 = lambda x: round(x, 2)
    saida["por_ano"][ano] = {
        **{k: r2(v) for k, v in R.items()},
        "categorias": sorted([{"nome": k, "empenhado": r2(v[0]), "pago": r2(v[1])} for k, v in cat.items()], key=lambda x: -x["pago"]),
        "funcoes": sorted([{"nome": k, "pago": r2(v)} for k, v in fun.items() if v > 0], key=lambda x: -x["pago"]),
        "orgaos": sorted([{"nome": k, **{kk: (r2(vv) if isinstance(vv, float) else vv) for kk, vv in v.items()}} for k, v in org.items()], key=lambda x: -x["pago"]),
        "fontes": sorted([{"nome": k, "pago": r2(v)} for k, v in fon.items() if v > 0], key=lambda x: -x["pago"]),
        "equipamentos": sorted([{"nome": k, "pago": r2(v)} for k, v in desd.items() if v > 0], key=lambda x: -x["pago"]),
        "credores": sorted([{**c, "pago": r2(c["pago"]), "cats": sorted(c["cats"]), "orgaos": sorted(c["orgaos"])} for c in cre.values() if c["pago"] > 0], key=lambda x: -x["pago"]),
        "mensal": [{"mes": m, "pago": r2(v)} for m, v in sorted(mes.items())],
    }

for i, a in E.items():
    pa = {k: round(v, 2) for k, v in pago_emp[i].items() if abs(v) > 0.005}
    if a["nrAnoEmpenho"] not in ANOS and not pa: continue
    if a["nrAnoEmpenho"] in ANOS and a["dtEmpenho"][:7] > CORTE and not pa: continue
    lista.append({"ano": a["nrAnoEmpenho"], "nr": a["nrEmpenho"], "data": a["dtEmpenho"][:10], "ente": ente(a["nmEntidade"]), "orgao": orgao(a),
                  "credor": re.sub(r"\s+", " ", a["nmCredor"]).strip(), "doc": re.sub(r"\D", "", a.get("nrDocCredor", "")),
                  "cat": ELEM.get(a["cdElemento"], "Outros investimentos"), "detalhe": cap(a.get("dsDesdobramento", "")), "funcao": cap(a.get("dsFuncao", "")),
                  "fonte": fonte(a.get("cdFontePadrao"), a.get("dsFontePadrao")), "acao": cap(a.get("dsProjetoAtividade", "")),
                  "empenhado": round(f(a["vlEmpenho"]) - f(a.get("vlEstornoEmpenho")), 2), "pago": pa,
                  "historico": re.sub(r"\s+", " ", a.get("dsHistorico", "")).strip()[:350]})
saida["empenhos"] = sorted(lista, key=lambda x: x["data"], reverse=True)
os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
with open(SAIDA, "w", encoding="utf-8") as fh:
    json.dump(saida, fh, ensure_ascii=False, separators=(",", ":"))
print(SAIDA, os.path.getsize(SAIDA) // 1024, "KB;", len(lista), "empenhos")
for ano in ANOS:
    p = saida["por_ano"][ano]
    print(ano, {k: round(p[k] / 1e6, 2) for k in ("empenhado", "liquidado", "pago", "pago_restos", "pago_periodo")})
    print("  cat", [(c["nome"], round(c["pago"] / 1e6, 2)) for c in p["categorias"]])
    print("  fontes", [(c["nome"], round(c["pago"] / 1e6, 2)) for c in p["fontes"]])
    print("  orgaos", [(c["nome"], round(c["pago"] / 1e6, 2)) for c in p["orgaos"][:8]])
    print("  credores", [(c["nome"][:30], round(c["pago"] / 1e6, 2)) for c in p["credores"][:8]])
    print("  equip", [(c["nome"][:30], round(c["pago"] / 1e6, 2)) for c in p["equipamentos"][:8]])
