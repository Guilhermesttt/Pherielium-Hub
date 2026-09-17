import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CallFeed } from "../VoiceCallWindow";
import { ScreenShareStage } from "./ScreenShareStage";
import { VoiceOnlyStage } from "./VoiceOnlyStage";
import { stageEnter } from "./motionTokens";

import type { CallState } from "../../../types/domain";

interface CallStageProps {
  feeds: CallFeed[];
  focusedFeedId: string | null;
  videoFitMode: "contain" | "cover";
  onToggleFitMode: () => void;
  onTogglePip: () => void;
  onRequestFullscreen: () => void;
  onSelectFeed: (feedId: string) => void;
  isStreamFocused?: boolean;
  onToggleStreamFocus?: () => void;
  onOpenInvite?: () => void;
  streamerVolume?: number;
  onChangeStreamerVolume?: (vol: number) => void;
  localScreenStream?: MediaStream | null;
  notify?: (msg: string, type: "success" | "error" | "info") => void;
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
  callState?: CallState;
  onContextMenu?: (e: React.MouseEvent, feed: CallFeed) => void;
  activeMenuFeedId?: string | null;
}

export const CallStage: React.FC<CallStageProps> = ({
  feeds,
  focusedFeedId,
  videoFitMode,
  onToggleFitMode,
  onTogglePip,
  onRequestFullscreen,
  onSelectFeed,
  isStreamFocused = true,
  onToggleStreamFocus,
  onOpenInvite,
  streamerVolume,
  onChangeStreamerVolume,
  localScreenStream,
  notify,
  localStream,
  remoteStream,
  callState,
  onContextMenu,
  activeMenuFeedId,
}) => {
  // 1. Check for Screen Share (First Priority when focused)
  const screenFeeds = feeds.filter((f) => f.isScreen && f.stream);
  const activeScreenFeed =
    screenFeeds.find((f) => f.id === focusedFeedId) || screenFeeds[0] || null;

  // Clicking a "presenting" badge on a tile in the grid should jump straight
  // into the focused screen-share stage, like double-clicking a Discord tile.
  const handleFocusScreen = (feedId: string) => {
    onSelectFeed(feedId);
    if (!isStreamFocused) {
      onToggleStreamFocus?.();
    }
  };

  const isScreenStageActive = Boolean(activeScreenFeed && isStreamFocused);
  const stageKey = isScreenStageActive ? "screen" : "grid";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stageKey}
        initial={stageEnter.initial}
        animate={stageEnter.animate}
        exit={stageEnter.exit}
        transition={stageEnter.transition}
        className="relative w-full h-full"
      >
        {isScreenStageActive && activeScreenFeed ? (
          <ScreenShareStage
            feed={activeScreenFeed}
            fitMode={videoFitMode}
            onToggleFitMode={onToggleFitMode}
            onTogglePip={onTogglePip}
            onRequestFullscreen={onRequestFullscreen}
            isFocused={true}
            onToggleFocus={onToggleStreamFocus}
            streamerVolume={streamerVolume}
            onChangeStreamerVolume={onChangeStreamerVolume}
            localScreenStream={localScreenStream}
            notify={notify}
          />
        ) : (
          <VoiceOnlyStage
            feeds={feeds}
            onOpenInvite={onOpenInvite}
            localStream={localStream}
            remoteStream={remoteStream}
            callState={callState}
            onRefocusStream={activeScreenFeed ? onToggleStreamFocus : undefined}
            isScreenActive={Boolean(activeScreenFeed)}
            onContextMenu={onContextMenu}
            screenFeeds={screenFeeds}
            onFocusScreen={handleFocusScreen}
            activeMenuFeedId={activeMenuFeedId}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
};
