import { BtNodeModel } from "../core/btAst";
import {
  createBehaviorTree,
  deleteBehaviorTree,
  deleteNode,
  insertNode,
  insertNodeCopy,
  moveNode,
  renameBehaviorTree,
  replaceNodeAttributes,
  replaceNodeModels
} from "../core/edit";
import { parseBehaviorTreeDocument } from "../core/parse";
import { serializeBehaviorTreeDocument } from "../core/serialize";
import { BtUserSettings } from "../userSettings";
import type { getPanelCopy } from "./panelCopy";
import { NodeCopyTemplateMessage, PreviewPayload } from "./messages";
import { normalizeNodeCopyChildren } from "./panelUtils";

export type XmlMutation = {
  unchangedMessage: string;
  successMessage: string;
  failurePrefix: string;
  mutate: (documentText: string) => string;
};

type PanelCopy = ReturnType<typeof getPanelCopy>;

export type EditActionContext = {
  copy: PanelCopy;
  hasAttachedDocument: boolean;
  preview: PreviewPayload["preview"];
  effectiveSettings: BtUserSettings;
  applyXmlMutation: (mutation: XmlMutation) => Promise<void>;
  postEditResult: (ok: boolean, message: string, dirtyState?: "dirty" | "saved") => void;
};

export async function handleUpdateNodeAttributesAction(
  payload: { treeId?: string; nodePath?: string; attributes?: Record<string, string> } | undefined,
  context: EditActionContext
): Promise<void> {
  const { copy } = context;
  if (!requireAttachedDocument(context)) {
    return;
  }

  if (!payload?.treeId || !payload.nodePath || !payload.attributes) {
    context.postEditResult(false, copy.incompleteNodeEdit);
    return;
  }

  await context.applyXmlMutation({
    unchangedMessage: copy.nodeAttributesUnchanged,
    successMessage: copy.nodeAttributesApplied,
    failurePrefix: copy.nodeAttributesFailed,
    mutate: (documentText) => {
      const parsed = parseForEdit(documentText, context);
      replaceNodeAttributes(parsed, payload.treeId!, payload.nodePath!, payload.attributes!);
      return serializeBehaviorTreeDocument(parsed);
    }
  });
}

export async function handleSaveTreeNodeModelsAction(
  payload: BtNodeModel[] | undefined,
  context: EditActionContext
): Promise<void> {
  const { copy } = context;
  if (!requireAttachedDocument(context)) {
    return;
  }

  if (!payload || !Array.isArray(payload)) {
    context.postEditResult(false, copy.incompleteTreeNodesModel);
    return;
  }

  await context.applyXmlMutation({
    unchangedMessage: copy.treeNodesModelUnchanged,
    successMessage: copy.treeNodesModelUpdated,
    failurePrefix: copy.treeNodesModelFailed,
    mutate: (documentText) => {
      const parsed = parseForEdit(documentText, context);
      replaceNodeModels(parsed, payload);
      return serializeBehaviorTreeDocument(parsed);
    }
  });
}

export async function handleCreateBehaviorTreeAction(
  payload: { treeId?: string } | undefined,
  context: EditActionContext
): Promise<void> {
  const { copy } = context;
  if (!requireAttachedDocument(context)) {
    return;
  }

  const normalizedTreeId = payload?.treeId?.trim() || "";
  if (!normalizedTreeId) {
    context.postEditResult(false, copy.incompleteBehaviorTreeCreate);
    return;
  }

  const existingTreeIds = new Set(context.preview?.behaviorTrees.map((tree) => tree.id) || []);
  if (existingTreeIds.has(normalizedTreeId)) {
    context.postEditResult(false, copy.createBehaviorTreeDuplicateName(normalizedTreeId));
    return;
  }

  await context.applyXmlMutation({
    unchangedMessage: copy.behaviorTreeCreateUnchanged,
    successMessage: copy.behaviorTreeCreated,
    failurePrefix: copy.behaviorTreeCreateFailed,
    mutate: (documentText) => {
      const parsed = parseForEdit(documentText, context);
      createBehaviorTree(parsed, normalizedTreeId);
      return serializeBehaviorTreeDocument(parsed);
    }
  });
}

export async function handleDeleteBehaviorTreeAction(
  payload: { treeId?: string } | undefined,
  context: EditActionContext
): Promise<void> {
  const { copy } = context;
  if (!requireAttachedDocument(context)) {
    return;
  }

  const normalizedTreeId = payload?.treeId?.trim() || "";
  if (!normalizedTreeId) {
    context.postEditResult(false, copy.incompleteBehaviorTreeDelete);
    return;
  }

  await context.applyXmlMutation({
    unchangedMessage: copy.behaviorTreeDeleteUnchanged,
    successMessage: copy.behaviorTreeDeleted,
    failurePrefix: copy.behaviorTreeDeleteFailed,
    mutate: (documentText) => {
      const parsed = parseForEdit(documentText, context);
      deleteBehaviorTree(parsed, normalizedTreeId);
      return serializeBehaviorTreeDocument(parsed);
    }
  });
}

export async function handleRenameBehaviorTreeAction(
  payload: { oldTreeId?: string; newTreeId?: string } | undefined,
  context: EditActionContext
): Promise<void> {
  const { copy } = context;
  if (!requireAttachedDocument(context)) {
    return;
  }

  const oldTreeId = payload?.oldTreeId?.trim() || "";
  const newTreeId = payload?.newTreeId?.trim() || "";
  if (!oldTreeId || !newTreeId) {
    context.postEditResult(false, copy.incompleteBehaviorTreeRename);
    return;
  }

  await context.applyXmlMutation({
    unchangedMessage: copy.behaviorTreeRenameUnchanged,
    successMessage: copy.behaviorTreeRenamed,
    failurePrefix: copy.behaviorTreeRenameFailed,
    mutate: (documentText) => {
      const parsed = parseForEdit(documentText, context);
      renameBehaviorTree(parsed, oldTreeId, newTreeId);
      return serializeBehaviorTreeDocument(parsed);
    }
  });
}

