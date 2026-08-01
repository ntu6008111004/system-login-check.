# คู่มือการติดตั้งระบบ WorkLogs (ฉบับแยก Frontend/Backend)

ระบบเวอร์ชันนี้แยกงานกันทำ: 
1. **🚀 Frontend:** รันบน GitHub Pages (หรือ Hosting อะไรก็ได้)
2. **⚙️ Backend:** รันบน Google Apps Script ในฐานะ API

## 1. วิธีตั้งค่า Backend (Google Apps Script API)
1. เปิด Google Sheet และไปที่ `ส่วนขยาย` > `Apps Script`
2. ลบโค้ดเดิมใน `Code.gs` และนำโค้ดจากไฟล์ **`apps-script.gs`** ในโปรเจ็กต์นี้ไปวาง
3. เปลี่ยน `YOUR_SPREADSHEET_ID_HERE` ให้เป็น ID ของ Sheet คุณ
4. **สำคัญมาก:** กด `ทำให้ใช้งานได้ (Deploy)` > `การทำให้ใช้งานได้รายการใหม่`
5. เลือกประเภทเป็น **`เว็บแอป` (Web App)**
6. ตั้งค่าการเข้าถึงเป็น **`ทุกคน` (Anyone)**
7. คัดลอก **URL ของเว็บแอป** ที่ได้มาไปใส่ในไฟล์ `app.js` ของฝั่ง Frontend

## 2. วิธีตั้งค่า Frontend (GitHub Pages)
1. เปิดไฟล์ **`app.js`**
2. ค้นหาตัวแปร `const API_URL = '...'` และนำ URL ที่ได้จากข้อ 1 มาใส่แทนที่
3. อัปโหลดไฟล์ทั้งหมด (`index.html`, `style.css`, `app.js`) ขึ้นไปที่ GitHub Repository ของคุณ
4. ไปที่ `Settings` > `Pages`
5. เลือก Branch `main` และโฟลเดอร์ `/ (root)` แล้วกดเซฟ
6. รอสักครู่ คุณจะได้ลิงก์เว็บไซต์ (เช่น `https://username.github.io/repo-name/`) เพื่อใช้งานได้ทันที

## 3. การแก้ไขเรื่อง CORS (กรณีมีปัญหา)
หาก Browser แจ้งเตือนเรื่อง CORS ในหน้า Console:
- ตรวจสอบว่าใน Apps Script ตั้งค่าเป็น `Anyone` (ทุกคน) แล้วหรือยัง
- ตรวจสอบว่า `doPost(e)` รับค่าเป็น `ContentService.createTextOutput` และคืนค่า JSON ถูกต้องตาม `apps-script.gs` หรือไม่
- หากยังติดอยู่ ให้ลองใช้งานผ่าน Chrome Extension "Allow CORS" หรือเรียกผ่าน Proxy ชั่วคราว (แต่ปกติ Google Apps Script Web App จะยอมให้ข้ามโดเมนได้หากตั้งค่า Anyone ถูกต้อง)

---
จัดทำโดย Antigravity 👸✨
🏆 Production-Ready Attendance System

## Performance Edition 1.3.1

เวอร์ชันนี้ปรับเส้นทางที่ใช้งานบ่อยให้เร็วขึ้นทั้งหน้าเว็บและ Google Apps Script:

- หน้าแอดมินใช้ server-side filter/pagination และรับข้อมูลครั้งละ 10 รายการ แทนการโหลด Attendance ทั้งชีตพร้อมรูปทั้งหมด
- รูปยืนยันตัวตนโหลดเฉพาะเมื่อผู้ใช้กดเปิดรูป จึงไม่ส่ง Base64 มากับทุกแถวของรายงาน
- มี application index สำหรับค้นหาแถวผู้ใช้จาก `id` และ `username` โดยตรง
- ใช้ CacheService + versioned cache invalidation สำหรับผู้ใช้ สาขา ประวัติ และ query รายงาน
- หน้าเว็บใช้ memory/local cache แบบ stale-while-revalidate และรวม request ที่ซ้ำกัน
- โหลด MediaPipe, Leaflet และ XLSX เฉพาะหน้าหรือเวลาที่ต้องใช้
- Tailwind ถูก compile เป็น `tailwind.min.css` แล้ว จึงไม่ต้องประมวลผล Tailwind CDN ใน browser
- CRUD อัปเดตเฉพาะรายการบนหน้าจอ ไม่ดึงตารางผู้ใช้และ Attendance ใหม่ทั้งชุด

หลังแก้ `apps-script.gs` ต้อง Deploy เป็น Web App เวอร์ชันใหม่ก่อน แล้วจึงเผยแพร่ไฟล์ frontend ทั้งหมดบน GitHub Pages โดยเฉพาะ `tailwind.min.css`.

หากแก้ class ของ Tailwind ในอนาคต ให้ build CSS ใหม่ด้วยคำสั่ง:

```powershell
npx.cmd --yes tailwindcss@3.4.17 -c tailwind.config.js -i tailwind.input.css -o tailwind.min.css --minify
```
