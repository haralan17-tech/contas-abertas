"""Filas na Saúde de Foz do Iguaçu: coleta diária do painel público da Prefeitura.

Lê o painel público (Metabase) https://saudeintegrada.pmfi.pr.gov.br/public/dashboard/9fceaf55-...
e acrescenta uma "carga" ao histórico. Mesma regra de agrupamento da coleta do OSB
(Dropbox: /Observatório Social/GT Saúde/Filas na Saúde), para as séries serem comparáveis.

Uso:
  python programas/filas.py dropbox URL  # junta ao histórico o historico_*.csv da pasta do OSB no Dropbox
                                         # (URL = link público da pasta "historico" ou do arquivo)
  python programas/filas.py coletar      # coleta direto do painel (só funciona a partir de rede no Brasil;
                                         # os servidores do GitHub não conseguem acessar o painel)
  python programas/filas.py json         # gera filas.json (lido pelo site) a partir do histórico
"""
import csv, io, json, os, re, sys, unicodedata, datetime, urllib.request, urllib.parse

U = "9fceaf55-99df-498c-af98-bdc569f25fd9"
BASE = f"https://saudeintegrada.pmfi.pr.gov.br/api/public/dashboard/{U}"
AQUI = os.path.dirname(os.path.abspath(__file__))
HIST = os.path.join(AQUI, "fontes_osb", "filas", "historico.csv")
SAIDA_JSON = os.path.join(os.path.dirname(AQUI), "filas.json")
CAMPOS = ["carga", "grupo", "tipo", "pedidos", "mediana_dias", "mais_1_ano", "mais_3_anos",
          "pacientes_painel", "demandas_painel", "tempo_medio_painel"]
UA = {"User-Agent": "ContasAbertasFoz/1.0 (Observatorio Social de Foz do Iguacu)", "Accept": "application/json, text/csv"}

REGRAS = [('CER IV – Reabilitação', 'cer iv'), ('Odontologia', 'ceo -|odontolog|implantodont|buco ?maxilo|dentista'),
 ('Otorrinolaringologia', 'otorrino|timpano|audiometria|imitancio|videolaringo|vectoeletro'), ('Ultrassonografia', 'ultrassonografia'),
 ('Psicologia', 'psicolog|neuropsico'), ('Cirurgia de pele', 'cirurgias dermatolog|biopsia de pele'),
 ('Ortopedia', 'ortoped|infiltracao articular|escanometria'), ('Fisioterapia', 'fisioterap'),
 ('Fonoaudiologia', 'fonoaudiolog|disfagia|processamento auditivo'), ('Terapia ocupacional', 'terapia ocupacional'),
 ('Nutrição', 'nutricion|nutricao|disturbios nutricionais'), ('Serviço social', 'assistente social'), ('Grupos de saúde', 'grupo'),
 ('Pediatria', 'consulta pediatra'),
 ('Oftalmologia', 'oftalmo|retina|cornea|ocular|lente escleral|facoemuls|capsulotomia|pterigio|lacrimais|estrabismo'),
 ('Cardiologia', 'cardio|eletrocardio|holter|mapa$|ergometric'), ('Vascular', 'vascular|ecodoppler|esclerosante|carotidas'),
 ('Gastroenterologia', 'endoscop|colonoscop|retossigmoid|phmetria|esofago|gastroenterolog|gastropediatria|gastrostomia|estomago e duodeno'),
 ('Proctologia', 'proctolog'), ('Planejamento familiar', 'larc|diu|intrauterino'),
 ('Ginecologia e obstetrícia', 'ginecolog|colposcopia|gestac|gestante|laqueadura'),
 ('Neurologia', 'neurolog|neuropediatria|eletroencefalo|eletroneuro|liquor|estado mental'), ('Urologia', 'urolog|urodinamica|vasectomia'),
 ('Psiquiatria e CAPS', 'psiquiatr|caps ad|acolhimento adulto'), ('Endocrinologia', 'endocrino|diabetes'), ('Nefrologia', 'nefrolog|renal'),
 ('Pneumologia', 'pneumolog|espirometria'), ('Dermatologia', 'dermatolog'), ('Reumatologia', 'reumatolog'), ('Hematologia', 'hematolog'),
 ('Alergia e imunologia', 'alergista'), ('Infectologia', 'infectolog'), ('Oncologia', 'oncolog'), ('Cirurgia plástica', 'plastica'),
 ('Cirurgia geral', 'cirurgi|cirurgica|feridas'), ('Ressonância magnética', 'ressonancia'), ('Tomografia', 'tomografia|angiotomo'),
 ('Mamografia', 'mamografia'), ('Densitometria óssea', 'densitometria'), ('Cintilografia', 'cintilografia'),
 ('Radiologia', 'radiograf|imagem|uretrocisto|histerossalpingo')]
