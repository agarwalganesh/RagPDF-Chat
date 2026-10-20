// In production, set VITE_API_BASE_URL to the deployed FastAPI backend
// (e.g. https://my-backend.onrender.com). The "/api" suffix is optional.
function resolveApiBase() {
  const raw = (import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!raw) return "/api";
  return raw.endsWith("/api") ? raw : `${raw}/api`;
}

const API_BASE = resolveApiBase();

const BACKEND_UNREACHABLE =
  "Backend server is not reachable. Make sure the FastAPI backend is running and VITE_API_BASE_URL points to it.";

export const api = {
  // Document endpoints
  async getDocuments() {
    const res = await fetch(`${API_BASE}/documents`);
    if (!res.ok) throw new Error("Failed to fetch documents");
    return res.json();
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
      const err = await res.json().catch(() => null);
      if (!err) {
        // Non-JSON response (e.g. the static host's 404/405 page) means the API isn't behind this URL
        throw new Error(`Upload failed (HTTP ${res.status}). ${BACKEND_UNREACHABLE}`);
      }
      throw new Error(err.detail || "Upload failed");
    }
    return res.json();
  },

  async deleteDocument(id) {
    const res = await fetch(`${API_BASE}/documents/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete document");
    return res.json();
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
      const err = await res.json().catch(() => ({ detail: "Chat request failed" }));
      throw new Error(err.detail || "Chat request failed");
    }
    return res.json();
  },

  async getConversations() {
    const res = await fetch(`${API_BASE}/chat/conversations`);
    if (!res.ok) throw new Error("Failed to fetch conversations");
    return res.json();
  },

  async getConversation(id) {
    const res = await fetch(`${API_BASE}/chat/conversations/${id}`);
    if (!res.ok) throw new Error("Failed to fetch conversation details");
    return res.json();
  },

  async deleteConversation(id) {
    const res = await fetch(`${API_BASE}/chat/conversations/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete conversation");
    return res.json();
  },

  async checkHealth() {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error("Backend offline");
    return res.json();
  }
};
