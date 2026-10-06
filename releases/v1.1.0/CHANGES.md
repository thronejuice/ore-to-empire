# Ore to Empire v1.1.0

**[1.1.0] - 2026-10-06**

### เพิ่มใหม่
- **หน้าแนะนำวิธีเล่น (intro popup) 4 หน้า** สำหรับผู้เล่นใหม่: เป้าหมายของเกม · ขุดแร่และต่อสายพาน · แปรรูปและขยายกิจการ · ทำตามการ์ดภารกิจ แต่ละหน้ามีไอคอนจากในเกมเรียงเป็นแถว
  - ขึ้นครั้งเดียวหลังตั้งชื่อผู้เล่น (ไม่ทับหน้าตั้งชื่อ หน้ารายได้ตอนออฟไลน์ หรือหน้าเลือกเซฟ)
  - ปุ่ม "ข้าม" ทุกหน้า · ปัดซ้าย/ขวาบนมือถือ · ปุ่มลูกศรบนคีย์บอร์ด · กดนอกกล่องไม่ปิด
  - ผู้เล่นเดิมไม่เห็น และไม่ขึ้นซ้ำหลังขายกิจการ
- **ตั้งค่า → วิธีเล่น → "ดูอีกครั้ง"** เปิดหน้าแนะนำซ้ำได้ทุกเมื่อ
- **หน้าต่าง "มีอะไรใหม่"** แจ้งรายละเอียดอัปเดตให้ผู้เล่นเดิมครั้งเดียวหลังเกมอัปเดตเวอร์ชัน

### เซฟ
- ใช้เซฟเดิมได้ เพิ่มช่อง `quests.introSeen` และ `settings.seenVersion` แบบไม่บังคับ ไม่เปลี่ยนเลขรูปแบบเซฟ

---

## ไฟล์ในโฟลเดอร์นี้

- `index.html` — เปิดด้วยเบราว์เซอร์เพื่อเล่นเวอร์ชันนี้ได้ทันที (เซฟแยกจากเวอร์ชันอื่น)
- `update-from-v1.0.0.patch` — โค้ดที่เปลี่ยนจาก v1.0.0

## อัปเดตโค้ดจาก v1.0.0 เป็น v1.1.0

ถ้าโฟลเดอร์โปรเจกต์มีประวัติ git (มาจาก zip ชุดนี้):

```bash
git checkout v1.1.0
npm install
```

ถ้าโฟลเดอร์เป็นโค้ด v1.0.0 แบบไม่มี git:

```bash
git apply releases/v1.1.0/update-from-v1.0.0.patch
npm install
```

## ไฟล์ที่เปลี่ยน

