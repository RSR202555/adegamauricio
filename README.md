# 🍷 ADEGA MAURI — Sistema Integrado de Gestão, PDV, Comandas e Atendimento Mobile

Bem-vindo ao sistema de gestão comercial e operacional da **ADEGA MAURI**. Este projeto foi desenvolvido sob arquitetura moderna com **Next.js 15 (App Router)**, **TypeScript**, **Tailwind CSS**, **Supabase (PostgreSQL 15)**, além de suporte nativo a leitores de código de barras USB, PWA Mobile para atendentes e impressão térmica ESC/POS não fiscal (58mm e 80mm).

---

## 🚀 1. Funcionalidades Principais

### 🖥️ Painel Administrativo & Operação Web (`/dashboard`)
- **Dashboard Executivo**: Faturamento em tempo real, ticket médio diário, monitoramento de mesas ativas e alertas de produtos com estoque crítico.
- **PDV Desktop Rápido (`/pdv`)**:
  - Leitor de código de barras USB com foco contínuo e suporte a digitação de SKU/Código.
  - Teclas de atalho e interface ultra-rápida.
  - Cálculo automático de troco e descontos.
  - Pagamentos múltiplos (Dinheiro, PIX, Débito, Crédito).
  - Emissão de comprovante não fiscal para impressora térmica.
- **Controle de Caixa Financeiro (`/caixa`)**:
  - Abertura de turno com fundo de troco configurável.
  - Lançamento de sangrias de segurança e suprimentos com justificativa.
  - Fechamento cego de sessão com conferência e apuração de sobras/faltas na gaveta.
- **Central de Pedidos em Tempo Real (`/pedidos`)**:
  - Recepção automática e instantânea (Supabase Realtime) dos pedidos enviados pelos atendentes.
  - Sinal sonoro (*beep*) e alertas visuais de novos pedidos.
  - Confirmação com baixa atômica de estoque e atualização automática de comanda/mesa.
  - Impressão direta de comanda para cozinha/balcão.
- **Mesas & Comandas Digitais (`/comandas`)**:
  - Controle de consumo por comanda numerada ou mesas físicas no salão.
  - Fechamento parcial e encerramento com recebimento unificado.
- **Catálogo de Produtos (`/produtos`)**:
  - Cadastro com código de barras, SKU, preço de custo, preço de venda, margem de lucro e estoque mínimo de alerta.
- **Auditoria de Estoque (`/estoque`)**:
  - Histórico completo de movimentações (Entradas por compra, Saídas por venda, Perdas/Quebras e Ajustes físicos).
  - Bloqueio contra saldo negativo por consistência no banco de dados.
- **Relatórios & Exportação (`/relatorios`)**:
  - Faturamento consolidado por período, detalhamento por método de pagamento e exportação em planilha `.csv`.

---

### 📱 Aplicativo Mobile dos Garçons / PWA (`/atendimento`)
- Interface touch mobile responsiva otimizada para smartphones de qualquer tamanho.
- Identificação do atendente / garçom.
- Seleção visual de destino: **Mesa**, **Comanda** ou **Balcão**.
- Catálogo de bebidas e itens por categorias com busca instantânea.
- Observações personalizadas por item (ex.: *"bem gelada"*, *"sem gelo"*, *"copo descartável"*).
- Envio instantâneo para o caixa sem necessidade de papel.

---

### 🖨️ Agente Local de Impressão Térmica ESC/POS (`printer-agent/agent.js`)
Para impressoras térmicas conectadas via USB ou Rede local (Daruma, Bematech, Epson, Elgin, etc.):
- Executado localmente via Node.js na porta `9123`.
- Autenticação por token Bearer `mauri-pos-secret-2026`.
- Formatação ESC/POS automática com guilhotina e corte de papel.
- Fallback automático para `window.print()` do navegador quando o agente local não estiver em execução.

---

## 🛠️ 2. Como Configurar e Rodar o Projeto

### Pré-requisitos:
- Node.js 18+ (recomendado Node 20+)
- Conta no [Supabase](https://supabase.com) (ou instância PostgreSQL local)

### Passo 1: Configurar o Banco de Dados no Supabase
1. Acesse o painel do Supabase do seu projeto.
2. Abra o **SQL Editor**.
3. Copie o conteúdo do arquivo `supabase/schema.sql` e execute.
   - O script criará todas as tabelas, índices de alta performance, triggers e procedures atômicas (`fn_process_sale`, `fn_confirm_order_stock`, `fn_close_tab`).

### Passo 2: Variáveis de Ambiente
Crie ou configure o arquivo `.env.local` na raiz do projeto com as chaves do seu Supabase:
```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key-aqui
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key-aqui
PRINTER_AGENT_SECRET=mauri-pos-secret-2026
```

### Passo 3: Executar a Aplicação Web
```bash
# Iniciar servidor de desenvolvimento
npm run dev
```
Acesse no seu navegador: `http://localhost:3000`

---

## 🖨️ 3. Como Iniciar o Agente de Impressão Térmica
No terminal do computador onde a impressora térmica está conectada:
```bash
cd printer-agent
npm install
node agent.js
```
O agente estará ouvindo em `http://127.0.0.1:9123` e pronto para receber comandos de impressão do PDV e da central de pedidos.

---

## 🔒 4. Políticas de Segurança e Auditoria
- **Isolamento Multi-tenant**: Todas as tabelas possuem `company_id` e políticas de Row Level Security (RLS).
- **Consistência Atômica**: Vendas e confirmações de pedidos executam em transação única no banco de dados para evitar condições de corrida (*race conditions*) e estoque negativo acidental.
- **Auditoria**: Todas as alterações manuais no estoque gravam registros imutáveis na tabela `stock_movements`.
