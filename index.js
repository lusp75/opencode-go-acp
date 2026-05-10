#!/usr/bin/env node
import * as acp from "@agentclientprotocol/sdk";
import { Readable, Writable } from "node:stream";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ===========================================================================
// Configuration
// ===========================================================================

const GO_API_BASE = "https://opencode.ai/zen/go/v1";
const DEFAULT_MODEL = "deepseek-v4-pro";
const DEFAULT_PROFILE = "build";
const apiKey =
  process.env.OPENCODE_GO_API_KEY || process.env.OPENCODE_API_KEY || "";

var SESSIONS_FILE = path.join(os.homedir(), ".opencode-go-acp", "sessions.json");
function loadSessions(){ try{ var dir=path.dirname(SESSIONS_FILE); if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true}); if(fs.existsSync(SESSIONS_FILE)){ var raw=fs.readFileSync(SESSIONS_FILE,"utf8"); console.error("Loaded "+Object.keys(JSON.parse(raw)).length+" sessions"); return JSON.parse(raw) } }catch(e){ console.error("Load error:",e.message) } return {} }
function saveSessions(sessions){ try{ var dir=path.dirname(SESSIONS_FILE); if(!fs.existsSync(dir))fs.mkdirSync(dir,{recursive:true}); var obj={}; sessions.forEach(function(d,id){ obj[id]={model:d.model,profile:d.profile,cwd:d.cwd,history:d.history,title:d.title,createdAt:d.createdAt} }); fs.writeFileSync(SESSIONS_FILE,JSON.stringify(obj,null,2),"utf8"); console.error("Saved "+sessions.size+" sessions") }catch(e){ console.error("Save error:",e.message) } }

// ===========================================================================
// OpenCode GO Models
// ===========================================================================

const GO_MODELS = [
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    desc: "Top reasoning for complex coding",
    ctx: 128000,
  },
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    desc: "Fast, affordable everyday coding",
    ctx: 128000,
  },
  {
    id: "qwen3.6-plus",
    name: "Qwen 3.6 Plus",
    desc: "Speed and capability balanced",
    ctx: 128000,
  },
  {
    id: "qwen3.5-plus",
    name: "Qwen 3.5 Plus",
    desc: "Great value, solid coding",
    ctx: 128000,
  },
  {
    id: "kimi-k2.6",
    name: "Kimi K2.6",
    desc: "Strong reasoning, large context",
    ctx: 128000,
  },
  {
    id: "kimi-k2.5",
    name: "Kimi K2.5",
    desc: "Reliable general-purpose model",
    ctx: 128000,
  },
  {
    id: "glm-5.1",
    name: "GLM 5.1",
    desc: "Latest GLM, strong code generation",
    ctx: 128000,
  },
  {
    id: "glm-5",
    name: "GLM 5",
    desc: "Solid coding with excellent caching",
    ctx: 128000,
  },
  {
    id: "mimo-v2.5-pro",
    name: "MiMo V2.5 Pro",
    desc: "High-quality reasoning performance",
    ctx: 256000,
  },
  {
    id: "mimo-v2.5",
    name: "MiMo V2.5",
    desc: "Efficient, 256K context window",
    ctx: 256000,
  },
  {
    id: "minimax-m2.7",
    name: "MiniMax M2.7",
    desc: "Anthropic-compatible, extremely fast",
    ctx: 128000,
  },
  {
    id: "minimax-m2.5",
    name: "MiniMax M2.5",
    desc: "Budget-friendly, high throughput",
    ctx: 128000,
  },
];

// ===========================================================================
// Agent Profiles
// ===========================================================================

