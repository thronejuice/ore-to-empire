# Ore to Empire v1.3.2

**[1.3.2] - 2026-10-10**

### แก้ไข
- **หน้าต่าง "มีอะไรใหม่" ปุ่มถูกบัง:** เมื่อจอเล็ก รายการยาวเกินจอจนปุ่ม "รับทราบ" และ "ดูวิธีเล่น" ตกออกไปนอกกล่องและกดไม่ได้ ตอนนี้รายการเลื่อนดูได้ และปุ่มอยู่ด้านล่างเสมอ

---

## ไฟล์ในโฟลเดอร์นี้

- `index.html` — เปิดด้วยเบราว์เซอร์เพื่อเล่นเวอร์ชันนี้ได้ทันที (เซฟแยกจากเวอร์ชันอื่น)
- `update-from-v1.3.1.patch` — โค้ดที่เปลี่ยนจาก v1.3.1

## อัปเดตโค้ดจาก v1.3.1 เป็น v1.3.2

ถ้าโฟลเดอร์โปรเจกต์มีประวัติ git (มาจาก zip ชุดนี้):

```bash
git checkout v1.3.2
npm install
```

ถ้าโฟลเดอร์เป็นโค้ด v1.3.1 แบบไม่มี git:

```bash
git apply releases/v1.3.2/update-from-v1.3.1.patch
npm install
```

## ไฟล์ที่เปลี่ยน

```
CHANGELOG.md        |  5 +++++
 package-lock.json   |  4 ++--
 package.json        |  4 ++--
 src/i18n/en.ts      |  1 +
 src/i18n/th.ts      |  1 +
 src/ui/WhatsNew.tsx |  1 +
 src/ui/styles.css   |  7 +++++++
 tests/intro.test.ts | 13 +++++++------
 8 files changed, 26 insertions(+), 10 deletions(-)
```
