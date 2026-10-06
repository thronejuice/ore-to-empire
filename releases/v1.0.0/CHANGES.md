# Ore to Empire v1.0.0

**[1.0.0] - 2026-10-06**

เวอร์ชันแรกที่พร้อมเปิดให้เล่น (v0.1.0–v0.7.1 คือช่วงพัฒนา)

### เพิ่มใหม่
- **ตั้งชื่อผู้เล่นก่อนเข้าเกม** ชื่อห้ามซ้ำ (ไม่สนตัวพิมพ์เล็ก/ใหญ่) ใช้ภาษาไทย อังกฤษ ตัวเลข และ `_` ได้ 3–16 ตัว ตรวจชื่อว่างทันทีขณะพิมพ์
- **ไม่ต้องล็อกอินอีก:** ระบบสร้างบัญชีพร้อมรหัสผ่านสุ่มและเก็บไว้ในเครื่องผู้เล่น เปิดเกมครั้งต่อไปเข้าสู่ระบบเอง
- **รหัสกู้คืน** `ORE-XXXX-XXXX-XXXX-XXXX` แสดงครั้งเดียวหลังสร้างบัญชี (ปุ่มคัดลอก และต้องติ๊ก "เก็บแล้ว" ก่อนเล่น) ใช้กู้บัญชีบนเครื่องใหม่ผ่านปุ่ม "มีบัญชีอยู่แล้ว"
- หน้า **บัญชี**: แสดงชื่อ, รหัสกู้คืน (ซ่อนตรงกลาง กดแสดง/คัดลอกได้), สร้างรหัสใหม่, ผูกอีเมล/Google/LINE เป็นช่องทางสำรอง
- ไม่มีเน็ตตอนเปิดครั้งแรก: เล่นไปก่อนได้ บัญชีถูกสร้างอัตโนมัติเมื่อออนไลน์ (ถ้าชื่อถูกใช้ไปแล้ว ระบบขอให้ตั้งใหม่ โรงงานไม่หาย)
- ผู้เล่นเดิมที่เข้าด้วยอีเมล/Google/LINE ถูกขอให้ตั้งชื่อครั้งเดียว
- เวอร์ชันไม่มีเซิร์ฟเวอร์ (ไฟล์เดียว) ก็ถามชื่อก่อนเล่น เก็บชื่อไว้ในเซฟของเครื่อง

### ความปลอดภัย
- เก็บรหัสกู้คืนเป็น bcrypt hash · ใส่ผิด 5 ครั้งล็อก 15 นาที · ตอบเหมือนกันทั้งชื่อผิดและรหัสผิด
- จำกัดการสร้างบัญชี 5 บัญชี/ชั่วโมง/IP · รองรับ Cloudflare Turnstile (ไม่บังคับ)
- กู้บัญชีแล้วรหัสบนเครื่องเก่าใช้ไม่ได้ เครื่องเก่าจะแจ้งให้ใส่รหัสกู้คืน
- ออกจากระบบ = ลบรหัสบนเครื่องนี้ (ต้องกดยืนยันสองครั้ง)

### เซิร์ฟเวอร์ (ต้องทำเพิ่มถ้าใช้ระบบออนไลน์)
- migration ใหม่ `20261006020000_player_names.sql` → `supabase db push`
- edge function ใหม่ `player-account` → `supabase functions deploy player-account --no-verify-jwt`
- `line-auth` อัปเดต (ผูก LINE เข้าบัญชีเดิม) → deploy ใหม่
- ตั้งค่า Supabase ตาม `docs/SETUP-PHASE4.md` ข้อ 2 (Allow manual linking, ปิด Secure email change)

### เซฟ
- ใช้เซฟเดิมได้ เพิ่มช่อง `player` (ชื่อ) แบบไม่บังคับ ไม่เปลี่ยนเลขรูปแบบเซฟ

---

## ไฟล์ในโฟลเดอร์นี้

- `index.html` — เปิดด้วยเบราว์เซอร์เพื่อเล่นเวอร์ชันนี้ได้ทันที (เซฟแยกจากเวอร์ชันอื่น)
- `update-from-v0.7.1.patch` — โค้ดที่เปลี่ยนจาก v0.7.1

## อัปเดตโค้ดจาก v0.7.1 เป็น v1.0.0

ถ้าโฟลเดอร์โปรเจกต์มีประวัติ git (มาจาก zip ชุดนี้):

```bash
git checkout v1.0.0
npm install
```

ถ้าโฟลเดอร์เป็นโค้ด v0.7.1 แบบไม่มี git:

```bash
git apply releases/v1.0.0/update-from-v0.7.1.patch
npm install
```

## ไฟล์ที่เปลี่ยน

```
.env.example                                        |   3 +
 CHANGELOG.md                                        |  29 ++++
 README.md                                           |  20 ++-
 docs/SETUP-PHASE4.md                                |  24 ++-
 package.json                                        |   2 +-
 scripts/release.mjs                                 |   2 +
 src/core/player.ts                                  |  34 ++++
 src/core/prestige.ts                                |   1 +
 src/core/types.ts                                   |   2 +
 src/game.ts                                         |   7 +
 src/i18n/en.ts                                      |  58 +++++++
 src/i18n/th.ts                                      |  58 +++++++
 src/online/config.ts                                |   4 +-
 src/online/device.ts                                |  41 +++++
 src/online/errors.ts                                |   5 +
 src/online/online.ts                                | 246 +++++++++++++++++++++++++--
 src/online/turnstile.ts                             |  41 +++++
 src/ui/App.tsx                                      |   2 +
 src/ui/Onboarding.tsx                               | 368 ++++++++++++++++++++++++++++++++++++++++
 src/ui/OnlinePanels.tsx                             |  93 +++++++++-
 src/ui/Panels.tsx                                   |   4 +-
 src/ui/styles.css                                   | 133 +++++++++++++++
 src/vite-env.d.ts                                   |   1 +
 supabase/functions/line-auth/index.ts               |  53 ++++--
 supabase/functions/player-account/index.ts          | 120 +++++++++++++
 supabase/migrations/20261006020000_player_names.sql | 144 ++++++++++++++++
 tests/player.test.ts                                |  40 +++++
 27 files changed, 1495 insertions(+), 40 deletions(-)
```
