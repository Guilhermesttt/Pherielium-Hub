# Auditoria de Segurança - Login Epic Games & Legendary

## 📋 Sumário Executivo

**Data:** 15/09/2026  
**Escopo:** Integração Epic Games via Legendary CLI  
**Status:** 🔴 **ALTO RISCO** - Recomendação: REMOVER

---

## 🔴 Problemas Críticos Identificados

### 1. **Engenharia Reversa do Launcher Epic Games** (CRITICAL)

**Localização:** `electron/epic-games/legendary-manager.cjs`

**Problema:**
- O **Legendary** é uma ferramenta de engenharia reversa do Epic Games Launcher
- Baixa e executa um binário não assinado do GitHub
- Viola potencialmente os Termos de Serviço da Epic Games

**Código:**
```javascript
const LEGENDARY_DOWNLOAD_URL =
  "https://github.com/legendary-gl/legendary/releases/download/0.21.0/legendary_windows_x64.exe";
```

**Riscos:**
1. **Violação de ToS:** A Epic Games proíbe engenharia reversa de seus sistemas
2. **Banimento de conta:** Usuários podem ter contas banidas por uso de ferramentas não autorizadas
3. **Responsabilidade legal:** Você pode ser responsabilizado por distribuir ferramenta de engenharia reversa
4. **Impossibilidade de suporte:** A Epic não fornecerá suporte para problemas relacionados

### 2. **Download e Execução de Binário Externo** (CRITICAL)

**Problema:**
- O executável é baixado do GitHub sem verificação de assinatura digital
- Apenas verificação de hash SHA256 (que pode ser comprometida se o repo for hackeado)
- Execução de binário não verificado no sistema do usuário

**Código:**
```javascript
const verifyBuffer = (buffer) => {
  if (
    buffer.length !== expectedAssetSize ||
    digest(buffer) !== expectedSha256
  ) {
    throw new Error("Falha na verificacao do Legendary.");
  }
};
```

**Riscos:**
1. **Supply chain attack:** Se o repositório GitHub for comprometido, malware pode ser distribuído
2. **Hash collision:** SHA256 não é imune a ataques (embora improvável)
3. **Sem assinatura digital:** Não há garantia de que o binário veio do desenvolvedor original
4. **Auto-update perigoso:** Atualizações automáticas podem introduzir malware sem revisão

### 3. **Armazenamento Inseguro de Credenciais** (HIGH)

**Localização:** `electron/epic-games/epic-session.cjs`, `electron/epic-credential-vault.cjs`

**Problema:**
- Tokens de acesso Epic Games são armazenados localmente
- Tokens de refresh são armazenados em texto (embora em vault criptografado)
- O Legendary também armazena tokens em `~/.config/legendary/user.json`

**Riscos:**
1. **Exposição de credenciais:** Se o sistema for comprometido, tokens podem ser roubados
2. **Acesso não autorizado:** Tokens podem ser usados para acessar conta Epic da vítima
3. **Compras não autorizadas:** Tokens podem ser usados para fazer compras na Epic Store
4. **Persistência:** Tokens têm longa validade (2+ horas de access token)

### 4. **Spoofing de User-Agent** (MEDIUM)

**Localização:** `electron/epic-games/epic-account.cjs`

**Código:**
```javascript
const STORE_USER_AGENT =
  "EpicGamesLauncher/14.0.8-22004686+++Portal+Release-Live";
```

**Problema:**
- O sistema se passa pelo Epic Games Launcher oficial
- Isso é tecnicamente engenharia reversa
- A Epic pode detectar e bloquear este User-Agent

**Riscos:**
1. **Bloqueio de IP:** A Epic pode bloquear IPs que usam User-Agent spoofing
2. **Detecção de bot:** Pode ser interpretado como atividade maliciosa
3. **Quebra de funcionalidade:** Se a Epic mudar a validação, o sistema para de funcionar

