# Sahahly OS

منصة سحابية (EdTech SaaS) لإدارة العملية التعليمية للمدرسين والسناتر في مصر: تصحيح ذكي للواجبات والامتحانات المكتوبة بخط اليد (Google Gemini Vision) مع مراجعة بشرية سريعة، حضور بالـ QR، متابعة الاشتراكات الشهرية، وتقارير واتساب تلقائية لأولياء الأمور.

Designed by Eslam sherif

---

## التقنيات

- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- Supabase (PostgreSQL + Auth + Storage) مع عزل بيانات كل مدرس عبر RLS
- Google Gemini (`gemini-2.5-flash`) للتصحيح والرؤية الحاسوبية
- `pdf-lib` لتوليد ملف PDF النهائي بعلامات التصحيح
- UltraMsg أو WhatsApp Cloud API لإرسال الرسائل

---

## خطوات التشغيل

### 1) تثبيت الحزم

```bash
npm install
```

### 2) إنشاء مشروع Supabase

1. أنشئ مشروعًا جديدًا من [supabase.com](https://supabase.com).
2. افتح **SQL Editor** والصق محتوى الملف `supabase/migrations/001_init.sql` ثم شغّله (أو استخدم `supabase db push`).
3. من **Project Settings > API** انسخ: Project URL و anon key و service_role key.
4. تأكد من وجود الحاويات الثلاث في **Storage**: `mark-schemes` و`raw-submissions` و`graded-pdfs` (ينشئها ملف الـ SQL تلقائيًا).

### 3) ضبط المتغيرات

```bash
cp .env.example .env.local
```

املأ القيم في `.env.local`:

| المتغير | الوصف |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | من إعدادات Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | للسيرفر فقط، لا تكشفه للمتصفح أبدًا |
| `GEMINI_API_KEY` | من [Google AI Studio](https://aistudio.google.com) |
| `WHATSAPP_PROVIDER` | `ultramsg` أو `cloud_api` |
| `ULTRAMSG_INSTANCE_ID` / `ULTRAMSG_TOKEN` | إن استخدمت UltraMsg |
| `WHATSAPP_CLOUD_PHONE_NUMBER_ID` / `WHATSAPP_CLOUD_ACCESS_TOKEN` | إن استخدمت Cloud API |
| `NEXT_PUBLIC_APP_URL` | رابط الموقع (مثل `http://localhost:3000`) |
| `INTERNAL_API_SECRET` | نص عشوائي طويل لحماية الاستدعاءات الداخلية |

### 4) التشغيل

```bash
npm run dev
```

افتح `http://localhost:3000`.

---

## أول استخدام

1. أنشئ حساب مدرس من `/signup`.
2. من **الطلاب والمجموعات** أضف مجموعة ثم الطلاب (أو استورد ملف Excel/CSV) واطبع بطاقات الـ QR.
3. من **الواجبات والامتحانات** أنشئ واجبًا وارفع نموذج الإجابة.
4. شارك الطلاب رابط `/submit` ليسلّموا بأكوادهم.
5. راجع الأوراق في **مراجعة التصحيح** ثم اعتمدها لإرسال النتيجة لولي الأمر.

---

## تعديل روابط المصمم

كل روابط التواصل الاجتماعي في تذييل الموقع تُعدَّل من ملف واحد: `src/config/site.ts`.

---

## ملاحظات مهمة

- **كل ملفات الإجابات خاصة**: تُقرأ فقط بروابط موقّعة مؤقتة من السيرفر.
- **أدوار المساعدين** (admin / grader / receptionist) تُفرض في مسارات الـ API وصفحات لوحة التحكم، أما RLS فتضمن عزل البيانات بين المدرسين.
- **إضافة مساعد**: لا توجد شاشة لذلك بعد. أنشئ مستخدمًا من Supabase Auth ثم أضف صفًا في جدول `assistants` بنفس البريد (أو بنفس `id` للمستخدم).
- **علامات الـ PDF** تُرسم كأشكال وأرقام لاتينية فقط، لأن خطوط `pdf-lib` المدمجة لا تدعم العربية؛ التعليقات العربية تظهر في شاشة المراجعة ورسالة الواتساب.
- **حماية من التخمين**: يُنصح بإضافة Rate Limiting على مسارات بوابة الطلاب (`/api/submissions/*`) قبل الإطلاق العام.
- **الواتساب**: رقم المرسل يجب أن يكون مرتبطًا بحساب UltraMsg أو Cloud API فعّال.

---

© 2026 Sahahly OS. All Rights Reserved to Eslam sherif.
