/**
 * Popula o banco com cinco empresas fictícias e dados completos.
 *
 * Usa a chave `service_role`, que ignora o RLS — por isso roda apenas aqui,
 * nunca no código do aplicativo. O script é idempotente: rodar de novo não
 * duplica nada, porque cada empresa é identificada pelo CNPJ.
 *
 *   npm run seed
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

/* -------------------------------------------------------------------------- */
/* Configuração                                                                */
/* -------------------------------------------------------------------------- */

function loadEnv() {
  const env = { ...process.env }
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
    }
  } catch {
    // Sem .env.local: confiamos nas variáveis de ambiente do sistema.
  }
  return env
}

const env = loadEnv()
const url = env.VITE_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error(
    '\n  Faltam credenciais.\n\n' +
      '  Preencha no .env.local:\n' +
      '    VITE_SUPABASE_URL=...\n' +
      '    VITE_SUPABASE_ANON_KEY=...\n' +
      '    SUPABASE_SERVICE_ROLE_KEY=...   <- Project Settings > API\n',
  )
  process.exit(1)
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/* -------------------------------------------------------------------------- */
/* Gerador pseudoaleatório com semente                                         */
/* -------------------------------------------------------------------------- */

/**
 * Semente fixa: rodar o script duas vezes produz exatamente os mesmos números,
 * o que facilita comparar resultados e investigar problemas.
 */
function makeRandom(seed) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

const round2 = (n) => Math.round(n * 100) / 100
const pick = (rng, list) => list[Math.floor(rng() * list.length)]
const between = (rng, min, max) => min + rng() * (max - min)