### 5. **Falta de Rate Limiting** (MEDIUM)

**Problema:**
- Chamadas GraphQL para Epic Games não têm rate limiting explícito
- Possível abuso ou DDoS involuntário contra APIs da Epic

**Riscos:**
1. **Bloqueio de conta:** A Epic pode bloquear contas que fazem muitas requisições
2. **Blacklist de IP:** Seu IP pode ser bloqueado das APIs da Epic
3. **Custo operacional:** Requisições excessivas podem chamar atenção negativa

---

## ⚖️ Análise Legal e ToS

### Termos de Serviço da Epic Games

Baseado nos Termos de Serviço padrão da Epic Games:

1. **Proibição de Engenharia Reversa:**
   > "You may not... reverse engineer, decompile, disassemble, or otherwise attempt to derive the source code of any Services..."

2. **Proibição de Ferramentas Não Autorizadas:**
   > "You may not use... any unauthorized third-party software... to access or use the Services"

3. **Consequências:**
   - Banimento permanente de conta
   - Perda de todos os jogos comprados
   - Ação legal por violação de contrato
   - Responsabilidade por danos

### Risco Legal para Você

Como desenvolvedor/distribuidor:

1. **Responsabilidade por distribuição:** Você está distribuindo ferramenta de engenharia reversa
2. **Violação de DMCA:** Engenharia reversa pode violar leis de copyright
3. **Ação legal da Epic:** A Epic pode processar por violação de ToS
4. **Danos reputacionais:** Associação com ferramentas "pirata"

---

## 🔍 Análise Técnica do Legendary

### O que é o Legendary?

- **Tipo:** CLI de engenharia reversa do Epic Games Launcher
- **Função:** Permite baixar e gerenciar jogos da Epic sem o launcher oficial
- **Status:** Projeto open-source não oficial
- **Risco:** Ferramenta grey-area, frequentemente associada com pirataria

### Por que é Problemático?

1. **Não oficial:** Não endossado ou suportado pela Epic Games
2. **Engenharia reversa:** Funciona através de reversão dos protocolos do launcher
3. **Uso comum:** Frequentemente usado para baixar jogos gratuitos sem criar conta
4. **Violação de ToS:** Claramente viola os termos de serviço da Epic

### Análise do Código

**Verificação de Hash:**
```javascript
const LEGENDARY_SHA256 =
  "4c01a14c0acb0c46069b197ae7212ea4ea6b861661126ca0593cdac31658fb01";
```

**Problemas:**
- Hash está hardcoded no código
- Se o repo for comprometido, você pode não perceber
- Não há verificação de assinatura PGP/GPG
- Atualizações automáticas podem mudar o hash sem revisão

**Execução de Processo:**
```javascript
child = spawnImpl(exePath, args, {
  shell: false,
  windowsHide: true,
});
```

**Problemas:**
- Execução de binário externo sem sandbox
- WindowsHide apenas esconde a janela, não isola o processo
- Sem verificação de integridade do processo em execução

---

## 🎯 Recomendações

### 🔴 RECOMENDAÇÃO: REMOVER INTEGRAÇÃO EPIC/LEGENDARY

**Motivos:**

1. **Risco Legal Violação de ToS:** Engenharia reversa é proibida
2. **Risco de Banimento:** Usuários podem perder contas
3. **Risco de Supply Chain:** Download de binário não assinado
4. **Risco de Responsabilidade:** Você pode ser processado
5. **Alternativas Existem:** Há formas oficiais de integração

### Alternativas Oficiais

#### 1. **Epic Games OAuth Oficial**
- A Epic oferece OAuth oficial para desenvolvedores
- Register em https://dev.epicgames.com/
- Uso de APIs autorizadas e documentadas
- Sem risco de banimento

#### 2. **Epic Games Store API**
- APIs oficiais para catalog e metadados
- Documentação em https://dev.epicgames.com/docs/
- Acesso autorizado a dados de jogos
- Sem necessidade de engenharia reversa

