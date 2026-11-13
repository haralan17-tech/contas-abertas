(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const MESES_LONGO = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const CORES = ["--s1","--s2","--s3","--s4","--s5","--s8"].map((v) => `var(${v})`);
  const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const brl2 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  function reais(v) {
    const a = Math.abs(v);
    if (a >= 1e9) return "R$ " + nf1.format(v / 1e9) + " bi";
    if (a >= 1e6) return "R$ " + nf1.format(v / 1e6) + " mi";
    if (a >= 1e3) return "R$ " + nf0.format(v / 1e3) + " mil";
    return brl.format(v);
  }
  const pct = (v) => nf1.format(v) + "%";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const semAcento = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const FUNCOES = {
    "Saúde": "Hospitais, UPAs, unidades básicas, medicamentos, exames e vigilância em saúde.",
    "Educação": "Escolas e CMEIs municipais, professores, merenda e transporte escolar.",
    "Previdência Social": "Aposentadorias e pensões pagas pelo fundo de previdência dos servidores (FozPrev).",
    "Urbanismo": "Ruas, pavimentação, iluminação pública, transporte coletivo e manutenção da cidade.",
    "Administração": "Funcionamento geral da Prefeitura: pessoal administrativo, sistemas, prédios.",
    "Encargos Especiais": "Pagamento de dívidas, PIS/Pasep, precatórios e outras obrigações financeiras.",
    "Gestão Ambiental": "Coleta e destinação do lixo, limpeza urbana, parques e meio ambiente.",
    "Segurança Pública": "Guarda Municipal, defesa civil e trânsito.",
    "Assistência Social": "CRAS, CREAS, abrigos e apoio a famílias em situação de vulnerabilidade.",
    "Legislativa": "Funcionamento da Câmara de Vereadores.",
    "Transporte": "Trânsito, sinalização e transporte (Foztrans).",
    "Desporto e Lazer": "Esporte, eventos esportivos e espaços de lazer.",
    "Comércio e Serviços": "Turismo e apoio a atividades econômicas.",
    "Essencial à Justiça": "Procuradoria do município, que defende a Prefeitura na Justiça.",
    "Cultura": "Fundação Cultural, eventos e equipamentos culturais.",
    "Habitação": "Programas de moradia (FozHabita).",
  };

  const tip = $("#tip");
  function mostraTip(e, html) {
    tip.innerHTML = html; tip.classList.add("on");
    const r = tip.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  const escondeTip = () => tip.classList.remove("on");
  function ligaTip(el, html) {
    el.addEventListener("mousemove", (e) => mostraTip(e, html));
    el.addEventListener("mouseleave", escondeTip);
  }

  let DADOS, A, POP, anoAtual;
  const ateMes = () => (A.meses < 12 ? ` (até ${MESES_LONGO[A.meses - 1]})` : "");
  const fonteSiconfi = () => `Fonte: Siconfi/Tesouro Nacional, ${A.fontes.siconfi}.`;
  const fonteTce = () => (A.fontes.tce ? `Fonte: ${A.fontes.tce}.` : fonteSiconfi());

  function barras(alvo, itens, cor, total, opts) {
    const porHab = !(opts && opts.porHab === false);
    const max = Math.max(...itens.map((i) => i.valor), 1);
    alvo.innerHTML = "";
    itens.forEach((i) => {
      const row = document.createElement("div");
      row.className = "barra";
      const parte = total ? `<small>${pct(i.valor / total * 100)}</small>` : "";
      row.innerHTML = `<span class="nome">${esc(i.nome)}</span><span class="trilho"><span class="preench" style="display:block;width:${Math.max(0, i.valor / max * 100).toFixed(2)}%;background:${i.cor || cor}"></span></span><span class="valor num">${reais(i.valor)}${parte}</span>`;
      ligaTip(row, `<strong>${esc(i.nome)}</strong><br>${brl.format(i.valor)}${total ? "<br>" + pct(i.valor / total * 100) + " do total" : ""}${POP && porHab ? "<br>" + brl2.format(i.valor / POP) + " por habitante" : ""}${i.explicacao ? "<br><span style='opacity:.85'>" + esc(i.explicacao) + "</span>" : ""}`);
      alvo.appendChild(row);
    });
  }

  function tiles() {
    const r = A.receitas, d = A.despesas;
    const saldo = r.arrecadado - d.pago;
    const t = [
      { rot: "Receita arrecadada", val: reais(r.arrecadado), det: `${brl.format(r.arrecadado / POP)} por habitante`, cor: "var(--series-1)" },
      { rot: "Despesa paga", val: reais(d.pago), det: `${brl.format(d.pago / POP)} por habitante`, cor: "var(--series-2)" },
      { rot: saldo >= 0 ? "Sobrou no período" : "Faltou no período", val: reais(Math.abs(saldo)), det: "Arrecadado menos pago. Parte desse valor já está comprometida com despesas empenhadas." },
      { rot: "Compromissos ainda não pagos", val: reais(d.empenhado - d.pago), det: "Despesas empenhadas no ano que ainda não foram pagas." },
    ];
    $("#tiles").innerHTML = t.map((x) => `<div class="tile${x.cor ? " dest" : ""}"${x.cor ? ` style="border-top-color:${x.cor}"` : ""}><span class="rot">${x.rot}</span><span class="val num">${x.val}</span><span class="det">${x.det}</span></div>`).join("");
  }

  function linhaMensal() {
    const box = $("#graf-mensal");
    const rec = A.receitas.mensal, des = A.despesas.mensal_pago;
    const n = rec.length;
    $("#leg-mensal").innerHTML = `<span><i class="marca" style="background:var(--series-1)"></i>Receitas correntes arrecadadas</span>` + (des ? `<span><i class="marca" style="background:var(--series-2)"></i>Despesa paga</span>` : "");
    $("#nota-mensal").textContent = (des ? "" : `A despesa mês a mês de ${anoAtual} aparece quando os arquivos de ${anoAtual} do Tribunal de Contas forem carregados. `) +
      "As receitas mensais não incluem receitas de capital, como empréstimos e transferências para obras, e já descontam a parte retida para o Fundeb.";
    const W = Math.max(320, Math.round(box.clientWidth) || 900), H = W < 500 ? 240 : 300, m = { t: 16, r: W < 500 ? 92 : 120, b: 30, l: W < 500 ? 52 : 64 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const maxV = Math.max(...rec, ...(des || []));
    const passo = [20e6, 25e6, 50e6, 100e6, 200e6, 250e6, 500e6].find((p) => maxV / p <= 5) || 1e9;
    const topo = Math.ceil(maxV / passo) * passo;
    const x = (i) => m.l + (i / 11) * iw;
    const y = (v) => m.t + ih - (v / topo) * ih;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Receitas e despesas por mês em ${anoAtual}">`;
    for (let v = 0; v <= topo + 1; v += passo) {
      s += `<line x1="${m.l}" x2="${m.l + iw}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/>`;
      s += `<text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v === 0 ? "0" : reais(v).replace("R$ ", "")}</text>`;
    }
    MESES.forEach((mm, i) => { if (W >= 500 || i % 2 === 0) s += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${mm}</text>`; });
    const caminho = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const series = [[rec, "var(--series-1)", "Receitas"]].concat(des ? [[des, "var(--series-2)", "Despesa paga"]] : []);
    series.forEach(([arr, cor]) => {
      s += `<path d="${caminho(arr)}" fill="none" stroke="${cor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
      const ul = arr.length - 1;
      s += `<circle cx="${x(ul)}" cy="${y(arr[ul])}" r="4.5" fill="${cor}" stroke="var(--surface)" stroke-width="2"/>`;
    });
    const ul = n - 1;
    let ly = series.map(([arr]) => y(arr[arr.length - 1]));
    if (ly.length === 2 && Math.abs(ly[0] - ly[1]) < 16) { const mid = (ly[0] + ly[1]) / 2, up = ly[0] < ly[1]; ly = up ? [mid - 8, mid + 8] : [mid + 8, mid - 8]; }
    series.forEach(([, , nome], k) => { s += `<text x="${x(ul) + 10}" y="${ly[k] + 4}" style="fill:var(--ink-2);font-weight:600">${nome}</text>`; });
    s += `<line id="cruz" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" stroke="var(--ink-3)" stroke-width="1" stroke-dasharray="3 3" style="display:none"/>`;
    s += `<rect id="hit" x="${m.l - 20}" y="${m.t}" width="${iw + 40}" height="${ih}" fill="transparent"/></svg>`;
    box.innerHTML = s;
    const svg = box.querySelector("svg"), hit = box.querySelector("#hit"), cruz = box.querySelector("#cruz");
    hit.addEventListener("mousemove", (e) => {
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const p = pt.matrixTransform(svg.getScreenCTM().inverse());
      const i = Math.round(((p.x - m.l) / iw) * 11);
      if (i < 0 || i >= n) { cruz.style.display = "none"; escondeTip(); return; }
      cruz.setAttribute("x1", x(i)); cruz.setAttribute("x2", x(i)); cruz.style.display = "";
      mostraTip(e, `<strong>${MESES_LONGO[i]} de ${anoAtual}</strong><br><span class="marca" style="background:var(--series-1)"></span>Receitas: ${reais(rec[i])}` + (des ? `<br><span class="marca" style="background:var(--series-2)"></span>Despesa paga: ${reais(des[i])}` : ""));
    });
    hit.addEventListener("mouseleave", () => { cruz.style.display = "none"; escondeTip(); });
  }

  function receitas() {
    const r = A.receitas;
    const base = r.bruto;
    const grupos = r.grupos.map((g) => ({ ...g, total: g.itens.reduce((s, i) => s + i.valor, 0) })).sort((a, b) => b.total - a.total);
    const max = grupos[0].total;
    $("#rec-grupos").innerHTML = grupos.map((g) => `
      <details class="grupo">
        <summary><span class="g-nome">${esc(g.grupo)}</span><span class="g-val num">${reais(g.total)} <small style="color:var(--ink-3);font-weight:400">${pct(g.total / base * 100)}</small></span><span class="g-trilho"><div style="width:${(g.total / max * 100).toFixed(2)}%"></div></span></summary>
        <p class="g-ex">${esc(g.explicacao)}</p>
        <ul>${g.itens.slice().sort((a, b) => b.valor - a.valor).map((i) => `<li><strong>${esc(i.nome)}</strong><span class="num">${reais(i.valor)}</span><span class="i-ex">${esc(i.explicacao)}</span></li>`).join("")}</ul>
      </details>`).join("");
    $("#rec-nota").textContent = `Valores brutos, que somam ${reais(base)}. Desse total, ${reais(r.deducao_fundeb)} foram retidos automaticamente para formar o Fundeb, que volta ao município como verba de educação. Por isso, a receita arrecadada é de ${reais(r.arrecadado)}.`;

    const soma = (filtro) => grupos.filter((g) => filtro.test(g.grupo)).reduce((s, g) => s + g.total, 0);
    const proprio = soma(/^Impostos/);
    const transf = soma(/^Repasses|^Fundeb|^Verbas/);
    const outras = base - proprio - transf;
    const partes = [["Impostos e taxas do município", proprio, "var(--s1)"], ["Repasses do Estado e da União, Fundeb e verbas vinculadas", transf, "var(--s2)"], ["Royalties, rendimentos e outras", outras, "var(--s8)"]];
    $("#rec-autonomia").textContent = `De cada R$ 100 que entraram, R$ ${nf0.format(proprio / base * 100)} vieram de impostos e taxas cobrados pela própria Prefeitura e R$ ${nf0.format(transf / base * 100)} vieram de repasses de outros governos.`;
    $("#faixa-autonomia").innerHTML = partes.map(([n, v, c]) => `<div style="flex:${v};background:${c}">${v / base * $("#faixa-autonomia").clientWidth >= 40 ? nf0.format(v / base * 100) + "%" : ""}</div>`).join("");
    $("#leg-autonomia").innerHTML = partes.map(([n, v, c]) => `<span><i class="marca" style="background:${c}"></i>${n}: ${pct(v / base * 100)}</span>`).join("");

    $("#rec-previsto").textContent = A.meses < 12
      ? `O orçamento atualizado prevê ${reais(r.previsto)} para o ano inteiro. Até ${MESES_LONGO[A.meses - 1]}, entraram ${reais(r.arrecadado)}, ou ${pct(r.arrecadado / r.previsto * 100)} do previsto. Em ${A.meses} de 12 meses, o esperado seria cerca de ${pct(A.meses / 12 * 100)}.`
      : `O orçamento atualizado previa ${reais(r.previsto)}. Entraram ${reais(r.arrecadado)}, ou ${pct(r.arrecadado / r.previsto * 100)} do previsto.`;
    barras($("#rec-prev-barras"), [
      { nome: "Previsto para o ano", valor: r.previsto, cor: "var(--s8)" },
      { nome: A.meses < 12 ? "Arrecadado até agora" : "Arrecadado no ano", valor: r.arrecadado, cor: "var(--series-1)" },
    ]);
  }

  function despesas() {
    const d = A.despesas;
    const medida = d.por_funcao_medida === "pago" ? "paga" : "liquidada";
    const f = d.por_funcao.slice().sort((a, b) => b.valor - a.valor);
    const base = f.reduce((s, x) => s + x.valor, 0);
    const top = f.slice(0, 5), resto = f.slice(5).reduce((s, x) => s + x.valor, 0);
    const fatias = top.map((x, i) => ({ nome: x.funcao, v: x.valor, cor: CORES[i] })).concat(resto > 0 ? [{ nome: "Outras áreas", v: resto, cor: CORES[5] }] : []);
    $("#desp-intro").textContent = `Em ${anoAtual}${ateMes()}, a Prefeitura pagou ${reais(d.pago)}. ${f[0].funcao} e ${f[1].funcao} ficam com ${pct((f[0].valor + f[1].valor) / base * 100)} da despesa.`;
    $("#t-faixa").textContent = d.por_funcao_medida === "pago" ? "De cada R$ 100 pagos pela Prefeitura" : "De cada R$ 100 gastos pela Prefeitura";
    const faixa = $("#faixa-100");
    faixa.innerHTML = "";
    fatias.forEach((x) => {
      const div = document.createElement("div");
      const p = x.v / base * 100;
      div.style.flex = x.v; div.style.background = x.cor;
      div.textContent = p * faixa.clientWidth / 100 >= 46 ? "R$ " + nf0.format(p) : "";
      ligaTip(div, `<strong>${esc(x.nome)}</strong><br>R$ ${nf1.format(p)} de cada R$ 100<br>${reais(x.v)} no total`);
      faixa.appendChild(div);
    });
    $("#leg-100").innerHTML = fatias.map((x) => `<span><i class="marca" style="background:${x.cor}"></i>${esc(x.nome)}: R$ ${nf0.format(x.v / base * 100)}</span>`).join("");
    $("#t-funcao").textContent = `Despesa ${medida} por área`;
    barras($("#desp-funcao"), f.map((x) => ({ nome: x.funcao, valor: x.valor, explicacao: FUNCOES[x.funcao] })), "var(--series-2)", base);
    $("#fonte-funcao").textContent = d.por_funcao_medida === "pago" ? fonteTce() : `${fonteSiconfi()} Para ${anoAtual}, a divisão por área usa a despesa liquidada (serviço entregue e conferido), porque os pagamentos detalhados ainda não foram carregados.`;
    barras($("#desp-natureza"), d.por_natureza.map((x) => ({ nome: x.nome, valor: x.valor, explicacao: x.explicacao })), "var(--series-2)", d.pago);

    const est = [["Empenhado", "reservado", d.empenhado], ["Liquidado", "entregue e conferido", d.liquidado], ["Pago", "dinheiro saiu", d.pago]];
    $("#estagios").innerHTML = est.map(([n, sub, v], i) => `<div class="estagio"><span class="e-nome">${n}<small>${sub}</small></span><span class="e-barra num" style="width:${Math.max(30, v / d.empenhado * 100).toFixed(1)}%;background:${["#9fd3ea", "#018ac0", "#005080"][i]};color:${i === 0 ? "#0b0b0b" : "#fff"}">${reais(v)}</span></div>`).join("");
    $("#fonte-natureza").textContent = fonteSiconfi();
  }

  let credOrdem = "pago", credLimite = 20, credAberto = null;
  function credores() {
    const c = A.credores;
    const box = $("#cred-conteudo"), vazio = $("#cred-vazio");
    if (!c) {
      box.hidden = true; vazio.hidden = false; $("#cred-tiles").innerHTML = "";
      vazio.textContent = `A lista de credores de ${anoAtual} aparece quando os arquivos de despesa de ${anoAtual} do Tribunal de Contas do Paraná forem carregados. Por enquanto, ela está disponível para os anos com esses arquivos.`;
      return;
    }
    box.hidden = false; vazio.hidden = true;
    const total = c.reduce((s, x) => s + x.pago, 0);
    const top10 = c.slice(0, 10).reduce((s, x) => s + x.pago, 0);
    const t = [
      ["Credores com pagamentos", nf0.format(c.filter((x) => x.pago > 0).length), "Empresas, entidades e pessoas que receberam no período."],
      ["Total pago a credores", reais(total), "Fornecedores, entidades e órgãos públicos. Não inclui a folha."],
      ["Fatia dos 10 maiores", pct(top10 / total * 100), "Quanto do total pago a credores foi para os dez que mais receberam."],
    ];
    if (A.folha_pago) t.push(["Folha de pagamento", reais(A.folha_pago), "Salários, aposentadorias e pensões pagos diretamente a servidores. Fica fora do ranking."]);
    $("#cred-tiles").innerHTML = t.map(([r, v, d]) => `<div class="tile"><span class="rot">${r}</span><span class="val num">${v}</span><span class="det">${d}</span></div>`).join("");
    const preenche = (sel, valores, rotuloTodos) => {
      const atual = sel.value;
      sel.innerHTML = `<option value="">${rotuloTodos}</option>` + valores.map((a) => `<option${a === atual ? " selected" : ""}>${esc(a)}</option>`).join("");
    };
    preenche($("#f-area"), [...new Set(c.map((x) => x.area))].sort(), "Todas as áreas");
    preenche($("#f-tipo"), [...new Set(c.map((x) => x.tipo))].sort(), "Todos os tipos");
    c.forEach((x) => { if (!x._busca) x._busca = semAcento(x.nome + " " + x.documento + " " + x.objeto + " " + (x.historico || "")); });
    tabelaCredores();
  }
  function tabelaCredores() {
    if (!A.credores) return;
    const q = semAcento($("#busca").value.trim()), area = $("#f-area").value, tipo = $("#f-tipo").value;
    const lista = A.credores.filter((x) => (!area || x.area === area) && (!tipo || x.tipo === tipo) && (!q || x._busca.includes(q)));
    lista.sort((a, b) => credOrdem === "pago" ? b.pago - a.pago : b.empenhos - a.empenhos);
    const max = Math.max(1, A.credores[0].pago);
    const linhasHtml = lista.slice(0, credLimite).map((x, i) => {
      const id = x.documento + "|" + x.nome;
      const aberto = credAberto === id;
      return `<tr class="cred-linha" data-id="${esc(id)}" tabindex="0" aria-expanded="${aberto}">
        <td class="num">${i + 1}</td>
        <td><strong>${esc(x.nome)}</strong><span class="doc num">${esc(x.documento)} · ${esc(x.tipo)}</span></td>
        <td>${esc(x.objeto)}</td>
        <td><span class="tag">${esc(x.area)}</span></td>
        <td class="dir num">${nf0.format(x.empenhos)}</td>
        <td class="dir num"><strong>${reais(x.pago)}</strong><div class="barrinha" style="width:${Math.max(0, x.pago / max * 100).toFixed(1)}%;margin-left:auto"></div></td>
      </tr>` + (aberto ? `<tr class="cred-det"><td></td><td colspan="5">Empenhado no período: <strong>${brl2.format(x.empenhado)}</strong> · Pago: <strong>${brl2.format(x.pago)}</strong>${x.historico ? `<br>Maior empenho: ${esc(x.historico)}` : ""}</td></tr>` : "");
    }).join("");
    $("#cred-corpo").innerHTML = lista.length ? linhasHtml : `<tr><td colspan="6">Nenhum credor encontrado com esses filtros. Tente outro termo ou limpe os filtros.</td></tr>`;
    $("#cred-resumo").textContent = lista.length ? `${nf0.format(lista.length)} credores na lista, incluindo os que tiveram empenho mas ainda não receberam, somando ${reais(lista.reduce((s, x) => s + x.pago, 0))} pagos.` : "";
    const btn = $("#mais");
    btn.hidden = lista.length <= credLimite;
    btn.textContent = `Mostrar mais (${nf0.format(Math.max(0, lista.length - credLimite))} restantes)`;
    $("#ord-pago").textContent = "Total pago" + (credOrdem === "pago" ? " ▼" : "");
    $("#ord-emp").textContent = "Empenhos" + (credOrdem === "emp" ? " ▼" : "");
    $("#fonte-cred").textContent = fonteTce();
  }

  function indicadores() {
    const i = A.indicadores;
    const anterior = DADOS.anos[String(Number(anoAtual) - 1)];
    const card = (titulo, val, lim, tipo, texto, escala, extra) => {
      if (val == null) {
        return `<div class="card ind"><div class="ind-top"><h3>${titulo}</h3><span class="pill" style="color:var(--ink-3)">Aguardando dados</span></div>
          <p style="color:var(--ink-2);font-size:.92rem">${texto}</p>
          <p class="vazio">Este percentual é declarado no ${titulo === "Saúde" ? "SIOPS, do Ministério da Saúde" : "SIOPE, do Ministério da Educação"}, e ainda não foi carregado no site.</p></div>`;
      }
      let cls, rot;
      if (tipo === "min") {
        const parcial = extra === "parcial";
        if (val >= lim) { cls = "ok"; rot = parcial ? "✓ Acima do mínimo até agora" : "✓ Cumpriu o mínimo"; }
        else { cls = parcial ? "alerta" : "ruim"; rot = parcial ? "! Abaixo do mínimo até agora" : "✕ Não cumpriu o mínimo"; }
        extra = "";
      }
      else { cls = val > lim ? "ruim" : val > lim * 0.95 ? "alerta" : "ok"; rot = val > lim ? "✕ Acima do limite" : val > lim * 0.95 ? "! Acima do limite prudencial" : val > lim * 0.9 ? "! Acima do limite de alerta" : "✓ Dentro do limite"; if (val > lim * 0.9 && val <= lim * 0.95) cls = "alerta"; }
      return `<div class="card ind">
        <div class="ind-top"><h3>${titulo}</h3><span class="pill ${cls}">${rot}</span></div>
        <div><span class="num" style="font-family:var(--font-display);font-size:2rem;font-weight:800">${pct(val)}</span> <span style="color:var(--ink-2)">${tipo === "min" ? "aplicado · mínimo " : "da receita corrente líquida · limite "}${pct(lim)}</span></div>
        <div class="bullet" role="img" aria-label="${pct(val)}, limite ${pct(lim)}"><div class="b-val" style="width:${Math.min(100, val / escala * 100)}%;${cls === "ruim" ? "background:var(--critical)" : ""}"></div><div class="b-lim" style="left:${lim / escala * 100}%"></div></div>
        <div class="bullet-esc"><span>0%</span><span>${pct(escala)}</span></div>
        <p style="color:var(--ink-2);font-size:.92rem">${texto}</p>${extra || ""}</div>`;
    };
    let extraPessoal = i.pessoal_periodo ? `<p class="fonte">Fonte: Relatório de Gestão Fiscal (Siconfi), ${esc(i.pessoal_periodo)}. Poder Executivo.</p>` : "";
    if (i.pessoal_rcl_pct > 54) {
      let comp = "";
      const ai = anterior && anterior.indicadores;
      if (ai && ai.pessoal_inativos_deduzidos && i.pessoal_inativos_deduzidos < ai.pessoal_inativos_deduzidos * 0.7) {
        comp = ` No relatório anterior (${esc(ai.pessoal_periodo)}), o percentual foi ${pct(ai.pessoal_rcl_pct)}. Entre um relatório e outro, o valor de aposentadorias e pensões pagas com recursos da previdência, que a lei permite descontar do cálculo, caiu de ${reais(ai.pessoal_inativos_deduzidos)} para ${reais(i.pessoal_inativos_deduzidos)}. Essa mudança pesa bastante no resultado e merece esclarecimento da Prefeitura.`;
      }
      extraPessoal = `<p class="aviso">Este é o percentual que a própria Prefeitura informou ao Tesouro Nacional.${comp}</p>` + extraPessoal;
    }
    const notaMin = (area, parcial, periodo, fonte, extraTxt) => {
      if (!periodo) return "";
      let s = parcial ? `<p style="color:var(--ink-2);font-size:.92rem">O mínimo vale para o ano inteiro e é conferido em dezembro. O percentual parcial mostra o ritmo de aplicação até ${esc(periodo.replace(/^até o /, "o "))}.</p>` : "";
      return s + (extraTxt || "") + `<p class="fonte">Fonte: ${esc(fonte)}. Período: ${esc(periodo)}.</p>`;
    };
    const cardMin = (titulo, val, lim, texto, parcial, periodo, fonte, extraTxt) => {
      const html = card(titulo, val, lim, "min", texto, 40, parcial ? "parcial" : "");
      return val == null ? html : html.replace(/<\/div>$/, notaMin(titulo, parcial, periodo, fonte, extraTxt) + "</div>");
    };
    const fundeb = i.fundeb70_pct != null ? `<p style="color:var(--ink-2);font-size:.92rem">Do Fundeb, ${pct(i.fundeb70_pct)} foi para salários dos profissionais da educação. O mínimo exigido é 70%.</p>` : "";
    $("#indicadores").innerHTML =
      cardMin("Saúde", i.saude_pct, 15, "O município deve aplicar pelo menos 15% da receita de impostos e transferências constitucionais em saúde.", i.saude_parcial, i.saude_periodo, i.saude_fonte) +
      cardMin("Educação", i.educacao_pct, 25, "O município deve aplicar pelo menos 25% da receita de impostos e transferências em manutenção e desenvolvimento do ensino.", i.educacao_parcial, i.educacao_periodo, i.educacao_fonte, fundeb) +
      card("Gastos com pessoal", i.pessoal_rcl_pct, 54, "max", "O Poder Executivo pode gastar no máximo 54% da receita corrente líquida com pessoal. Acima de 48,6%, o Tribunal de Contas emite um alerta. Acima de 51,3%, a lei proíbe novas contratações e aumentos. Acima de 54%, o excesso precisa ser eliminado em até dois quadrimestres.", 70, extraPessoal);
  }

  // ------------------------------------------------------------ Sankey: de onde vem e para onde vai
  const CURTO = {
    "Impostos e taxas do município": "Impostos e taxas municipais",
    "Verbas para saúde, assistência e outros programas": "Verbas vinculadas (SUS e outros)",
    "Rendimentos e outras receitas": "Rendimentos e outras",
    "Royalties de Itaipu": "Royalties de Itaipu",
  };
  const curto = (s, n = 36) => { s = CURTO[s] || s; return s.length > n ? s.slice(0, n - 1) + "…" : s; };

  function sankey(box, notaEl, fonteEl, opts) {
    opts = opts || {};
    box = box || $("#sankey"); notaEl = notaEl || $("#caminho-nota"); fonteEl = fonteEl || $("#fonte-caminho");
    const r = A.receitas, d = A.despesas;
    const esq = r.grupos.map((g) => ({ nome: g.grupo, v: g.itens.reduce((s, i) => s + i.valor, 0), cor: "var(--series-1)" }))
      .filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
    const f = d.por_funcao.slice().sort((a, b) => b.valor - a.valor);
    const T = esq.reduce((s, x) => s + x.v, 0);
    const corte = T * 0.025;
    const dir = f.filter((x) => x.valor >= corte).slice(0, 8).map((x) => ({ nome: x.funcao, v: x.valor, cor: "var(--series-2)", exp: FUNCOES[x.funcao] }));
    const resto = f.reduce((s, x) => s + x.valor, 0) - dir.reduce((s, x) => s + x.v, 0);
    if (resto > 0) dir.push({ nome: "Outras áreas", v: resto, cor: "var(--series-2)", exp: "Soma das áreas menores: " + f.filter((x) => !dir.some((y) => y.nome === x.funcao)).map((x) => x.funcao).join(", ") + "." });
    dir.push({ nome: "Retido para o Fundeb", v: r.deducao_fundeb, cor: "var(--s8)", exp: "Parte de alguns impostos e repasses vai automaticamente para o Fundeb e volta ao município como verba de educação (aparece à esquerda, em Fundeb)." });
    const gasto = dir.reduce((s, x) => s + x.v, 0);
    const saldo = T - gasto;
    const medida = d.por_funcao_medida === "pago" ? "pago" : "liquidado";
    const medidaF = medida === "pago" ? "paga" : "liquidada";
    if (saldo >= 0) dir.push({ nome: "Ainda não gasto no período", v: saldo, cor: "var(--good)", exp: `Receita do período que ainda não foi ${medida === "pago" ? "paga" : "gasta"}. Parte já está comprometida com despesas empenhadas.` });
    else esq.push({ nome: "Saldo de anos anteriores", v: -saldo, cor: "var(--s8)" });
    const totalEsq = esq.reduce((s, x) => s + x.v, 0);

    const W = 1120, H = 600, nodeW = 14, gap = 10, topo = 10;
    const xL = 300, xC = 553, xR = 800;
    const n = Math.max(esq.length, dir.length);
    const k = (H - topo * 2 - gap * (n - 1)) / totalEsq;
    const coluna = (lista) => {
      const altura = lista.reduce((s, x) => s + Math.max(2, x.v * k), 0) + gap * (lista.length - 1);
      let y = topo + (H - topo * 2 - altura) / 2;
      lista.forEach((x) => { x.h = Math.max(2, x.v * k); x.y = y; y += x.h + gap; });
    };
    coluna(esq); coluna(dir);
    const hC = totalEsq * k, yC = (H - hC) / 2;
    const banda = (x0, y0, h0, x1, y1, h1) => {
      const xm = (x0 + x1) / 2;
      return `M${x0},${y0}C${xm},${y0} ${xm},${y1} ${x1},${y1}L${x1},${y1 + h1}C${xm},${y1 + h1} ${xm},${y0 + h0} ${x0},${y0 + h0}Z`;
    };
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Diagrama do caminho do dinheiro: receitas à esquerda, despesas à direita">`;
    let yc = yC, links = [];
    esq.forEach((x, i) => { const h = x.v * k; links.push({ d: banda(xL + nodeW, x.y, x.h, xC, yc, h), cor: x.cor, no: x, lado: "e", i }); yc += h; });
    yc = yC;
    dir.forEach((x, i) => { const h = x.v * k; links.push({ d: banda(xC + nodeW, yc, h, xR, x.y, x.h), cor: x.cor, no: x, lado: "d", i }); yc += h; });
    const atr = (lado, x) => opts.marcavel ? ` data-lado="${lado}" data-n="${esc(x.nome)}"` : "";
    links.forEach((l, j) => { s += `<path class="lk" data-j="${j}" d="${l.d}" fill="${l.cor}" opacity=".26"${atr(l.lado, l.no)}/>`; });
    s += `<rect x="${xC}" y="${yC}" width="${nodeW}" height="${hC}" rx="3" fill="var(--accent)"/>`;
    s += `<text x="${xC + nodeW / 2}" y="${yC - 8}" text-anchor="middle" style="font-weight:800">Cofre do município</text>`;
    s += `<text x="${xC + nodeW / 2}" y="${yC + hC + 18}" text-anchor="middle" class="v" style="fill:var(--ink-3)">${reais(totalEsq)}</text>`;
    esq.forEach((x) => {
      s += `<rect class="no" x="${xL}" y="${x.y}" width="${nodeW}" height="${x.h}" rx="2" fill="${x.cor}"${atr("e", x)}/>`;
      s += `<text class="no" x="${xL - 8}" y="${x.y + x.h / 2 + 4}" text-anchor="end"${atr("e", x)}>${esc(curto(x.nome))} <tspan class="v">${reais(x.v)}</tspan></text>`;
    });
    dir.forEach((x) => {
      s += `<rect class="no" x="${xR}" y="${x.y}" width="${nodeW}" height="${x.h}" rx="2" fill="${x.cor}"${atr("d", x)}/>`;
      s += `<text class="no" x="${xR + nodeW + 8}" y="${x.y + x.h / 2 + 4}"${atr("d", x)}>${esc(curto(x.nome))} <tspan class="v">${reais(x.v)}</tspan></text>`;
    });
    s += `</svg>`;
    box.innerHTML = s;
    box.querySelectorAll("path.lk").forEach((p) => {
      const l = links[Number(p.dataset.j)];
      const html = `<strong>${esc(l.no.nome)}</strong><br>${brl.format(l.no.v)} · ${pct(l.no.v / totalEsq * 100)} do total` + (l.no.exp ? `<br><span style="opacity:.85">${esc(l.no.exp)}</span>` : "");
      ligaTip(p, html);
    });
    notaEl.textContent = `Receitas em valores brutos (${reais(T)}), de janeiro a ${MESES_LONGO[A.meses - 1]} de ${anoAtual}. As áreas mostram a despesa ${medidaF}. Áreas com menos de 2,5% do total foram somadas em "Outras áreas".`;
    fonteEl.textContent = d.por_funcao_medida === "pago" ? `Receitas: ${fonteSiconfi().replace("Fonte: ", "")} Despesas: ${fonteTce().replace("Fonte: ", "")}` : fonteSiconfi();
    return { esq, dir, total: totalEsq };
  }

  // Visão geral com destaque: receitas e áreas não têm ligação direta entre si (passam pelo cofre),
  // então o filtro destaca os itens escolhidos sem mudar os totais.
  function sankeyGeralFiltravel(wrap, notaEl, fonteEl) {
    const id = "skg" + ++skSeq;
    wrap.innerHTML = `<div class="sk-filtros" id="${id}-f"></div><p class="sk-resumo" id="${id}-res"></p><div id="${id}-g" class="sankey-box"></div>`;
    const info = sankey($(`#${id}-g`), notaEl, fonteEl, { marcavel: true });
    const lados = [["e", "Receitas", info.esq], ["d", "Destino do dinheiro", info.dir]];
    const sel = { e: null, d: null };
    $(`#${id}-f`).innerHTML = lados.map(([l, rot, lista]) => `<details class="fsk" data-l="${l}"><summary><span class="fsk-rot">${rot}</span><span class="fsk-val" id="${id}-v${l}"></span></summary>
      <div class="fsk-painel"><div class="fsk-acoes"><button type="button" class="btn" data-todas="${l}">Marcar todas</button><button type="button" class="btn" data-nenhuma="${l}">Desmarcar todas</button></div>
      <div class="fsk-lista">${lista.map((x, k) => `<label><input type="checkbox" data-l="${l}" data-k="${k}" checked><span>${esc(x.nome)}</span><small class="num">${reais(x.v)}</small></label>`).join("")}</div></div></details>`).join("") + `<button type="button" class="btn btn-limpar" id="${id}-limpa">Limpar destaque</button>`;
    const g = $(`#${id}-g`);
    function aplica() {
      escondeTip();
      lados.forEach(([l, , lista]) => {
        wrap.querySelectorAll(`input[data-l="${l}"]`).forEach((c) => { c.checked = !sel[l] || sel[l].has(lista[Number(c.dataset.k)].nome); });
        $(`#${id}-v${l}`).textContent = !sel[l] ? `Todas (${lista.length})` : sel[l].size === 1 ? curto([...sel[l]][0], 34) : `${sel[l].size} de ${lista.length}`;
        wrap.querySelector(`details[data-l="${l}"]`).classList.toggle("ativo", !!sel[l]);
      });
      const filtrado = sel.e || sel.d;
      g.querySelectorAll("[data-lado]").forEach((n) => {
        const l = n.dataset.lado, on = !filtrado || (sel[l] ? sel[l].has(n.getAttribute("data-n")) : false);
        n.classList.toggle("apagado", !on);
        n.classList.toggle("aceso", !!filtrado && on);
      });
      $(`#${id}-limpa`).hidden = !filtrado;
      const soma = (l) => lados.find((x) => x[0] === l)[2].filter((x) => sel[l] && sel[l].has(x.nome)).reduce((s, x) => s + x.v, 0);
      $(`#${id}-res`).innerHTML = !filtrado ? `Use os filtros ou clique numa receita ou área para destacá-la.` :
        [sel.e ? `Receitas destacadas: <strong>${brl.format(soma("e"))}</strong> (${pct(soma("e") / info.total * 100)})` : "", sel.d ? `Destinos destacados: <strong>${brl.format(soma("d"))}</strong> (${pct(soma("d") / info.total * 100)})` : ""].filter(Boolean).join(" · ") +
        `. <span style="color:var(--ink-3)">O dinheiro passa pelo cofre do município, então não dá para ligar uma receita a uma área aqui. Para isso, use o diagrama 2, por fonte do recurso.</span>`;
    }
    wrap.querySelectorAll(".fsk-lista input").forEach((c) => c.addEventListener("change", () => {
      const l = c.dataset.l, lista = lados.find((x) => x[0] === l)[2];
      const m = new Set([...wrap.querySelectorAll(`input[data-l="${l}"]`)].filter((x) => x.checked).map((x) => lista[Number(x.dataset.k)].nome));
      sel[l] = m.size === lista.length ? null : m; aplica();
    }));
    wrap.querySelectorAll("[data-todas]").forEach((b) => b.addEventListener("click", () => { sel[b.dataset.todas] = null; aplica(); }));
    wrap.querySelectorAll("[data-nenhuma]").forEach((b) => b.addEventListener("click", () => { sel[b.dataset.nenhuma] = new Set(); aplica(); }));
    $(`#${id}-limpa`).addEventListener("click", () => { sel.e = sel.d = null; aplica(); });
    g.classList.add("clicavel");
    g.querySelectorAll("rect[data-lado], text[data-lado]").forEach((n) => n.addEventListener("click", () => {
      const l = n.dataset.lado, nome = n.getAttribute("data-n");
      sel[l] = sel[l] && sel[l].size === 1 && sel[l].has(nome) ? null : new Set([nome]); aplica();
    }));
    aplica();
  }

  // ------------------------------------------------------------ páginas especiais
  const ESPECIAIS = { "diarias": paginaDiarias, "gratificacoes": paginaGratificacoes, "horas-extras": paginaHorasExtras, "remuneracao": paginaRemuneracao };

  function topoEsp(titulo, intro, img) {
    return `<div class="esp-topo"><div><span class="fonte" style="font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--accent)">Página especial</span><h2>${titulo}</h2><p class="intro">${intro}</p></div><img class="lupa" src="img/${img}.webp" alt="Luposo"></div>`;
  }
  const tilesHtml = (t) => `<div class="grid-4">${t.map(([r, v, d]) => `<div class="tile"><span class="rot">${r}</span><span class="val num">${v}</span><span class="det">${d}</span></div>`).join("")}</div>`;
  const semDados = (txt) => `<p class="card vazio">${txt}</p>`;

  function colunas(alvo, valores, rotulos, cor, fmt) {
    const W = Math.max(320, Math.round(alvo.clientWidth) || 900), H = 240, m = { t: 22, r: 10, b: 28, l: 10 };
    const n = valores.length, max = Math.max(...valores, 1);
    const bw = (W - m.l - m.r) / n;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img">`;
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}" stroke="var(--line)"/>`;
    valores.forEach((v, i) => {
      const h = (v / max) * (H - m.t - m.b), x = m.l + i * bw + bw * 0.18, w = bw * 0.64, y = H - m.b - h;
      s += `<g class="col" data-i="${i}"><rect x="${m.l + i * bw}" y="${m.t}" width="${bw}" height="${H - m.t - m.b}" fill="transparent"/>`;
      s += `<path d="M${x},${H - m.b}V${y + 4}Q${x},${y} ${x + 4},${y}H${x + w - 4}Q${x + w},${y} ${x + w},${y + 4}V${H - m.b}Z" fill="${cor}"/>`;
      s += `<text x="${x + w / 2}" y="${y - 6}" text-anchor="middle" style="fill:var(--ink-2);font-weight:600">${fmt(v)}</text>`;
      s += `<text x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${esc(rotulos[i])}</text></g>`;
    });
    s += `</svg>`;
    alvo.innerHTML = s;
  }
  const fmtCurto = (v) => reais(v).replace("R$ ", "");

  // ============================================================ tabela com busca, filtros e ordenação
  // cfg: { linhas, colunas: [{ rot, dir, ord: (x) => valor, cel: (x) => html }], busca: { rot, ph, txt: (x) => texto },
  //        filtros: [{ rot, val: (x) => texto, todos, opcoes: [{ rot, fn }] }], ordem: { col, desc }, lim, resumo: (lista) => texto, vazio }
  const colador = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
  const dataISO = (s) => { if (!s) return null; let m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0]; m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (!m) { const MM = ["janeiro","fevereiro","marco","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"], t = semAcento(s).match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})/); if (t && MM.includes(t[2])) return `${t[3]}-${String(MM.indexOf(t[2]) + 1).padStart(2, "0")}-${t[1].padStart(2, "0")}`; return null; } const a = m[3].length === 2 ? "20" + m[3] : m[3]; return `${a}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; };
  let tiSeq = 0;
  function tabelaInterativa(box, cfg) {
    if (!box) return;
    const id = "ti" + ++tiSeq, L = cfg.linhas, passo = cfg.lim || 25;
    const F = (cfg.filtros || []).map((f, i) => {
      if (f.opcoes) return { ...f, i, html: f.opcoes.map((o, k) => `<option value="${k}">${esc(o.rot)}</option>`).join("") };
      const cont = new Map(); L.forEach((x) => { const v = f.val(x); if (v != null && v !== "") cont.set(v, (cont.get(v) || 0) + 1); });
      const vals = [...cont.keys()].sort(colador.compare);
      return { ...f, i, vals, html: `<option value="">${esc(f.todos || "Todos")}</option>` + vals.map((v, k) => `<option value="${k}">${esc(v)} (${nf0.format(cont.get(v))})</option>`).join("") };
    });
    const temCtrl = cfg.busca || F.length;
    box.innerHTML = `${temCtrl ? `<div class="filtros">${cfg.busca ? `<label for="${id}-q">${esc(cfg.busca.rot)}<input id="${id}-q" type="search" placeholder="${esc(cfg.busca.ph || "")}"></label>` : ""}${F.map((f) => `<label for="${id}-f${f.i}">${esc(f.rot)}<select id="${id}-f${f.i}">${f.html}</select></label>`).join("")}<button type="button" class="btn btn-limpar" id="${id}-limpa">Limpar filtros</button></div>` : ""}
      <div class="tabela-box"><table class="tabela-esp tabela-ord"><thead><tr>${cfg.colunas.map((c, k) => `<th${c.dir ? ' class="dir"' : ""}${c.ord ? ` aria-sort="none"` : ""}>${c.ord ? `<button type="button" class="ord" data-k="${k}" title="Clique para ordenar">${c.rot}<span class="seta" aria-hidden="true"></span></button>` : c.rot}</th>`).join("")}</tr></thead><tbody id="${id}-c"></tbody></table></div>
      <div class="ti-rodape"><p class="intro" id="${id}-r"></p><button type="button" class="btn" id="${id}-m">Mostrar mais</button></div>`;
    let ord = cfg.ordem ? { ...cfg.ordem } : null, lim = passo;
    const q$ = (s) => box.querySelector(s);
    function lista() {
      const q = cfg.busca ? semAcento(q$(`#${id}-q`).value.trim()) : "";
      let r = L.filter((x) => (!q || semAcento(cfg.busca.txt(x)).includes(q)) && F.every((f) => {
        const v = q$(`#${id}-f${f.i}`).value;
        if (f.opcoes) return !f.opcoes[v].fn || f.opcoes[v].fn(x);
        return v === "" || f.val(x) === f.vals[v];
      }));
      if (ord) {
        const fn = cfg.colunas[ord.col].ord, s = ord.desc ? -1 : 1;
        r = r.map((x) => [fn(x), x]).sort((a, b) => {
          const va = a[0], vb = b[0];
          if (va == null || va === "") return vb == null || vb === "" ? 0 : 1;
          if (vb == null || vb === "") return -1;
          return s * (typeof va === "number" && typeof vb === "number" ? va - vb : colador.compare(String(va), String(vb)));
        }).map((p) => p[1]);
      }
      return r;
    }
    function desenha() {
      const r = lista();
      q$(`#${id}-c`).innerHTML = r.slice(0, lim).map((x) => `<tr>${cfg.colunas.map((c) => `<td${c.dir ? ' class="dir num"' : ""}>${c.cel(x)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${cfg.colunas.length}">${esc(cfg.vazio || "Nada encontrado com esses filtros.")}</td></tr>`;
      q$(`#${id}-r`).textContent = cfg.resumo ? cfg.resumo(r) : `${nf0.format(r.length)} de ${nf0.format(L.length)} registros.`;
      q$(`#${id}-m`).hidden = r.length <= lim;
      box.querySelectorAll("th[aria-sort]").forEach((th) => { const k = Number(th.querySelector(".ord").dataset.k); th.setAttribute("aria-sort", ord && ord.col === k ? (ord.desc ? "descending" : "ascending") : "none"); });
    }
    box.querySelectorAll("button.ord").forEach((b) => b.addEventListener("click", () => {
      const k = Number(b.dataset.k);
      if (ord && ord.col === k) ord.desc = !ord.desc;
      else { const v = L.map(cfg.colunas[k].ord).find((x) => x != null && x !== ""); ord = { col: k, desc: typeof v === "number" }; }
      lim = passo; desenha();
    }));
    if (cfg.busca) q$(`#${id}-q`).addEventListener("input", () => { lim = passo; desenha(); });
    F.forEach((f) => q$(`#${id}-f${f.i}`).addEventListener("change", () => { lim = passo; desenha(); }));
    if (temCtrl) q$(`#${id}-limpa`).addEventListener("click", () => { if (cfg.busca) q$(`#${id}-q`).value = ""; F.forEach((f) => { q$(`#${id}-f${f.i}`).selectedIndex = 0; }); ord = cfg.ordem ? { ...cfg.ordem } : null; lim = passo; desenha(); });
    q$(`#${id}-m`).addEventListener("click", () => { lim += 50; desenha(); });
    desenha();
  }

  function paginaDiarias(el) {
    const di = A.diarias, ps = A.passagens;
    el.innerHTML = topoEsp("Diárias e passagens", "Diárias pagam hospedagem e alimentação de quem viaja a serviço. Passagens são compradas de agências e empresas de ônibus. Aqui você vê quem viajou, para onde, por quê e quanto custou.", "lupa-anotando");
    if (!di) { el.innerHTML += semDados(`Os dados de diárias de ${anoAtual} aparecem quando o arquivo de diárias do Tribunal de Contas desse ano for carregado.`); return; }
    const v = di.viagens, total = v.reduce((s, x) => s + x.valor, 0);
    const pessoas = new Map();
    v.forEach((x) => { const p = pessoas.get(x.nome) || { nome: x.nome, cargo: x.cargo, valor: 0, viagens: 0 }; p.valor += x.valor; p.viagens++; pessoas.set(x.nome, p); });
    const nDiarias = v.reduce((s, x) => s + x.diarias, 0);
    el.innerHTML += tilesHtml([
      ["Pago em diárias", reais(total), `${nf0.format(v.length)} viagens de janeiro a ${MESES_LONGO[A.meses - 1]} de ${anoAtual}.`],
      ["Pessoas que viajaram", nf0.format(pessoas.size), "Servidores, agentes políticos e conselheiros."],
      ["Valor médio por diária", brl.format(total / Math.max(nDiarias, 1)), `${nf0.format(nDiarias)} diárias no total.`],
      ["Pago em passagens", ps ? reais(ps.total) : "–", "Compradas de agências de viagem e empresas de ônibus."],
    ]);
    el.innerHTML += `<div class="card"><h3>Diárias por mês de início da viagem</h3><div class="colunas" id="d-mes"></div></div>
      <div class="grid-2"><div class="card"><h3>Para que foram as viagens</h3><div class="barras" id="d-tipo"></div>
        <p class="intro" style="font-size:.88rem">"Transporte de pacientes" são viagens de motoristas e equipes da saúde levando moradores para tratamento em outras cidades.</p></div>
        <div class="card"><h3>Destinos que mais receberam diárias</h3><div class="barras" id="d-dest"></div></div></div>
      <div class="grid-2"><div class="card"><h3>Quem mais recebeu diárias</h3><div class="barras" id="d-pess"></div></div>
        <div class="card"><h3>Onde as passagens foram compradas</h3><div class="barras" id="d-pass"></div></div></div>
      <div class="card"><h3>Todas as viagens</h3><div id="d-tab"></div>
        <p class="fonte">Fonte: ${esc(fonteTce().replace("Fonte: ", ""))}. ${di.canceladas ? di.canceladas + " diárias canceladas (pagamento estornado) foram retiradas. " : ""}O CPF aparece mascarado, como publicado pelo Tribunal de Contas.</p></div>`;
    const porMes = Array(A.meses).fill(0); v.forEach((x) => { const m = Number(x.inicio.slice(5, 7)) - 1; if (m < A.meses) porMes[m] += x.valor; });
    colunas($("#d-mes"), porMes, MESES.slice(0, A.meses), "var(--series-2)", fmtCurto);
    const agrupa = (fn) => { const m = new Map(); v.forEach((x) => m.set(fn(x), (m.get(fn(x)) || 0) + x.valor)); return [...m.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor); };
    barras($("#d-tipo"), agrupa((x) => x.tipo.replace(" não ligados ao TCE/PR", "").replace("Tribunal de Contas do Estado do Paraná  ", "TCE-PR: ")), "var(--series-2)", total);
    barras($("#d-dest"), agrupa((x) => x.destino || "Não informado").slice(0, 10), "var(--series-2)", total);
    barras($("#d-pess"), [...pessoas.values()].sort((a, b) => b.valor - a.valor).slice(0, 10).map((p) => ({ nome: p.nome + (p.cargo ? " (" + p.cargo + ")" : ""), valor: p.valor, explicacao: `${p.viagens} viagens` })), "var(--series-2)", null, { porHab: false });
    if (ps && ps.fornecedores.length) barras($("#d-pass"), ps.fornecedores.map((x) => ({ nome: x.nome, valor: x.valor })), "var(--series-1)", ps.total);
    const fmtData = (d) => d ? d.slice(8, 10) + "/" + d.slice(5, 7) : "";
    const tipoCurto = (x) => x.tipo.replace(" não ligados ao TCE/PR", "").replace("Tribunal de Contas do Estado do Paraná  ", "TCE-PR: ");
    tabelaInterativa($("#d-tab"), {
      linhas: v,
      busca: { rot: "Buscar por nome, cargo, destino ou motivo", ph: "Ex.: Brasília, enfermeiro, congresso", txt: (x) => [x.nome, x.cargo, x.destino, x.objetivo, x.tipo].join(" ") },
      filtros: [
        { rot: "Tipo de viagem", todos: "Todos os tipos", val: tipoCurto },
        { rot: "Destino", todos: "Todos os destinos", val: (x) => x.destino || "Não informado" },
        { rot: "Mês de início", todos: "Todos os meses", val: (x) => x.inicio ? MESES_LONGO[Number(x.inicio.slice(5, 7)) - 1] : "" },
        { rot: "Cargo", todos: "Todos os cargos", val: (x) => x.cargo || "" },
      ],
      colunas: [
        { rot: "Quem viajou", ord: (x) => x.nome, cel: (x) => `<strong>${esc(x.nome)}</strong><span class="doc">${esc(x.cargo || x.entidade)}</span>` },
        { rot: "Destino", ord: (x) => x.destino, cel: (x) => esc(x.destino || "Não informado") },
        { rot: "Período", ord: (x) => x.inicio, cel: (x) => `<span class="num">${fmtData(x.inicio)} a ${fmtDataBR(x.fim)}</span>` },
        { rot: "Motivo", ord: (x) => x.objetivo || x.tipo, cel: (x) => esc(x.objetivo || x.tipo) },
        { rot: "Diárias", dir: true, ord: (x) => x.diarias, cel: (x) => nf1.format(x.diarias) },
        { rot: "Valor", dir: true, ord: (x) => x.valor, cel: (x) => `<strong>${brl2.format(x.valor)}</strong>` },
      ],
      ordem: { col: 2, desc: true },
      resumo: (r) => `${nf0.format(r.length)} viagens, somando ${brl2.format(r.reduce((s, x) => s + x.valor, 0))}.`,
      vazio: "Nenhuma viagem encontrada.",
    });
  }

  const EXPLICA_FOLHA = {
    "Gratificação por exercício de funções": "Valor extra para quem assume chefia, coordenação ou outra função de confiança.",
    "Gratificação por tempo de serviço": "Acréscimo pago conforme os anos de serviço (anuênios, quinquênios).",
    "Outros adicionais, vantagens e gratificações": "Outras vantagens previstas em lei que não se encaixam nas categorias anteriores.",
    "Adicional de insalubridade": "Para quem trabalha exposto a agentes nocivos à saúde, comum em unidades de saúde.",
    "Adicional de periculosidade": "Para atividades de risco, como as da Guarda Municipal.",
    "Adicional de atividades penosas": "Para atividades desgastantes física ou emocionalmente.",
    "Adicional noturno": "Acréscimo para quem trabalha entre 22h e 5h, como em UPAs e na Guarda.",
    "Abono de permanência": "Devolução da contribuição previdenciária a quem já pode se aposentar e continua trabalhando.",
    "Horas extras (serviços extraordinários)": "Pagamento por horas trabalhadas além da jornada normal.",
  };
  const GRATIF = ["Gratificação por exercício de funções", "Gratificação por tempo de serviço", "Outros adicionais, vantagens e gratificações"];
  const ADIC = ["Adicional de insalubridade", "Adicional de periculosidade", "Adicional de atividades penosas", "Adicional noturno", "Abono de permanência"];

  function blocoComponente(el, nomes, cor, idp) {
    const C = A.componentes_folha;
    const itens = nomes.filter((n) => C[n]).map((n) => ({ nome: n, ...C[n] }));
    const total = itens.reduce((s, x) => s + x.total, 0);
    const mensal = Array(A.meses).fill(0); itens.forEach((x) => x.mensal.forEach((v, i) => (mensal[i] += v)));
    const orgao = new Map(); itens.forEach((x) => x.por_orgao.forEach((o) => orgao.set(o.nome, (orgao.get(o.nome) || 0) + o.valor)));
    return { itens, total, mensal, orgao: [...orgao.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor) };
  }

  function paginaGratificacoes(el) {
    el.innerHTML = topoEsp("Gratificações e adicionais", "Além do salário-base, a lei prevê valores extras para quem assume funções de chefia, trabalha em condições insalubres ou perigosas, à noite, ou continua trabalhando depois de poder se aposentar.", "lupa-prancheta");
    if (!A.componentes_folha) { el.innerHTML += semDados(`Os dados de ${anoAtual} aparecem quando os arquivos de despesa desse ano do Tribunal de Contas forem carregados.`); return; }
    const g = blocoComponente(el, GRATIF), a = blocoComponente(el, ADIC);
    el.innerHTML += tilesHtml([
      ["Gratificações pagas", reais(g.total), `De janeiro a ${MESES_LONGO[A.meses - 1]} de ${anoAtual}.`],
      ["Adicionais e abono pagos", reais(a.total), "Insalubridade, periculosidade, noturno, penosidade e abono de permanência."],
      ["Peso na folha", A.folha_pago ? pct((g.total + a.total) / A.folha_pago * 100) : "–", "Do total pago diretamente a servidores no período."],
    ]);
    el.innerHTML += `<div class="grid-2"><div class="card"><h3>Gratificações por tipo</h3><div class="barras" id="g-tipo"></div></div>
      <div class="card"><h3>Adicionais por tipo</h3><div class="barras" id="a-tipo"></div></div></div>
      <div class="card"><h3>Gratificações e adicionais por mês</h3><div class="colunas" id="g-mes"></div></div>
      <div class="grid-2"><div class="card"><h3>Gratificações por secretaria</h3><div class="barras" id="g-org"></div></div>
      <div class="card"><h3>Adicionais por secretaria</h3><div class="barras" id="a-org"></div></div></div>
      <p class="nota">Os arquivos do Tribunal de Contas mostram o total pago em cada tipo de gratificação, mas não quanto cada servidor recebeu. Esse detalhe está no contracheque, publicado na folha de pagamento do Portal da Transparência da Prefeitura, e entra aqui quando esses dados forem carregados.</p>
      <p class="fonte">Fonte: ${esc(fonteTce().replace("Fonte: ", ""))}. Valores pagos, classificados pela natureza da despesa (elemento 11).</p>`;
    barras($("#g-tipo"), g.itens.map((x) => ({ nome: x.nome, valor: x.total, explicacao: EXPLICA_FOLHA[x.nome] })), "var(--series-2)", g.total);
    barras($("#a-tipo"), a.itens.map((x) => ({ nome: x.nome, valor: x.total, explicacao: EXPLICA_FOLHA[x.nome] })), "var(--s3)", a.total);
    colunas($("#g-mes"), g.mensal.map((v, i) => v + a.mensal[i]), MESES.slice(0, A.meses), "var(--series-2)", fmtCurto);
    barras($("#g-org"), g.orgao.slice(0, 10), "var(--series-2)", g.total);
    barras($("#a-org"), a.orgao.slice(0, 10), "var(--s3)", a.total);
  }

  function paginaHorasExtras(el) {
    el.innerHTML = topoEsp("Horas extras", "Quando um servidor trabalha além da jornada, a Prefeitura paga serviço extraordinário. Horas extras frequentes podem indicar falta de pessoal ou má distribuição de escalas.", "lupa-pensando");
    const C = A.componentes_folha && A.componentes_folha["Horas extras (serviços extraordinários)"];
    if (!C) { el.innerHTML += semDados(`Os dados de ${anoAtual} aparecem quando os arquivos de despesa desse ano do Tribunal de Contas forem carregados.`); return; }
    const m = C.mensal, ini = m.find((x) => x > 0) || 0, fim = m[m.length - 1];
    const varia = ini ? (fim / ini - 1) * 100 : 0;
    const saude = C.por_orgao.find((o) => /Sa[úu]de/.test(o.nome));
    el.innerHTML += tilesHtml([
      ["Pago em horas extras", reais(C.total), `De janeiro a ${MESES_LONGO[A.meses - 1]} de ${anoAtual}.`],
      ["Média por mês", reais(C.total / A.meses), "Valor pago por mês, em média."],
      [`${MESES_LONGO[A.meses - 1][0].toUpperCase() + MESES_LONGO[A.meses - 1].slice(1)} contra janeiro`, (varia >= 0 ? "+" : "") + nf0.format(varia) + "%", `De ${reais(ini)} para ${reais(fim)} no mês.`],
      ["Fatia da Saúde", saude ? pct(saude.valor / C.total * 100) : "–", "Parte das horas extras paga pela Secretaria da Saúde."],
    ]);
    el.innerHTML += `<div class="card"><h3>Horas extras pagas por mês</h3><div class="colunas" id="h-mes"></div>
        ${varia > 30 ? `<p class="nota">O valor mensal de horas extras ${varia >= 100 ? "mais que dobrou" : "cresceu " + nf0.format(varia) + "%"} entre janeiro e ${MESES_LONGO[A.meses - 1]}. Vale perguntar à Prefeitura o motivo do aumento.</p>` : ""}</div>
      <div class="grid-2"><div class="card"><h3>Por secretaria</h3><div class="barras" id="h-org"></div></div>
      <div class="card"><h3>Por área de governo</h3><div class="barras" id="h-ent"></div></div></div>
      <p class="nota">Os arquivos do Tribunal de Contas trazem o total pago em horas extras, mas não quanto cada servidor recebeu nem quantas horas foram feitas. Esse detalhe está na folha de pagamento do Portal da Transparência da Prefeitura.</p>
      <p class="fonte">Fonte: ${esc(fonteTce().replace("Fonte: ", ""))}. Elemento de despesa 16, serviços extraordinários.</p>`;
    colunas($("#h-mes"), m, MESES.slice(0, A.meses), "var(--series-2)", fmtCurto);
    barras($("#h-org"), C.por_orgao.slice(0, 10), "var(--series-2)", C.total);
    barras($("#h-ent"), C.por_funcao.slice(0, 10).map((x) => ({ ...x, explicacao: FUNCOES[x.nome] })), "var(--series-1)", C.total);
  }

  function paginaRemuneracao(el) {
    const S = DADOS.servidores;
    el.innerHTML = topoEsp("Remuneração dos servidores", "Consulte quanto ganham os servidores da Prefeitura por cargo, vínculo e lotação. A remuneração de servidores públicos é informação pública, conforme a Lei de Acesso à Informação e decisão do Supremo Tribunal Federal.", "lupa-notebook");
    if (!S) { el.innerHTML += semDados("A planilha de servidores ainda não foi carregada."); return; }
    const L = S.lista.map((r) => ({ nome: r[0], cargo: r[1], vinculo: r[2], lotacao: r[4], situacao: r[5], carga: r[6], rem: r[7] || 0, adm: r[8], desl: r[9] }));
    const ativos = L.filter((x) => !/^Desligado/i.test(x.situacao));
    const comValor = ativos.filter((x) => x.rem > 0).map((x) => x.rem).sort((a, b) => a - b);
    const soma = comValor.reduce((s, x) => s + x, 0);
    const mediana = (arr) => { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b), k = Math.floor(s.length / 2); return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
    const pessoas = new Set(ativos.map((x) => x.nome)).size;
    const prefeito = L.find((x) => /^Prefeito Municipal/i.test(x.cargo) && !/^Desligado/i.test(x.situacao));
    const acima = prefeito ? ativos.filter((x) => x.rem > prefeito.rem) : [];
    el.innerHTML += tilesHtml([
      ["Vínculos em atividade", nf0.format(ativos.length), `${nf0.format(pessoas)} pessoas. Quem tem dois cargos (como professores com duas matrículas) conta duas vezes.`],
      ["Soma das remunerações brutas", reais(soma), "Total mensal bruto informado para os vínculos em atividade."],
      ["Remuneração bruta mediana", brl.format(mediana(comValor)), "Metade ganha menos que isso, metade ganha mais."],
      ["Remuneração bruta média", brl.format(soma / Math.max(comValor.length, 1)), "A média é puxada para cima pelos salários mais altos."],
    ]);
    const faixas = [[0, 3000, "até 3 mil"], [3000, 5000, "3 a 5 mil"], [5000, 8000, "5 a 8 mil"], [8000, 12000, "8 a 12 mil"], [12000, 20000, "12 a 20 mil"], [20000, 30000, "20 a 30 mil"], [30000, 1e9, "mais de 30 mil"]];
    el.innerHTML += `<div class="card"><h3>Quantos vínculos em cada faixa de remuneração</h3><div class="colunas" id="r-faixa"></div><p class="intro" style="font-size:.88rem">Valores mensais em reais. Considera só vínculos em atividade com remuneração informada.</p></div>
      <div class="grid-2"><div class="card"><h3>Remuneração mediana por tipo de vínculo</h3><div class="barras" id="r-vinc"></div></div>
      <div class="card"><h3>Remuneração bruta por cargo</h3><div id="r-cargos"></div></div></div>
      ${prefeito ? `<p class="nota">O subsídio do prefeito é ${brl2.format(prefeito.rem)}. ${nf0.format(acima.length)} vínculos têm remuneração informada acima desse valor, a maioria de ${esc(top3(acima))}. O subsídio do prefeito é o teto geral do município, mas há exceções: procuradores municipais seguem o teto dos desembargadores, por decisão do STF, e alguns valores, como férias, 13º e indenizações, ficam fora do teto. Só a análise do contracheque mostra se há irregularidade.</p>` : ""}
      <div class="card"><h3>Consultar servidores</h3><div id="r-tab"></div>
        <p class="nota"><strong>Remuneração bruta, sem descontos.</strong> O atual Portal da Transparência de Foz do Iguaçu ainda não permite usar as informações de descontos e de impostos retidos na fonte (como imposto de renda e contribuição previdenciária). Por isso, ainda não é possível informar a remuneração líquida de cada servidor.</p>
        <p class="fonte">Fonte: Portal da Transparência da Prefeitura de Foz do Iguaçu, planilha "Servidores" gerada em ${esc(S.gerado_em)}. Mostra a remuneração bruta informada para cada matrícula; não inclui CPF.</p></div>`;
    colunas($("#r-faixa"), faixas.map(([a, b]) => comValor.filter((x) => x >= a && x < b).length), faixas.map((f) => f[2]), "var(--series-1)", (v) => nf0.format(v));
    const porV = new Map(); ativos.forEach((x) => { if (x.rem > 0) { const a = porV.get(x.vinculo) || []; a.push(x.rem); porV.set(x.vinculo, a); } });
    barras($("#r-vinc"), [...porV.entries()].map(([k, a]) => ({ nome: `${k} (${nf0.format(a.length)})`, valor: mediana(a), explicacao: `${nf0.format(a.length)} vínculos. Média: ${brl.format(a.reduce((s, x) => s + x, 0) / a.length)}.` })).sort((a, b) => b.valor - a.valor), "var(--series-1)", null, { porHab: false });
    const porC = new Map(); ativos.forEach((x) => { if (x.rem > 0) { const a = porC.get(x.cargo) || []; a.push(x.rem); porC.set(x.cargo, a); } });
    tabelaInterativa($("#r-cargos"), {
      linhas: [...porC.entries()].map(([c, a]) => ({ cargo: c, n: a.length, med: mediana(a), max: Math.max(...a) })),
      busca: { rot: "Buscar cargo", ph: "Ex.: professor", txt: (x) => x.cargo },
      colunas: [
        { rot: "Cargo", ord: (x) => x.cargo, cel: (x) => esc(x.cargo) },
        { rot: "Vínculos", dir: true, ord: (x) => x.n, cel: (x) => nf0.format(x.n) },
        { rot: "Mediana bruta", dir: true, ord: (x) => x.med, cel: (x) => brl.format(x.med) },
        { rot: "Maior bruta", dir: true, ord: (x) => x.max, cel: (x) => brl.format(x.max) },
      ],
      ordem: { col: 1, desc: true }, lim: 15,
      resumo: (r) => `${nf0.format(r.length)} cargos com vínculos em atividade.`,
    });
    const desl = (x) => /^Desligado/i.test(x.situacao);
    tabelaInterativa($("#r-tab"), {
      linhas: L,
      busca: { rot: "Buscar por nome, cargo ou lotação", ph: "Ex.: professor, UPA, guarda", txt: (x) => x.nome + " " + x.cargo + " " + x.lotacao },
      filtros: [
        { rot: "Situação", opcoes: [{ rot: "Em atividade", fn: (x) => !desl(x) }, { rot: "Desligados", fn: desl }, { rot: "Todos" }] },
        { rot: "Vínculo", todos: "Todos os vínculos", val: (x) => x.vinculo },
        { rot: "Lotação", todos: "Todas as lotações", val: (x) => x.lotacao },
        { rot: "Cargo", todos: "Todos os cargos", val: (x) => x.cargo },
      ],
      colunas: [
        { rot: "Servidor", ord: (x) => x.nome, cel: (x) => `<strong>${esc(x.nome)}</strong><span class="doc">Admissão: ${esc(x.adm)}${x.desl ? " · Desligamento: " + esc(x.desl) : ""}</span>` },
        { rot: "Cargo e vínculo", ord: (x) => x.cargo, cel: (x) => `${esc(x.cargo)}<span class="doc">${esc(x.vinculo)}${x.carga ? " · " + nf0.format(x.carga) + "h semanais" : ""}</span>` },
        { rot: "Lotação", ord: (x) => x.lotacao, cel: (x) => esc(x.lotacao) },
        { rot: "Situação", ord: (x) => x.situacao, cel: (x) => esc(x.situacao) },
        { rot: "Remuneração bruta", dir: true, ord: (x) => x.rem, cel: (x) => `<strong>${brl2.format(x.rem)}</strong>` },
      ],
      ordem: { col: 4, desc: true },
      resumo: (r) => `${nf0.format(r.length)} vínculos encontrados. Soma da remuneração bruta: ${brl2.format(r.reduce((s, x) => s + x.rem, 0))}.`,
      vazio: "Nenhum servidor encontrado.",
    });
  }
  function top3(lista) {
    const m = new Map(); lista.forEach((x) => { const c = x.cargo.replace(/\s*\(.*\)$/, "").replace(/ Consultor$/, ""); m.set(c, (m.get(c) || 0) + 1); });
    const t = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${c.toLowerCase()} (${n})`);
    return t.length > 1 ? t.slice(0, -1).join(", ") + " e " + t[t.length - 1] : t.join("");
  }

  function rota() {
    const h = location.hash.replace("#", "");
    const mp = $("#menu-principal"); mp.classList.remove("aberto"); $("#menu-btn").setAttribute("aria-expanded", "false");
    mp.querySelectorAll(".tem-sub > button").forEach((x) => x.setAttribute("aria-expanded", "false"));
    const fn = ESPECIAIS[h];
    document.querySelectorAll(".menu a").forEach((a) => a.removeAttribute("aria-current"));
    const lk = document.querySelector(`.menu a[href="#${h}"]`); if (lk) lk.setAttribute("aria-current", "page");
    if (fn) {
      $("#pagina-principal").hidden = true; $("#pagina-especial").hidden = false;
      $("#slider").hidden = true; $("#pagina-titulo").hidden = false;
      $("#pt-trilha").textContent = "Contas Abertas de Foz · " + (TITULOS[h] || "");
      clearInterval(slTimer);
      fn($("#especial-conteudo"));
      document.title = (TITULOS[h] || "").replace(/^.*· /, "") + " · Contas Abertas de Foz";
      window.scrollTo(0, 0);
    } else {
      const estava = $("#pagina-principal").hidden;
      $("#pagina-principal").hidden = false; $("#pagina-especial").hidden = true;
      $("#slider").hidden = false; $("#pagina-titulo").hidden = true;
      document.title = "Contas Abertas de Foz do Iguaçu";
      if (estava) slAuto();
      const alvo = h && h !== "inicio" && document.getElementById(h);
      if (alvo) alvo.scrollIntoView(); else if (estava || h === "inicio") window.scrollTo(0, 0);
    }
  }


  // ============================================================ utilidades novas
  const T = () => (A && A.temas) || null;
  const pctN = (a, b) => (b ? (a / b) * 100 : 0);
  const fmtDataBR = (d) => (d && d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "–");
  const mesAno = (m) => { const [y, mm] = m.split("-"); return `${MESES[Number(mm) - 1]}/${y.slice(2)}`; };
  const cardHtml = (titulo, corpo, extra) => `<div class="card"${extra || ""}><h3>${titulo}</h3>${corpo}</div>`;

  // Gráfico de linhas genérico (uma escala só), com cruz e dica.
  function linhas(alvo, rotulos, series, fmt, opts) {
    opts = opts || {};
    const W = Math.max(320, Math.round(alvo.clientWidth) || opts.largura || 900), H = opts.altura || 280, m = { t: 16, r: W < 500 ? 88 : W < 700 ? 110 : 130, b: 30, l: W < 500 ? 52 : 64 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b, n = rotulos.length;
    const todos = series.flatMap((s) => s.valores.filter((v) => v != null));
    const maxV = Math.max(...todos, 1), minV = opts.zero === false ? Math.min(...todos) : 0;
    const passoBase = Math.pow(10, Math.floor(Math.log10((maxV - minV) / 4 || 1)));
    const passo = [1, 2, 2.5, 5, 10].map((k) => k * passoBase).find((p) => (maxV - minV) / p <= 5) || passoBase * 10;
    const base = opts.zero === false ? Math.floor(minV / passo) * passo : 0;
    const topo = Math.ceil(maxV / passo) * passo;
    const x = (i) => m.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = (v) => m.t + ih - ((v - base) / (topo - base || 1)) * ih;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.rotulo || "Gráfico de linhas")}">`;
    for (let v = base; v <= topo + passo / 1000; v += passo) {
      s += `<line x1="${m.l}" x2="${m.l + iw}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
    }
    const salto = Math.ceil(n / Math.max(3, Math.floor((W - 200) / 62)));
    rotulos.forEach((r, i) => { if (i % salto === 0 || (i === n - 1 && (n - 1) % salto >= salto / 2)) s += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(r)}</text>`; });
    const fim = [];
    series.forEach((se) => {
      let d = "", pen = false;
      se.valores.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
      s += `<path d="${d}" fill="none" stroke="${se.cor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"${se.tracejado ? ' stroke-dasharray="6 5"' : ""}/>`;
      let ul = se.valores.length - 1; while (ul > 0 && se.valores[ul] == null) ul--;
      s += `<circle cx="${x(ul)}" cy="${y(se.valores[ul])}" r="4.5" fill="${se.cor}" stroke="var(--surface)" stroke-width="2"/>`;
      fim.push({ y: y(se.valores[ul]), nome: se.nome, x: x(ul) });
    });
    fim.sort((a, b) => a.y - b.y);
    for (let i = 1; i < fim.length; i++) if (fim[i].y - fim[i - 1].y < 15) fim[i].y = fim[i - 1].y + 15;
    fim.forEach((f) => { s += `<text x="${f.x + 10}" y="${f.y + 4}" style="fill:var(--ink-2);font-weight:600">${esc(f.nome)}</text>`; });
    s += `<line class="cz" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" stroke="var(--ink-3)" stroke-dasharray="3 3" style="display:none"/>`;
    s += `<rect class="hit" x="${m.l - 10}" y="${m.t}" width="${iw + 20}" height="${ih}" fill="transparent"/></svg>`;
    alvo.innerHTML = s;
    alvo.classList.add("graf-linha");
    const svg = alvo.querySelector("svg"), hit = alvo.querySelector(".hit"), cz = alvo.querySelector(".cz");
    hit.addEventListener("mousemove", (e) => {
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const p = pt.matrixTransform(svg.getScreenCTM().inverse());
      const i = Math.max(0, Math.min(n - 1, Math.round(((p.x - m.l) / iw) * (n - 1))));
      cz.setAttribute("x1", x(i)); cz.setAttribute("x2", x(i)); cz.style.display = "";
      mostraTip(e, `<strong>${esc(rotulos[i])}</strong>` + series.map((se) => se.valores[i] == null ? "" : `<br><span class="marca" style="background:${se.cor}"></span>${esc(se.nome)}: ${(opts.fmtTip || fmt)(se.valores[i])}`).join(""));
    });
    hit.addEventListener("mouseleave", () => { cz.style.display = "none"; escondeTip(); });
  }
  const legenda = (series) => `<div class="legenda">${series.map((s) => `<span><i class="marca" style="background:${s.cor}"></i>${esc(s.nome)}</span>`).join("")}</div>`;

  // Sankey genérico em colunas: fluxos = [{caminho: [n0, n1, n2], v}]
  const PAL = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"];
  function sankeyMulti(box, fluxos, opts) {
    opts = opts || {};
    const nEt = fluxos[0] ? fluxos[0].caminho.length : 0;
    const maxNos = opts.maxNos || [8, 8, 8];
    // agrupa nós pequenos em "Outros" em cada etapa
    for (let e = 0; e < nEt; e++) {
      const tot = new Map(); fluxos.forEach((f) => tot.set(f.caminho[e], (tot.get(f.caminho[e]) || 0) + f.v));
      const manter = new Set([...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxNos[e] || 8).map((x) => x[0]));
      const agrup = new Set();
      fluxos.forEach((f) => { if (!manter.has(f.caminho[e])) { agrup.add(f.caminho[e]); f.caminho[e] = (opts.outros && opts.outros[e]) || "Outros"; } });
      if (opts.agrupados) opts.agrupados[e] = [...agrup];
    }
    const etapas = [];
    for (let e = 0; e < nEt; e++) {
      const mp = new Map();
      fluxos.forEach((f) => mp.set(f.caminho[e], (mp.get(f.caminho[e]) || 0) + f.v));
      etapas.push([...mp.entries()].map(([nome, v]) => ({ nome, v, e })).sort((a, b) => (/^Outr/.test(a.nome) ? 1 : 0) - (/^Outr/.test(b.nome) ? 1 : 0) || b.v - a.v));
    }
    const total = etapas[0].reduce((s, x) => s + x.v, 0);
    const W = 1120, gap = 10, topo = opts.titulos ? 30 : 12;
    const maxN = Math.max(...etapas.map((e) => e.length));
    const H = Math.max(opts.altura || 0, 120 + maxN * 40);
    const nodeW = 14;
    const xs = nEt === 2 ? [330, 780] : [290, 585, 862];
    const k = (H - topo * 2 - gap * (maxN - 1)) / total;
    etapas.forEach((lista, e) => {
      lista.forEach((n, i) => { n.cor = e === 0 ? (/^Outr/.test(n.nome) ? "var(--s8)" : PAL[i % PAL.length]) : /^Diferen/.test(n.nome) ? "var(--s8)" : (e === nEt - 1 ? "var(--accent)" : "var(--ink-3)"); });
      const alt = lista.reduce((s, x) => s + Math.max(2, x.v * k), 0) + gap * (lista.length - 1);
      let y = topo + (H - topo * 2 - alt) / 2;
      lista.forEach((n) => { n.h = Math.max(2, n.v * k); n.y = y; n.oOut = 0; n.oIn = 0; y += n.h + gap; });
    });
    const idx = etapas.map((l) => new Map(l.map((n) => [n.nome, n])));
    // cor dos fluxos herdada da etapa 0
    const links = [];
    for (let e = 0; e < nEt - 1; e++) {
      const mp = new Map();
      fluxos.forEach((f) => {
        const ch = f.caminho[e] + "\u0001" + f.caminho[e + 1] + "\u0001" + (e === 0 ? "" : f.caminho[0]);
        mp.set(ch, (mp.get(ch) || 0) + f.v);
      });
      const ls = [...mp.entries()].map(([ch, v]) => { const [a, b, o] = ch.split("\u0001"); return { a: idx[e].get(a), b: idx[e + 1].get(b), o: o ? idx[0].get(o) : idx[e].get(a), v }; });
      ls.sort((p, q) => p.a.y - q.a.y || p.b.y - q.b.y || p.o.y - q.o.y);
      ls.forEach((l) => { l.y0 = l.a.y + l.a.oOut; l.a.oOut += l.v * k; });
      ls.slice().sort((p, q) => p.b.y - q.b.y || p.a.y - q.a.y || p.o.y - q.o.y).forEach((l) => { l.y1 = l.b.y + l.b.oIn; l.b.oIn += l.v * k; });
      ls.forEach((l) => { l.x0 = xs[e] + nodeW; l.x1 = xs[e + 1]; l.h = l.v * k; links.push(l); });
    }
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.rotulo || "Diagrama de fluxo")}">`;
    links.forEach((l, j) => {
      const xm = (l.x0 + l.x1) / 2;
      s += `<path class="lk" data-j="${j}" d="M${l.x0},${l.y0}C${xm},${l.y0} ${xm},${l.y1} ${l.x1},${l.y1}L${l.x1},${l.y1 + l.h}C${xm},${l.y1 + l.h} ${xm},${l.y0 + l.h} ${l.x0},${l.y0 + l.h}Z" fill="${l.o.cor}" opacity=".3"/>`;
    });
    etapas.forEach((lista, e) => lista.forEach((n) => {
      const at = opts.onNo ? ` data-e="${e}" data-n="${esc(n.nome)}"` : "";
      s += `<rect class="no" x="${xs[e]}" y="${n.y}" width="${nodeW}" height="${n.h}" rx="2" fill="${n.cor}"${at}/>`;
      const txt = `${esc(curto(n.nome, e === 0 ? 30 : e === nEt - 1 ? 32 : 24))} <tspan class="v">${reais(n.v)}</tspan>`;
      if (e === 0) s += `<text class="no" x="${xs[e] - 8}" y="${n.y + n.h / 2 + 4}" text-anchor="end"${at}>${txt}</text>`;
      else s += `<text class="no${e < nEt - 1 ? " meio" : ""}" x="${xs[e] + nodeW + 8}" y="${n.y + n.h / 2 + 4}"${at}>${txt}</text>`;
    }));
    if (opts.titulos) opts.titulos.forEach((t, e) => { s += `<text x="${xs[e] + nodeW / 2}" y="14" text-anchor="middle" style="font-weight:800;fill:var(--ink-3);font-size:11px;text-transform:uppercase;letter-spacing:.06em">${esc(t)}</text>`; });
    s += `</svg>`;
    box.innerHTML = s;
    box.classList.add("sankey-box");
    box.querySelectorAll("path.lk").forEach((p) => {
      const l = links[Number(p.dataset.j)];
      ligaTip(p, `<strong>${esc(l.a.nome)} → ${esc(l.b.nome)}</strong><br>${brl.format(l.v)} · ${pct(l.v / total * 100)} do total` + (nEt > 2 && l.o !== l.a ? `<br><span style="opacity:.85">Origem: ${esc(l.o.nome)}</span>` : ""));
    });
    if (opts.onNo) {
      box.classList.add("clicavel");
      box.querySelectorAll("[data-n]").forEach((n) => {
        const nome = n.getAttribute("data-n"), e = Number(n.dataset.e), no = idx[e].get(nome);
        ligaTip(n, `<strong>${esc(nome)}</strong><br>${brl.format(no.v)} · ${pct(no.v / total * 100)} do total<br><span style="opacity:.85">${/^Outr/.test(nome) ? "Clique para abrir os itens agrupados aqui." : "Clique para ver só este item."}</span>`);
        n.addEventListener("click", () => opts.onNo(e, nome));
      });
    }
  }

  // Sankey com filtros por etapa: cada etapa ganha um seletor com caixas de marcar;
  // clicar num nó do diagrama filtra por ele (ou abre o grupo "Outros").
  let skSeq = 0;
  function sankeyFiltravel(box, fluxosTodos, opts) {
    const id = "sk" + ++skSeq, nEt = fluxosTodos[0].caminho.length, tits = opts.titulos || [];
    const totalGeral = fluxosTodos.reduce((s, f) => s + f.v, 0);
    const opcoes = [];
    for (let e = 0; e < nEt; e++) {
      const mp = new Map(); fluxosTodos.forEach((f) => mp.set(f.caminho[e], (mp.get(f.caminho[e]) || 0) + f.v));
      opcoes.push([...mp.entries()].sort((a, b) => b[1] - a[1]));
    }
    const sel = opcoes.map(() => null); // null = todas
    box.innerHTML = `<div class="sk-filtros">${opcoes.map((op, e) => `<details class="fsk" data-e="${e}"><summary><span class="fsk-rot">${esc(tits[e] || "Etapa " + (e + 1))}</span><span class="fsk-val" id="${id}-v${e}"></span></summary>
        <div class="fsk-painel"><div class="fsk-acoes"><button type="button" class="btn" data-todas="${e}">Marcar todas</button><button type="button" class="btn" data-nenhuma="${e}">Desmarcar todas</button></div>
        <div class="fsk-lista">${op.map(([n, v], k) => `<label><input type="checkbox" data-e="${e}" data-k="${k}" checked><span>${esc(n)}</span><small class="num">${reais(v)}</small></label>`).join("")}</div></div></details>`).join("")}
      <button type="button" class="btn btn-limpar" id="${id}-limpa">Limpar filtros</button></div>
      <p class="sk-resumo" id="${id}-res"></p><div id="${id}-g"></div>`;
    const q$ = (x) => box.querySelector(x);
    function sincroniza() {
      opcoes.forEach((op, e) => {
        box.querySelectorAll(`input[data-e="${e}"]`).forEach((c) => { c.checked = !sel[e] || sel[e].has(op[Number(c.dataset.k)][0]); });
        const n = sel[e] ? sel[e].size : op.length;
        q$(`#${id}-v${e}`).textContent = !sel[e] ? `Todas (${op.length})` : n === 1 ? curto([...sel[e]][0], 34) : `${n} de ${op.length}`;
        q$(`details[data-e="${e}"]`).classList.toggle("ativo", !!sel[e]);
      });
    }
    function desenha() {
      escondeTip(); sincroniza();
      const fl = fluxosTodos.filter((f) => f.caminho.every((c, e) => !sel[e] || sel[e].has(c))).map((f) => ({ caminho: f.caminho.slice(), v: f.v }));
      const tot = fl.reduce((s, f) => s + f.v, 0), filtrado = sel.some(Boolean);
      q$(`#${id}-limpa`).hidden = !filtrado;
      q$(`#${id}-res`).innerHTML = filtrado ? `Mostrando <strong>${brl.format(tot)}</strong> de ${brl.format(totalGeral)} (${pct(tot / totalGeral * 100)} do total).` : `Total: <strong>${brl.format(totalGeral)}</strong>. Use os filtros acima ou clique num item do diagrama para focar nele.`;
      if (!fl.length) { q$(`#${id}-g`).innerHTML = semDados("Nenhum valor com essa combinação de filtros."); return; }
      const agrupados = [];
      sankeyMulti(q$(`#${id}-g`), fl, { ...opts, agrupados, onNo: (e, nome) => {
        if (/^Outr/.test(nome) && agrupados[e] && agrupados[e].length) sel[e] = new Set(agrupados[e]);
        else if (sel[e] && sel[e].size === 1 && sel[e].has(nome)) sel[e] = null;
        else sel[e] = new Set([nome]);
        desenha();
      } });
    }
    box.querySelectorAll(".fsk-lista input").forEach((c) => c.addEventListener("change", () => {
      const e = Number(c.dataset.e), op = opcoes[e];
      const marcados = new Set([...box.querySelectorAll(`input[data-e="${e}"]`)].filter((x) => x.checked).map((x) => op[Number(x.dataset.k)][0]));
      sel[e] = marcados.size === op.length ? null : marcados;
      desenha();
    }));
    box.querySelectorAll("[data-todas]").forEach((b) => b.addEventListener("click", () => { sel[Number(b.dataset.todas)] = null; desenha(); }));
    box.querySelectorAll("[data-nenhuma]").forEach((b) => b.addEventListener("click", () => { sel[Number(b.dataset.nenhuma)] = new Set(); desenha(); }));
    q$(`#${id}-limpa`).addEventListener("click", () => { sel.fill(null); box.querySelectorAll("details.fsk").forEach((d) => d.open = false); desenha(); });
    desenha();
  }
  document.addEventListener("click", (ev) => { document.querySelectorAll("details.fsk[open]").forEach((d) => { if (!d.contains(ev.target)) d.open = false; }); });
  const fluxosDe = (linhasF, cols, filtro) => linhasF.filter((r) => !filtro || filtro(r)).map((r) => ({ caminho: cols.map((c) => r[c]), v: r[4] }));
  const COL = { fonte: 0, funcao: 1, subfuncao: 2, natureza: 3 };

  // ============================================================ página: o caminho do dinheiro
  function paginaCaminho(el) {
    el.innerHTML = topoEsp("O caminho do dinheiro", "Cada diagrama segue o dinheiro de uma origem até onde ele foi gasto. A espessura das faixas é proporcional ao valor. Passe o mouse ou toque nas faixas para ver os valores.", "lupa-acenando");
    el.innerHTML += `<div class="card"><h3>1. Visão geral: de onde vem e para onde vai</h3><p class="intro">Todas as receitas do período à esquerda; as áreas de governo que receberam os pagamentos à direita.</p><div id="cd-geral"></div><p class="intro" id="cd-geral-nota" style="font-size:.88rem"></p><p class="fonte" id="cd-geral-fonte"></p></div>`;
    const t = T();
    if (!t) { el.innerHTML += semDados(`Os demais diagramas usam os empenhos e pagamentos do Tribunal de Contas, ainda não carregados para ${anoAtual}.`); sankeyGeralFiltravel($("#cd-geral"), $("#cd-geral-nota"), $("#cd-geral-fonte")); return; }
    const L = t.fluxos.linhas;
    const fonteTxt = `<p class="fonte">${esc(fonteTce())} A fonte de recurso é a que a Prefeitura informou em cada empenho.</p>`;
    const blocos = [
      ["2. Fonte do recurso → área → tipo de gasto", "A Prefeitura identifica em cada despesa de qual \"conta\" saiu o dinheiro: recursos livres, verbas da saúde, Fundeb, royalties e outras. Aqui você vê como cada fonte foi usada.", "cd-fonte", () => fluxosDe(L, [COL.fonte, COL.funcao, COL.natureza]), { titulos: ["Fonte", "Área", "Tipo de gasto"], maxNos: [9, 8, 7] }],
      ["3. Saúde: de onde vem e como é gasto", "As fontes que pagaram as despesas da área de Saúde, as ações (atenção básica, hospitais, vigilância) e o tipo de gasto.", "cd-saude", () => fluxosDe(L, [COL.fonte, COL.subfuncao, COL.natureza], (r) => r[1] === "Saúde"), { titulos: ["Fonte", "Ação", "Tipo de gasto"], maxNos: [6, 7, 7] }],
      ["4. Educação: de onde vem e como é gasto", "Fundeb, impostos vinculados à educação e repasses federais, e onde foram usados.", "cd-educ", () => fluxosDe(L, [COL.fonte, COL.subfuncao, COL.natureza], (r) => r[1] === "Educação"), { titulos: ["Fonte", "Ação", "Tipo de gasto"], maxNos: [6, 7, 7] }],
      ["5. Royalties de Itaipu: para onde foram", "Os royalties pagos pela Itaipu Binacional são uma das principais receitas próprias de Foz. Veja as áreas e quem recebeu.", "cd-roy", () => t.royalties_credores.map((r) => ({ caminho: [r[0], r[1]], v: r[2] })), { titulos: ["Área", "Quem recebeu"], maxNos: [7, 10] }],
      ["6. Recursos livres: as escolhas da Prefeitura", "Os recursos livres (e os desvinculados pela DRM) não têm destino obrigatório. Mostram as prioridades da gestão.", "cd-livres", () => fluxosDe(L, [COL.fonte, COL.funcao, COL.natureza], (r) => /livres|desvinculados/i.test(r[0])), { titulos: ["Fonte", "Área", "Tipo de gasto"], maxNos: [2, 9, 7] }],
    ];
    blocos.forEach(([tit, txt, id]) => { el.innerHTML += `<div class="card"><h3>${tit}</h3><p class="intro">${txt}</p><div id="${id}"></div>${fonteTxt}</div>`; });
    sankeyGeralFiltravel($("#cd-geral"), $("#cd-geral-nota"), $("#cd-geral-fonte"));
    blocos.forEach(([, , id, gera, o]) => { const f = gera(); if (f.length) sankeyFiltravel($("#" + id), f, o); else $("#" + id).innerHTML = semDados("Sem dados para este diagrama."); });
  }

  // ============================================================ página: Câmara
  const DE_OLHO_CAMARA = "https://app.powerbi.com/view?r=eyJrIjoiYmQ1Nzg0NjctYzM1My00YzY2LWFjZDEtNGMyOTY5MTFjN2NjIiwidCI6IjU2ODcyMjU4LTc5ZDUtNDU1OC05MTAwLTExODBjN2JlYjUyZSJ9";
  function paginaCamara(el) {
    const C = DADOS.camara;
    el.innerHTML = topoEsp("Câmara de Vereadores", "Quanto custa o Poder Legislativo de Foz do Iguaçu, como o dinheiro é usado e como Foz se compara às 24 maiores cidades do Paraná.", "lupa-pensando");
    if (!C) { el.innerHTML += semDados("Os dados da Câmara ainda não foram carregados."); return; }
    const comp = C.comparativo.map((c) => ({ ...c, cad_mes: c.despesa / c.cadeiras / C.meses_comparacao, hab: c.despesa / c.populacao }));
    const med = (arr) => { const s = arr.slice().sort((a, b) => a - b), k = Math.floor(s.length / 2); return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
    const foz = comp.find((c) => /Foz/.test(c.municipio));
    const rank = (campo) => comp.slice().sort((a, b) => b[campo] - a[campo]).findIndex((c) => c === foz) + 1;
    const ult = C.anual[C.anual.length - 1];
    el.innerHTML += tilesHtml([
      ["Custo por cadeira, por mês", brl.format(foz.cad_mes), `${rank("cad_mes")}º maior entre ${comp.length} câmaras do Paraná. Mediana: ${brl.format(med(comp.map((c) => c.cad_mes)))}.`],
      ["Custo por habitante", brl2.format(foz.hab), `Em ${C.periodo_comparacao}. ${rank("hab")}º maior entre ${comp.length}.`],
      [`Repasses recebidos em ${ult.ano}`, reais(ult.repasses), `${ult.periodo}. Dinheiro que a Prefeitura transfere à Câmara.`],
      [`Despesa paga em ${ult.ano}`, reais(ult.pago), `${pct(pctN(ult.pago, ult.repasses))} dos repasses do período.`],
    ]);
    el.innerHTML += `<div class="card"><h3>Repasses recebidos e despesas pagas, ano a ano</h3><div id="cm-anual"></div>
        <p class="intro" style="font-size:.88rem">A diferença entre repasses e despesas não é, por si só, sobra de caixa: parte é devolvida à Prefeitura no fim do ano e parte cobre restos a pagar. ${ult.ano} vai só até ${ult.periodo.replace(/^Jan–/, "")}.</p><p class="fonte">Fonte: ${esc(C.fonte_anual)}.</p></div>
      <div class="card"><h3>Para onde vão os recursos (${esc(C.periodo_comparacao)})</h3><div id="cm-sankey"></div><p class="intro" style="font-size:.88rem">O ramo cinza é a diferença entre o que a Câmara recebeu e o que gastou. Não é saldo de caixa nem economia: não considera saldos iniciais, restos a pagar e devoluções.</p></div>
      <div class="card"><h3>Composição da despesa liquidada</h3><div class="barras" id="cm-grupos"></div><p class="intro" style="font-size:.88rem">Os subsídios dos 15 vereadores são uma parte pequena. A maior fatia é a folha dos servidores da Câmara.</p></div>
      <div class="card"><h3>Comparação com as 24 maiores cidades do Paraná</h3>
        <div class="chips" role="group" aria-label="Indicador"><button type="button" class="chip" data-ind="cad_mes" aria-pressed="true">Custo por cadeira/mês</button><button type="button" class="chip" data-ind="hab" aria-pressed="false">Custo por habitante</button><button type="button" class="chip" data-ind="despesa" aria-pressed="false">Despesa total</button></div>
        <div class="barras" id="cm-comp"></div>
        <p class="nota">O custo por cadeira divide toda a despesa da Câmara pelas vagas de vereador. Não é o salário de um vereador nem o gasto de um gabinete. Os rankings, sozinhos, não medem produtividade, qualidade nem irregularidade.</p>
        <p class="fonte">Fonte: ${esc(C.fonte_comparativo)}</p></div>
      <div class="card"><h3>Quanto custa cada cadeira nas câmaras do Paraná</h3><p class="intro">Cada bolha é uma cidade. Mais à direita, maior o custo mensal por cadeira; mais acima, mais vereadores. O tamanho da bolha acompanha o custo por cadeira.</p><div id="cm-disp"></div><p class="fonte">Custo por cadeira = despesa liquidada de ${esc(C.periodo_comparacao)} ÷ número de vereadores ÷ ${C.meses_comparacao} meses. Fonte: ${esc(C.fonte_comparativo)}</p></div>
      <div class="card"><h3>Repasses e despesas por mês em ${esc(C.periodo_comparacao)}</h3>${legenda([{ nome: "Repasses recebidos", cor: "var(--series-1)" }, { nome: "Despesa liquidada", cor: "var(--series-2)" }])}<div id="cm-mensal"></div></div>
      <div class="card"><h3>Principais despesas por natureza em <span id="cm-nat-ano"></span></h3><div class="barras" id="cm-nat"></div></div>
      <a class="foco-obra" href="${DE_OLHO_CAMARA}" target="_blank" rel="noopener"><div><span class="fo-tag">Ferramenta do OSB Foz do Iguaçu</span><strong class="fo-tit">DE OLHO NA CÂMARA</strong><span class="fo-txt">Painel do Observatório com o acompanhamento detalhado da Câmara Municipal de Foz do Iguaçu.</span><span class="fo-btn">Abrir o De Olho na Câmara ↗</span></div><img src="img/lupa-pensando.webp" alt=""></a>`;
    linhas($("#cm-anual"), C.anual.map((a) => String(a.ano) + (a.periodo !== "Jan–dez" ? "*" : "")), [
      { nome: "Repasses", valores: C.anual.map((a) => a.repasses), cor: "var(--series-1)" },
      { nome: "Despesa paga", valores: C.anual.map((a) => a.pago), cor: "var(--series-2)" },
    ], fmtCurto, { rotulo: "Repasses e despesas da Câmara por ano" });
    const E = C.foz_estagios, totG = C.foz_grupos.reduce((s, g) => s + g[1], 0);
    sankeyMulti($("#cm-sankey"), C.foz_grupos.map((g) => ({ caminho: ["Repasses da Prefeitura", g[0]], v: g[1] })).concat([{ caminho: ["Repasses da Prefeitura", "Diferença (não é saldo de caixa)"], v: E.repasses - totG }]), { maxNos: [1, 9], titulos: ["Recebido", "Usado"] });
    barras($("#cm-grupos"), C.foz_grupos.map((g) => ({ nome: g[0], valor: g[1] })).sort((a, b) => b.valor - a.valor), "var(--series-2)", totG, { porHab: false });
    const desenhaComp = (campo) => {
      const fm = campo === "hab" ? (v) => brl2.format(v) : (v) => reais(v);
      const lista = comp.slice().sort((a, b) => b[campo] - a[campo]);
      const max = lista[0][campo];
      $("#cm-comp").innerHTML = lista.map((c, i) => `<div class="barra"${/Foz/.test(c.municipio) ? ' style="background:var(--accent-soft)"' : ""}><span class="nome">${i + 1}. ${esc(c.municipio)}${/Foz/.test(c.municipio) ? " <strong>◀</strong>" : ""}</span><span class="trilho"><span class="preench" style="display:block;width:${(c[campo] / max * 100).toFixed(1)}%;background:${/Foz/.test(c.municipio) ? "var(--series-2)" : "var(--s8)"}"></span></span><span class="valor num">${fm(c[campo])}<small>${c.cadeiras} cadeiras</small></span></div>`).join("");
    };
    desenhaComp("cad_mes");
    const medCad = med(comp.map((c) => c.cad_mes));
    dispersao($("#cm-disp"), comp.map((c) => ({ x: c.cad_mes / 1000, y: c.cadeiras, r: c.cad_mes, rotulo: c.municipio + (/Foz/.test(c.municipio) && $("#cm-disp").clientWidth > 600 ? ` · ${reais(c.cad_mes)}/mês` : ""), destaque: /Foz/.test(c.municipio),
      tip: `<strong>${esc(c.municipio)}</strong><br>${brl.format(c.cad_mes)} por cadeira, por mês<br>${c.cadeiras} vereadores · ${nf0.format(c.populacao)} habitantes<br>${brl2.format(c.hab)} por habitante no período` })),
      { xZero: true, yMin: 6, yMax: 40, tituloX: "Custo médio por cadeira, por mês (R$ mil)", tituloY: "Número de vereadores", fmtX: (v) => nf0.format(v), fmtY: (v) => nf0.format(v), altura: 480, rMax: 20,
        linhas: [{ x: medCad / 1000, rotulo: $("#cm-disp").clientWidth > 600 ? `Mediana das ${comp.length} cidades: ${reais(medCad)}/mês` : `Mediana: ${reais(medCad)}` }], rotulo: "Custo por cadeira e número de vereadores nas câmaras do Paraná" });
    el.querySelectorAll(".chip[data-ind]").forEach((b) => b.addEventListener("click", () => { el.querySelectorAll(".chip[data-ind]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); desenhaComp(b.dataset.ind); }));
    linhas($("#cm-mensal"), MESES.slice(0, C.foz_mensal.liquidado.length), [
      { nome: "Repasses", valores: C.foz_mensal.repasses, cor: "var(--series-1)" },
      { nome: "Despesa liquidada", valores: C.foz_mensal.liquidado, cor: "var(--series-2)" },
    ], fmtCurto);
    const anosNat = Object.keys(C.natureza_anual).sort();
    const an = anosNat[anosNat.length - 1];
    $("#cm-nat-ano").textContent = an;
    const nat = C.natureza_anual[an], totN = nat.reduce((s, x) => s + x[1], 0);
    barras($("#cm-nat"), nat.slice(0, 10).map((x) => ({ nome: capitalizaTxt(x[0]), valor: x[1] })), "var(--series-2)", totN, { porHab: false });
  }
  function capitalizaTxt(s) { s = String(s).toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }

  // ============================================================ página: transporte coletivo
  function paginaTransporte(el) {
    const R = DADOS.transporte;
    el.innerHTML = topoEsp("Transporte coletivo", "Quanto custa o ônibus em Foz, quem paga a conta e como o sistema vem mudando. Os dados vêm das prestações de contas mensais do sistema e da análise do OSB sobre o novo edital de concessão.", "lupa-anotando");
    if (!R) { el.innerHTML += semDados("Os dados do transporte coletivo ainda não foram carregados."); return; }
    const M = R.mensal, ult = M[M.length - 1], anoU = ult.mes.slice(0, 4);
    const doAno = (a) => M.filter((m) => m.mes.startsWith(a));
    const soma = (lista, c) => lista.reduce((s, m) => s + m[c], 0);
    const A1 = doAno(anoU), A0 = doAno(String(Number(anoU) - 1)).slice(0, A1.length);
    const varPct = (c) => pctN(soma(A1, c) - soma(A0, c), soma(A0, c));
    const sinal = (v) => (v >= 0 ? "+" : "") + nf1.format(v) + "%";
    el.innerHTML += tilesHtml([
      [`Custo do sistema em ${anoU}`, reais(soma(A1, "custo_total")), `${A1.length} meses. ${sinal(varPct("custo_total"))} sobre o mesmo período de ${Number(anoU) - 1}.`],
      [`Aporte da Prefeitura em ${anoU}`, reais(soma(A1, "aporte_municipio")), `${pct(pctN(soma(A1, "aporte_municipio"), soma(A1, "custo_total")))} do custo. ${sinal(varPct("aporte_municipio"))} sobre ${Number(anoU) - 1}.`],
      ["Passageiros por mês", nf0.format(soma(A1, "passageiros") / A1.length), `Média de ${anoU}. ${sinal(varPct("passageiros"))} sobre ${Number(anoU) - 1}.`],
      ["Tarifa técnica", brl2.format(ult.tarifa_tecnica), `Custo por passageiro pagante em ${mesAno(ult.mes)}. A tarifa paga pelo usuário é R$ 5,00.`],
    ]);
    const rot = M.map((m) => mesAno(m.mes));
    el.innerHTML += `<div class="card"><h3>Quem paga a conta, mês a mês</h3>${legenda([{ nome: "Custo total do sistema", cor: "var(--s4)" }, { nome: "Receita das tarifas", cor: "var(--series-1)" }, { nome: "Aporte da Prefeitura", cor: "var(--series-2)" }])}<div id="tr-custo"></div>
        <p class="intro" style="font-size:.88rem">O custo do sistema é coberto pelas tarifas pagas pelos passageiros e pelo dinheiro da Prefeitura (subsídio). Desde 2023, a parte paga pela Prefeitura cresceu.</p></div>
      ${R.comparativo_tarifas ? `<div class="card"><h3>Tarifa técnica e tarifa paga pelo usuário em outras cidades do Paraná</h3><p class="intro">Quanto mais acima da linha tracejada, maior a parte da passagem paga com subsídio. Foz tem a menor tarifa ao usuário e a maior tarifa técnica da comparação.</p><div id="tr-disp"></div><div class="tabela-box"><table class="tabela-esp"><thead><tr><th>Cidade</th><th class="dir">Tarifa ao usuário</th><th class="dir">Tarifa técnica</th><th class="dir">Subsídio</th></tr></thead><tbody>${R.comparativo_tarifas.cidades.map((c) => `<tr${/Foz/.test(c[0]) ? ' style="background:var(--accent-soft)"' : ""}><td><strong>${esc(c[0])}</strong></td><td class="dir num">${brl2.format(c[1])}</td><td class="dir num">${brl2.format(c[2])}</td><td class="dir num"><strong>${pct(c[3])}</strong></td></tr>`).join("")}</tbody></table></div><p class="fonte">${esc(R.comparativo_tarifas.nota)} Fonte: ${esc(R.comparativo_tarifas.fonte)}.</p></div>` : ""}
      <div class="grid-2"><div class="card"><h3>Passageiros por mês</h3><div id="tr-pass"></div></div>
        <div class="card"><h3>Tarifa técnica (custo por passageiro pagante)</h3><div id="tr-tarifa"></div></div></div>
      <div class="grid-2"><div class="card"><h3>Passageiros por ano, em milhões</h3><div class="colunas" id="tr-hist"></div><p class="intro" style="font-size:.88rem">O sistema perdeu passageiros antes da pandemia e ainda não voltou ao nível de 2019.</p></div>
        <div class="card"><h3>Gratuidades</h3><div id="tr-grat"></div><p class="intro" style="font-size:.88rem">Parte dos passageiros que não paga tarifa (idosos, pessoas com deficiência, estudantes com passe livre e outros). Quanto maior essa parte, maior o custo por passageiro pagante.</p></div></div>
      <div class="card"><h3>O novo edital de concessão</h3><p class="intro">Comparação entre o sistema atual, o estudo técnico contratado pela Prefeitura e a proposta de edital.</p>
        <div class="tabela-box"><table class="tabela-esp"><thead><tr>${R.comparativo_edital.colunas.map((c, i) => `<th${i ? ' class="dir"' : ""}>${esc(c)}</th>`).join("")}</tr></thead><tbody>${R.comparativo_edital.linhas.map((l) => `<tr>${l.map((c, i) => `<td${i ? ' class="dir"' : ""}>${i ? esc(c) : "<strong>" + esc(c) + "</strong>"}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>
      <div class="card"><h3>Pagamentos à concessionária registrados no Tribunal de Contas</h3><div id="tr-tcepag"></div></div>
      <div class="grid-2"><div class="card"><h3>Pontos de atenção apontados pelo OSB</h3><ol style="margin:0;padding-left:1.2em;display:flex;flex-direction:column;gap:8px">${R.pontos_atencao.map((p) => `<li>${esc(p)}</li>`).join("")}</ol></div>
        <div class="card"><h3>Recomendações do Tribunal de Contas</h3><p class="intro">Das ${R.recomendacoes_tce.total} recomendações do TCE-PR sobre o edital:</p><div class="barras" id="tr-tce"></div></div></div>
      ${M.some((m, i) => i && M.slice(0, i).some((n) => n.passageiros === m.passageiros && n.custo_total === m.custo_total)) ? `<p class="nota">Na planilha de prestação de contas, os valores de julho/2025 são idênticos aos de maio/2025, o que sugere erro de preenchimento. Os gráficos mostram os valores como estão na planilha.</p>` : ""}
      <p class="fonte">Fontes: ${esc(R.fonte_mensal)}; ${esc(R.fonte_estudo)}.</p>`;
    linhas($("#tr-custo"), rot, [
      { nome: "Custo total", valores: M.map((m) => m.custo_total), cor: "var(--s4)" },
      { nome: "Tarifas", valores: M.map((m) => m.receita_total), cor: "var(--series-1)" },
      { nome: "Aporte", valores: M.map((m) => m.aporte_municipio), cor: "var(--series-2)" },
    ], fmtCurto, { rotulo: "Custo, receita e aporte mensais do transporte coletivo" });
    if (R.comparativo_tarifas) dispersao($("#tr-disp"), R.comparativo_tarifas.cidades.map((c) => ({ x: c[1], y: c[2], r: c[3], rotulo: `${c[0]} · ${nf0.format(c[3])}%`, destaque: /Foz/.test(c[0]),
      tip: `<strong>${esc(c[0])}</strong><br>Tarifa ao usuário: ${brl2.format(c[1])}<br>Tarifa técnica: ${brl2.format(c[2])}<br>Subsídio: ${pct(c[3])} da tarifa técnica` })),
      { xMin: 4, xMax: 7, yMin: 4, yMax: 15, tituloX: "Tarifa paga pelo usuário (R$)", tituloY: "Tarifa técnica (R$)", fmtX: (v) => "R$ " + nf1.format(v), fmtY: (v) => "R$ " + nf0.format(v), altura: 420, rMax: 18,
        linhas: [{ diag: true, rotulo: "Sem subsídio: técnica = usuário" }], rotulo: "Tarifa técnica e tarifa ao usuário por cidade" });
    linhas($("#tr-pass"), rot, [{ nome: "Passageiros", valores: M.map((m) => m.passageiros), cor: "var(--series-1)" }], (v) => nf1.format(v / 1e6) + " mi", { zero: false, altura: 240, fmtTip: (v) => nf0.format(v), largura: 560 });
    linhas($("#tr-tarifa"), rot, [{ nome: "Tarifa técnica", valores: M.map((m) => m.tarifa_tecnica), cor: "var(--series-2)" }, { nome: "Tarifa pública", valores: M.map(() => 5), cor: "var(--s8)", tracejado: true }], (v) => "R$ " + nf0.format(v), { altura: 240, fmtTip: (v) => brl2.format(v), largura: 560 });
    colunas($("#tr-hist"), R.historico_passageiros.milhoes, R.historico_passageiros.anos.map(String), "var(--series-1)", (v) => nf1.format(v));
    linhas($("#tr-grat"), rot, [{ nome: "Gratuidades", valores: M.map((m) => m.gratuidades_pct * 100), cor: "var(--s3)" }], (v) => nf0.format(v) + "%", { zero: false, altura: 240, fmtTip: (v) => pct(v), largura: 560 });
    const rt = R.recomendacoes_tce;
    barras($("#tr-tce"), [{ nome: "Atendidas com ressalvas", valor: rt.atendidas_com_ressalvas, cor: "var(--warning)" }, { nome: "Atendidas parcialmente", valor: rt.parcialmente, cor: "var(--series-2)" }, { nome: "Não atendidas", valor: rt.nao_atendidas, cor: "var(--critical)" }].map((x) => ({ ...x, valor: x.valor })), "", null, { porHab: false });
    $("#tr-tce").querySelectorAll(".valor").forEach((v, i) => { v.textContent = [rt.atendidas_com_ressalvas, rt.parcialmente, rt.nao_atendidas][i]; });
    const tp = T() && T().transporte_pagamentos;
    if (tp && tp.credores.length) {
      const tot = tp.credores.reduce((s, x) => s + x.valor, 0);
      const custoPer = doAno(anoAtual).slice(0, A.meses).reduce((s, m) => s + m.custo_total, 0);
      $("#tr-tcepag").innerHTML = `<p class="intro">Em ${anoAtual}, até ${MESES_LONGO[A.meses - 1]}, a Foztrans pagou ${brl.format(tot)} a ${esc(tp.credores.map((c) => c.nome).join(", "))} pela operação do sistema. Na prestação de contas, o custo do sistema nesses meses soma ${brl.format(custoPer)}. A diferença pode vir de medições de meses anteriores pagas neste período.</p><div class="colunas" id="tr-tcem"></div><p class="fonte">${esc(fonteTce())}</p>`;
      colunas($("#tr-tcem"), tp.mensal, MESES.slice(0, tp.mensal.length), "var(--series-2)", fmtCurto);
    } else $("#tr-tcepag").innerHTML = semDados(`Pagamentos de ${anoAtual} ainda não carregados.`);
  }

  // ============================================================ página: aluguéis
  function paginaAlugueis(el) {
    el.innerHTML = topoEsp("Aluguéis de imóveis", "Quanto a Prefeitura gasta alugando prédios para escolas, unidades de saúde, conselhos tutelares e secretarias, e quem são os proprietários.", "lupa-prancheta");
    const t = T();
    if (!t) { el.innerHTML += semDados(`Os dados de ${anoAtual} ainda não foram carregados.`); return; }
    const Al = t.alugueis, cr = Al.credores, tot = cr.reduce((s, x) => s + x.pago, 0);
    const pf = cr.filter((x) => x.tipo === "Pessoa física");
    el.innerHTML += tilesHtml([
      ["Pago em aluguéis", reais(tot), `De janeiro a ${MESES_LONGO[A.meses - 1]} de ${anoAtual}.`],
      ["Média por mês", reais(tot / A.meses), "Valor mensal médio pago em aluguéis."],
      ["Locadores", nf0.format(cr.length), `${nf0.format(pf.length)} pessoas físicas e ${nf0.format(cr.length - pf.length)} empresas ou entidades.`],
      ["Maior locador", cr[0] ? pct(pctN(cr[0].pago, tot)) : "–", cr[0] ? `${esc(cr[0].nome)} recebeu ${reais(cr[0].pago)}.` : ""],
    ]);
    el.innerHTML += `<div class="grid-2"><div class="card"><h3>Aluguéis pagos por mês</h3><div class="colunas" id="al-mes"></div></div>
      <div class="card"><h3>Por secretaria</h3><div class="barras" id="al-org"></div></div></div>
      <div class="card"><h3>Quem recebe e quais imóveis</h3><div id="al-tab"></div>
      <p class="fonte">${esc(fonteTce())} Despesas classificadas como "locação de imóveis". A descrição do imóvel é o histórico do empenho.</p></div>
      ${Al.contratos.length ? `<div class="card"><h3>Contratos de locação assinados em ${anoAtual}</h3><div id="al-cont"></div></div>` : ""}`;
    tabelaInterativa($("#al-tab"), {
      linhas: cr,
      busca: { rot: "Buscar por locador, endereço ou finalidade", ph: "Ex.: escola, CRAS, Rua", txt: (x) => x.nome + " " + x.imoveis.join(" ") + " " + x.orgao },
      filtros: [
        { rot: "Secretaria", todos: "Todas as secretarias", val: (x) => x.orgao },
        { rot: "Tipo de locador", todos: "Todos", val: (x) => x.tipo },
      ],
      colunas: [
        { rot: "Locador", ord: (x) => x.nome, cel: (x) => `<strong>${esc(x.nome)}</strong><span class="doc">${esc(x.documento)}</span>` },
        { rot: "Imóvel e finalidade", cel: (x) => x.imoveis.map((i) => esc(i)).join("<br><br>") },
        { rot: "Secretaria", ord: (x) => x.orgao, cel: (x) => esc(x.orgao) },
        { rot: "Pago", dir: true, ord: (x) => x.pago, cel: (x) => `<strong>${brl2.format(x.pago)}</strong>` },
      ],
      ordem: { col: 3, desc: true },
      resumo: (r) => `${nf0.format(r.length)} locadores, somando ${brl2.format(r.reduce((s, x) => s + x.pago, 0))}.`,
    });
    if (Al.contratos.length) tabelaInterativa($("#al-cont"), {
      linhas: Al.contratos,
      busca: { rot: "Buscar por contratado ou objeto", ph: "Ex.: sede, Rua", txt: (c) => c.contratado + " " + c.objeto + " " + c.numero },
      filtros: [{ rot: "Órgão", todos: "Todos os órgãos", val: (c) => c.entidade }],
      colunas: [
        { rot: "Contratado", ord: (c) => c.contratado, cel: (c) => `<strong>${esc(c.contratado)}</strong><span class="doc">Contrato ${esc(c.numero)} · ${esc(c.entidade)}</span>` },
        { rot: "Objeto", cel: (c) => esc(c.objeto) },
        { rot: "Vigência", ord: (c) => c.inicio, cel: (c) => `<span class="num">${fmtDataBR(c.inicio)} a ${fmtDataBR(c.fim)}</span>` },
        { rot: "Valor", dir: true, ord: (c) => c.valor, cel: (c) => brl2.format(c.valor) },
      ],
      ordem: { col: 3, desc: true },
      resumo: (r) => `${nf0.format(r.length)} contratos, somando ${brl2.format(r.reduce((s, c) => s + c.valor, 0))}.`,
    });
    colunas($("#al-mes"), Al.mensal, MESES.slice(0, Al.mensal.length), "var(--series-2)", fmtCurto);
    const org = new Map(); cr.forEach((x) => org.set(x.orgao, (org.get(x.orgao) || 0) + x.pago));
    barras($("#al-org"), [...org.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8), "var(--series-2)", tot, { porHab: false });
  }

  // ============================================================ página: obras
  const MAPA_OBRAS = "https://www.google.com/maps/d/u/0/viewer?mid=1CcneuVsY_H58_SAMOfGdbJXzmjDgwRk&ll=-25.50866069360419%2C-54.558194320410145&z=12";
  function paginaObras(el) {
    const F = DADOS.foco_na_obra, FO = F ? F.obras : [];
    const t = T(), O = t && t.obras, iv = O ? O.intervencoes : [], pg = O ? O.pagamentos : [];
    const ref = new Date(DADOS.meta.atualizado_em + "T12:00:00");
    let h = topoEsp("Obras", "As obras públicas de Foz do Iguaçu vistas de duas formas: as que os voluntários do Observatório acompanham de perto no Foco na Obra e as que a Prefeitura cadastrou no Tribunal de Contas, com quanto já foi pago às construtoras.", "lupa-notebook");
    h += `<div class="card"><h3>Todas as obras no mapa</h3><p class="intro">Obras monitoradas pelo OSB (círculos) e obras iniciadas em ${anoAtual} cadastradas pela Prefeitura no Tribunal de Contas (quadrados). A cor indica a situação; o tamanho, o valor. Toque em um ponto para abrir o local no Google Maps.</p>
      <div class="chips" role="group" aria-label="Camadas do mapa"><button type="button" class="chip" data-cam="osb" aria-pressed="true">● Foco na Obra (OSB)</button><button type="button" class="chip" data-cam="tce" aria-pressed="true">■ Cadastro no TCE-PR</button></div>
      <div class="legenda">${Object.entries(COR_SIT).map(([n, c]) => `<span><i class="marca" style="background:${c}"></i>${n}</span>`).join("")}<span><i class="marca" style="background:var(--ink-3);transform:rotate(45deg);border-radius:1px"></i>Ponto de referência</span></div>
      <div id="ob-mapa"></div><p class="fonte">Mapa esquemático: os pontos estão nas coordenadas informadas, sem o desenho das ruas. Fontes: mapa Foco na Obra (OSB Foz do Iguaçu) e cadastro de obras do SIM-AM (TCE-PR).</p></div>`;

    // ---------- parte 1: Foco na Obra
    h += `<div class="secao-obras" id="parte-foco"><span class="num-sec">1</span><div><h2>Obras monitoradas pelo OSB: Foco na Obra</h2><p>Levantamento dos voluntários do Observatório, com visitas, situação e percentual executado de cada obra.</p></div></div>`;
    h += `<a class="foco-obra" href="${MAPA_OBRAS}" target="_blank" rel="noopener"><div><span class="fo-tag">Ferramenta do OSB Foz do Iguaçu</span><strong class="fo-tit">FOCO NA OBRA</strong><span class="fo-txt">${FO.length || 27} obras públicas monitoradas pelos voluntários do Observatório, com localização, situação e informações de cada uma.</span><span class="fo-btn">Abrir o mapa Foco na Obra ↗</span></div><img src="img/lupa-notebook.webp" alt=""></a>`;
    if (FO.length) {
      const cont = FO.reduce((s, o) => s + (o.valor_contratado || 0), 0), cnt = (g) => FO.filter((o) => o.grupo === g).length;
      h += tilesHtml([
        ["Obras monitoradas pelo OSB", nf0.format(FO.length), "Acompanhadas pelos voluntários no Foco na Obra."],
        ["Valor contratado", reais(cont), `Soma das ${FO.filter((o) => o.valor_contratado).length} obras com contrato assinado.`],
        ["Em andamento", nf0.format(cnt("Em andamento")), `${nf0.format(cnt("Em licitação"))} ainda em licitação e ${nf0.format(cnt("Não iniciada"))} contratadas e não iniciadas.`],
        ["Paralisadas ou suspensas", nf0.format(cnt("Paralisada")), FO.filter((o) => o.grupo === "Paralisada").map((o) => o.nome).join("; ")],
      ]);
      h += `<div class="card"><h3>Lista das obras do Foco na Obra</h3><div id="fo-tab"></div>
        ${F.formulario ? `<a class="fo-form" href="${esc(F.formulario)}" target="_blank" rel="noopener"><img src="img/lupa-anotando.webp" alt=""><span><strong>Viu algo numa dessas obras?</strong> Mande sua sugestão, dúvida, denúncia ou foto para o Observatório.</span><span class="fo-btn">Enviar pelo formulário ↗</span></a>` : ""}
        <p class="fonte">Fonte: mapa Foco na Obra, mantido pelos voluntários do OSB Foz do Iguaçu. Percentuais de execução e datas como informados no mapa.</p></div>`;
    }

    // ---------- parte 2: TCE-PR
    h += `<div class="secao-obras" id="parte-tce"><span class="num-sec">2</span><div><h2>Obras informadas pela Prefeitura ao Tribunal de Contas</h2><p>Cadastro oficial de obras (SIM-AM do TCE-PR) e pagamentos feitos às construtoras em ${anoAtual}.</p></div></div>`;
    if (!O) h += semDados(`Os dados de obras de ${anoAtual} ainda não foram carregados.`);
    else {
      const totIv = iv.reduce((s, x) => s + x.valor, 0), totPg = pg.reduce((s, x) => s + x.pago, 0);
      h += tilesHtml([
        [`Obras cadastradas em ${anoAtual}`, nf0.format(iv.length), "Intervenções iniciadas no ano e informadas ao Tribunal de Contas."],
        ["Valor dessas obras", reais(totIv), "Soma do valor previsto de cada obra."],
        ["Pago em obras", reais(totPg), `Todas as obras e instalações, inclusive de anos anteriores, de janeiro a ${MESES_LONGO[A.meses - 1]}.`],
        ["Empresas que receberam", nf0.format(pg.filter((x) => x.pago > 0).length), "Construtoras e prestadores pagos por obras no período."],
      ]);
      h += `<div class="card"><h3>Obras iniciadas em ${anoAtual}</h3><div id="tce-tab"></div><p class="fonte">${esc(fonteTce().replace(/pagamentos até.*$/, ""))} Cadastro de obras (intervenções) do SIM-AM. O percentual do prazo compara o tempo decorrido até ${fmtDataBR(DADOS.meta.atualizado_em)} com o prazo de execução.</p></div>
        <div class="card"><h3>Quem recebeu por obras em ${anoAtual}</h3><div id="pg-tab"></div><p class="fonte">${esc(fonteTce())} Despesas classificadas como "obras e instalações".</p></div>`;
    }
    el.innerHTML = h;

    // ---------- mapa
    const camadas = { osb: true, tce: true };
    const vmax = Math.max(1, ...FO.map((o) => o.valor_contratado || o.valor_edital || 0), ...iv.map((o) => o.valor));
    const raio = (v) => Math.max(6, Math.sqrt((v || 0) / vmax) * 18);
    function desenhaMapaObras() {
      const pts = [];
      if (camadas.osb) FO.forEach((o) => { if (o.lat != null) pts.push({ lat: o.lat, lon: o.lon, cor: COR_SIT[o.grupo], forma: "c", r: raio(o.valor_contratado || o.valor_edital), camada: "osb", link: `https://www.google.com/maps?q=${o.lat},${o.lon}`, tip: `<strong>${esc(o.nome)}</strong><br>Foco na Obra · ${esc(o.situacao)}${o.pct_executado != null ? ` (${nf1.format(o.pct_executado)}%)` : ""}<br>${o.valor_contratado ? brl.format(o.valor_contratado) + " contratado" : o.valor_edital ? brl.format(o.valor_edital) + " no edital" : ""}${o.empresa ? "<br>" + esc(o.empresa) : ""}` }); });
      if (camadas.tce) iv.forEach((o) => o.locais.forEach((l) => { if (l.lat != null) pts.push({ lat: l.lat, lon: l.lon, cor: COR_SIT[grupoSit(o.situacao)], forma: "q", r: raio(o.valor) * 0.85, camada: "tce", link: `https://www.google.com/maps?q=${l.lat},${l.lon}`, tip: `<strong>${esc(o.nome)}</strong><br>Cadastro TCE-PR · ${esc(o.situacao)}<br>${brl.format(o.valor)}<br>${esc(l.endereco)}` }); }));
      mapaPontos($("#ob-mapa"), pts);
    }
    el.querySelectorAll(".chip[data-cam]").forEach((b) => b.addEventListener("click", () => { camadas[b.dataset.cam] = !camadas[b.dataset.cam]; b.setAttribute("aria-pressed", String(camadas[b.dataset.cam])); desenhaMapaObras(); }));
    desenhaMapaObras();

    // ---------- tabela Foco na Obra
    if (FO.length) tabelaInterativa($("#fo-tab"), {
      linhas: FO,
      busca: { rot: "Buscar por obra, empresa ou processo", ph: "Ex.: escola, UBS, pavimentação", txt: (o) => [o.nome, o.empresa, o.processo, o.contrato, o.categoria].join(" ") },
      filtros: [
        { rot: "Área", todos: "Todas as áreas", val: (o) => o.categoria },
        { rot: "Situação", todos: "Todas as situações", val: (o) => o.grupo },
        { rot: "Empresa", todos: "Todas as empresas", val: (o) => o.empresa || "Sem contrato" },
      ],
      colunas: [
        { rot: "Obra", ord: (o) => o.nome, cel: (o) => `<strong>${esc(o.nome)}</strong><span class="doc">${esc(o.categoria)} · ${esc(o.processo)}</span>${o.lat != null ? `<a href="https://www.google.com/maps?q=${o.lat},${o.lon}" target="_blank" rel="noopener">Ver no mapa ↗</a>` : ""}` },
        { rot: "Empresa e contrato", ord: (o) => o.empresa, cel: (o) => `${o.empresa ? esc(o.empresa) : '<span class="doc">Sem contrato</span>'}${o.contrato ? `<span class="doc">Contrato ${esc(o.contrato)}</span>` : ""}` },
        { rot: "Situação", ord: (o) => o.grupo, cel: (o) => `<span class="pill" style="color:${COR_SIT[o.grupo]}">${esc(o.situacao)}</span>${o.ultima_medicao ? `<span class="doc">Última medição: ${esc(o.ultima_medicao)}</span>` : ""}` },
        { rot: "% executado", dir: true, ord: (o) => o.pct_executado, cel: (o) => o.pct_executado != null ? `<div class="prog" title="${nf1.format(o.pct_executado)}% executado"><div style="width:${Math.min(100, o.pct_executado)}%"></div></div>${nf1.format(o.pct_executado)}%` : "–" },
        { rot: "Início", ord: (o) => dataISO(o.inicio), cel: (o) => `<span class="num">${o.inicio ? esc(o.inicio) : "–"}</span>${o.termino ? `<span class="doc">Término previsto: ${esc(o.termino)}</span>` : ""}` },
        { rot: "Valores", dir: true, ord: (o) => o.valor_contratado || o.valor_edital || null, cel: (o) => `${o.valor_contratado ? `<strong>${brl.format(o.valor_contratado)}</strong><span class="doc">contratado</span>` : ""}${o.valor_edital ? `<span class="doc">Edital: ${brl.format(o.valor_edital)}</span>` : ""}${o.valor_executado ? `<span class="doc">Executado: ${brl.format(o.valor_executado)}</span>` : ""}` },
      ],
      ordem: { col: 5, desc: true },
      resumo: (r) => `${nf0.format(r.length)} de ${nf0.format(FO.length)} obras. Valor contratado: ${brl.format(r.reduce((s, o) => s + (o.valor_contratado || 0), 0))}.`,
      vazio: "Nenhuma obra encontrada com esses filtros.",
    });

    // ---------- tabelas TCE
    if (!O) return;
    const IV = iv.map((o) => {
      const ini = new Date(o.inicio + "T12:00:00"), dias = Math.round((ref - ini) / 864e5), p = o.prazo_dias ? Math.min(999, dias / o.prazo_dias * 100) : null;
      return { ...o, p, fimPrev: o.prazo_dias ? new Date(ini.getTime() + o.prazo_dias * 864e5).toISOString().slice(0, 10) : "", local: o.locais.map((l) => l.endereco || l.bem).join("; ") };
    });
    tabelaInterativa($("#tce-tab"), {
      linhas: IV,
      busca: { rot: "Buscar por obra ou endereço", ph: "Ex.: escola, Rua, pavimentação", txt: (o) => o.nome + " " + o.local + " " + o.entidade },
      filtros: [
        { rot: "Órgão", todos: "Todos os órgãos", val: (o) => o.entidade },
        { rot: "Situação", todos: "Todas as situações", val: (o) => o.situacao },
        { rot: "Prazo", opcoes: [{ rot: "Todos os prazos" }, { rot: "Prazo já vencido", fn: (o) => o.p != null && o.p > 100 }, { rot: "Mais de 80% do prazo", fn: (o) => o.p != null && o.p > 80 }, { rot: "Dentro do prazo", fn: (o) => o.p != null && o.p <= 80 }] },
      ],
      colunas: [
        { rot: "Obra", ord: (o) => o.nome, cel: (o) => `<strong>${esc(o.nome)}</strong><span class="doc">${esc(o.entidade)} · execução ${esc(o.regime.toLowerCase())}</span>` },
        { rot: "Local", ord: (o) => o.local, cel: (o) => o.locais.map((l) => esc(l.endereco || l.bem) + (l.lat != null ? `<br><a href="https://www.google.com/maps?q=${l.lat},${l.lon}" target="_blank" rel="noopener">Ver no mapa ↗</a>` : "")).join("<br>") || "–" },
        { rot: "Situação", ord: (o) => o.situacao, cel: (o) => `${esc(o.situacao)}<span class="doc">Última medição: ${fmtDataBR(o.ultima_medicao)}</span>` },
        { rot: "Prazo", ord: (o) => o.p, cel: (o) => { const cls = o.p == null ? "" : o.p > 100 ? "ruim" : o.p > 80 ? "alerta" : "ok"; return `<span class="num">Início ${fmtDataBR(o.inicio)}</span><span class="doc">${o.prazo_dias} dias, até ${fmtDataBR(o.fimPrev)}</span>${o.p != null ? `<span class="pill ${cls}" style="margin-top:4px">${nf0.format(o.p)}% do prazo</span>` : ""}`; } },
        { rot: "Valor", dir: true, ord: (o) => o.valor, cel: (o) => `<strong>${brl2.format(o.valor)}</strong>` },
      ],
      ordem: { col: 4, desc: true },
      resumo: (r) => `${nf0.format(r.length)} de ${nf0.format(IV.length)} obras, somando ${brl2.format(r.reduce((s, o) => s + o.valor, 0))}.`,
    });
    tabelaInterativa($("#pg-tab"), {
      linhas: pg,
      busca: { rot: "Buscar por empresa ou descrição", ph: "Ex.: pavimentação, reforma", txt: (x) => x.nome + " " + x.documento + " " + x.historicos.join(" ") },
      filtros: [{ rot: "Secretaria", todos: "Todas as secretarias", val: (x) => x.orgao }],
      colunas: [
        { rot: "Empresa", ord: (x) => x.nome, cel: (x) => `<strong>${esc(x.nome)}</strong><span class="doc">${esc(x.documento)}</span>` },
        { rot: "O que foi pago", cel: (x) => x.historicos.map(esc).join("<br><br>") },
        { rot: "Secretaria", ord: (x) => x.orgao, cel: (x) => esc(x.orgao) },
        { rot: "Empenhado", dir: true, ord: (x) => x.empenhado, cel: (x) => brl.format(x.empenhado) },
        { rot: "Pago", dir: true, ord: (x) => x.pago, cel: (x) => `<strong>${brl2.format(x.pago)}</strong>` },
      ],
      ordem: { col: 4, desc: true },
      resumo: (r) => `${nf0.format(r.length)} empresas, somando ${brl2.format(r.reduce((s, x) => s + x.pago, 0))} pagos.`,
    });
  }

  // ============================================================ página: sem licitação
  function paginaSemLicitacao(el) {
    el.innerHTML = topoEsp("Contratações sem licitação", "A lei permite comprar sem licitação em alguns casos: quando o valor é pequeno ou há emergência (dispensa) ou quando não há como haver competição, como um artista exclusivo ou um credenciamento aberto a todos (inexigibilidade). São exceções e merecem atenção.", "lupa-pensando");
    const t = T();
    if (!t) { el.innerHTML += semDados(`Os processos de ${anoAtual} ainda não foram carregados.`); return; }
    const S = t.sem_licitacao, P = S.processos, R = S.resumo;
    const qtdTot = Object.values(R).reduce((s, x) => s + x.qtd, 0), valTot = Object.values(R).reduce((s, x) => s + x.valor, 0);
    const d = R["Dispensa"] || { qtd: 0, valor: 0 }, ix = R["Inexigibilidade"] || { qtd: 0, valor: 0 };
    el.innerHTML += tilesHtml([
      ["Processos sem licitação", nf0.format(d.qtd + ix.qtd), `${pct(pctN(d.qtd + ix.qtd, qtdTot))} de todos os ${nf0.format(qtdTot)} processos de compra abertos em ${anoAtual}.`],
      ["Valor previsto sem licitação", reais(d.valor + ix.valor), `${pct(pctN(d.valor + ix.valor, valTot))} do valor de todos os processos.`],
      ["Inexigibilidades", nf0.format(ix.qtd), `${reais(ix.valor)}. Inclui credenciamentos e contratações de artistas.`],
      ["Dispensas", nf0.format(d.qtd), `${reais(d.valor)}. Compras de pequeno valor e emergências.`],
    ]);
    el.innerHTML += `<div class="grid-2"><div class="card"><h3>Processos por modalidade</h3><div class="barras" id="sl-qtd"></div></div>
        <div class="card"><h3>Valor previsto por modalidade</h3><div class="barras" id="sl-val"></div></div></div>
      <div class="grid-2"><div class="card"><h3>Sem licitação, por órgão</h3><div class="barras" id="sl-ent"></div></div>
        <div class="card"><h3>Fornecedores em mais processos sem licitação</h3><div class="barras" id="sl-forn"></div></div></div>
      <div class="card"><h3>Todos os processos de dispensa e inexigibilidade</h3>
        <div class="filtros"><label for="sl-busca">Buscar por objeto ou fornecedor<input id="sl-busca" type="search" placeholder="Ex.: show, médicos, emergencial"></label>
          <label for="sl-mod">Modalidade<select id="sl-mod"><option value="">Dispensa e inexigibilidade</option><option>Dispensa</option><option>Inexigibilidade</option></select></label>
          <label for="sl-org">Órgão<select id="sl-org"><option value="">Todos os órgãos</option>${[...new Set(P.map((p) => p.entidade))].sort().map((e) => `<option>${esc(e)}</option>`).join("")}</select></label></div>
        <div class="tabela-box"><table class="tabela-esp"><thead><tr><th>Processo</th><th>Objeto</th><th>Fornecedores</th><th class="dir">Valor previsto</th><th class="dir">Pago até agora</th></tr></thead><tbody id="sl-corpo"></tbody></table></div>
        <p class="intro" id="sl-resumo" style="font-size:.88rem"></p><button type="button" class="btn" id="sl-mais">Mostrar mais</button>
        <p class="fonte">${esc(fonteTce().replace(/pagamentos até.*$/, ""))} Processos de compra informados ao SIM-AM em ${anoAtual} (inclui a Fundação Municipal de Saúde). "Pago até agora" soma os pagamentos dos empenhos ligados ao processo até ${MESES_LONGO[A.meses - 1]}.</p></div>`;
    const ordem = ["Pregão", "Concorrência", "Inexigibilidade", "Dispensa"];
    const cores = { "Pregão": "var(--series-1)", "Concorrência": "var(--s4)", "Inexigibilidade": "var(--series-2)", "Dispensa": "var(--s5)" };
    const mods = Object.keys(R).sort((a, b) => (ordem.indexOf(a) + 1 || 9) - (ordem.indexOf(b) + 1 || 9));
    barras($("#sl-qtd"), mods.map((k) => ({ nome: k, valor: R[k].qtd, cor: cores[k] })), "", qtdTot, { porHab: false });
    $("#sl-qtd").querySelectorAll(".valor").forEach((v, i) => { v.innerHTML = `${nf0.format(R[mods[i]].qtd)}<small>${pct(pctN(R[mods[i]].qtd, qtdTot))}</small>`; });
    barras($("#sl-val"), mods.map((k) => ({ nome: k, valor: R[k].valor, cor: cores[k] })), "", valTot, { porHab: false });
    const ent = new Map(); P.forEach((p) => ent.set(p.entidade, (ent.get(p.entidade) || 0) + p.valor));
    barras($("#sl-ent"), [...ent.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor), "var(--series-2)", d.valor + ix.valor, { porHab: false });
    const fo = new Map(); P.forEach((p) => p.fornecedores.forEach((f) => fo.set(f.nome, (fo.get(f.nome) || 0) + 1)));
    const topF = [...fo.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor).slice(0, 10);
    barras($("#sl-forn"), topF, "var(--series-2)", null, { porHab: false });
    $("#sl-forn").querySelectorAll(".valor").forEach((v, i) => { v.textContent = topF[i].valor + (topF[i].valor > 1 ? " processos" : " processo"); });
    let lim = 25;
    const desenha = () => {
      const q = semAcento($("#sl-busca").value.trim()), md = $("#sl-mod").value, og = $("#sl-org").value;
      const lista = P.filter((p) => (!md || p.modalidade === md) && (!og || p.entidade === og) && (!q || semAcento(p.objeto + " " + p.fornecedores.map((f) => f.nome).join(" ")).includes(q)));
      $("#sl-corpo").innerHTML = lista.slice(0, lim).map((p) => `<tr><td><strong>${esc(p.modalidade)} ${esc(p.numero)}</strong><span class="doc">${esc(p.entidade)} · ${fmtDataBR(p.data)}</span></td><td>${esc(p.objeto)}</td><td>${p.fornecedores.length ? p.fornecedores.map((f) => esc(f.nome)).join("<br>") : '<span class="doc">Não informado</span>'}</td><td class="dir num"><strong>${brl2.format(p.valor)}</strong></td><td class="dir num">${brl2.format(p.pago)}</td></tr>`).join("") || `<tr><td colspan="5">Nenhum processo encontrado.</td></tr>`;
      $("#sl-resumo").textContent = `${nf0.format(lista.length)} processos, com valor previsto de ${brl.format(lista.reduce((s, p) => s + p.valor, 0))}.`;
      $("#sl-mais").hidden = lista.length <= lim;
    };
    ["#sl-busca", "#sl-mod", "#sl-org"].forEach((id) => $(id).addEventListener(id === "#sl-busca" ? "input" : "change", () => { lim = 25; desenha(); }));
    $("#sl-mais").addEventListener("click", () => { lim += 50; desenha(); });
    desenha();
  }

  // ============================================================ páginas do OSB (estrutura pronta para os dados)
  const numBR = (s) => { const v = parseFloat(String(s || "").replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")); return isNaN(v) ? 0 : v; };
  const dataBR = (s) => { const m = String(s || "").match(/(\d{2})\/(\d{2})\/(\d{4})/); if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00`); const d = new Date(String(s) + "T12:00:00"); return isNaN(d) ? null : d; };
  const aguardando = (campos) => `<div class="card vazio-osb"><img src="img/lupa-deitado.webp" alt=""><div><h3>Aguardando os dados do OSB</h3><p class="intro">Esta página já está pronta. Assim que a planilha for preenchida, os números, gráficos e a tabela aparecem aqui automaticamente.</p><p class="intro" style="font-size:.88rem">Colunas da planilha: ${campos.map((c) => `<code>${c}</code>`).join(", ")}.</p></div></div>`;

  function paginaLicitacoesOSB(el) {
    const L = (DADOS.osb && DADOS.osb.licitacoes) || [];
    el.innerHTML = topoEsp("Licitações acompanhadas pelo OSB", "Os voluntários do Observatório acompanham as licitações e as contratações diretas da Prefeitura, da Câmara e dos órgãos municipais publicadas no Portal da Transparência: editais, sessões, resultados e valores. Quando encontram problemas, questionam o edital e acompanham a correção.", "lupa-notebook");
    if (!L.length || L[0].est === undefined) { el.innerHTML += tilesHtml([["Licitações acompanhadas", "–", ""], ["Valor estimado", "–", ""], ["Valor contratado", "–", ""], ["Economia", "–", ""]]) + aguardando(["Processo", "Órgão", "Objeto", "Modalidade", "Data_sessão", "Valor_estimado", "Valor_contratado", "Economia", "Situação", "Observação", "Link"]); return; }
    const DISPUTA = /preg[aã]o|concorr/i, DIRETA = /inexig|dispensa/i;
    const hoje = new Date();
    const lic = L.map((l) => {
      const anoP = (l.processo.match(/\/(\d{4})/) || [])[1] || (l.data || "").slice(0, 4);
      const dt = l.data ? new Date(l.data + "T12:00:00") : null;
      return { ...l, ano: anoP, dt, dataSuspeita: dt && dt.getFullYear() > hoje.getFullYear(), disputa: DISPUTA.test(l.modalidade), direta: DIRETA.test(l.modalidade), aberta: /andamento|aguardando|nova data|suspensa/i.test(l.situacao) };
    });
    const anos = [...new Set(lic.map((l) => l.ano))].sort();
    const orgaos = [...new Set(lic.map((l) => l.orgao))];
    const disp = lic.filter((l) => l.disputa && /homolog/i.test(l.situacao) && l.est && l.con != null);
    const soma = (lst, c) => lst.reduce((s, x) => s + (x[c] || 0), 0);
    const ecoD = soma(disp, "eco"), estD = soma(disp, "est");
    const diretas = lic.filter((l) => l.direta), abertas = lic.filter((l) => l.aberta), osb = lic.filter((l) => l.obs);
    el.innerHTML += tilesHtml([
      ["Processos acompanhados", nf0.format(lic.length), `${anos.join(" e ")}, em ${orgaos.length} órgãos municipais.`],
      ["Contratações sem disputa", pct(pctN(diretas.length, lic.length)), `${nf0.format(diretas.length)} inexigibilidades e dispensas, em que não há concorrência entre empresas.`],
      ["Economia nas disputas", reais(ecoD), `${pct(pctN(ecoD, estD))} abaixo do valor estimado, em ${nf0.format(disp.length)} pregões e concorrências concluídos.`],
      ["Em andamento", nf0.format(abertas.length), "Processos ainda abertos, aguardando sessão ou com nova data."],
    ]);
    let h = "";
    h += `<div class="card osb-atua"><h3>Onde o Observatório atuou</h3>${osb.length ? `<p class="intro">Licitações em que a análise dos voluntários levou a questionamentos, correções ou suspensões.</p>` + osb.map((l) => `<div class="osb-item"><img src="img/lupa-anotando.webp" alt=""><div><span class="fo-tag">${esc(l.orgao)} · ${esc(l.modalidade)} ${esc(l.processo)}${l.est ? " · estimado em " + reais(l.est) : ""}</span><strong>${esc(l.objeto.length > 220 ? l.objeto.slice(0, 219) + "…" : l.objeto)}</strong><p>${esc(l.obs)}</p><span class="pill">${esc(l.situacao)}</span>${l.link ? ` <a href="${esc(l.link)}" target="_blank" rel="noopener">Ver no Portal da Transparência ↗</a>` : ""}</div></div>`).join("") : `<p class="intro">Ainda não há atuações registradas na coluna "Observação" da planilha.</p>`}</div>`;
    h += `<div class="grid-2"><div class="card"><h3>Como a cidade contrata</h3><p class="intro">Número de processos por modalidade. Pregão e concorrência têm disputa entre empresas; inexigibilidade e dispensa são contratações diretas.</p><div class="barras" id="lm-mod"></div></div>
      <div class="card"><h3>Processos por órgão</h3><p class="intro">Quantos processos cada órgão abriu e quanto deles foi sem disputa.</p><div class="barras" id="lm-org"></div></div></div>`;
    h += `<div class="card"><h3>Economia nas disputas, ano a ano</h3><p class="intro">Diferença entre o valor estimado no edital e o valor contratado, em pregões e concorrências já homologados. Quanto mais empresas disputam, maior costuma ser o desconto.</p><div class="colunas" id="lm-ano"></div><p class="nota">Em inexigibilidades, credenciamentos e dispensas, o valor estimado costuma ser um teto de gastos, não um preço disputado. Por isso a diferença nesses casos <strong>não</strong> entra na conta da economia.</p></div>`;
    h += `<div class="card"><h3>Todos os processos</h3><div id="lm-tab"></div>
      ${lic.some((l) => l.dataSuspeita) ? `<p class="nota">${nf0.format(lic.filter((l) => l.dataSuspeita).length)} processos têm data da sessão depois de ${hoje.getFullYear()} (até ${Math.max(...lic.filter((l) => l.dataSuspeita).map((l) => l.dt.getFullYear()))}), o que pode ser erro de digitação ou a data de encerramento de um credenciamento. Vale conferir na planilha. Nos filtros, o ano usado é o do número do processo.</p>` : ""}
      <p class="fonte">Fonte: planilha de acompanhamento de licitações do OSB Foz do Iguaçu, com base no Portal da Transparência de Foz do Iguaçu. "Diferença" = valor estimado − valor contratado.</p></div>`;
    el.innerHTML += h;

    const mods = new Map(); lic.forEach((l) => mods.set(l.modalidade || "Não informada", (mods.get(l.modalidade || "Não informada") || 0) + 1));
    const corMod = (m) => DISPUTA.test(m) ? "var(--good)" : DIRETA.test(m) ? "var(--series-2)" : "var(--s8)";
    const lm = [...mods.entries()].sort((a, b) => b[1] - a[1]);
    barras($("#lm-mod"), lm.map(([nome, valor]) => ({ nome, valor, cor: corMod(nome) })), "", null, { porHab: false });
    $("#lm-mod").querySelectorAll(".valor").forEach((v, i) => { const m = lm[i][0], lst = lic.filter((l) => (l.modalidade || "Não informada") === m); v.innerHTML = `${nf0.format(lm[i][1])}<small>${soma(lst, "est") ? reais(soma(lst, "est")) + " estimados" : "sem valor"}</small>`; });
    const lo = orgaos.map((o) => [o, lic.filter((l) => l.orgao === o)]).sort((a, b) => b[1].length - a[1].length);
    barras($("#lm-org"), lo.map(([nome, lst]) => ({ nome, valor: lst.length })), "var(--series-1)", null, { porHab: false });
    $("#lm-org").querySelectorAll(".valor").forEach((v, i) => { const lst = lo[i][1], d = lst.filter((l) => l.direta).length; v.innerHTML = `${nf0.format(lst.length)}<small>${pct(pctN(d, lst.length))} sem disputa</small>`; });
    colunas($("#lm-ano"), anos.map((a) => soma(disp.filter((l) => l.ano === a), "eco")), anos.map((a) => a + (a === String(hoje.getFullYear()) ? " (até agora)" : "")), "var(--good)", fmtCurto);

    const corte = (t, n) => t.length > n ? t.slice(0, n - 1) + "…" : t;
    const pillSit = (s) => /homolog/i.test(s) ? "ok" : /fracass|desert|anulad|revogad|suspens/i.test(s) ? "ruim" : "alerta";
    tabelaInterativa($("#lm-tab"), {
      linhas: lic,
      busca: { rot: "Buscar por objeto ou número", ph: "Ex.: merenda, limpeza, 34/2026", txt: (l) => l.processo + " " + l.objeto + " " + l.obs },
      filtros: [
        { rot: "Órgão", todos: "Todos os órgãos", val: (l) => l.orgao },
        { rot: "Modalidade", todos: "Todas as modalidades", val: (l) => l.modalidade || "Não informada" },
        { rot: "Situação", todos: "Todas as situações", val: (l) => l.situacao || "Não informada" },
        { rot: "Ano", todos: "Todos os anos", val: (l) => l.ano },
        { rot: "Atuação do OSB", opcoes: [{ rot: "Todos os processos" }, { rot: "Só onde o OSB atuou", fn: (l) => !!l.obs }] },
      ],
      colunas: [
        { rot: "Processo", ord: (l) => l.ano + String(parseInt(l.processo, 10)).padStart(5, "0"), cel: (l) => `<strong>${l.link ? `<a href="${esc(l.link)}" target="_blank" rel="noopener">${esc(l.processo)}</a>` : esc(l.processo)}</strong><span class="doc">${esc(l.orgao)}</span>` },
        { rot: "Objeto", ord: (l) => l.objeto, cel: (l) => `<span title="${esc(l.objeto)}">${esc(corte(l.objeto, 180))}</span>${l.obs ? `<span class="doc" style="color:var(--accent);font-weight:700">OSB: ${esc(l.obs)}</span>` : ""}` },
        { rot: "Modalidade e sessão", ord: (l) => l.data || null, cel: (l) => `${esc(l.modalidade)}<span class="doc num">${l.dt ? l.dt.toLocaleDateString("pt-BR") + (l.dataSuspeita ? " (data a conferir)" : "") : "Sem data"}</span>` },
        { rot: "Situação", ord: (l) => l.situacao, cel: (l) => `<span class="pill ${pillSit(l.situacao)}">${esc(l.situacao || "–")}</span>` },
        { rot: "Estimado", dir: true, ord: (l) => l.est, cel: (l) => l.est != null ? brl.format(l.est) : "–" },
        { rot: "Contratado", dir: true, ord: (l) => l.con, cel: (l) => l.con != null ? brl.format(l.con) : "–" },
        { rot: "Diferença", dir: true, ord: (l) => l.eco, cel: (l) => l.eco ? `<strong${l.disputa ? ' style="color:var(--good)"' : ""}>${brl.format(l.eco)}</strong>${l.disputa ? "" : '<span class="doc">teto, não economia</span>'}` : "–" },
      ],
      ordem: { col: 0, desc: true },
      resumo: (r) => { const d = r.filter((l) => l.disputa && /homolog/i.test(l.situacao)); return `${nf0.format(r.length)} processos. Estimado: ${reais(soma(r, "est"))}. Contratado: ${reais(soma(r, "con"))}. Economia em pregões e concorrências homologados: ${reais(soma(d, "eco"))}.`; },
      vazio: "Nenhum processo encontrado com esses filtros.",
    });
  }

  function paginaOficios(el) {
    const O = (DADOS.osb && DADOS.osb.oficios) || [];
    el.innerHTML = topoEsp("Ofícios enviados pelo OSB", "O Observatório envia ofícios à Prefeitura e à Câmara pedindo informações e documentos. Este painel mostra cada pedido, quando foi protocolado e há quanto tempo espera resposta.", "lupa-anotando");
    const hoje = new Date();
    const of = O.map((o) => { const p = dataBR(o.data_protocolo), r = dataBR(o.data_resposta); return { ...o, p, r, dias: p ? Math.round(((r || hoje) - p) / 864e5) : null, respondido: !!r }; });
    const resp = of.filter((o) => o.respondido && o.dias != null), pend = of.filter((o) => !o.respondido);
    const media = (l) => (l.length ? l.reduce((s, o) => s + o.dias, 0) / l.length : null);
    el.innerHTML += tilesHtml([
      ["Ofícios enviados", nf0.format(of.length), "Prefeitura e Câmara de Vereadores."],
      ["Respondidos", nf0.format(resp.length), of.length ? `${pct(pctN(resp.length, of.length))} do total.` : "–"],
      ["Aguardando resposta", nf0.format(pend.length), pend.length ? `O mais antigo espera há ${nf0.format(Math.max(...pend.map((o) => o.dias || 0)))} dias.` : "–"],
      ["Tempo médio de resposta", media(resp) != null ? nf0.format(media(resp)) + " dias" : "–", "Entre o protocolo e a resposta. A Lei de Acesso à Informação prevê até 20 dias, prorrogáveis por mais 10."],
    ]);
    if (!of.length) { el.innerHTML += aguardando(["numero", "destinatario", "assunto", "data_protocolo", "data_resposta", "situacao", "link"]); return; }
    el.innerHTML += `<div class="grid-2"><div class="card"><h3>Tempo médio de resposta por destinatário</h3><div class="barras" id="of-dest"></div></div><div class="card"><h3>Aguardando resposta há…</h3><div class="barras" id="of-faixa"></div></div></div>
      <div class="card"><h3>Todos os ofícios</h3><div class="tabela-box"><table class="tabela-esp"><thead><tr><th>Ofício</th><th>Assunto</th><th>Protocolo</th><th>Situação</th><th class="dir">Dias</th></tr></thead><tbody>${of.sort((a, b) => (a.respondido - b.respondido) || (b.dias || 0) - (a.dias || 0)).map((o) => {
        const cls = o.respondido ? (o.dias > 30 ? "alerta" : "ok") : o.dias > 30 ? "ruim" : o.dias > 20 ? "alerta" : "ok";
        return `<tr><td><strong>${o.link ? `<a href="${esc(o.link)}">${esc(o.numero)}</a>` : esc(o.numero)}</strong><span class="doc">${esc(o.destinatario)}</span></td><td>${esc(o.assunto)}</td><td class="num">${o.p ? o.p.toLocaleDateString("pt-BR") : "–"}${o.r ? `<span class="doc">Resposta: ${o.r.toLocaleDateString("pt-BR")}</span>` : ""}</td><td><span class="pill ${cls}">${o.respondido ? "Respondido" : "Aguardando"}</span>${o.situacao ? `<span class="doc">${esc(o.situacao)}</span>` : ""}</td><td class="dir num"><strong>${o.dias != null ? nf0.format(o.dias) : "–"}</strong></td></tr>`;
      }).join("")}</tbody></table></div><p class="fonte">Fonte: controle de ofícios do OSB Foz do Iguaçu. Para ofícios sem resposta, os dias são contados até hoje.</p></div>`;
    const dest = new Map(); resp.forEach((o) => { const a = dest.get(o.destinatario) || []; a.push(o.dias); dest.set(o.destinatario, a); });
    barras($("#of-dest"), [...dest.entries()].map(([nome, a]) => ({ nome, valor: a.reduce((s, x) => s + x, 0) / a.length })), "var(--series-1)", null, { porHab: false });
    $("#of-dest").querySelectorAll(".valor").forEach((v, i) => { const a = [...dest.values()][i]; v.innerHTML = `${nf0.format(a.reduce((s, x) => s + x, 0) / a.length)} dias<small>${a.length} ofícios</small>`; });
    const fx = [["até 20 dias", 0, 20], ["21 a 30 dias", 21, 30], ["31 a 60 dias", 31, 60], ["mais de 60 dias", 61, 1e9]].map(([n, a, b]) => ({ nome: n, valor: pend.filter((o) => o.dias >= a && o.dias <= b).length }));
    barras($("#of-faixa"), fx.map((x, i) => ({ ...x, cor: ["var(--good)", "var(--warning)", "var(--series-2)", "var(--critical)"][i] })), "", null, { porHab: false });
    $("#of-faixa").querySelectorAll(".valor").forEach((v, i) => { v.textContent = fx[i].valor; });
  }

  // ============================================================ dispersão genérica
  // pontos: [{x, y, r (opcional, valor para a área), rotulo, destaque, tip}]
  function dispersao(alvo, pontos, opts) {
    opts = opts || {};
    const W = Math.max(320, Math.round(alvo.clientWidth) || 900), H = W < 500 ? Math.round((opts.altura || 460) * 0.85) : (opts.altura || 460);
    const m = { t: 20, r: 30, b: 52, l: 64 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const xs = pontos.map((p) => p.x), ys = pontos.map((p) => p.y);
    const eixo = (min, max, zero) => {
      if (zero) min = 0;
      const span = (max - min) || 1, b = Math.pow(10, Math.floor(Math.log10(span / 5)));
      const passo = [1, 2, 2.5, 5, 10].map((k) => k * b).find((p) => span / p <= 6) || b * 10;
      return { min: Math.floor(min / passo) * passo, max: Math.ceil(max / passo) * passo, passo };
    };
    const ex = eixo(opts.xMin != null ? opts.xMin : Math.min(...xs), opts.xMax != null ? opts.xMax : Math.max(...xs) * 1.04, opts.xZero);
    const ey = eixo(opts.yMin != null ? opts.yMin : Math.min(...ys), opts.yMax != null ? opts.yMax : Math.max(...ys) * 1.04, opts.yZero);
    const X = (v) => m.l + ((v - ex.min) / (ex.max - ex.min)) * iw;
    const Y = (v) => m.t + ih - ((v - ey.min) / (ey.max - ey.min)) * ih;
    const rMax = opts.rMax || 22, vMax = Math.max(...pontos.map((p) => p.r || 0), 1);
    const raio = (p) => (p.r ? Math.max(4, Math.sqrt(p.r / vMax) * rMax) : 7);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.rotulo || "Gráfico de dispersão")}">`;
    for (let v = ex.min; v <= ex.max + ex.passo / 1e3; v += ex.passo) s += `<line x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${m.t + ih}" stroke="var(--line)"/><text x="${X(v)}" y="${m.t + ih + 18}" text-anchor="middle">${(opts.fmtX || String)(v)}</text>`;
    for (let v = ey.min; v <= ey.max + ey.passo / 1e3; v += ey.passo) s += `<line x1="${m.l}" x2="${m.l + iw}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end">${(opts.fmtY || String)(v)}</text>`;
    s += `<text x="${m.l + iw / 2}" y="${H - 8}" text-anchor="middle" style="font-weight:700;fill:var(--ink-2)">${esc(opts.tituloX || "")}</text>`;
    s += `<text transform="translate(16 ${m.t + ih / 2}) rotate(-90)" text-anchor="middle" style="font-weight:700;fill:var(--ink-2)">${esc(opts.tituloY || "")}</text>`;
    (opts.linhas || []).forEach((l) => {
      if (l.x != null) s += `<line x1="${X(l.x)}" x2="${X(l.x)}" y1="${m.t}" y2="${m.t + ih}" stroke="var(--s3)" stroke-width="2" stroke-dasharray="6 5"/><text x="${X(l.x) + 6}" y="${m.t + 14}" style="fill:var(--s3);font-weight:700">${esc(l.rotulo)}</text>`;
      if (l.diag) { const a = Math.max(ex.min, ey.min), b = Math.min(ex.max, ey.max); s += `<line x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}" stroke="var(--ink-3)" stroke-width="1.5" stroke-dasharray="4 5"/><text x="${X(b) - 6}" y="${Y(b) - 8}" text-anchor="end" style="fill:var(--ink-3)">${esc(l.rotulo)}</text>`; }
    });
    const ord = pontos.map((p, i) => ({ ...p, i })).sort((a, b) => (raio(b) - raio(a)));
    ord.forEach((p) => {
      const cor = p.destaque ? "var(--series-2)" : "var(--series-1)";
      s += `<circle class="pt" data-i="${p.i}" cx="${X(p.x)}" cy="${Y(p.y)}" r="${raio(p)}" fill="${cor}" fill-opacity="${p.destaque ? .85 : .35}" stroke="${cor}" stroke-width="2"/>`;
    });
    // rótulos sem sobreposição: Foz primeiro, depois os maiores
    const caixas = pontos.map((p) => { const rr = raio(p), cx = X(p.x), cy = Y(p.y); return { x0: cx - rr, x1: cx + rr, y0: cy - rr, y1: cy + rr }; }), cw = 6.6;
    const livre = (b) => b.x0 >= 0 && b.x1 <= W && b.y0 >= 0 && b.y1 <= H - 30 && !caixas.some((c) => !(b.x1 < c.x0 || b.x0 > c.x1 || b.y1 < c.y0 || b.y0 > c.y1));
    const prio = pontos.map((p, i) => ({ ...p, i })).sort((a, b) => (b.destaque ? 1 : 0) - (a.destaque ? 1 : 0) || raio(b) - raio(a));
    prio.forEach((p) => {
      const cx = X(p.x), cy = Y(p.y), rr = raio(p), w = p.rotulo.length * cw * (p.destaque ? 1.12 : 1), h = 14;
      const tent = [[cx + rr + 4, cy + 4, "start"], [cx - rr - 4, cy + 4, "end"], [cx, cy - rr - 5, "middle"], [cx, cy + rr + 14, "middle"]];
      for (const [tx, ty, an] of tent) {
        const x0 = an === "start" ? tx : an === "end" ? tx - w : tx - w / 2;
        const b = { x0, x1: x0 + w, y0: ty - 11, y1: ty - 11 + h };
        if (livre(b)) { caixas.push(b); s += `<text x="${tx}" y="${ty}" text-anchor="${an}" style="${p.destaque ? "font-weight:800;fill:var(--series-2);font-size:13.5px" : "fill:var(--ink-2)"}">${esc(p.rotulo)}</text>`; break; }
      }
    });
    s += `</svg>`;
    alvo.innerHTML = s;
    alvo.querySelectorAll("circle.pt").forEach((c) => { const p = pontos[Number(c.dataset.i)]; ligaTip(c, p.tip || `<strong>${esc(p.rotulo)}</strong>`); });
  }

  // ============================================================ mapa esquemático das obras
  const REFERENCIAS = [
    ["Ponte da Amizade", -25.5093, -54.6013], ["Marco das Três Fronteiras", -25.5925, -54.5913], ["Centro (Av. Brasil)", -25.5420, -54.5838],
    ["Aeroporto", -25.5963, -54.4872], ["Usina de Itaipu", -25.4079, -54.5888], ["Rodoviária", -25.5257, -54.5555],
  ];
  const COR_SIT = { "Em andamento": "var(--series-2)", "Paralisada": "var(--critical)", "Não iniciada": "var(--s8)", "Em licitação": "var(--series-1)", "Concluída": "var(--good)", "Sem informação": "var(--ink-3)" };
  const grupoSit = (sit) => /parali|suspens/i.test(sit) ? "Paralisada" : /não inic|nao inic|iniciar/i.test(sit) ? "Não iniciada" : /conclu/i.test(sit) ? "Concluída" : /andamento/i.test(sit) ? "Em andamento" : /edital|licita/i.test(sit) ? "Em licitação" : "Sem informação";
  // pontos: [{lat, lon, cor, forma: "c" | "q", r, tip, link, camada}]
  function mapaPontos(alvo, pontos) {
    if (!pontos.length) { alvo.innerHTML = semDados("Nenhuma obra com coordenadas para mostrar."); return; }
    const W = Math.max(320, Math.round(alvo.clientWidth) || 900), H = Math.round(W * (W < 600 ? 1.3 : 0.7));
    const lats = pontos.map((p) => p.lat).concat(REFERENCIAS.map((r) => r[1])), lons = pontos.map((p) => p.lon).concat(REFERENCIAS.map((r) => r[2]));
    let la0 = Math.min(...lats), la1 = Math.max(...lats), lo0 = Math.min(...lons), lo1 = Math.max(...lons);
    const k = Math.cos((la0 + la1) / 2 * Math.PI / 180);
    const padX = (lo1 - lo0) * 0.07, padY = (la1 - la0) * 0.07;
    lo0 -= padX; lo1 += padX; la0 -= padY; la1 += padY;
    const escala = Math.min((W - 40) / ((lo1 - lo0) * k), (H - 40) / (la1 - la0));
    const ox = (W - (lo1 - lo0) * k * escala) / 2, oy = (H - (la1 - la0) * escala) / 2;
    const X = (lon) => ox + (lon - lo0) * k * escala, Y = (lat) => oy + (la1 - lat) * escala;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa esquemático das obras">`;
    s += `<rect x="0" y="0" width="${W}" height="${H}" rx="12" fill="var(--accent-soft)" opacity=".55"/>`;
    for (let la = Math.ceil(la0 * 50) / 50; la < la1; la += 0.02) s += `<line x1="0" x2="${W}" y1="${Y(la)}" y2="${Y(la)}" stroke="var(--line)"/>`;
    for (let lo = Math.ceil(lo0 * 50) / 50; lo < lo1; lo += 0.02) s += `<line y1="0" y2="${H}" x1="${X(lo)}" x2="${X(lo)}" stroke="var(--line)"/>`;
    const km = 2, pxKm = escala / 111 * km;
    s += `<g transform="translate(${W - pxKm - 24} ${H - 24})"><line x1="0" x2="${pxKm}" y1="0" y2="0" stroke="var(--ink-2)" stroke-width="3"/><text x="${pxKm / 2}" y="-6" text-anchor="middle">${km} km</text></g>`;
    s += `<g transform="translate(26 30)"><path d="M0,-14 L7,6 L0,1 L-7,6 Z" fill="var(--ink-2)"/><text x="0" y="22" text-anchor="middle" style="font-weight:800">N</text></g>`;
    REFERENCIAS.forEach(([n, la, lo]) => { s += `<g><rect x="${X(lo) - 4}" y="${Y(la) - 4}" width="8" height="8" transform="rotate(45 ${X(lo)} ${Y(la)})" fill="var(--ink-3)"/><text x="${X(lo) + 8}" y="${Y(la) + 4}" style="fill:var(--ink-3);font-style:italic">${esc(n)}</text></g>`; });
    const ord = pontos.map((p, i) => ({ ...p, i })).sort((a, b) => b.r - a.r);
    ord.forEach((p) => {
      const x = X(p.lon), y = Y(p.lat), r = p.r;
      const forma = p.forma === "q" ? `<rect class="pt" data-i="${p.i}" x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" rx="3" fill="${p.cor}" fill-opacity=".85" stroke="#fff" stroke-width="2"/>`
        : `<circle class="pt" data-i="${p.i}" cx="${x}" cy="${y}" r="${r}" fill="${p.cor}" fill-opacity=".85" stroke="#fff" stroke-width="2.5"/>`;
      s += `<a class="cam-${p.camada}" href="${p.link}" target="_blank" rel="noopener">${forma}</a>`;
    });
    s += `</svg>`;
    alvo.innerHTML = s;
    alvo.querySelectorAll(".pt").forEach((c) => { ligaTip(c, pontos[Number(c.dataset.i)].tip + `<br><span style="opacity:.8">Clique para abrir no Google Maps</span>`); });
  }


  // ------------------------------------------------------------ emendas impositivas
  const SIT_CLASSE = { "Paga": "ok", "Empenhada, falta pagar": "alerta", "Executada em parte": "alerta", "Com gasto (valor da emenda a confirmar)": "alerta",
    "Sem vínculo claro": "alerta", "A conferir": "ruim", "Nenhum gasto encontrado": "ruim" };
  const SIT_EXPLICA = {
    "Paga": "Os empenhos ligados à emenda já foram pagos (95% ou mais do valor).",
    "Empenhada, falta pagar": "A Prefeitura reservou o dinheiro (empenho), mas ainda não pagou tudo.",
    "Executada em parte": "Há empenhos ligados à emenda, mas somam menos que o valor aprovado.",
    "Com gasto (valor da emenda a confirmar)": "Há empenhos que citam a emenda, mas o valor dela não pôde ser lido no documento da Câmara.",
    "Sem vínculo claro": "Houve gasto na mesma ação do orçamento, mas nenhum empenho cita a emenda nem foi pago ao beneficiário indicado.",
    "A conferir": "A emenda aparece citada só em empenho de outro credor, diferente do beneficiário indicado.",
    "Nenhum gasto encontrado": "Nenhum empenho cita a emenda e não houve gasto na ação do orçamento indicada por ela.",
  };
  function paginaEmendas(el) {
    const MESES_N = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const remessa = (r) => /^\d{4}\/\d{2}$/.test(r || "") ? `${MESES_N[Number(r.slice(5)) - 1]} de ${r.slice(0, 4)}` : (r || "–");
    el.innerHTML = topoEsp("Emendas impositivas", "Todo ano, cada vereador indica onde a Prefeitura deve gastar uma parte do orçamento: um repasse a uma entidade, a compra de um equipamento, uma reforma. A Constituição obriga a Prefeitura a executar essas emendas, salvo impedimento técnico, e pelo menos metade do valor precisa ir para a Saúde. Aqui você acompanha, emenda por emenda, o que já virou empenho e pagamento.", "lupa-prancheta");
    const E = DADOS.emendas;
    if (!E) { el.innerHTML += semDados("As emendas impositivas aparecem quando o resumo das emendas for gerado (programa emendas.py)."); return; }
    const L = E.lista, soma = (a, k) => a.reduce((s, x) => s + (x[k] || 0), 0);
    const pagoDe = (x) => Math.min(x.pago, x.valor || x.pago), somaPago = (a) => a.reduce((s, x) => s + pagoDe(x), 0);
    const SITS = E.situacoes.filter((s) => L.some((x) => x.situacao === s));
    const COR = Object.fromEntries(SITS.map((s) => [s, `var(--em${E.situacoes.indexOf(s) + 1})`]));
    const VER = [...new Set(L.flatMap((x) => x.autores))].sort((a, b) => a.localeCompare(b, "pt"));
    const AREAS = ["Saúde", "Geral", "Não informada"].filter((a) => L.some((x) => x.area === a));
    const F = { sit: "", ver: "", area: "", q: "" };
    let lim = 25;

    el.innerHTML += `
      <div class="em-filtros card" id="em-filtros">
        <div class="filtros">
          <label for="em-busca">Buscar por objeto, entidade ou número<input id="em-busca" type="search" placeholder="Ex.: APAE, UBS, ambulância, 120"></label>
          <label for="em-vereador">Vereador<select id="em-vereador"><option value="">Todos os vereadores</option>${VER.map((a) => `<option>${esc(a)}</option>`).join("")}</select></label>
          <label for="em-sitf">Situação<select id="em-sitf"><option value="">Todas as situações</option>${SITS.map((s) => `<option>${esc(s)}</option>`).join("")}</select></label>
          <label for="em-areaf">Área<select id="em-areaf"><option value="">Todas as áreas</option>${AREAS.map((a) => `<option>${esc(a)}</option>`).join("")}</select></label>
        </div>
        <div class="em-ativos" id="em-ativos" aria-live="polite"></div>
      </div>
      <div id="em-aviso"></div>
      <div id="em-tiles"></div>
      <div class="card"><h3>Situação das emendas</h3>
        <p class="intro" style="font-size:.9rem;margin-top:-4px">Clique numa situação para filtrar a página inteira. Clique de novo para tirar o filtro.</p>
        <div class="em-sit"><div class="em-rosca" id="em-rosca"></div><ul class="em-leg" id="em-leg"></ul></div>
        <p class="intro" style="font-size:.88rem">A execução das emendas cabe à Prefeitura. Uma emenda sem gasto não quer dizer, sozinha, que houve irregularidade: pode haver impedimento técnico, convênio em andamento ou atraso no envio dos dados ao Tribunal de Contas.</p></div>
      <div class="grid-2"><div class="card"><h3>Por vereador</h3>
          <div class="em-leg-mini"><span><i class="marca" style="background:var(--em-aprov)"></i>Valor aprovado</span><span><i class="marca" style="background:var(--series-2)"></i>Já pago</span></div>
          <div class="em-barras" id="em-ver"></div>
          <p class="intro" style="font-size:.85rem">Clique no nome para ver todas as emendas do vereador na tabela. Emendas assinadas por mais de um vereador foram divididas igualmente entre eles.</p></div>
        <div class="card"><h3>Por área</h3>
          <div class="em-leg-mini"><span><i class="marca" style="background:var(--em-aprov)"></i>Valor aprovado</span><span><i class="marca" style="background:var(--series-2)"></i>Já pago</span></div>
          <div class="em-barras" id="em-area"></div>
          <h3 style="margin-top:22px">Quem mais recebeu</h3><p class="intro" style="font-size:.85rem;margin-top:-6px">Empenhos ligados às emendas do filtro atual.</p><div class="barras" id="em-cred"></div></div></div>
      <div class="card"><h3>Pontos a conferir</h3><p class="intro" style="font-size:.9rem">Situações encontradas no cruzamento que merecem pergunta à Prefeitura ou à Câmara.</p><ul class="lista-alertas" id="em-alertas"></ul></div>
      <div class="card" id="em-tabela"><h3 id="em-tab-titulo">Todas as emendas</h3>
        <div class="tabela-box"><table class="tabela-esp"><thead><tr><th>Emenda</th><th>Objeto</th><th class="dir">Valor aprovado</th><th class="dir">Empenhado</th><th class="dir">Pago</th><th>Situação</th></tr></thead><tbody id="em-corpo"></tbody></table></div>
        <p class="intro" id="em-resumo" style="font-size:.88rem"></p><button type="button" class="btn" id="em-mais">Mostrar mais</button>
        <p class="fonte">Fontes: emendas e textos aprovados, SAPL da Câmara Municipal de Foz do Iguaçu (orçamento de ${E.ano_orcamento}); empenhos e pagamentos, TCE-PR, SIM-AM (dados até ${esc(remessa(E.remessa_tce))}). Um empenho é ligado à emenda quando o histórico dele cita o número da emenda, ou quando foi feito na ação do orçamento indicada pela emenda e para o beneficiário indicado nela (CNPJ). Empenhos que atendem várias emendas foram divididos na proporção do valor de cada uma. Valores anulados foram descontados. ${E.nao_impositivas ? E.nao_impositivas + " emendas que não são impositivas (do Executivo ou modificativas) ficaram de fora." : ""}</p></div>`;

    // ---- filtro: cada bloco usa todos os filtros, menos o que ele mesmo controla (para continuar mostrando as opções)
    const casa = (x, sem) => (sem === "sit" || !F.sit || x.situacao === F.sit) && (sem === "ver" || !F.ver || x.autores.includes(F.ver)) &&
      (sem === "area" || !F.area || x.area === F.area) &&
      (!F.q || (/^\d+$/.test(F.q) ? String(x.n) === F.q : semAcento(x.objeto + " " + x.autores.join(" ") + " " + x.empenhos.map((i) => i.credor).join(" ")).includes(F.q)));
    const filtra = (sem) => L.filter((x) => casa(x, sem));
    const muda = (k, v, rolar) => { F[k] = F[k] === v ? "" : v; lim = 25; tudo(); if (rolar) $("#em-tabela").scrollIntoView({ behavior: "smooth", block: "start" }); };

    function rosca(lista) {
      const tot = soma(lista, "valor") || 1, W = 240, R = 110, r = 70, c = W / 2;
      const grupos = SITS.map((s) => { const g = lista.filter((x) => x.situacao === s); return { s, qtd: g.length, valor: soma(g, "valor") }; });
      let a0 = -Math.PI / 2, svg = `<svg viewBox="0 0 ${W} ${W}" role="img" aria-label="Situação das emendas, por valor aprovado">`;
      const pt = (a, rr) => `${(c + rr * Math.cos(a)).toFixed(2)},${(c + rr * Math.sin(a)).toFixed(2)}`;
      grupos.forEach((g, i) => {
        if (!g.valor) return;
        const ang = g.valor / tot * Math.PI * 2, a1 = a0 + ang, big = ang > Math.PI ? 1 : 0;
        const d = ang >= Math.PI * 2 - 1e-6
          ? `M${pt(a0, R)}A${R},${R} 0 1 1 ${pt(a0 + Math.PI, R)}A${R},${R} 0 1 1 ${pt(a0, R)}M${pt(a0, r)}A${r},${r} 0 1 0 ${pt(a0 + Math.PI, r)}A${r},${r} 0 1 0 ${pt(a0, r)}Z`
          : `M${pt(a0, R)}A${R},${R} 0 ${big} 1 ${pt(a1, R)}L${pt(a1, r)}A${r},${r} 0 ${big} 0 ${pt(a0, r)}Z`;
        const apag = F.sit && F.sit !== g.s;
        svg += `<path class="em-fatia" data-s="${esc(g.s)}" d="${d}" fill="${COR[g.s]}" stroke="var(--surface)" stroke-width="2" fill-rule="evenodd" opacity="${apag ? 0.25 : 1}" tabindex="0" role="button" aria-label="${esc(g.s)}: ${g.qtd} emendas, ${reais(g.valor)}"/>`;
        a0 = a1;
      });
      const sel = F.sit ? grupos.find((g) => g.s === F.sit) : null;
      svg += `<text x="${c}" y="${c - 6}" text-anchor="middle" class="em-centro-v num">${reais(sel ? sel.valor : tot)}</text>`;
      svg += `<text x="${c}" y="${c + 16}" text-anchor="middle" class="em-centro-r">${sel ? `${sel.qtd} emendas · ${pct(sel.valor / tot * 100)}` : `${lista.length} emendas`}</text></svg>`;
      $("#em-rosca").innerHTML = svg;
      $("#em-rosca").querySelectorAll(".em-fatia").forEach((p) => {
        const g = grupos.find((x) => x.s === p.dataset.s);
        ligaTip(p, `<strong>${esc(g.s)}</strong><br>${g.qtd} emendas · ${brl.format(g.valor)}<br>${pct(g.valor / tot * 100)} do valor<br><span style="opacity:.85">${esc(SIT_EXPLICA[g.s] || "")}</span>`);
        p.addEventListener("click", () => muda("sit", g.s));
        p.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); muda("sit", g.s); } });
      });
      $("#em-leg").innerHTML = grupos.map((g) => `<li><button type="button" class="em-leg-item" data-s="${esc(g.s)}" aria-pressed="${F.sit === g.s}" ${g.qtd ? "" : "disabled"}>
          <i class="marca" style="background:${COR[g.s]}"></i><span class="em-leg-nome">${esc(g.s)}<small>${g.qtd} ${g.qtd === 1 ? "emenda" : "emendas"}</small></span>
          <span class="em-leg-val num">${reais(g.valor)}<small>${pct(g.valor / tot * 100)}</small></span></button></li>`).join("");
      $("#em-leg").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => muda("sit", b.dataset.s)));
    }

    function barrasDuplas(alvo, itens, chave, ativo, rolar) {
      const max = Math.max(...itens.map((i) => i.valor), 1);
      alvo.innerHTML = itens.map((i) => `<div class="em-barra${ativo && ativo !== i.nome ? " apagada" : ""}">
          <button type="button" class="em-nome" data-v="${esc(i.nome)}" aria-pressed="${ativo === i.nome}">${esc(i.nome)}</button>
          <span class="em-trilho" style="--w:${(i.valor / max * 100).toFixed(2)}%"><span class="em-aprov"></span><span class="em-pago" style="width:${(Math.min(i.pago, i.valor) / max * 100).toFixed(2)}%"></span></span>
          <span class="valor num">${reais(i.valor)}<small>${pct(pctN(i.pago, i.valor))} pago</small></span></div>`).join("") || `<p class="intro">Nada neste filtro.</p>`;
      alvo.querySelectorAll(".em-barra").forEach((row, k) => { const i = itens[k]; ligaTip(row.querySelector(".em-trilho"), `<strong>${esc(i.nome)}</strong><br>${i.qtd} emendas<br>Aprovado: ${brl.format(i.valor)}<br>Já pago: ${brl.format(i.pago)} (${pct(pctN(i.pago, i.valor))})`); });
      alvo.querySelectorAll(".em-nome").forEach((b) => b.addEventListener("click", () => muda(chave, b.dataset.v, rolar && F[chave] !== b.dataset.v)));
    }

    function tudo() {
      escondeTip();
      $("#em-busca").value !== F.q && document.activeElement !== $("#em-busca") && ($("#em-busca").value = F.q);
      $("#em-vereador").value = F.ver; $("#em-sitf").value = F.sit; $("#em-areaf").value = F.area;
      const lista = filtra();
      // filtros ativos
      const at = [["sit", "Situação"], ["ver", "Vereador"], ["area", "Área"]].filter(([k]) => F[k]).map(([k, r]) => `<button type="button" class="chip" aria-pressed="true" data-k="${k}">${r}: ${esc(F[k])} ✕</button>`);
      if (F.q) at.push(`<button type="button" class="chip" aria-pressed="true" data-k="q">Busca: ${esc($("#em-busca").value)} ✕</button>`);
      $("#em-ativos").innerHTML = at.length ? `<span class="em-ativos-rot">Filtrando por</span>${at.join("")}<button type="button" class="btn-link" id="em-limpa">Limpar tudo</button>` : "";
      $("#em-ativos").querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => { F[b.dataset.k] = ""; if (b.dataset.k === "q") $("#em-busca").value = ""; lim = 25; tudo(); }));
      const lp = $("#em-limpa"); if (lp) lp.addEventListener("click", () => { F.sit = F.ver = F.area = F.q = ""; $("#em-busca").value = ""; lim = 25; tudo(); });
      // aviso de emendas sem valor
      const semValor = lista.filter((x) => !x.valor);
      $("#em-aviso").innerHTML = semValor.length ? `<p class="card vazio">Atenção: ${nf0.format(semValor.length)} emendas estão sem valor porque o texto delas não pôde ser lido. Os totais não incluem essas emendas.</p>` : "";
      // números
      const v = soma(lista, "valor"), p = somaPago(lista), nada = lista.filter((x) => x.situacao === "Nenhum gasto encontrado"), sa = lista.filter((x) => x.area === "Saúde");
      $("#em-tiles").innerHTML = tilesHtml([
        [F.sit || F.ver || F.area || F.q ? "Emendas no filtro" : "Emendas aprovadas", nf0.format(lista.length), `${reais(v)} no orçamento de ${E.ano_orcamento}.`],
        ["Já pago", reais(p), `${pct(pctN(p, v))} do valor, com dados enviados ao Tribunal de Contas até ${remessa(E.remessa_tce)}.`],
        ["Nenhum gasto encontrado", nf0.format(nada.length), `${reais(soma(nada, "valor"))} em emendas sem nenhum empenho até agora.`],
        ["Para a Saúde", pct(pctN(soma(sa, "valor"), v)), `${nf0.format(sa.length)} emendas. A lei exige pelo menos metade do valor total.`],
      ]);
      rosca(filtra("sit"));
      // por vereador
      const mv = new Map();
      filtra("ver").forEach((x) => { const n = x.autores.length || 1; (x.autores.length ? x.autores : ["Sem autor"]).forEach((a) => { const o = mv.get(a) || { nome: a, valor: 0, pago: 0, qtd: 0 }; o.valor += x.valor / n; o.pago += pagoDe(x) / n; o.qtd++; mv.set(a, o); }); });
      barrasDuplas($("#em-ver"), [...mv.values()].sort((a, b) => b.valor - a.valor), "ver", F.ver, true);
      const la = filtra("area");
      barrasDuplas($("#em-area"), AREAS.map((a) => { const g = la.filter((x) => x.area === a); return { nome: a, valor: soma(g, "valor"), pago: somaPago(g), qtd: g.length }; }).filter((x) => x.qtd), "area", F.area, false);
      const cred = new Map(); lista.forEach((x) => x.empenhos.filter((i) => !i.divergente).forEach((i) => cred.set(i.credor, (cred.get(i.credor) || 0) + i.empenhado)));
      const tc = [...cred.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8);
      if (tc.length) barras($("#em-cred"), tc, "var(--series-2)", null, { porHab: false }); else $("#em-cred").innerHTML = `<p class="intro">Nenhum empenho ligado às emendas deste filtro.</p>`;
      // pontos a conferir
      const grupos = new Map(); lista.filter((x) => x.alertas.length).forEach((x) => new Set(x.alertas.map((a) => a.replace(/:.*$/, ""))).forEach((k) => { if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(x); }));
      const itensAl = [...grupos.entries()].map(([k, xs]) => `<li><strong>${esc(k)}</strong>: ${xs.length === 1 ? "emenda" : "emendas"} ${xs.slice(0, 12).map((x) => `<a href="#emendas" data-em="${x.n}">${x.n}</a>`).join(", ")}${xs.length > 12 ? ` e mais ${xs.length - 12}` : ""} (${reais(soma(xs, "valor"))}).</li>`);
      if (!F.sit && !F.ver && !F.area && !F.q && E.fora_da_lista && E.fora_da_lista.length)
        itensAl.push(`<li><strong>Empenhos de ${anoAtual} que citam emendas fora desta lista</strong>, por exemplo de orçamentos anteriores: ${E.fora_da_lista.slice(0, 8).map((f) => `${esc(f.emenda)} (${reais(f.empenhado)})`).join(", ")}${E.fora_da_lista.length > 8 ? ` e mais ${E.fora_da_lista.length - 8}` : ""}.</li>`);
      $("#em-alertas").innerHTML = itensAl.join("") || "<li>Nenhum ponto a conferir neste filtro.</li>";
      // tabela
      $("#em-tab-titulo").textContent = F.ver ? `Emendas de ${F.ver}` : (F.sit || F.area || F.q ? "Emendas no filtro" : "Todas as emendas");
      const vis = F.ver ? lista : lista.slice(0, lim);
      $("#em-corpo").innerHTML = vis.map(linha).join("") || `<tr><td colspan="6">Nenhuma emenda encontrada com esses filtros.</td></tr>`;
      $("#em-corpo").querySelectorAll(".em-autor").forEach((b) => b.addEventListener("click", () => muda("ver", b.dataset.v, false)));
      const coletivas = F.ver ? lista.filter((x) => x.autores.length > 1).length : 0;
      $("#em-resumo").textContent = `${nf0.format(lista.length)} emendas, somando ${brl2.format(soma(lista, "valor"))} aprovados e ${brl2.format(somaPago(lista))} pagos.` +
        (coletivas ? ` ${coletivas} delas são coletivas e aparecem aqui pelo valor inteiro; no gráfico por vereador, o valor é dividido entre os autores.` : "");
      $("#em-mais").hidden = vis.length >= lista.length;
    }

    const linha = (x) => {
      const det = x.empenhos.length ? `<details><summary>${x.empenhos.length} ${x.empenhos.length > 1 ? "empenhos ligados" : "empenho ligado"}</summary><ul class="em-emp">${x.empenhos.map((i) => `<li><span class="num">${esc(i.nr)} · ${fmtDataBR(i.data)}</span> · ${esc(i.credor)} · empenhado ${brl2.format(i.empenhado)}, pago ${brl2.format(i.pago)}<span class="doc">${esc(i.vinculo)}${i.dividido ? " · dividido com outras emendas" : ""}${i.divergente ? " · credor diferente do beneficiário: não entra na soma" : ""}</span></li>`).join("")}</ul></details>` : "";
      return `<tr><td><strong>${x.n}/${E.ano_orcamento - 1}</strong><span class="doc">${x.autores.map((a) => `<button type="button" class="em-autor${F.ver === a ? " ativo" : ""}" data-v="${esc(a)}">${esc(a)}</button>`).join(", ")} · ${esc(x.area)}</span>${x.url ? `<a class="doc" href="${esc(x.url)}" target="_blank" rel="noopener">Texto da emenda ↗</a>` : ""}</td>
        <td>${esc(x.objeto)}${x.alertas.length ? `<span class="doc em-alerta">⚠ ${x.alertas.map(esc).join(" · ")}</span>` : ""}${det}</td>
        <td class="dir num"><strong>${x.valor ? brl2.format(x.valor) : "–"}</strong></td><td class="dir num">${brl2.format(x.empenhado)}</td><td class="dir num">${brl2.format(x.pago)}</td>
        <td><span class="pill ${SIT_CLASSE[x.situacao] || "alerta"}" title="${esc(SIT_EXPLICA[x.situacao] || "")}"><i class="marca" style="background:${COR[x.situacao]}"></i>${esc(x.situacao)}</span></td></tr>`;
    };

    $("#em-busca").addEventListener("input", () => { F.q = semAcento($("#em-busca").value.trim()); lim = 25; tudo(); });
    $("#em-vereador").addEventListener("change", (e) => { F.ver = e.target.value; lim = 25; tudo(); });
    $("#em-sitf").addEventListener("change", (e) => { F.sit = e.target.value; lim = 25; tudo(); });
    $("#em-areaf").addEventListener("change", (e) => { F.area = e.target.value; lim = 25; tudo(); });
    $("#em-mais").addEventListener("click", () => { lim += 50; tudo(); });
    $("#em-alertas").addEventListener("click", (ev) => { const a = ev.target.closest("a[data-em]"); if (!a) return; ev.preventDefault(); F.sit = F.ver = F.area = ""; F.q = a.dataset.em; $("#em-busca").value = a.dataset.em; lim = 25; tudo(); $("#em-tabela").scrollIntoView({ behavior: "smooth", block: "start" }); });
    tudo();
  }

  Object.assign(ESPECIAIS, {
    "caminho-do-dinheiro": paginaCaminho, "camara": paginaCamara, "transporte": paginaTransporte, "alugueis": paginaAlugueis,
    "obras": paginaObras, "sem-licitacao": paginaSemLicitacao, "licitacoes-monitoradas": paginaLicitacoesOSB, "oficios": paginaOficios,
    "emendas": paginaEmendas,
  });
  const TITULOS = { "caminho-do-dinheiro": "O caminho do dinheiro", camara: "Temas · Câmara de Vereadores", transporte: "Temas · Transporte coletivo", alugueis: "Temas · Aluguéis de imóveis",
    obras: "Temas · Obras", "sem-licitacao": "Temas · Contratações sem licitação", diarias: "Temas · Diárias e passagens", gratificacoes: "Temas · Gratificações",
    "horas-extras": "Temas · Horas extras", remuneracao: "Temas · Remuneração dos servidores", "licitacoes-monitoradas": "Atuação do OSB · Licitações acompanhadas", oficios: "Atuação do OSB · Ofícios enviados",
    emendas: "Temas · Emendas impositivas" };

  // ============================================================ slider de destaques
  let slAtual = 0, slTimer = null, slPausado = false;
  function slides() {
    const r = A.receitas, d = A.despesas, f = d.por_funcao.slice().sort((a, b) => b.valor - a.valor), baseF = f.reduce((s, x) => s + x.valor, 0);
    const S = [];
    S.push({ tag: `Receitas · ${anoAtual}${ateMes()}`, num: reais(r.arrecadado), txt: "entraram nos cofres do município", det: `Isso dá ${brl.format(r.arrecadado / POP)} por morador. Veja de onde vem cada real.`, link: "#receitas", cta: "De onde vem o dinheiro", img: "lupa-prancheta", foto: "cidade" });
    const gR = (r.grupos || []).find((g) => /Royalties/i.test(g.grupo));
    if (gR) { const vR = gR.itens.reduce((a, i) => a + i.valor, 0); if (vR > 0) S.push({ tag: `Royalties de Itaipu · ${anoAtual}${ateMes()}`, num: reais(vR), txt: "pagos pela Itaipu Binacional ao município", det: `São R$ ${nf0.format(vR / r.arrecadado * 100)} de cada R$ 100 que a Prefeitura arrecadou. Veja onde esse dinheiro foi usado.`, link: "#caminho-do-dinheiro", cta: "Para onde foram os royalties", img: "lupa-acenando", foto: "itaipu" }); }
    S.push({ tag: "Para onde vai", num: `R$ ${nf0.format(f[0].valor / baseF * 100)}`, txt: `de cada R$ 100 gastos foram para ${f[0].funcao.toLowerCase()}`, det: `${f[1].funcao} vem em seguida, com R$ ${nf0.format(f[1].valor / baseF * 100)} de cada R$ 100.`, link: "#caminho-do-dinheiro", cta: "Siga o caminho do dinheiro", img: "lupa-acenando", foto: "panorama" });
    const ip = A.indicadores;
    if (ip.pessoal_rcl_pct) S.push({ tag: "Lei de Responsabilidade Fiscal", num: pct(ip.pessoal_rcl_pct), txt: ip.pessoal_rcl_pct > 54 ? "da receita vai para pessoal, acima do limite de 54%" : "da receita vai para gastos com pessoal", det: "Percentual informado pela Prefeitura no Relatório de Gestão Fiscal.", link: "#limites", cta: "Ver os limites da lei", img: "lupa-pensando", foto: "prefeitura" });
    if (DADOS.camara) { const C = DADOS.camara, comp = C.comparativo.map((c) => ({ ...c, v: c.despesa / c.cadeiras })).sort((a, b) => b.v - a.v), pos = comp.findIndex((c) => /Foz/.test(c.municipio)) + 1; S.push({ tag: "Câmara de Vereadores", num: `${pos}º`, txt: `maior custo por cadeira entre ${comp.length} câmaras do Paraná`, det: `${brl.format(comp[pos - 1].v / C.meses_comparacao)} por cadeira, por mês, em ${C.periodo_comparacao}.`, link: "#camara", cta: "Ver as contas da Câmara", img: "lupa-notebook", foto: "camara" }); }
    if (DADOS.transporte) { const M = DADOS.transporte.mensal, a = M[M.length - 1].mes.slice(0, 4), l = M.filter((m) => m.mes.startsWith(a)); S.push({ tag: "Transporte coletivo", num: reais(l.reduce((s, m) => s + m.aporte_municipio, 0)), txt: `de dinheiro da Prefeitura para manter os ônibus em ${a}`, det: `Isso cobre ${pct(pctN(l.reduce((s, m) => s + m.aporte_municipio, 0), l.reduce((s, m) => s + m.custo_total, 0)))} do custo do sistema.`, link: "#transporte", cta: "Entenda o transporte", img: "lupa-anotando", foto: "onibus" }); }
    const he = A.componentes_folha && A.componentes_folha["Horas extras (serviços extraordinários)"];
    if (he && he.mensal.length > 1 && he.mensal[0] > 0) { const v = (he.mensal[he.mensal.length - 1] / he.mensal[0] - 1) * 100; S.push({ tag: "Horas extras", num: (v >= 0 ? "+" : "") + nf0.format(v) + "%", txt: `no gasto mensal com horas extras de janeiro a ${MESES_LONGO[he.mensal.length - 1]}`, det: `Foram ${reais(he.total)} no período.`, link: "#horas-extras", cta: "Ver horas extras", img: "lupa-pensando", foto: "prefeitura" }); }
    const sl = T() && T().sem_licitacao;
    if (sl) { const R = sl.resumo, n = (R.Dispensa ? R.Dispensa.qtd : 0) + (R.Inexigibilidade ? R.Inexigibilidade.qtd : 0), tot = Object.values(R).reduce((s, x) => s + x.qtd, 0); S.push({ tag: "Compras sem licitação", num: nf0.format(n), txt: `processos sem licitação em ${anoAtual}`, det: `${pct(pctN(n, tot))} de todos os processos de compra abertos no ano.`, link: "#sem-licitacao", cta: "Ver as contratações", img: "lupa-notebook", foto: "prefeitura" }); }
    const Em = DADOS.emendas;
    if (Em && Em.lista.length) { const L = Em.lista, v = L.reduce((s, x) => s + x.valor, 0), p = L.reduce((s, x) => s + Math.min(x.pago, x.valor || x.pago), 0), n0 = L.filter((x) => x.situacao === "Nenhum gasto encontrado").length; S.push({ tag: "Emendas dos vereadores", num: `R$ ${nf0.format(p / v * 100)}`, txt: `de cada R$ 100 das emendas impositivas de ${Em.ano_orcamento} já foram pagos`, det: `São ${nf0.format(L.length)} emendas e ${reais(v)}. ${nf0.format(n0)} ainda não tiveram nenhum gasto.`, link: "#emendas", cta: "Acompanhe cada emenda", foto: "camara", img: "lupa-prancheta" }); }
    const FO = DADOS.foco_na_obra && DADOS.foco_na_obra.obras;
    if (FO && FO.length) { const par = FO.filter((o) => o.grupo === "Paralisada").length, and = FO.filter((o) => o.grupo === "Em andamento").length; S.push({ tag: "Obras públicas", num: nf0.format(FO.length), txt: "obras acompanhadas pelo OSB no projeto Foco na Obra", det: `${and} em andamento e ${par} paralisada${par === 1 ? "" : "s"}. Veja no mapa onde ficam e quanto já foi executado.`, link: "#obras", cta: "Ver as obras no mapa", img: "lupa-anotando", foto: "obras" }); }
    return S;
  }

  // ------------------------------------------------------------ fotos de fundo do slider
  // Cada foto fica em img/fotos/<chave>.jpg. Se o arquivo não existir, o slide usa a foto "padrao" ou o fundo verde.
  const FOTOS = {
    cidade:     { credito: "", pos: "center" },
    panorama:   { credito: "", pos: "center" },
    itaipu:     { credito: "", pos: "center" },
    prefeitura: { credito: "", pos: "center" },
    camara:     { credito: "", pos: "center" },
    onibus:     { credito: "", pos: "center" },
    obras:      { credito: "", pos: "center" },
    padrao:     { credito: "", pos: "center" },
  };
  const fotoOk = {};
  function carregaFoto(k) {
    if (!k || !FOTOS[k]) return Promise.resolve(false);
    if (k in fotoOk) return Promise.resolve(fotoOk[k]);
    return new Promise((res) => { const im = new Image(); im.onload = () => res(fotoOk[k] = true); im.onerror = () => res(fotoOk[k] = false); im.src = `img/fotos/${k}.jpg`; });
  }
  async function aplicaFotos(S) {
    const camadas = document.querySelectorAll("#sl-fotos .sl-foto");
    for (let i = 0; i < S.length; i++) {
      let k = S[i].foto;
      if (!(await carregaFoto(k))) k = (await carregaFoto("padrao")) ? "padrao" : null;
      S[i].fotoUsada = k;
      const c = camadas[i]; if (!c) continue;
      if (k) { c.style.backgroundImage = `url("img/fotos/${k}.jpg")`; c.style.backgroundPosition = FOTOS[k].pos || "center"; c.classList.add("tem"); }
    }
    slCredito();
  }
  let slLista = [];
  function slCredito() {
    const el = $("#sl-cred"); if (!el) return;
    const s = slLista[slAtual], k = s && s.fotoUsada, c = k && FOTOS[k].credito;
    el.textContent = c ? c : ""; el.hidden = !c;
    $("#slider").classList.toggle("com-foto", !!k);
  }
  function montaSlider() {
    const S = slides();
    $("#slides").innerHTML = S.map((s, i) => `<article class="slide${i === slAtual % S.length ? " ativo" : ""}" role="group" aria-roledescription="destaque" aria-label="${i + 1} de ${S.length}"><div><span class="sl-tag">${esc(s.tag)}</span><div class="sl-num">${esc(s.num)}</div><p class="sl-txt">${esc(s.txt)}</p><p class="sl-det">${esc(s.det)}</p><a class="sl-cta" href="${s.link}">${esc(s.cta)} →</a></div><img src="img/${s.img}.webp" alt=""></article>`).join("");
    $("#sl-dots").innerHTML = S.map((s, i) => `<button type="button" role="tab" aria-label="Destaque ${i + 1}" aria-selected="${i === slAtual % S.length}" data-i="${i}"></button>`).join("");
    slAtual = slAtual % S.length;
    $("#sl-fotos").innerHTML = S.map((s, i) => `<div class="sl-foto${i === slAtual ? " ativo" : ""}"></div>`).join("");
    slLista = S; aplicaFotos(S);
  }
  function slIr(i) {
    const els = document.querySelectorAll("#slides .slide"), dots = document.querySelectorAll("#sl-dots button");
    if (!els.length) return;
    slAtual = (i + els.length) % els.length;
    els.forEach((e, k) => e.classList.toggle("ativo", k === slAtual));
    dots.forEach((d, k) => d.setAttribute("aria-selected", String(k === slAtual)));
    document.querySelectorAll("#sl-fotos .sl-foto").forEach((e, k) => e.classList.toggle("ativo", k === slAtual));
    slCredito();
  }
  function slAuto() {
    clearInterval(slTimer);
    const reduz = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!slPausado && !reduz) slTimer = setInterval(() => slIr(slAtual + 1), 7000);
    $("#sl-pausa").textContent = slPausado || reduz ? "▶" : "❚❚";
    $("#sl-pausa").setAttribute("aria-label", slPausado || reduz ? "Retomar destaques" : "Pausar destaques");
  }
  function iniciaSlider() {
    $("#sl-ant").addEventListener("click", () => { slIr(slAtual - 1); slAuto(); });
    $("#sl-prox").addEventListener("click", () => { slIr(slAtual + 1); slAuto(); });
    $("#sl-pausa").addEventListener("click", () => { slPausado = !slPausado; slAuto(); });
    $("#sl-dots").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { slIr(Number(b.dataset.i)); slAuto(); } });
    const sl = $("#slider");
    sl.addEventListener("mouseenter", () => clearInterval(slTimer));
    sl.addEventListener("mouseleave", slAuto);
    sl.addEventListener("focusin", () => clearInterval(slTimer));
    sl.addEventListener("focusout", slAuto);
  }

  // ============================================================ menu
  function iniciaMenu() {
    const btn = $("#menu-btn"), menu = $("#menu-principal");
    btn.addEventListener("click", () => { const ab = menu.classList.toggle("aberto"); btn.setAttribute("aria-expanded", String(ab)); });
    menu.querySelectorAll(".tem-sub > button").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const ab = b.getAttribute("aria-expanded") !== "true";
      menu.querySelectorAll(".tem-sub > button").forEach((x) => x.setAttribute("aria-expanded", "false"));
      b.setAttribute("aria-expanded", String(ab));
    }));
    document.addEventListener("click", (e) => { if (!e.target.closest(".menu")) menu.querySelectorAll(".tem-sub > button").forEach((x) => x.setAttribute("aria-expanded", "false")); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") menu.querySelectorAll(".tem-sub > button").forEach((x) => x.setAttribute("aria-expanded", "false")); });
    menu.addEventListener("click", (e) => { if (e.target.closest("a")) { menu.classList.remove("aberto"); btn.setAttribute("aria-expanded", "false"); menu.querySelectorAll(".tem-sub > button").forEach((x) => x.setAttribute("aria-expanded", "false")); } });
  }

  function render() {
    anoAtual = $("#ano").value;
    A = DADOS.anos[anoAtual];
    document.querySelectorAll("[data-ano]").forEach((e) => (e.textContent = anoAtual));
    $("#resumo-periodo").textContent = A.meses < 12
      ? `Valores de janeiro a ${MESES_LONGO[A.meses - 1]} de ${anoAtual}, o período mais recente publicado nos relatórios oficiais. Incluem Prefeitura, Câmara, autarquias e fundações do município.`
      : `Valores do ano completo de ${anoAtual}. Incluem Prefeitura, Câmara, autarquias e fundações do município.`;
    document.querySelectorAll("[data-fonte]").forEach((e) => (e.textContent = fonteSiconfi()));
    $("#fonte-mensal").textContent = A.despesas.mensal_pago ? `Receitas: ${fonteSiconfi().replace("Fonte: ", "")} Despesas: ${fonteTce().replace("Fonte: ", "")}` : fonteSiconfi();
    montaSlider(); tiles(); linhaMensal(); sankey(); receitas(); despesas(); credLimite = 20; credAberto = null; credores(); indicadores();
    if (!$("#pagina-especial").hidden) rota();
    $("#sobre-fontes").innerHTML = Object.keys(DADOS.anos).sort().reverse().map((a) => {
      const f = DADOS.anos[a].fontes;
      return `<li><strong>${a}:</strong> Siconfi/Tesouro Nacional, ${esc(f.siconfi)}${f.tce ? "; " + esc(f.tce) : "; dados do TCE-PR ainda não carregados"}.</li>`;
    }).join("");
  }

  function iniciar(d) {
    DADOS = d; POP = d.meta.populacao;
    if (!d.meta.demonstracao) { const b = $("#demo-bar"); if (b) b.remove(); }
    const anos = Object.keys(d.anos).sort().reverse();
    $("#ano").innerHTML = anos.map((a) => `<option value="${a}">${a}${d.anos[a].meses < 12 ? " (até " + MESES[d.anos[a].meses - 1] + ")" : ""}</option>`).join("");
    const dt = new Date(d.meta.atualizado_em + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
    $("#rodape-atual").textContent = `Dados processados em ${dt}. Valores por habitante calculados com ${nf0.format(POP)} habitantes (${d.meta.populacao_fonte || "IBGE"}).`;
    $("#sobre-texto").textContent = d.meta.demonstracao
      ? "Esta é uma versão de demonstração. Todos os valores e nomes de fornecedores são fictícios."
      : `Este site reúne dados oficiais publicados pela Prefeitura de Foz do Iguaçu ao Tesouro Nacional e ao Tribunal de Contas do Paraná. Dados processados em ${dt}.`;
    $("#ano").addEventListener("change", render);
    const refiltra = () => { credLimite = 20; credAberto = null; tabelaCredores(); };
    $("#busca").addEventListener("input", refiltra);
    $("#f-area").addEventListener("change", refiltra);
    $("#f-tipo").addEventListener("change", refiltra);
    $("#mais").addEventListener("click", () => { credLimite += 30; tabelaCredores(); });
    $("#ord-pago").addEventListener("click", () => { credOrdem = "pago"; tabelaCredores(); });
    $("#ord-emp").addEventListener("click", () => { credOrdem = "emp"; tabelaCredores(); });
    const alterna = (tr) => { const id = tr.dataset.id; credAberto = credAberto === id ? null : id; tabelaCredores(); };
    $("#cred-corpo").addEventListener("click", (e) => { const tr = e.target.closest("tr.cred-linha"); if (tr) alterna(tr); });
    $("#cred-corpo").addEventListener("keydown", (e) => { const tr = e.target.closest("tr.cred-linha"); if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); alterna(tr); } });
    render();
    iniciaMenu(); iniciaSlider(); slAuto();
    window.addEventListener("hashchange", rota);
    let largura = innerWidth, tmr = null;
    window.addEventListener("resize", () => { clearTimeout(tmr); tmr = setTimeout(() => { if (Math.abs(innerWidth - largura) > 60) { largura = innerWidth; render(); if (!$("#pagina-especial").hidden) rota(); } }, 250); });
    rota();
  }

  const embutidos = () => { try { return JSON.parse(document.getElementById("dados-embutidos").textContent); } catch (e) { return null; } };
  const falhou = () => { document.getElementById("pagina-principal").innerHTML = `<div class="card" style="margin-top:24px"><h2>Não foi possível carregar os dados</h2><p class="intro">Verifique sua conexão e recarregue a página. Se o problema continuar, avise o Observatório Social de Foz do Iguaçu.</p></div>`; };
  const comDados = (d) => (d ? iniciar(d) : falhou());
  // Hospedado (GitHub Pages etc.): lê dados.json ao lado da página. Sem ele, usa os dados embutidos.
  fetch("dados.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : Promise.reject())).then(comDados, () => comDados(embutidos()));
})();
