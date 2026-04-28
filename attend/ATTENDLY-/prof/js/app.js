import supabase from '../../js/supabase-client.js';
import { createSession, getCurrentUser } from '../../js/database.js';

// Day order for display
const daysOfWeek = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const daysOrder = { 'lundi': 1, 'mardi': 2, 'mercredi': 3, 'jeudi': 4, 'vendredi': 5, 'samedi': 6 };

// ============ UTILITIES ============
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function formatDateTime(date) {
    return date.toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatGrade(grade) {
    const gradeMap = {
        'licence_info_1': 'Licence Info 1',
        'licence_info_2': 'Licence Info 2',
        'licence_info_3': 'Licence Info 3'
    };
    return gradeMap[grade] || grade || '-';
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer') || document.body;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        border-radius: 10px;
        color: white;
        font-weight: 600;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    
    if (type === 'success') toast.style.background = '#22c55e';
    else if (type === 'error') toast.style.background = '#ef4444';
    else if (type === 'warning') toast.style.background = '#f59e0b';
    else toast.style.background = '#3b82f6';
    
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ============ SIDEBAR ============
window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    sidebar.classList.toggle('closed');
    overlay.classList.toggle('show');
};

window.logout = async function() {
    sessionStorage.removeItem('professorSession');
    localStorage.removeItem('attendly_user');
    await supabase.auth.signOut();
    showToast('Déconnexion réussie', 'success');
    setTimeout(() => { window.location.href = '../index.html'; }, 800);
};

// ============ TABS ============
window.switchTab = function(tabId, btn) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(tabId).classList.add('active');
    btn.classList.add('active');
};

// ============ QR CODE ============
window.generateQRCode = async function() {
  const grade = document.getElementById('qrGrade')?.value;
  const subject = document.getElementById('qrSubject')?.value;
  const date = document.getElementById('qrDate')?.value;
  const startTime = document.getElementById('qrStartTime')?.value;
  const endTime = document.getElementById('qrEndTime')?.value;
  const duration = parseInt(document.getElementById('qrDuration')?.value) || 15;

  if (!grade || !subject || !date || !startTime || !endTime) {
    showToast('Veuillez remplir tous les champs', 'warning');
    return;
  }

  const user = await getCurrentUser();
  if (!user) {
    showToast('Erreur: Professeur non connecté', 'error');
    return;
  }

  // Appel sécurisé à database.js
  const result = await createSession({
    professorId: user.id, grade, subject,
    sessionDate: date, startTime, endTime
  }, duration);

  if (!result.success) {
    showToast('Erreur: ' + result.error, 'error');
    return;
  }

  const session = result.data;

  // 1️⃣ Afficher le code texte
  const codeTextEl = document.getElementById('qrTextCode');
  if (codeTextEl) {
    codeTextEl.textContent = session.qr_display_code;
    codeTextEl.style.display = 'block';
  }

  // 2️⃣ Générer l'image QR
  const qrcodeDiv = document.getElementById('qrcode');
  if (qrcodeDiv) {
    qrcodeDiv.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
      new QRCode(qrcodeDiv, {
        text: session.qr_display_url, // URL complète avec ?code=XXXX
        width: 220, height: 220,
        colorDark: '#000000', colorLight: '#ffffff'
      });
    } else {
      qrcodeDiv.innerHTML = `<pre style="font-size:10px;word-break:break-all;">${session.qr_display_url}</pre>`;
    }
  }

  // 3️⃣ Date d'expiration
  const expiresEl = document.getElementById('qrExpires');
  if (expiresEl) expiresEl.textContent = `Expire le: ${formatDateTime(session.expires_at)}`;

  // 4️⃣ Afficher la section
  document.getElementById('qrDisplay')?.classList.remove('hidden');
  showToast('QR Code généré avec succès!', 'success');
};

window.downloadQR = function() {
    const canvas = document.querySelector('#qrcode canvas');
    if (canvas) {
        const link = document.createElement('a');
        link.download = `qr-code-${Date.now()}.png`;
        link.href = canvas.toDataURL();
        link.click();
    }
};

window.closeQRDisplay = function() {
    document.getElementById('qrDisplay').classList.add('hidden');
};

