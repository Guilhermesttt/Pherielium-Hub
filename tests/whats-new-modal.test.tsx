// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WhatsNewModal from "../src/components/WhatsNewModal";
import { LATEST_RELEASE } from "../src/releases/releaseHighlights";

describe("modal completo de novidades", () => {
  beforeEach(() => {
    Reflect.deleteProperty(window, "electronAPI");
  });

  afterEach(cleanup);

  it("apresenta os tres destaques da versao mais recente", () => {
    render(<WhatsNewModal release={LATEST_RELEASE} onClose={vi.fn()} />);

    expect(screen.getByText(LATEST_RELEASE.title)).toBeInTheDocument();
    expect(screen.getByText(`Versão ${LATEST_RELEASE.version}`)).toBeInTheDocument();
    expect(screen.getAllByTestId("release-highlight")).toHaveLength(3);
    expect(screen.getByText(LATEST_RELEASE.highlights[0].title)).toBeInTheDocument();
    expect(screen.getByText(LATEST_RELEASE.highlights[1].title)).toBeInTheDocument();
  });

  it("confirma as novidades pelo botao principal", async () => {
    const onClose = vi.fn();
    render(<WhatsNewModal release={LATEST_RELEASE} onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("fecha pelo X e abre as notas completas no navegador", async () => {
    const onClose = vi.fn();
    const openExternalUrl = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { openExternalUrl },
    });
    render(<WhatsNewModal release={LATEST_RELEASE} onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: "Ver notas completas" }));
    expect(openExternalUrl).toHaveBeenCalledWith(LATEST_RELEASE.releaseUrl);

    await userEvent.click(screen.getByRole("button", { name: "Fechar novidades" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