function dateOnly(year, month, day) {
  const lastDay = new Date(year, month, 0).getDate()
  const d = Math.min(day, lastDay)
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/* -------------------------------------------------------------------------- */
/* As cinco empresas                                                           */
/* -------------------------------------------------------------------------- */

const COMPANIES = [
  {
    name: 'Mega Comércio',
    legal_name: 'Mega Comércio de Alimentos S.A.',
    document: '11222333000144',
    segment: 'Comércio varejista',
    opening_balance: 120000,
    accent: 'emerald',
    profile: 'varejo',
    wallets: [
      { name: 'Conta Corrente — Itaú', kind: 'corrente', bank_name: 'Itaú', branch: '1234', account_number: '56789-0', opening_balance: 95000 },
      { name: 'Conta Corrente — Bradesco', kind: 'corrente', bank_name: 'Bradesco', branch: '3388', account_number: '11223-4', opening_balance: 18000 },
      { name: 'Caixa da Loja', kind: 'caixa', bank_name: null, branch: null, account_number: null, opening_balance: 5000 },
      { name: 'Aplicação CDB', kind: 'investimento', bank_name: 'Itaú', branch: '1234', account_number: '99001-2', opening_balance: 2000 },
    ],
    parties: [
      { name: 'Distribuidora Central Ltda', kind: 'fornecedor', document: '19283746000155', email: 'compras@distcentral.com.br', phone: '(11) 3344-1200' },
      { name: 'Atacadão Bom Preço', kind: 'fornecedor', document: '28374655000166', email: 'pedidos@bompreco.com.br', phone: '(11) 3355-2200' },
      { name: 'Supermercados Silva ME', kind: 'cliente', document: '37465588000177', email: 'financeiro@supermsilva.com.br', phone: '(11) 3366-3300' },
      { name: 'Restaurante Sabor Caseiro', kind: 'cliente', document: '46554477000188', email: 'contato@saborcaseiro.com.br', phone: '(11) 3377-4400' },
    ],
  },
  {
    name: 'Tech Solutions',
    legal_name: 'Tech Solutions Desenvolvimento de Software Ltda',
    document: '22333444000155',
    segment: 'Tecnologia',
    opening_balance: 85000,
    accent: 'sky',
    profile: 'servicos',
    wallets: [
      { name: 'Conta PJ — Nubank', kind: 'corrente', bank_name: 'Nubank', branch: '0001', account_number: '4455667-8', opening_balance: 70000 },
      { name: 'Conta — Inter', kind: 'corrente', bank_name: 'Inter', branch: '0001', account_number: '7788990-1', opening_balance: 15000 },
    ],
    parties: [
      { name: 'Grupo Varejista Nacional S.A.', kind: 'cliente', document: '55667788000199', email: 'ti@gruponacional.com.br', phone: '(21) 2211-8899' },
      { name: 'Banco Digital Prime', kind: 'cliente', document: '66778899000111', email: 'compras@bancoprime.com.br', phone: '(11) 4004-1234' },
      { name: 'Cloud Hosting Brasil', kind: 'fornecedor', document: '77889911000122', email: 'faturamento@cloudhosting.com.br', phone: '(11) 4002-8922' },
      { name: 'Consultoria Fiscal Andrade', kind: 'fornecedor', document: '88991122000133', email: 'contato@andradecontabil.com.br', phone: '(11) 2233-4455' },
    ],
  },
  {
    name: 'Construtora Horizonte',
    legal_name: 'Construtora Horizonte Engenharia e Obras Ltda',
    document: '33444555000166',
    segment: 'Construção civil',
    opening_balance: 250000,
    accent: 'amber',
    profile: 'construcao',
    wallets: [
      { name: 'Conta Corrente — Banco do Brasil', kind: 'corrente', bank_name: 'Banco do Brasil', branch: '1122', account_number: '33445-6', opening_balance: 180000 },
      { name: 'Conta Escrow — Obra Alphaville', kind: 'corrente', bank_name: 'Caixa', branch: '4455', account_number: '66778-9', opening_balance: 60000 },
      { name: 'Caixa Escritório', kind: 'caixa', bank_name: null, branch: null, account_number: null, opening_balance: 10000 },
    ],
    parties: [
      { name: 'Incorporadora Vista Verde', kind: 'cliente', document: '99112233000144', email: 'obras@vistaverde.com.br', phone: '(11) 3030-1100' },
      { name: 'Condomínio Residencial Aurora', kind: 'cliente', document: '10112233000155', email: 'sindico@aurora.com.br', phone: '(11) 3040-2200' },
      { name: 'Cimento Forte Distribuidora', kind: 'fornecedor', document: '11122244000166', email: 'vendas@cimentoforte.com.br', phone: '(11) 3050-3300' },
      { name: 'Aço Nacional S.A.', kind: 'fornecedor', document: '12122255000177', email: 'comercial@aconacional.com.br', phone: '(11) 3060-4400' },
    ],
  },
  {
    name: 'Clínica Vida Plena',
    legal_name: 'Vida Plena Serviços Médicos Ltda',
    document: '44555666000177',
    segment: 'Saúde',
    opening_balance: 62000,
    accent: 'violet',
    profile: 'saude',
    wallets: [
      { name: 'Conta Corrente — Santander', kind: 'corrente', bank_name: 'Santander', branch: '0555', account_number: '88990-1', opening_balance: 55000 },
      { name: 'Caixa Recepção', kind: 'caixa', bank_name: null, branch: null, account_number: null, opening_balance: 4000 },
      { name: 'Reserva Financeira', kind: 'investimento', bank_name: 'XP', branch: '0001', account_number: '22334-5', opening_balance: 3000 },
    ],
    parties: [
      { name: 'Unimed Regional', kind: 'cliente', document: '13122266000188', email: 'credenciamento@unimedregional.com.br', phone: '(11) 3070-5500' },
      { name: 'Amil Saúde', kind: 'cliente', document: '14122277000199', email: 'faturamento@amil.com.br', phone: '(11) 3080-6600' },
      { name: 'Bradesco Saúde', kind: 'cliente', document: '15122288000111', email: 'pagamentos@bradsaude.com.br', phone: '(11) 3090-7700' },
      { name: 'Distribuidora MedFarma', kind: 'fornecedor', document: '16122299000122', email: 'pedidos@medfarma.com.br', phone: '(11) 3100-8800' },
      { name: 'Laboratório Análises Clínicas', kind: 'fornecedor', document: '17122211000133', email: 'contato@labanalises.com.br', phone: '(11) 3110-9900' },
    ],
  },
  {
    name: 'Studio Criativo',
    legal_name: 'Studio Criativo Marketing Digital ME',
    document: '55666777000188',
    segment: 'Marketing e publicidade',
    opening_balance: 28000,
    accent: 'rose',
    profile: 'agencia',
    wallets: [
      { name: 'Conta PJ — PicPay', kind: 'corrente', bank_name: 'PicPay', branch: '0001', account_number: '55443-2', opening_balance: 24000 },
      { name: 'Carteira Digital', kind: 'investimento', bank_name: null, branch: null, account_number: null, opening_balance: 4000 },
    ],
    parties: [
      { name: 'Cafeteria Grão Nobre', kind: 'cliente', document: '18122222000144', email: 'marketing@graonobre.com.br', phone: '(11) 3120-1100' },
      { name: 'Academia Corpo em Forma', kind: 'cliente', document: '19122233000155', email: 'contato@corpoemforma.com.br', phone: '(11) 3130-2200' },
      { name: 'Ótica Visão Clara', kind: 'cliente', document: '20122244000166', email: 'gerencia@visaoclara.com.br', phone: '(11) 3140-3300' },
      { name: 'Meta Platforms (Anúncios)', kind: 'fornecedor', document: '21122255000177', email: 'billing@meta.com', phone: null },
      { name: 'Freelancer Design — Marina Costa', kind: 'fornecedor', document: '31245678901', email: 'marina@designfreelance.com.br', phone: '(11) 99887-6655' },
    ],
  },
]

/* -------------------------------------------------------------------------- */
/* Planos de contas por perfil                                                 */
/* -------------------------------------------------------------------------- */

const BASE_INCOME = [
  'Dinheiro',
  'PIX / Transferência',
  'Cartão de Débito',
  'Cartão de Crédito',
]

const BASE_EXPENSE = [
  'Fornecedores',
  'Despesas com Pessoal',
  'Impostos',
  'Despesas Administrativas',
  'Contador',
  'Despesas Financeiras',
  'Transferências Bancárias',
  'Retirada de Sócio',
]

/** Contas extras que dão personalidade a cada tipo de negócio. */
const EXTRA_INCOME = {
  varejo: ['Vendas Balcão', 'Vendas Online', 'Convênios e Parcerias'],
  servicos: ['Contratos de Manutenção', 'Projetos Sob Demanda', 'Licenciamento de Software'],
  construcao: ['Medições de Obra', 'Aditivos Contratuais', 'Locação de Equipamentos'],
  saude: ['Convênios Médicos', 'Consultas Particulares', 'Exames e Procedimentos'],
  agencia: ['Contratos Recorrentes', 'Projetos Pontuais', 'Gestão de Tráfego'],
}

const EXTRA_EXPENSE = {
  varejo: ['Compra de Mercadoria', 'Frete e Logística', 'Embalagens', 'Manutenção da Loja'],
  servicos: ['Infraestrutura em Nuvem', 'Licenças de Software', 'Marketing Digital', 'Treinamento'],
  construcao: ['Materiais de Construção', 'Mão de Obra Terceirizada', 'Locação de Máquinas', 'Seguros e Garantias'],
  saude: ['Materiais Médicos', 'Laboratório e Exames', 'Manutenção de Equipamentos', 'Convênios e Credenciamentos'],
  agencia: ['Mídia Paga', 'Assinaturas de Ferramentas', 'Freelancers', 'Produção de Conteúdo'],
}

/* -------------------------------------------------------------------------- */
/* Motor de lançamentos                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Descreve, para cada perfil, como o dinheiro costuma entrar e sair.
 * `weight` é a participação relativa no total do mês e `volatility` o quanto
 * cada lançamento varia mês a mês.
 */
const FLOWS = {
  varejo: {
    incomeMonthly: 210000,
    expenseRatio: 0.79,
    income: [
      { account: 'Cartão de Crédito', weight: 0.34, volatility: 0.12, descriptions: ['Vendas em cartão de crédito', 'Recebimento de vendas — crédito'] },
      { account: 'PIX / Transferência', weight: 0.27, volatility: 0.15, descriptions: ['Recebimento via PIX', 'Vendas recebidas por transferência'] },
      { account: 'Vendas Balcão', weight: 0.2, volatility: 0.18, descriptions: ['Vendas no balcão', 'Faturamento do balcão'] },
      { account: 'Cartão de Débito', weight: 0.11, volatility: 0.14, descriptions: ['Vendas em cartão de débito'] },
      { account: 'Dinheiro', weight: 0.08, volatility: 0.2, descriptions: ['Vendas em dinheiro'] },
    ],
    expense: [
      { account: 'Compra de Mercadoria', weight: 0.44, volatility: 0.1, descriptions: ['Compra de mercadorias para revenda', 'Reposição de estoque'] },
      { account: 'Despesas com Pessoal', weight: 0.22, volatility: 0.04, descriptions: ['Folha de pagamento', 'Salários e encargos'] },
      { account: 'Impostos', weight: 0.12, volatility: 0.08, descriptions: ['DAS / Simples Nacional', 'Guia de impostos'] },
      { account: 'Frete e Logística', weight: 0.07, volatility: 0.2, descriptions: ['Frete de mercadorias', 'Transporte de cargas'] },
      { account: 'Despesas Administrativas', weight: 0.06, volatility: 0.12, descriptions: ['Despesas administrativas', 'Contas de consumo'] },
      { account: 'Contador', weight: 0.03, volatility: 0.0, descriptions: ['Honorários contábeis'] },
      { account: 'Despesas Financeiras', weight: 0.03, volatility: 0.25, descriptions: ['Tarifas bancárias e juros'] },
      { account: 'Manutenção da Loja', weight: 0.03, volatility: 0.3, descriptions: ['Manutenção e conservação'] },
    ],
  },
  servicos: {
    incomeMonthly: 145000,
    expenseRatio: 0.62,
    income: [
      { account: 'Contratos de Manutenção', weight: 0.4, volatility: 0.06, descriptions: ['Mensalidade de contrato — suporte', 'Contrato de manutenção mensal'] },
      { account: 'Projetos Sob Demanda', weight: 0.32, volatility: 0.28, descriptions: ['Entrega de projeto — sprint', 'Desenvolvimento sob demanda'] },
      { account: 'PIX / Transferência', weight: 0.18, volatility: 0.15, descriptions: ['Recebimento via PIX'] },
      { account: 'Licenciamento de Software', weight: 0.1, volatility: 0.12, descriptions: ['Licenciamento de software'] },
    ],
    expense: [
      { account: 'Despesas com Pessoal', weight: 0.5, volatility: 0.04, descriptions: ['Folha de pagamento — equipe técnica', 'Salários e benefícios'] },
      { account: 'Infraestrutura em Nuvem', weight: 0.13, volatility: 0.15, descriptions: ['Servidores e nuvem', 'Infraestrutura AWS'] },
      { account: 'Impostos', weight: 0.12, volatility: 0.08, descriptions: ['Impostos sobre serviços'] },
      { account: 'Licenças de Software', weight: 0.08, volatility: 0.1, descriptions: ['Assinaturas e licenças'] },
      { account: 'Marketing Digital', weight: 0.06, volatility: 0.3, descriptions: ['Campanhas de marketing'] },
      { account: 'Contador', weight: 0.04, volatility: 0.0, descriptions: ['Honorários contábeis'] },
      { account: 'Despesas Administrativas', weight: 0.04, volatility: 0.1, descriptions: ['Despesas administrativas'] },
      { account: 'Treinamento', weight: 0.03, volatility: 0.35, descriptions: ['Cursos e certificações'] },
    ],
  },
  construcao: {
    incomeMonthly: 380000,
    expenseRatio: 0.84,
    income: [
      { account: 'Medições de Obra', weight: 0.62, volatility: 0.22, descriptions: ['Medição de obra — parcela', 'Boletim de medição aprovado'] },
      { account: 'Aditivos Contratuais', weight: 0.18, volatility: 0.4, descriptions: ['Aditivo contratual aprovado'] },
      { account: 'PIX / Transferência', weight: 0.12, volatility: 0.2, descriptions: ['Recebimento via transferência'] },
      { account: 'Locação de Equipamentos', weight: 0.08, volatility: 0.3, descriptions: ['Locação de equipamentos a terceiros'] },
    ],
    expense: [
      { account: 'Materiais de Construção', weight: 0.38, volatility: 0.16, descriptions: ['Compra de materiais — obra', 'Insumos de construção'] },
      { account: 'Mão de Obra Terceirizada', weight: 0.24, volatility: 0.12, descriptions: ['Empreiteira — medição', 'Serviços terceirizados'] },
      { account: 'Despesas com Pessoal', weight: 0.13, volatility: 0.05, descriptions: ['Folha de pagamento — engenharia'] },
      { account: 'Impostos', weight: 0.09, volatility: 0.1, descriptions: ['Impostos sobre serviços e retenções'] },
      { account: 'Locação de Máquinas', weight: 0.06, volatility: 0.2, descriptions: ['Locação de máquinas e equipamentos'] },
      { account: 'Seguros e Garantias', weight: 0.04, volatility: 0.15, descriptions: ['Seguros de obra e garantias'] },
      { account: 'Despesas Administrativas', weight: 0.03, volatility: 0.1, descriptions: ['Despesas administrativas'] },
      { account: 'Contador', weight: 0.03, volatility: 0.0, descriptions: ['Honorários contábeis'] },
    ],
  },
  saude: {
    incomeMonthly: 168000,
    expenseRatio: 0.71,
    income: [
      { account: 'Convênios Médicos', weight: 0.52, volatility: 0.1, descriptions: ['Repasse de convênio — competência', 'Faturamento de convênios'] },
      { account: 'Consultas Particulares', weight: 0.24, volatility: 0.16, descriptions: ['Consultas particulares', 'Atendimentos particulares'] },
      { account: 'Exames e Procedimentos', weight: 0.16, volatility: 0.2, descriptions: ['Exames e procedimentos realizados'] },
      { account: 'PIX / Transferência', weight: 0.08, volatility: 0.18, descriptions: ['Recebimento via PIX'] },
    ],
    expense: [
      { account: 'Despesas com Pessoal', weight: 0.42, volatility: 0.05, descriptions: ['Folha de pagamento — equipe médica', 'Salários e encargos'] },
      { account: 'Materiais Médicos', weight: 0.16, volatility: 0.15, descriptions: ['Materiais e insumos médicos'] },
      { account: 'Laboratório e Exames', weight: 0.12, volatility: 0.14, descriptions: ['Laboratório terceirizado'] },
      { account: 'Impostos', weight: 0.11, volatility: 0.08, descriptions: ['Impostos sobre serviços'] },
      { account: 'Manutenção de Equipamentos', weight: 0.07, volatility: 0.25, descriptions: ['Manutenção de equipamentos médicos'] },
      { account: 'Despesas Administrativas', weight: 0.06, volatility: 0.1, descriptions: ['Despesas administrativas'] },
      { account: 'Contador', weight: 0.03, volatility: 0.0, descriptions: ['Honorários contábeis'] },
      { account: 'Convênios e Credenciamentos', weight: 0.03, volatility: 0.2, descriptions: ['Taxas de credenciamento'] },
    ],
  },
  agencia: {
    incomeMonthly: 78000,
    expenseRatio: 0.68,
    income: [
      { account: 'Contratos Recorrentes', weight: 0.52, volatility: 0.08, descriptions: ['Fee mensal de social media', 'Contrato de gestão mensal'] },
      { account: 'Projetos Pontuais', weight: 0.26, volatility: 0.34, descriptions: ['Projeto de identidade visual', 'Campanha pontual'] },
      { account: 'Gestão de Tráfego', weight: 0.14, volatility: 0.2, descriptions: ['Gestão de tráfego pago'] },
      { account: 'PIX / Transferência', weight: 0.08, volatility: 0.2, descriptions: ['Recebimento via PIX'] },
    ],
    expense: [
      { account: 'Despesas com Pessoal', weight: 0.44, volatility: 0.06, descriptions: ['Folha de pagamento — equipe criativa'] },
      { account: 'Mídia Paga', weight: 0.18, volatility: 0.28, descriptions: ['Investimento em mídia paga'] },
      { account: 'Freelancers', weight: 0.13, volatility: 0.3, descriptions: ['Freelancers — design e redação'] },
      { account: 'Impostos', weight: 0.1, volatility: 0.1, descriptions: ['Impostos sobre serviços'] },
      { account: 'Assinaturas de Ferramentas', weight: 0.06, volatility: 0.1, descriptions: ['Assinaturas de ferramentas'] },
      { account: 'Produção de Conteúdo', weight: 0.05, volatility: 0.3, descriptions: ['Produção de fotos e vídeos'] },
      { account: 'Contador', weight: 0.04, volatility: 0.0, descriptions: ['Honorários contábeis'] },
    ],
  },
}

/* -------------------------------------------------------------------------- */
/* Helpers de banco                                                            */
/* -------------------------------------------------------------------------- */

async function findAuthUserByEmail(email) {
  // A Admin API pagina; com poucos usuários, uma página basta.
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) throw new Error(`Falha ao listar usuários: ${error.message}`)
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null
}

