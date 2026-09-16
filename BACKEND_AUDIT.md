# Auditoria Completa do Backend - Phelierium Game Hub

## 📋 Sumário Executivo

Esta auditoria analisa a estrutura atual do backend, identifica problemas de integridade, código morto referente ao Firebase, e propõe uma organização de pastas mais escalável.

**Data:** 15/09/2026  
**Escopo:** Backend Express.js + Supabase  
**Status:** ✅ Análise Completa

---

## 🔴 Código Morto Referente ao Firebase

### Problemas Identificados

#### 1. **Variáveis `firebaseUid` em código legado** (CRITICAL)
**Localização:** `server/index.mjs` (linhas 3717, 3745)

```javascript
// ❌ CÓDIGO MORTO - Firebase não é mais usado
await updateLinkedAccountProfile(
  pending.userUid || pending.firebaseUid,  // firebaseUid nunca é definido
  steamProfile || { steam_id: steamId },
);

const linkedUserUid = String(pending.userUid || pending.firebaseUid || "").trim();
```

**Problema:** 
- `firebaseUid` é referenciado mas nunca definido no código atual
- O projeto migrou para Supabase, mas deixou referências do Firebase
- Isso pode causar confusão e bugs se algum código tentar usar essas variáveis

**Solução Imediata:**
```javascript
// ✅ REMOVER referências ao firebaseUid
await updateLinkedAccountProfile(
  pending.userUid,  // Usar apenas userUid
  steamProfile || { steam_id: steamId },
);

const linkedUserUid = String(pending.userUid || "").trim();
```

#### 2. **Dependência `firebase-tools` desnecessária** (SUGGESTION)
**Localização:** `package.json` (linha 205)

```json
"firebase-tools": "^15.23.0"
```

**Problema:**
- O projeto usa Supabase, não Firebase
- `firebase-tools` ocupa espaço e adiciona superfície de ataque
- 36 dependências adicionais instaladas desnecessariamente

**Solução:**
```bash
npm uninstall firebase-tools
```

#### 3. **Variáveis de ambiente Firebase não utilizadas** (SUGGESTION)
**Localização:** `.env.example` (linhas 16-17)

```bash
FIREBASE_SERVICE_ACCOUNT_KEY=
FIREBASE_DATABASE_URL=
```

**Solução:** Remover estas variáveis do `.env.example`

#### 4. **Referências a `.firebase` em configurações** (NIT)
**Localização:** `.gitignore`, `eslint.config.js`

Essas referências podem ser removidas, pois o projeto não usa Firebase.

---

## 🏗️ Estrutura Atual do Backend

### Arquitetura Monolítica (Problemas)

```
server/
├── index.mjs              # 4500+ linhas - GOD FILE!
├── gaming-news.mjs        # RSS feed parser
├── security-boundaries.mjs # Validações de segurança
├── bootstrap.cjs          # Inicialização
└── prepArtwork.mjs        # Processamento de imagens
```

**Problemas:**
1. **Monolito gigante:** `index.mjs` com 4500+ linhas viola princípios de SRP (Single Responsibility Principle)
2. **Falta de separação por domínio:** Autenticação, chat, voz, Steam, Discord tudo misturado
3. **Dificuldade de manutenção:** Encontrar e corrigir bugs é extremamente difícil
4. **Testabilidade limitada:** Testar unidades específicas é quase impossível
5. **Falta de middleware organizado:** Autenticação e rate limiting misturados com rotas

---

## ✅ Nova Organização de Pastas Sugerida

### Estrutura Modular por Domínio

