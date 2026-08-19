# خطة إضافة نظام المصادقة

## المتطلبات:
- إضافة جدول `users` في MySQL
- نظام تسجيل مستخدمين جديدين (Register)
- نظام تسجيل دخول (Login) باستخدام username و password
- استخدام JWT (JSON Web Token) للمصادقة
- حماية جميع الـ API endpoints (ما عدا register/login)
- تحديث Swagger لإضافة security schemes

## التغييرات المطلوبة:

### 1. إضافة Packages
- `jsonwebtoken` - لإنشاء والتحقق من JWT tokens
- `bcryptjs` - لتشفير كلمات المرور

### 2. تحديث Database Schema
- إضافة جدول `users` في `database/schema.sql`
  - id, username (unique), password (hashed), created_at, updated_at

### 3. إنشاء Models
- `models/User.js` - إدارة المستخدمين في MySQL
  - create, findByUsername, validatePassword, etc.

### 4. إنشاء Authentication Middleware
- `middleware/auth.js` - للتحقق من JWT token
  - verifyToken middleware

### 5. إنشاء Auth Routes
- `routes/auth.js` - للتسجيل وتسجيل الدخول
  - POST /api/auth/register - تسجيل مستخدم جديد
  - POST /api/auth/login - تسجيل دخول

### 6. تحديث Routes الموجودة
- إضافة auth middleware لجميع الـ routes (ما عدا auth routes)
- تحديث Swagger documentation لإضافة security

### 7. تحديث Server.js
- إضافة auth routes
- تطبيق auth middleware على جميع الـ API routes

## بنية البيانات:

```sql
users table:
- id (INT, PRIMARY KEY)
- username (VARCHAR(255), UNIQUE)
- password (VARCHAR(255), hashed)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

## API Endpoints الجديدة:

```
POST /api/auth/register
Body: { username, password }

POST /api/auth/login  
Body: { username, password }
Response: { token, user }

جميع الـ endpoints الأخرى تحتاج:
Header: Authorization: Bearer <token>
```

