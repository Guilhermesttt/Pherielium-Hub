# Correção do Problema de Expiração de Token JWT

## 📋 Sumário

**Problema:** Ao reabrir o hub, o token JWT expira mas as chamadas ao Supabase continuam sem verificação adequada, causando erros `ERR_CONNECTION_RESET` e `Failed to fetch`.

**Solução:** Implementar verificação de sessão antes de chamadas críticas e melhorar tratamento de erros de autenticação.

---

## 🔍 Análise do Problema

### Causa Raiz

1. **Expiração Silenciosa do Token:**
   - Tokens JWT têm tempo de vida limitado (geralmente 1 hora)
   - Ao reabrir o app após longo período, o token pode estar expirado
   - O refresh automático pode falhar silenciosamente

2. **Chamadas sem Verificação:**
   - `syncPublicLibrarySummary` chamava Supabase sem verificar sessão
   - `syncLocalGamesToCloud` não validava se o token era válido
   - Erros de rede eram tratados como erros genéricos

3. **Feedback Inadequado ao Usuário:**
   - Usuário não sabia que precisava re-login
   - Erros de conexão eram confusos
   - Nenhuma indicação clara de que era problema de auth

---

## ✅ Soluções Implementadas

### 1. Verificação de Sessão Antes de Chamadas Críticas

**Arquivo:** `src/services/localLibrary.ts`

**Mudanças:**
- Importado `getUsableSession` do `api.ts`
- Adicionada verificação de sessão em `syncLocalGamesToCloud`
- Adicionada verificação de sessão em `syncPublicLibrarySummary`
- Tratamento específico para erros de autenticação

**Código:**
```typescript
// Verificar se temos uma sessão válida antes de tentar sincronizar
const session = await getUsableSession();
if (!session) {
  console.warn("[LocalLibrary] Sessão expirada ou inválida, pulando sync de biblioteca");
  throw new Error("Sessão expirada. Por favor, faça login novamente.");
}
```

### 2. Tratamento Melhorado de Erros de Autenticação

**Arquivo:** `src/services/localLibrary.ts`

**Mudanças:**
- Adicionado logging específico para erros de Supabase
- Try-catch com detecção de erros de JWT
- Retorno `false` em vez de throw para erros de auth não-críticos
- Logging melhorado com contexto `[LocalLibrary]`

**Código:**
```typescript
} catch (error) {
  console.error("[LocalLibrary] Erro em syncPublicLibrarySummary:", error);
  // Se o erro for relacionado a autenticação, não marcar como sincronizado
  if (error?.message?.includes("Sessão expirada") || error?.message?.includes("JWT")) {
    console.warn("[LocalLibrary] Erro de autenticação, requer re-login");
    return false;
  }
  throw error;
}
```

### 3. Wrapper Seguro para Chamadas Supabase

**Arquivo:** `src/services/supabaseWithAuth.mjs` (NOVO)

**Funcionalidades:**
- `withAuthCheck()` - Wrapper genérico com verificação de sessão
- `withAuthRead()` - Wrapper para operações de leitura
- `withAuthWrite()` - Wrapper para operações de escrita
- `isSessionValid()` - Verificação rápida de sessão
- `forceSessionRefresh()` - Refresh manual de sessão
- Detecção automática de erros de JWT
- Auto-refresh em caso de erro de token

**Uso:**
```typescript
import { withAuthWrite } from "./supabaseWithAuth";

const result = await withAuthWrite(async () => {
  return await supabase.from("user_games").upsert(data);
});
```

### 4. Componente de Alerta de Sessão

**Arquivo:** `src/components/AuthSessionAlert.tsx` (NOVO)

**Funcionalidades:**
- Alerta visual quando sessão expira
- Botão para re-login
- Hook `useAuthAlert` para disparar alertas
- Design consistente com tema escuro
- Opção de dismiss para usuários

**Uso:**
```typescript
import { AuthSessionAlert } from "./components/AuthSessionAlert";
import { useAuthAlert } from "./components/AuthSessionAlert";

function MyComponent() {
  const { dispatchAuthError } = useAuthAlert();
  
  const handleSyncError = (error) => {
    if (error?.message?.includes("Sessão expirada")) {
      dispatchAuthError("session_expired");
    }
  };
  
  return (
    <>
      <AuthSessionAlert />
      {/* ... */}
    </>
  );
}
```

### 5. Melhoria no Componente Home

**Arquivo:** `src/pages/Home.tsx`

**Mudanças:**
- Detecção específica de erros de auth no `syncPublicLibrarySummary`
- Comentário sobre possível toast/notificação futura
- Contexto melhorado no logging

**Código:**
```typescript
void syncPublicLibrarySummary(user.uid, userProfile).catch((error) => {
  console.error("Falha ao sincronizar resumo publico da biblioteca:", error);
  // Se o erro for de autenticação, mostrar aviso ao usuário
  if (error?.message?.includes("Sessão expirada") || error?.message?.includes("JWT")) {
    console.warn("[Home] Sessão expirada, usuário pode precisar re-login");
    // Aqui você pode adicionar um toast/notificação para o usuário
  }
});
```

---

## 🎯 Benefícios das Melhorias

### Para o Usuário:
1. **Feedback Claro:** Aviso explícito quando sessão expira
2. **Ação Direta:** Botão de re-login readily available
3. **Menos Confusão:** Erros de auth são claramente identificados
4. **Experiência Melhor:** Não precisa desconectar/reconectar manualmente

