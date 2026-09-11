const resolveWindowCloseAction = ({
  isQuitting,
  minimizeToTray,
  confirmBeforeExit,
}) => {
  if (isQuitting) return "quit";
  if (minimizeToTray) return "hide";
  if (confirmBeforeExit) return "confirm";
  return "quit";
};

const createWindowBehaviorController = ({
  hideWindow,
  showWindow,
  requestConfirmation,
  quitApp,
}) => {
  let behavior = {
    minimizeToTray: true,
    confirmBeforeExit: true,
  };

  const setBehavior = (requested = {}) => {
    behavior = {
      minimizeToTray: Boolean(requested.minimizeToTray),
      confirmBeforeExit: Boolean(requested.confirmBeforeExit),
    };
    return { ...behavior };
  };

  const requestExitConfirmation = () => {
    showWindow();
    requestConfirmation();
    return { confirmationRequired: true };
  };

  return {
    setBehavior,
    getBehavior: () => ({ ...behavior }),
    handleWindowClose: (isQuitting) => {
      const action = resolveWindowCloseAction({ isQuitting, ...behavior });
      if (action === "hide") hideWindow();
      if (action === "confirm") requestExitConfirmation();
      return action;
    },
    requestAppQuit: () => {
      if (behavior.confirmBeforeExit) return requestExitConfirmation();
      quitApp();
      return { confirmationRequired: false };
    },
    confirmAppQuit: () => quitApp(),
  };
};

module.exports = { createWindowBehaviorController, resolveWindowCloseAction };
