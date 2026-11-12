# Caminho das emendas impositivas (emendas.py)

## O que os dados permitem (verificado em 10/11/2026)
- **SIM-AM 2026 não marca emendas de vereador.** O campo `cdEmendaParlamentar` só vale a partir da remessa de **janeiro de 2027** (Nota SIM-AM 004/2026, TCE-PR), e mesmo assim só traz o **tipo** (0000 não é emenda, 1110 individual, 1120 bancada, 1130 comissão, 1140 relator, 1190 outras), sem número da emenda, vereador ou beneficiário.
- **A ponte está no PDF de cada emenda no SAPL** (tipo de matéria 46, "EMORÇ"). Cada PDF traz:
  - o valor e a divisão por vereador nas coletivas;
  - a dotação **a anular**, que é a reserva de emendas. Exemplos: Saúde `10.001.10.122.0320.2193.4.4.90.51.1303`; geral `07.001.04.123.0140.2035.3.3.90.39.1000`;
  - a dotação **a suplementar**, que é o destino. Exemplo: `12.003.12.361.0310.2301.4.4.50.42.1000`;
  - o beneficiário e o CNPJ.
- Orçamento de 2026: 397 emendas apresentadas em 2025, 393 de execução obrigatória, aprovadas junto com o PL 263/2025 (LOA) em 18/12/2025.

## Como o cruzamento classifica
| Situação | Critério |
|---|---|
| **paga / empenhada / parcial** | empenho na dotação de destino **e** credor com o CNPJ da emenda, ou histórico citando "Emenda nº X/2025" |
| **dotação movimentada, sem vínculo direto** | há empenhos na dotação, mas para outro credor. É o caso típico de compra direta (geladeira, reforma) e exige conferir o processo de compra |
| **sem execução encontrada** | nenhum empenho na dotação de destino. É alerta para o OSB |
| `dotacao_partilhada` | a mesma dotação recebeu outras emendas, então o total dela não é só desta emenda |

Repasses a entidades (modalidade 50, como 3.3.50.41 e 4.4.50.42) são os mais fáceis de rastrear, porque o credor é o próprio beneficiário.

## Rodar
```
python3 programas/emendas.py baixar  --ano-sapl 2025 --saida programas/fontes_osb/emendas   # API do SAPL + PDFs
python3 programas/emendas.py extrair --saida programas/fontes_osb/emendas                   # lê os PDFs
python3 programas/emendas.py cruzar  --saida programas/fontes_osb/emendas --tce PASTA_TCE --ano 2026
```
`PASTA_TCE` é a mesma do `processar.py` (arquivos `2026_410830_Empenho.xml`, `_EmpenhoPagamento.xml`, `_EmpenhoPagamentoEstorno.xml`). No GitHub, a automação `.github/workflows/emendas.yml` roda toda segunda ou pela aba Actions; para o cruzamento, ponha os XML numa pasta `dados_tce/`.

Se o XML do TCE-PR não trouxer os códigos de ação e fonte, o programa avisa e liga as emendas só pelo CNPJ do beneficiário ou pela citação da emenda no histórico do empenho.

Saída: `programas/fontes_osb/emendas/emendas.json`, para a futura página #emendas do painel.

## Limites
- PDFs digitalizados (imagem) não têm texto e precisam de OCR. O programa avisa no campo `alertas`.
- Os nomes dos campos do TCE-PR (XML ou CSV) são reconhecidos por apelidos (`ALIAS`). Se mudarem, o programa para e mostra quais colunas encontrou.
- A partir de 2027, usar também o `cdEmendaParlamentar` do SIM-AM como conferência do tipo.
- A IN 200/2025 do TCE-PR exige conta bancária específica por emenda e oito grupos de informação no portal antes da execução. A falta disso é achado à parte, verificado no portal da Prefeitura.

## Atualizar o site
```
python3 programas/emendas.py extrair --saida programas/fontes_osb/emendas         # usa os textos em txt/ se não houver PDFs
python3 programas/emendas.py cruzar  --saida programas/fontes_osb/emendas --tce PASTA_TCE --ano 2026
python3 programas/emendas.py painel  --saida programas/fontes_osb/emendas --remessa 2026/08 --dados dados.json
python3 programas/montar.py --dados dados.json --saida index.html --sem-embutir --validacao
```
O `processar.py` também inclui `painel_emendas.json` no `dados.json` toda vez que roda.

## Como o vínculo é feito (ordem de força)
1. **Histórico do empenho cita a emenda** ("Emenda de Execução Obrigatória 387/2025"). Cobre a maior parte dos casos, inclusive compras diretas.
2. **Mesma dotação e CNPJ do beneficiário** (repasses a entidades), desde que o empenho não cite outra emenda.
3. Empenho que cita várias emendas é dividido na proporção do valor de cada uma; valores anulados (`vlEstornoEmpenho`) são descontados.
4. Citação com credor diferente do beneficiário de um repasse fica marcada e fora da soma.
