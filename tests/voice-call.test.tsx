// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IncomingCallModal } from "../src/components/voice/IncomingCallModal";
import { VoiceCallBar } from "../src/components/voice/VoiceCallBar";
import { VoiceCallWindow } from "../src/components/voice/VoiceCallWindow";
import { ScreenPickerModal } from "../src/components/voice/ScreenPickerModal";
import { OrbloomCustomizerModal } from "../src/components/voice/call-window/OrbloomCustomizerModal";

describe("Voice & Screen Share Call System", () => {
  afterEach(cleanup);
  it("renderiza IncomingCallModal com dados do chamador e dispara ações", () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();

    render(
      <IncomingCallModal
        isOpen={true}
        invite={{
          callerId: "user-123",
          callerName: "Gabriel",
          callerAvatar: "https://example.com/avatar.png",
          chatId: "chat-1",
          hasVideo: false,
          timestamp: Date.now(),
        }}
        onAccept={onAccept}
        onReject={onReject}
      />,
    );

    expect(screen.getByText("Gabriel")).toBeInTheDocument();
    expect(screen.getByText(/Chamada de voz/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Atender/i }));
    expect(onAccept).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Recusar/i }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("renderiza VoiceCallBar quando a chamada está ativa", () => {
    const onToggleMute = vi.fn();
    const onToggleDeafen = vi.fn();
    const onToggleScreenShare = vi.fn();
    const onOpenWindow = vi.fn();
    const onHangUp = vi.fn();

    render(
      <VoiceCallBar
        session={{
          chatId: "chat-1",
          friendUid: "user-456",
          friendName: "Matheus",
          isInitiator: true,
          startedAt: Date.now(),
        }}
        duration={125}
        isMuted={false}
        isDeafened={false}
        isSpeakingLocal={true}
        isSharingScreen={false}
        onToggleMute={onToggleMute}
        onToggleDeafen={onToggleDeafen}
        onToggleScreenShare={onToggleScreenShare}
        onOpenWindow={onOpenWindow}
        onHangUp={onHangUp}
      />,
    );

    expect(screen.getByText("Voz Ativa")).toBeInTheDocument();
    expect(screen.getByText(/02:05/)).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Mutar microfone"));
    expect(onToggleMute).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle("Desconectar"));
    expect(onHangUp).toHaveBeenCalledTimes(1);
  });

  it("renderiza VoiceCallWindow com visualização dos participantes e controles", () => {
    const onClose = vi.fn();
    const onHangUp = vi.fn();

    render(
      <VoiceCallWindow
        isOpen={true}
        onClose={onClose}
        session={{
          chatId: "chat-1",
          friendUid: "user-456",
          friendName: "Matheus",
          isInitiator: true,
          startedAt: Date.now(),
        }}
        userProfile={{
          uid: "user-me",
          displayName: "Guilherme",
        }}
        remoteStream={null}
        localStream={null}
        duration={45}
        isMuted={false}
        isDeafened={false}
        isSpeakingLocal={false}
        isSpeakingRemote={false}
        isSharingScreen={false}
        isRemoteSharingScreen={false}
        onToggleMute={vi.fn()}
        onToggleDeafen={vi.fn()}
        onToggleScreenShare={vi.fn()}
        onHangUp={onHangUp}
      />,
    );

    expect(screen.getAllByText("Matheus").length).toBeGreaterThan(0);
    expect(screen.getByText("Guilherme")).toBeInTheDocument();
    expect(screen.getAllByText("00:45").length).toBeGreaterThan(0);
    expect(screen.getByText("Desconectar")).toBeInTheDocument();
  });

  it("renderiza ScreenPickerModal e permite fechar e selecionar", () => {
    const onClose = vi.fn();
    const onSelectSource = vi.fn();

    render(
      <ScreenPickerModal
        isOpen={true}
        onClose={onClose}
        onSelectSource={onSelectSource}
      />,
    );

    expect(screen.getByText("Compartilhar Tela")).toBeInTheDocument();
    expect(screen.getByText(/Telas Inteiras/i)).toBeInTheDocument();
    expect(screen.getByText(/Janelas & Jogos/i)).toBeInTheDocument();
  });

  it("renderiza OrbloomCustomizerModal com controles idênticos ao padrão da biblioteca", () => {
    const onClose = vi.fn();

    render(
      <OrbloomCustomizerModal
        isOpen={true}
        onClose={onClose}
      />
    );

    // Header & Descrição da biblioteca
    expect(screen.getByText("Orbloom")).toBeInTheDocument();
    expect(screen.getByText(/a living orb for voice interfaces/i)).toBeInTheDocument();
    expect(screen.getByText(/Controls/i)).toBeInTheDocument();
    expect(screen.getByText("Orb preset")).toBeInTheDocument();

    // Botões de ação
    expect(screen.getByText(/Stop microphone|Start microphone/i)).toBeInTheDocument();
    expect(screen.getByText("Remix")).toBeInTheDocument();
    expect(screen.getByText("Salvar como Meu Padrão")).toBeInTheDocument();
    expect(screen.getByText("Restaurar Padrão")).toBeInTheDocument();

    // Fechar modal
    fireEvent.click(screen.getByLabelText("Fechar"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("permite focar e desfocar transmissão de tela durante a chamada", () => {
    const fakeStream = {
      id: "fake-screen-stream",
      getTracks: () => [],
      getVideoTracks: () => [{ kind: "video", stop: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }],
      getAudioTracks: () => [],
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaStream;

    render(
      <VoiceCallWindow
        isOpen={true}
        onClose={vi.fn()}
        session={{
          chatId: "chat-stream",
          friendUid: "user-stream",
          friendName: "Ana",
          isInitiator: true,
          startedAt: Date.now(),
        }}
        userProfile={{
          uid: "user-me",
          displayName: "Guilherme",
        }}
        remoteStream={fakeStream}
        localStream={null}
        duration={120}
        isMuted={false}
        isDeafened={false}
        isSpeakingLocal={false}
        isSpeakingRemote={false}
        isSharingScreen={false}
        isRemoteSharingScreen={true}
        onToggleMute={vi.fn()}
        onToggleDeafen={vi.fn()}
        onToggleScreenShare={vi.fn()}
        onHangUp={vi.fn()}
      />,
    );

    // Initial state: screen share is active and focused
    const unfocusBtn = screen.getByRole("button", { name: /Desfocar/i });
    expect(unfocusBtn).toBeInTheDocument();

    // Click to unfocus
    fireEvent.click(unfocusBtn);

    // Now screen share is unfocused: VoiceOnlyStage is visible with banner to re-focus
    const refocusBannerBtn = screen.getByRole("button", { name: /Focar tela/i });
    expect(refocusBannerBtn).toBeInTheDocument();

    // Click to refocus
    fireEvent.click(refocusBannerBtn);
    expect(screen.getByRole("button", { name: /Desfocar/i })).toBeInTheDocument();
  });

  it("permite injetar participantes em modo Dev respeitando o limite máximo de 10 pessoas", () => {
    render(
      <VoiceCallWindow
        isOpen={true}
        onClose={vi.fn()}
        session={{
          chatId: "test-echo-session",
          friendUid: "user-dev",
          friendName: "Matheus",
          isInitiator: true,
          startedAt: Date.now(),
        }}
        userProfile={{
          uid: "user-me",
          displayName: "Guilherme",
        }}
        remoteStream={null}
        localStream={null}
        duration={60}
        isMuted={false}
        isDeafened={false}
        isSpeakingLocal={false}
        isSpeakingRemote={false}
        isSharingScreen={false}
        isRemoteSharingScreen={false}
        onToggleMute={vi.fn()}
        onToggleDeafen={vi.fn()}
        onToggleScreenShare={vi.fn()}
        onHangUp={vi.fn()}
      />,
    );

    // DEV pill is rendered in test/dev mode
    expect(screen.getByText("DEV")).toBeInTheDocument();
    
    // Initial participants: Guilherme (me) + Matheus (peer) = 2/10
    expect(screen.getByText(/2\/10 na chamada/i)).toBeInTheDocument();

    const addBtn = screen.getByRole("button", { name: /\+ Pessoa/i });
    expect(addBtn).not.toBeDisabled();

    // Add 8 mock participants to reach the max of 10
    for (let i = 0; i < 8; i++) {
      fireEvent.click(addBtn);
    }

    // Now it should have 10/10 participants and add button must be disabled
    expect(screen.getByText(/10\/10 na chamada/i)).toBeInTheDocument();
    expect(addBtn).toBeDisabled();

    // Remove one participant
    const removeBtn = screen.getByRole("button", { name: /Remover participante de teste/i });
    fireEvent.click(removeBtn);
    expect(screen.getByText(/9\/10 na chamada/i)).toBeInTheDocument();
    expect(addBtn).not.toBeDisabled();
  });
});