export async function handleMoveNodeAction(
  payload: { treeId?: string; sourceNodePath?: string; targetParentPath?: string; targetIndex?: number } | undefined,
  context: EditActionContext
): Promise<void> {
  const { copy } = context;
  if (!requireAttachedDocument(context)) {
    return;
  }

  const targetIndex = payload?.targetIndex;

  if (
    !payload?.treeId ||
    !payload.sourceNodePath ||
    !payload.targetParentPath ||
    typeof targetIndex !== "number" ||
    !Number.isInteger(targetIndex)
  ) {
    context.postEditResult(false, copy.incompleteNodeMove);
    return;
  }

  await context.applyXmlMutation({
    unchangedMessage: copy.nodeOrderUnchanged,
    successMessage: copy.nodeOrderUpdated,
    failurePrefix: copy.nodeOrderFailed,
    mutate: (documentText) => {
      const parsed = parseForEdit(documentText, context);
      moveNode(parsed, payload.treeId!, payload.sourceNodePath!, payload.targetParentPath!, targetIndex);
      return serializeBehaviorTreeDocument(parsed);
    }
  });
}

export async function handleCreateNodeAction(
  payload:
    | {
        treeId?: string;
        targetParentPath?: string;
        targetIndex?: number;
        nodeKey?: string;
        nodeCategory?: string;
      }
    | undefined,
  context: EditActionContext
): Promise<void> {
  const { copy } = context;
  if (!requireAttachedDocument(context)) {
    return;
  }

  const targetIndex = payload?.targetIndex;

  if (
    !payload?.treeId ||
    !payload.targetParentPath ||
    typeof targetIndex !== "number" ||
    !Number.isInteger(targetIndex) ||
    !payload.nodeKey ||
    !payload.nodeCategory
  ) {
    context.postEditResult(false, copy.incompleteNodeCreate);
    return;
  }

  await context.applyXmlMutation({
    unchangedMessage: copy.nodeCreateUnchanged,
    successMessage: copy.nodeCreated,
    failurePrefix: copy.nodeCreateFailed,
    mutate: (documentText) => {
      const parsed = parseForEdit(documentText, context);
      insertNode(
        parsed,
        payload.treeId!,
        payload.targetParentPath!,
        targetIndex,
        payload.nodeKey!,
        payload.nodeCategory!,
        context.effectiveSettings
      );
      return serializeBehaviorTreeDocument(parsed);
    }
  });
}

export async function handleCreateNodeCopyAction(
  payload:
    | {
        treeId?: string;
        targetParentPath?: string;
        targetIndex?: number;
        nodeTemplate?: NodeCopyTemplateMessage;
      }
    | undefined,
  context: EditActionContext
): Promise<void> {
  const { copy } = context;
  if (!requireAttachedDocument(context)) {
    return;
  }

  const targetIndex = payload?.targetIndex;
  const nodeTemplate = payload?.nodeTemplate;

  if (
    !payload?.treeId ||
    !payload.targetParentPath ||
    typeof targetIndex !== "number" ||
    !Number.isInteger(targetIndex) ||
    !nodeTemplate?.tagName ||
    !nodeTemplate.attributes
  ) {
    context.postEditResult(false, copy.incompleteNodeCopy);
    return;
  }

  await context.applyXmlMutation({
    unchangedMessage: copy.nodeCopyUnchanged,
    successMessage: copy.nodeCopyCreated,
    failurePrefix: copy.nodeCopyFailed,
    mutate: (documentText) => {
      const parsed = parseForEdit(documentText, context);
      insertNodeCopy(parsed, payload.treeId!, payload.targetParentPath!, targetIndex, {
        tagName: nodeTemplate.tagName!,
        attributes: nodeTemplate.attributes!,
        children: normalizeNodeCopyChildren(nodeTemplate.children)
      });
      return serializeBehaviorTreeDocument(parsed);
    }
  });
}

export async function handleDeleteNodeAction(
  payload:
    | {
        treeId?: string;
        nodePath?: string;
      }
    | undefined,
  context: EditActionContext
): Promise<void> {
  const { copy } = context;
  if (!requireAttachedDocument(context)) {
    return;
  }

  if (!payload?.treeId || !payload.nodePath) {
    context.postEditResult(false, copy.incompleteNodeDelete);
    return;
  }

  await context.applyXmlMutation({
    unchangedMessage: copy.nodeDeleteUnchanged,
    successMessage: copy.nodeDeleted,
    failurePrefix: copy.nodeDeleteFailed,
    mutate: (documentText) => {
      const parsed = parseForEdit(documentText, context);
      deleteNode(parsed, payload.treeId!, payload.nodePath!);
      return serializeBehaviorTreeDocument(parsed);
    }
  });
}

function requireAttachedDocument(context: EditActionContext): boolean {
  if (context.hasAttachedDocument) {
    return true;
  }

  context.postEditResult(false, context.copy.noAttachedDocument);
  return false;
}

function parseForEdit(documentText: string, context: EditActionContext) {
  return parseBehaviorTreeDocument(documentText, context.effectiveSettings);
}