// ============ MANUAL ATTENDANCE ============
window.loadStudentsForAttendance = async function() {
    const sessionId = document.getElementById('manualSession').value;
    
    if (!sessionId) {
        showToast('Veuillez sélectionner une session', 'warning');
        return;
    }
    
    const { data: session } = await supabase
        .from('sessions')
        .select('grade')
        .eq('id', sessionId)
        .single();
    
    if (!session) {
        showToast('Erreur lors du chargement', 'error');
        return;
    }
    
    const { data: students } = await supabase
        .from('students')
        .select('id, cin, full_name')
        .eq('grade', session.grade)
        .order('full_name');
    
    const { data: attendances } = await supabase
        .from('attendance')
        .select('student_id')
        .eq('session_id', sessionId);
    
    const presentIds = new Set(attendances?.map(a => a.student_id) || []);
    
    const tbody = document.getElementById('attendanceStudentsBody');
    tbody.innerHTML = students?.map(s => `
        <tr data-student-id="${s.id}">
            <td>${s.cin}</td>
            <td>${s.full_name}</td>
            <td><input type="checkbox" class="present-checkbox" ${presentIds.has(s.id) ? 'checked' : ''}></td>
        </tr>
    `).join('') || '<tr><td colspan="3">Aucun étudiant</td></tr>';
    
    document.getElementById('attendanceList').classList.remove('hidden');
};

window.saveManualAttendance = async function() {
    const sessionId = document.getElementById('manualSession').value;
    if (!sessionId) return;
    
    const rows = document.querySelectorAll('#attendanceStudentsBody tr');
    const records = [];
    
    rows.forEach(row => {
        const studentId = row.dataset.studentId;
        if (row.querySelector('.present-checkbox').checked) {
            records.push({
                student_id: studentId,
                session_id: sessionId,
                marked_at: new Date().toISOString()
            });
        }
    });
    
    await supabase.from('attendance').delete().eq('session_id', sessionId);
    
    if (records.length > 0) {
        const { error } = await supabase.from('attendance').insert(records);
        if (error) {
            showToast('Erreur: ' + error.message, 'error');
            return;
        }
    }
    
    showToast(`${records.length} présence(s) enregistrée(s)`, 'success');
};

window.copyQRCode = function() {
  const code = document.getElementById('qrTextCode')?.textContent;
  if (code && code !== '—') {
    navigator.clipboard.writeText(code).then(() => showToast('✅ Code copié!', 'success'));
  }
};

// ============ ATTENDANCE LIST ============
window.loadAttendanceDetails = async function() {
    const sessionId = document.getElementById('attendanceSessionSelect').value;
    if (!sessionId) {
        document.getElementById('attendanceDetails').classList.add('hidden');
        return;
    }
    
    const { data: session } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single();
    
    if (!session) return;
    
    document.getElementById('attendanceSessionTitle').textContent = 
        `${session.subject} - ${formatDate(session.session_date)} (${session.start_time} - ${session.end_time})`;
    
    const { data: students } = await supabase
        .from('students')
        .select('id, cin, full_name')
        .eq('grade', session.grade)
        .order('full_name');
    
    const { data: attendances } = await supabase
        .from('attendance')
        .select('*')
        .eq('session_id', sessionId);
    
    const presentMap = new Map(attendances?.map(a => [a.student_id, a]) || []);
    
    const total = students?.length || 0;
    const present = attendances?.length || 0;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    
    document.getElementById('presentCount').textContent = present;
    document.getElementById('absentCount').textContent = total - present;
    document.getElementById('attendanceRateDetail').textContent = `${rate}%`;
    
    const tbody = document.getElementById('attendanceDetailsBody');
    tbody.innerHTML = students?.map(s => {
        const att = presentMap.get(s.id);
        const isPresent = !!att;
        return `
            <tr>
                <td>${s.cin}</td>
                <td>${s.full_name}</td>
                <td><span class="status-badge ${isPresent ? 'present' : 'absent'}">${isPresent ? 'Présent' : 'Absent'}</span></td>
                <td>${att ? formatDateTime(new Date(att.marked_at)) : '-'}</td>
                <td><button class="btn-toggle ${isPresent ? 'active' : ''}" onclick="toggleAttendanceStatus('${sessionId}', '${s.id}', ${isPresent})">${isPresent ? 'Marquer absent' : 'Marquer présent'}</button></td>
            </tr>
        `;
    }).join('') || '<tr><td colspan="5">Aucun étudiant</td></tr>';
    
    document.getElementById('attendanceDetails').classList.remove('hidden');
};

