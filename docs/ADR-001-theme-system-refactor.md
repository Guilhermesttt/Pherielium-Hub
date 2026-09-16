# ADR-001: Refatoração do Sistema de Temas e Personalização

## Status
Accepted

## Contexto
O Pherielium Hub atualmente possui um sistema de temas básico onde `VisualTheme` e `SoundTheme` estão acoplados. Cada tema pré-definido (PS5, Xbox, GameCube, etc.) aplica simultaneamente um pacote visual e sonoro. Além disso, a personalização é limitada à seleção desses temas pré-existentes, com apenas um modo de performance binário (`lowPerformanceMode`).

O plano de evolução do produto exige transformar o Pherielium em um hub totalmente customizável, com:
- Desacoplamento entre temas visuais e sonoros
- Personalização granular de aparência (accent, blur, transparência, etc.)
- Sistema de perfis de performance
- Presets de configuração compartilháveis
- Personalização por dispositivo e por jogo

## Decisão
Refatorar completamente o sistema de temas e preferências para suportar uma arquitetura modular e extensível de personalização.

### Nova Arquitetura

#### 1. Desacoplamento de Temas
Separar `VisualTheme` e `SoundTheme` em configurações independentes, permitindo combinações livres.

```typescript
interface ThemeConfig {
  visual: VisualThemeConfig;
  sound: SoundThemeConfig;
}

interface VisualThemeConfig {
  baseTheme: VisualTheme; // "phelierium", "ps5", etc.
  accentColor: string;
  customizations: AppearanceCustomizations;
}

interface SoundThemeConfig {
  baseTheme: SoundTheme;
  volumeOverrides: VolumeOverrides;
}
```

#### 2. Sistema de Performance Profiles
Substituir o boolean `lowPerformanceMode` por um sistema de perfis com configurações granulares.

```typescript
interface PerformanceProfile {
  id: 'maximum' | 'balanced' | 'performance' | 'custom';
  name: string;
  blurIntensity: number; // 0-100
  transparency: number; // 0-100
  animationsLevel: 'cinematic' | 'normal' | 'reduced' | 'off';
  videoBackgrounds: boolean;
  particles: boolean;
  shadows: boolean;
  visualEffects: boolean;
  preloadQuality: 'high' | 'medium' | 'low';
}
```

#### 3. Customização de Aparência
Criar sistema granular para ajustes visuais.

```typescript
interface AppearanceCustomizations {
  accentColor: string;
  blurIntensity: number;
  transparency: number;
  glowIntensity: number;
  contrastLevel: number;
  shadowIntensity: number;
  borderRadius: number;
  material: 'liquid-glass' | 'frosted' | 'solid';
  backgroundType: 'theme-default' | 'game-artwork' | 'custom-wallpaper' | 'video' | 'solid' | 'gradient';
  customBackground?: string;
  interfaceDensity: 'compact' | 'standard' | 'console';
}
```

#### 4. Sistema de Presets
Implementar sistema de presets configuráveis pelo usuário.

```typescript
interface UserPreset {
  id: string;
  name: string;
  description?: string;
  visualConfig: VisualThemeConfig;
  performanceProfile: PerformanceProfile;
  layoutConfig: LayoutConfig;
  createdAt: Date;
  updatedAt: Date;
  isDefault: boolean;
}
```

#### 5. Personalização por Dispositivo
Suportar configurações diferentes por dispositivo.

```typescript
interface DeviceProfile {
  deviceId: string;
  deviceName: string;
  presetId?: string;
  autoPerformanceEnabled: boolean;
  detectedHardware?: HardwareInfo;
}
```

## Consequências

### Positivas
- **Flexibilidade**: Usuários podem combinar qualquer visual com qualquer tema sonoro
- **Performance**: Perfis otimizados permitem experiência ajustada ao hardware
- **Extensibilidade**: Arquitetura modular facilita adição de novas features
- **Compartilhamento**: Presets exportáveis como JSON permitem comunidade
- **Retenção**: Personalização profunda aumenta engajamento

### Negativas
- **Complexidade**: Aumento significativo da complexidade do código
- **Migração**: Usuários existentes precisam migrar configurações
- **Superfície de Teste**: Mais combinações possíveis = mais testes necessários
- **Performance**: Sistema de perfis adiciona overhead de validação

### Mitigações
- Implementar migração automática de configurações antigas
- Criar validação rigorosa de presets para evitar estados inválidos
- Documentar schemas JSON para compatibilidade
- Implementar testes automatizados para perfis e presets

## Alternativas Consideradas

### Alternativa 1: Manter Sistema Atual e Adicionar Apenas Overlays
**Descrição**: Adicionar camadas de customização sobre o sistema atual sem refatoração.

**Por que rejeitada**: Manteria acoplamento visual/sound, limitaria flexibilidade, e aumentaria complexidade técnica (dupla manutenção).

### Alternativa 2: Sistema de Plugins
**Descrição**: Usar sistema de plugins para extensões de tema.

**Por que rejeitada**: Overkill para MVP, complexidade desnecessária para Fase 1, pode ser considerado para futuro (Theme Marketplace).

## Implementação

### Fase 1: Fundação
- Refatorar `PreferencesContext` com novos tipos
- Implementar schema de PerformanceProfile
- Criar validadores de configuração

### Fase 2: Performance
- Implementar lógica de perfis de performance
- Adicionar detecção automática de hardware
- Criar UI para seleção de perfis

### Fase 3: Personalização Visual
- Implementar Appearance Studio
- Adicionar controles granulares
- Criar sistema de Dynamic Accent

### Fase 4: Presets
- Implementar sistema de UserPreset
- Adicionar UI para criar/editar presets
- Implementar importar/exportar JSON

### Fase 5: Dispositivos
- Implementar DeviceProfile
- Adicionar detecção de dispositivo
- Criar UI para gerenciar perfis por dispositivo

## Referências
- Plano de Personalização Pherielium Hub (Documento interno)
- DESIGN.md - Guidelines visuais atuais
- PreferencesContext.tsx - Implementação atual

## Aprovação
- **Autor**: Devin AI Assistant
- **Data**: 2026-09-15
- **Status**: Accepted
