import { BtNodeModel } from "../core/btAst";
import { BtPreviewDocument } from "../core/viewModel";
import { BtUserSettings } from "../userSettings";

export type PreviewPayload = {
  fileName: string;
  languageId: string;
  hasDocument: boolean;
  isDirty: boolean;
  preview: BtPreviewDocument | null;
  parseError: string | null;
  settings: BtUserSettings;
  settingsFilePath: string;
};

export type ShortcutAction = "copy" | "pasteSmart" | "undo" | "pasteAsChild" | "pasteBefore" | "pasteAfter";

export type NodeCopyTemplateMessage = {
  tagName?: string;
  attributes?: Record<string, string>;
  children?: NodeCopyTemplateMessage[];
};

export type NormalizedNodeCopyTemplate = {
  tagName: string;
  attributes: Record<string, string>;
  children: NormalizedNodeCopyTemplate[];
};

export type WebviewMessage =
  | { type?: string }
  | {
      type: "updateNodeAttributes";
      payload?: {
        treeId?: string;
        nodePath?: string;
        attributes?: Record<string, string>;
      };
    }
  | {
      type: "revealTreeNodesModel";
    }
  | {
      type: "saveTreeNodeModels";
      payload?: BtNodeModel[];
    }
  | {
      type: "createBehaviorTree";
      payload?: {
        treeId?: string;
      };
    }
  | {
      type: "deleteBehaviorTree";
      payload?: {
        treeId?: string;
      };
    }
  | {
      type: "renameBehaviorTree";
      payload?: {
        oldTreeId?: string;
        newTreeId?: string;
      };
    }
  | {
      type: "moveNode";
      payload?: {
        treeId?: string;
        sourceNodePath?: string;
        targetParentPath?: string;
        targetIndex?: number;
      };
    }
  | {
      type: "createNode";
      payload?: {
        treeId?: string;
        targetParentPath?: string;
        targetIndex?: number;
        nodeKey?: string;
        nodeCategory?: string;
      };
    }
  | {
      type: "createNodeCopy";
      payload?: {
        treeId?: string;
        targetParentPath?: string;
        targetIndex?: number;
        nodeTemplate?: NodeCopyTemplateMessage;
      };
    }
  | {
      type: "copyNodeTemplate";
      payload?: {
        nodeTemplate?: NodeCopyTemplateMessage;
      };
    }
  | {
      type: "pasteSharedNodeTemplate";
      payload?: {
        treeId?: string;
        paneId?: string;
        targetParentPath?: string;
        targetIndex?: number;
      };
    }
  | {
      type: "deleteNode";
      payload?: {
        treeId?: string;
        nodePath?: string;
      };
    }
  | {
      type: "editAssistantAsk";
      payload?: {
        requestId?: string;
        prompt?: string;
        action?: string;
        treeId?: string;
        nodePath?: string;
        queueTreeIds?: string[];
      };
    }
  | {
      type: "saveUserSettings";
      payload?: BtUserSettings;
    }
  | {
      type: "openUserSettingsFile";
    }
  | {
      type: "importRecommendedPresets";
    }
  | {
      type: "importCustomNodes";
    }
  | {
      type: "clearImportedNodes";
    }
  | {
      type: "saveCurrentDocument";
    }
  | {
      type: "undoCurrentDocument";
    }
  | {
      type: "createNewBehaviorTreeDocument";
    }
  | {
      type: "openExistingBehaviorTreeDocument";
    }
  | {
      type: "choosePlaybackLogFile";
    }
  | {
      type: "openTraceConfigFile";
    }
  | {
      type: "refreshTraceConfig";
    }
  | {
      type: "addTraceProvider";
    }
  | {
      type: "setTraceProvider";
      payload?: {
        providerId?: string;
      };
    }
  | {
      type: "chooseTraceContextFile";
    }
  | {
      type: "clearTraceContextFile";
    }
  | {
      type: "setTraceContextFile";
      payload?: {
        fileName?: string;
        text?: string;
      };
    }
  | {
      type: "traceAsk";
      payload?: {
        requestId?: string;
        logFilePath?: string;
        question?: string;
        context?: string;
      };
    }
  | {
      type: "traceCancel";
      payload?: {
        requestId?: string;
      };
    }
  | {
      type: "traceFeedback";
      payload?: {
        requestId?: string;
        verdict?: "reasonable" | "nonsense";
        logFilePath?: string;
        frameIndex?: number;
        question?: string;
        answer?: string;
        context?: string;
        feedbackTarget?: string;
        sectionLabel?: string;
      };
    }
  | {
      type: "traceAnswerChunk";
      payload?: {
        requestId?: string;
        delta?: string;
      };
    };