window.toggleAttendanceStatus = async function(sessionId, studentId, isPresent) {
    if (isPresent) {
        await supabase.from('attendance').delete().eq('session_id', sessionId).eq('student_id', studentId);
        showToast('Étudiant marqué comme absent', 'success');
    } else {
        await supabase.from('attendance').insert({
            session_id: sessionId,
            student_id: studentId,
            marked_at: new Date().toISOString()
        });
        showToast('Étudiant marqué comme présent', 'success');
    }
    loadAttendanceDetails();
};

// ============ GRADES ============
async function getCurrentUser() {
    const sessionData = sessionStorage.getItem('professorSession');
    if (sessionData) return JSON.parse(sessionData);

    const localData = localStorage.getItem('attendly_user');
    if (localData) {
        const userData = JSON.parse(localData);
        if (userData.role === 'professor') return userData;
    }

    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

window.addGrade = async function() {
    const studentId = document.getElementById('gradeStudent').value;
    const grade = document.getElementById('gradeLevel').value;
    const subject = document.getElementById('gradeSubject').value;
    const examType = document.getElementById('gradeType').value;
    const note = parseFloat(document.getElementById('gradeNote').value);
    const maxNote = parseFloat(document.getElementById('gradeMax').value) || 20;
    const examDate = document.getElementById('gradeDate').value;
    
    if (!studentId || !grade || !subject || !note || !examDate) {
        showToast('Veuillez remplir tous les champs obligatoires', 'warning');
        return;
    }
    
    const user = await getCurrentUser();
    if (!user) {
        showToast('Erreur: Non connecté', 'error');
        return;
    }
    
    const { error } = await supabase.from('notes').insert({
        student_id: studentId,
        professor_id: user.id,
        grade: grade,
        subject: subject,
        exam_type: examType,
        note: note,
        max_note: maxNote,
        exam_date: examDate
    });
    
    if (error) {
        showToast('Erreur: ' + error.message, 'error');
        return;
    }
    
    showToast('Note ajoutée avec succès!', 'success');
    document.getElementById('gradeForm').reset();
    document.getElementById('gradeMax').value = '20';
    loadGrades();
};

window.loadGrades = async function() {
    const user = await getCurrentUser();
    if (!user) return;
    
    const filterGrade = document.getElementById('filterGrade')?.value || '';
    const filterSubject = document.getElementById('filterSubject')?.value?.toLowerCase() || '';
    
    let query = supabase
        .from('notes')
        .select(`*, student:students(full_name)`)
        .eq('professor_id', user.id)
        .order('created_at', { ascending: false });
    
    if (filterGrade) query = query.eq('grade', filterGrade);
    
    const { data: grades } = await query;
    
    const tbody = document.getElementById('gradesBody');
    if (!tbody) return;
    
    let filtered = grades || [];
    if (filterSubject) {
        filtered = filtered.filter(g => g.subject.toLowerCase().includes(filterSubject));
    }
    
    tbody.innerHTML = filtered.map(g => `
        <tr>
            <td>${g.student?.full_name || '-'}</td>
            <td>${formatGrade(g.grade)}</td>
            <td>${g.subject}</td>
            <td>${g.exam_type || '-'}</td>
            <td>${g.note}/${g.max_note}</td>
            <td>${formatDate(g.exam_date)}</td>
            <td><button class="btn-toggle" onclick="deleteGrade('${g.id}')">Supprimer</button></td>
        </tr>
    `).join('') || '<tr><td colspan="7" class="text-center">Aucune note</td></tr>';
};

window.sendGradesToAdmin = async function() {
    const user = await getCurrentUser();
    if (!user) return;
    
    const filterGrade = document.getElementById('filterGrade')?.value || '';
    
    let query = supabase
        .from('notes')
        .select(`*, student:students(full_name, cin)`)
        .eq('professor_id', user.id);
    
    if (filterGrade) query = query.eq('grade', filterGrade);
    
    const { data: grades } = await query;
    
    if (!grades || grades.length === 0) {
        showToast('Aucune note à envoyer', 'warning');
        return;
    }
    
    let csv = 'CIN,Étudiant,Niveau,Matière,Type,Note,Max,Date\n';
    grades.forEach(g => {
        csv += `${g.student?.cin || ''},${g.student?.full_name || ''},${formatGrade(g.grade)},${g.subject},${g.exam_type || '-'},${g.note},${g.max_note},${formatDate(g.exam_date)}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `notes-admin-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    showToast(`${grades.length} notes préparées pour l'admin!`, 'success');
};

window.deleteGrade = async function(id) {
    if (!confirm('Supprimer cette note?')) return;
    await supabase.from('notes').delete().eq('id', id);
    showToast('Note supprimée', 'success');
    loadGrades();
};

window.exportGrades = function() {
    const rows = document.querySelectorAll('#gradesTable tbody tr');
    if (rows.length === 0 || rows[0].textContent.includes('Aucune')) {
        showToast('Aucune note à exporter', 'warning');
        return;
    }
    
    let csv = 'Étudiant,Niveau,Matière,Type,Note,Date\n';
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 6) {
            csv += `${cells[0].textContent},${cells[1].textContent},${cells[2].textContent},${cells[3].textContent},${cells[4].textContent},${cells[5].textContent}\n`;
        }
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `notes-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    showToast('Export CSV réussi!', 'success');
};

// ============ SCHEDULE ============
async function loadSchedule() {
    const user = await getCurrentUser();
    if (!user) return;
    
    const filterGrade = document.getElementById('scheduleGrade')?.value || '';
    const filterDay = document.getElementById('scheduleDay')?.value || '';
    
    let query = supabase
        .from('schedules')
        .select('*')
        .eq('professor_id', user.id)
        .order('day_of_week')
        .order('start_time');
    
    if (filterGrade) query = query.eq('grade', filterGrade);
    if (filterDay) query = query.eq('day_of_week', filterDay);
    
    const { data: schedules } = await query;
    
    const tbody = document.getElementById('scheduleBody');
    if (!tbody) return;
    
    if (!schedules || schedules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Aucun cours programmé</td></tr>';
        return;
    }
    
    const sorted = schedules.sort((a, b) => {
        const dayDiff = daysOrder[a.day_of_week] - daysOrder[b.day_of_week];
        if (dayDiff !== 0) return dayDiff;
        return a.start_time.localeCompare(b.start_time);
    });
    
    let currentDay = '';
    let html = '';
    
    sorted.forEach(s => {
        const dayLabel = s.day_of_week.charAt(0).toUpperCase() + s.day_of_week.slice(1);
        if (currentDay !== s.day_of_week) {
            currentDay = s.day_of_week;
            html += `<tr class="schedule-day-header"><td colspan="6" style="background:#eef2ff;font-weight:600;color:#3b82f6;">${dayLabel}</td></tr>`;
        }
        html += `
            <tr>
                <td></td>
                <td>${s.start_time} - ${s.end_time}</td>
                <td>${s.subject}</td>
                <td>${formatGrade(s.grade)}</td>
                <td>${s.td_group || '-'}</td>
                <td>${s.room || '-'}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', async () => {
    // Check for user in localStorage (from database.js) or sessionStorage (legacy)
    let user = null;
    
    const localData = localStorage.getItem('attendly_user');
    const sessionData = sessionStorage.getItem('professorSession');
    
    if (localData) {
        user = JSON.parse(localData);
    } else if (sessionData) {
        user = JSON.parse(sessionData);
    } else {
        // Fallback to Supabase Auth
        const { data: { user: authUser } } = await supabase.auth.getUser();
        user = authUser;
    }

    if (!user) {
        showToast('Veuillez vous connecter', 'warning');
        window.location.href = '../loginP.html';
        return;
    }
    
    // Update sidebar with user info
    if (document.getElementById('sidebarName')) {
        document.getElementById('sidebarName').textContent = user.full_name || user.email || 'Professeur';
    }
    if (document.getElementById('sidebarEmail')) {
        document.getElementById('sidebarEmail').textContent = user.email || '';
    }

    // Load initial data based on page
    if (document.getElementById('scheduleBody')) loadSchedule();
    if (document.getElementById('gradesBody')) loadGrades();

    // Setup date defaults
    const today = new Date().toISOString().split('T')[0];
    if (document.getElementById('qrDate')) document.getElementById('qrDate').value = today;
    if (document.getElementById('gradeDate')) document.getElementById('gradeDate').value = today;

    // Load students for grade form
    if (document.getElementById('gradeStudent')) {
        const { data: students } = await supabase.from('students').select('id, full_name').order('full_name');
        const select = document.getElementById('gradeStudent');
        select.innerHTML = '<option value="">Sélectionner...</option>';
        students?.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.full_name;
            select.appendChild(opt);
        });
    }

    // Load sessions for attendance
    if (document.getElementById('manualSession') || document.getElementById('attendanceSessionSelect')) {
        const profId = user.id;
        if (profId) {
            const { data: sessions } = await supabase
                .from('sessions')
                .select('*')
                .eq('professor_id', profId)
                .order('session_date', { ascending: false });

            const manualSelect = document.getElementById('manualSession');
            const detailSelect = document.getElementById('attendanceSessionSelect');

            const options = sessions?.map(s => 
                `<option value="${s.id}">${s.subject} - ${formatDate(s.session_date)} (${s.start_time})</option>`
            ).join('') || '';

            if (manualSelect) manualSelect.innerHTML = '<option value="">Choisir une session...</option>' + options;
            if (detailSelect) detailSelect.innerHTML = '<option value="">Choisir une session...</option>' + options;
        }
    }
});

