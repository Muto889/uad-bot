// UAD BOT — Ultra Avto Dizel | api/webhook.js
// v3 TEST: lead/admin ayrimi, telefon/randevu fallback, AZ/RU cavab, duzeltilmis qiymet mentiqi

const conversations = new Map(); // chatId -> { history: [...], leadSent: boolean }

const SYSTEM_PROMPT = `Sən UAD BOT-san — Ultra Avto Dizel servisinin rəsmi süni intellekt köməkçisisən.
Dizel avtomobillər üçün farsunka (injektor) və yüksək təzyiqli nasos (TNVD) xidmətləri göstəririk.

ÜMUMİ QAYDALAR:
- Müştəriyə həmişə Siz/Sizin ilə müraciət et.
- Azərbaycan dilində cavab ver. Müştəri rusca yazarsa, tam rusca cavab ver.
- Cavabların qısa olsun: adətən 2-4 cümlə.
- Eyni cümləni hər cavabda təkrarlama.
- Heç vaxt uydurma məlumat vermə.
- "Mütləq", "100%", "dəqiq olacaq", "1 saata hazırdır" kimi söz vermə ifadələri işlətmə.
- Təbii və insan kimi yaz. Robot kimi şablon cavablardan çəkin.

LÜĞƏT:
- forsunka, frsunka, forsinka, injektor -> farsunka
- stend, sten, stent -> stend
- TNVD, ТНВД, tnvd, yüksək təzyiq nasosu -> yüksək təzyiqli nasos
- dızel, desizel -> dizel
- randevu, randewu, qəbul, növbə, yazılmaq -> randevu/gəlmək istəyi
- запись, записаться, можно приехать, мой номер, moy nomer, zapis -> randevu/gəlmək istəyi

BİZNES MƏLUMATLARI:
Servis adı: Ultra Avto Dizel (UAD)
Ünvan: Əhməd Rəcəbli 304, Elit T/M ilə üzbəüz
Telefon: 0505770082 - Ramin usta
İş saatı: Bazar ertəsi-Şənbə, 10:00-18:30. Bazar günü qeyri-iş günüdür.
Ödəniş: Nağd, kart, bank köçürməsi

XİDMƏTLƏR VƏ QİYMƏTLƏR:
1. Farsunka stend/yuyulma:
   - Müştəri farsunkaları söküb gətirərsə: 10 AZN/ədəd
   - Müştəri avtomobillə gələrsə: 20 AZN/ədəd
   - 20 AZN/ədəd qiymətə avtomobildən farsunkaların sökülməsi, stenddə yoxlanması/yuyulması və yenidən bağlanması daxildir.
   - Avtomobildən asılı olaraq diaqnostika və adaptasiya edilir. Bunu hər avtomobildə mütləq daxildir kimi demə.
2. Diaqnostika: 10 AZN
3. Adaptasiya/Balans: 20 AZN-dən başlayır
4. Nasos (TNVD) yoxlanması: 30 AZN-dən başlayır, markaya görə dəyişir
5. Farsunka təmiri: problemə görə dəyişir, dəqiq qiymət yoxlamadan sonra bilinir
6. Farsunka dəyişdirilməsi: mövcuddur, qiymət üçün Ramin ustaya yönləndir

QƏRAR QAYDASI:
A) Qiymət, iş saatı, ünvan, telefon, ödəniş suallarına özün qısa cavab ver.
B) Marka/model, bir neçə xidmət birlikdə, texniki ehtimal suallarında ilkin cavab ver və lazım olsa Ramin ustaya yönləndir.
C) Simptomlarda qəti diaqnoz qoyma. Ehtimalları de və yoxlama/stend/diaqnostika tövsiyə et.

LEAD TOPLAMA QAYDASI:
Müştəri gəlmək, randevu, qəbul, növbə, "zəng edin", "sabah gələcəm", "мой номер", "записаться", "можно приехать" kimi niyyət bildirirsə və telefon nömrəsi yazıbsa, create_lead çağır.

Müraciət üçün bu məlumatları topla:
- Ad
- Telefon
- Avtomobil
- Motor
- Problem

Telefon varsa, lead yarat. Ad, avtomobil, motor və problem yoxdursa boş saxla.
Telefon yoxdursa, müştəridən telefon istəyin.
Telefon natamamdırsa, tam nömrə istəyin.

Müştəriyə admin bildirişini göstərmə.
Müştəriyə sadəcə qısa təsdiq ver:
AZ: "Məlumatınız qeydə alındı. Ramin usta sizinlə əlaqə saxlayacaq."
RU: "Ваши данные приняты. Рамин уста свяжется с вами."

RANDEVU:
Öncədən zəng etmək daha məqsədəuyğundur: 0505770082 - Ramin usta`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_lead',
      description: 'Müştəri real xidmət üçün maraq bildirib və telefon nömrəsini verdikdə çağır.',
      parameters: {
        type: 'object',
        properties: {
          ad: { type: 'string', description: 'Müştərinin adı. Məlum deyilsə boş string.' },
          telefon: { type: 'string', description: 'Müştərinin telefon nömrəsi.' },
          avtomobil: { type: 'string', description: 'Avtomobil marka/model/il. Məlum deyilsə boş string.' },
          motor: { type: 'string', description: 'Motor/həcm/kod. Məlum deyilsə boş string.' },
          problem: { type: 'string', description: 'Müştərinin problemi və ya müraciət mövzusu.' },
          dil: { type: 'string', enum: ['az', 'ru'], description: 'Müştərinin dili.' }
        },
        required: ['telefon']
      }
    }
  }
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true });
  }

  try {
    const update = req.body;

    if (!update.message) {
      return res.status(200).json({ ok: true });
    }

    const chatId = update.message.chat.id.toString();
    const userText = update.message.text;
    const tgUser = update.message.from || {};

    if (!userText) {
      await sendMessage(chatId, 'Zəhmət olmasa mətn mesajı göndərin.');
      return res.status(200).json({ ok: true });
    }

    if (userText.trim() === '/start') {
      conversations.delete(chatId);
      await sendMessage(
        chatId,
        'Salam! UAD BOT-a xoş gəlmisiniz.\n\nUltra Avto Dizel — farsunka və dizel nasos üzrə servis.\n\nSizə necə kömək edə bilərəm?'
      );
      return res.status(200).json({ ok: true });
    }

    if (!conversations.has(chatId)) {
      conversations.set(chatId, { history: [], leadSent: false });
    }

    const convo = conversations.get(chatId);

    const phoneFromText = extractPhone(userText);
    const wantsLead = detectLeadIntent(userText);
    const lang = detectLanguage(userText);

    // AI bəzən tool çağırmaya bilər. Ona görə fallback: niyyət + telefon varsa, lead-i kod özü yaradır.
    if (wantsLead && phoneFromText && !convo.leadSent) {
      const leadData = {
        ad: '',
        telefon: phoneFromText,
        avtomobil: '',
        motor: '',
        problem: userText,
        dil: lang
      };

      await notifyAdmin(leadData, chatId, tgUser);
      convo.leadSent = true;

      const reply = lang === 'ru'
        ? 'Ваши данные приняты. Рамин уста свяжется с вами.'
        : 'Məlumatınız qeydə alındı. Ramin usta sizinlə əlaqə saxlayacaq.';

      convo.history.push({ role: 'user', content: userText });
      convo.history.push({ role: 'assistant', content: reply });

      await sendMessage(chatId, reply);
      return res.status(200).json({ ok: true });
    }

    // Niyyət var, amma telefon yoxdur və ya natamamdır.
    if (wantsLead && !phoneFromText && looksLikeIncompletePhone(userText)) {
      const reply = lang === 'ru'
        ? 'Номер телефона указан неполностью. Пожалуйста, напишите полный номер. Например: 0501234567.'
        : 'Telefon nömrəsi tam görünmür. Zəhmət olmasa tam nömrənizi yazın. Məsələn: 0501234567.';

      await sendMessage(chatId, reply);
      return res.status(200).json({ ok: true });
    }

    convo.history.push({ role: 'user', content: userText });
    while (convo.history.length > 10) {
      convo.history.shift();
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...convo.history
    ];

    const firstRes = await callOpenAI(messages, true);

    if (firstRes.error) {
      console.error('OpenAI xəta:', JSON.stringify(firstRes.error));
      await sendMessage(chatId, 'Hazırda texniki problem var. Zəhmət olmasa bir az sonra yenidən yazın.');
      return res.status(200).json({ ok: true });
    }

    const message = firstRes.choices?.[0]?.message || {};
    let botReply = '';

    if (message.tool_calls && message.tool_calls.length > 0 && !convo.leadSent) {
      const toolCall = message.tool_calls[0];

      let args = {};
      try {
        args = JSON.parse(toolCall.function.arguments || '{}');
      } catch (e) {
        args = {};
      }

      const toolPhone = extractPhone(args.telefon || '');
      const finalPhone = toolPhone || phoneFromText;

      if (finalPhone) {
        const leadData = {
          ad: args.ad || '',
          telefon: finalPhone,
          avtomobil: args.avtomobil || args.masin || '',
          motor: args.motor || '',
          problem: args.problem || args.movzu || userText,
          dil: args.dil || lang
        };

        await notifyAdmin(leadData, chatId, tgUser);
        convo.leadSent = true;

        botReply = leadData.dil === 'ru'
          ? 'Ваши данные приняты. Рамин уста свяжется с вами.'
          : 'Məlumatınız qeydə alındı. Ramin usta sizinlə əlaqə saxlayacaq.';
      } else {
        botReply = lang === 'ru'
          ? 'Пожалуйста, напишите Ваш номер телефона, чтобы Рамин уста мог связаться с Вами.'
          : 'Zəhmət olmasa telefon nömrənizi yazın ki, Ramin usta sizinlə əlaqə saxlasın.';
      }
    } else {
      botReply = message.content || fallbackReply(userText, lang);
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
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages,
    temperature: 0.4,
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
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify(body)
  });

  return r.json();
}

