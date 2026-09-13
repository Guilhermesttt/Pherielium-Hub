import React from "react";
import { MessageSquare, Phone, RadioReceiver, Users, UserPlus } from "lucide-react";
import type { SoundEffectType } from "../../hooks/useSoundEffects";

export type SocialSubTab = "AMIGOS" | "CHAT" | "SALAS" | "SOLICITAÇÕES";

export interface FriendsSubTabsProps {
  activeTab: SocialSubTab;
  onTabChange: (tab: SocialSubTab) => void;
  incomingRequestsCount: number;
  totalFriendsCount: number;
  onlineCount: number;
  unreadCount: number;
  playSound?: (type: SoundEffectType) => void;
}

export const FriendsSubTabs: React.FC<FriendsSubTabsProps> = ({
  activeTab,
  onTabChange,
  incomingRequestsCount,
  onlineCount,
  unreadCount,
  playSound,
}) => {
  const tabs = [
    { id: "AMIGOS" as SocialSubTab, label: "Amigos", icon: Users },
    { id: "CHAT" as SocialSubTab, label: "Chats", icon: MessageSquare, badge: unreadCount },
    { id: "SALAS" as SocialSubTab, label: "Canais de Voz", icon: RadioReceiver },
    { id: "SOLICITAÇÕES" as SocialSubTab, label: "Solicitações", icon: UserPlus, badge: incomingRequestsCount },
  ];

  return (
    <div className="w-full flex justify-center mb-6 z-10 relative">
      {/* Container de fundo translúcido escuro (estilo "Pill" da imagem 1) */}
      <div
        className="flex items-center justify-between px-2 py-1.5 rounded-full border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_30px_rgba(0,0,0,0.6)]"
        style={{
          background: "rgba(255, 255, 255, 0.02)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          minWidth: "720px", // Garante a largura ampla vista na referência
        }}
      >
        {/* Abas de Navegação */}
        <nav className="flex items-center gap-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (!isActive) {
                    onTabChange(tab.id);
                    playSound?.("select");
                  }
                }}
                onMouseEnter={() => playSound?.("hover")}
                className={`relative flex items-center gap-2 px-5 py-2 rounded-full text-[13px] font-semibold transition-all duration-200 cursor-pointer ${isActive
                    ? "bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.15)]"
                    : "text-white/50 hover:text-white/90 hover:bg-white/[0.04]"
                  }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-black" : "text-white/40"}`} />
                <span className="tracking-wide">{tab.label}</span>

                {/* Badge numérico para abas inativas (Ex: Solicitações, Chats) */}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span
                    className={`ml-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${isActive
                        ? "bg-black/10 text-black"
                        : "bg-white/10 text-white"
                      }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Status Badge "ONLINE X" à direita */}
        <div className="pl-4 pr-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.05] shadow-inner">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
            <span className="text-[11px] font-bold text-white/80 tracking-widest uppercase">
              Online {onlineCount}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};