async function displaySchedule() {
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
        console.error('No user logged in')
        return
    }
    
    // Fetch schedules for this professor
    const { data: schedules, error } = await supabase
        .from('schedules')
        .select('*')
        .eq('professor_id', user.id)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true })
    
    if (error) {
        document.getElementById('schedule-content').innerHTML = 
            `<div class="error">Error loading schedule: ${error.message}</div>`
        return
    }
    
    if (!schedules || schedules.length === 0) {
        document.getElementById('schedule-content').innerHTML = 
            `<div class="no-schedule">No schedule found. Please contact administrator to set up your schedule.</div>`
        return
    }
    
    // Group schedules by day of week
    const scheduleByDay = {}
    daysOfWeek.forEach(day => {
        scheduleByDay[day] = []
    })
    
    schedules.forEach(schedule => {
        if (scheduleByDay[schedule.day_of_week]) {
            scheduleByDay[schedule.day_of_week].push(schedule)
        }
    })
    
    // Create HTML table
    let html = `
        <table class="schedule-table">
            <thead>
                <tr>
                    <th>Time</th>
                    ${daysOfWeek.map(day => `<th class="day-column">${day}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
    `
    
    // Get all unique time slots across all days
    const allTimeSlots = []
    schedules.forEach(schedule => {
        const timeSlot = `${schedule.start_time.substring(0, 5)} - ${schedule.end_time.substring(0, 5)}`
        if (!allTimeSlots.includes(timeSlot)) {
            allTimeSlots.push(timeSlot)
        }
    })
    allTimeSlots.sort()
    
    // Create rows for each time slot
    allTimeSlots.forEach(timeSlot => {
        html += `<tr><td class="time-slot">${timeSlot}</td>`
        
        daysOfWeek.forEach(day => {
            const daySchedules = scheduleByDay[day].filter(s => 
                `${s.start_time.substring(0, 5)} - ${s.end_time.substring(0, 5)}` === timeSlot
            )
            
            if (daySchedules.length > 0) {
                html += `<td>`
                daySchedules.forEach(schedule => {
                    html += `
                        <div class="schedule-item">
                            <div class="subject">${schedule.subject}</div>
                            <div class="grade-group">Grade: ${schedule.grade} | Group: ${schedule.td_group || 'All'}</div>
                            <div class="room">Room: ${schedule.room}</div>
                        </div>
                    `
                })
                html += `</td>`
            } else {
                html += `<td></td>`
            }
        })
        html += `</tr>`
    })
    
    html += `
            </tbody>
        </table>
    `
    
    // Add summary section
    html += `
        <div style="margin-top: 20px; padding: 15px; background-color: #f0f9ff; border-radius: 8px;">
            <h3>Schedule Summary</h3>
            <p><strong>Total Classes:</strong> ${schedules.length}</p>
            <p><strong>Subjects:</strong> ${[...new Set(schedules.map(s => s.subject))].join(', ')}</p>
            <p><strong>Grades:</strong> ${[...new Set(schedules.map(s => s.grade))].join(', ')}</p>
        </div>
    `
    
    document.getElementById('schedule-content').innerHTML = html
}

// ============ YEARLY ATTENDANCE MATRIX ============
let matrixData = {
    students: [],
    sessions: [],
    attendances: [],
    pendingChanges: new Map()
};

window.loadYearlyAttendance = async function() {
    const user = await getCurrentUser();
    if (!user) return;
    
    const gradeFilter = document.getElementById('filterGradeMatrix')?.value || '';
    const subjectFilter = document.getElementById('filterSubjectMatrix')?.value?.toLowerCase() || '';
    const dateFrom = document.getElementById('filterDateFrom')?.value || '';
    const dateTo = document.getElementById('filterDateTo')?.value || '';
    
    // Load sessions with filters
    let sessionQuery = supabase
        .from('sessions')
        .select('*')
        .eq('professor_id', user.id)
        .order('session_date', { ascending: true });
    
    if (gradeFilter) sessionQuery = sessionQuery.eq('grade', gradeFilter);
    if (subjectFilter) sessionQuery = sessionQuery.ilike('subject', `%${subjectFilter}%`);
    if (dateFrom) sessionQuery = sessionQuery.gte('session_date', dateFrom);
    if (dateTo) sessionQuery = sessionQuery.lte('session_date', dateTo);
    
    const { data: sessions } = await sessionQuery;
    
    if (!sessions || sessions.length === 0) {
        const tbody = document.getElementById('matrixBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="2" class="text-center">Aucune session trouvée</td></tr>';
        return;
    }
    
    matrixData.sessions = sessions;
    
    // Get all grades from sessions
    const grades = [...new Set(sessions.map(s => s.grade))];
    
    // Load students for these grades
    let studentQuery = supabase.from('students').select('id, cin, full_name, grade');
    if (grades.length === 1) {
        studentQuery = studentQuery.eq('grade', grades[0]);
    } else if (grades.length > 1) {
        studentQuery = studentQuery.in('grade', grades);
    }
    
    const { data: students } = await studentQuery.order('full_name');
    matrixData.students = students || [];
    
    // Load attendances for these sessions
    const sessionIds = sessions.map(s => s.id);
    const { data: attendances } = await supabase
        .from('attendance')
        .select('*')
        .in('session_id', sessionIds);
    
    matrixData.attendances = attendances || [];
    matrixData.pendingChanges.clear();
    
    renderAttendanceMatrix();
};

function renderAttendanceMatrix() {
    const headerRow = document.getElementById('matrixHeader')?.querySelector('tr');
    const tbody = document.getElementById('matrixBody');
    
    if (!headerRow || !tbody) return;
    
    // Clear existing date columns
    const existingDateCols = headerRow.querySelectorAll('.date-col');
    existingDateCols.forEach(col => col.remove());
    
    // Add date columns to header
    matrixData.sessions.forEach((session, index) => {
        const date = new Date(session.session_date);
        const dayName = date.toLocaleDateString('fr-FR', { weekday: 'short' }).toUpperCase();
        const dayNum = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        
        const th = document.createElement('th');
        th.className = 'date-col';
        th.innerHTML = `
            <div class="date-day">${dayName}</div>
            <div class="date-num">${dayNum}</div>
            <div style="font-size:0.65rem;color:#94a3b8;">${session.subject.substring(0, 10)}${session.subject.length > 10 ? '...' : ''}</div>
        `;
        th.title = `${session.subject} - ${formatDate(session.session_date)} (${session.start_time}-${session.end_time})\nCliquez pour voir les détails`;
        th.style.cursor = 'pointer';
        th.onclick = () => openSessionModal(session.id);
        headerRow.appendChild(th);
    });
    
    // Build student rows
    tbody.innerHTML = matrixData.students.map(student => {
        const attendanceMap = new Map();
        matrixData.attendances
            .filter(a => a.student_id === student.id)
            .forEach(a => attendanceMap.set(a.session_id, a));
        
        const pendingForStudent = Array.from(matrixData.pendingChanges.entries())
            .filter(([key, val]) => key.startsWith(`${student.id}-`));
        
        let cellsHtml = matrixData.sessions.map((session, idx) => {
            const attendance = attendanceMap.get(session.id);
            const isPresent = !!attendance;
            const isManual = attendance?.marked_manually || false;
            
            // Check for pending changes
            const pendingKey = `${student.id}-${session.id}`;
            const pendingChange = matrixData.pendingChanges.get(pendingKey);
            const displayStatus = pendingChange !== undefined ? pendingChange : isPresent;
            const isPending = pendingChange !== undefined;
            
            const cellClass = `presence-cell ${displayStatus ? 'present' : 'absent'} ${isManual || isPending ? 'manual' : ''}`;
            const icon = displayStatus ? '✓' : '✗';
            
            return `<td class="${cellClass}" 
                        onclick="toggleMatrixPresence('${student.id}', '${session.id}', ${displayStatus})"
                        title="${student.full_name} - ${formatDate(session.session_date)}: ${displayStatus ? 'Présent' : 'Absent'}${isPending ? ' (modifié)' : ''}">
                        ${icon}
                    </td>`;
        }).join('');
        
        return `
            <tr data-student-id="${student.id}">
                <td class="student-col">${student.full_name}</td>
                <td class="student-col">${student.cin}</td>
                ${cellsHtml}
            </tr>
        `;
    }).join('');
}

window.toggleMatrixPresence = function(studentId, sessionId, currentStatus) {
    const newStatus = !currentStatus;
    const key = `${studentId}-${sessionId}`;
    
    // Check if there's an original attendance record
    const originalAttendance = matrixData.attendances.find(
        a => a.student_id === studentId && a.session_id === sessionId
    );
    const originalStatus = !!originalAttendance;
    
    // Only store if it's different from original
    if (newStatus === originalStatus) {
        matrixData.pendingChanges.delete(key);
    } else {
        matrixData.pendingChanges.set(key, newStatus);
    }
    
    renderAttendanceMatrix();
    showToast(`Statut modifié: ${newStatus ? 'Présent' : 'Absent'} - Enregistrez pour sauvegarder`, 'info');
};

window.saveMatrixChanges = async function() {
    if (matrixData.pendingChanges.size === 0) {
        showToast('Aucune modification à enregistrer', 'warning');
        return;
    }
    
    const user = await getCurrentUser();
    if (!user) return;
    
    const insertRecords = [];
    const deleteKeys = [];
    
    for (const [key, isPresent] of matrixData.pendingChanges.entries()) {
        const [studentId, sessionId] = key.split('-');
        
        if (isPresent) {
            // Check if already exists
            const exists = matrixData.attendances.find(
                a => a.student_id === studentId && a.session_id === sessionId
            );
            if (!exists) {
                insertRecords.push({
                    student_id: studentId,
                    session_id: sessionId,
                    marked_at: new Date().toISOString(),
                    marked_manually: true
                });
            }
        } else {
            // Mark for deletion
            deleteKeys.push({ student_id: studentId, session_id: sessionId });
        }
    }
    
    // Delete records
    for (const key of deleteKeys) {
        await supabase
            .from('attendance')
            .delete()
            .eq('student_id', key.student_id)
            .eq('session_id', key.session_id);
    }
    
    // Insert new records
    if (insertRecords.length > 0) {
        const { error } = await supabase.from('attendance').insert(insertRecords);
        if (error) {
            showToast('Erreur lors de l\'enregistrement: ' + error.message, 'error');
            return;
        }
    }
    
    matrixData.pendingChanges.clear();
    await loadYearlyAttendance();
    showToast(`${insertRecords.length + deleteKeys.length} modifications enregistrées`, 'success');
};

window.exportMatrixToCSV = function() {
    if (!matrixData.students.length || !matrixData.sessions.length) {
        showToast('Aucune donnée à exporter', 'warning');
        return;
    }
    
    let csv = 'Étudiant,CIN,';
    csv += matrixData.sessions.map(s => 
        `${s.subject}_${formatDate(s.session_date)}`.replace(/,/g, ';')
    ).join(',') + '\n';
    
    matrixData.students.forEach(student => {
        const attendanceMap = new Map();
        matrixData.attendances
            .filter(a => a.student_id === student.id)
            .forEach(a => attendanceMap.set(a.session_id, a));
        
        csv += `${student.full_name},${student.cin},`;
        csv += matrixData.sessions.map(session => {
            const attendance = attendanceMap.get(session.id);
            return attendance ? 'P' : 'A';
        }).join(',') + '\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `presence_annuelle_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    showToast('Export CSV réussi!', 'success');
};

