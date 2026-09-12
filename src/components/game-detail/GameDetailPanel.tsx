import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, X, ChevronLeft, ChevronRight, Camera, Play } from "lucide-react";
import type { Game } from "../../types/domain";
import type { GameDetailPanelProps } from "../../types/gameDetail";
import { DETAIL_PANEL_COPY, CATEGORY_LABELS } from "../../types/gameDetail";
import { useAuth } from "../../auth/AuthProvider";
import { usePreferences } from "../../context/PreferencesContext";
import { useNotification } from "../NotificationCenter";
import { useGamepad, useGamepadButton } from "../../context/GamepadContext";
import { useGamepadNavigation } from "../../hooks/useGamepadNavigation";
import { activateElementWithController } from "../../utils/controllerTextInput";
import { sanitizeStoreHtml } from "../../utils/sanitizeStoreHtml";
import ModalShell from "../ui/ModalShell";
import InputHints from "../ui/InputHints";

import { useGameDetailState } from "../../hooks/useGameDetailState";
import { useGameDetailAsync } from "../../hooks/useGameDetailAsync";
import { useGameDetailActions } from "../../hooks/useGameDetailActions";

import { GameDetailHeader } from "./GameDetailHeader";
import { GameDetailActions } from "./GameDetailActions";
import { GameDetailStats } from "./GameDetailStats";
import { GameDetailAchievements } from "./GameDetailAchievements";
import { GameDetailSocialMods } from "./GameDetailSocialMods";

