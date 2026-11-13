
// Bot do Telegram (função do Vercel).
// Responde sozinho a quem chamar, avisa você quando chegar comprovante e envia o link do grupo com um comando.
// Dados secretos ficam nas "Environment Variables" do Vercel, nunca neste arquivo.

const TOKEN = process.env.BOT_TOKEN;
const OWNER = String(process.env.OWNER_CHAT_ID || "");
const PIX = process.env.PIX_KEY || "";
const GROUP = process.env.GROUP_LINK || "";
const SITE = (process.env.SITE_URL || "").replace(/\/$/, "");
const SECRET = process.env.WEBHOOK_SECRET || "";

// Textos que você pode editar
const PRECO = "R$ 19,90";
const HORARIO = "segunda a sexta, às 20h (horário de Mato Grosso)";

async function tg(method, payload) {
  const r = await fetch("https://api.telegram.org/bot" + TOKEN + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}

const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const send = (chat_id, text) => tg("sendMessage", { chat_id, text, parse_mode: "HTML", disable_web_page_preview: true });

async function enviarInfo(chatId) {
  const saudacao = "Oi! Que bom ter você aqui 😊";
  let foto = { ok: false };
  if (SITE) foto = await tg("sendPhoto", { chat_id: chatId, photo: SITE + "/pagamento.png", caption: saudacao });
  if (!foto.ok) await send(chatId, saudacao);
  await send(
    chatId,
    "O acesso à call de <b>Animação do Zero com IA</b> é <b>" + PRECO + "</b>.\n\n" +
    "💳 Pix (toque na chave para copiar):\n<code>" + esc(PIX) + "</code>\n\n" +
    "Assim que o pagamento cair, eu te envio o link do grupo. Depois de pagar, <b>envie o comprovante aqui</b>.\n\n" +
    "📅 Aulas de " + HORARIO + "."
  );
}

async function tratarDono(msg, texto) {
  const chatId = msg.chat.id;

  if (texto === "/ver") return enviarInfo(chatId);

  const lib = texto.match(/^\/liberar\s+(\d+)/);
  if (lib) {
    if (!GROUP) return send(chatId, "Falta configurar GROUP_LINK no Vercel.");
    const r = await send(
      lib[1],
      "✅ <b>Pagamento confirmado!</b> Seja bem-vindo(a)!\n\nEntre no grupo por aqui: " + esc(GROUP) +
      "\n\nAs aulas são de " + HORARIO + "."
    );
    return send(chatId, r.ok ? "Link do grupo enviado para " + lib[1] + "." : "Não consegui enviar. A pessoa precisa ter iniciado a conversa com o bot.");
  }

  const aviso = msg.reply_to_message && msg.reply_to_message.text;
  const id = aviso && aviso.match(/ID:\s*(\d+)/);
  if (id) {
    const r = await tg("copyMessage", { chat_id: id[1], from_chat_id: chatId, message_id: msg.message_id });
    if (!r.ok) await send(chatId, "Não consegui enviar a resposta.");
    return;
  }

  return send(
    chatId,
    "Comandos:\n/liberar ID envia o link do grupo ao cliente\n/ver mostra o que o cliente recebe\n\n" +
    "Para responder um cliente, use responder (reply) na mensagem de aviso dele."
  );
}

async function tratar(msg) {
  const chatId = msg.chat.id;
  const texto = (msg.text || "").trim();

  if (texto === "/meuid") return send(chatId, "Seu ID: <code>" + chatId + "</code>");
  if (OWNER && String(chatId) === OWNER) return tratarDono(msg, texto);

  const de = msg.from || {};
  const nome = [de.first_name, de.last_name].filter(Boolean).join(" ");
  const quem = esc(nome) + (de.username ? " (@" + esc(de.username) + ")" : "");

  // Comprovante (foto ou arquivo)
  if (msg.photo || msg.document) {
    await send(chatId, "Recebi seu comprovante! 🙌 Vou conferir o pagamento e já te envio o link do grupo.");
    if (OWNER) {
      await send(
        OWNER,
        "💰 <b>Novo comprovante</b>\nDe: " + quem + "\nID: " + chatId +
        "\n\nConferiu o pagamento no app do banco? Então envie:\n<code>/liberar " + chatId + "</code>"
      );
      await tg("copyMessage", { chat_id: OWNER, from_chat_id: chatId, message_id: msg.message_id });
    }
    return;
  }

  // Pedido de informações ou saudação
  const t = texto.toLowerCase();
  if (texto.startsWith("/start") || /^(oi|ol[aá]|bom dia|boa tarde|boa noite|eae|e a[ií])/.test(t) || /pix|pag|valor|pre[cç]o|quanto|comprar|acesso|quero/.test(t)) {
    return enviarInfo(chatId);
  }

  // Qualquer outra mensagem: avisa você
  await send(chatId, "Recebi sua mensagem! Vou te responder assim que possível. Para ver o valor e a chave Pix, escreva <b>pix</b>.");
  if (OWNER) {
    await send(
      OWNER,
      "❓ <b>Mensagem de " + quem + "</b>\nID: " + chatId + "\n\n" + esc(texto || "(mensagem sem texto)") +
      "\n\nResponda a esta mensagem para falar com o cliente."
    );
    if (!msg.text) await tg("copyMessage", { chat_id: OWNER, from_chat_id: chatId, message_id: msg.message_id });
  }
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(200).send("Bot ativo");
    if (SECRET && req.headers["x-telegram-bot-api-secret-token"] !== SECRET) return res.status(401).send("negado");
    const msg = (req.body || {}).message;
    if (msg && msg.chat && msg.chat.type === "private") await tratar(msg);
  } catch (e) {
    console.error(e);
  }
  return res.status(200).send("ok");
};