const PROFILES = [
  {
    id: "build",
    name: "Build",
    desc: "Full access — reads files, runs commands",
    canReadFiles: true,
    canRunCommands: true,
    systemMsg: function (cwd) {
      return [
        "You are an AI coding agent in project: " + cwd + ".",
        "",
        "## Available tools (YOU MUST USE THESE FORMATS)",
        "",
        "1. Read a file:",
        "<read_file>",
        "<path>D:/absolute/path/to/file.txt</path>",
        "</read_file>",
        "",
        "2. List files in a directory:",
        "<list_files>",
        "<path>D:/absolute/path/to/dir</path>",
        "</list_files>",
        "",
        "3. Search file contents (grep):",
        "<search_content>",
        "<pattern>search pattern</pattern>",
        "<path>D:/absolute/path/to/dir</path>",
        "</search_content>",
        "",
        "4. Write/create a file:",
        "<write_file>",
        "<path>D:/path/to/file.txt</path>",
        "<content>",
        "file content here",
        "</content>",
        "</write_file>",
        "",
        "5. Edit a file (find and replace):",
        "<edit_file>",
        "<path>D:/path/to/file.txt</path>",
        "<old_text>text to replace</old_text>",
        "<new_text>new text</new_text>",
        "</edit_file>",
        "",
        "## Rules",
        "- Always use ABSOLUTE paths (e.g. D:/project/file.ts, not ../file.ts)",
        "- When you need information about the project, USE THE TOOLS above.",
        "- If a tool fails, try an alternative or ask the user.",
        "- Do NOT pretend to know file contents — read them first.",
        "- Do NOT write fake tool output — use the real tools.",
        "- If a tool fails, explain the error and try an alternative.",
        "- Provide complete, working solutions. Be proactive.",
        "- Always respond in the user's language.",
      ].join("\n");
    },
  },
  {
    id: "plan",
    name: "Plan",
    desc: "Read-only — analyzes code, creates plans",
    canReadFiles: true,
    canRunCommands: false,
    systemMsg: function (cwd) {
      return [
        "You are an AI architect analyzing project: " + cwd + ".",
        "",
        "## Available tools",
        "1. Read a file:",
        "<read_file>",
        "<path>D:/absolute/path/to/file.txt</path>",
        "</read_file>",
        "",
        "2. Write a file (plan-only: creates file with plan content):",
        "<write_file>",
        "<path>D:/path/to/file.txt</path>",
        "<content>",
        "file content here",
        "</content>",
        "</write_file>",
        "",
        "## Rules",
        "- Read files to understand the code before making recommendations.",
        "- Create DETAILED plans with file paths, architecture decisions, steps.",
        "- Do NOT output code edits — you are in planning mode.",
        "- Use ABSOLUTE paths.",
        "- Always respond in the user's language.",
      ].join("\n");
    },
  },
  {
    id: "ask",
    name: "Ask",
    desc: "Q&A only — no tools, no edits",
    canReadFiles: false,
    canRunCommands: false,
    systemMsg: function (cwd) {
      return [
        "You are a coding Q&A assistant. Project: " + cwd + ".",
        "You CANNOT read files, write files, or run commands.",
        "Answer questions using your training knowledge.",
        "If you need to see code, ask the user to provide it.",
        "Always respond in the user's language.",
      ].join("\n");
    },
  },
];

// ===========================================================================
// Helpers
// ===========================================================================

function findModel(id) {
  return (
    GO_MODELS.find(function (m) {
      return m.id === id;
    }) || GO_MODELS[0]
  );
}

function findProfile(id) {
  return (
    PROFILES.find(function (p) {
      return p.id === id;
    }) || PROFILES[0]
  );
}

function modelConfig(cur) {
  return {
    type: "select",
    id: "model",
    name: "Model",
    category: "model",
    description: "OpenCode GO model to use",
    currentValue: cur,
    options: GO_MODELS.map(function (m) {
      return { value: m.id, name: m.name, description: m.desc };
    }),
  };
}

function profileConfig(cur) {
  return {
    type: "select",
    id: "profile",
    name: "Agent Profile",
    category: "mode",
    description: "Switch agent behavior",
    currentValue: cur,
    options: PROFILES.map(function (p) {
      return { value: p.id, name: p.name, description: p.desc };
    }),
  };
}

function extractText(prompt) {
  return prompt
    .map(function (b) {
      if (b.type === "text") return b.text;
      if (b.type === "resource_link") return "[" + b.name + "](" + b.uri + ")";
      return "";
    })
    .join("\n");
}

function countTokens(text) {
  return Math.ceil(text.length / 3.5);
}

