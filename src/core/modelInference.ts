import { BtDocumentAst, BtNodeAst, BtNodeModel, BtPortModel } from "./btAst";

type ModelKind = "Action" | "Condition" | "Control" | "Decorator";

const EXPLICIT_MODEL_TAGS = new Set(["Action", "Condition", "Control", "Decorator"]);
const EDITOR_ONLY_ATTRIBUTES = new Set([
  "ID",
  "name",
  "_description",
  "_skipIf",
  "_failureIf",
  "_while",
  "_successIf",
  "_onSuccess",
  "_onFailure",
  "_onHalted",
  "_post"
]);
const BUILTIN_COMPACT_NODE_TAGS = new Set([
  "AsyncFallback",
  "AsyncSequence",
  "Fallback",
  "IfThenElse",
  "Parallel",
  "ParallelAll",
  "ReactiveFallback",
  "ReactiveSequence",
  "Sequence",
  "SequenceWithMemory",
  "Switch",
  "Switch2",
  "Switch3",
  "Switch4",
  "Switch5",
  "Switch6",
  "TryCatch",
  "WhileDoElse",
  "Delay",
  "ForceFailure",
  "ForceSuccess",
  "Inverter",
  "KeepRunningUntilFailure",
  "LoopBool",
  "LoopDouble",
  "LoopInt",
  "LoopString",
  "Precondition",
  "Repeat",
  "RetryUntilFailure",
  "RetryUntilSuccessful",
  "RunOnce",
  "SkipUnlessUpdated",
  "Timeout",
  "WaitValueUpdate",
  "AlwaysFailure",
  "AlwaysSuccess",
  "Script",
  "ScriptCondition",
  "SetBlackboard",
  "Sleep",
  "UnsetBlackboard",
  "SubTree"
]);

type InferredModel = {
  id: string;
  modelKind: ModelKind;
  ports: Map<string, BtPortModel>;
};

export function ensureInferredNodeModels(document: BtDocumentAst): number {
  const existingModels = new Map(document.nodeModels.map((model) => [model.id, model]));
  const inferredModels = new Map<string, InferredModel>();
  let changedCount = 0;

  for (const tree of document.behaviorTrees) {
    visitNode(tree.node, (node) => {
      const candidate = getModelCandidate(node, existingModels);
      if (!candidate) {
        return;
      }

      const targetModel = existingModels.get(candidate.id);
      if (targetModel) {
        changedCount += addMissingPorts(targetModel.ports, node).length;
        return;
      }

      let inferred = inferredModels.get(candidate.id);
      if (!inferred) {
        inferred = {
          id: candidate.id,
          modelKind: candidate.modelKind,
          ports: new Map()
        };
        inferredModels.set(candidate.id, inferred);
        changedCount += 1;
      }

      addMissingPorts(Array.from(inferred.ports.values()), node).forEach((port) => {
        inferred?.ports.set(port.attributes.name || "", port);
      });
    });
  }

  if (inferredModels.size > 0) {
    document.nodeModels.push(
      ...Array.from(inferredModels.values()).map((model) => ({
        id: model.id,
        modelKind: model.modelKind,
        attributes: {
          ID: model.id
        },
        ports: Array.from(model.ports.values())
      }))
    );

    if (!document.topLevelOrder.includes("treeNodesModel")) {
      document.topLevelOrder.push("treeNodesModel");
    }
  }

  return changedCount;
}

function getModelCandidate(
  node: BtNodeAst,
  existingModels: Map<string, BtNodeModel>
): { id: string; modelKind: ModelKind } | null {
  if (EXPLICIT_MODEL_TAGS.has(node.tagName)) {
    const id = node.attributes.ID;
    if (!id) {
      return null;
    }
    return {
      id,
      modelKind: node.tagName as ModelKind
    };
  }

  if (BUILTIN_COMPACT_NODE_TAGS.has(node.tagName)) {
    return null;
  }

  return {
    id: node.tagName,
    modelKind: existingModels.get(node.tagName)?.modelKind as ModelKind || inferModelKindFromChildren(node)
  };
}

function inferModelKindFromChildren(node: BtNodeAst): ModelKind {
  if (node.children.length > 1) {
    return "Control";
  }

  if (node.children.length === 1) {
    return "Decorator";
  }

  return "Action";
}

function addMissingPorts(targetPorts: BtPortModel[], node: BtNodeAst): BtPortModel[] {
  const existingPortNames = new Set(targetPorts.map((port) => port.attributes.name).filter(Boolean));
  const addedPorts: BtPortModel[] = [];

  for (const [key, value] of Object.entries(node.attributes)) {
    if (EDITOR_ONLY_ATTRIBUTES.has(key) || existingPortNames.has(key)) {
      continue;
    }

    const port: BtPortModel = {
      tagName: "input_port",
      attributes: {
        name: key
      }
    };

    if (value) {
      port.attributes.default = value;
    }

    targetPorts.push(port);
    addedPorts.push(port);
    existingPortNames.add(key);
  }

  return addedPorts;
}

function visitNode(node: BtNodeAst | null, visitor: (node: BtNodeAst) => void): void {
  if (!node) {
    return;
  }

  visitor(node);
  node.children.forEach((child) => visitNode(child, visitor));
}
