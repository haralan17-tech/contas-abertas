# Contas Abertas de Foz do Iguaçu

Painel do **Observatório Social do Brasil – Foz do Iguaçu** com as receitas e despesas do município, explicadas em linguagem simples: de onde vem e para onde vai o dinheiro, quem recebe, limites da lei, Câmara de Vereadores, transporte coletivo, obras, aluguéis, contratações sem licitação, diárias, gratificações, horas extras e remuneração dos servidores.

## O que tem nesta pasta

| Arquivo | Para que serve |
|---|---|
| `index.html` | A página do site. Lê os números do arquivo `dados.json`. |
| `dados.json` | Todos os dados que o site mostra. É o arquivo que muda a cada atualização. |
| `img/` | Logo do OSB e as poses do Luposo. |
| `robots.txt` | Pede aos buscadores para não indexar o site durante a validação. |
| `programas/` | Programas que transformam os arquivos oficiais em `dados.json` e montam a página. |

## Fontes dos dados

- **Siconfi / Tesouro Nacional**: RREO (bimestral) e RGF (quadrimestral).
- **TCE-PR, Portal Informação para Todos (SIM-AM)**: empenhos, pagamentos, diárias, licitações, contratos e obras.
- **Portal da Transparência da Prefeitura**: planilha de servidores.
- **SIOPS e SIOPE**: percentuais de saúde e educação (`programas/indicadores_manuais.json`).
- **OSB Foz do Iguaçu**: estudo da Câmara, análise do transporte coletivo, mapa Foco na Obra e planilhas de ofícios e licitações monitoradas (`programas/fontes_osb/`).

## Como atualizar os dados

1. Baixe os arquivos novos (TCE-PR, Siconfi, planilha de servidores).
2. Rode, numa pasta com Python 3 e a biblioteca `openpyxl` (e o LibreOffice para converter os `.xls` do Siconfi):

   ```
   python3 programas/processar.py --siconfi PASTA_SICONFI --tce PASTA_TCE --servidores Servidores.xls --saida dados.json
   ```

3. Envie o novo `dados.json` para o repositório (Add file → Upload files), substituindo o antigo. O site atualiza em 1 a 2 minutos.

Se preferir, envie os arquivos para o Claude e peça o `dados.json` atualizado.

## Ao sair da validação

1. Apague o `robots.txt`.
2. Gere a página sem o modo de validação:

   ```
   python3 programas/montar.py --dados dados.json --saida index.html --sem-embutir
   ```
