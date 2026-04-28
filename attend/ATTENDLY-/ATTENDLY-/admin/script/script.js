import supabase from '../../js/supabase-client.js';
import { calculateAverage, formatDate, hashPassword, changeStudentPassword } from '../../js/database.js';

const e = s => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

window.addEventListener('unhandledrejection', x => console.error('[Attendly] Unhandled:', x.reason));
console.log('[Attendly] script.js loaded →', document.title);

function checkAuth() {
  const pub = ['loginE.html','loginP.html'];
  if (pub.some(p => location.pathname.endsWith(p))) return;
  if (!localStorage.getItem('attendly_user')) location.href = '../loginE.html';
}
checkAuth();

const nb = document.getElementById('notifBtn'), nd = document.getElementById('notifDropdown'), nl = document.getElementById('notifList');
if (nb) {
  nb.addEventListener('click', x => { x.stopPropagation(); nd.classList.toggle('open'); nd.classList.contains('open') && loadN(); });
  document.addEventListener('click', () => nd?.classList.remove('open'));
}
async function loadN() {
  if (!nl) return;
  nl.innerHTML = '<li>Loading…</li>';
  try {
    const { data, error } = await supabase.from('notifications').select('*').order('created_at',{ascending:false}).limit(6);
    if (error) { nl.innerHTML = '<li>Error</li>'; console.error('[notifs]',error); return; }
    if (!data?.length) { nl.innerHTML = '<li>No notifications.</li>'; return; }
    const b = document.getElementById('notifBadge'), u = data.filter(n => !n.is_read).length;
    if (b) b.textContent = u || '';
    nl.innerHTML = data.map(n => `<li class="${n.is_read?'':'unread'}"><strong>${e(n.title)}</strong><span>${e(n.message)}</span><time>${formatDate(n.created_at)}</time></li>`).join('');
  } catch (x) { console.error('[notifs]',x); }
}

// DASHBOARD
async function initDashboard() {
  if (!document.getElementById('statsGrid')) return;
  try {
    const [{ count: sc, error: e1 }, { count: pc, error: e2 }, { count: ses, error: e3 }, { count: att, error: e4 }] = await Promise.all([
      supabase.from('students').select('*', { count: 'exact', head: true }),
      supabase.from('professors').select('*', { count: 'exact', head: true }),
      supabase.from('sessions').select('*', { count: 'exact', head: true }),
      supabase.from('attendance').select('*', { count: 'exact', head: true }),
    ]);
    if (e1) console.error('[stats]', e1);
    document.getElementById('countStudents').textContent = sc ?? '—';
    document.getElementById('countProfs').textContent = pc ?? '—';
    document.getElementById('countSessions').textContent = ses ?? '—';
    document.getElementById('countAttendance').textContent = att ?? '—';
  } catch (x) { console.error('[dash]', x); }
  try {
    const { data } = await supabase.from('students').select('full_name, grade, email').order('id', { ascending: false }).limit(5);
    const tb = document.getElementById('recentStudents');
    if (!data?.length) { tb.innerHTML = '<tr><td colspan="3">No data</td></tr>'; return; }
    tb.innerHTML = data.map(s => `<tr><td>${e(s.full_name)}</td><td class="badge blue">${e(s.grade)}</td><td>${e(s.email)}</td></tr>`).join('');
  } catch (x) { console.error('[rs]', x); }
  try {
    const { data } = await supabase.from('professors').select('full_name, email').order('id', { ascending: false }).limit(5);
    const tb = document.getElementById('recentProfs');
    if (!data?.length) { tb.innerHTML = '<tr><td colspan="2">No data</td></tr>'; return; }
    tb.innerHTML = data.map(p => `<tr><td>${e(p.full_name)}</td><td>${e(p.email)}</td></tr>`).join('');
  } catch (x) { console.error('[rp]', x); }
}
initDashboard();

