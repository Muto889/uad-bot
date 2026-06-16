// UAD BOT — Ultra Avto Dizel | api/webhook.js
// v4 TEST: sabit FAQ cavablari + lead/admin ayrimi + AZ/RU destek

const conversations = new Map(); // chatId -> { history: [], leadSent: boolean, awaitingLead: boolean, pendingProblem: string }

const SYSTEM_PROMPT = `Sən UAD BOT-san — Ultra Avto Dizel servisinin rəsmi süni intellekt köməkçisisən.
Servis dizel avtomobillərdə farsunka (injektor), yüksək təzyiqli nasos (TNVD), diaqnostika, adaptasiya və balans işləri üzrə işləyir.

ƏSAS QAYDALAR:
- Müştəriyə həmişə Siz/Sizin ilə müraciət et.
- Müştəri Azərbaycan dilində yazarsa Azərbaycan dilində, rusca yazarsa tam rusca cavab ver.
- Cavablar qısa və dəqiq olsun: 2-4 cümlə.
- Uydurma məlumat vermə. Qəti diaqnoz qoyma.
- Vaxtla bağlı söz vermə. “Adətən”, “başlayır”, “avtomobildən və iş sıxlığından asılıdır” ifadələrindən istifadə et.
- Eyni cümləni hər cavabda təkrarlama.
- “Əlavə məlumat üçün gələ bilərsiniz” cümləsini işlətmə.
- “Avtomobili stenddə yoxlamaq” demə. Stenddə yalnız farsunka yoxlanır. Avtomobil diaqnostika ilə yoxlanır.
- “Chevrolet üçün xidmət təqdim edirik” kimi ümumi cümlə yazma. Düzgün forma: “Avtomobil dizeldirsə, Chevrolet Captiva üzrə farsunka/TNVD/diaqnostika işlərinə baxırıq.”

LÜĞƏT:
- forsunka, frsunka, forsinka, injektor -> farsunka
- stend, sten, stent -> stend
- TNVD, ТНВД, tnvd, yüksək təzyiq nasosu -> yüksək təzyiqli nasos
- dızel, desizel -> dizel
- zapis, zapic, записаться, запись -> randevu

BİZNES MƏLUMATLARI:
Servis adı: Ultra Avto Dizel (UAD)
Ünvan: Əhməd Rəcəbli 304, Elit T/M ilə üzbəüz
Telefon: 0505770082 - Ramin usta
İş saatı: Bazar ertəsi-Şənbə, 10:00-18:30. Bazar günü qeyri-iş günüdür.
Ödəniş: Nağd, kart, bank köçürməsi

QİYMƏTLƏR:
1. Farsunka stend/yuyulma:
   - Farsunkaları söküb gətirsəniz: 10 AZN/ədəd
   - Avtomobillə gəlsəniz: 20 AZN/ədəd
   - 20 AZN/ədəd qiymətə farsunkanın avtomobildən sökülməsi, stenddə yoxlanması/yuyulması və yenidən bağlanması daxildir.
   - Avtomobildən asılı olaraq diaqnostika və adaptasiya edilir. Bunu hər avtomobildə mütləq daxildir kimi demə.
2. Diaqnostika: 10 AZN
3. Adaptasiya/Balans: 20 AZN-dən başlayır
4. Nasos (TNVD) yoxlanması: 30 AZN-dən başlayır, markaya görə dəyişir
5. Farsunka təmiri: qiymət problemə görə dəyişir, dəqiq qiymət yoxlamadan sonra bilinir
6. Farsunka dəyişdirilməsi: mövcuddur, qiymət üçün Ramin ustaya yönləndir

VAXT QAYDASI:
- Farsunka stend/yuyulma sökülüb gətiriləndə 40 dəqiqədən başlayır.
- Avtomobildən sökülüb-bağlanma, diaqnostika və adaptasiya vaxtı avtomobildən, farsunka sayından və iş sıxlığından asılıdır.
- Təmir lazım olarsa, vaxt ayrıca dəqiqləşir.

LEAD QAYDASI:
Müştəri gəlmək, randevu, qəbul, növbə, “zəng edin”, “sabah gələcəm”, “мой номер”, “записаться”, “можно приехать” kimi niyyət bildirirsə və telefon nömrəsi yazıbsa, create_lead çağır.
Müştəri telefon verməyibsə, ad, telefon, avtomobil, motor və problemi soruş.
Müştəriyə admin bildirişini göstərmə.
Müştəriyə təsdiq:
AZ: “Məlumatınız qeydə alındı. Ramin usta sizinlə əlaqə saxlayacaq.”
RU: “Ваши данные приняты. Рамин уста свяжется с вами.”`;

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
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  try {
    const update = req.body;
    const msg = update.message;
    if (!msg) return res.status(200).json({ ok: true });

    const chatId = msg.chat.id.toString();
    const userText = msg.text;
    const tgUser = msg.from || {};

    if (!userText) {
      await sendMessage(chatId, 'Zəhmət olmasa mətn mesajı göndərin.');
      return res.status(200).json({ ok: true });
    }

    if (userText.trim() === '/start') {
      conversations.delete(chatId);
      await sendMessage(chatId, 'Salam! UAD BOT-a xoş gəlmisiniz.\n\nUltra Avto Dizel — farsunka və dizel nasos üzrə servis.\n\nSizə necə kömək edə bilərəm?');
      return res.status(200).json({ ok: true });
    }

    if (!conversations.has(chatId)) {
      conversations.set(chatId, { history: [], leadSent: false, awaitingLead: false, pendingProblem: '' });
    }

    const convo = conversations.get(chatId);
    const lang = detectLanguage(userText);
    const phone = extractPhone(userText);
    const wantsLead = detectLeadIntent(userText);

    if ((wantsLead || convo.awaitingLead) && !phone && looksLikeIncompletePhone(userText)) {
      await sendMessage(chatId, lang === 'ru'
        ? 'Номер телефона указан неполностью. Пожалуйста, напишите полный номер. Например: 0501234567.'
        : 'Telefon nömrəsi tam görünmür. Zəhmət olmasa tam nömrənizi yazın. Məsələn: 0501234567.');
      return res.status(200).json({ ok: true });
    }

    if (wantsLead && !phone && !convo.leadSent) {
      convo.awaitingLead = true;
      convo.pendingProblem = userText;
      await sendMessage(chatId, lang === 'ru'
        ? 'Записать можно. Пожалуйста, напишите имя, телефон, автомобиль, мотор и проблему.'
        : 'Qeydiyyat üçün zəhmət olmasa adınızı, telefon nömrənizi, avtomobilinizi, motoru və problemi yazın.');
      return res.status(200).json({ ok: true });
    }

    if ((wantsLead || convo.awaitingLead) && phone && !convo.leadSent) {
      const lead = parseSimpleLead(userText, phone, lang);
      if (!lead.problem && convo.pendingProblem) lead.problem = convo.pendingProblem;

      await notifyAdmin(lead, chatId, tgUser);
      convo.leadSent = true;
      convo.awaitingLead = false;
      convo.pendingProblem = '';

      await sendMessage(chatId, lang === 'ru'
        ? 'Ваши данные приняты. Рамин уста свяжется с вами.'
        : 'Məlumatınız qeydə alındı. Ramin usta sizinlə əlaqə saxlayacaq.');
      return res.status(200).json({ ok: true });
    }

    const fixedReply = quickReply(userText, lang);
    if (fixedReply) {
      await sendMessage(chatId, fixedReply);
      addHistory(convo, 'user', userText);
      addHistory(convo, 'assistant', fixedReply);
      return res.status(200).json({ ok: true });
    }

    addHistory(convo, 'user', userText);

    const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...convo.history];
    const firstRes = await callOpenAI(messages, true);

    if (firstRes.error) {
      console.error('OpenAI xəta:', JSON.stringify(firstRes.error));
      await sendMessage(chatId, lang === 'ru'
        ? 'Сейчас есть техническая проблема. Пожалуйста, напишите немного позже.'
        : 'Hazırda texniki problem var. Zəhmət olmasa bir az sonra yenidən yazın.');
      return res.status(200).json({ ok: true });
    }

    const aiMessage = firstRes.choices?.[0]?.message || {};
    let botReply = '';

    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0 && !convo.leadSent) {
      const toolCall = aiMessage.tool_calls[0];
      let args = {};
      try { args = JSON.parse(toolCall.function.arguments || '{}'); } catch (e) { args = {}; }

      const toolPhone = extractPhone(args.telefon || '');
      const finalPhone = toolPhone || phone;

      if (finalPhone) {
        const lead = {
          ad: args.ad || '',
          telefon: finalPhone,
          avtomobil: args.avtomobil || args.masin || '',
          motor: args.motor || '',
          problem: args.problem || args.movzu || userText,
          dil: args.dil || lang
        };

        await notifyAdmin(lead, chatId, tgUser);
        convo.leadSent = true;
        botReply = lead.dil === 'ru'
          ? 'Ваши данные приняты. Рамин уста свяжется с вами.'
          : 'Məlumatınız qeydə alındı. Ramin usta sizinlə əlaqə saxlayacaq.';
      } else {
        convo.awaitingLead = true;
        convo.pendingProblem = userText;
        botReply = lang === 'ru'
          ? 'Пожалуйста, напишите имя, телефон, автомобиль, мотор и проблему.'
          : 'Zəhmət olmasa adınızı, telefon nömrənizi, avtomobilinizi, motoru və problemi yazın.';
      }
    } else {
      botReply = cleanBadPhrases(aiMessage.content || fallbackReply(lang));
    }

    addHistory(convo, 'assistant', botReply);
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
    temperature: 0.25,
    max_tokens: 300
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
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

