// ── 고객 접수 확인 알림톡 (솔라피) ─────────────────────────────────────────
// mg-biz src/worker.js 의 notifyTelegram 함수 바로 아래에 이 블록을 통째로 붙인다.
// 설정(SOLAPI_*, KAKAO_*)이 하나라도 비어 있으면 아무것도 보내지 않으므로, 템플릿 승인 전에
// 먼저 배포해도 안전하다. 발송이 실패해도 접수 자체는 그대로 성공한다.
var AT_KV_KEY = "at:status";
var SOLAPI_SEND_URL = "https://api.solapi.com/messages/v4/send";

function alimtalkConfigured(env) {
  return !!(env.SOLAPI_API_KEY && env.SOLAPI_API_SECRET && env.SOLAPI_SENDER && env.KAKAO_PF_ID && env.KAKAO_TEMPLATE_ID);
}

async function solapiAuthHeader(env) {
  const date = new Date().toISOString();
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.SOLAPI_API_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(date + salt));
  const signature = Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
  return `HMAC-SHA256 apiKey=${env.SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`;
}

// 템플릿 변수는 카카오에 등록한 문안의 #{...} 이름과 글자 하나까지 같아야 한다.
async function sendLeadReceipt(env, lead) {
  if (!alimtalkConfigured(env)) return;
  let ok = false, code = -1;
  try {
    const r = await fetch(SOLAPI_SEND_URL, {
      method: "POST",
      headers: { ...JSON_HEADERS, "Authorization": await solapiAuthHeader(env) },
      body: JSON.stringify({
        message: {
          to: lead.phone.replace(/\D/g, ""),
          from: String(env.SOLAPI_SENDER).replace(/\D/g, ""),
          kakaoOptions: {
            pfId: env.KAKAO_PF_ID,
            templateId: env.KAKAO_TEMPLATE_ID,
            variables: { "#{이름}": lead.name, "#{접수번호}": lead.id },
            // 카카오톡을 안 쓰는 고객에게는 같은 문안을 문자로 대체 발송한다.
            disableSms: false
          }
        }
      }),
      signal: AbortSignal.timeout(5000)
    });
    const j = await r.json().catch(() => ({}));
    ok = r.ok && j.statusCode === "2000";
    code = j.statusCode || r.status;
  } catch (e) {
    ok = false;
    code = -1;
  }
  await statusRecord(env, AT_KV_KEY, ok, code);
  try {
    await env.DB.prepare("INSERT INTO lead_events (lead_id, at, actor, from_status, to_status, note) VALUES (?,?,?,?,?,?)").bind(lead.id, new Date().toISOString(), "system", lead.status, lead.status, ok ? "alimtalk:ok" : `alimtalk:fail:${code}`).run();
  } catch (e) {
  }
  if (!ok) await tgSend(env, `⚠️ 고객 접수 알림톡 발송 실패 (코드 ${code}) · ${ADMIN_URL}?id=${lead.id}`);
}
