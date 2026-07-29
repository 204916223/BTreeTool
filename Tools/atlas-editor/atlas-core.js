(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.BTreeAtlasCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const NODE_CATEGORIES = new Set(["Action", "Condition", "Control", "Decorator", "SubTree", "Info"]);
  const PARAM_ROLES = new Set(["input", "output", "inout", "param"]);
  const NODE_STATUSES = new Set(["draft", "stable", "deprecated"]);

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function validateAtlas(nodes, variables, meta) {
    const issues = [];
    const push = (level, code, message, path) => issues.push({ level, code, message, path: path || "" });

    if (!isRecord(nodes)) {
      push("error", "nodes_not_object", "nodes.json 顶层必须是对象。", "nodes");
      return issues;
    }
    if (!isRecord(variables)) {
      push("error", "variables_not_object", "variables.json 顶层必须是对象。", "variables");
      return issues;
    }
    if (!isRecord(meta)) {
      push("error", "meta_not_object", "meta.json 顶层必须是对象。", "meta");
    } else if (meta.schemaVersion !== 1) {
      push("error", "unsupported_schema", "meta.schemaVersion 必须为 1。", "meta.schemaVersion");
    }

    for (const [nodeId, rawNode] of Object.entries(nodes)) {
      const nodePath = `nodes.${nodeId}`;
      if (!isValidIdentifier(nodeId)) {
        push("error", "invalid_node_id", `${nodeId}: 节点 ID 格式无效。`, nodePath);
      }
      if (!isRecord(rawNode)) {
        push("error", "node_not_object", `${nodeId}: 节点内容必须是对象。`, nodePath);
        continue;
      }
      if (!NODE_CATEGORIES.has(rawNode.category)) {
        push("error", "invalid_node_category", `${nodeId}: 节点分类 ${String(rawNode.category)} 无效。`, `${nodePath}.category`);
      }
      if (!String(rawNode.title || "").trim()) {
        push("warning", "node_title_missing", `${nodeId}: 缺少中文名。`, `${nodePath}.title`);
      }
      if (!String(rawNode.department || "").trim()) {
        push("warning", "node_department_missing", `${nodeId}: 缺少部门。`, `${nodePath}.department`);
      }
      if (!String(rawNode.maintainer || "").trim()) {
        push("warning", "node_maintainer_missing", `${nodeId}: 缺少负责人。`, `${nodePath}.maintainer`);
      }

      const mainline = rawNode.mainline;
      if (!isRecord(mainline)) {
        push("error", "mainline_missing", `${nodeId}: mainline 必须是对象。`, `${nodePath}.mainline`);
        continue;
      }
      if (!NODE_STATUSES.has(mainline.status)) {
        push("error", "invalid_node_status", `${nodeId}: 状态 ${String(mainline.status)} 无效。`, `${nodePath}.mainline.status`);
      }
      if (!isRecord(mainline.params)) {
        push("error", "params_not_object", `${nodeId}: mainline.params 必须是对象。`, `${nodePath}.mainline.params`);
        continue;
      }
      for (const [paramName, rawParam] of Object.entries(mainline.params)) {
        const paramPath = `${nodePath}.mainline.params.${paramName}`;
        if (!isValidIdentifier(paramName)) {
          push("error", "invalid_param_name", `${nodeId}: 参数名 ${paramName || "<空>"} 格式无效。`, paramPath);
        }
        if (!isRecord(rawParam)) {
          push("error", "param_not_object", `${nodeId}.${paramName}: 参数内容必须是对象。`, paramPath);
          continue;
        }
        if (!PARAM_ROLES.has(rawParam.role)) {
          push("error", "invalid_param_role", `${nodeId}.${paramName}: 参数方向 ${String(rawParam.role)} 无效。`, `${paramPath}.role`);
        }
        const type = String(rawParam.type || "").trim();
        if (!type || type === "unknown") {
          push("warning", "param_type_unknown", `${nodeId}.${paramName}: 参数类型未知。`, `${paramPath}.type`);
        }
      }
    }

    for (const [variableId, rawVariable] of Object.entries(variables)) {
      const variablePath = `variables.${variableId}`;
      if (!isValidIdentifier(variableId)) {
        push("error", "invalid_variable_id", `${variableId}: 变量 key 格式无效。`, variablePath);
      }
      if (!isRecord(rawVariable)) {
        push("error", "variable_not_object", `${variableId}: 变量内容必须是对象。`, variablePath);
        continue;
      }
      if (!String(rawVariable.title || "").trim()) {
        push("warning", "variable_title_missing", `${variableId}: 变量缺少标题。`, `${variablePath}.title`);
      }
      if (!String(rawVariable.type || "").trim()) {
        push("warning", "variable_type_missing", `${variableId}: 变量缺少类型。`, `${variablePath}.type`);
      }
      if (!String(rawVariable.description || "").trim()) {
        push("warning", "variable_description_missing", `${variableId}: 变量缺少说明。`, `${variablePath}.description`);
      }
    }
    return issues;
  }

  function parseTreeNodesModel(source) {
    const rootMatch = String(source || "").match(/<TreeNodesModel\b([^>]*)>([\s\S]*?)<\/TreeNodesModel\s*>/i);
    if (!rootMatch) {
      throw new Error("候选文件不是有效的 <TreeNodesModel> 文档。");
    }
    const rootAttributes = parseAttributes(rootMatch[1]);
    const nodes = {};
    const body = rootMatch[2];
    const nodePattern = /<(Action|Condition|Control|Decorator)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
    for (const match of body.matchAll(nodePattern)) {
      const category = match[1];
      const attributes = parseAttributes(match[2]);
      const nodeId = attributes.ID || attributes.id;
      if (!nodeId) {
        continue;
      }
      const params = {};
      const portPattern = /<(input_port|output_port|inout_port|param_port)\b([^>]*?)(?:\/\s*>|>[\s\S]*?<\/\1\s*>)/gi;
      for (const portMatch of match[3].matchAll(portPattern)) {
        const portAttributes = parseAttributes(portMatch[2]);
        const name = portAttributes.name;
        if (!name) {
          continue;
        }
        const param = {
          role: portRole(portMatch[1]),
          type: portAttributes.type || "unknown",
          required: portAttributes.required === "true",
          description: portAttributes.description || ""
        };
        if (Object.prototype.hasOwnProperty.call(portAttributes, "default")) {
          param.default = portAttributes.default;
        }
        params[name] = param;
      }
      nodes[nodeId] = { category, params };
    }
    if (Object.keys(nodes).length === 0) {
      throw new Error("候选文件中没有可导入的节点模型。");
    }
    return {
      atlasTag: rootAttributes.atlas_tag || rootAttributes.tag || "unknown",
      nodes
    };
  }

  function parseCandidate(source) {
    const text = String(source || "").trim();
    if (!text.startsWith("{")) {
      return parseTreeNodesModel(text);
    }
    const parsed = JSON.parse(text);
    if (!isRecord(parsed) || !isRecord(parsed.nodes)) {
      throw new Error("候选 JSON 必须包含 nodes 对象。");
    }
    const nodes = {};
    for (const [nodeId, rawNode] of Object.entries(parsed.nodes)) {
      if (!isRecord(rawNode) || !NODE_CATEGORIES.has(rawNode.category) || !isRecord(rawNode.params)) {
        throw new Error(`候选节点 ${nodeId} 的结构无效。`);
      }
      nodes[nodeId] = {
        category: rawNode.category,
        params: clone(rawNode.params)
      };
    }
    return {
      atlasTag: String(parsed.atlasTag || "unknown"),
      nodes
    };
  }

  function diffCandidate(currentNodes, candidate) {
    const changes = [];
    const candidateNodes = candidate?.nodes || {};
    const currentIds = new Set(Object.keys(currentNodes || {}));
    for (const [nodeId, incoming] of Object.entries(candidateNodes)) {
      const current = currentNodes?.[nodeId];
      if (!isRecord(current)) {
        changes.push(change("node_add", nodeId, "", null, incoming, true, `新增节点 ${nodeId}`));
        continue;
      }
      currentIds.delete(nodeId);
      if (current.category !== incoming.category) {
        changes.push(change("node_category", nodeId, "", current.category, incoming.category, true,
          `${nodeId}: 分类 ${String(current.category)} → ${incoming.category}`));
      }
      const currentParams = isRecord(current.mainline?.params) ? current.mainline.params : {};
      const remainingParams = new Set(Object.keys(currentParams));
      for (const [paramName, incomingParam] of Object.entries(incoming.params || {})) {
        const currentParam = currentParams[paramName];
        if (!isRecord(currentParam)) {
          changes.push(change("param_add", nodeId, paramName, null, incomingParam, true, `${nodeId}.${paramName}: 新增参数`));
          continue;
        }
        remainingParams.delete(paramName);
        const changedFields = ["role", "type", "required", "default"].filter((key) => !sameValue(currentParam[key], incomingParam[key]));
        if (changedFields.length > 0) {
          changes.push(change("param_update", nodeId, paramName, currentParam, incomingParam, true,
            `${nodeId}.${paramName}: ${changedFields.join(" / ")} 发生变化`));
        }
      }
      for (const paramName of remainingParams) {
        changes.push(change("param_remove", nodeId, paramName, currentParams[paramName], null, false,
          `${nodeId}.${paramName}: 当前候选中已不存在`));
      }
    }
    for (const nodeId of currentIds) {
      changes.push(change("node_remove", nodeId, "", currentNodes[nodeId], null, false, `${nodeId}: 当前候选中已不存在`));
    }
    return changes;
  }

  function applyCandidateChanges(currentNodes, candidate, selectedIds) {
    const next = clone(currentNodes || {});
    const selected = new Set(selectedIds || []);
    for (const entry of diffCandidate(currentNodes, candidate)) {
      if (!selected.has(entry.id)) {
        continue;
      }
      const incomingNode = candidate.nodes[entry.nodeId];
      if (entry.type === "node_add") {
        next[entry.nodeId] = createNodeEntry(entry.nodeId, incomingNode);
      } else if (entry.type === "node_remove") {
        delete next[entry.nodeId];
      } else if (entry.type === "node_category") {
        next[entry.nodeId].category = incomingNode.category;
      } else if (entry.type === "param_add") {
        ensureParams(next[entry.nodeId])[entry.paramName] = clone(incomingNode.params[entry.paramName]);
      } else if (entry.type === "param_remove") {
        delete ensureParams(next[entry.nodeId])[entry.paramName];
      } else if (entry.type === "param_update") {
        const params = ensureParams(next[entry.nodeId]);
        const existing = isRecord(params[entry.paramName]) ? params[entry.paramName] : {};
        const incoming = incomingNode.params[entry.paramName];
        params[entry.paramName] = {
          ...existing,
          role: incoming.role,
          type: incoming.type,
          required: incoming.required,
          ...(Object.prototype.hasOwnProperty.call(incoming, "default") ? { default: incoming.default } : {})
        };
        if (!Object.prototype.hasOwnProperty.call(incoming, "default")) {
          delete params[entry.paramName].default;
        }
        if (!String(existing.description || "").trim() && incoming.description) {
          params[entry.paramName].description = incoming.description;
        }
      }
    }
    return sortObject(next);
  }

  function createNodeEntry(nodeId, incoming) {
    return {
      title: nodeId,
      category: incoming.category,
      description: "",
      mainline: {
        status: "draft",
        params: clone(incoming.params || {}),
        rules: [],
        examples: []
      },
      custom: {},
      department: "",
      maintainer: "",
      source_notes: []
    };
  }

  function ensureParams(node) {
    node.mainline = isRecord(node.mainline) ? node.mainline : {};
    node.mainline.params = isRecord(node.mainline.params) ? node.mainline.params : {};
    return node.mainline.params;
  }

  function change(type, nodeId, paramName, before, after, selected, message) {
    return {
      id: `${type}:${nodeId}:${paramName}`,
      type,
      nodeId,
      paramName,
      before,
      after,
      defaultSelected: selected,
      message
    };
  }

  function sameValue(left, right) {
    return JSON.stringify(left === undefined ? null : left) === JSON.stringify(right === undefined ? null : right);
  }

  function portRole(tagName) {
    if (tagName === "input_port") return "input";
    if (tagName === "output_port") return "output";
    if (tagName === "inout_port") return "inout";
    return "param";
  }

  function parseAttributes(source) {
    const attributes = {};
    const pattern = /([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    for (const match of String(source || "").matchAll(pattern)) {
      attributes[match[1]] = decodeXml(match[2] ?? match[3] ?? "");
    }
    return attributes;
  }

  function decodeXml(value) {
    return String(value)
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }

  function isValidIdentifier(value) {
    return /^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(String(value || ""));
  }

  function sortObject(value) {
    return Object.fromEntries(Object.entries(value || {}).sort(([left], [right]) => left.localeCompare(right)));
  }

  return {
    applyCandidateChanges,
    diffCandidate,
    isRecord,
    parseCandidate,
    parseTreeNodesModel,
    validateAtlas
  };
});
