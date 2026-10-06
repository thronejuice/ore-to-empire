# คู่มือตั้งค่าเฟส 4: บัญชีผู้เล่น, Cloud Save และร้านเพชร

เกมเล่นได้เต็มรูปแบบโดยไม่ต้องตั้งค่าอะไร (โหมด guest) ส่วนระบบออนไลน์จะเปิดเองเมื่อใส่ค่าในไฟล์ `.env` ครบ คู่มือนี้เรียงตามลำดับที่ควรทำ

> **สำคัญ:** หน้า artifact บน claude.ai เรียก API ภายนอกไม่ได้ ระบบออนไลน์จึงใช้ได้เฉพาะเมื่อ deploy เกมขึ้นโฮสติ้งของคุณเอง (ขั้นตอนที่ 7)

---

## สิ่งที่ต้องมี

| บัญชี | ใช้ทำอะไร | ค่าใช้จ่ายเริ่มต้น |
|---|---|---|
| [Supabase](https://supabase.com) | ฐานข้อมูล, ล็อกอิน, edge functions | ฟรี |
| [Omise / Opn Payments](https://www.omise.co/th) | รับเงิน PromptPay, บัตร, TrueMoney | ค่าธรรมเนียมต่อรายการ |
| [LINE Developers](https://developers.line.biz) | ปุ่มล็อกอินด้วย LINE | ฟรี |
| [Google Cloud Console](https://console.cloud.google.com) | ปุ่มล็อกอินด้วย Google | ฟรี |
| โฮสติ้ง (Vercel / Netlify / Cloudflare Pages) | เว็บของเกม | ฟรี |

และติดตั้งใน WSL:

```bash
npm i -g supabase        # Supabase CLI
supabase --version
```

---

## 1. สร้างโปรเจกต์ Supabase และฐานข้อมูล

1. สร้างโปรเจกต์ใหม่ที่ supabase.com (เลือก region Singapore จะเร็วสำหรับผู้เล่นไทย)
2. ใน WSL ที่โฟลเดอร์เกม:

```bash
supabase login
supabase link --project-ref <PROJECT_REF>     # ดูจาก URL ของโปรเจกต์
supabase db push                               # สร้างตารางจาก supabase/migrations/
```

ไฟล์ migration สร้างตาราง `profiles` (ยอดเพชร), `saves` (cloud save), `gem_ledger` (ประวัติเพชร), `purchases` (การซื้อ) พร้อม Row Level Security: ผู้เล่นอ่านได้เฉพาะข้อมูลตัวเอง และ**แก้ยอดเพชรเองไม่ได้** เปลี่ยนได้ผ่านฟังก์ชันฝั่งเซิร์ฟเวอร์เท่านั้น

3. คัดลอกค่าจาก **Project Settings → API** ไว้ใช้ขั้นต่อไป:
   - Project URL
   - `anon` public key
   - `service_role` key (**ห้ามใส่ในโค้ดฝั่งเว็บเด็ดขาด**)

---

## 2. ตั้งค่าการล็อกอิน (Supabase → Authentication)

**URL Configuration**
- Site URL: `https://<โดเมนของเกม>/`
- Redirect URLs: เพิ่ม `https://<โดเมนของเกม>/` และ `http://localhost:5173/` (สำหรับทดสอบ)

**อีเมล (magic link):** เปิดไว้ตั้งแต่ต้น แนะนำให้ตั้ง SMTP ของตัวเองใน Authentication → Emails เพราะ SMTP ฟรีของ Supabase ส่งได้จำนวนจำกัดต่อชั่วโมง

**ชื่อผู้เล่น + รหัสบนเครื่อง (v1.0.0, วิธีหลัก)**
- Providers → **Email** ต้องเปิดอยู่ (ระบบใช้ล็อกอินแบบอีเมล+รหัสผ่านเบื้องหลัง ผู้เล่นไม่เห็น)
- Authentication → Settings: เปิด **Allow manual linking** (ให้ผู้เล่นผูก Google เพิ่มเข้าบัญชีเดิมได้)
- Authentication → Emails / Settings: ปิด **Secure email change** เพื่อให้ผู้เล่นเพิ่มอีเมลจริงแทนอีเมลภายในได้ โดยยืนยันที่อีเมลใหม่อย่างเดียว
- บัญชีที่สร้างจากชื่อผู้เล่นใช้อีเมลภายใน `p-<uuid>@players.ore-to-empire.local` ซึ่งไม่มีการส่งเมลจริง ถ้า Supabase ไม่รับโดเมนนี้ ให้ตั้ง secret `PLAYER_EMAIL_DOMAIN` เป็นซับโดเมนของคุณเอง เช่น `players.<โดเมนของเกม>`

**Google**
1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web application)
2. Authorized redirect URI: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
3. นำ Client ID / Secret ไปใส่ใน Supabase → Authentication → Providers → Google

---

## 3. LINE Login

1. LINE Developers Console → สร้าง Provider → สร้าง channel แบบ **LINE Login**
2. แท็บ LINE Login → Callback URL: `https://<โดเมนของเกม>/line-callback.html`
   (ถ้าทดสอบในเครื่อง เพิ่ม `http://localhost:5173/line-callback.html`)
3. ถ้าต้องการอีเมลของผู้เล่น ให้ยื่นขอสิทธิ์ **Email address permission** ในแท็บ Basic settings
   (ถ้าไม่ได้สิทธิ์ ระบบยังใช้ได้ โดยสร้างอีเมลแทนที่ไม่มีการส่งจริงให้)
4. จด **Channel ID** และ **Channel secret**

ระบบทำงานผ่าน edge function `line-auth`: แลก code กับ LINE → ตรวจ ID token กับ LINE (รวม nonce) → สร้าง/หาผู้ใช้ใน Supabase → ออก token ใช้ครั้งเดียวให้เบราว์เซอร์เข้าสู่ระบบ

---

## 4. Omise

1. สมัครที่ omise.co และยืนยันตัวตน (KYC) ระหว่างรออนุมัติ ใช้ **test keys** ได้เลย
2. Dashboard → Keys: จด **Public key** (`pkey_...`) และ **Secret key** (`skey_...`)
3. เปิดใช้วิธีชำระเงิน: PromptPay และ TrueMoney Wallet (อาจต้องขอเปิดเพิ่ม)
4. ตั้ง Webhook (หลังขั้นตอนที่ 5): `https://<PROJECT_REF>.supabase.co/functions/v1/omise-webhook`

โดยทั่วไป Omise ต้องการเว็บไซต์จริงที่แสดงสินค้า ราคา นโยบายคืนเงิน และช่องทางติดต่อ ก่อนอนุมัติ live keys ให้ตรวจสอบเงื่อนไขล่าสุดกับ Omise โดยตรง

**การไหลของเงิน:** หน้าต่างชำระเงินของ Omise (OmiseCard) รับข้อมูลบัตรเอง เกมไม่เห็นเลขบัตร → ส่ง token ให้ `create-charge` สร้าง charge ด้วย secret key → **เพชรเข้าบัญชีเมื่อ webhook ยืนยันเท่านั้น** โดย webhook ดึง charge จาก Omise ใหม่ทุกครั้ง ไม่เชื่อข้อมูลที่ส่งมา และเติมเพชรได้ครั้งเดียวต่อการซื้อ

---

## 5. Deploy edge functions และใส่ secrets

```bash
supabase secrets set \
  OMISE_SECRET_KEY=skey_test_xxx \
  LINE_CHANNEL_ID=1234567890 \
  LINE_CHANNEL_SECRET=xxxxxxxx \
  SITE_URL=https://<โดเมนของเกม>/ \
  ALLOWED_ORIGIN=https://<โดเมนของเกม>

supabase functions deploy create-charge
supabase functions deploy omise-webhook --no-verify-jwt
supabase functions deploy line-auth --no-verify-jwt
supabase functions deploy player-account --no-verify-jwt
```

ตัวเลือกเพิ่มเติมของ `player-account` (ไม่ตั้งก็ได้):
- `PLAYER_EMAIL_DOMAIN` — โดเมนของอีเมลภายใน (ดูข้อ 2)
- `TURNSTILE_SECRET` — เปิดการตรวจบอทของ Cloudflare Turnstile ตอนสร้างบัญชี ต้องใส่ `VITE_TURNSTILE_SITE_KEY` ใน `.env` คู่กันด้วย

`SUPABASE_URL`, `SUPABASE_ANON_KEY` และ `SUPABASE_SERVICE_ROLE_KEY` มีให้ใน edge functions อัตโนมัติ ไม่ต้องตั้งเอง

`omise-webhook`, `line-auth` และ `player-account` ต้องใช้ `--no-verify-jwt` เพราะ Omise และหน้า callback ของ LINE ไม่มี token ของ Supabase ส่วนความปลอดภัย webhook ดึง charge จาก Omise ใหม่ทุกครั้ง และ `line-auth` ตรวจ ID token กับ LINE ทุกครั้ง

### ระบบบัญชีแบบชื่อผู้เล่น ทำงานอย่างไร (v1.0.0)

1. เปิดเกมครั้งแรก ผู้เล่นตั้งชื่อ (ห้ามซ้ำ ตรวจทันทีขณะพิมพ์) ก่อนเริ่มเล่น
2. `player-account` สร้างผู้ใช้ใน Supabase พร้อม**รหัสผ่านสุ่มยาว** และ**รหัสกู้คืน** `ORE-XXXX-XXXX-XXXX-XXXX`
3. รหัสผ่านเก็บในเครื่องผู้เล่น (`localStorage`) เปิดเกมครั้งต่อไปเข้าสู่ระบบเองโดยไม่ต้องทำอะไร
4. รหัสกู้คืนแสดงครั้งเดียว ฐานข้อมูลเก็บเฉพาะค่า hash แบบ bcrypt
5. เปลี่ยนเครื่อง: กด "มีบัญชีอยู่แล้ว" ใส่ชื่อ + รหัสกู้คืน ระบบออกรหัสผ่านใหม่ให้เครื่องนั้น (เครื่องเก่าจะถูกออกจากระบบ) หรือเข้าด้วยอีเมล/Google/LINE ที่ผูกไว้
6. กันเดารหัส: ผิด 5 ครั้งล็อก 15 นาที · สร้างบัญชีได้ไม่เกิน 5 บัญชี/ชั่วโมง/IP

ผู้เล่นเดิมที่เคยเข้าด้วยอีเมล/Google/LINE จะถูกขอให้ตั้งชื่อครั้งเดียวตอนเข้าเกม

---

## 6. ไฟล์ `.env` ของเกม

```bash
cp .env.example .env
```

| ตัวแปร | ค่า |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon public key |
| `VITE_OMISE_PUBLIC_KEY` | `pkey_...` (public เท่านั้น) |
| `VITE_LINE_CHANNEL_ID` | Channel ID ของ LINE Login |

ทดสอบในเครื่อง: `npm run dev` แล้วเปิด `http://localhost:5173` จะเห็นปุ่ม "บัญชี" และส่วน "ซื้อเพชร" ในร้านเพชร

---

## 7. Deploy เว็บ

```bash
npm run build      # ได้โฟลเดอร์ dist/
```

**Vercel / Netlify / Cloudflare Pages:** เชื่อม GitHub repo แล้วตั้ง
- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: ใส่ 4 ตัวจากขั้นตอนที่ 6

หลัง deploy ให้กลับไปอัปเดต URL ในขั้นตอนที่ 2, 3, 4 และ secret `SITE_URL` / `ALLOWED_ORIGIN` ให้ตรงกับโดเมนจริง

---

## 8. ทดสอบก่อนเปิดจริง (test mode)

- ล็อกอินด้วยอีเมล / Google / LINE แล้วเล่นต่อจากอีกเครื่อง
- ทำภารกิจรายวัน กดรับ ตรวจว่าเพชรเพิ่ม และวันเดียวกันรับได้ไม่เกิน 25 เพชร
- ซื้อเพชรด้วยบัตรทดสอบของ Omise (ดูเลขบัตรใน Omise docs → Testing) และ PromptPay ในโหมดทดสอบ (ในหน้า charge ของ Dashboard โหมดทดสอบมีปุ่มจำลองผลการชำระเงิน)
- ตรวจตาราง `purchases` (status = `paid`) และ `gem_ledger` ใน Supabase
- ส่ง webhook ซ้ำจาก Dashboard ของ Omise แล้วตรวจว่าเพชร**ไม่**เพิ่มซ้ำ

**ก่อนเปิดจริง**
- [ ] เปลี่ยนเป็น live keys ของ Omise (`OMISE_SECRET_KEY`, `VITE_OMISE_PUBLIC_KEY`)
- [ ] ตั้ง `ALLOWED_ORIGIN` เป็นโดเมนจริง (ไม่ใช้ `*`)
- [ ] มีหน้านโยบายความเป็นส่วนตัว เงื่อนไขการใช้งาน และนโยบายคืนเงิน
- [ ] ตั้ง SMTP ของตัวเองสำหรับอีเมลล็อกอิน

---

## ราคาและเพชร

ราคาแพ็กและราคาไอเท็มมี 2 ที่ ต้องแก้ให้ตรงกันทุกครั้ง:

| อะไร | ฝั่งเกม (แสดงผล) | ฝั่งเซิร์ฟเวอร์ (ตัดสินจริง) |
|---|---|---|
| แพ็กเพชร | `src/config/meta.ts` → `PACKS` | `supabase/functions/_shared/packs.ts` |
| ไอเท็มเพชร | `src/config/meta.ts` → `GEM_ITEMS` | ฟังก์ชัน `spend_gems` ใน migration |
| เพชรรายวัน | `src/config/meta.ts` → `DAILY` | ฟังก์ชัน `claim_daily_gems` |

ถ้าแก้ฝั่งเซิร์ฟเวอร์ ให้สร้างไฟล์ migration ใหม่ (`supabase migration new <ชื่อ>`) แล้ว `supabase db push`

## การกันโกง

- ยอดเพชรอยู่บนเซิร์ฟเวอร์ ผู้เล่นแก้เองไม่ได้ (RLS + ฟังก์ชัน security definer)
- ผู้เล่นที่ล็อกอิน: รายได้ออฟไลน์คำนวณจาก**นาฬิกาเซิร์ฟเวอร์** (เวลาที่บันทึกเซฟ เทียบกับเวลาปัจจุบันของเซิร์ฟเวอร์) การปรับนาฬิกาเครื่องจึงไม่มีผล
- ผู้เล่นแบบ guest: ถ้าตรวจพบว่านาฬิกาเครื่องย้อนหลัง จะไม่นับช่วงนั้น
- ผลกระทบของเพชร (บูสต์, ข้ามเวลา) ทำงานในเครื่องผู้เล่น เพราะเป็นเกมเล่นคนเดียว ส่วนการ "ใช้" เพชรตรวจที่เซิร์ฟเวอร์เสมอ
