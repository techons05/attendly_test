import supabase from './supabase-client.js';

export async function hashPassword(pwd) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pwd));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function formatDate(date) {
  return date ? new Date(date).toLocaleDateString('fr-FR') : '—';
}

export function formatTime(time) {
  return time ? time.slice(0, 5) : '—';
}

export function calculateAverage(notes) {
  if (!notes?.length) return 0;
  return (notes.reduce((s, n) => s + (n.note / n.max_note * 20), 0) / notes.length).toFixed(2);
}

export async function changeStudentPassword(id, current, newPwd) {
  const { data } = await supabase.from('students').select('password').eq('id', id).single();
  if (data?.password !== current) throw new Error('Current password incorrect');
  await supabase.from('students').update({ password: newPwd }).eq('id', id);
}

export function saveUserSession(userData) {}
export function getCurrentUser() {}
export function logout() {}
export async function getStudentProfile(studentId) {}
export async function getStudentSchedule(grade, tdGroup) {}
export async function markAttendance(studentId, qrCode) {}
export async function getStudentNotes(studentId) {}
export async function getAllNotesForClass(grade) {}
export async function getStudentNotifications(studentId) {}
export async function getProfessorProfile(professorId) {}
export async function createSession(sessionData) {}
export function generateQRCode(professorId, subject, grade) {}
export async function getSessionAttendance(sessionId) {}
export async function addNote(noteData) {}