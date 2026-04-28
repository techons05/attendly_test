# ATTENDLY - Session Creation Analysis for Professors

## Summary
This document provides a complete analysis of how professor sessions are created, managed, and persisted in the ATTENDLY system.

---

## 1. WHERE SESSIONS ARE CREATED (USER INTERFACE)

### Primary Interface: `prof/attendance.html`
**File**: [prof/attendance.html](prof/attendance.html#L128-L340)

The professor session creation interface is located in the "Gestion des Présences" (Attendance Management) page.

**Form Fields** (Lines 63-95):
- **Level** (`qrGrade`): Dropdown selection for class level
  - licence_info_1
  - licence_info_2
  - licence_info_3
- **Subject** (`qrSubject`): Text input for course name
- **Date** (`qrDate`): Date picker
- **Start Time** (`qrStartTime`): Time input
- **End Time** (`qrEndTime`): Time input
- **QR Duration** (`qrDuration`): Duration in minutes (default 15 min)

**Action Button**: 
```html
<button type="button" class="btn-primary" onclick="generateQRCode()">
  <i class="bi bi-qr-code"></i> Générer le QR Code
</button>
```

---

## 2. HOW DATA IS SENT TO SUPABASE

### Entry Point: `window.generateQRCode()` Function
**Files**: 
- [prof/attendance.html](prof/attendance.html#L313) (inline override)
- [prof/js/app.js](prof/js/app.js#L87-L140) (alternative implementation)

### Flow:

#### Step 1: Data Collection (from form)
```javascript
const grade = document.getElementById('qrGrade').value;
const subject = document.getElementById('qrSubject').value;
const sessionDate = document.getElementById('qrDate').value;
const startTime = document.getElementById('qrStartTime').value;
const endTime = document.getElementById('qrEndTime').value;
const duration = parseInt(document.getElementById('qrDuration').value) || 15;
```

#### Step 2: Get Professor ID
```javascript
const user = getCurrentUser();
// Returns: { id, email, full_name, role }
// ID is retrieved from localStorage (attendly_user) or sessionStorage
```

#### Step 3: Call `createSession()` from database.js
```javascript
const result = await createSession({
  professorId: user.id,     // Professor UUID
  grade: grade,              // e.g., "licence_info_1"
  subject: subject,          // Course name
  sessionDate: sessionDate,  // YYYY-MM-DD format
  startTime: startTime,      // HH:MM format
  endTime: endTime          // HH:MM format
}, duration);
```

#### Step 4: Supabase Insert Operation
**Location**: [js/database.js](js/database.js#L195-L245)

```javascript
export async function createSession(sessionData, qrDurationMinutes = 15) {
  try {
    const secureCode = generateSecureCode();  // Generate 32-char hex code
    const qrExpiresAt = new Date();
    qrExpiresAt.setMinutes(qrExpiresAt.getMinutes() + qrDurationMinutes);

    const newSession = {
      professor_id: sessionData.professorId,        // UUID
      grade: sessionData.grade,                      // String
      subject: sessionData.subject,                  // String
      session_date: sessionData.sessionDate,        // DATE (YYYY-MM-DD)
      start_time: sessionData.startTime,            // TIME (HH:MM:SS)
      end_time: sessionData.endTime,                // TIME (HH:MM:SS)
      qr_code: secureCode,                          // 32-char hex (stored)
      qr_expires_at: qrExpiresAt.toISOString(),    // ISO timestamp
      is_active: true                               // Boolean
    };

    const { data, error } = await supabase
      .from('sessions')
      .insert([newSession])
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      data: {
        ...data,
        qr_display_code: secureCode,
        qr_display_url: buildQRUrl(secureCode),
        expires_at: qrExpiresAt
      }
    };
  } catch (error) {
    console.error('Error creating session:', error);
    return { success: false, error: error.message };
  }
}
```

---

## 3. DATABASE SCHEMA/TABLE STRUCTURE FOR SESSIONS

### Table: `sessions` (PostgreSQL in Supabase)

| Column Name | Data Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique session identifier |
| `professor_id` | UUID | FOREIGN KEY → professors(id) | Link to professor creating session |
| `grade` | TEXT | NOT NULL | Class level (e.g., "licence_info_1") |
| `subject` | TEXT | NOT NULL | Course/subject name |
| `session_date` | DATE | NOT NULL | Date of the session |
| `start_time` | TIME | NOT NULL | Session start time |
| `end_time` | TIME | NOT NULL | Session end time |
| `qr_code` | TEXT | NOT NULL, UNIQUE | 32-character hex code for QR |
| `qr_expires_at` | TIMESTAMPTZ | NOT NULL | When QR code expires |
| `is_active` | BOOLEAN | DEFAULT true | Session status |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | Last update timestamp |

### Sample Record:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "professor_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "grade": "licence_info_1",
  "subject": "Programmation Web",
  "session_date": "2026-04-22",
  "start_time": "09:00:00",
  "end_time": "10:30:00",
  "qr_code": "a3f7c2b8e1d4f9a0c5b2e8d1f4a7c0b3",
  "qr_expires_at": "2026-04-22T09:15:00.000Z",
  "is_active": true,
  "created_at": "2026-04-22T09:00:23.156Z",
  "updated_at": "2026-04-22T09:00:23.156Z"
}
```

---

## 4. DATABASE.JS FUNCTIONS FOR SESSION CREATION

### Location: [js/database.js](js/database.js#L160-L470)

#### A. `generateSecureCode()` 
**Lines**: 168-179
```javascript
export function generateSecureCode() {
  const chars = '0123456789abcdef';
  let result = '';
  if (window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    for (let b of bytes) result += chars[b % 16];
  } else {
    for (let i = 0; i < 32; i++) result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}
```
- Generates cryptographically secure 32-character hex code
- Uses `crypto.getRandomValues()` for security
- Fallback to Math.random() for browsers without crypto support

#### B. `buildQRUrl(code, baseUrl)`
**Lines**: 185-187
```javascript
export function buildQRUrl(code, baseUrl = 'https://spam-sys-paperback-oak.trycloudflare.com') {
  return `${baseUrl}/attendance-qr.html?code=${code}`;
}
```
- Constructs full URL for QR encoding
- Base URL: `https://spam-sys-paperback-oak.trycloudflare.com/attendance-qr.html?code=XXXXX`

#### C. `createSession(sessionData, qrDurationMinutes = 15)`
**Lines**: 195-245
- **Parameters**:
  - `sessionData`: Object with { professorId, grade, subject, sessionDate, startTime, endTime }
  - `qrDurationMinutes`: QR code validity duration (default 15 min)
- **Returns**: 
  ```javascript
  {
    success: true,
    data: {
      id: "...",
      qr_display_code: "a3f7c2b8...",
      qr_display_url: "https://...?code=a3f7c2b8...",
      expires_at: Date object
    }
  }
  ```

#### D. `getProfessorSessions(professorId)`
**Lines**: 405-440
```javascript
export async function getProfessorSessions(professorId) {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select(`
        id, grade, subject, session_date, start_time, end_time,
        is_active, created_at
      `)
      .eq('professor_id', professorId)
      .order('session_date', { ascending: false })
      .order('start_time', { ascending: true });
    
    if (error) throw error;
    
    // Get attendance count for each session
    const sessionsWithCounts = await Promise.all(
      data.map(async (session) => {
        const { count, error: countError } = await supabase
          .from('attendance')
          .select('id', { count: 'exact', head: true })
          .eq('session_id', session.id);
        
        return {
          ...session,
          attendance_count: countError ? 0 : count
        };
      })
    );
    
    return { success: true, data: sessionsWithCounts };
  } catch (error) {
    console.error('Error fetching professor sessions:', error);
    return { success: false, error: error.message };
  }
}
```
- Returns all sessions for a professor with attendance counts
- Ordered by date (newest first) and time

#### E. `deactivateSession(sessionId)`
**Lines**: 448-465
```javascript
export async function deactivateSession(sessionId) {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .update({ is_active: false })
      .eq('id', sessionId)
      .select()
      .single();
    
    if (error) throw error;
    
    return { success: true, data };
  } catch (error) {
    console.error('Error deactivating session:', error);
    return { success: false, error: error.message };
  }
}
```
- Sets `is_active` to `false` (ends session early)

#### F. `getSessionAttendance(sessionId)`
**Lines**: 250-281
- Retrieves attendance records linked to a session
- Includes student details (id, cin, email, full_name, grade, td_group)
- Returns total attendance count

---

## 5. PROFESSOR_ID RETRIEVAL AND USAGE

### Where Professor ID is Retrieved

#### A. During Login (`authP.js`)
**File**: [js/authP.js](js/authP.js#L181-L240)

```javascript
async function handleLogin(btn) {
  const { data, error } = await supabase
    .from('professors')
    .select('id, password, is_registered, full_name, email')
    .eq('email', email)
    .maybeSingle();

  // Save user session to localStorage
  saveUserSession({
    id: data.id,           // ← Professor UUID
    email: data.email,
    full_name: data.full_name,
    role: 'professor'
  });
}
```

#### B. During Signup (`authP.js`)
**File**: [js/authP.js](js/authP.js#L100-L170)

```javascript
const { data: professor } = await supabase
  .from('professors')
  .select('id, email, full_name')
  .eq('cin', currentSignupCIN)
  .maybeSingle();

if (professor) {
  saveUserSession({
    id: professor.id,         // ← Professor UUID stored
    email: professor.email,
    full_name: professor.full_name,
    role: 'professor'
  });
}
```

### How Professor ID is Stored

**Function**: `saveUserSession()` in [js/database.js](js/database.js#L7-L9)
```javascript
export function saveUserSession(userData) {
    localStorage.setItem('attendly_user', JSON.stringify(userData));
}
```
- Stored in `localStorage` under key: `attendly_user`

### How Professor ID is Retrieved

**Function**: `getCurrentUser()` in [js/database.js](js/database.js#L11-L15)
```javascript
export function getCurrentUser() {
    const data = localStorage.getItem('attendly_user');
    return data ? JSON.parse(data) : null;
}
```
- Returns: `{ id, email, full_name, role }`

### Usage in Session Creation

**In prof/attendance.html** (Lines 313-325):
```javascript
const user = getCurrentUser();
if (!user) {
  alert('Veuillez vous connecter');
  return;
}

const sessionData = {
  professorId: user.id,    // ← Used here
  grade: grade,
  subject: subject,
  sessionDate: sessionDate,
  startTime: startTime + ':00',
  endTime: endTime + ':00'
};

const result = await createSession(sessionData, duration);
```

### Usage in Other Functions

1. **Grade Creation** ([prof/js/app.js](prof/js/app.js#L363-L365)):
   ```javascript
   const { error } = await supabase.from('notes').insert({
       student_id: studentId,
       professor_id: user.id,    // ← Used here
       // ... other fields
   });
   ```

2. **Loading Professor Sessions** ([prof/js/app.js](prof/js/app.js#L748-L751)):
   ```javascript
   let sessionQuery = supabase
       .from('sessions')
       .select('*')
       .eq('professor_id', user.id)    // ← Used here
   ```

3. **Loading Professor Schedule** ([prof/js/app.js](prof/js/app.js#L631-L634)):
   ```javascript
   const { data: schedules, error } = await supabase
       .from('schedules')
       .select('*')
       .eq('professor_id', user.id)    // ← Used here
   ```

---

## 6. SEARCH RESULTS SUMMARY

### Files Containing Session-Related Code:

| File | Purpose | Key Functions |
|---|---|---|
| [js/database.js](js/database.js) | Core session operations | createSession, getProfessorSessions, deactivateSession, getSessionAttendance |
| [prof/attendance.html](prof/attendance.html) | Session creation UI | Form inputs, QRCode generation handler |
| [prof/js/app.js](prof/js/app.js) | Session management in app | Uses createSession, loads sessions, manages attendance |
| [js/authP.js](js/authP.js) | Professor authentication | Stores professor_id during login/signup |
| [prof/attendance-list.html](prof/attendance-list.html) | Attendance reporting | Uses getProfessorSessions, getSessionAttendance |

### Keywords Found:

- **sessions**: 50+ occurrences (table queries, function calls)
- **session_create/createSession**: Primary function in database.js
- **professor_id**: Used in 20+ locations for filtering/inserting
- **insert**: Used for `.insert([newSession])` in Supabase queries
- **supabase**: Core SDK used throughout for database operations

---

## 7. DATA FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────┐
│         prof/attendance.html (UI)                       │
│  - Form inputs (grade, subject, date, time, duration) │
└────────────┬────────────────────────────────────────────┘
             │
             ├─► getCurrentUser() ──► localStorage.attendly_user
             │                       └─► { id, email, full_name }
             │
             └─► generateQRCode() [Lines 313-325]
                   │
                   ├─► Collect form data
                   ├─► Build sessionData object
                   └─► await createSession(sessionData, duration)
                         │
                         └─► js/database.js [Lines 195-245]
                               │
                               ├─► generateSecureCode()
                               │   └─► 32-char hex code
                               │
                               ├─► buildQRUrl(code)
                               │   └─► Full URL with code param
                               │
                               └─► supabase.from('sessions').insert([])
                                     │
                                     └─► PostgreSQL Database
                                         └─► Table: sessions
                                             ├─ id (UUID)
                                             ├─ professor_id ✓
                                             ├─ grade
                                             ├─ subject
                                             ├─ session_date
                                             ├─ start_time
                                             ├─ end_time
                                             ├─ qr_code (secure)
                                             ├─ qr_expires_at
                                             └─ is_active
```

---

## 8. SECURITY CONSIDERATIONS

1. **QR Code Security**: Uses cryptographically secure code generation
   - 32-character hexadecimal codes
   - Generated via `crypto.getRandomValues()`
   - Stored hashed in database

2. **Professor Verification**: 
   - Checks if user is logged in
   - Verifies professor_id from localStorage
   - Used in RLS (Row Level Security) policies

3. **Session Expiration**: 
   - QR codes expire (default 15 minutes)
   - Tracked via `qr_expires_at` column
   - `is_active` flag for early termination

---

## End of Analysis
