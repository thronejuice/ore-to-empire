# Ore to Empire v0.3.0

**[0.3.0] - 2026-10-05 · เฟส 4**

### เพิ่มใหม่
- บัญชีผู้เล่นผ่าน Supabase: เล่นแบบไม่มีบัญชีได้ แล้วค่อยผูกด้วยอีเมล, Google หรือ LINE
- Cloud save ทุก 30 วินาที และให้เลือกเมื่อเครื่องกับคลาวด์มีเซฟคนละชุด
- รายได้ออฟไลน์ของผู้เล่นที่ล็อกอินคิดตามนาฬิกาเซิร์ฟเวอร์
- ร้านเพชรผ่าน Omise (PromptPay, บัตร, TrueMoney) เพชรเข้าผ่าน webhook เท่านั้น
- ฐานข้อมูล, edge functions และคู่มือตั้งค่าภาษาไทย `docs/SETUP-PHASE4.md`

### หมายเหตุ
- ระบบออนไลน์เปิดเมื่อใส่ค่าใน `.env` เท่านั้น ถ้าไม่ใส่ เกมเล่นแบบออฟไลน์ตามเดิม

---

## ไฟล์ในโฟลเดอร์นี้

- `index.html` — เปิดด้วยเบราว์เซอร์เพื่อเล่นเวอร์ชันนี้ได้ทันที (เซฟแยกจากเวอร์ชันอื่น)
- `update-from-v0.2.0.patch` — โค้ดที่เปลี่ยนจาก v0.2.0

## อัปเดตโค้ดจาก v0.2.0 เป็น v0.3.0

ถ้าโฟลเดอร์โปรเจกต์มีประวัติ git (มาจาก zip ชุดนี้):

```bash
git checkout v0.3.0
npm install
```

ถ้าโฟลเดอร์เป็นโค้ด v0.2.0 แบบไม่มี git:

```bash
git apply releases/v0.3.0/update-from-v0.2.0.patch
npm install
```

## ไฟล์ที่เปลี่ยน

```
.env.example                                |   8 +
 .gitignore                                  |   4 +
 README.md                                   |  81 +++++------
 docs/SETUP-PHASE4.md                        | 175 ++++++++++++++++++++++
 package-lock.json                           | 113 ++++++++++++++-
 package.json                                |   1 +
 public/line-callback.html                   |  23 +++
 src/game.ts                                 |  30 +++-
 src/i18n/en.ts                              |  41 ++++++
 src/i18n/th.ts                              |  41 ++++++
 src/online/config.ts                        |  33 +++++
 src/online/omise.ts                         |  62 ++++++++
 src/online/online.ts                        | 379 ++++++++++++++++++++++++++++++++++++++++++++++++
 src/ui/App.tsx                              |  15 +-
 src/ui/OnlinePanels.tsx                     | 212 +++++++++++++++++++++++++++
 src/ui/ShopPanel.tsx                        |   2 +
 src/ui/nav.tsx                              |   2 +
 src/ui/styles.css                           | 151 +++++++++++++++++++
 src/vite-env.d.ts                           |  12 ++
 supabase/functions/_shared/packs.ts         |  17 +++
 supabase/functions/_shared/util.ts          |  52 +++++++
 supabase/functions/create-charge/index.ts   |  87 +++++++++++
 supabase/functions/line-auth/index.ts       |  75 ++++++++++
 supabase/functions/omise-webhook/index.ts   |  46 ++++++
 supabase/migrations/20261006000000_init.sql | 215 +++++++++++++++++++++++++++
 tests/prices.test.ts                        |  25 ++++
 26 files changed, 1852 insertions(+), 50 deletions(-)
```