// Session Modal for Matrix
window.openSessionModal = async function(sessionId) {
    const session = matrixData.sessions.find(s => s.id === sessionId);
    if (!session) return;
    
    document.getElementById('modalSubject').textContent = session.subject;
    document.getElementById('modalDate').textContent = formatDate(session.session_date);
    document.getElementById('modalTime').textContent = `${session.start_time} - ${session.end_time}`;
    document.getElementById('modalGrade').textContent = formatGrade(session.grade);
    
    // Load attendance for this session
    const { data: attendances } = await supabase
        .from('attendance')
        .select('*, student:students(cin, full_name)')
        .eq('session_id', sessionId);
    
    const attendanceMap = new Map(attendances?.map(a => [a.student_id, a]) || []);
    
    const tbody = document.getElementById('modalAttendanceBody');
    tbody.innerHTML = matrixData.students
        .filter(s => s.grade === session.grade)
        .map(s => {
            const att = attendanceMap.get(s.id);
            const isPresent = !!att;
            return `
                <tr>
                    <td>${s.cin}</td>
                    <td>${s.full_name}</td>
                    <td><span class="status-badge ${isPresent ? 'present' : 'absent'}">${isPresent ? 'Présent' : 'Absent'}</span></td>
                    <td><button class="btn-toggle ${isPresent ? 'active' : ''}" onclick="toggleModalAttendance('${sessionId}', '${s.id}', ${isPresent})">${isPresent ? 'Marquer absent' : 'Marquer présent'}</button></td>
                </tr>
            `;
        }).join('') || '<tr><td colspan="4">Aucun étudiant</td></tr>';
    
    document.getElementById('sessionModal').classList.add('show');
};