async function ensureOwnerUser(email) {
  const existing = await findAuthUserByEmail(email)

  if (existing) {
    // Garante que o usuário consegue entrar mesmo se o e-mail não foi aberto.
    if (!existing.email_confirmed_at) {
      const { error } = await db.auth.admin.updateUserById(existing.id, {
        email_confirm: true,
      })
      if (error) throw new Error(`Falha ao confirmar usuário: ${error.message}`)
      console.log(`  · usuário existente ${email} — e-mail confirmado`)
    } else {
      console.log(`  · usuário existente ${email}`)
    }
    return existing
  }

  const { data, error } = await db.auth.admin.createUser({
    email,
    password: 'FluxoCaixa@2026',
    email_confirm: true,
    user_metadata: { full_name: 'Henrique Almeida' },
  })
  if (error) throw new Error(`Falha ao criar usuário: ${error.message}`)

  console.log(`  · usuário criado ${email} (senha: FluxoCaixa@2026)`)
  return data.user
}

/* -------------------------------------------------------------------------- */
/* Criação de uma empresa                                                      */
/* -------------------------------------------------------------------------- */

async function seedCompany(company, ownerId, index) {
  const rng = makeRandom(20260101 + index * 7919)
  const flows = FLOWS[company.profile]

  /* -- Empresa ---------------------------------------------------------- */

  const { data: existing } = await db
    .from('organizations')
    .select('id')
    .eq('document', company.document)
    .maybeSingle()

  if (existing) {
    console.log(`\n▸ ${company.name} — já existe, removendo dados anteriores`)
    await db.from('organizations').delete().eq('id', existing.id)
  }

  const { data: org, error: orgError } = await db
    .from('organizations')
    .insert({
      name: company.name,
      legal_name: company.legal_name,
      document: company.document,
      segment: company.segment,
      opening_balance: company.opening_balance,
      starts_on: '2025-01-01',
      accent: company.accent,
      created_by: ownerId,
    })
    .select()
    .single()

  if (orgError) throw new Error(`${company.name}: ${orgError.message}`)

  console.log(`\n▸ ${company.name} (${company.segment})`)

  /* -- Plano de contas --------------------------------------------------- */

  // O trigger já semeou o plano padrão; complementamos com as contas do perfil
  // e removemos as genéricas que não fazem sentido para o negócio.
  const extraIncome = EXTRA_INCOME[company.profile]
  const extraExpense = EXTRA_EXPENSE[company.profile]

  const { data: seeded } = await db
    .from('chart_of_accounts')
    .select('id, name')
    .eq('org_id', org.id)

  const keepIncome = new Set([...BASE_INCOME, ...extraIncome])
  const keepExpense = new Set([...BASE_EXPENSE, ...extraExpense])

  const toRemove = (seeded ?? []).filter((a) => {
    const isGeneric = /^(Outros Recebimentos|Outras Saídas)\s+\d+$/.test(a.name)
    if (isGeneric) return true
    if (a.name === 'Transferências Bancárias') return false
    return false
  })

  if (toRemove.length) {
    await db.from('chart_of_accounts').delete().in('id', toRemove.map((a) => a.id))
  }

  const remaining = (seeded ?? []).filter(
    (a) => !toRemove.some((r) => r.id === a.id),
  )
  const existingNames = new Set(remaining.map((a) => a.name.toLowerCase()))

  const newAccounts = [
    ...extraIncome
      .filter((n) => !existingNames.has(n.toLowerCase()))
      .map((name, i) => ({ org_id: org.id, name, kind: 'receita', sort_order: 100 + i })),
    ...extraExpense
      .filter((n) => !existingNames.has(n.toLowerCase()))
      .map((name, i) => ({ org_id: org.id, name, kind: 'despesa', sort_order: 100 + i })),
  ]

  if (newAccounts.length) {
    const { error } = await db.from('chart_of_accounts').insert(newAccounts)
    if (error) throw new Error(`${company.name}: contas — ${error.message}`)
  }

  const { data: accounts } = await db
    .from('chart_of_accounts')
    .select('id, name, kind')
    .eq('org_id', org.id)

  const accountByName = new Map(accounts.map((a) => [a.name, a]))
  const incomeAccounts = accounts.filter((a) => a.kind === 'receita')

  // Conta usada quando é preciso reforçar o caixa sem registrar despesa
  // fictícia. Existe em toda empresa porque aporte de sócio é comum.
  let aporteAccount = accountByName.get('Aporte de Capital')
  if (!aporteAccount) {
    const { data: created, error } = await db
      .from('chart_of_accounts')
      .insert({
        org_id: org.id,
        name: 'Aporte de Capital',
        kind: 'receita',
        sort_order: 200,
      })
      .select()
      .single()
    if (error) throw new Error(`${company.name}: conta de aporte — ${error.message}`)
    aporteAccount = created
    accountByName.set(created.name, created)
    incomeAccounts.push(created)
  }

  // Contas genéricas que sobraram e não têm fluxo definido continuam
  // disponíveis, mas só recebem lançamento se o perfil as citar.
  console.log(`  · ${accounts.length} contas no plano (${incomeAccounts.length} receitas)`)

  /* -- Contas bancárias -------------------------------------------------- */

  const { data: wallets, error: walletError } = await db
    .from('wallets')
    .insert(
      company.wallets.map((w) => ({
        org_id: org.id,
        name: w.name,
        kind: w.kind,
        bank_name: w.bank_name,
        branch: w.branch,
        account_number: w.account_number,
        opening_balance: w.opening_balance,
      })),
    )
    .select()

  if (walletError) throw new Error(`${company.name}: contas — ${walletError.message}`)
  console.log(`  · ${wallets.length} contas bancárias`)

  // A primeira conta concentra a operação; as demais recebem movimentos
  // ocasionais, para os saldos não ficarem todos iguais.
  const mainWallet = wallets[0]
  const otherWallets = wallets.slice(1)

  // Saldo corrente de cada conta ao longo da geração, para nunca pagar de
  // uma conta sem caixa.
  const walletOffsets = new Map()

  /* -- Clientes e fornecedores ------------------------------------------- */

  const { data: parties, error: partyError } = await db
    .from('parties')
    .insert(
      company.parties.map((p) => ({
        org_id: org.id,
        name: p.name,
        kind: p.kind,
        document: p.document,
        email: p.email,
        phone: p.phone,
      })),
    )
    .select()

  if (partyError) throw new Error(`${company.name}: parceiros — ${partyError.message}`)

  const clients = parties.filter((p) => p.kind === 'cliente' || p.kind === 'ambos')
  const suppliers = parties.filter((p) => p.kind === 'fornecedor' || p.kind === 'ambos')
  console.log(`  · ${parties.length} clientes/fornecedores`)

  /* -- Lançamentos ------------------------------------------------------- */

  const entries = []
  const today = new Date()

  // Gera 18 meses de histórico terminando no mês atual. Datas futuras não
  // fazem sentido num fluxo de caixa realizado — o que existe à frente são
  // contas a pagar e a receber, tratadas à parte logo abaixo.
  const MONTHS_BACK = 18
  const firstMonth = new Date(today.getFullYear(), today.getMonth() - (MONTHS_BACK - 1), 1)

  for (let offset = 0; offset < MONTHS_BACK; offset += 1) {
    const monthDate = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + offset, 1)
    const year = monthDate.getFullYear()
    const month = monthDate.getMonth() + 1

    const isCurrentMonth =
      year === today.getFullYear() && month === today.getMonth() + 1

    // Sazonalidade: dezembro e julho rendem mais no varejo, janeiro menos.
    const seasonal =
      company.profile === 'varejo'
        ? month === 12
          ? 1.28
          : month === 7
            ? 1.12
            : month === 1
              ? 0.82
              : 1
        : company.profile === 'construcao'
          ? month <= 2
            ? 0.86
            : 1
          : company.profile === 'saude'
            ? month === 1 || month === 7
              ? 0.92
              : 1
            : 1

    // Tendência suave de crescimento ao longo do histórico.
    const trend = 1 + offset * 0.007

    const incomeTotal = flows.incomeMonthly * seasonal * trend
    const expenseTotal = incomeTotal * flows.expenseRatio

    // Nos dois meses mais recentes parte das contas fica em aberto, para
    // exercitar a conciliação e os alertas de vencimento.
    const leaveOpen = offset >= MONTHS_BACK - 3

    const pushEntries = (specs, total, kind) => {
      specs.forEach((spec, i) => {
        const account = accountByName.get(spec.account)
        if (!account) return

        const base = total * spec.weight
        const variance = 1 + between(rng, -spec.volatility, spec.volatility)
        const amount = round2(base * variance)
        if (amount <= 0) return

        // Vencimentos espalhados pelo mês: entradas ao longo do período,
        // saídas concentradas no início (folha, fornecedores, impostos).
        const day =
          kind === 'entrada'
            ? 3 + i * 4 + Math.floor(rng() * 4)
            : 5 + i * 3 + Math.floor(rng() * 3)

        // Nada é lançado depois de hoje: o mês corrente só tem o que já
        // aconteceu até a data de geração.
        const safeDay =
          isCurrentMonth && day > today.getDate()
            ? Math.max(1, today.getDate() - Math.floor(rng() * 4))
            : day

        const issued = dateOnly(year, month, safeDay)
        const issuedDate = new Date(`${issued}T12:00:00`)

        // Um lançamento nunca é liquidado antes de existir; e nada no futuro
        // pode estar pago.
        const isFuture = issuedDate > today

        let status = 'pago'
        if (isFuture) {
          status = 'em_aberto'
        } else if (leaveOpen && rng() < (isCurrentMonth ? 0.5 : 0.28)) {
          // Deixa aberto, gerando também alguns vencidos (data já passou).
          status = 'em_aberto'
        }

        const settled = status === 'pago' ? issued : null

        // Uma conta paga pode ter sido liquidada alguns dias depois de vencer.
        const settledLate =
          status === 'pago' && rng() < 0.18
            ? dateOnly(year, month, Math.min(day + 2 + Math.floor(rng() * 5), 28))
            : settled

        // Concentra na conta principal. As demais só recebem movimento
        // quando já têm saldo suficiente para cobrir a saída — conta
        // bancária negativa é um estado que não existe na prática.
        let wallet = mainWallet
        if (otherWallets.length && rng() < 0.25) {
          wallet = pick(rng, otherWallets)
        }

        if (kind === 'despesa') {
          const available = round2(
            Number(wallet.opening_balance) + (walletOffsets.get(wallet.id) ?? 0),
          )
          // Sem caixa na conta escolhida, a saída sai da principal.
          if (available < amount) wallet = mainWallet

          // Se nem a principal cobre, registra um aporte dos sócios antes do
          // pagamento. Gravar saldo negativo seria irreal, e um ajuste
          // invisível quebraria a conferência entre contas e consolidado.
          const mainAvailable = round2(
            Number(mainWallet.opening_balance) +
              (walletOffsets.get(mainWallet.id) ?? 0),
          )
          if (mainAvailable < amount) {
            const aporte = round2(amount - mainAvailable + 5000)
            const aporteDay = Math.max(1, safeDay - 1)

            entries.push({
              org_id: org.id,
              account_id: aporteAccount.id,
              wallet_id: mainWallet.id,
              party_id: null,
              kind: 'entrada',
              status: 'pago',
              description: 'Aporte de capital dos sócios',
              amount: aporte,
              issued_on: dateOnly(year, month, aporteDay),
              settled_on: dateOnly(year, month, aporteDay),
              reference: null,
              notes: null,
              is_transfer: false,
              transfer_group: null,
              reconciled_at: null,
              created_by: ownerId,
            })

            walletOffsets.set(
              mainWallet.id,
              (walletOffsets.get(mainWallet.id) ?? 0) + aporte,
            )
          }
        }

        // Atualiza o saldo corrente da conta usada, para as próximas
        // decisões enxergarem o efeito desta.
        const signed = kind === 'entrada' ? amount : -amount
        walletOffsets.set(wallet.id, (walletOffsets.get(wallet.id) ?? 0) + signed)

        const counterparty =
          kind === 'entrada'
            ? clients.length
              ? pick(rng, clients)
              : null
            : suppliers.length
              ? pick(rng, suppliers)
              : null

        entries.push({
          org_id: org.id,
          account_id: account.id,
          wallet_id: wallet.id,
          party_id: counterparty?.id ?? null,
          kind: 'entrada',
          status,
          description: pick(rng, spec.descriptions),
          amount,
          issued_on: issued,
          settled_on: settledLate,
          reference:
            kind === 'entrada' && rng() < 0.35
              ? `NF-e ${1000 + Math.floor(rng() * 8999)}`
              : null,
          notes: null,
          is_transfer: false,
          transfer_group: null,
          // Conciliado quando já liquidado há mais de dois meses.
          reconciled_at:
            status === 'pago' && offset < MONTHS_BACK - 2
              ? `${settledLate}T12:00:00Z`
              : null,
          created_by: ownerId,
        })
      })
    }

    pushEntries(flows.income, incomeTotal, 'entrada')
    pushEntries(flows.expense, expenseTotal, 'despesa')
  }

  // Insere em blocos para não estourar o limite da requisição.
  const CHUNK = 200
  for (let i = 0; i < entries.length; i += CHUNK) {
    const { error } = await db.from('entries').insert(entries.slice(i, i + CHUNK))
    if (error) throw new Error(`${company.name}: lançamentos — ${error.message}`)
  }

  const paid = entries.filter((e) => e.status === 'pago').length
  const overdue = entries.filter(
    (e) => e.status === 'em_aberto' && new Date(`${e.issued_on}T12:00:00`) < today,
  ).length
  console.log(
    `  · ${entries.length} lançamentos (${paid} liquidados, ${entries.length - paid} em aberto, ${overdue} vencidos)`,
  )

  /* -- Transferências entre contas --------------------------------------- */

  if (otherWallets.length) {
    let transfers = 0
    let failed = null

    for (let offset = 0; offset < MONTHS_BACK; offset += 1) {
      // Nem todo mês tem transferência; é um evento ocasional.
      if (rng() > 0.45) continue

      const monthDate = new Date(
        firstMonth.getFullYear(),
        firstMonth.getMonth() + offset,
        1,
      )
      // Sem transferências no futuro.
      const when = new Date(monthDate.getFullYear(), monthDate.getMonth(), 20)
      if (when > today) continue

      const dest = pick(rng, otherWallets)
      const amount = round2(between(rng, 3000, 25000))

      // Não transfere mais do que existe na conta de origem.
      const available = round2(
        Number(mainWallet.opening_balance) + (walletOffsets.get(mainWallet.id) ?? 0),
      )
      if (available < amount * 1.5) continue

      // No mês corrente, a transferência acontece antes de hoje.
      const isCurrent =
        monthDate.getFullYear() === today.getFullYear() &&
        monthDate.getMonth() === today.getMonth()
      const transferDay = isCurrent
        ? Math.max(1, Math.min(20, today.getDate() - 1))
        : 20

      const { error } = await db.rpc('create_transfer', {
        p_org_id: org.id,
        p_from: mainWallet.id,
        p_to: dest.id,
        p_amount: amount,
        p_date: dateOnly(
          monthDate.getFullYear(),
          monthDate.getMonth() + 1,
          transferDay,
        ),
        p_description: 'Aporte para reserva',
      })

      if (error) {
        // Guarda o primeiro erro em vez de silenciar: uma falha aqui significa
        // que a migration de correção do service_role não foi aplicada.
        failed ??= error.message
      } else {
        transfers += 1
        walletOffsets.set(
          mainWallet.id,
          (walletOffsets.get(mainWallet.id) ?? 0) - amount,
        )
        walletOffsets.set(dest.id, (walletOffsets.get(dest.id) ?? 0) + amount)
      }
    }

    if (transfers) console.log(`  · ${transfers} transferências entre contas`)
    if (failed) {
      console.log(`  ! transferências falharam: ${failed}`)
      console.log(
        '    aplique supabase/migrations/20260101000002_fix_service_role.sql',
      )
    }
  }

  /* -- Resumo ------------------------------------------------------------ */

  const { data: overview } = await db
    .from('org_overview')
    .select('received, paid, receivable, payable, balance')
    .eq('org_id', org.id)
    .maybeSingle()

  if (overview) {
    const brl = (v) =>
      Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    console.log(
      `  → recebido ${brl(overview.received)} · pago ${brl(overview.paid)} · ` +
        `saldo ${brl(overview.balance)}`,
    )
  }

  return org
}

/* -------------------------------------------------------------------------- */
/* Execução                                                                    */
/* -------------------------------------------------------------------------- */

async function main() {
  console.log('\n╭─────────────────────────────────────────────────────────╮')
  console.log('│  Populando o Fluxo de Caixa com dados de demonstração   │')
  console.log('╰─────────────────────────────────────────────────────────╯')

  const email = process.argv[2] ?? 'vitor.vital@gmail.com'
  console.log(`\n▸ Usuário proprietário: ${email}`)
  const user = await ensureOwnerUser(email)

  for (const [index, company] of COMPANIES.entries()) {
    await seedCompany(company, user.id, index)
  }

  console.log('\n╭─────────────────────────────────────────────────────────╮')
  console.log('│  Pronto. Acesse http://localhost:5173 e faça login.     │')
  console.log('╰─────────────────────────────────────────────────────────╯')
  console.log(`\n  E-mail: ${email}`)
  console.log('  Senha:  (a que você já cadastrou)\n')
}

main().catch((error) => {
  console.error('\n  Erro:', error.message, '\n')
  process.exit(1)
})
