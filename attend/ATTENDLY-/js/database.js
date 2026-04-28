import supabase from './supabase-client.js';

// ==========================================
// GESTION DE LA SESSION UTILISATEUR
// ==========================================

export function saveUserSession(userData) {
    localStorage.setItem('attendly_user', JSON.stringify(userData));
}

export function getCurrentUser() {
    const data = localStorage.getItem('attendly_user');
    return data ? JSON.parse(data) : null;
}

export function logout() {
    localStorage.removeItem('attendly_user');

    // Toujours rediriger vers la landing page
    const depth = window.location.pathname.split('/').filter(Boolean).length;
    const prefix = depth > 1 ? '../../' : depth === 1 ? '../' : '';
    window.location.href = prefix + 'index.html';
}

// ==========================================
// FONCTIONS POUR LES ÉTUDIANTS
// ==========================================

export async function getStudentProfile(studentId) {
    const { data, error } = await supabase
        .from('students')
        .select('*')
        .eq('id', studentId)
        .single();
    if (error) throw error;
    return data;
}

export async function getStudentSchedule(grade, tdGroup) {
    let query = supabase
        .from('schedules')
        .select('*, professors(full_name)')
        .eq('grade', grade);

    if (tdGroup) {
        query = query.or(`td_group.is.null,td_group.eq.${tdGroup}`);
    } else {
        query = query.is('td_group', null);
    }

    const { data, error } = await query.order('start_time');
    if (error) throw error;
    return data || [];
}

export async function markAttendance(studentId, qrCode) {
    const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('*')
        .eq('qr_code', qrCode)
        .eq('is_active', true)
        .single();
    if (sessionError || !session) throw new Error('Session non trouvée ou expirée');

    if (new Date(session.qr_expires_at) < new Date()) {
        throw new Error('Le code QR a expiré');
    }

    const { data: existing } = await supabase
        .from('attendance')
        .select('id')
        .eq('student_id', studentId)
        .eq('session_id', session.id)
        .maybeSingle();
    if (existing) throw new Error('Présence déjà marquée pour cette session');

    const { data, error } = await supabase
        .from('attendance')
        .insert({ student_id: studentId, session_id: session.id })
        .select()
        .single();
    if (error) throw error;
    return data;
}

export async function getStudentNotes(studentId) {
    const { data, error } = await supabase
        .from('notes')
        .select('*, professors(full_name)')
        .eq('student_id', studentId)
        .order('subject')
        .order('exam_type');
    if (error) throw error;
    return data;
}

export async function getAllNotesForClass(grade) {
    const { data, error } = await supabase
        .from('notes')
        .select('*, students(full_name)')
        .eq('grade', grade)
        .order('subject');
    if (error) throw error;
    return data;
}

export async function getStudentNotifications(studentId) {
    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
}

export async function markNotificationRead(notificationId) {
    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);
    if (error) throw error;
}

export async function changeStudentPassword(studentId, currentPasswordHash, newPasswordHash) {
    const { data, error: fetchError } = await supabase
        .from('students')
        .select('password')
        .eq('id', studentId)
        .single();
    if (fetchError) throw fetchError;
    if (data.password !== currentPasswordHash) throw new Error('Mot de passe actuel incorrect');

    const { error } = await supabase
        .from('students')
        .update({ password: newPasswordHash })
        .eq('id', studentId);
    if (error) throw error;
}

// ==========================================
// FONCTIONS POUR LES PROFESSEURS
// ==========================================

/**
 * Get professor profile by ID
 * @param {string} professorId - UUID of the professor
 * @returns {Promise<Object>} Professor profile data
 */
export async function getProfessorProfile(professorId) {
  try {
    const { data, error } = await supabase
      .from('professors')
      .select('id, cin, email, full_name, department, is_registered, created_at')
      .eq('id', professorId)
      .single();
    
    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching professor profile:', error);
    return { success: false, error: error.message };
  }
}

// ==========================================
// ✅ NOUVELLES FONCTIONS QR SÉCURISÉES (REMPLACEMENT)
// ==========================================

/**
 * Génère un code aléatoire cryptographiquement sûr (32 caractères hex)
 * Ex: a3f7c2b8e1d4f9a0c5b2e8d1f4a7c0b3
 */
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

/**
 * Construit l'URL complète à encoder dans le QR
 */
export function buildQRUrl(code, baseUrl = 'https://spam-sys-paperback-oak.trycloudflare.com') {
  return `${baseUrl}/attendance-qr.html?code=${code}`;
}

/**
 * Crée une session sécurisée dans Supabase
 */