window.closeSessionModal = function() {
    document.getElementById('sessionModal').classList.remove('show');
};

window.toggleModalAttendance = async function(sessionId, studentId, isPresent) {
    if (isPresent) {
        await supabase.from('attendance').delete().eq('session_id', sessionId).eq('student_id', studentId);
        showToast('Étudiant marqué comme absent', 'success');
    } else {
        await supabase.from('attendance').insert({
            session_id: sessionId,
            student_id: studentId,
            marked_at: new Date().toISOString(),
            marked_manually: true
        });
        showToast('Étudiant marqué comme présent', 'success');
    }
    openSessionModal(sessionId);
    loadYearlyAttendance(); // Refresh matrix
};

// ============ PROFESSOR SCHEDULE IN ATTENDANCE PAGE ============
window.loadProfessorSchedule = async function() {
    const user = await getCurrentUser();
    if (!user) return;
    
    const gradeFilter = document.getElementById('scheduleGradeFilter')?.value || '';
    const dayFilter = document.getElementById('scheduleDayFilter')?.value || '';
    
    let query = supabase
        .from('schedules')
        .select('*')
        .eq('professor_id', user.id)
        .order('day_of_week')
        .order('start_time');
    
    if (gradeFilter) query = query.eq('grade', gradeFilter);
    if (dayFilter) query = query.eq('day_of_week', dayFilter);
    
    const { data: schedules } = await query;
    
    // Clear all cells
    document.querySelectorAll('#profScheduleTable .tt-cell').forEach(cell => {
        cell.innerHTML = '';
        cell.className = 'tt-cell';
    });
    
    if (!schedules || schedules.length === 0) return;
    
    // Populate cells
    schedules.forEach(schedule => {
        const day = schedule.day_of_week.toLowerCase();
        const startTime = schedule.start_time.substring(0, 5);
        
        const cell = document.querySelector(`#profScheduleTable .tt-cell[data-day="${day}"][data-start="${startTime}"]`);
        if (cell) {
            cell.innerHTML = `
                <div class="course-block">
                    <strong>${schedule.subject}</strong>
                    <small>${formatGrade(schedule.grade)}${schedule.td_group ? ` - ${schedule.td_group}` : ''}</small>
                    <small>Salle: ${schedule.room || '-'}</small>
                </div>
            `;
            cell.classList.add('has-course');
        }
    });
};

// Initialize matrix on page load
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('attendanceMatrixTable')) {
        // Set default date range (current school year)
        const now = new Date();
        const currentYear = now.getFullYear();
        const startOfYear = now.getMonth() >= 8 ? `${currentYear}-09-01` : `${currentYear-1}-09-01`;
        const endOfYear = now.getMonth() >= 8 ? `${currentYear+1}-06-30` : `${currentYear}-06-30`;
        
        if (document.getElementById('filterDateFrom')) {
            document.getElementById('filterDateFrom').value = startOfYear;
        }
        if (document.getElementById('filterDateTo')) {
            document.getElementById('filterDateTo').value = endOfYear;
        }
        
        loadYearlyAttendance();
    }
    
    // Initialize schedule in attendance page
    if (document.getElementById('profScheduleTable')) {
        loadProfessorSchedule();
    }
});