async function notifyAdmin(lead, chatId, tgUser) {
  const now = new Date().toLocaleString('az-AZ', { timeZone: 'Asia/Baku' });
  const username = tgUser.username ? `@${tgUser.username}` : '—';
  const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || '—';

  const adminMsg =
`📥 YENİ MÜRACİƏT — UAD BOT

👤 Ad: ${lead.ad || '—'}
📞 Telefon: ${lead.telefon || '—'}
🚗 Avtomobil: ${lead.avtomobil || '—'}
⚙️ Motor: ${lead.motor || '—'}
📋 Problem: ${lead.problem || '—'}
🌐 Dil: ${lead.dil || 'az'}

Telegram:
👥 Ad: ${fullName}
🔗 Username: ${username}
🆔 Chat ID: ${chatId}

⏰ ${now}`;

  await sendMessage(process.env.ADMIN_CHAT_ID, adminMsg);
}

function quickReply(text, lang) {
  const t = normalizeText(text);
  const isRu = lang === 'ru';

  if (hasAny(t, ['hava', 'weather', 'погода'])) {
    return isRu
      ? 'Я могу отвечать только по услугам Ultra Avto Dizel: форсунки, ТНВД, диагностика и адаптация.'
      : 'Mən yalnız Ultra Avto Dizel xidmətləri üzrə kömək edə bilərəm: farsunka, TNVD, diaqnostika və adaptasiya.';
  }

  if (hasAny(t, ['nəğıl', 'nagil', 'nağıl', 'сказка'])) {
    return isRu
      ? 'Я могу помочь только по вопросам дизельного сервиса: форсунки, ТНВД, диагностика и адаптация.'
      : 'Mən yalnız dizel servis xidmətləri ilə bağlı suallara cavab verirəm.';
  }

  if (hasAny(t, ['adaptasiya', 'adaptation', 'адаптация', 'balans', 'баланс'])) {
    return isRu
      ? 'Да, адаптация/баланс выполняется. Цена начинается от 20 AZN и уточняется по автомобилю и объёму работы.'
      : 'Bəli, adaptasiya/balans edirik. Qiymət 20 AZN-dən başlayır və avtomobilə, görüləcək işə görə dəqiqləşir.';
  }

  if (isBrandQuestion(t)) {
    return isRu
      ? 'Если автомобиль дизельный, мы смотрим форсунки, ТНВД, диагностику и адаптацию. Бензиновые моторы не обслуживаем.'
      : 'Avtomobil dizeldirsə, farsunka, TNVD, diaqnostika və adaptasiya işlərinə baxırıq. Benzin mühərrik üzrə xidmət göstərmirik.';
  }

  if (isTimeQuestion(t)) {
    return isRu
      ? 'Если форсунки принесёте снятыми, проверка/чистка на стенде начинается от 40 минут. Если автомобиль приезжает сам, снятие-установка, диагностика и адаптация зависят от автомобиля, количества форсунок и загруженности сервиса. Если нужен ремонт, время уточняется после проверки.'
      : 'Farsunkaları söküb gətirsəniz, stenddə yoxlama/yuyulma 40 dəqiqədən başlayır. Avtomobillə gəlsəniz, sökülüb-bağlanma, diaqnostika və adaptasiya vaxtı avtomobildən, farsunka sayından və iş sıxlığından asılıdır. Təmir lazım olsa, vaxt yoxlamadan sonra dəqiqləşir.';
  }

  if (hasAny(t, ['tüstü', 'tustu', 'tustulayir', 'дым', 'дымит'])) {
    return isRu
      ? 'Дым может быть из-за форсунок, ТНВД, EGR, турбины, воздушной системы или механического состояния мотора. Цвет дыма важен: чёрный, белый или синий? Точно определить можно после диагностики автомобиля и проверки форсунок на стенде.'
      : 'Tüstünün səbəbi farsunka, TNVD, EGR, turbo, hava sistemi və ya motorun mexaniki vəziyyəti ola bilər. Tüstünün rəngi vacibdir: qara, ağ, yoxsa göy? Dəqiq səbəb avtomobil diaqnostikası və farsunkaların stenddə yoxlanmasından sonra bilinir.';
  }

  if (hasAny(t, ['farsunka', 'forsunka', 'frsunka', 'forsinka', 'injektor', 'форсун']) && isPriceQuestion(t)) {
    return isRu
      ? 'Если форсунки принесёте снятыми, стенд/чистка — 10 AZN за штуку. Если приедете на автомобиле, снятие, проверка/чистка на стенде и установка — 20 AZN за штуку. Диагностика и адаптация выполняются по необходимости, в зависимости от автомобиля.'
      : 'Farsunkaları söküb gətirsəniz, stend/yuyulma 10 AZN/ədəd-dir. Avtomobillə gəlsəniz, sökmə, stenddə yoxlama/yuyulma və bağlama 20 AZN/ədəd-dir. Diaqnostika və adaptasiya avtomobildən asılı olaraq edilir.';
  }

  if (hasAny(t, ['diaqnostika', 'diagnostika', 'диагност']) && isPriceQuestion(t)) {
    return isRu
      ? 'Диагностика стоит 10 AZN.'
      : 'Diaqnostika 10 AZN-dir.';
  }

  if (hasAny(t, ['tnvd', 'тнвд', 'nasos', 'насос']) && isPriceQuestion(t)) {
    return isRu
      ? 'Проверка ТНВД начинается от 30 AZN. Точная цена зависит от марки и типа насоса.'
      : 'TNVD/nasos yoxlanması 30 AZN-dən başlayır. Dəqiq qiymət nasosun markasına və tipinə görə dəyişir.';
  }

  if (hasAny(t, ['ünvan', 'unvan', 'harada', 'adres', 'адрес', 'где'])) {
    return isRu
      ? 'Адрес: Ахмед Раджабли 304, напротив Elit T/M.'
      : 'Ünvan: Əhməd Rəcəbli 304, Elit T/M ilə üzbəüz.';
  }

  if (hasAny(t, ['telefon', 'nomre', 'nömrə', 'nömre', 'номер'])) {
    return isRu
      ? 'Телефон: 0505770082 — Рамин уста.'
      : 'Telefon: 0505770082 — Ramin usta.';
  }

  if (hasAny(t, ['iş saat', 'is saat', 'saat neçə', 'neçe açıq', 'bazar günü', 'график', 'время работы', 'воскрес'])) {
    return isRu
      ? 'График работы: понедельник-суббота, 10:00-18:30. Воскресенье — выходной.'
      : 'İş saatı: Bazar ertəsi-Şənbə, 10:00-18:30. Bazar günü qeyri-iş günüdür.';
  }

  if (hasAny(t, ['kart', 'ödəniş', 'odenis', 'bank', 'карта', 'оплата'])) {
    return isRu
      ? 'Оплата возможна наличными, картой и банковским переводом.'
      : 'Ödəniş nağd, kart və bank köçürməsi ilə mümkündür.';
  }

  return null;
}