// PROFESSORS
async function initProfessors() {
  if (!document.getElementById('profTableBody')) return;
  let allProfs = [], sc = {}, nc = {};
  function rt(profs) {
    const tb = document.getElementById('profTableBody');
    if (!profs.length) { tb.innerHTML = '<tr><td colspan="5">No results</td></tr>'; return; }
    tb.innerHTML = profs.map((p, i) => `<tr><td>${i+1}</td><td>${e(p.full_name)}</td><td>${e(p.email)}</td><td>${sc[p.id]||0}</td><td>${nc[p.id]||0}</td></tr>`).join('');
  }
  try {
    const [{ data: profs, error: e1 }, { data: sessions, error: e2 }, { data: notes, error: e3 }] = await Promise.all([
      supabase.from('professors').select('id, full_name, email'),
      supabase.from('sessions').select('professor_id'),
      supabase.from('notes').select('professor_id'),
    ]);
    if (e1) { console.error('[profs]', e1); return; }
    sc = (sessions || []).reduce((a, x) => { a[x.professor_id] = (a[x.professor_id] || 0) + 1; return a; }, {});
    nc = (notes || []).reduce((a, x) => { a[x.professor_id] = (a[x.professor_id] || 0) + 1; return a; }, {});
    document.getElementById('totalProfs').textContent = profs?.length || 0;
    document.getElementById('totalSessions').textContent = sessions?.length || 0;
    document.getElementById('totalNotes').textContent = notes?.length || 0;
    allProfs = profs || [];
    rt(allProfs);
    document.getElementById('profSearch')?.addEventListener('input', x => rt(allProfs.filter(p => p.full_name.toLowerCase().includes(x.target.value.toLowerCase()) || (p.email || '').toLowerCase().includes(x.target.value.toLowerCase()))));
  } catch (x) { console.error('[ip]', x); }
}
initProfessors();