// ===========================================================================
// SSE Parser (Server-Sent Events)
// ===========================================================================

function createSseParser(onMessage) {
  var buf = "";

  return function push(raw) {
    var chunk = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    buf += chunk;

    while (true) {
      var idx = buf.indexOf("\n\n");
      if (idx === -1) break;

      var message = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      if (message.trim() === "") continue;

      var dataLines = [];
      var lines = message.split("\n");
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line.startsWith("data:")) continue;
        var value = line.slice(5);
        if (value.startsWith(" ")) value = value.slice(1);
        dataLines.push(value);
      }
      if (dataLines.length === 0) continue;

      var data = dataLines.join("\n");
      if (data === "[DONE]") {
        onMessage({ done: true });
        return;
      }

      try {
        var json = JSON.parse(data);
        onMessage({ done: false, json: json });
      } catch (e) {
        // Skip malformed
      }
    }
  };
}

// ===========================================================================
// Stream Completion
// ===========================================================================

async function streamCompletion(model, messages, signal, onChunk) {
  var isAnthropic = model.startsWith("minimax");
  var endpoint = isAnthropic
    ? GO_API_BASE + "/messages"
    : GO_API_BASE + "/chat/completions";

  var headers = {
    Authorization: "Bearer " + apiKey,
    "Content-Type": "application/json",
  };
  if (isAnthropic) headers["anthropic-version"] = "2023-06-01";

  var body = isAnthropic
    ? { model: model, messages: messages, max_tokens: 65536, stream: true }
    : { model: model, messages: messages, stream: true, max_tokens: 65536 };

  var resp = await fetch(endpoint, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(body),
    signal: signal,
  });

  if (!resp.ok) {
    var errText = await resp.text();
    throw new Error("API error (" + resp.status + "): " + errText);
  }

  var reader = resp.body.getReader();
  var decoder = new TextDecoder();

  return new Promise(function (resolve, reject) {
    var sse = createSseParser(function (event) {
      if (event.done) {
        resolve();
        return;
      }
      var json = event.json;
      if (isAnthropic) {
        if (
          json.type === "content_block_delta" &&
          json.delta &&
          json.delta.text
        ) {
          onChunk(json.delta.text);
        } else if (
          json.type === "content_block_start" &&
          json.content_block &&
          json.content_block.text
        ) {
          onChunk(json.content_block.text);
        } else if (
          json.type === "message_delta" &&
          json.delta &&
          json.delta.text
        ) {
          onChunk(json.delta.text);
        }
      } else {
        var choices = json.choices || [];
        for (var i = 0; i < choices.length; i++) {
          var d = choices[i].delta;
          if (d) {
            if (d.content) onChunk(d.content);
            if (d.reasoning_content) onChunk(d.reasoning_content);
          }
        }
      }
    });

    function readNext() {
      reader
        .read()
        .then(function (result) {
          if (result.done) {
            resolve();
            return;
          }
          sse(decoder.decode(result.value, { stream: true }));
          readNext();
        })
        .catch(reject);
    }

    readNext();
  });
}

// ===========================================================================
// Tool Execution Engine
// Parses XML-style tool calls from model output and executes them via ACP.
// ===========================================================================