REGRAS = [(g, re.compile(p)) for g, p in REGRAS]
INFANTIL = re.compile(r"infantil|pediatr|cenni|0 a 8 anos|ate 16 anos")


def norm(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)).lower()


def grupo(nome):
    s = norm(nome)
    g = next((a for a, rx in REGRAS if rx.search(s)), "Outros")
    inf = bool(INFANTIL.search(s)) and g not in ("CER IV – Reabilitação", "Pediatria")
    if g == "Cirurgia geral" and "pediatrica" in s:
        inf = True
    return g + (" infantil" if inf else "")


def _get(url, dados=None):
    req = urllib.request.Request(url, data=dados, headers=UA)
    if dados is not None:
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode("utf-8")


def cartao(dc, c):
    j = json.loads(_get(f"{BASE}/dashcard/{dc}/card/{c}?parameters=%5B%5D"))
    return j["data"]["rows"][0][0]


def mediana(a):
    a = sorted(a); n = len(a)
    return a[(n - 1) // 2] if n % 2 else (a[n // 2 - 1] + a[n // 2]) / 2


def coletar():
    pac, dem, tmed, atu = cartao(2750, 2997), cartao(2575, 2848), cartao(2751, 2998), cartao(2577, 2850)
    carga = str(atu)[:16]
    existentes = set()
    if os.path.exists(HIST):
        with open(HIST, encoding="utf-8") as f:
            existentes = {r["carga"] for r in csv.DictReader(f)}
    if carga in existentes:
        print(f"carga {carga} já está no histórico; nada a fazer")
        return False
    txt = _get(f"{BASE}/dashcard/2574/card/2845/csv", b"parameters=%5B%5D")
    ref = datetime.date.fromisoformat(str(atu)[:10])
    G, T, todos, outros = {}, {}, [], 0
    for lin in list(csv.reader(io.StringIO(txt)))[1:]:
        if len(lin) < 4:
            continue
        _, dt, nome, tipo = lin[:4]
        if nome.startswith("Teste De Fila"):
            continue
        d = (ref - datetime.date.fromisoformat(dt[:10])).days
        g = grupo(nome)
        outros += g == "Outros"
        G.setdefault((g, tipo), []).append(d); T.setdefault(tipo, []).append(d); todos.append(d)
    if not todos:
        raise SystemExit("lista de pedidos vazia; o painel pode ter mudado")
    st = lambda a: [len(a), f"{mediana(a):.1f}", sum(v > 365 for v in a), sum(v > 1095 for v in a)]
    linhas = [[carga, "TOTAL", "*", *st(todos), pac, dem, round(float(tmed), 2)]]
    for k in ("Exame", "Consulta", "Cirurgia"):
        if k in T:
            linhas.append([carga, "TOTAL", k, *st(T[k]), "", "", ""])
    for (g, tp) in sorted(G):
        linhas.append([carga, g, tp, *st(G[(g, tp)]), "", "", ""])
    novo = not os.path.exists(HIST)
    os.makedirs(os.path.dirname(HIST), exist_ok=True)
    with open(HIST, "a", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        if novo:
            w.writerow(CAMPOS)
        w.writerows(linhas)
    print(f"carga {carga}: {len(todos)} pedidos, {pac} pacientes, {len(linhas)} linhas" + (f", {outros} sem área" if outros else ""))
    return True


def ler_csv_texto(txt):
    rows = list(csv.DictReader(io.StringIO(txt)))
    if not rows or set(CAMPOS) - set(rows[0].keys()):
        raise SystemExit("arquivo do Dropbox sem as colunas esperadas: " + ",".join(CAMPOS))
    return rows


def importar_dropbox(url):
    """Baixa o histórico mantido pela coleta diária do OSB (Dropbox) e junta ao histórico do site.
    Cargas já existentes são substituídas pela versão do Dropbox; nenhuma carga é apagada."""
    import zipfile
    pr = urllib.parse.urlsplit(url)
    q = dict(urllib.parse.parse_qsl(pr.query)); q["dl"] = "1"
    url = urllib.parse.urlunsplit(pr._replace(query=urllib.parse.urlencode(q)))
    req = urllib.request.Request(url, headers={"User-Agent": UA["User-Agent"]})
    with urllib.request.urlopen(req, timeout=120) as r:
        bruto = r.read()
    if bruto[:2] == b"PK":
        z = zipfile.ZipFile(io.BytesIO(bruto))
        nomes = sorted(n for n in z.namelist() if re.search(r"historico_.*\.csv$", n))
        if not nomes:
            raise SystemExit("a pasta do Dropbox não tem historico_*.csv")
        txt = z.read(nomes[-1]).decode("utf-8-sig")
        print("Dropbox:", nomes[-1])
    else:
        txt = bruto.decode("utf-8-sig")
    novas = ler_csv_texto(txt)
    antigas = []
    if os.path.exists(HIST):
        with open(HIST, encoding="utf-8") as f:
            antigas = list(csv.DictReader(f))
    cargas_novas = {r["carga"] for r in novas}
    junto = [r for r in antigas if r["carga"] not in cargas_novas] + novas
    junto.sort(key=lambda r: (r["carga"], r["grupo"] != "TOTAL", r["grupo"], r["tipo"]))
    os.makedirs(os.path.dirname(HIST), exist_ok=True)
    with open(HIST, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CAMPOS, lineterminator="\n", extrasaction="ignore")
        w.writeheader(); w.writerows(junto)
    print(f"histórico: {len({r['carga'] for r in antigas})} → {len({r['carga'] for r in junto})} cargas")


def gerar_json():
    with open(HIST, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    num = lambda v, tipo=int: tipo(float(v)) if v not in (None, "") else None
    cargas = {}
    for r in rows:
        c = cargas.setdefault(r["carga"], {"carga": r["carga"], "total": None, "tipos": {}, "grupos": []})
        item = {"pedidos": num(r["pedidos"]), "mediana": num(r["mediana_dias"], float), "mais_1_ano": num(r["mais_1_ano"]), "mais_3_anos": num(r["mais_3_anos"])}
        if r["grupo"] == "TOTAL" and r["tipo"] == "*":
            item.update(pacientes=num(r["pacientes_painel"]), demandas_painel=num(r["demandas_painel"]), tempo_medio_painel=num(r["tempo_medio_painel"], float))
            c["total"] = item
        elif r["grupo"] == "TOTAL":
            c["tipos"][r["tipo"]] = item
        else:
            c["grupos"].append({"grupo": r["grupo"], "tipo": r["tipo"], **item})
    serie = sorted(cargas.values(), key=lambda c: c["carga"])
    # para o site: a última carga completa + a série diária dos totais
    saida = {"fonte": "Painel público de filas da Secretaria Municipal de Saúde de Foz do Iguaçu (saudeintegrada.pmfi.pr.gov.br)",
             "atual": serie[-1],
             "serie": [{"carga": c["carga"], **{k: c["total"][k] for k in ("pedidos", "pacientes", "mediana", "mais_1_ano", "mais_3_anos")},
                        "tipos": {t: {k: v[k] for k in ("pedidos", "mediana", "mais_1_ano")} for t, v in c["tipos"].items()}} for c in serie]}
    with open(SAIDA_JSON, "w", encoding="utf-8") as f:
        json.dump(saida, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{SAIDA_JSON}: {len(serie)} cargas, última {serie[-1]['carga']}")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "dropbox" and len(sys.argv) > 2:
        importar_dropbox(sys.argv[2])
    elif cmd == "coletar":
        coletar()
    elif cmd == "json":
        gerar_json()
    else:
        print(__doc__)