function extractPhone(text) {
  if (!text) return null;
  const normalized = String(text).replace(/[^\d+]/g, '');

  let match = normalized.match(/(?:\+?994)(10|50|51|55|70|77|99)\d{7}/);
  if (match) {
    const digits = match[0].replace(/\D/g, '');
    return digits.replace(/^994/, '0');
  }

  match = normalized.match(/0(10|50|51|55|70|77|99)\d{7}/);
  if (match) return match[0];

  return null;
}

function detectLeadIntent(text) {
  const t = normalizeText(text);
  return hasAny(t, [
    'randevu', 'randewu', 'gəlmək istəyirəm', 'gelmek isteyirem', 'gələcəm', 'gelecem',
    'sabah gəl', 'sabah gel', 'bu gün gəl', 'bugun gel', 'qəbul', 'qebul', 'növbə', 'novbe',
    'yazılmaq', 'yazilmaq', 'zəng edin', 'zeng edin', 'əlaqə saxlayın', 'elaqe saxlayin',
    'nömrəm', 'nomrem', 'telefonum', 'запись', 'запис', 'записаться', 'можно приехать',
    'хочу приехать', 'мой номер', 'номер телефона', 'примете', 'zapis', 'zapic', 'zapisatsa',
    'moy nomer', 'moj nomer', 'mojno priehat', 'mojno priexat'
  ]);
}