```
server/
├── index.mjs                    # Entry point (reduzido a ~200 linhas)
├── config/
│   ├── index.mjs               # Configuração centralizada
│   ├── env.mjs                 # Variáveis de ambiente
│   ├── cors.mjs                # Configuração CORS
│   └── rate-limits.mjs         # Configuração de rate limiting
├── middleware/
│   ├── auth.mjs                # Middleware de autenticação
│   ├── validation.mjs          # Middleware de validação
│   ├── error-handler.mjs       # Middleware de erro
│   └── security.mjs            # Security headers e checks
├── routes/
│   ├── index.mjs               # Router principal
│   ├── auth/
│   │   ├── index.mjs           # Auth router
│   │   ├── steam.mjs           # Steam OAuth
│   │   ├── discord.mjs         # Discord OAuth
│   │   └── google.mjs          # Google OAuth
│   ├── chat/
│   │   ├── index.mjs           # Chat router
│   │   └── messages.mjs        # Message handling
│   ├── voice/
│   │   ├── index.mjs           # Voice router
│   │   ├── rooms.mjs           # Room management
│   │   └── tokens.mjs          # LiveKit tokens
│   ├── social/
│   │   ├── index.mjs           # Social router
│   │   ├── friends.mjs         # Friend management
│   │   ├── activity.mjs        # Social activity
│   │   └── presence.mjs        # User presence
│   ├── steam/
│   │   ├── index.mjs           # Steam router
│   │   ├── library.mjs         # Library sync
│   │   ├── achievements.mjs    # Achievement tracking
│   │   └── search.mjs          # Game search
│   ├── epic/
│   │   ├── index.mjs           # Epic router
│   │   └── catalog.mjs         # Epic catalog
│   └── api/
│       ├── index.mjs           # API router
│       ├── gaming-news.mjs     # Gaming news (mover daqui)
│       ├── nexus.mjs           # Nexus Mods proxy
│       └── proxy.mjs           # Image proxy
├── services/
│   ├── supabase.mjs            # Supabase client (já existe)
│   ├── cache.mjs               # Cache management
│   ├── chat-cleanup.mjs        # Chat retention (extrair de index.mjs)
│   └── news-parser.mjs         # Gaming news parser (mover gaming-news.mjs)
├── utils/
│   ├── security.mjs            # Security boundaries (mover security-boundaries.mjs)
│   ├── steam.mjs               # Steam API helpers
│   ├── discord.mjs             # Discord API helpers
│   ├── oauth.mjs               # OAuth utilities
│   └── image.mjs               # Image processing (mover prepArtwork.mjs)
├── types/
│   └── index.mjs               # Tipos compartilhados (JSDoc)
└── tests/
    ├── unit/
    ├── integration/
    └── fixtures/
```

### Benefícios da Nova Estrutura

1. **Separação por Responsabilidade:** Cada módulo tem uma função clara
2. **Manutenibilidade:** Fácil localizar e corrigir bugs
3. **Testabilidade:** Cada módulo pode ser testado independentemente
4. **Escalabilidade:** Novos recursos podem ser adicionados sem afetar código existente
5. **Colaboração:** Múltiplos desenvolvedores podem trabalhar em diferentes módulos
6. **Performance:** Possibilidade de lazy loading de rotas

---

## 🔧 Problemas de Tipagem e Integridade

### 1. **Falta de Tipagem no Backend** (CRITICAL)

**Problema:** O backend usa JavaScript puro (`.mjs`) sem TypeScript

**Impacto:**
- Erros de tipo em runtime
- Autocomplete limitado
- Refatoração perigosa
- Dificuldade de entender contratos de API

**Solução:**
```javascript
// Adicionar JSDoc para documentação de tipos
/**
 * @typedef {Object} UserProfile
 * @property {string} uid
 * @property {string|null} email
 * @property {string|null} displayName
 * @property {string|null} photoURL
 * @property {"public"|"private"} profileVisibility
 */

/**
 * @param {string} uid
 * @param {Partial<UserProfile>} patch
 * @returns {Promise<void>}
 */
const updateLinkedAccountProfile = async (uid, patch) => {
  // ...
};
```

### 2. **Inconsistência em Nomenclatura** (SUGGESTION)

**Problema:** Mistura de camelCase e snake_case

```javascript
// ❌ INCONSISTENTE
display_name vs displayName
steam_id vs steamId
firebaseUid vs userUid
```

**Solução:** Padronizar para camelCase no backend JavaScript

### 3. **Erro Handling Inconsistente** (SUGGESTION)

**Problema:** Alguns lugares usam `throw`, outros usam `res.status().json()`

**Solução:** Criar middleware de erro centralizado

```javascript
// middleware/error-handler.mjs
export const errorHandler = (err, req, res, next) => {
  console.error('[Error]', err);
  
  if (err instanceof AuthError) {
    return res.status(401).json({ error: err.message });
  }
  
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message });
  }
  
  res.status(500).json({ error: 'Internal server error' });
};
```