#### 3. **Web Integration**
- Usar web view para login oficial Epic
- Redirect OAuth oficial
- Tokens válidos e autorizados
- Sem violação de ToS

### Se Manter Integração (Não Recomendado)

#### Medidas de Mitigação Mínimas:

1. **Aviso Explícito ao Usuário:**
   ```javascript
   // Adicionar warning claro antes de usar Legendary
   const userConsent = await showWarningDialog(
     "AVISO: Esta funcionalidade usa o Legendary, uma ferramenta de engenharia reversa. " +
     "Isso pode violar os Termos de Serviço da Epic Games e resultar em banimento de conta. " +
     "Use por sua conta e risco."
   );
   ```

2. **Verificação de Assinatura:**
   - Implementar verificação PGP/GPG do binário
   - Verificar assinatura do desenvolvedor do Legendary
   - Não aceitar binários sem assinatura válida

3. **Sandboxing:**
   - Executar Legendary em sandbox isolado
   - Limitar acesso ao sistema de arquivos
   - Usar containers ou virtualização

4. **Rate Limiting Estrito:**
   - Implementar rate limiting para chamadas Epic
   - Limitar requisições por usuário/hora
   - Cache agressivo de respostas

5. **Monitoramento:**
   - Monitorar mudanças no repositório Legendary
   - Alertas para atualizações não autorizadas
   - Log de todas as chamadas para Epic

---

## 📊 Comparação de Riscos

| Aspecto | Legendary (Atual) | OAuth Oficial |
|---------|------------------|---------------|
| **Legalidade** | ❌ Viola ToS | ✅ Autorizado |
| **Risco de Banimento** | 🔴 Alto | 🟢 Baixo |
| **Segurança** | 🔴 Binário externo | 🟢 API oficial |
| **Manutenção** | 🔴 Depende de terceiros | 🟢 Suporte oficial |
| **Responsabilidade** | 🔴 Sua responsabilidade | 🟢 Responsabilidade Epic |
| **Funcionalidade** | 🔴 Engenharia reversa | 🟢 API documentada |
| **Estabilidade** | 🟡 Pode quebrar | 🟢 Estável |

---

## 🚨 Conclusão

### Avaliação Final: 🔴 **ALTO RISCO - NÃO RECOMENDADO**

**Principais Problemas:**
1. Violação clara dos Termos de Serviço da Epic Games
2. Risco de banimento de conta para usuários
3. Download e execução de binário não assinado
4. Responsabilidade legal para você como desenvolvedor
5. Alternativas oficiais disponíveis e mais seguras

**Recomendação Forte:**
- **REMOVER** integração com Legendary imediatamente
- **IMPLEMENTAR** integração via OAuth oficial da Epic
- **DOCUMENTAR** claramente aos usuários sobre a mudança
- **MIGRAR** usuários existentes para método oficial

**Custo de Manutenção:**
- Manter integração Legendary: Alto risco, alta responsabilidade
- Migrar para OAuth oficial: Investimento inicial, baixo risco longo prazo

**Impacto nos Usuários:**
- Legendary: Risco de perder conta Epic
- OAuth oficial: Protegido por ToS, suporte oficial

---

## 📝 Próximos Passos Sugeridos

1. **Imediato:**
   - Remover código do Legendary
   - Remover downloads automáticos do binário
   - Adicionar aviso aos usuários sobre descontinuação

2. **Curto Prazo (1-2 semanas):**
   - Implementar OAuth oficial Epic
   - Migrar usuários para novo sistema
   - Atualizar documentação

3. **Médio Prazo (1 mês):**
   - Remover completamente código Legendary
   - Limpar arquivos de configuração
   - Finalizar migração de usuários

4. **Longo Prazo:**
   - Monitorar uso da integração oficial
   - Coletar feedback dos usuários
   - Melhorar experiência baseada em feedback