```
.env.example:Zone.Identifier                                    | Bin 0 -> 93 bytes
 .gitattributes:Zone.Identifier                                  | Bin 0 -> 93 bytes
 .gitignore:Zone.Identifier                                      | Bin 0 -> 93 bytes
 CHANGELOG.md                                                    |  13 +++
 CHANGELOG.md:Zone.Identifier                                    | Bin 0 -> 93 bytes
 README.md                                                       |   2 +-
 README.md:Zone.Identifier                                       | Bin 0 -> 93 bytes
 docs/SETUP-PHASE4.md:Zone.Identifier                            | Bin 0 -> 93 bytes
 index.html:Zone.Identifier                                      | Bin 0 -> 93 bytes
 package-lock.json                                               |   4 +-
 package-lock.json:Zone.Identifier                               | Bin 0 -> 93 bytes
 package.json                                                    |   4 +-
 package.json:Zone.Identifier                                    | Bin 0 -> 93 bytes
 public/_headers                                                 |   8 ++
 public/_redirects                                               |   1 +
 public/line-callback.html:Zone.Identifier                       | Bin 0 -> 93 bytes
 scripts/release.mjs:Zone.Identifier                             | Bin 0 -> 93 bytes
 src/audio.ts:Zone.Identifier                                    | Bin 0 -> 93 bytes
 src/config/balance.ts:Zone.Identifier                           | Bin 0 -> 93 bytes
 src/config/meta.ts:Zone.Identifier                              | Bin 0 -> 93 bytes
 src/core/actions.ts:Zone.Identifier                             | Bin 0 -> 93 bytes
 src/core/contracts.ts:Zone.Identifier                           | Bin 0 -> 93 bytes
 src/core/daily.ts:Zone.Identifier                               | Bin 0 -> 93 bytes
 src/core/economy.ts:Zone.Identifier                             | Bin 0 -> 93 bytes
 src/core/fleet.ts:Zone.Identifier                               | Bin 0 -> 93 bytes
 src/core/gems.ts:Zone.Identifier                                | Bin 0 -> 93 bytes
 src/core/land.ts:Zone.Identifier                                | Bin 0 -> 93 bytes
 src/core/market.ts:Zone.Identifier                              | Bin 0 -> 93 bytes
 src/core/offline.ts:Zone.Identifier                             | Bin 0 -> 93 bytes
 src/core/pathfind.ts:Zone.Identifier                            | Bin 0 -> 93 bytes
 src/core/player.ts:Zone.Identifier                              | Bin 0 -> 93 bytes
 src/core/prestige.ts                                            |   2 +-
 src/core/prestige.ts:Zone.Identifier                            | Bin 0 -> 93 bytes
 src/core/quests.ts:Zone.Identifier                              | Bin 0 -> 93 bytes
 src/core/research.ts:Zone.Identifier                            | Bin 0 -> 93 bytes
 src/core/save.ts:Zone.Identifier                                | Bin 0 -> 93 bytes
 src/core/sim.ts:Zone.Identifier                                 | Bin 0 -> 93 bytes
 src/core/state.ts                                               |   2 +-
 src/core/state.ts:Zone.Identifier                               | Bin 0 -> 93 bytes
 src/core/tidy.ts:Zone.Identifier                                | Bin 0 -> 93 bytes
 src/core/types.ts                                               |   6 +-
 src/core/types.ts:Zone.Identifier                               | Bin 0 -> 93 bytes
 src/core/veins.ts:Zone.Identifier                               | Bin 0 -> 93 bytes
 src/game.ts                                                     |  27 ++++++
 src/game.ts:Zone.Identifier                                     | Bin 0 -> 93 bytes
 src/i18n/en.ts                                                  |  21 +++++
 src/i18n/en.ts:Zone.Identifier                                  | Bin 0 -> 93 bytes
 src/i18n/index.ts:Zone.Identifier                               | Bin 0 -> 93 bytes
 src/i18n/th.ts                                                  |  21 +++++
 src/i18n/th.ts:Zone.Identifier                                  | Bin 0 -> 93 bytes
 src/main.tsx:Zone.Identifier                                    | Bin 0 -> 93 bytes
 src/online/config.ts:Zone.Identifier                            | Bin 0 -> 93 bytes
 src/online/device.ts:Zone.Identifier                            | Bin 0 -> 93 bytes
 src/online/errors.ts:Zone.Identifier                            | Bin 0 -> 93 bytes
 src/online/omise.ts:Zone.Identifier                             | Bin 0 -> 93 bytes
 src/online/online.ts                                            |  19 +++++
 src/online/online.ts:Zone.Identifier                            | Bin 0 -> 93 bytes
 src/online/turnstile.ts:Zone.Identifier                         | Bin 0 -> 93 bytes
 src/render/renderer.ts:Zone.Identifier                          | Bin 0 -> 93 bytes
 src/render/theme.ts:Zone.Identifier                             | Bin 0 -> 93 bytes
 src/ui/App.tsx                                                  |   4 +
 src/ui/App.tsx:Zone.Identifier                                  | Bin 0 -> 93 bytes
 src/ui/BuildDrawer.tsx:Zone.Identifier                          | Bin 0 -> 93 bytes
 src/ui/Hud.tsx                                                  |   6 ++
 src/ui/Hud.tsx:Zone.Identifier                                  | Bin 0 -> 93 bytes
 src/ui/Inspector.tsx:Zone.Identifier                            | Bin 0 -> 93 bytes
 src/ui/Intro.tsx                                                | 114 ++++++++++++++++++++++++++
 src/ui/MetaPanels.tsx:Zone.Identifier                           | Bin 0 -> 93 bytes
 src/ui/Onboarding.tsx:Zone.Identifier                           | Bin 0 -> 93 bytes
 src/ui/OnlinePanels.tsx:Zone.Identifier                         | Bin 0 -> 93 bytes
 src/ui/Panels.tsx                                               |   6 ++
 src/ui/Panels.tsx:Zone.Identifier                               | Bin 0 -> 93 bytes
 src/ui/ShopPanel.tsx:Zone.Identifier                            | Bin 0 -> 93 bytes
 src/ui/TileSheet.tsx:Zone.Identifier                            | Bin 0 -> 93 bytes
 src/ui/WhatsNew.tsx                                             |  41 ++++++++++
 src/ui/hooks.ts:Zone.Identifier                                 | Bin 0 -> 93 bytes
 src/ui/icons.tsx:Zone.Identifier                                | Bin 0 -> 93 bytes
 src/ui/nav.tsx:Zone.Identifier                                  | Bin 0 -> 93 bytes
 src/ui/styles.css                                               | 122 ++++++++++++++++++++++++++++
 src/ui/styles.css:Zone.Identifier                               | Bin 0 -> 93 bytes
 src/vite-env.d.ts:Zone.Identifier                               | Bin 0 -> 93 bytes
 supabase/functions/_shared/packs.ts:Zone.Identifier             | Bin 0 -> 93 bytes
 supabase/functions/_shared/util.ts:Zone.Identifier              | Bin 0 -> 93 bytes
 supabase/functions/create-charge/index.ts:Zone.Identifier       | Bin 0 -> 93 bytes
 supabase/functions/line-auth/index.ts                           |  11 ++-
 supabase/functions/line-auth/index.ts:Zone.Identifier           | Bin 0 -> 93 bytes
 supabase/functions/omise-webhook/index.ts:Zone.Identifier       | Bin 0 -> 93 bytes
 supabase/functions/player-account/index.ts:Zone.Identifier      | Bin 0 -> 93 bytes
 supabase/migrations/20261006000000_init.sql:Zone.Identifier     | Bin 0 -> 93 bytes
 .../migrations/20261006020000_player_names.sql:Zone.Identifier  | Bin 0 -> 93 bytes
 tests/intro.test.ts                                             |  22 +++++
 tests/move.test.ts:Zone.Identifier                              | Bin 0 -> 93 bytes
 tests/phase2.test.ts:Zone.Identifier                            | Bin 0 -> 93 bytes
 tests/player.test.ts:Zone.Identifier                            | Bin 0 -> 93 bytes
 tests/prices.test.ts:Zone.Identifier                            | Bin 0 -> 93 bytes
 tests/sim.test.ts:Zone.Identifier                               | Bin 0 -> 93 bytes
 tests/tidy.test.ts:Zone.Identifier                              | Bin 0 -> 93 bytes
 tests/veins.test.ts:Zone.Identifier                             | Bin 0 -> 93 bytes
 tsconfig.json:Zone.Identifier                                   | Bin 0 -> 93 bytes
 vite.config.ts:Zone.Identifier                                  | Bin 0 -> 93 bytes
 100 files changed, 444 insertions(+), 12 deletions(-)
```