### 4. **Validação de Input Insuficiente** (CRITICAL)

**Problema:** Muitos endpoints não validam input adequadamente

**Solução:** Usar Zod consistentemente (já instalado)

```javascript
import { z } from 'zod';

const chatMessageSchema = z.object({
  chatId: z.string().uuid(),
  text: z.string().min(1).max(5000),
  attachmentName: z.string().optional(),
});

app.post('/api/chat/send', async (req, res) => {
  const validated = chatMessageSchema.parse(req.body);
  // ...
});
```

---

## 🚀 Melhorias de Integridade Prioritárias

### 🔴 CRITICAL (Fazer Imediatamente)

#### 1. Remover código morto do Firebase
- Remover `firebaseUid` de `server/index.mjs`
- Remover `firebase-tools` do `package.json`
- Remover variáveis de ambiente Firebase do `.env.example`

#### 2. Implementar validação de input em todos os endpoints
- Usar Zod para validar todos os inputs
- Criar schemas para cada endpoint
- Adicionar middleware de validação centralizado

#### 3. Melhorar error handling
- Criar middleware de erro centralizado
- Padronizar respostas de erro
- Adicionar logging estruturado

#### 4. Separar o monolito `index.mjs`
- Começar movendo autenticação para `routes/auth/`
- Mover chat para `routes/chat/`
- Mover voz para `routes/voice/`

### 🟡 SUGGESTION (Fazer em Seguida)

#### 1. Adicionar JSDoc para documentação de tipos
- Documentar todas as funções principais
- Criar tipos compartilhados em `types/`
- Adicionar exemplos de uso

#### 2. Padronizar nomenclatura
- Converter snake_case para camelCase
- Criar convenção de naming para o projeto
- Documentar no README

#### 3. Adicionar testes
- Criar estrutura de testes em `tests/`
- Adicionar testes unitários para services
- Adicionar testes de integração para rotas

#### 4. Implementar rate limiting por usuário
- Atualmente rate limiting é por IP
- Implementar rate limiting por userId para endpoints autenticados
- Prevenir abuso por usuários maliciosos

### 🟢 NIT (Melhorias Opcionais)

#### 1. Adicionar logging estruturado
- Usar uma biblioteca de logging (ex: winston ou pino)
- Adicionar context em todos os logs
- Implementar log levels

#### 2. Adicionar métricas e monitoring
- Implementar métricas de performance
- Adicionar health checks detalhados
- Monitorar uso de recursos

#### 3. Otimizar queries do Supabase
- Revisar todas as queries do Supabase
- Adicionar indexes onde necessário
- Implementar paginação consistente

---

## 📊 Plano de Migração

### Fase 1: Limpeza Imediata (1-2 horas)
1. Remover código morto do Firebase
2. Remover dependência `firebase-tools`
3. Adicionar validação de input crítica

### Fase 2: Refatoração Autenticação (1 dia)
1. Mover rotas de autenticação para `routes/auth/`
2. Criar middleware de auth centralizado
3. Adicionar testes para autenticação

### Fase 3: Separação por Domínio (3-5 dias)
1. Mover chat para `routes/chat/`
2. Mover voz para `routes/voice/`
3. Mover social para `routes/social/`
4. Mover Steam para `routes/steam/`

### Fase 4: Tipagem e Documentação (2-3 dias)
1. Adicionar JSDoc em todas as funções
2. Criar tipos compartilhados
3. Documentar API com OpenAPI/Swagger

### Fase 5: Testes e Monitoring (3-5 dias)
1. Adicionar testes unitários
2. Adicionar testes de integração
3. Implementar logging estruturado
4. Adicionar métricas

---

## 🎯 Conclusão

O backend atual funciona, mas sofre de problemas clássicos de monolitos:
- **God file** com 4500+ linhas
- Código morto do Firebase
- Falta de tipagem
- Separação inadequada de responsabilidades

A nova estrutura proposta resolve esses problemas através de:
- **Modularização por domínio**
- **Separação clara de responsabilidades**
- **Tipagem via JSDoc**
- **Validação consistente**
- **Testabilidade**

As melhorias críticas podem ser implementadas em poucas horas, enquanto a refatoração completa pode ser feita gradualmente ao longo de 1-2 semanas sem interromper o funcionamento do sistema.