export async function createSession(sessionData, qrDurationMinutes = 15) {
  try {
    const secureCode = generateSecureCode();
    
    //  Parse date and time components
    const [year, month, day] = sessionData.sessionDate.split('-').map(Number);
    const [hour, minute] = sessionData.startTime.split(':').map(Number);
    
    //  Create date directly in UTC (month is 0-indexed in UTC)
    const sessionDateTime = new Date(Date.UTC(year, month - 1, day, hour, minute));
    
    //  Calculate expiration using UTC methods
    const expirationTimeMs = qrDurationMinutes * 60 * 1000;
    const qrExpiresAt = new Date(sessionDateTime.getTime() + expirationTimeMs);
    
    //  Use toISOString() directly - it's already in UTC
    const qrExpiresAtIso = qrExpiresAt.toISOString();

    const newSession = {
      professor_id: sessionData.professorId,
      grade: sessionData.grade,
      subject: sessionData.subject,
      session_date: sessionData.sessionDate,
      start_time: sessionData.startTime,
      end_time: sessionData.endTime,
      qr_code: secureCode,
      qr_expires_at: qrExpiresAtIso,
      is_active: true
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
        expires_at: qrExpiresAt,
        expiration_duration_seconds: qrDurationMinutes * 60
      }
    };
  } catch (error) {
    console.error('Error creating session:', error);
    return { success: false, error: error.message };
  }
}
/**
 * Get attendance records for a specific session
 * @param {string} sessionId - UUID of the session
 * @returns {Promise<Object>} Attendance records with student details
 */
export async function getSessionAttendance(sessionId) {
  try {
    const { data, error } = await supabase
      .from('attendance')
      .select(`
        id,
        marked_at,
        students:student_id (
          id,
          cin,
          email,
          full_name,
          grade,
          td_group
        )
      `)
      .eq('session_id', sessionId);
    
    if (error) throw error;
    
    // Also get session details
    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
      .select('subject, grade, session_date, start_time, end_time')
      .eq('id', sessionId)
      .single();
    
    if (sessionError) throw sessionError;
    
    return { 
      success: true, 
      data: {
        session: sessionData,
        attendance: data,
        total_students: data.length
      }
    };
  } catch (error) {
    console.error('Error fetching session attendance:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Add a note for a student
 * @param {Object} noteData - Note data
 * @param {string} noteData.studentId - Student UUID
 * @param {string} noteData.professorId - Professor UUID
 * @param {string} noteData.grade - Grade level
 * @param {string} noteData.subject - Subject name
 * @param {string} noteData.examType - Type of exam (e.g., 'Exam', 'Quiz', 'Project')
 * @param {number} noteData.note - Grade value
 * @param {number} noteData.maxNote - Maximum possible grade (default: 20)
 * @param {string} noteData.examDate - Exam date (YYYY-MM-DD)
 * @returns {Promise<Object>} Created note
 */
export async function addNote(noteData) {
  try {
    // Validate note range
    if (noteData.note < 0 || noteData.note > noteData.maxNote) {
      throw new Error(`Note must be between 0 and ${noteData.maxNote}`);
    }
    
    // Check if student exists
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id, full_name')
      .eq('id', noteData.studentId)
      .single();
    
    if (studentError) throw new Error('Student not found');
    
    // Check if professor exists
    const { data: professor, error: professorError } = await supabase
      .from('professors')
      .select('id, full_name')
      .eq('id', noteData.professorId)
      .single();
    
    if (professorError) throw new Error('Professor not found');
    
    const newNote = {
      student_id: noteData.studentId,
      professor_id: noteData.professorId,
      grade: noteData.grade,
      subject: noteData.subject,
      exam_type: noteData.examType || 'General',
      note: noteData.note,
      max_note: noteData.maxNote || 20,
      exam_date: noteData.examDate || new Date().toISOString().split('T')[0]
    };
    
    const { data, error } = await supabase
      .from('notes')
      .insert([newNote])
      .select()
      .single();
    
    if (error) throw error;
    
    // Calculate percentage
    const percentage = (data.note / data.max_note) * 100;
    
    return { 
      success: true, 
      data: {
        ...data,
        percentage: percentage.toFixed(2) + '%',
        student_name: student.full_name,
        professor_name: professor.full_name
      }
    };
  } catch (error) {
    console.error('Error adding note:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get professor schedule by professor ID
 * @param {string} professorId - Professor UUID
 * @returns {Promise<Object>} Professor schedule data
 */
export async function getProfessorSchedule(professorId) {
  try {
    const { data, error } = await supabase
      .from('schedules')
      .select(`
        id,
        subject,
        grade,
        day_of_week,
        start_time,
        end_time,
        room,
        td_group
      `)
      .eq('professor_id', professorId)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });
    
    if (error) throw error;
    
    return { success: true, data: data || [] };
  } catch (error) {
    console.error('Error fetching professor schedule:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Additional utility function: Get all sessions for a professor
 * @param {string} professorId - Professor UUID
 * @returns {Promise<Object>} List of sessions
 */
export async function getProfessorSessions(professorId) {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select(`
        id,
        grade,
        subject,
        session_date,
        start_time,
        end_time,
        is_active,
        created_at
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

/**
 * Additional utility function: Deactivate a session (end it early)
 * @param {string} sessionId - Session UUID
 * @returns {Promise<Object>} Updated session
 */
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
// ==========================================
// FONCTIONS UTILITAIRES
// ==========================================

export function formatDate(date) {
    const d = new Date(date);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatTime(time) {
    if (!time) return '';
    return String(time).substring(0, 5);
}

export function calculateAverage(notes) {
    if (!notes || notes.length === 0) return 0;
    const sum = notes.reduce((acc, n) => acc + (n.note / n.max_note) * 20, 0);
    return (sum / notes.length).toFixed(2);
}

export async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