// Match a complete tool tag with its content
function parseToolCalls(text) {
  var tools = [];
  var patterns = [
    {
      tag: "read_file",
      regex: /<read_file>\s*<path>(.*?)<\/path>\s*<\/read_file>/gs,
    },
    {
      tag: "list_files",
      regex: /<list_files>\s*<path>(.*?)<\/path>\s*<\/list_files>/gs,
    },
    {
      tag: "list_files",
    },
    {
      tag: "search_content",
    },
    {
      tag: "write_file",
      regex: /<write_file>\s*<path>(.*?)<\/path>\s*<content>(.*?)<\/content>\s*<\/write_file>/gs,
    },
    {
      tag: "edit_file",
      regex: /<edit_file>\s*<path>(.*?)<\/path>\s*<old_text>(.*?)<\/old_text>\s*<new_text>(.*?)<\/new_text>\s*<\/edit_file>/gs,
    },
    {
      tag: "search_content",
      regex:
        /<search_content>\s*<pattern>(.*?)<\/pattern>\s*<path>(.*?)<\/path>\s*<\/search_content>/gs,
    },
  ];

  for (var p = 0; p < patterns.length; p++) {
    var pat = patterns[p];
    var match;
    pat.regex.lastIndex = 0;
    while ((match = pat.regex.exec(text)) !== null) {
      if (pat.tag === "search_content") {
        tools.push({
          tag: pat.tag,
          params: { pattern: match[1], path: match[2] },
          start: match.index,
          end: match.index + match[0].length,
        });
      } else if (pat.tag === "search_content") {
        tools.push({ tag: pat.tag, params: { pattern: match[1], path: match[2] }, start: match.index, end: match.index + match[0].length });
      } else if (pat.tag === "write_file") {
        tools.push({
          tag: pat.tag,
          params: { path: match[1], content: match[2] },
          start: match.index,
          end: match.index + match[0].length,
        });
      } else if (pat.tag === "edit_file") {
        tools.push({
          tag: pat.tag,
          params: { path: match[1], old_text: match[2], new_text: match[3] },
          start: match.index,
          end: match.index + match[0].length,
        });
      } else {
        tools.push({
          tag: pat.tag,
          params: { path: match[1] },
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }
  }

  // Sort by position in text
  tools.sort(function (a, b) {
    return a.start - b.start;
  });
  return tools;
}



async function executeTool(tag, params, sessionId, conn) {
  console.error("[tool] " + tag + " " + JSON.stringify(params));

  if (tag === "read_file") {
    try {
      var result = await Promise.race([
        conn.readTextFile({
          sessionId: sessionId,
          path: params.path,
        }),
        new Promise(function (_, reject) {
          setTimeout(function () {
            reject(new Error("SSH_TIMEOUT"));
          }, 5000);
        }),
      ]);
      return result.content;
    } catch (e) {
      return (
        "[Error reading file" +
        (e.message === "SSH_TIMEOUT" ? " (SSH timeout)" : "") +
        ": " +
        e.message +
        "]"
      );
    }
  }

  if (tag === "list_files") {
    try {
      var lfRes=await conn.createTerminal({sessionId:sessionId,command:"dir",args:["/b","/a",params.path],cwd:params.path,env:[]});
      await new Promise(function(r){setTimeout(r,500)});
      if(typeof conn.terminalOutput==="function"){
        var lfOut=await conn.terminalOutput({sessionId:sessionId,terminalId:lfRes.terminalId});
        await conn.releaseTerminal({sessionId:sessionId,terminalId:lfRes.terminalId});
        return lfOut.output||"[empty]"
      }
      await conn.releaseTerminal({sessionId:sessionId,terminalId:lfRes.terminalId});
      return "[Directory listed, but terminalOutput unavailable on this system. Try read_file on specific paths.]"
    } catch(e){ return "[Error listing: "+e.message+"]" }
  }

  if (tag === "search_content") {
    try {
      var srRes=await conn.createTerminal({sessionId:sessionId,command:"findstr",args:["/s","/n","/i",params.pattern,params.path+"\*"],cwd:params.path,env:[]});
      await new Promise(function(r){setTimeout(r,500)});
      if(typeof conn.terminalOutput==="function"){
        var srOut=await conn.terminalOutput({sessionId:sessionId,terminalId:srRes.terminalId});
        await conn.releaseTerminal({sessionId:sessionId,terminalId:srRes.terminalId});
        return srOut.output||"[no matches]"
      }
      await conn.releaseTerminal({sessionId:sessionId,terminalId:srRes.terminalId});
      return "[Search submitted, but terminalOutput unavailable. Try read_file on specific files.]"
    } catch(e){ return "[Error searching: "+e.message+"]" }
  }

  if (tag === "write_file") {
    try {
      await conn.writeTextFile({sessionId:sessionId,path:params.path,content:params.content});
      return "[File written: " + params.path + "]";
    } catch (e) {
      return "[Error writing file: " + e.message + "]";
    }
  }

  if (tag === "edit_file") {
    try {
      var origResp = await Promise.race([
        conn.readTextFile({ sessionId: sessionId, path: params.path }),
        new Promise(function (_, reject) {
          setTimeout(function () {
            reject(new Error("SSH_TIMEOUT"));
          }, 5000);
        }),
      ]);
      var original = origResp.content;
      var edited = original.replace(params.old_text, params.new_text);
      if (edited === original) {
        return "[Edit failed: old_text not found in file]";
      }
      await conn.writeTextFile({sessionId:sessionId,path:params.path,content:edited});
      return "[File edited: " + params.path + "]";
    } catch (e) {
      return "[Error editing file: " + e.message + "]";
    }
  }

  return "[Unknown tool: " + tag + "]";
}

// ===========================================================================
// Streaming response handler
// Accumulates text, flushes to client every 50ms
// ===========================================================================

function createStreamHandler(sid, conn) {
  var acc = "";
  var lastFlush = Date.now();
  var flushTimer = null;

  function doFlush() {
    if (acc.length > 0) {
      var text = acc;
      acc = "";
      conn
        .sessionUpdate({
          sessionId: sid,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: text },
          },
        })
        .catch(function () {});
    }
    lastFlush = Date.now();
    flushTimer = null;
  }

  function addChunk(chunk) {
    acc += chunk;
    var now = Date.now();
    if (now - lastFlush >= 50) {
      doFlush();
    } else if (flushTimer === null) {
      flushTimer = setTimeout(doFlush, 50 - (now - lastFlush));
    }
  }

  function finalFlush() {
    if (flushTimer !== null) clearTimeout(flushTimer);
    doFlush();
  }

  return { addChunk: addChunk, finalFlush: finalFlush };
}

// ===========================================================================
// ACP Agent
// ===========================================================================

class OpenCodeGoAgent {
  constructor(connection) {
    this.conn = connection;
    this.sessions = new Map(); var saved=loadSessions(); var self=this; Object.keys(saved).forEach(function(id){ var d=saved[id]; self.sessions.set(id,{model:d.model||DEFAULT_MODEL,profile:d.profile||DEFAULT_PROFILE,cwd:d.cwd||"/",abort:null,history:d.history||[],title:d.title||null,createdAt:d.createdAt||new Date().toISOString()}) });
  }

  // ---- initialize ----
  async initialize() {
    return {
      protocolVersion: acp.PROTOCOL_VERSION,
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: {
          image: false,
          audio: false,
          embeddedContext: true,
        },
        sessionCapabilities: {
          close: {}, // enable session/close
          list: {}, // enable session/list
          resume: {}, // enable session/resume
        },
        mcpCapabilities: { http: false, sse: false },
      },
      agentInfo: {
        name: "opencode-go-acp",
        title: "OpenCode GO",
        version: "1.0.0",
      },
      authMethods: apiKey
        ? []
        : [
            {
              type: "agent",
              id: "api-key",
              name: "OpenCode GO API Key",
              description: "Set OPENCODE_GO_API_KEY env var",
            },
          ],
    };
  }

  // ---- authenticate ----
  async authenticate() {
    return {};
  }

  // ---- session/new ----
  async newSession(params) {
    var id = randomUUID();
    this.sessions.set(id, {
      model: DEFAULT_MODEL,
      profile: DEFAULT_PROFILE,
      cwd: params.cwd || "/",
      abort: null,
      history: [],
      title: null,
      createdAt: new Date().toISOString(),
    });
    console.error("[session/new] " + id); saveSessions(this.sessions);
    return {
      sessionId: id,
      configOptions: [
        modelConfig(DEFAULT_MODEL),
        profileConfig(DEFAULT_PROFILE),
      ],
    };
  }

  // ---- session/load ----
  async loadSession(params) {
    console.error("[session/load] " + params.sessionId);
    var s = this.sessions.get(params.sessionId);
    if (!s) {
      throw new Error("Session " + params.sessionId + " not found");
    }
    s.cwd = params.cwd || s.cwd;

    // Replay history to client
    var conn = this.conn;
    var sid = params.sessionId;
    for (var i = 0; i < s.history.length; i++) {
      var msg = s.history[i];
      var updateType =
        msg.role === "user"
          ? "user_message_chunk"
          : msg.role === "assistant"
            ? "agent_message_chunk"
            : null;
      if (updateType) {
        await conn
          .sessionUpdate({
            sessionId: sid,
            update: {
              sessionUpdate: updateType,
              content: { type: "text", text: msg.content },
            },
          })
          .catch(function () {});
      }
    }

    return {
      configOptions: [modelConfig(s.model), profileConfig(s.profile)],
    };
  }

  // ---- session/list ----
  async listSessions(params) {
    console.error("[session/list]");
    var sessions = [];
    this.sessions.forEach(function (data, id) {
      sessions.push({
        sessionId: id,
        cwd: data.cwd,
        title: data.title,
        updatedAt: data.createdAt,
      });
    });
    return { sessions: sessions };
  }

  // ---- session/resume ----
  async resumeSession(params) {
    console.error("[session/resume] " + params.sessionId);
    var s = this.sessions.get(params.sessionId);
    if (!s) {
      throw new Error("Session " + params.sessionId + " not found");
    }
    return {
      configOptions: [modelConfig(s.model), profileConfig(s.profile)],
    };
  }

  // ---- session/close ----
  async closeSession(params) {
    console.error("[session/close] " + params.sessionId);
    var s = this.sessions.get(params.sessionId);
    if (s && s.abort) s.abort.abort();
    this.sessions.delete(params.sessionId); saveSessions(this.sessions); return {};
  }

  // ---- session/set_mode ----
  async setSessionMode() {
    return {};
  }

  // ---- session/set_config_option ----
  async setSessionConfigOption(params) {
    var s = this.sessions.get(params.sessionId);
    if (s) {
      if (params.configId === "model") s.model = params.value;
      if (params.configId === "profile") s.profile = params.value;
    }
    var m = s ? s.model : DEFAULT_MODEL;
    var p = s ? s.profile : DEFAULT_PROFILE;
    return { configOptions: [modelConfig(m), profileConfig(p)] };
  }

  // ---- fs/read_text_file (called by Zed) ----
  async readTextFile(params) {
    var session = this.sessions.get(params.sessionId);
    var profileId = session ? session.profile : DEFAULT_PROFILE;
    var profile = findProfile(profileId);

    if (!profile.canReadFiles) {
      return {
        content: "[File reading disabled in " + profile.name + " profile]",
      };
    }

    try {
      var result = await Promise.race([
        this.conn.readTextFile(params),
        new Promise(function (_, reject) {
          setTimeout(function () {
            reject(new Error("SSH_TIMEOUT"));
          }, 5000);
        }),
      ]);
      return result;
    } catch (err) {
      return {
        content:
          "[Cannot read file" +
          (err.message === "SSH_TIMEOUT" ? " (SSH timeout)" : "") +
          ": " +
          err.message +
          "]",
      };
    }
  }

  // ---- terminal/create (called by Zed for our tool execution) ----
  async createTerminal(params) {
    return this.conn.createTerminal(params);
  }

  // ---- terminal/output ----
  async terminalOutput(params) {
    return this.conn.terminalOutput(params);
  }

  // ---- terminal/wait_for_exit ----
  async waitForTerminalExit(params) {
    return this.conn.waitForTerminalExit(params);
  }

  // ---- terminal/release ----
  async writeTextFile(params) { return this.conn.writeTextFile(params); }

  async releaseTerminal(params) {
    return this.conn.releaseTerminal(params);
  }

  // ---- session/prompt (core loop with tool calling) ----
  async prompt(params) {
    var s = this.sessions.get(params.sessionId);
    if (!s) {
      s = {
        model: DEFAULT_MODEL,
        profile: DEFAULT_PROFILE,
        cwd: "/",
        abort: null,
        history: [],
        title: null,
        createdAt: new Date().toISOString(),
      };
      this.sessions.set(params.sessionId, s);
    }

    var profile = findProfile(s.profile);
    var model = findModel(s.model);
    var sid = params.sessionId;
    var conn = this.conn;

    // System prompt
    var sysMsg = profile.systemMsg(s.cwd);
    if (s.history.length === 0 || s.history[0].role !== "system") {
      s.history.unshift({ role: "system", content: sysMsg });
    } else {
      s.history[0].content = sysMsg;
    }

    // User message
    var userText = extractText(params.prompt);
    s.history.push({ role: "user", content: userText });

    // Context window management
    var ctxLimit = (model.ctx || 128000) * 0.8;
    while (
      countTokens(
        s.history
          .map(function (m) {
            return m.content;
          })
          .join("\n"),
      ) > ctxLimit &&
      s.history.length > 3
    ) {
      s.history.splice(1, 2);
    }

    // Auto-title
    if (!s.title && userText.trim()) {
      s.title = userText.trim().slice(0, 60).replace(/\n/g, " ");
      conn
        .sessionUpdate({
          sessionId: sid,
          update: { sessionUpdate: "session_info_update", title: s.title },
        })
        .catch(function () {});
    }

    s.abort = new AbortController();
    var signal = s.abort.signal;

    try {
      // ---- Tool-calling loop ----
      // Maximum 10 turns to prevent infinite loops
      for (var turn = 0; turn < 10; turn++) {
        var handler = createStreamHandler(sid, conn);
        var fullResponse = "";

        await streamCompletion(s.model, s.history, signal, function (chunk) {
          fullResponse += chunk;
          handler.addChunk(chunk);
        });

        handler.finalFlush();

        // Parse tool calls from the response
        var tools = parseToolCalls(fullResponse);

        if (tools.length === 0) {
          // No tools — this is the final response
          s.history.push({ role: "assistant", content: fullResponse }); s.abort=null; saveSessions(this.sessions); return {stopReason:"end_turn"};
        }

        // Add the assistant's response (including tool calls) to history
        s.history.push({ role: "assistant", content: fullResponse });

        // Execute each tool and collect results
        var toolResults = [];
        for (var t = 0; t < tools.length; t++) {
          var tool = tools[t];
          var result = await executeTool(tool.tag, tool.params, sid, conn);
          toolResults.push({
            tag: tool.tag,
            params: tool.params,
            result: result,
          });
        }

        // Send tool results back to the model
        var resultsText = toolResults
          .map(function (tr) {
            return [
              "<tool_result>",
              "<tool>" + tr.tag + "</tool>",
              "<params>" + JSON.stringify(tr.params) + "</params>",
              "<result>" + tr.result + "</result>",
              "</tool_result>",
            ].join("\n");
          })
          .join("\n\n");

        s.history.push({ role: "user", content: resultsText });

        // Notify client about tool execution
        conn
          .sessionUpdate({
            sessionId: sid,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: {
                type: "text",
                text:
                  "\n\n[Executed " +
                  tools.length +
                  " tool(s): " +
                  tools
                    .map(function (t) {
                      return t.tag;
                    })
                    .join(", ") +
                  "]\n\n",
              },
            },
          })
          .catch(function () {});
      }

      // Max turns reached
      s.history.push({
        role: "assistant",
        content:
          "[Maximum tool-calling turns reached. Please start a new prompt.]",
      });
      s.abort = null;
      return { stopReason: "end_turn" };
    } catch (err) {
      handler && handler.finalFlush && handler.finalFlush();
      s.abort = null;
      if (signal.aborted) return { stopReason: "cancelled" };
      conn
        .sessionUpdate({
          sessionId: sid,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "\n\nError: " + err.message },
          },
        })
        .catch(function () {});
      return { stopReason: "end_turn" };
    }
  }

  // ---- session/cancel ----
  async cancel(params) {
    console.error("[cancel] " + params.sessionId);
    var s = this.sessions.get(params.sessionId);
    if (s && s.abort) s.abort.abort();
  }
}

// ===========================================================================
// Startup
// ===========================================================================

var input = Writable.toWeb(process.stdout);
var output = Readable.toWeb(process.stdin);
var stream = acp.ndJsonStream(input, output);
new acp.AgentSideConnection(function (conn) {
  return new OpenCodeGoAgent(conn);
}, stream);
console.error("OpenCode GO ACP Agent v2.0 ready");
