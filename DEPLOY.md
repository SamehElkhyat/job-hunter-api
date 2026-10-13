# نشر الباك (API) على Vercel

ده الـ repo الخاص بالـ API فقط. الفرونت في repo تاني وبيتنشر لوحده (راجع `DEPLOY.md` هناك). الترتيب: **الباك الأول** عشان تاخد رابطه وتحطه في الفرونت.

```
المتصفح ──► الفرونت (Next.js) ──► [ هذا الـ repo: Express كـ Vercel Function ] ──► MongoDB Atlas
                  APP_PASSWORD              API_ACCESS_KEY (مفتاح سري)
```

## 0) قبل ما تبدأ
1. ارفع الـ repo ده على GitHub (repo منفصل عن الفرونت). ملفات `.env*` و`.vercel` متجاهلة، مش هتترفع.
2. ولّد المفتاح السري (وهتحطه في **المشروعين** بنفس القيمة):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

## 1) MongoDB Atlas
1. أنشئ Cluster مجاني (M0).
2. **Database Access** ← Add New Database User (username + password قوي، ولو فيه رموز خاصة اعمل URL-encode: `@` ← `%40`).
3. **Network Access** ← **Allow access from anywhere (`0.0.0.0/0`)**. عناوين Vercel بتتغيّر، فالحماية بتعتمد على الباسورد القوي والمفتاح السري.
4. **Connect ← Drivers** وانسخ الـ URI وحط اسم قاعدة البيانات قبل `?`:
   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/job-hunter?retryWrites=true&w=majority
   ```

## 2) Vercel
**Add New… ← Project** ← اختار الـ repo ده. الإعدادات جاهزة في `vercel.json` (Framework: Other، Build: `npm run build`)، فمش محتاج تغيّر حاجة. Root Directory يفضل `./`.

**Environment Variables** (Production):

| الاسم | القيمة |
| --- | --- |
| `MONGODB_URI` | الـ URI من Atlas (مطلوب) |
| `API_ACCESS_KEY` | المفتاح اللي ولّدته، ٣٢ حرف على الأقل (مطلوب) |
| `ANTHROPIC_API_KEY` | اختياري. من غيره بيشتغل المحرك المحلي |
| `MONGODB_DB_NAME` | اختياري، لو مش مكتوب في الـ URI |
| `SEED_DEMO_DATA` | اختياري. الافتراضي في production = `false` |

اضغط **Deploy** ثم اختبر (استخدم دومين الـ production `<project>.vercel.app`، مش رابط الـ deployment الفردي لأنه ممكن يكون محمي):

```
https://<project>.vercel.app/api/health      ← {"ok":true,...,"database":{"state":"connected"}}
https://<project>.vercel.app/api/bootstrap   ← 401 (من غير المفتاح، وده المطلوب)
```

بعدها خد رابط الباك وحطه كـ `API_URL` في مشروع الفرونت.

## الحماية
- كل المسارات ما عدا `/api/health` محتاجة header اسمه `x-api-key` (الفرونت بيضيفه من السيرفر، مش من المتصفح).
- على Vercel، لو `API_ACCESS_KEY` مش متظبط الـ API بيرد **503** على كل شيء بدل ما يفتح للكل.
- تغيير المفتاح: غيّره في **المشروعين** بنفس القيمة وأعد النشر.

## حدود وملاحظات
- أقصى مدة للطلب 60 ثانية (مظبوطة في `scripts/build-vercel-api.mjs`). لو خطتك تسمح بأقل، قلّلها.
- أول طلب بعد فترة سكون أبطأ شوية (cold start + اتصال MongoDB).
- كل تغيير في متغيرات البيئة يحتاج **Redeploy**.

## حل المشاكل

| العَرَض | السبب والحل |
| --- | --- |
| `/api/health` بيرد 500 *"failed to start"* | `MONGODB_URI` غلط أو Atlas Network Access مش مسموح. شوف Vercel ← Logs |
| 503 *"not configured"* | `API_ACCESS_KEY` ناقص في المشروع |
| 401 من الفرونت | `API_ACCESS_KEY` مش متطابق بين الباك والفرونت |
| 503 *"database is not connected"* | Atlas مش متاح لحظيًا أو الـ IP محجوب، جرّب تاني |
| Vercel مش شايف الـ Function | تأكد من Build Command = `npm run build`، أو استخدم الـ CLI تحت |

## طريقة بديلة (Vercel CLI)
```bash
npm i -g vercel
vercel link                 # اربط/أنشئ المشروع
vercel env add MONGODB_URI production      # وكذلك API_ACCESS_KEY ...
npm run build               # بيكتب .vercel/output
vercel deploy --prebuilt --prod
```

## التشغيل المحلي
```bash
cp .env.example .env.local     # حط MONGODB_URI
npm run dev                    # http://localhost:4000
```
ثم شغّل الفرونت من الـ repo الخاص به (`npm run dev` على المنفذ 3000).