function looksLikeIncompletePhone(text) {
  const t = normalizeText(text);
  const hasPhoneWord = hasAny(t, ['nömr', 'nomr', 'telefon', 'номер', 'nomer']);
  const digitCount = (t.match(/\d/g) || []).length;
  return hasPhoneWord && digitCount > 0 && digitCount < 9;
}

function detectLanguage(text) {
  const t = String(text || '').toLowerCase();
  if (/[а-яё]/i.test(t)) return 'ru';
  if (hasAny(t, ['zdrav', 'spasibo', 'cpasibo', 'skolko', 'mojno', 'mozhno', 'zapis', 'moy', 'moj', 'priehat', 'priexat'])) return 'ru';
  return 'az';
}

function parseSimpleLead(text, phone, lang) {
  return {
    ad: '',
    telefon: phone,
    avtomobil: extractCar(text),
    motor: extractMotor(text),
    problem: removePhone(text).trim(),
    dil: lang
  };
}

function extractCar(text) {
  const t = String(text || '');
  const brands = ['Mercedes', 'BMW', 'Chevrolet', 'Captiva', 'Ford', 'Transit', 'Hyundai', 'Kia', 'Toyota', 'Renault', 'Nissan', 'Land Rover', 'Range Rover', 'Volkswagen', 'Audi', 'Opel'];
  const found = brands.filter((b) => new RegExp(b, 'i').test(t));
  return found.join(' ') || '';
}

