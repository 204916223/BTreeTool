import { BtDocumentAst, BtNodeAst, BtNodeModel, BtPortModel } from "./btAst";
import type { BtPresetNodeSettings, BtSettingsFieldRole, BtUserSettings } from "../userSettings";

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
  "WasEntryUpdated",
  "SubTree"
]);

type InferredModel = {
  id: string;
  modelKind: ModelKind;
  ports: Map<string, BtPortModel>;
};

export function ensureInferredNodeModels(document: BtDocumentAst, settings?: BtUserSettings): number {
  const existingModels = new Map(document.nodeModels.map((model) => [model.id, model]));
  const presetModels = new Map((settings?.presetNodes || []).map((preset) => [preset.key, preset]));
  const inferredModels = new Map<string, InferredModel>();
  let changedCount = 0;

  for (const tree of document.behaviorTrees) {
    visitNode(tree.node, (node) => {
      const candidate = getModelCandidate(node, existingModels, presetModels);
      if (!candidate) {
        return;
      }

      const preset = presetModels.get(candidate.id);
      const targetModel = existingModels.get(candidate.id);
      if (targetModel) {
        changedCount += applyPresetPorts(targetModel.ports, preset);
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
        addPresetPorts(inferred.ports, preset);
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
  existingModels: Map<string, BtNodeModel>,
  presetModels: Map<string, BtPresetNodeSettings>
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

  const presetModelKind = toModelKind(presetModels.get(node.tagName)?.modelKind);
  const existingModelKind = toModelKind(existingModels.get(node.tagName)?.modelKind);

  return {
    id: node.tagName,
    modelKind: presetModelKind || existingModelKind || inferModelKindFromChildren(node)
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

function applyPresetPorts(targetPorts: BtPortModel[], preset: BtPresetNodeSettings | undefined): number {
  let changedCount = 0;
  const byName = new Map(targetPorts.map((port) => [port.attributes.name, port]));

  for (const port of presetToPorts(preset)) {
    const name = port.attributes.name || "";
    if (!name) {
      continue;
    }

    const existing = byName.get(name);
    if (existing) {
      if (existing.tagName !== port.tagName) {
        existing.tagName = port.tagName;
        changedCount += 1;
      }
      for (const [key, value] of Object.entries(port.attributes)) {
        if (typeof existing.attributes[key] !== "string") {
          existing.attributes[key] = value;
          changedCount += 1;
        }
      }
      continue;
    }

    targetPorts.push(port);
    byName.set(name, port);
    changedCount += 1;
  }

  return changedCount;
}

function addPresetPorts(targetPorts: Map<string, BtPortModel>, preset: BtPresetNodeSettings | undefined): void {
  for (const port of presetToPorts(preset)) {
    const name = port.attributes.name || "";
    if (name && !targetPorts.has(name)) {
      targetPorts.set(name, port);
    }
  }
}

function presetToPorts(preset: BtPresetNodeSettings | undefined): BtPortModel[] {
  if (!preset) {
    return [];
  }

  return preset.fields
    .map((field) => {
      const tagName = tagNameForRole(field.role);
      if (!tagName || !field.key) {
        return null;
      }

      const attributes: Record<string, string> = { name: field.key };
      if (field.defaultValue) {
        attributes.default = field.defaultValue;
      }

      return {
        tagName,
        attributes
      };
    })
    .filter((port): port is BtPortModel => Boolean(port));
}

function tagNameForRole(role: BtSettingsFieldRole): BtPortModel["tagName"] | null {
  if (role === "input") {
    return "input_port";
  }

  if (role === "output") {
    return "output_port";
  }

  if (role === "inout") {
    return "inout_port";
  }

  return null;
}

function toModelKind(value: string | undefined): ModelKind | null {
  if (value === "Action" || value === "Condition" || value === "Control" || value === "Decorator") {
    return value;
  }

  return null;
}

function visitNode(node: BtNodeAst | null, visitor: (node: BtNodeAst) => void): void {
  if (!node) {
    return;
  }

  visitor(node);
  node.children.forEach((child) => visitNode(child, visitor));
}
