import { WebviewMessage } from "./messages";

export type WebviewMessageRouter = {
  onReady: () => void;
  handleEditMessage: (message: WebviewMessage) => boolean;
  handleSettingsMessage: (message: WebviewMessage) => boolean;
  handleDocumentMessage: (message: WebviewMessage) => boolean;
  handlePlaybackMessage: (message: WebviewMessage) => boolean;
  handleTraceMessage: (message: WebviewMessage) => boolean;
};

export function routeWebviewMessage(message: WebviewMessage, router: WebviewMessageRouter): void {
  if (message.type === "ready") {
    router.onReady();
    return;
  }

  if (
    router.handleEditMessage(message) ||
    router.handleSettingsMessage(message) ||
    router.handleDocumentMessage(message) ||
    router.handlePlaybackMessage(message) ||
    router.handleTraceMessage(message)
  ) {
    return;
  }
}
