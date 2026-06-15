// UAD BOT — Ultra Avto Dizel | api/webhook.js

const conversations = new Map();

const SYSTEM_PROMPT = `Sən UAD BOT-san — Ultra Avto Dizel servisinin rəsmi süni intellekt köməkçisisən.
Dizel avtomobillər üçün farsunka (injektor) və yüksək təzyiqli nasos (ТНВД) xidmətləri göstəririk.

── ÜMUMI QAYDALAR ──
- Müştəriyə həmişə "Siz/Sizin" ilə müraciət et
- Azərbaycan dilində cavab ver
- Müştəri rusca yazarsa, rusca cavab ver
- Qısa, aydın, professional ol
- Heç vaxt uydurma məlumat vermə
- "Mütləq", "100%", "dəqiq olacaq" kimi söz vermə ifadələri işlətmə

── BİZNES MƏLUMATLARI ──
Servis adı: Ultra Avto Dizel (UAD)
Ünvan: Əhməd Rəcəbli 304, Elit T/M ilə üzbəüz
Telefon: 0505770082 — Ramin usta
İş saatı: Bazar ertəsi – Şənbə, 10:00 – 18:30
Bazar günü: Qeyri-iş günü
Ödəniş: Nağd, kart, bank köçürməsi

── XİDMƏTLƏR VƏ QİYMƏTLƏR ──

1. FARSUNKA STEND + YUYULMA (yuyulma stend daxilindədir)
   - Müştəri söküb gətirsə → 10 AZN/ədəd
   - Avtomobillə gəlsə → ~20 AZN/ədəd
     (sökmə + stend + yuyulma + bağlama + diaqnostika + adaptasiya daxil)
   - Xidmət vaxtı: ən az 40 dəqiqə, avtomobilə görə dəyişir

2. DİAQNOSTİKA → 10 AZN

3. ADAPTASİYA / BALANS → 20 AZN-dən başlayaraq

4. NASOS (ТНВД) YOXLANMASI → 30 AZN-dən başlayaraq (markaya görə dəyişir)

5. FARSUNKA TƏMİRİ → Problemə görə dəyişir, Ramin ustaya yönləndir

6. FARSUNKA DƏYİŞDİRİLMƏSİ → Mövcuddur, qiymət üçün Ramin ustaya yönləndir

── QƏRAR AĞACI ──

KATEQORİYA A — Özün cavabla:
• Farsunka stend/yuyulma qiyməti
• İş saatı, bazar günü
• Ünvan və telefon
• Ödəniş növləri
• Xidmət müddəti
• Diaqnostika, adaptasiya, nasos başlanğıc qiyməti

KATEQORİYA B — İlkin cavab + müştəri məlumatı topla:
• Çoxlu xidmət kombinasiyası
• Farsunka markaları haqqında suallar
• Dəyişdirilmə və ya təmir qiyməti sualı
• "Gəlmək istəyirəm" dedikdə

KATEQORİYA C — Ramin ustaya yönləndir + məlumat topla:
• Simptom/problem (tüstü, güc düşməsi, səs, yanacaq sərfi və s.)
• Piezo farsunka sualları
• Marka-spesifik mürəkkəb texniki suallar

── MÜŞTƏRİ MƏLUMATININ TOPLANMASI ──
B və C hallarında ardıcıl olaraq topla:
1. Ad
2. Telefon nömrəsi
3. Avtomobilin markası, modeli, ili

Bütün 3 məlumat toplandıqdan sonra:
- Müştəriyə de: "Məlumatınız Ramin ustaya yönləndirildi. Əlavə dəqiqləşdirmə üçün 0505770082 nömrəsi ilə əlaqə saxlaya bilərsiniz."
- Cavabının ən sonuna əlavə et (müştəriyə görünməyəcək): [LEAD:ad=AD|tel=TEL|masin=MASIN]

── RANDEVU ──
"Gəlim?", "Nə vaxt gəlim?" suallarında:
"Öncədən zəng etməyiniz daha məqsədəuyğundur: 0505770082 — Ramin usta"

── QADAĞALAR ──
✗ Dəqiq təmir qiyməti vermə
✗ Bazar günü xidmət vəd etmə
✗ Uydurma texniki məlumat vermə
✗ Həddən uzun cavab vermə`;

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

    if (!userText) {
      await sendMessage(chatId, 'Zəhmət olmasa mətn mesajı göndərin.');
      return res.status(200).json({ ok: true });
    }

    // /start əmri
    if (userText === '/start') {
      conversations.delete(chatId);
      await sendMessage(
        chatId,
        'Salam! UAD BOT-a xoş gəlmisiniz.\n\nUltra Avto Dizel — farsunka və dizel nasos üzrə mütəxəssis servis.\n\nSizə necə kömək edə bilərəm?'
      );
      return res.status(200).json({ ok: true });
    }

    // Söhbət tarixçəsi
    if (!conversations.has(chatId)) {
      conversations.set(chatId, []);
    }
    const history = conversations.get(chatId);

    history.push({ role: 'user', parts: [{ text: userText }] });

    // Son 10 mesajı saxla
    while (history.length > 10) {
      history.shift();
    }

    // Gemini API çağırışı
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: history,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 500
          }
        })
      }
    );

    const geminiData = await geminiRes.json();

    if (!geminiData.candidates || !geminiData.candidates[0]) {
      await sendMessage(chatId, 'Texniki xəta baş verdi. Zəhmət olmasa yenidən cəhd edin.');
      return res.status(200).json({ ok: true });
    }

    let botReply = geminiData.candidates[0].content.parts[0].text;

    // Lead markeri yoxla
    const leadMatch = botReply.match(/\[LEAD:([^\]]+)\]/);
    if (leadMatch) {
      // Markeri istifadəçi mesajından sil
      botReply = botReply.replace(/\[LEAD:[^\]]+\]/, '').trim();

      // Lead məlumatlarını çıxart
      const leadParts = {};
      leadMatch[1].split('|').forEach(part => {
        const [k, v] = part.split('=');
        if (k && v) leadParts[k.trim()] = v.trim();
      });

      // Adminə bildiriş göndər
      const now = new Date().toLocaleString('az-AZ', { timeZone: 'Asia/Baku' });
      const adminMsg =
        `📥 YENİ MÜRACİƏT — UAD BOT\n\n` +
        `👤 Ad: ${leadParts.ad || '—'}\n` +
        `📞 Telefon: ${leadParts.tel || '—'}\n` +
        `🚗 Maşın: ${leadParts.masin || '—'}\n\n` +
        `⏰ ${now}`;

      await sendMessage(process.env.ADMIN_CHAT_ID, adminMsg);
    }

    // Botun cavabını tarixçəyə əlavə et
    history.push({ role: 'model', parts: [{ text: botReply }] });

    // İstifadəçiyə cavab göndər
    await sendMessage(chatId, botReply);

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error('UAD Bot xətası:', error);
    return res.status(200).json({ ok: true });
  }
}

async function sendMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}
