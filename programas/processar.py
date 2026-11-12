"""Gera dados.json do site Contas Abertas de Foz do Iguaçu a partir dos arquivos oficiais.

Fontes:
  - Siconfi (Tesouro Nacional): RREO Anexos 1, 2 e 3 (bimestrais) e RGF Anexo 1 (quadrimestral).
    Totais oficiais de receita e despesa, receitas por origem, despesa por função e gasto com pessoal.
  - TCE-PR, Portal Informação para Todos (SIM-AM), tema Despesa: empenhos e pagamentos.
    Credores, despesa paga por área e por mês.

Uso:
  python3 processar.py --siconfi PASTA_SICONFI --tce PASTA_TCE [--saida dados.json] [--corte AAAA-MM]

  PASTA_SICONFI contém subpastas por ano (2025/, 2026/) com os .xls ou .xlsx baixados do Siconfi.
  PASTA_TCE contém as pastas/arquivos AAAA_410830_Empenho.xml, AAAA_410830_EmpenhoPagamento.xml etc.
  --corte limita os dados do TCE ao último mês fechado no Siconfi (padrão: automático).

Todos os valores em reais. Despesas consideram o conceito "exceto intra-orçamentárias" do RREO,
para não contar duas vezes repasses entre órgãos do próprio município.
"""
import argparse, collections, datetime, glob, json, os, re, subprocess, sys, tempfile
import xml.etree.ElementTree as ET

import openpyxl

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

POPULACAO = 285415  # IBGE, Censo 2022
MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]

# Credores que são o próprio município ou entidades dele: os pagamentos a eles no SIM-AM são folha de pagamento.
CNPJ_PROPRIOS = {"76206606000140", "75914051000128", "75431437000189", "02345707000165", "08322648000196"}
PROPRIOS_PREFIXO = ("MUNICIPIO DE FOZ DO IGUACU", "CAMARA MUNICIPAL DE FOZ DO IGUACU", "FUNDACAO CULTURAL DE FOZ DO IGUACU",
                    "INSTITUTO DE TRANSPORTES E TRANSITO DE FOZ", "FOZ PREVIDENCIA", "INSTITUTO DE HABITACAO DE FOZ")
PUBLICO = re.compile(r"\b(MINISTERIO|INSTITUTO NACIONAL|CAIXA ECONOMICA|UNIVERSIDADE|SECRETARIA|FUNDO (MUNICIPAL|NACIONAL|ESTADUAL)|"
                     r"ESTADO DO|RECEITA FEDERAL|BANCO DO BRASIL|FUNDACAO MUNICIPAL|TRIBUNAL|MUNICIPIO DE|PREFEITURA|CONSORCIO INTERMUNICIPAL|"
                     r"DEPARTAMENTO|SERVICO NACIONAL|AGENCIA NACIONAL|PODER JUDICIARIO|INSS)\b")
OSC = re.compile(r"\b(ASSOCIACAO|ASSOCIAÇÃO|SOCIEDADE CIVIL|COMUNIDADE|ALBERGUE|ALDEIAS|GUARDA MIRIM|APAE|LAR |CASA |COOPERATIVA|"
                 r"FEDERACAO|SINDICATO|IGREJA|PASTORAL|INSTITUTO (?!NACIONAL)|FUNDACAO (?!MUNICIPAL)|OBRAS SOCIAIS|ENTIDADE)")