async function sendMessage(chatId, text) {
  if (!chatId || !text) return;

  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text
    })
  });
}

async function notifyAdmin(leadData, chatId, tgUser) {
  const now = new Date().toLocaleString('az-AZ', { timeZone: 'Asia/Baku' });

  const username = tgUser.username ? `@${tgUser.username}` : '—';
  const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || '—';

  const adminMsg =
`📥 YENİ MÜRACİƏT — UAD BOT

👤 Ad: ${leadData.ad || '—'}
📞 Telefon: ${leadData.telefon || '—'}
🚗 Avtomobil: ${leadData.avtomobil || '—'}
⚙️ Motor: ${leadData.motor || '—'}
📋 Problem: ${leadData.problem || '—'}
🌐 Dil: ${leadData.dil || 'az'}

Telegram:
👥 Ad: ${fullName}
🔗 Username: ${username}
🆔 Chat ID: ${chatId}

⏰ ${now}`;

  await sendMessage(process.env.ADMIN_CHAT_ID, adminMsg);
}

function extractPhone(text) {
  if (!text) return null;

  const normalized = String(text).replace(/[^\d+]/g, '');

  // +994501234567 / 994501234567
  let match = normalized.match(/(?:\+?994)(10|50|51|55|70|77|99)\d{7}/);
  if (match) {
    const digits = match[0].replace(/\D/g, '');
    const withoutCountry = digits.replace(/^994/, '0');
    return withoutCountry;
  }

  // 0501234567
  match = normalized.match(/0(10|50|51|55|70|77|99)\d{7}/);
  if (match) {
    return match[0];
  }

  return null;
}

