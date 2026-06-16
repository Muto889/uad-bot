// UAD BOT — Ultra Avto Dizel | api/webhook.js
// v2: function calling ile lead toplama, qisa cavablar, luget, dogrulama

const conversations = new Map(); // chatId -> { history: [...], leadSent: boolean }

const SYSTEM_PROMPT = `Sən UAD BOT-san — Ultra Avto Dizel servisinin rəsmi süni intellekt köməkçisisən.
Dizel avtomobillər üçün farsunka (injektor) və yüksək təzyiqli nasos (TNVD) xidmətləri göstəririk.

ÜMUMİ QAYDALAR:
- Müştəriyə həmişə Siz/Sizin ilə müraciət et
- Azərbaycan dilində cavab ver, müştəri rusca yazarsa rusca cavab ver
- Cavabların QISA olsun: adətən 2-4 cümlə, məcburi olmadıqca uzatma
- Eyni cümləni (telefon nömrəsi, "ətraflı məlumat üçün" və s.) hər cavabda TƏKRARLAMA - yalnız lazım olduqda bir dəfə ver
- Heç vaxt uydurma məlumat vermə, "mütləq/100%/dəqiq olacaq" kimi söz vermə ifadələri işlətmə
- Təbii, insan kimi yaz - şablon/robot kimi səslənən cümlələrdən çəkin

LÜĞƏT (yazı səhvləri/sinonimlər - bunları aşağıdakı mənalarda başa düş):
- forsunka, frsunka, forsinka, injektor → farsunka
- stend, sten → stend (test/yoxlama)
- TNVD, ТНВД, tnvd, yüksək təzyiq nasosu → yüksək təzyiqli nasos
- dızel, desizel → dizel

BİZNES MƏLUMATLARI:
Servis adı: Ultra Avto Dizel (UAD)
Ünvan: Əhməd Rəcəbli 304, Elit T/M ilə üzbəüz
Telefon: 0505770082 - Ramin usta
İş saatı: Bazar ertəsi-Şənbə, 10:00-18:30. Bazar günü qeyri-iş günüdür
Ödəniş: Nağd, kart, bank köçürməsi

XIDMƏTLƏR VƏ QIYMƏTLƏR:
1. Farsunka stend+yuyulma: söküb gətirsə 10 AZN/ədəd, avtomobillə gəlsə 20 AZN/ədəd (sökmə+stend+yuyulma+bağlama+diaqnostika+adaptasiya daxil), ən az 40 dəqiqə
2. Diaqnostika: 10 AZN
3. Adaptasiya/Balans: 20 AZN-dən başlayaraq
4. Nasos (TNVD) yoxlanması: 30 AZN-dən başlayaraq, markaya görə dəyişir
5. Farsunka təmiri: problemə görə dəyişir, Ramin ustaya yönləndir
6. Farsunka dəyişdirilməsi: mövcuddur, qiymət üçün Ramin ustaya yönləndir

QƏRAR AĞACI:
A (özün cavabla): qiymətlər, iş saatı, ünvan, telefon, ödəniş, xidmət müddəti
B (ilkin cavab + maraq aydınlaşdır): marka sualları, kombinasiya sualları
C (Ramin ustaya yönləndir): simptomlar, piezo farsunka, mürəkkəb texniki suallar, dəyişdirmə/təmir qiyməti

LEAD (ƏLAQƏ MƏLUMATI) TOPLAMA QAYDASI - ÇOX VACİB:
- create_lead funksiyasını YALNIZ HƏR İKİ şərt yerinə yetdikdə çağır:
  1) Müştəri AÇIQ ŞƏKİLDƏ maraq bildirib (gəlmək istəyir, randevu istəyir, "zəng edin", mürəkkəb problemi var)
  2) Müştəri telefon nömrəsini artıq YAZIB
- Sadəcə ümumi sual verən (qiymət, saat, ünvan) müştəri üçün ÇAĞIRMA
- Müştəri hələ telefon verməyibsə, ƏVVƏLCƏ adi mətnlə soruş, funksiya ÇAĞIRMA
- Eyni söhbətdə bir dəfə lead göndərildisə, təkrar göndərmə
- Misal (ÇAĞIRMA): "Farsunka neçəyədir?" → sadəcə qiyməti de
- Misal (ÇAĞIR): "Sabah gələ bilərəm" + telefon verdikdə → çağır

RANDEVU: "Öncədən zəng etməyiniz daha məqsədəuyğundur: 0505770082 - Ramin usta"`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_lead',
      description: 'Müştəri real xidmət üçün maraq bildirib və telefon nömrəsini verdikdə çağır. Yalnız bu halda çağır, ümumi suallarda çağırma.',
      parameters: {
        type: 'object',
        properties: {
          ad: { type: 'string', description: 'Müştərinin adı (məlum deyilsə boş string)' },
          telefon: { type: 'string', description: 'Müştərinin telefon nömrəsi (məcburidir)' },
          masin: { type: 'string', description: 'Avtomobil marka/model/il (məlum deyilsə boş string)' },
          movzu: { type: 'string', description: 'Müraciətin qısa mövzusu' }
        },
        required: ['telefon']
      }
    }
  }
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  try {
    const update = req.body;
    if (!update.message) return res.status(200).json({ ok: true });

    const chatId = update.message.chat.id.toString();
    const userText = update.message.text;

    if (!userText) {
      await sendMessage(chatId, 'Zəhmət olmasa mətn mesajı göndərin.');
      return res.status(200).json({ ok: true });
    }

    if (userText === '/start') {
      conversations.delete(chatId);
      await sendMessage(chatId, 'Salam! UAD BOT-a xoş gəlmisiniz.\n\nUltra Avto Dizel — farsunka və dizel nasos üzrə mütəxəssis servis.\n\nSizə necə kömək edə bilərəm?');
      return res.status(200).json({ ok: true });
    }

    if (!conversations.has(chatId)) {
      conversations.set(chatId, { history: [], leadSent: false });
    }
    const convo = conversations.get(chatId);
    convo.history.push({ role: 'user', content: userText });
    while (convo.history.length > 10) convo.history.shift();

    const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...convo.history];

    const firstRes = await callOpenAI(messages, true);
    if (firstRes.error) {
      console.error('OpenAI xəta:', JSON.stringify(firstRes.error));
      await sendMessage(chatId, 'Xəta: ' + firstRes.error.message);
      return res.status(200).json({ ok: true });
    }

    const message = firstRes.choices[0].message;
    let botReply;

    if (message.tool_calls && message.tool_calls.length > 0 && !convo.leadSent) {
      const toolCall = message.tool_calls[0];
      let args = {};
      try { args = JSON.parse(toolCall.function.arguments); } catch (e) { args = {}; }

      const phoneDigits = (args.telefon || '').replace(/\D/g, '');

      if (phoneDigits.length >= 7) {
        // Real lead - YALNIZ admin'ə göndərilir, müştəriyə HEÇ vaxt göndərilmir
        const now = new Date().toLocaleString('az-AZ', { timeZone: 'Asia/Baku' });
        const adminMsg = `📥 YENİ MÜRACİƏT — UAD BOT\n\n👤 Ad: ${args.ad || '—'}\n📞 Telefon: ${args.telefon}\n🚗 Maşın: ${args.masin || '—'}\n📋 Mövzu: ${args.movzu || '—'}\n\n⏰ ${now}`;
        await sendMessage(process.env.ADMIN_CHAT_ID, adminMsg);
        convo.leadSent = true;

        const followMessages = [
          { role: 'system', content: SYSTEM_PROMPT },
          ...convo.history,
          { role: 'assistant', content: null, tool_calls: message.tool_calls },
          { role: 'tool', tool_call_id: toolCall.id, content: 'Lead qeydə alındı və Ramin ustaya göndərildi.' }
        ];
        const followRes = await callOpenAI(followMessages, false);
        botReply = (followRes.choices && followRes.choices[0].message.content)
          || 'Məlumatınız Ramin ustaya yönləndirildi. Əlavə dəqiqləşdirmə üçün 0505770082 nömrəsi ilə əlaqə saxlaya bilərsiniz.';
      } else {
        // Telefon yoxdur/yarımçıqdır - lead GÖNDƏRİLMİR, sadəcə soruşulur
        botReply = message.content || 'Əlaqə saxlamaq üçün telefon nömrənizi yaza bilərsinizmi?';
      }
    } else {
      botReply = message.content || 'Üzr istəyirəm, sualınızı tam başa düşmədim. Bir daha izah edə bilərsinizmi?';
    }

    convo.history.push({ role: 'assistant', content: botReply });
    await sendMessage(chatId, botReply);
    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('UAD Bot xətası:', error);
    return res.status(200).json({ ok: true });
  }
}

async function callOpenAI(messages, withTools) {
  const body = {
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.6,
    max_tokens: 350
  };
  if (withTools) {
    body.tools = TOOLS;
    body.tool_choice = 'auto';
  }
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify(body)
  });
  return r.json();
}

async function sendMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}