# ---------------------------------------------------------------- Siconfi
def abrir_planilha(caminho):
    if caminho.lower().endswith(".xlsx"):
        return openpyxl.load_workbook(caminho, read_only=True, data_only=True)
    destino = tempfile.mkdtemp()
    subprocess.run(["soffice", "--headless", "--convert-to", "xlsx", "--outdir", destino, caminho],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return openpyxl.load_workbook(glob.glob(os.path.join(destino, "*.xlsx"))[0], read_only=True, data_only=True)


def linhas(ws):
    return [list(r) for r in ws.iter_rows(values_only=True)]


def rotulo(v):
    return re.sub(r"\s+", " ", str(v or "")).strip()


def num(v):
    return float(v) if isinstance(v, (int, float)) else 0.0


class Anexo:
    """Lê um quadro do RREO/RGF: localiza colunas pelo texto do cabeçalho e linhas pelo rótulo."""

    def __init__(self, ws):
        self.rows = linhas(ws)

    def col(self, texto, depois_de=0):
        for i, r in enumerate(self.rows[depois_de:], depois_de):
            for j, v in enumerate(r):
                if texto.lower() in rotulo(v).lower():
                    return i, j
        raise KeyError(texto)

    def linha(self, inicio_rotulo, depois_de=0, exato=False):
        for i, r in enumerate(self.rows[depois_de:], depois_de):
            t = rotulo(r[0] if r else "")
            if (t == inicio_rotulo) if exato else t.startswith(inicio_rotulo):
                return i, r
        raise KeyError(inicio_rotulo)

    def valor(self, inicio_rotulo, coluna, depois_de=0, exato=False):
        try:
            _, r = self.linha(inicio_rotulo, depois_de, exato)
        except KeyError:
            return 0.0
        return num(r[coluna]) if coluna < len(r) else 0.0


def arquivos_siconfi(pasta, ano):
    arqs = glob.glob(os.path.join(pasta, str(ano), "*"))
    rreo = {}
    rgf = {}
    for a in arqs:
        m = re.search(r"RREO_\d+_BIMESTRAL_(\d)", a)
        if m:
            rreo[int(m.group(1))] = a
        m = re.search(r"RGF_\d+_QUADRIMESTRAL_(\d)", a)
        if m:
            rgf[int(m.group(1))] = a
    return rreo, rgf


def ler_rreo(caminho, bimestre):
    wb = abrir_planilha(caminho)
    a1, a2, a3 = Anexo(wb["RREO-Anexo 01"]), Anexo(wb["RREO-Anexo 02"]), Anexo(wb["RREO-Anexo 03"])
    meses = bimestre * 2

    # Anexo 1: receitas
    _, c_prev = a1.col("PREVISÃO ATUALIZADA (a)")
    _, c_real = a1.col("Até o Bimestre (c)")
    rec = lambda r: a1.valor(r, c_real)
    total_rec = rec("RECEITAS (EXCETO INTRA-ORÇAMENTÁRIAS) (I)")
    prev_rec = a1.valor("RECEITAS (EXCETO INTRA-ORÇAMENTÁRIAS) (I)", c_prev)
    i_desp, _ = a1.linha("DESPESAS (EXCETO INTRA-ORÇAMENTÁRIAS) (VIII)")
    _, c_dot = a1.col("DOTAÇÃO ATUALIZADA (e)")
    _, c_emp = a1.col("DESPESAS EMPENHADAS ATÉ O BIMESTRE")
    _, c_liq = a1.col("DESPESAS LIQUIDADAS ATÉ O BIMESTRE")
    _, c_pag = a1.col("DESPESAS PAGAS ATÉ O BIMESTRE")
    dv = lambda r, c: a1.valor(r, c, depois_de=i_desp - 2)
    D = "DESPESAS (EXCETO INTRA-ORÇAMENTÁRIAS) (VIII)"
    despesas = {"orcado": dv(D, c_dot), "empenhado": dv(D, c_emp), "liquidado": dv(D, c_liq), "pago": dv(D, c_pag)}
    natureza = [
        ("Pessoal e encargos", dv("PESSOAL E ENCARGOS SOCIAIS", c_pag), "Salários, encargos, aposentadorias e pensões de servidores."),
        ("Custeio", dv("OUTRAS DESPESAS CORRENTES", c_pag), "Serviços contratados, materiais, medicamentos, merenda, energia, repasses a entidades e manutenção."),
        ("Investimentos", dv("INVESTIMENTOS", c_pag) + dv("INVERSÕES FINANCEIRAS", c_pag), "Obras e compra de equipamentos que ficam para a cidade."),
        ("Dívida", dv("JUROS E ENCARGOS DA DÍVIDA", c_pag) + dv("AMORTIZAÇÃO DA DÍVIDA", c_pag), "Juros e amortização de empréstimos."),
    ]

    # Anexo 3: receitas correntes mês a mês (últimos 12 meses; pegamos só os meses do ano)
    i_h, _ = a3.col("<MR>")
    cab = a3.rows[i_h]
    cols_mes = {}
    for j, v in enumerate(cab):
        m = re.fullmatch(r"<MR(?:-(\d+))?>", rotulo(v))
        if m:
            cols_mes[int(m.group(1) or 0)] = j
    seq = [cols_mes[k] for k in range(meses - 1, -1, -1)]  # jan..último mês
    serie = lambda r: [a3.valor(r, j, depois_de=i_h) for j in seq]
    soma = lambda r: sum(serie(r))
    correntes = serie("RECEITAS CORRENTES (I)")
    ded_fundeb = serie("Dedução de Receita para Formação do FUNDEB")
    mensal = [round(c - d, 2) for c, d in zip(correntes, ded_fundeb)]

    royalties = rec("Exploração de Recursos Naturais")
    cosip = rec("Contribuição para o Custeio do Serviço de Iluminação Pública")
    capital = {
        "Empréstimos (operações de crédito)": rec("OPERAÇÕES DE CRÉDITO"),
        "Transferências para obras e equipamentos": rec("TRANSFERÊNCIAS DE CAPITAL"),
        "Venda de bens": rec("ALIENAÇÃO DE BENS"),
        "Outras receitas de capital": rec("AMORTIZAÇÕES DE EMPRÉSTIMOS") + rec("OUTRAS RECEITAS DE CAPITAL"),
    }
    it = lambda n, v, e: {"nome": n, "valor": round(v, 2), "explicacao": e}
    grupos = [
        {"grupo": "Impostos e taxas do município", "explicacao": "Dinheiro que a própria Prefeitura cobra de moradores e empresas.", "itens": [
            it("ISS", soma("ISS"), "Imposto Sobre Serviços: pago por empresas e profissionais que prestam serviços, como hotéis, agências de turismo e restaurantes."),
            it("IPTU", soma("IPTU"), "Imposto Predial e Territorial Urbano: pago por quem tem imóvel na cidade."),
            it("IRRF", soma("IRRF"), "Imposto de Renda retido dos salários pagos pela Prefeitura, que fica com o município."),
            it("ITBI", soma("ITBI"), "Imposto sobre a compra e venda de imóveis."),
            it("Taxas e outros tributos", soma("Outros Impostos, Taxas e Contribuições de Melhoria"), "Taxas de licença, alvarás, coleta de lixo e outros tributos municipais."),
            it("Contribuição de iluminação pública", cosip, "Cobrada na conta de luz para manter a iluminação das ruas."),
        ]},
        {"grupo": "Repasses do Estado", "explicacao": "Parte dos impostos estaduais que o Paraná divide com os municípios.", "itens": [
            it("ICMS", soma("Cota-Parte do ICMS"), "Imposto estadual sobre circulação de mercadorias e serviços; 25% vai para os municípios."),
            it("IPVA", soma("Cota-Parte do IPVA"), "Metade do imposto dos veículos licenciados em Foz fica com o município."),
            it("IPI-Exportação", soma("Transferências da LC nº 61/1989"), "Parte do IPI sobre produtos exportados, repassada pelo Estado."),
        ]},
        {"grupo": "Repasses da União", "explicacao": "Parte dos impostos federais que o governo federal divide com os municípios.", "itens": [
            it("FPM", soma("Cota-Parte do FPM"), "Fundo de Participação dos Municípios: parte do Imposto de Renda e do IPI arrecadados no país."),
            it("ITR", soma("Cota-Parte do ITR"), "Parte do imposto sobre propriedades rurais."),
        ]},
        {"grupo": "Fundeb", "explicacao": "Fundo que redistribui recursos para a educação básica entre Estado e municípios. Só pode ser usado na educação.", "itens": [
            it("Fundeb", soma("Transferências do FUNDEB"), "Paga salários de professores e a manutenção das escolas municipais."),
        ]},
        {"grupo": "Verbas para saúde, assistência e outros programas", "explicacao": "Repasses da União e do Estado com destino definido, como o SUS, programas sociais e convênios.", "itens": [
            it("Repasses vinculados", soma("Outras Transferências Correntes"), "Inclui recursos do SUS, da assistência social, merenda escolar e outros programas."),
        ]},
        {"grupo": "Royalties de Itaipu", "explicacao": "Compensação paga pelo uso das águas do rio Paraná na geração de energia.", "itens": [
            it("Royalties e compensações", royalties, "Compensação financeira pela exploração de recursos hídricos, paga principalmente pela Itaipu Binacional."),
        ]},
        {"grupo": "Rendimentos e outras receitas", "explicacao": "Rendimentos de aplicações financeiras, contribuições de servidores à previdência, aluguéis, multas e outras.", "itens": [
            it("Rendimentos de aplicações", soma("Rendimentos de Aplicação Financeira"), "Juros do dinheiro guardado em banco, inclusive o do fundo de previdência."),
            it("Contribuições à previdência", soma("Contribuições") - cosip, "Contribuições dos servidores ao fundo de previdência municipal."),
            it("Outras receitas patrimoniais", soma("Outras Receitas Patrimoniais") - royalties, "Aluguéis, concessões e permissões de uso de bens públicos."),
            it("Multas e outras receitas", soma("Outras Receitas Correntes") + soma("Receita de Serviços"), "Multas, indenizações, serviços e receitas diversas."),
        ]},
        {"grupo": "Receitas de capital", "explicacao": "Dinheiro para investimentos: empréstimos, transferências para obras e venda de bens.", "itens": [
            it(n, v, e) for (n, v), e in zip(capital.items(), [
                "Empréstimos contratados pela Prefeitura, que precisam ser pagos com juros.",
                "Repasses da União e do Estado destinados a obras e compra de equipamentos.",
                "Venda de imóveis e outros bens do município.",
                "Devolução de empréstimos concedidos e outras receitas de capital."])
        ]},
    ]
    for g in grupos:
        g["itens"] = [i for i in g["itens"] if abs(i["valor"]) >= 1]
    grupos = [g for g in grupos if g["itens"]]
    bruto = sum(i["valor"] for g in grupos for i in g["itens"])
    deducao = sum(ded_fundeb)

    # Anexo 2: despesa liquidada por função (2 espaços de recuo = função)
    i_f, c_fliq = a2.col("DESPESAS LIQUIDADAS ATÉ O BIMESTRE")
    por_funcao = []
    for r in a2.rows[i_f + 2:]:
        bruto_rot = str(r[0] or "")
        if rotulo(bruto_rot).startswith("DESPESAS (INTRA") or rotulo(bruto_rot).startswith("TOTAL"):
            break
        if re.match(r"^ {2}\S", bruto_rot) and num(r[c_fliq]) > 0:
            por_funcao.append({"funcao": rotulo(bruto_rot), "valor": round(num(r[c_fliq]), 2)})

    return {
        "meses": meses,
        "receitas": {"previsto": round(prev_rec, 2), "arrecadado": round(total_rec, 2), "bruto": round(bruto, 2),
                     "deducao_fundeb": round(deducao, 2), "mensal": mensal, "grupos": grupos,
                     "conferencia": round(bruto - deducao - total_rec, 2)},
        "despesas": {**{k: round(v, 2) for k, v in despesas.items()},
                     "por_natureza": [{"nome": n, "valor": round(v, 2), "explicacao": e} for n, v, e in natureza],
                     "por_funcao_liquidado": sorted(por_funcao, key=lambda x: -x["valor"])},
    }


def ler_rgf(caminho, quad):
    a = Anexo(abrir_planilha(caminho)["RGF-Anexo 01"])
    i, r = a.linha("DESPESA TOTAL COM PESSOAL - DTP")
    nums = [num(v) for v in r[1:] if isinstance(v, (int, float))]
    _, rcl = a.linha("= RECEITA CORRENTE LÍQUIDA AJUSTADA PARA CÁLCULO DOS LIMITES DA DESP")
    rcl_v = [num(v) for v in rcl[1:] if isinstance(v, (int, float))]
    _, inat = a.linha("Inativos e Pensionistas com Recursos Vinculados")
    inat_v = [num(v) for v in inat[1:] if isinstance(v, (int, float))]
    return {"quadrimestre": quad, "dtp": nums[0], "pct": nums[-1], "rcl_ajustada": rcl_v[0] if rcl_v else None,
            "inativos_deduzidos": max(inat_v) if inat_v else 0}


# ---------------------------------------------------------------- TCE-PR (SIM-AM)
def xml_iter(caminho, tag):
    for _, el in ET.iterparse(caminho):
        if el.tag == tag:
            yield el.attrib
            el.clear()


def achar(pasta, ano, nome):
    r = glob.glob(os.path.join(pasta, "**", f"{ano}_*_{nome}.xml"), recursive=True)
    return r[0] if r else None


def formata_doc(sg, nr):
    sg, nr = (sg or "").strip(), (nr or "").strip()
    d = re.sub(r"\D", "", nr)
    if sg == "CNPJ" and len(d) == 14:
        return f"CNPJ {d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"
    if sg == "CPF":
        if len(d) == 11:  # nunca publica CPF completo
            return f"CPF ***.{d[3:6]}.{d[6:9]}-**"
        return f"CPF {nr}"
    return f"{sg} {nr}".strip()


def tipo_credor(sg, nome):
    if (sg or "").strip() == "CPF":
        return "Pessoa física"
    n = nome.upper()
    if PUBLICO.search(n):
        return "Órgão público"
    if OSC.search(n):
        return "Entidade sem fins lucrativos"
    return "Empresa"


def capitaliza(s):
    s = re.sub(r"\s+", " ", (s or "").strip())
    if not s:
        return s
    pequenas = {"de", "da", "do", "das", "dos", "e", "a", "o", "para", "com", "em", "por"}
    out = []
    for i, w in enumerate(s.lower().split(" ")):
        out.append(w if (i and w in pequenas) else w[:1].upper() + w[1:])
    return " ".join(out)


FOLHA_GRUPOS = {
    ("11", "33"): "Gratificação por exercício de funções",
    ("11", "37"): "Gratificação por tempo de serviço",
    ("11", "51"): "Outros adicionais, vantagens e gratificações",
    ("11", "10"): "Adicional de insalubridade",
    ("11", "09"): "Adicional de periculosidade",
    ("11", "11"): "Adicional de atividades penosas",
    ("11", "04"): "Adicional noturno",
    ("11", "07"): "Abono de permanência",
    ("16", "44"): "Horas extras (serviços extraordinários)",
}


def classifica_folha(elem, desd, ds):
    return FOLHA_GRUPOS.get((elem, desd))


def _pag_mes_por_empenho(f_pag, f_est, emp, limite):
    out = collections.defaultdict(lambda: [0.0] * 12)
    for a in xml_iter(f_pag, "EmpenhoPagamento"):
        d = a.get("dtOperacao", "")
        if a["idEmpenho"] in emp and d < limite:
            out[a["idEmpenho"]][int(d[5:7]) - 1] += float(a["vlOperacao"])
    if f_est:
        for a in xml_iter(f_est, "EmpenhoPagamentoEstorno"):
            d = a.get("dtEstorno", "")
            if a["idEmpenho"] in emp and d < limite:
                out[a["idEmpenho"]][int(d[5:7]) - 1] -= float(a["vlEstorno"])
    return out


def chave_nome(n):
    import unicodedata
    n = unicodedata.normalize("NFD", n or "")
    n = "".join(c for c in n if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", n).strip().upper()


def ler_servidores(caminho):
    """Planilha 'Servidores' exportada do Portal da Transparência da Prefeitura."""
    wb = abrir_planilha(caminho)
    rows = list(wb.worksheets[0].iter_rows(values_only=True))
    gerado = ""
    for r in rows[:6]:
        m = re.search(r"Gerado em: (\S+)", str(r[0] or ""))
        if m:
            gerado = m.group(1)
    i_cab = next(i for i, r in enumerate(rows) if r and rotulo(r[0]) == "Nome")
    cab = [rotulo(c) for c in rows[i_cab]]
    idx = {c: j for j, c in enumerate(cab)}
    def br(v):
        try:
            return float(str(v).replace(".", "").replace(",", "."))
        except (TypeError, ValueError):
            return None
    lista = []
    for r in rows[i_cab + 1:]:
        if not r or not r[0]:
            continue
        g = lambda c: rotulo(r[idx[c]]) if c in idx and r[idx[c]] is not None else ""
        lista.append([g("Nome"), g("Cargo"), g("Natureza"), g("Classe"), capitaliza(g("Lotação")), capitaliza(g("Situação").split(" - ")[0]) +
                      ((" - " + g("Situação").split(" - ", 1)[1]) if " - " in g("Situação") else ""),
                      br(g("Carga Horária")), br(g("Remuneração")), g("Admissão"), g("Desligamento")])
    return {"gerado_em": gerado, "colunas": ["nome", "cargo", "vinculo", "classe", "lotacao", "situacao", "carga", "remuneracao", "admissao", "desligamento"],
            "lista": lista}


def ler_diarias(pasta, ano, corte_mes, cargos):
    f = achar(pasta, ano, "Diarias")
    if not f:
        return None
    limite = f"{ano}-{corte_mes + 1:02d}" if corte_mes < 12 else f"{ano + 1}-01"
    # diárias cuja liquidação foi totalmente estornada (canceladas) ficam de fora
    liq = {}
    f_liq = achar(pasta, ano, "EmpenhoLiquidacao")
    if f_liq:
        for a in xml_iter(f_liq, "EmpenhoLiquidacao"):
            liq[a["idLiquidacao"]] = (float(a.get("vlLiquidacaoBruto") or 0), float(a.get("vlLiquidacaoEstornado") or 0))
    viagens, canceladas = [], 0
    for _, el in ET.iterparse(f):
        a = el.attrib
        if "vlTotalDiaria" not in a:
            continue
        ini = a.get("dtInicio", "")[:10]
        if ini >= limite:
            el.clear(); continue
        l = liq.get(a.get("idLiquidacao"))
        if l and l[1] >= l[0] - 0.01:
            canceladas += 1; el.clear(); continue
        nome = re.sub(r"\s+", " ", a.get("nmCredor", "")).strip()
        viagens.append({"nome": nome, "cargo": cargos.get(chave_nome(nome), ""), "entidade": capitaliza(a.get("nmEntidade", "")),
                        "destino": capitaliza(a.get("MunicipioDestinoViagem", "")), "inicio": ini, "fim": a.get("dtFim", "")[:10],
                        "diarias": float(a.get("nrDiaria") or 0), "valor": round(float(a.get("vlTotalDiaria") or 0), 2),
                        "tipo": rotulo(a.get("dsTipoObjetivosDiaria", "")), "objetivo": re.sub(r"^\d+\s*-\s*", "", re.sub(r"\bnull\b", "", rotulo(a.get("dsObjetivo", "")))).strip(" -")[:200]})
        el.clear()
    viagens.sort(key=lambda v: v["inicio"], reverse=True)
    return {"viagens": viagens, "canceladas": canceladas}


def ler_tce(pasta, ano, corte_mes):
    f_emp = achar(pasta, ano, "Empenho")
    f_pag = achar(pasta, ano, "EmpenhoPagamento")
    f_est = achar(pasta, ano, "EmpenhoPagamentoEstorno")
    if not (f_emp and f_pag):
        return None
    limite = f"{ano}-{corte_mes + 1:02d}" if corte_mes < 12 else f"{ano + 1}-01"
    emp = {}
    ultimo_envio = None
    for a in xml_iter(f_emp, "Empenho"):
        ultimo_envio = a.get("ultimoEnvioSIMAMNesteExercicio", ultimo_envio)
        if a.get("cdModalidade") == "91":  # intra-orçamentária
            continue
        emp[a["idEmpenho"]] = {k: a.get(k, "") for k in (
            "vlEmpenho", "dtEmpenho", "sgDocCredor", "nrDocCredor", "nmCredor", "dsFuncao", "dsDesdobramento",
            "dsHistorico", "nmEntidade", "cdElemento", "cdDesdobramento", "nmOrgao", "nmUnidade")}
    pago = collections.defaultdict(float)
    mensal = [0.0] * 12
    for a in xml_iter(f_pag, "EmpenhoPagamento"):
        d = a.get("dtOperacao", "")
        if a["idEmpenho"] in emp and d < limite:
            v = float(a["vlOperacao"])
            pago[a["idEmpenho"]] += v
            mensal[int(d[5:7]) - 1] += v
    if f_est:
        for a in xml_iter(f_est, "EmpenhoPagamentoEstorno"):
            d = a.get("dtEstorno", "")
            if a["idEmpenho"] in emp and d < limite:
                v = float(a["vlEstorno"])
                pago[a["idEmpenho"]] -= v
                mensal[int(d[5:7]) - 1] -= v

    func = collections.Counter()
    cred = {}
    folha = 0.0
    for i, a in emp.items():
        v = pago.get(i, 0.0)
        func[a["dsFuncao"]] += v
        nome = re.sub(r"\s+", " ", a["nmCredor"]).strip() or "Credor não informado"
        doc = re.sub(r"\D", "", a["nrDocCredor"])
        if doc in CNPJ_PROPRIOS or nome.upper().startswith(PROPRIOS_PREFIXO):
            folha += v
            continue
        chave = (a["sgDocCredor"].strip(), a["nrDocCredor"].strip(), nome) if a["sgDocCredor"].strip() == "CPF" else (a["sgDocCredor"].strip(), doc or nome, "")
        c = cred.setdefault(chave, {"nome": nome, "documento": formata_doc(a["sgDocCredor"], a["nrDocCredor"]),
                                    "tipo": tipo_credor(a["sgDocCredor"], nome), "pago": 0.0, "empenhado": 0.0, "empenhos": 0,
                                    "_area": collections.Counter(), "_obj": collections.Counter(), "_maior": (0, "")})
        c["pago"] += v
        if a["dtEmpenho"] < limite:
            ve = float(a["vlEmpenho"] or 0)
            c["empenhado"] += ve
            c["empenhos"] += 1
            if ve > c["_maior"][0]:
                c["_maior"] = (ve, a["dsHistorico"])
        c["_area"][a["dsFuncao"]] += max(v, 0.01)
        c["_obj"][a["dsDesdobramento"]] += max(v, 0.01)

    lista = []
    for c in cred.values():
        if c["pago"] < 0.5 and c["empenhado"] < 0.5:
            continue
        lista.append({"nome": c["nome"], "documento": c["documento"], "tipo": c["tipo"], "pago": round(c["pago"], 2),
                      "empenhado": round(c["empenhado"], 2), "empenhos": c["empenhos"],
                      "area": c["_area"].most_common(1)[0][0], "objeto": capitaliza(c["_obj"].most_common(1)[0][0]),
                      "historico": re.sub(r"\s+", " ", c["_maior"][1]).strip()[:220]})
    lista.sort(key=lambda x: -x["pago"])
    for x in lista[400:]:
        x.pop("historico", None)  # mantém o arquivo leve; histórico só para os 400 maiores
    # componentes da folha (gratificações, adicionais, horas extras) e passagens, a partir dos pagamentos
    comp = collections.defaultdict(lambda: {"total": 0.0, "mensal": [0.0] * 12, "funcao": collections.Counter(),
                                            "orgao": collections.Counter(), "entidade": collections.Counter()})
    pag_mes = collections.defaultdict(lambda: [0.0] * 12)
    for ev_id, m in _pag_mes_por_empenho(f_pag, f_est, emp, limite).items():
        pag_mes[ev_id] = m
    passagens = collections.Counter()
    for i, a in emp.items():
        grupo = classifica_folha(a["cdElemento"], a["cdDesdobramento"], a["dsDesdobramento"])
        if grupo:
            c = comp[grupo]
            ms = pag_mes.get(i, [0.0] * 12)
            v = sum(ms)
            c["total"] += v
            c["mensal"] = [x + y for x, y in zip(c["mensal"], ms)]
            c["funcao"][a["dsFuncao"]] += v
            c["orgao"][capitaliza(a["nmOrgao"])] += v
            c["entidade"][capitaliza(a["nmEntidade"])] += v
        if a["cdElemento"] == "33" and a["cdDesdobramento"] in ("01", "02"):
            nome = re.sub(r"\s+", " ", a["nmCredor"]).strip()
            passagens[nome] += pago.get(i, 0.0)
    componentes = {}
    for g, c in comp.items():
        componentes[g] = {"total": round(c["total"], 2), "mensal": [round(x, 2) for x in c["mensal"][:corte_mes]],
                          "por_funcao": [{"nome": k, "valor": round(v, 2)} for k, v in c["funcao"].most_common() if v > 0.5],
                          "por_orgao": [{"nome": k, "valor": round(v, 2)} for k, v in c["orgao"].most_common(15) if v > 0.5],
                          "por_entidade": [{"nome": k, "valor": round(v, 2)} for k, v in c["entidade"].most_common() if v > 0.5]}
    passagens_out = {"total": round(sum(passagens.values()), 2),
                     "fornecedores": [{"nome": k, "valor": round(v, 2)} for k, v in passagens.most_common(10) if v > 0.5]}

    return {"componentes_folha": componentes, "passagens": passagens_out,
            "credores": lista, "folha_pago": round(folha, 2), "mensal_pago": [round(m, 2) for m in mensal[:corte_mes]],
            "por_funcao_pago": sorted([{"funcao": k, "valor": round(v, 2)} for k, v in func.items() if v > 0], key=lambda x: -x["valor"]),
            "total_pago": round(sum(pago.values()), 2), "ultimo_envio": ultimo_envio}


# ---------------------------------------------------------------- montagem
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--siconfi", required=True)
    ap.add_argument("--tce", required=True)
    ap.add_argument("--saida", default="dados.json")
    ap.add_argument("--fontes-osb", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "fontes_osb"),
                    help="pasta com camara.json, transporte.json, oficios.csv e licitacoes_monitoradas.csv")
    ap.add_argument("--servidores", help="planilha Servidores (.xls/.xlsx) do Portal da Transparência")
    ap.add_argument("--indicadores", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "indicadores_manuais.json"),
                    help="percentuais de saúde e educação copiados do SIOPS/SIOPE")
    args = ap.parse_args()

    servidores = ler_servidores(args.servidores) if args.servidores else None
    cargos = {}
    if servidores:
        for r in servidores["lista"]:
            k = chave_nome(r[0])
            if k not in cargos or r[9] == "":
                cargos[k] = r[1]
    anos = sorted({int(os.path.basename(p)) for p in glob.glob(os.path.join(args.siconfi, "[12][0-9][0-9][0-9]"))}, reverse=True)
    saida = {"anos": {}}
    manuais = {}
    if os.path.exists(args.indicadores):
        with open(args.indicadores, encoding="utf-8") as f:
            manuais = json.load(f)
    avisos = []
    for ano in anos:
        rreo, rgf = arquivos_siconfi(args.siconfi, ano)
        if not rreo:
            continue
        bim = max(rreo)
        r = ler_rreo(rreo[bim], bim)
        meses = r["meses"]
        if abs(r["receitas"]["conferencia"]) > 1000:
            avisos.append(f"{ano}: receitas por origem diferem do total do RREO em R$ {r['receitas']['conferencia']:,.2f}")
        d = r["despesas"]
        bloco = {"periodo": "jan–dez" if meses == 12 else f"jan–{MESES[meses - 1]}", "meses": meses,
                 "receitas": {k: v for k, v in r["receitas"].items() if k != "conferencia"},
                 "despesas": {k: d[k] for k in ("orcado", "empenhado", "liquidado", "pago", "por_natureza")},
                 "fontes": {"siconfi": f"RREO {bim}º bimestre de {ano}"}}
        tce = ler_tce(args.tce, ano, meses)
        if tce:
            dif = tce["total_pago"] - d["pago"]
            if abs(dif) > max(1000, d["pago"] * 0.002):
                avisos.append(f"{ano}: total pago no TCE-PR difere do RREO em R$ {dif:,.2f}")
            bloco["despesas"].update({"mensal_pago": tce["mensal_pago"], "por_funcao": tce["por_funcao_pago"], "por_funcao_medida": "pago"})
            bloco["credores"] = tce["credores"]
            bloco["folha_pago"] = tce["folha_pago"]
            bloco["componentes_folha"] = tce["componentes_folha"]
            bloco["passagens"] = tce["passagens"]
            from temas import processar_temas
            def eh_proprio(nome, doc):
                return re.sub(r"\D", "", doc or "") in CNPJ_PROPRIOS or nome.upper().startswith(PROPRIOS_PREFIXO)
            t = processar_temas(args.tce, ano, meses, CNPJ_PROPRIOS, eh_proprio)
            if t:
                bloco["temas"] = t
            di = ler_diarias(args.tce, ano, meses, cargos)
            if di:
                bloco["diarias"] = di
            bloco["fontes"]["tce"] = f"TCE-PR, SIM-AM (remessa até {tce['ultimo_envio']}), pagamentos até {MESES[meses - 1]}/{ano}"
        else:
            bloco["despesas"].update({"mensal_pago": None, "por_funcao": r["despesas"]["por_funcao_liquidado"], "por_funcao_medida": "liquidado"})
            bloco["credores"] = None
        # gasto com pessoal: último quadrimestre válido
        ind = {"saude_pct": None, "educacao_pct": None, "pessoal_rcl_pct": None}
        for q in sorted(rgf, reverse=True):
            g = ler_rgf(rgf[q], q)
            if g["rcl_ajustada"] and g["pct"] < 100:
                ind.update({"pessoal_rcl_pct": g["pct"], "pessoal_periodo": f"12 meses até o {q}º quadrimestre de {ano}",
                            "pessoal_inativos_deduzidos": round(g["inativos_deduzidos"], 2)})
                break
            avisos.append(f"{ano}: RGF {q}º quadrimestre ignorado (percentual {g['pct']}% indica erro no relatório)")
        ind.update({k: v for k, v in manuais.get(str(ano), {}).items()})
        bloco["indicadores"] = ind
        saida["anos"][str(ano)] = bloco

    hoje = datetime.date.today().isoformat()
    saida["meta"] = {"municipio": "Foz do Iguaçu", "uf": "PR", "populacao": POPULACAO, "populacao_fonte": "IBGE, Censo 2022",
                     "fonte": "Siconfi (Tesouro Nacional) e TCE-PR (SIM-AM)", "atualizado_em": hoje, "demonstracao": False,
                     "avisos": avisos}
    saida = {"meta": saida["meta"], "anos": saida["anos"]}
    if servidores:
        saida["servidores"] = servidores
    from temas import ler_csv
    fo = args.fontes_osb
    for nome in ("camara", "transporte"):
        c = os.path.join(fo, nome + ".json")
        if os.path.exists(c):
            with open(c, encoding="utf-8") as f:
                saida[nome] = json.load(f)
    from temas import ler_foco_na_obra
    fno = ler_foco_na_obra(os.path.join(fo, "foco_na_obra.kml"))
    if fno:
        saida["foco_na_obra"] = fno
    pe = os.path.join(fo, "emendas", "painel_emendas.json")  # gerado por emendas.py painel
    if os.path.exists(pe):
        with open(pe, encoding="utf-8") as f:
            saida["emendas"] = json.load(f)
    saida["osb"] = {"oficios": ler_csv(os.path.join(fo, "oficios.csv")),
                    "licitacoes": ler_csv(os.path.join(fo, "licitacoes_monitoradas.csv"))}
    with open(args.saida, "w", encoding="utf-8") as f:
        json.dump(saida, f, ensure_ascii=False, separators=(",", ":"))
    for a in avisos:
        print("AVISO:", a, file=sys.stderr)
    print(f"ok: {args.saida} ({os.path.getsize(args.saida) / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