function extractMotor(text) {
  const t = String(text || '');
  const match = t.match(/\b\d\.\d\b|\b\d{3}\b|\b\d{4}\b|\bCDI\b|\bTDI\b|\bCRDI\b|\bDCI\b|\bD4CB\b|\bOM\s?\d{3}\b/i);
  return match ? match[0] : '';
}

function removePhone(text) {
  return String(text || '')
    .replace(/\+?994\s?(10|50|51|55|70|77|99)\s?\d{3}\s?\d{2}\s?\d{2}/g, '')
    .replace(/0(10|50|51|55|70|77|99)\s?\d{3}\s?\d{2}\s?\d{2}/g, '');
}

function normalizeText(text) {
  return String(text || '').toLowerCase().replace(/ı/g, 'i');
}

function hasAny(text, words) {
  return words.some((w) => text.includes(w));
}

function isPriceQuestion(t) {
  return hasAny(t, ['qiymət', 'qiymet', 'neçə', 'nece', 'nə qədər', 'ne qeder', 'сколько', 'цена', 'стоит']);
}

function isTimeQuestion(t) {
  return hasAny(t, ['vaxt', 'müddət', 'muddet', 'nə qədər aparır', 'ne qeder aparir', 'neçə saata', 'nece saata', 'nə qədər çəkir', 'сколько времени', 'долго']);
}

function isBrandQuestion(t) {
  const hasBrand = hasAny(t, ['chevrolet', 'captiva', 'mercedes', 'bmw', 'ford', 'transit', 'hyundai', 'kia', 'toyota', 'renault', 'nissan', 'range rover', 'land rover', 'audi', 'volkswagen', 'opel']);
  const asksService = hasAny(t, ['baxirsiniz', 'baxırsınız', 'edirsiniz', 'işləyirsiniz', 'isleyirsiniz', 'смотрите', 'делаете']);
  return hasBrand && asksService;
}

function cleanBadPhrases(text) {
  return String(text || '')
    .replace(/Əlavə məlumat üçün gələ bilərsiniz\.?/gi, '')
    .replace(/avtomobili stenddə yoxlamağı/gi, 'avtomobil diaqnostikası və farsunkaların stenddə yoxlanmasını')
    .trim();
}

function fallbackReply(lang) {
  return lang === 'ru'
    ? 'Пожалуйста, уточните: Вас интересует форсунка, ТНВД, диагностика, адаптация или запись?'
    : 'Zəhmət olmasa dəqiqləşdirin: farsunka, TNVD, diaqnostika, adaptasiya, yoxsa randevu ilə bağlıdır?';
}

function addHistory(convo, role, content) {
  convo.history.push({ role, content });
  while (convo.history.length > 8) convo.history.shift();
}
