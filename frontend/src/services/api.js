// In production, set VITE_API_BASE_URL to the deployed FastAPI backend
// (e.g. https://docurag-backend-g9z0.onrender.com). The "/api" suffix is optional.
function resolveApiBase() {
  let raw = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!raw) return "/api";
  if (!raw.startsWith("http://") && !raw.startsWith("https://") && !raw.startsWith("/")) {
    if (!raw.includes(".")) {
      raw = `${raw}.onrender.com`;
    }
    raw = `https://${raw}`;
  }
  return raw.endsWith("/api") ? raw : `${raw}/api`;
}

const API_BASE = resolveApiBase();

const BACKEND_UNREACHABLE =
  "Backend server is not reachable. Make sure the FastAPI backend is running and VITE_API_BASE_URL points to it.";

async function parseJson(res, defaultError = "Invalid response from server") {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(BACKEND_UNREACHABLE);
  }
}

export const api = {
  // Document endpoints
  async getDocuments() {
    const res = await fetch(`${API_BASE}/documents`);
    if (!res.ok) throw new Error("Failed to fetch documents");
    return parseJson(res);
  },

  async uploadDocuments(files) {
    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file);
    }
    let res;
    try {
      res = await fetch(`${API_BASE}/documents/upload`, {
        method: "POST",
        body: formData,
      });
    } catch {
      throw new Error(BACKEND_UNREACHABLE);
    }
    if (!res.ok) {
      const err = await parseJson(res).catch(() => null);
      if (!err) {
        throw new Error(`Upload failed (HTTP ${res.status}). ${BACKEND_UNREACHABLE}`);
      }
      throw new Error(err.detail || "Upload failed");
    }
    return parseJson(res);
  },

  async deleteDocument(id) {
    const res = await fetch(`${API_BASE}/documents/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete document");
    return parseJson(res);
  },

  getDocumentFileUrl(id) {
    return `${API_BASE}/documents/${id}/file`;
  },

  // Chat endpoints
  async sendMessage({ message, conversation_id, document_id }) {
    const res = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, conversation_id, document_id }),
    });
    if (!res.ok) {
      const err = await parseJson(res).catch(() => ({ detail: "Chat request failed" }));
      throw new Error(err.detail || "Chat request failed");
    }
    return parseJson(res);
  },

  async getConversations() {
    const res = await fetch(`${API_BASE}/chat/conversations`);
    if (!res.ok) throw new Error("Failed to fetch conversations");
    return parseJson(res);
  },

  async getConversation(id) {
    const res = await fetch(`${API_BASE}/chat/conversations/${id}`);
    if (!res.ok) throw new Error("Failed to fetch conversation details");
    return parseJson(res);
  },

  async deleteConversation(id) {
    const res = await fetch(`${API_BASE}/chat/conversations/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete conversation");
    return parseJson(res);
  },

  async checkHealth() {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error("Backend offline");
    return parseJson(res);
  }
};