export const GameDetailPanel: React.FC<GameDetailPanelProps> = ({
  game,
  isOpen,
  onClose,
  playSound,
  onLibraryChanged,
  onGameHydrated,
  onOpenMods,
}) => {
  const { user, userProfile } = useAuth();
  const { language, closeOnLaunch } = usePreferences();
  const { notify } = useNotification();
  const { isGamepadConnected, gamepadFamily, activeInputType } = useGamepad();

  const detailLanguage =
    language === "pt-BR" || language === "en-US" || language === "es-ES"
      ? language
      : "en-US";
  const copy = DETAIL_PANEL_COPY[detailLanguage] || DETAIL_PANEL_COPY["en-US"];

  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Hook de Estado Reducer
  const {
    state,
    dispatch,
    setActiveTab,
    openGallery,
    closeGallery,
    setGalleryIndex,
    openDeleteModal,
    closeDeleteModal,
    setDeleteConfirmText,
    setAchievementFilter,
    setAchievementSearch,
    resetForGame,
  } = useGameDetailState(copy.tabPlay);

  // Hook de Dados Assíncronos
  const asyncData = useGameDetailAsync({
    game,
    isOpen,
    language,
    user,
    userProfile,
    onGameHydrated,
    onLibraryChanged,
  });

  // Hook de Ações
  const actions = useGameDetailActions({
    game,
    state,
    dispatch,
    launchProfile: asyncData.launchProfile,
    user,
    closeOnLaunch,
    copy,
    notify,
    onClose,
    onLibraryChanged,
    onOpenMods,
    playSound,
  });

  // Reset de abas e estado ao trocar de jogo
  React.useEffect(() => {
    if (isOpen) {
      resetForGame(copy.tabPlay);
    }
  }, [game?.id, isOpen, copy.tabPlay, resetForGame]);

  const tabs = React.useMemo(
    () => [copy.tabPlay, copy.tabAbout, copy.tabAchievements, copy.tabCaptures, copy.tabMods, copy.tabManage],
    [copy]
  );

  // Navegação por teclado nas abas
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || state.galleryModalOpen || state.deleteModalOpen || state.isLaunching) return;
      const currentIndex = tabs.indexOf(state.activeTab);
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % tabs.length;
        setActiveTab(tabs[nextIndex]);
        playSound("navigate");
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        setActiveTab(tabs[prevIndex]);
        playSound("navigate");
      } else if (e.key === "Escape" && !state.galleryModalOpen && !state.deleteModalOpen) {
        onClose();
        playSound("back");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, state.activeTab, state.galleryModalOpen, state.deleteModalOpen, state.isLaunching, tabs, playSound, onClose, setActiveTab]);

  // Gamepad L1 / R1 para trocar de abas
  useGamepadButton("L1", () => {
    if (!isOpen || state.deleteModalOpen || state.galleryModalOpen || state.isLaunching) return;
    const i = tabs.indexOf(state.activeTab);
    if (i > 0) {
      setActiveTab(tabs[i - 1]);
      playSound("navigate");
    }
  });

  useGamepadButton("R1", () => {
    if (!isOpen || state.deleteModalOpen || state.galleryModalOpen || state.isLaunching) return;
    const i = tabs.indexOf(state.activeTab);
    if (i >= 0 && i < tabs.length - 1) {
      setActiveTab(tabs[i + 1]);
      playSound("navigate");
    }
  });

  // Botão X / A para iniciar ou interagir
  useGamepadButton("X", () => {
    if (!isOpen || state.galleryModalOpen || state.deleteModalOpen || state.isLaunching) return;

    if (
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body &&
      scrollRef.current?.contains(document.activeElement)
    ) {
      activateElementWithController(document.activeElement);
      return;
    }

    if (state.activeTab === copy.tabPlay) {
      actions.handleLaunch();
    }
  }, isOpen && !state.galleryModalOpen && !state.deleteModalOpen, 10);

  // Botão Quadrado / X para fotos
  useGamepadButton("SQUARE", () => {
    if (!isOpen || state.galleryModalOpen || state.deleteModalOpen || state.isLaunching) return;
    if (asyncData.localScreenshots.length > 0) {
      openGallery(0);
      playSound("select");
    }
  });

  // Gamepad navigation hook
  useGamepadNavigation({
    onClose: () => {
      if (state.galleryModalOpen) {
        closeGallery();
        playSound("modalClose");
      } else if (state.deleteModalOpen) {
        closeDeleteModal();
        playSound("back");
      } else if (isOpen && !state.isLaunching) {
        onClose();
        playSound("back");
      }
    },
    scrollRef: scrollRef as React.RefObject<HTMLElement>,
    disableX: true,
    disableO: false,
    enabled: isOpen,
  });

  // Imagens e dados derivados
  const heroImage = React.useMemo(() => {
    if (!game) return "";
    if (asyncData.isSteamGame) {
      return game.backgroundImage || game.image || asyncData.steamDetails.data?.backgroundImage ||
        (game.steamAppId ? `https://cdn.akamai.steamstatic.com/steam/apps/${game.steamAppId}/library_hero.jpg` : "");
    }
    if (asyncData.isEpicGame) {
      return game.backgroundImage || game.image || asyncData.epicDetails.data?.backgroundImage || "";
    }
    return game.backgroundImage || game.image || "";
  }, [game, asyncData.isSteamGame, asyncData.isEpicGame, asyncData.steamDetails.data, asyncData.epicDetails.data]);

  const coverImage = React.useMemo(() => {
    if (!game) return "";
    if (asyncData.isSteamGame) {
      return game.cardImage || game.image || asyncData.steamDetails.data?.cardImage ||
        (game.steamAppId ? `https://cdn.akamai.steamstatic.com/steam/apps/${game.steamAppId}/library_600x900_2x.jpg` : "") ||
        game.backgroundImage || "";
    }
    if (asyncData.isEpicGame) {
      return game.cardImage || game.image || asyncData.epicDetails.data?.cardImage || game.backgroundImage || "";
    }
    return game.cardImage || game.image || game.backgroundImage || "";
  }, [game, asyncData.isSteamGame, asyncData.isEpicGame, asyncData.steamDetails.data, asyncData.epicDetails.data]);

  const platformLabel = React.useMemo(() => {
    if (asyncData.isSteamGame) return copy.steamLabel;
    if (asyncData.isEpicGame) return copy.epicLabel;
    return copy.localLabel;
  }, [asyncData.isSteamGame, asyncData.isEpicGame, copy]);

  const localizedCategory = React.useMemo(() => {
    const raw = String(game?.category || "").toUpperCase();
    return CATEGORY_LABELS[raw]?.[language] || game?.category || copy.library;
  }, [game?.category, language, copy.library]);

  const formattedHours = React.useMemo(() => {
    const minutes = Math.round((game?.hoursPlayed || 0) * 60);
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }, [game?.hoursPlayed]);

  const lastSession = React.useMemo(() => {
    if (!game?.lastPlayedAt) return copy.neverStarted;
    try {
      return new Date(game.lastPlayedAt).toLocaleDateString(language, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return copy.neverStarted;
    }
  }, [game?.lastPlayedAt, language, copy.neverStarted]);

  const sanitizedAboutHtml = React.useMemo(() => {
    const raw =
      asyncData.steamDetails.data?.aboutTheGame ||
      asyncData.steamDetails.data?.description ||
      asyncData.epicDetails.data?.aboutTheGame ||
      asyncData.epicDetails.data?.description ||
      game?.aboutTheGame ||
      game?.description ||
      copy.noDescription;
    return sanitizeStoreHtml(raw);
  }, [asyncData.steamDetails.data, asyncData.epicDetails.data, game?.aboutTheGame, game?.description, copy.noDescription]);

  const sanitizedSupportedLanguagesHtml = React.useMemo(() => {
    const raw = asyncData.steamDetails.data?.supportedLanguages;
    return raw ? sanitizeStoreHtml(raw) : undefined;
  }, [asyncData.steamDetails.data]);

  const sanitizedMinRequirementsHtml = React.useMemo(() => {
    const raw = asyncData.steamDetails.data?.pcRequirements?.minimum;
    return raw ? sanitizeStoreHtml(raw) : undefined;
  }, [asyncData.steamDetails.data]);

  const sanitizedRecRequirementsHtml = React.useMemo(() => {
    const raw = asyncData.steamDetails.data?.pcRequirements?.recommended;
    return raw ? sanitizeStoreHtml(raw) : undefined;
  }, [asyncData.steamDetails.data]);

  const hasEpicLaunchShortcut = Boolean(
    asyncData.isEpicGame &&
    String(game?.epicLaunchId || game?.executablePath || game?.epicCatalogId || "").split(":").filter(Boolean).length >= 3
  );

  const galleryItems = React.useMemo(() => {
    const items: Array<{ type: "image"; url: string }> = [];
    if (asyncData.localScreenshots.length > 0) {
      asyncData.localScreenshots.forEach((url) => items.push({ type: "image", url }));
    } else if (game?.screenshots?.length) {
      game.screenshots.forEach((url) => items.push({ type: "image", url }));
    }
    return items;
  }, [asyncData.localScreenshots, game?.screenshots]);

  if (!game) return null;

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          key="detail-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
          className="fixed inset-0 z-100 bg-[#050505] overflow-y-auto detail-panel-scrollbar"
          ref={scrollRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Detalhes de ${game.title}`}
        >
          {/* Dicas de Controle */}
          <div className="fixed bottom-6 right-8 z-[120] pointer-events-none">
            <InputHints
              hints={
                state.galleryModalOpen
                  ? [
                    { button: "DPAD", label: "Navegar" },
                    { button: "O", label: "Fechar" },
                  ]
                  : [
                    { button: "X", label: "Jogar" },
                    { button: "SQUARE", label: "Fotos" },
                    { button: "O", label: "Voltar" },
                    { button: "L1_R1", label: "Abas" },
                  ]
              }
            />
          </div>

          {/* Botão Fechar fixo */}
          <button
            onClick={onClose}
            aria-label={copy.close}
            className="fixed top-8 right-8 z-[150] p-4 bg-black/40 backdrop-blur-md border border-white/10 rounded-full hover:bg-white/10 transition-all hover:rotate-90 active:scale-90 cursor-pointer shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="w-5 h-5 text-white" />
          </button>

          {/* Fundo Hero fixo */}
          <div
            className="fixed top-0 left-0 h-[65vh] pointer-events-none z-0"
            style={{ right: "var(--scrollbar-w, 10px)" }}
          >
            <motion.img
              initial={{ scale: 1.05, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.65 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              src={heroImage || undefined}
              alt=""
              className="w-full h-full object-cover"
              loading="eager"
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-transparent" />
          </div>

          {/* Container de Conteúdo */}
          <div className="relative z-10 w-full min-h-screen flex flex-col pt-[45vh]">
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 w-full bg-black border-t border-[#292d30] pb-24"
            >
              <div className="max-w-5xl w-full mx-auto px-4 sm:px-8 md:px-12 py-10">
                {/* Header (Capa + Título + Badges + Botão Jogar na direita) */}
                <GameDetailHeader
                  game={game}
                  coverImage={coverImage}
                  platformLabel={platformLabel}
                  localizedCategory={localizedCategory}
                  isRunning={asyncData.isRunning}
                  activeTab={state.activeTab}
                  tabs={tabs}
                  copy={copy}
                  actionsSlot={
                    <GameDetailActions
                      isLaunching={state.isLaunching}
                      isRunning={asyncData.isRunning}
                      launchError={state.launchError}
                      activeInputType={activeInputType}
                      isGamepadConnected={isGamepadConnected}
                      gamepadFamily={gamepadFamily}
                      copy={copy}
                      onLaunch={actions.handleLaunch}
                      playSound={playSound}
                    />
                  }
                  onTabChange={setActiveTab}
                  playSound={playSound}
                />

                {/* Conteúdo Dinâmico por Aba */}
                <AnimatePresence mode="wait" initial={false}>
                  {state.activeTab === copy.tabPlay && (
                    <motion.div
                      key="panel-play"
                      role="tabpanel"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.24 }}
                      className="w-full flex flex-col gap-10"
                    >
                      <GameDetailStats
                        game={game}
                        achievementsUnlocked={asyncData.achievements.data.filter((a) => a.achieved).length}
                        achievementsTotal={asyncData.achievements.data.length || game.totalAchievements || 0}
                        formattedHours={formattedHours}
                        lastSession={lastSession}
                        hasEpicLaunchShortcut={hasEpicLaunchShortcut}
                        copy={copy}
                      />

                      {/* Photo Wall rápido na aba Jogar */}
                      {galleryItems.length > 0 && (
                        <div className="w-full">
                          <h3 className="text-[10px] font-black tracking-[0.28em] text-white/35 uppercase mb-4 flex items-center gap-2">
                            <Camera className="w-3.5 h-3.5" /> {copy.photoWall}
                            <span className="ml-1 px-2 py-0.5 rounded-md bg-white/[0.07] border border-white/10 text-[9px] font-black text-white/40">
                              {galleryItems.length}
                            </span>
                          </h3>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {galleryItems.slice(0, 4).map((item, idx) => (
                              <button
                                key={idx}
                                onClick={() => {
                                  openGallery(idx);
                                  playSound("select");
                                }}
                                className="group relative rounded-xl overflow-hidden aspect-video border border-white/10 bg-black/40 hover:border-white/30 transition-all cursor-pointer"
                              >
                                <img src={item.url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {state.activeTab === copy.tabAchievements && (
                    <motion.div
                      key="panel-achievements"
                      role="tabpanel"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.24 }}
                      className="w-full"
                    >
                      <GameDetailAchievements
                        achievements={asyncData.achievements.data}
                        isLoading={asyncData.achievements.loading}
                        error={asyncData.achievements.error}
                        filter={state.achievementFilter}
                        searchQuery={state.achievementSearch}
                        copy={copy}
                        locale={detailLanguage}
                        onFilterChange={setAchievementFilter}
                        onSearchChange={setAchievementSearch}
                        onRetry={asyncData.achievements.retry}
                        playSound={playSound}
                      />
                    </motion.div>
                  )}

                  {(state.activeTab === copy.tabAbout ||
                    state.activeTab === copy.tabCaptures ||
                    state.activeTab === copy.tabMods ||
                    state.activeTab === copy.tabManage) && (
                      <motion.div
                        key={`panel-${state.activeTab}`}
                        role="tabpanel"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.24 }}
                        className="w-full"
                      >
                        <GameDetailSocialMods
                          game={game}
                          activeTab={state.activeTab}
                          copy={copy}
                          localScreenshots={asyncData.localScreenshots}
                          gameMods={asyncData.gameMods}
                          sanitizedAboutHtml={sanitizedAboutHtml}
                          sanitizedSupportedLanguagesHtml={sanitizedSupportedLanguagesHtml}
                          sanitizedMinRequirementsHtml={sanitizedMinRequirementsHtml}
                          sanitizedRecRequirementsHtml={sanitizedRecRequirementsHtml}
                          isAboutLoading={asyncData.steamDetails.loading || asyncData.epicDetails.loading}
                          developer={asyncData.steamDetails.data?.developer || asyncData.epicDetails.data?.developer || game.developer}
                          publisher={asyncData.steamDetails.data?.publisher || asyncData.epicDetails.data?.publisher || game.publisher}
                          releaseDate={asyncData.steamDetails.data?.releaseDate || asyncData.epicDetails.data?.releaseDate || game.releaseDate}
                          localizedCategory={localizedCategory}
                          metacritic={asyncData.steamDetails.data?.metacritic || undefined}
                          priceOverview={asyncData.steamDetails.data?.priceOverview || undefined}
                          tags={asyncData.epicDetails.data?.tags || game.tags}
                          launchProfile={asyncData.launchProfile}
                          displayOptions={asyncData.displayOptions}
                          onLaunchProfileChange={asyncData.setLaunchProfile}
                          onSaveLaunchProfile={actions.handleSaveLaunchProfile}
                          onOpenDeleteModal={openDeleteModal}
                          onOpenFolder={actions.handleOpenFolder}
                          onOpenMods={onOpenMods}
                          onSelectCapture={openGallery}
                          playSound={playSound}
                        />
                      </motion.div>
                    )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>

          {/* ============================================================
              MODAL DE GALERIA / LIGHTBOX
              ============================================================ */}
          <ModalShell
            isOpen={state.galleryModalOpen}
            onClose={() => {
              closeGallery();
              playSound("modalClose");
            }}
            maxWidthClassName="max-w-5xl"
            className="p-0 bg-transparent border-0 shadow-none"
            backdropClassName="bg-black/90 backdrop-blur-md"
            zIndexClassName="z-[160]"
            reducedEffects
          >
            {galleryItems.length > 0 && (
              <div className="relative w-full aspect-video rounded-3xl overflow-hidden bg-black border border-white/10 shadow-2xl">
                <img
                  src={galleryItems[state.currentGalleryIndex]?.url}
                  alt={`Captura ${state.currentGalleryIndex + 1}`}
                  className="w-full h-full object-contain"
                />

                {galleryItems.length > 1 && (
                  <>
                    <button
                      onClick={() => {
                        setGalleryIndex(
                          state.currentGalleryIndex > 0
                            ? state.currentGalleryIndex - 1
                            : galleryItems.length - 1
                        );
                        playSound("navigate");
                      }}
                      className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 border border-white/10 text-white hover:bg-black/90 transition-colors"
                      aria-label={copy.previous}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => {
                        setGalleryIndex(
                          state.currentGalleryIndex < galleryItems.length - 1
                            ? state.currentGalleryIndex + 1
                            : 0
                        );
                        playSound("navigate");
                      }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 border border-white/10 text-white hover:bg-black/90 transition-colors"
                      aria-label={copy.next}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}

                <button
                  onClick={() => {
                    closeGallery();
                    playSound("modalClose");
                  }}
                  className="absolute top-4 right-4 p-3 rounded-full bg-black/60 border border-white/10 text-white hover:bg-black/90 transition-colors"
                  aria-label={copy.close}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}
          </ModalShell>

          {/* ============================================================
              MODAL DE EXCLUSÃO DE JOGO
              ============================================================ */}
          <ModalShell
            isOpen={state.deleteModalOpen}
            onClose={() => {
              closeDeleteModal();
              playSound("back");
            }}
            maxWidthClassName="max-w-md"
            className="p-0 bg-transparent border-0 shadow-none"
            backdropClassName="bg-black/90"
            zIndexClassName="z-[160]"
            reducedEffects
          >
            <div className="w-full bg-[#0a0a0c] backdrop-blur-3xl rounded-[22px] overflow-hidden border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)]">
              <div className="flex items-center justify-between px-8 py-6 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <Trash2 className="w-5 h-5 text-white/60" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-black tracking-[0.2em] uppercase text-white">
                      {copy.removeGame}
                    </span>
                    <span className="text-[10px] font-bold tracking-[0.24em] uppercase text-white/40">
                      {copy.cannotUndo}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    closeDeleteModal();
                    playSound("back");
                  }}
                  className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="text-white/40" size={20} />
                </button>
              </div>
              <div className="px-8 py-7">
                <p className="text-sm text-white/70 leading-relaxed">
                  {copy.confirmRemove(game.title)}
                </p>
                <input
                  type="text"
                  value={state.deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder={copy.confirmDeletePlaceholder}
                  className="mt-4 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-xs text-white placeholder-white/20 focus:border-white/40 focus:outline-none"
                  aria-label="Digite o nome do jogo para confirmar"
                />
                <div className="flex gap-3 justify-end mt-8">
                  <button
                    type="button"
                    onClick={() => {
                      closeDeleteModal();
                      playSound("back");
                    }}
                    disabled={state.isDeleting}
                    className="px-6 py-3 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-[0.2em] text-white/60 hover:text-white hover:bg-white/10 transition-all disabled:opacity-40"
                  >
                    {copy.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={actions.handleDeleteGame}
                    disabled={state.isDeleting || state.deleteConfirmText !== game.title}
                    className="px-6 py-3 rounded-xl border border-red-500/30 text-[10px] font-black uppercase tracking-[0.2em] text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all disabled:opacity-40 shadow-[0_0_15px_rgba(239,68,68,0.1)]"
                  >
                    {state.isDeleting ? copy.removing : copy.remove}
                  </button>
                </div>
              </div>
            </div>
          </ModalShell>

          {/* ============================================================
              TELA CINEMATOGRÁFICA DE LAUNCH
              ============================================================ */}
          <AnimatePresence>
            {state.isLaunching && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center overflow-hidden"
                role="alert"
                aria-label="Iniciando o jogo"
              >
                <motion.div
                  initial={{ scale: 1.05 }}
                  animate={{ scale: 1.15 }}
                  transition={{ duration: 8, ease: "easeOut" }}
                  className="absolute inset-0 z-0"
                >
                  <img
                    src={heroImage || undefined}
                    alt=""
                    className="w-full h-full object-cover blur-[12px] brightness-[0.25]"
                    loading="eager"
                  />
                </motion.div>

                <div className="relative z-10 flex flex-col items-center justify-center text-center">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                    className="relative w-40 h-40 flex items-center justify-center mb-8"
                  >
                    <div
                      className="absolute inset-0 rounded-full border border-white/10 animate-ping"
                      style={{ animationDuration: "3s" }}
                    />
                    <div
                      className="absolute inset-4 rounded-full border-t border-white/30 animate-spin"
                      style={{ animationDuration: "2s" }}
                    />
                    <div
                      className="absolute inset-8 rounded-full border-b border-white/60 animate-spin"
                      style={{ animationDirection: "reverse", animationDuration: "1.5s" }}
                    />
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                      {game.logoImage ? (
                        <img src={game.logoImage} alt="" className="w-12 object-contain opacity-80 animate-pulse" />
                      ) : (
                        <Play className="w-8 h-8 text-white/80 animate-pulse fill-white/80" />
                      )}
                    </div>
                  </motion.div>

                  <h2 className="text-3xl md:text-4xl font-display font-light tracking-[0.25em] text-white uppercase mb-3 drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]">
                    {game.title}
                  </h2>
                  <p className="text-[10px] font-bold text-white/40 tracking-[0.4em] uppercase animate-pulse">
                    {copy.launching}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default GameDetailPanel;