// STUDENTS
async function initStudents() {
  if (!document.getElementById('stuTableBody')) return;
  let allStudents = [], am = {}, nm = {};
  function rt(students) {
    const tb = document.getElementById('stuTableBody');
    if (!students.length) { tb.innerHTML = '<tr><td colspan="8">No results</td></tr>'; return; }
    tb.innerHTML = students.map((s, i) => {
      const avg = calculateAverage(nm[s.id] || []);
      return `<tr><td>${i + 1}</td><td>${e(s.full_name)}</td><td>${e(s.email)}</td><td class="badge blue">${e(s.grade)}</td><td>${e(s.td_group)}</td><td>${am[s.id] || 0}</td><td>${avg}/20</td><td><button class="btn-action edit" onclick="openEditStudent(${s.id})">Edit</button><button class="btn-action danger" onclick="deleteStudent(${s.id},'${e(s.full_name)}')">Del</button><button class="btn-action history" onclick="showAttendanceHistory(${s.id},'${e(s.full_name)}')">Hist</button></td></tr>`;
    }).join('');
  }
  function af() {
    const g = document.getElementById('gradeFilter')?.value || '';
    const q = (document.getElementById('stuSearch')?.value || '').toLowerCase();
    rt(allStudents.filter(s => (!g || s.grade === g) && (!q || s.full_name.toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q))));
  }
  async function ld() {
    try {
      const [{ data: students, error: e1 }, { data: attendance, error: e2 }, { data: notes, error: e3 }] = await Promise.all([
        supabase.from('students').select('id, full_name, email, grade, td_group'),
        supabase.from('attendance').select('student_id'),
        supabase.from('notes').select('student_id, note, max_note'),
      ]);
      if (e1) { console.error('[students]', e1); return; }
      am = (attendance || []).reduce((a, x) => { a[x.student_id] = (a[x.student_id] || 0) + 1; return a; }, {});
      nm = (notes || []).reduce((a, x) => { if (!a[x.student_id]) a[x.student_id] = []; a[x.student_id].push({ note: x.note, max_note: x.max_note }); return a; }, {});
      document.getElementById('totalStudents').textContent = students?.length || 0;
      document.getElementById('totalAttendance').textContent = attendance?.length || 0;
      document.getElementById('totalNotesS').textContent = notes?.length || 0;
      const grades = [...new Set((students || []).map(s => s.grade).filter(Boolean))].sort();
      const gf = document.getElementById('gradeFilter');
      if (gf) { while (gf.options.length > 1) gf.remove(1); grades.forEach(g => { const o = document.createElement('option'); o.value = g; o.textContent = g; gf.appendChild(o); }); gf.addEventListener('change', af); }
      document.getElementById('stuSearch')?.addEventListener('input', af);
      allStudents = students || [];
      rt(allStudents);
    } catch (x) { console.error('[ld]', x); }
  }
  await ld();
  document.getElementById('btnAddStudent')?.addEventListener('click', () => openStudentModal());
  document.getElementById('btnExportExcel')?.addEventListener('click', () => exportExcel());
  document.getElementById('btnExportPDF')?.addEventListener('click', () => exportPDF());

  window.openStudentModal = function(student = null) {
    const m = document.getElementById('studentModal');
    document.getElementById('modalTitle').textContent = student ? 'Edit Student' : 'Add Student';
    document.getElementById('fieldId').value = student?.id || '';
    document.getElementById('fieldName').value = student?.full_name || '';
    document.getElementById('fieldEmail').value = student?.email || '';
    document.getElementById('fieldGrade').value = student?.grade || '';
    document.getElementById('fieldTdGroup').value = student?.td_group || '';
    document.getElementById('fieldPassword').value = '';
    document.getElementById('fieldPassword').placeholder = student ? 'Leave blank' : 'Required';
    document.getElementById('formError').textContent = '';
    m.classList.add('open');
  };
  window.openEditStudent = async function(id) {
    const { data, error } = await supabase.from('students').select('*').eq('id', id).single();
    if (error) { alert('Could not load'); return; }
    openStudentModal(data);
  };
  document.getElementById('modalClose')?.addEventListener('click', () => document.getElementById('studentModal').classList.remove('open'));
  document.getElementById('modalOverlay')?.addEventListener('click', () => document.getElementById('studentModal').classList.remove('open'));
  document.getElementById('studentForm')?.addEventListener('submit', async x => {
    x.preventDefault();
    const err = document.getElementById('formError');
    err.textContent = '';
    const id = document.getElementById('fieldId').value;
    const fullName = document.getElementById('fieldName').value.trim();
    const email = document.getElementById('fieldEmail').value.trim();
    const grade = document.getElementById('fieldGrade').value.trim();
    const tdGroup = document.getElementById('fieldTdGroup').value.trim();
    const pwd = document.getElementById('fieldPassword').value;
    if (!fullName || !email || !grade) { err.textContent = 'Name, email, grade required'; return; }
    if (!id) {
      const { data: dup } = await supabase.from('students').select('id').eq('email', email).maybeSingle();
      if (dup) { err.textContent = 'Email exists'; return; }
    }
    try {
      const payload = { full_name: fullName, email, grade, td_group: tdGroup || null };
      if (id) {
        if (pwd) payload.password = await hashPassword(pwd);
        const { error } = await supabase.from('students').update(payload).eq('id', id);
        if (error) throw error;
      } else {
        if (!pwd) { err.textContent = 'Password required'; return; }
        payload.password = await hashPassword(pwd);
        const { error } = await supabase.from('students').insert(payload);
        if (error) throw error;
      }
      document.getElementById('studentModal').classList.remove('open');
      await ld();
    } catch (x) { err.textContent = 'Error: ' + x.message; }
  });
  window.deleteStudent = async function(id, name) {
    if (!confirm('Delete ' + name + '?')) return;
    try {
      const { error } = await supabase.from('students').delete().eq('id', id);
      if (error) throw error;
      await ld();
    } catch (x) { alert('Error: ' + x.message); }
  };
  window.showAttendanceHistory = async function(studentId, studentName) {
    const p = document.getElementById('attendancePanel');
    document.getElementById('attendancePanelName').textContent = 'History — ' + studentName;
    document.getElementById('attendanceTableBody').innerHTML = '<tr><td colspan="4">Loading…</td></tr>';
    p.classList.add('open');
    p.dataset.studentId = studentId;
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    await fetchAttendance(studentId);
  };
  async function fetchAttendance(studentId) {
    const tb = document.getElementById('attendanceTableBody');
    const df = document.getElementById('filterDateFrom')?.value;
    const dt = document.getElementById('filterDateTo')?.value;
    tb.innerHTML = '<tr><td colspan="4">Loading…</td></tr>';
    try {
      let q = supabase.from('attendance').select('id, marked_at, sessions(subject, grade, start_time, end_time)').eq('student_id', studentId).order('marked_at', { ascending: false });
      if (df) q = q.gte('marked_at', df + 'T00:00:00');
      if (dt) q = q.lte('marked_at', dt + 'T23:59:59');
      const { data, error } = await q;
      if (error) { tb.innerHTML = '<tr><td colspan="4">Error</td></tr>'; return; }
      if (!data?.length) { tb.innerHTML = '<tr><td colspan="4">No data</td></tr>'; return; }
      tb.innerHTML = data.map((a, i) => `<tr><td>${i + 1}</td><td>${e(a.sessions?.subject)}</td><td>${e(a.sessions?.grade)}</td><td>${formatDate(a.marked_at)}</td></tr>`).join('');
    } catch (x) { console.error('[fa]', x); }
  }
  document.getElementById('btnFilterAttendance')?.addEventListener('click', () => fetchAttendance(document.getElementById('attendancePanel').dataset.studentId));
  document.getElementById('attendancePanelClose')?.addEventListener('click', () => document.getElementById('attendancePanel').classList.remove('open'));

  function exportPDF() {
    const rows = buildExportRows();
    if (!rows.length) { alert('No data'); return; }
    const html = '<html><head><title>Students</title><style>body{font-family:Arial;font-size:12px;}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px;text-align:left}th{background:#0b1630;color:#fff}</style></head><body><h2>Students (' + new Date().toLocaleDateString('fr-FR') + ')</h2><table><thead><tr><th>#</th><th>Name</th><th>Email</th><th>Grade</th><th>TD</th><th>Att</th><th>Avg</th></tr></thead><tbody>' + rows.map((r, i) => '<tr><td>' + (i + 1) + '</td>' + r.map(c => '<td>' + e(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></body></html>';
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  }
  function exportExcel() {
    const rows = buildExportRows();
    if (!rows.length) { alert('No data'); return; }
    const header = ['#', 'Name', 'Email', 'Grade', 'TD', 'Att', 'Avg'];
    const csv = '\uFEFF' + [header, ...rows.map((r, i) => [i + 1, ...r].map(c => '"' + String(c).replace(/"/g, '""') + '"').join(','))].join('\r\n');
    const b = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = u;
    a.download = 'students_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(u);
  }
  function buildExportRows() {
    const g = document.getElementById('gradeFilter')?.value || '';
    const q = (document.getElementById('stuSearch')?.value || '').toLowerCase();
    return allStudents.filter(s => (!g || s.grade === g) && (!q || s.full_name.toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q))).map(s => [s.full_name, s.email || '', s.grade || '', s.td_group || '', am[s.id] || 0, calculateAverage(nm[s.id] || [])]);
  }
}
initStudents();

// SETTINGS
function initSettings() {
  if (!document.getElementById('saveProfile')) return;
  document.getElementById('saveProfile').addEventListener('click', () => {
    const name = document.getElementById('adminName').value.trim();
    const email = document.getElementById('adminEmail').value.trim();
    const user = JSON.parse(localStorage.getItem('attendly_user') || '{}');
    user.name = name;
    user.email = email;
    localStorage.setItem('attendly_user', JSON.stringify(user));
    document.getElementById('pwdMsg').textContent = 'Saved';
    document.getElementById('pwdMsg').style.color = '#22c55e';
  });
  document.querySelectorAll('.toggle').forEach(t => t.addEventListener('click', () => t.classList.toggle('active')));
  document.getElementById('changePwd').addEventListener('click', async () => {
    const current = document.getElementById('currentPwd').value;
    const newPwd = document.getElementById('newPwd').value;
    if (!current || !newPwd) { showMsg('Fill both', 'red'); return; }
    const user = JSON.parse(localStorage.getItem('attendly_user') || '{}');
    if (!user.id) { showMsg('Not logged in', 'red'); return; }
    try {
      const currentHash = await hashPassword(current);
      const newHash = await hashPassword(newPwd);
      await changeStudentPassword(user.id, currentHash, newHash);
      showMsg('Password updated', 'green');
    } catch (x) { showMsg(x.message, 'red'); }
  });
  function showMsg(text, color) {
    const el = document.getElementById('pwdMsg');
    if (!el) return;
    el.textContent = text;
    el.style.color = color === 'green' ? '#22c55e' : '#ef4444';
  }
}
initSettings();
initDashboard();

// ============================================================
// PROF.HTML — Full professors list with search filter
// ============================================================
async function initProfessors() {
  if (!document.getElementById('profTableBody')) return;

  let allProfs = [], sesCount = {}, noteCount = {};

  function renderProfTable(profs) {
    const tbody = document.getElementById('profTableBody');
    if (!profs.length) { tbody.innerHTML = '<tr><td colspan="5" class="loading-row">No results.</td></tr>'; return; }
    tbody.innerHTML = profs.map((p, i) => `
      <tr>
        <td>${i+1}</td>
        <td>${e(p.full_name)}</td>
        <td>${e(p.email||'—')}</td>
        <td>${sesCount[p.id]  || 0}</td>
        <td>${noteCount[p.id] || 0}</td>
      </tr>`).join('');
  }

  try {
    const [
      { data: profs,    error: e1 },
      { data: sessions, error: e2 },
      { data: notes,    error: e3 }
    ] = await Promise.all([
      supabase.from('professors').select('id, full_name, email'),
      supabase.from('sessions')  .select('professor_id'),
      supabase.from('notes')     .select('professor_id'),
    ]);

    if (e1) { console.error('[profs]', e1); return; }

    sesCount  = buildCountMap(sessions, 'professor_id');
    noteCount = buildCountMap(notes,    'professor_id');

    document.getElementById('totalProfs').textContent    = profs?.length ?? 0;
    document.getElementById('totalSessions').textContent = sessions?.length ?? 0;
    document.getElementById('totalNotes').textContent    = notes?.length ?? 0;

    allProfs = profs || [];
    renderProfTable(allProfs);

    document.getElementById('profSearch')?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      renderProfTable(allProfs.filter(p =>
        p.full_name.toLowerCase().includes(q) || (p.email||'').toLowerCase().includes(q)
      ));
    });
  } catch (err) { console.error('[initProfessors]', err); }
}
initProfessors();

// ============================================================
// STUDENT.HTML — UC2 + UC3 + UC4
// UC2: Full CRUD (add/edit/delete students)
// UC3: Attendance history panel with student + date filters
// UC4: Export to PDF and Excel
// ============================================================
async function initStudents() {
  if (!document.getElementById('stuTableBody')) return;

  let allStudents = [], attMap = {}, notesMap = {};

  // ── Render the main students table ──────────────────────────
  function renderStudentTable(students) {
    const tbody = document.getElementById('stuTableBody');
    if (!students.length) { tbody.innerHTML = '<tr><td colspan="8" class="loading-row">No results.</td></tr>'; return; }
    tbody.innerHTML = students.map((s, i) => {
      const avg = calculateAverage(notesMap[s.id] || []);
      return `
        <tr>
          <td>${i+1}</td>
          <td>${e(s.full_name)}</td>
          <td>${e(s.email||'—')}</td>
          <td><span class="badge blue">${e(s.grade||'—')}</span></td>
          <td>${e(s.td_group||'—')}</td>
          <td>${attMap[s.id] || 0}</td>
          <td>${avg}/20</td>
          <td>
            <button class="btn-action edit"   onclick="openEditStudent(${s.id})">✏️ Edit</button>
            <button class="btn-action danger"  onclick="deleteStudent(${s.id}, '${e(s.full_name)}')">🗑️</button>
            <button class="btn-action history" onclick="showAttendanceHistory(${s.id}, '${e(s.full_name)}')">📋 History</button>
          </td>
        </tr>`;
    }).join('');
  }

  // ── Apply grade + text filters ───────────────────────────────
  function applyFilters() {
    const grade = document.getElementById('gradeFilter')?.value || '';
    const q     = (document.getElementById('stuSearch')?.value || '').toLowerCase();
    renderStudentTable(allStudents.filter(s =>
      (!grade || s.grade === grade) &&
      (!q || s.full_name.toLowerCase().includes(q) || (s.email||'').toLowerCase().includes(q))
    ));
  }

  // ── Load all data ─────────────────────────────────────────────
  async function loadAllStudentData() {
    try {
      const [
        { data: students,   error: e1 },
        { data: attendance, error: e2 },
        { data: notes,      error: e3 }
      ] = await Promise.all([
        supabase.from('students')  .select('id, full_name, email, grade, td_group'),
        supabase.from('attendance').select('student_id'),
        supabase.from('notes')     .select('student_id, note, max_note'),
      ]);

      if (e1) { console.error('[students]', e1); return; }

      attMap   = buildCountMap(attendance, 'student_id');
      notesMap = buildNotesMap(notes);

      document.getElementById('totalStudents').textContent   = students?.length ?? 0;
      document.getElementById('totalAttendance').textContent = attendance?.length ?? 0;
      document.getElementById('totalNotesS').textContent     = notes?.length ?? 0;

      // Populate grade filter dropdown
      const grades = [...new Set((students||[]).map(s => s.grade).filter(Boolean))].sort();
      const gradeFilter = document.getElementById('gradeFilter');
      if (gradeFilter) {
        // Remove old options except "All Grades"
        while (gradeFilter.options.length > 1) gradeFilter.remove(1);
        grades.forEach(g => {
          const opt = document.createElement('option');
          opt.value = g; opt.textContent = g;
          gradeFilter.appendChild(opt);
        });
        gradeFilter.addEventListener('change', applyFilters);
      }

      document.getElementById('stuSearch')?.addEventListener('input', applyFilters);

      allStudents = students || [];
      renderStudentTable(allStudents);
    } catch (err) { console.error('[loadAllStudentData]', err); }
  }

  await loadAllStudentData();

  // ── Add Student button ────────────────────────────────────────
  document.getElementById('btnAddStudent')?.addEventListener('click', () => openStudentModal());

  // ── UC4 Export buttons ────────────────────────────────────────
  document.getElementById('btnExportExcel')?.addEventListener('click', () => exportExcel());
  document.getElementById('btnExportPDF')  ?.addEventListener('click', () => exportPDF());

  // ============================================================
  // UC2 — STUDENT MODAL (Add / Edit)
  // ============================================================

  /** Open the modal in ADD mode (no student passed) or EDIT mode (student object passed) */
  window.openStudentModal = function(student = null) {
    const modal   = document.getElementById('studentModal');
    const title   = document.getElementById('modalTitle');
    const form    = document.getElementById('studentForm');
    const errMsg  = document.getElementById('formError');

    errMsg.textContent = '';
    title.textContent  = student ? 'Edit Student' : 'Add Student';

    // Fill form fields — empty if adding, pre-filled if editing
    document.getElementById('fieldId')       .value = student?.id        || '';
    document.getElementById('fieldName')     .value = student?.full_name || '';
    document.getElementById('fieldEmail')    .value = student?.email     || '';
    document.getElementById('fieldGrade')    .value = student?.grade     || '';
    document.getElementById('fieldTdGroup')  .value = student?.td_group  || '';
    document.getElementById('fieldPassword') .value = '';
    document.getElementById('fieldPassword') .placeholder = student ? 'Leave blank to keep current' : 'Required';

    modal.classList.add('open');
  };

  /** Open modal pre-filled with data fetched by student id */
  window.openEditStudent = async function(id) {
    const { data, error } = await supabase.from('students').select('*').eq('id', id).single();
    if (error) { alert('Could not load student data.'); return; }
    openStudentModal(data);
  };

  /** Close the modal */
  document.getElementById('modalClose')  ?.addEventListener('click', closeModal);
  document.getElementById('modalOverlay')?.addEventListener('click', closeModal);
  function closeModal() { document.getElementById('studentModal').classList.remove('open'); }

  /** Handle form submit — INSERT if no id, UPDATE if id present */
  document.getElementById('studentForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const errMsg = document.getElementById('formError');
    errMsg.textContent = '';

    const id       = document.getElementById('fieldId').value;
    const fullName = document.getElementById('fieldName').value.trim();
    const email    = document.getElementById('fieldEmail').value.trim();
    const grade    = document.getElementById('fieldGrade').value.trim();
    const tdGroup  = document.getElementById('fieldTdGroup').value.trim();
    const pwdRaw   = document.getElementById('fieldPassword').value;

    // UC2 validation: required fields
    if (!fullName || !email || !grade) {
      errMsg.textContent = '⚠ Name, email and grade are required.'; return;
    }

    // Check for duplicate email (only when adding a new student)
    if (!id) {
      const { data: dup } = await supabase.from('students').select('id').eq('email', email).maybeSingle();
      if (dup) { errMsg.textContent = '⚠ A student with this email already exists.'; return; }
    }

    try {
      const payload = { full_name: fullName, email, grade, td_group: tdGroup || null };

      if (id) {
        // ── UPDATE ──────────────────────────────────────────────
        // Hash and update password only if a new one was typed
        if (pwdRaw) {
          payload.password = await hashPassword(pwdRaw);
        }
        const { error } = await supabase.from('students').update(payload).eq('id', id);
        if (error) throw error;
      } else {
        // ── INSERT ──────────────────────────────────────────────
        if (!pwdRaw) { errMsg.textContent = '⚠ Password is required for new students.'; return; }
        payload.password = await hashPassword(pwdRaw);
        const { error } = await supabase.from('students').insert(payload);
        if (error) throw error;
      }

      closeModal();
      await loadAllStudentData(); // refresh table
    } catch (err) {
      console.error('[saveStudent]', err);
      errMsg.textContent = '⚠ Error: ' + err.message;
    }
  });

  // ============================================================
  // UC2 — DELETE student with confirmation
  // ============================================================
  window.deleteStudent = async function(id, name) {
    if (!confirm(`Delete student "${name}"? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from('students').delete().eq('id', id);
      if (error) throw error;
      await loadAllStudentData(); // refresh table
    } catch (err) {
      console.error('[deleteStudent]', err);
      alert('Error deleting student: ' + err.message);
    }
  };

  // ============================================================
  // UC3 — ATTENDANCE HISTORY PANEL
  // Shows all attendance records for a chosen student,
  // with optional date-range filtering.
  // ============================================================
  window.showAttendanceHistory = async function(studentId, studentName) {
    const panel     = document.getElementById('attendancePanel');
    const panelName = document.getElementById('attendancePanelName');
    const tbody     = document.getElementById('attendanceTableBody');

    panelName.textContent = `History — ${studentName}`;
    tbody.innerHTML = '<tr><td colspan="4" class="loading-row">Loading…</td></tr>';
    panel.classList.add('open');

    // Store current student id for the filter button to use
    panel.dataset.studentId   = studentId;
    panel.dataset.studentName = studentName;

    // Reset date filters
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value   = '';

    await fetchAttendanceForStudent(studentId);
  };

  /** Query attendance joined with sessions for a student, with optional date range */
  async function fetchAttendanceForStudent(studentId) {
    const tbody    = document.getElementById('attendanceTableBody');
    const dateFrom = document.getElementById('filterDateFrom')?.value;
    const dateTo   = document.getElementById('filterDateTo')?.value;

    tbody.innerHTML = '<tr><td colspan="4" class="loading-row">Loading…</td></tr>';

    try {
      // Join attendance → sessions to get subject, date, time
      let query = supabase
        .from('attendance')
        .select('id, marked_at, sessions(subject, grade, start_time, end_time)')
        .eq('student_id', studentId)
        .order('marked_at', { ascending: false });

      // UC3 date filters
      if (dateFrom) query = query.gte('marked_at', dateFrom + 'T00:00:00');
      if (dateTo)   query = query.lte('marked_at', dateTo   + 'T23:59:59');

      const { data, error } = await query;

      if (error) { console.error('[attendance history]', error); tbody.innerHTML = '<tr><td colspan="4" class="loading-row">Error loading.</td></tr>'; return; }
      if (!data?.length) { tbody.innerHTML = '<tr><td colspan="4" class="loading-row">Aucune donnée disponible pour ces critères.</td></tr>'; return; }

      tbody.innerHTML = data.map((a, i) => `
        <tr>
          <td>${i+1}</td>
          <td>${e(a.sessions?.subject || '—')}</td>
          <td>${e(a.sessions?.grade || '—')}</td>
          <td>${formatDate(a.marked_at)}</td>
        </tr>`).join('');
    } catch (err) { console.error('[fetchAttendanceForStudent]', err); }
  }

  // Apply date filters button
  document.getElementById('btnFilterAttendance')?.addEventListener('click', () => {
    const panel     = document.getElementById('attendancePanel');
    const studentId = panel.dataset.studentId;
    if (studentId) fetchAttendanceForStudent(studentId);
  });

  // Close attendance panel
  document.getElementById('attendancePanelClose')?.addEventListener('click', () => {
    document.getElementById('attendancePanel').classList.remove('open');
  });

  // ============================================================
  // UC4 — EXPORT PDF
  // Uses the browser's built-in print dialog to save as PDF.
  // Generates a clean printable HTML page from current table data.
  // ============================================================
  function exportPDF() {
    const rows = buildExportRows();
    if (!rows.length) { alert('No data to export.'); return; }

    // Build a minimal print-ready HTML document
    const html = `
      <html><head><title>Students Export</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; }
        h2   { margin-bottom: 8px; }
        table{ border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
        th { background: #0b1630; color: #fff; }
        tr:nth-child(even) { background: #f5f5f5; }
      </style></head><body>
      <h2>Attendly — Students List (${new Date().toLocaleDateString('fr-FR')})</h2>
      <table>
        <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Grade</th><th>TD Group</th><th>Attendance</th><th>Avg/20</th></tr></thead>
        <tbody>${rows.map((r,i) => `<tr><td>${i+1}</td>${r.map(c=>`<td>${e(c)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
      </body></html>`;

    // Open in new window and trigger print (user can save as PDF)
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }

  // ============================================================
  // UC4 — EXPORT EXCEL (CSV format, opens in Excel/LibreOffice)
  // Generates a proper CSV file and triggers download.
  // ============================================================
  function exportExcel() {
    const rows = buildExportRows();
    if (!rows.length) { alert('No data to export.'); return; }

    // BOM character (\uFEFF) ensures Excel opens UTF-8 correctly
    const header = ['#','Name','Email','Grade','TD Group','Attendance','Avg/20'];
    const csvRows = [
      header.join(','),
      ...rows.map((r, i) => [i+1, ...r].map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(','))
    ];
    const csv  = '\uFEFF' + csvRows.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);

    // Trigger download
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `students_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Build the data rows array from the currently displayed students */
  function buildExportRows() {
    const grade = document.getElementById('gradeFilter')?.value || '';
    const q     = (document.getElementById('stuSearch')?.value || '').toLowerCase();

    // Use the same filter logic as the table
    const filtered = allStudents.filter(s =>
      (!grade || s.grade === grade) &&
      (!q || s.full_name.toLowerCase().includes(q) || (s.email||'').toLowerCase().includes(q))
    );

    return filtered.map(s => {
      const avg = calculateAverage(notesMap[s.id] || []);
      return [s.full_name, s.email||'', s.grade||'', s.td_group||'', attMap[s.id]||0, avg];
    });
  }
}
initStudents();

// ============================================================
// SETTINGS.HTML — Admin profile + password change
// ============================================================
function initSettings() {
  if (!document.getElementById('saveProfile')) return;

  // Save profile name/email to localStorage
  document.getElementById('saveProfile').addEventListener('click', () => {
    const name  = document.getElementById('adminName').value.trim();
    const email = document.getElementById('adminEmail').value.trim();
    const user  = JSON.parse(localStorage.getItem('attendly_user') || '{}');
    user.name   = name;
    user.email  = email;
    localStorage.setItem('attendly_user', JSON.stringify(user));
    showMsg('✓ Profile saved.', 'green');
  });

  // Toggle preference switches
  document.querySelectorAll('.toggle').forEach(t =>
    t.addEventListener('click', () => t.classList.toggle('active'))
  );

  // Change password
  document.getElementById('changePwd').addEventListener('click', async () => {
    const currentRaw = document.getElementById('currentPwd').value;
    const newRaw     = document.getElementById('newPwd').value;
    if (!currentRaw || !newRaw) { showMsg('Please fill in both fields.', 'red'); return; }

    const user = JSON.parse(localStorage.getItem('attendly_user') || '{}');
    if (!user.id) { showMsg('Not logged in.', 'red'); return; }

    try {
      const currentHash = await hashPassword(currentRaw);
      const newHash     = await hashPassword(newRaw);
      await changeStudentPassword(user.id, currentHash, newHash);
      showMsg('✓ Password updated.', 'green');
    } catch (err) { showMsg(err.message, 'red'); }
  });

  function showMsg(text, color) {
    const el = document.getElementById('pwdMsg');
    if (!el) return;
    el.textContent = text;
    el.style.color = color === 'green' ? '#22c55e' : '#ef4444';
  }
}
initSettings();

// ============================================================
// HELPERS
// ============================================================

/** { id: count } map — e.g. [{student_id:1},{student_id:1}] → {1:2} */
function buildCountMap(arr, key) {
  if (!arr) return {};
  return arr.reduce((acc, item) => {
    acc[item[key]] = (acc[item[key]] || 0) + 1;
    return acc;
  }, {});
}

/** { studentId: [{note, max_note}] } map for calculateAverage() */
function buildNotesMap(notes) {
  if (!notes) return {};
  return notes.reduce((acc, n) => {
    if (!acc[n.student_id]) acc[n.student_id] = [];
    acc[n.student_id].push({ note: n.note, max_note: n.max_note });
    return acc;
  }, {});
}