function detectLeadIntent(text) {
  const t = String(text || '').toLowerCase();

  const patterns = [
    'randevu',
    'randewu',
    'gəlmək istəyirəm',
    'gelmek isteyirem',
    'gələcəm',
    'gelecem',
    'sabah gəl',
    'sabah gel',
    'bu gün gələ',
    'bugun gele',
    'qəbul',
    'qebul',
    'növbə',
    'novbe',
    'yazılmaq',
    'yazilmaq',
    'zəng edin',
    'zeng edin',
    'əlaqə saxlayın',
    'elaqe saxlayin',
    'nömrəm',
    'nomrem',
    'telefonum',

    'запись',
    'запис',
    'записаться',
    'можно приехать',
    'хочу приехать',
    'мой номер',
    'номер телефона',
    'примете',

    'zapis',
    'zapic',
    'zapisatsa',
    'moy nomer',
    'moj nomer',
    'mojno priehat',
    'mojno priexat'
  ];

  return patterns.some((p) => t.includes(p));
}

function looksLikeIncompletePhone(text) {
  const t = String(text || '').toLowerCase();

  const hasPhoneWord =
    t.includes('nömr') ||
    t.includes('nomr') ||
    t.includes('telefon') ||
    t.includes('номер') ||
    t.includes('nomer');

  const digitCount = (t.match(/\d/g) || []).length;

  return hasPhoneWord && digitCount > 0 && digitCount < 9;
}

function detectLanguage(text) {
  const t = String(text || '').toLowerCase();

  if (/[а-яё]/i.test(t)) return 'ru';

  const ruLatinHints = [
    'zdravstvuyte',
    'zdravstvuite',
    'spasibo',
    'cpasibo',
    'skolko',
    'mojno',
    'mozhno',
    'zapis',
    'nomer',
    'moy',
    'moj',
    'priehat',
    'priexat'
  ];

  if (ruLatinHints.some((w) => t.includes(w))) return 'ru';

  return 'az';
}

function fallbackReply(userText, lang) {
  if (lang === 'ru') {
    return 'Извините, я не совсем понял вопрос. Пожалуйста, уточните: Вас интересует форсунка, ТНВД, диагностика или запись?';
  }

  return 'Sualınızı tam başa düşmədim. Zəhmət olmasa dəqiqləşdirin: farsunka, TNVD, diaqnostika, yoxsa randevu ilə bağlıdır?';
}
