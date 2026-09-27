import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { corsHeaders } from "npm:@supabase/supabase-js@2.112.3/cors";

const headers = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const MAX_REQUEST_BYTES = 80000;

function publishableKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    if (typeof keys.default === "string") return keys.default;
  } catch { /* Standard legacy public-key fallback. */ }
  return Deno.env.get("SUPABASE_ANON_KEY") || "";
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_INPUT");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) { await reader.cancel(); throw new Error("TOO_LARGE"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function validInput(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  if (typeof body.question !== "string" || !body.question.trim() || body.question.length > 1500) return false;
  const context = body.context as Record<string, unknown> | undefined;
  if (!context || context.version !== 1 || typeof context.month !== "string" || !/^\d{4}-\d{2}$/.test(context.month)) return false;
  for (const [key, maximum] of [["videos",24],["ideas",12],["ideaItems",12],["snapshots",12]] as const) {
    if (!Array.isArray(context[key]) || context[key].length > maximum) return false;
  }
  return Array.isArray(body.messages) && body.messages.length <= 6 && body.messages.every(message =>
    message && ["user", "assistant"].includes(message.role) && typeof message.content === "string" && message.content.length <= 12000);
}

// Provider-neutral, fail-closed interface. No provider has been selected by the
// owner; no model invocation or fabricated answer is permitted in this version.
// The future adapter MUST keep titles/memos/context in an untrusted data boundary,
// use a fixed system instruction, reject unsupported numeric claims, prohibit
// tools/DB writes, and add provider-specific timeout/rate/cost limits and tests.
Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "POSTのみ利用できます。" }, 405);
  const authorization = request.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return json({ error: "ログインが必要です。" }, 401);
  const url = Deno.env.get("SUPABASE_URL") || "", key = publishableKey();
  if (!url || !key) return json({ error: "サーバー設定を確認してください。" }, 503);
  try {
    const client = createClient(url, key, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return json({ error: "ログインの有効期限を確認してください。" }, 401);
    const body = await readBoundedJson(request);
    if (!validInput(body)) return json({ error: "質問または分析データの形式が正しくありません。" }, 400);
    return json({ code: "AI_NOT_CONFIGURED", error: "AI provider未設定：利用するprovider・モデルの指定が必要です。回答は生成していません。" }, 503);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "JSON形式を確認してください。" }, 400);
    if (error instanceof Error && error.message === "TOO_LARGE") return json({ error: "送信データが大きすぎます。" }, 413);
    return json({ error: "AI接続を確認できませんでした。再試行してください。" }, 503);
  }
});