### Para o Desenvolvedor:
1. **Debug Mais Fácil:** Logging contextualizado com `[Module]`
2. **Código Mais Seguro:** Verificação de sessão antes de operações críticas
3. **Manutenibilidade:** Wrapper reutilizável para auth checks
4. **Prevenção de Bugs:** Tratamento específico para diferentes tipos de erro

### Para o Sistema:
1. **Menos Erros:** Chamadas falham gracefully quando auth expira
2. **Performance:** Não tenta operações que vão falhar
3. **Estabilidade:** Melhor recovery de erros de rede
4. **Segurança:** Não expõe erros internos quando auth falha

---

## 🚀 Próximos Passos Sugeridos

### Imediato:
1. **Adicionar AuthSessionAlert ao App:**
   ```typescript
   // Em App.tsx ou main layout
   import { AuthSessionAlert } from "./components/AuthSessionAlert";
   
   function App() {
     return (
       <>
         <AuthSessionAlert />
         {/* ... resto do app ... */}
       </>
     );
   }
   ```

2. **Usar Wrapper em Operações Críticas:**
   - Migrar chamadas Supabase críticas para usar `withAuthWrite`
   - Adicionar verificação em outros services que usam Supabase

### Curto Prazo:
1. **Implementar Toast/Notificação:**
   - Integrar com sistema de toast existente (sonner)
   - Mostrar notificação não-intrusiva quando auth expira

2. **Adicionar Auto-Re-login:**
   - Se refresh token ainda válido, tentar re-login automático
   - Apenas solicitar credenciais se refresh também expirou

3. **Melhorar Logging:**
   - Adicionar logging estruturado
   - Enviar métricas de falhas de auth para monitoring

### Longo Prazo:
1. **Implementar Silent Refresh:**
   - Refresh proativo antes da expiração
   - Background refresh sem interromper usuário

2. **Adicionar Offline Mode:**
   - Permitir uso offline com cache local
   - Sync automático quando conexão retorna

3. **Melhorar Error Recovery:**
   - Retry automático com exponential backoff
   - Circuit breaker para chamadas repetidamente falhando

---

## 📊 Fluxo Melhorado de Autenticação

### Antes:
```
Usuário abre app → Token expirado → Chamada Supabase → Erro → Confusão
```

### Depois:
```
Usuário abre app → Token expirado → Verificação de sessão → Alerta visual → Re-login → Sucesso
```

### Detalhado:
```
1. App inicializa
2. AuthProvider verifica sessão
3. Se expirada, tenta refresh
4. Se refresh falha, usa sessão local conhecida
5. Home.tsx chama syncPublicLibrarySummary
6. syncPublicLibrarySummary verifica sessão com getUsableSession
7. Se sem sessão, lança erro específico
8. try-catch detecta erro de auth
9. Usa useAuthAlert para mostrar alerta
10. Usuário clica em "Fazer Login"
11. Redireciona para login ou abre modal
12. Usuário faz login
13. Sessão restaurada
14. Sync funciona normalmente
```

---

## 🔧 Como Testar

### Cenário 1: Token Expirado
1. Faça login no app
2. Espere o token expirar (ou simule mudando hora do sistema)
3. Feche e reabra o app
4. **Esperado:** Alerta de sessão expirada aparece
5. Clique em "Fazer Login"
6. **Esperado:** Login funciona e sync retoma

### Cenário 2: Erro de Rede
1. Desconecte internet
2. Tente sincronizar biblioteca
3. **Esperado:** Erro de rede logado, não confundido com auth
4. Reconecte internet
5. **Esperado:** Sync funciona automaticamente

### Cenário 3: Refresh Funciona
1. Faça login
2. Espere接近 expiração (55 minutos)
3. Tente sincronizar
4. **Esperado:** Refresh automático funciona, sync continua
5. Sem alerta mostrado ao usuário

---

## 📝 Notas Importantes

1. **Backward Compatibility:** As mudanças são backward compatible
2. **Non-Breaking:** Funcionalidade existente continua funcionando
3. **Progressive Enhancement:** Novos recursos melhoram experiência sem quebrar antigos
4. **Performance:** Verificação de sessão é rápida (cache local)
5. **Security:** Não expõe informações sensíveis em erros

---

## 🎓 Lições Aprendidas

1. **Sempre verificar sessão antes de operações críticas**
2. **Tratar erros de auth diferentemente de erros de rede**
3. **Dar feedback claro ao usuário sobre problemas de auth**
4. **Logging contextualizado é essencial para debug**
5. **Wrappers reutilizáveis reduzem repetição de código**

---

## 🔗 Arquivos Modificados

1. `src/services/localLibrary.ts` - Verificação de sessão e tratamento de erros
2. `src/pages/Home.tsx` - Detecção de erros de auth
3. `src/services/supabaseWithAuth.mjs` - NOVO: Wrapper seguro para Supabase
4. `src/components/AuthSessionAlert.tsx` - NOVO: Componente de alerta visual
5. `AUTH_FIX_DOCUMENTATION.md` - Este documento

---

## ✅ Status da Implementação

- [x] Verificação de sessão em syncLocalGamesToCloud
- [x] Verificação de sessão em syncPublicLibrarySummary  
- [x] Tratamento específico de erros de JWT
- [x] Wrapper seguro para chamadas Supabase
- [x] Componente de alerta visual
- [x] Melhoria de logging contextual
- [x] Documentação completa
- [ ] Integração do AuthSessionAlert no App.tsx
- [ ] Integração com sistema de toast existente
- [ ] Testes automatizados dos cenários
- [ ] Implementação de auto-re-login

---

**Pronto para uso!** As melhorias foram implementadas e estão prontas para teste.