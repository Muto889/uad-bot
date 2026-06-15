// UAD BOT — Ultra Avto Dizel | api/webhook.js

const conversations = new Map();

const SYSTEM_PROMPT = `Sən UAD BOT-san — Ultra Avto Dizel servisinin rəsmi süni intellekt köməkçisisən.
Dizel avtomobillər üçün farsunka (injektor) və yüksək təzyiqli nasos (ТНВД) xidmətləri göstəririk.

ÜMUMI QAYDALAR:
- Müştəriyə həmişə Siz/Sizin ilə müraciət et
- Azərbaycan dilində cavab ver
- Müştəri rusca yazarsa, rusca cavab ver
- Qısa, aydın, professional ol
- Heç vaxt uydurma məlumat vermə

BİZNES MƏLUMATLARI:
Servis adı: Ultra Avto Dizel (UAD)
Ünvan: Əhməd Rəcəbli 304, Elit T/M ilə üzbəüz
Telefon: 0505770082 - Ramin usta
İş saatı: Bazar ertəsi - Şənbə, 10:00 - 18:30
Bazar günü: Qeyri-iş günü
Ödəniş: Nağd, kart, bank köçürməsi

XİDMƏTLƏR VƏ QİYMƏTLƏR:
1. FARSUNKA STEND + YUYULMA (yuyulma stend daxilindədir)
   - Müştəri söküb gətirsə: 10 AZN/ədəd
   - Avtomobillə gəlsə: 20 AZN/ədəd (sökmə+stend+yuyulma+bağlama+diaqnostika+adaptasiya daxil)
   - Xidmət vaxtı: ən az 40 dəqiqə, avtomobilə görə dəyişir
2. DİAQNOSTİKA: 10 AZN
3. ADAPTASİYA/BALANS: 20 AZN-dən başlayaraq
4. NASOS (TNVD) YOXLANMASI: 30 AZN-dən başlayaraq (markaya görə dəyişir)
5. FARSUNKA TƏMİRİ: Problemə görə dəyişir, Ramin ustaya yönləndir
6. FARSUNKA DƏYİŞDİRİLMƏSİ: Mövcuddur, qiymət üçün Ramin ustaya yönləndir

QƏRAR AĞACI:
A - Özün cavabla: stend/yuyulma qiyməti, iş saatı, ünvan, telefon, ödəniş, xidmət müddəti
B - İlkin cavab + məlumat topla: kombinasiyalar, marka sualları, dəyişdirmə/təmir qiyməti, gəlmək istəyənlər
C - Ramin ustaya yönləndir + məlumat topla: simptomlar (tüstü, güc düşməsi, səs), piezo farsunka, mürəkkəb texniki suallar

MÜŞTƏRİ MƏLUMATININ TOPLANMASI:
B və C hallarında ardıcıl topla: 1) Ad 2) Telefon 3) Maşın markası/modeli/ili
Topladıqdan sonra de: "Məlumatınız Ramin ustaya yönləndirildi. Əlavə dəqiqləşdirmə üçün 0505770082 nömrəsi ilə əlaqə saxlaya bilərsiniz."
Cavabının sonuna əlavə et (müştəriyə görünməyəcək): [LEAD:ad=AD|tel=TEL|masin=MASIN]

RANDEVU: "Öncədən zəng etməyiniz daha məqsədəuyğundur: 0505770082 - Ramin usta"

QADAĞALAR: Dəqiq təmir qiyməti vermə. Bazar günü xidmət vəd etmə. Uydurma məlumat vermə.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true });
  }

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

    if (!conversations.has(chatId)) conversations.set(chatId, []);
    const history = conversations.get(chatId);
    history.push({ role: 'user', parts: [{ text: userText }] });
    while (history.length > 10) history.shift();

    // Gemini API - system prompt söhbətə daxil edilir
    const contents = [
      { role: 'user', parts: [{ text: SYSTEM_PROMPT + '\n\nBu qaydaları başa düşdünsə, "Başa düşdüm" de.' }] },
      { role: 'model', parts: [{ text: 'Başa düşdüm. UAD BOT kimi xidmət edəcəyəm.' }] },
      ...history
    ];

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
        })
      }
    );

    const geminiData = await geminiRes.json();

    // Debug: xəta varsa tam məlumat göndər
    if (geminiData.error) {
      console.error('Gemini xəta:', JSON.stringify(geminiData.error));
      await sendMessage(chatId, 'Xəta kodu: ' + geminiData.error.code + '\nXəta: ' + geminiData.error.message);
      return res.status(200).json({ ok: true });
    }

    if (!geminiData.candidates || !geminiData.candidates[0] || !geminiData.candidates[0].content) {
      console.error('Boş cavab:', JSON.stringify(geminiData));
      await sendMessage(chatId, 'Debug: ' + JSON.stringify(geminiData).substring(0, 300));
      return res.status(200).json({ ok: true });
    }

    let botReply = geminiData.candidates[0].content.parts[0].text;

    // Lead markeri
    const leadMatch = botReply.match(/\[LEAD:([^\]]+)\]/);
    if (leadMatch) {
      botReply = botReply.replace(/\[LEAD:[^\]]+\]/, '').trim();
      const leadParts = {};
      leadMatch[1].split('|').forEach(part => {
        const [k, v] = part.split('=');
        if (k && v) leadParts[k.trim()] = v.trim();
      });
      const now = new Date().toLocaleString('az-AZ', { timeZone: 'Asia/Baku' });
      const adminMsg = `📥 YENİ MÜRACİƏT — UAD BOT\n\n👤 Ad: ${leadParts.ad || '—'}\n📞 Telefon: ${leadParts.tel || '—'}\n🚗 Maşın: ${leadParts.masin || '—'}\n\n⏰ ${now}`;
      await sendMessage(process.env.ADMIN_CHAT_ID, adminMsg);
    }

    history.push({ role: 'model', parts: [{ text: botReply }] });
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
