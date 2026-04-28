import {
    getCurrentUser, logout, getStudentProfile, getStudentSchedule,
    getStudentNotes, getStudentNotifications, markAttendance,
    markNotificationRead, changeStudentPassword, hashPassword,
    formatDate, formatTime, calculateAverage, getAllNotesForClass
} from '../../js/database.js';
import supabase from '../../js/supabase-client.js';

// Référence pour la modale QR scan
const db = supabase;

// ==========================================
// INITIALIZATION
// ==========================================

const page = window.location.pathname.split('/').pop() || 'index.html';
const user = getCurrentUser();

if (!user) {
    window.location.href = '../loginE.html';
} else {
    initSidebar(user);
    initPage(user);
}

// ==========================================
// AVATAR GENERATOR
// ==========================================

function generateAvatar(name) {
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#3b82f6" rx="64"/><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="white" font-size="48" font-family="sans-serif" font-weight="bold">${initials}</text></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(svg);
}

// ==========================================
// GRADE FORMAT
// ==========================================

function formatGrade(grade) {
    const map = {
        'licence_info_1': 'L1 Informatique',
        'licence_info_2': 'L2 Informatique',
        'licence_info_3': 'L3 Informatique'
    };
    return map[grade] || grade || '—';
}

// ==========================================
// SIDEBAR
// ==========================================

function initSidebar(user) {
    const savedPhoto = localStorage.getItem('attendly_photo_' + user.id);
    const avatar = savedPhoto || generateAvatar(user.full_name);
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    const sidebarName = document.getElementById('sidebarName');
    const sidebarEmail = document.getElementById('sidebarEmail');

    if (sidebarAvatar) sidebarAvatar.src = avatar;
    if (sidebarName) sidebarName.textContent = user.full_name;
    if (sidebarEmail) sidebarEmail.textContent = user.email;

    // Add logout link to nav
    const nav = document.querySelector('.sidebar nav');
    if (nav) {
        const logoutLink = document.createElement('a');
        logoutLink.href = '#';
        logoutLink.innerHTML = '<span class="icon"></span>Déconnexion';
        logoutLink.style.color = '#ef4444';
        logoutLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('Voulez-vous vous déconnecter ?')) logout();
        });
        nav.appendChild(logoutLink);
    }
}

// ==========================================
// SIDEBAR TOGGLE (mobile)
// ==========================================

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('overlay').classList.toggle('show');
}

document.querySelectorAll('.sidebar nav a').forEach(function (link) {
    link.addEventListener('click', function () {
        if (window.innerWidth <= 768) {
            document.getElementById('sidebar').classList.remove('open');
            document.getElementById('overlay').classList.remove('show');
        }
    });
});

// ==========================================
// QR MODAL - IMPROVED
// ==========================================

let html5QrCode = null;
let isScanning = false;

function detectDevice() {
    // Détecte si c'est mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isSmallScreen = window.innerWidth < 768;
    return isMobile || isSmallScreen;
}

async function openQR() {
    document.getElementById('qrScanModal').classList.add('show');
    initQRScan();
}

function closeQRScan() {
    document.getElementById('qrScanModal').classList.remove('show');
    stopQRCamera();
    resetQRScan();
}

// ==========================================
// QR SCAN MODAL - NEW INTERFACE
// ==========================================

let qrVideoStream   = null;
let qrScanInterval  = null;
let qrLastScanned   = null;
let qrCurrentStep   = 'idle';
const qrSteps = ['idle','perm','camera','manual','loading','success','error'];

function qrGoTo(step) {
  qrSteps.forEach(s => {
    const el = document.getElementById('qr-step-' + s);
    if (el) el.classList.toggle('active', s === step);
  });
  qrCurrentStep = step;
}

function qrShowStatus(type, icon, msg) {
  const box = document.getElementById('qr-status-box');
  box.className = 'qr-scan-status-box visible ' + type;
  document.getElementById('qr-status-icon').textContent = icon;
  document.getElementById('qr-status-msg').textContent  = msg;
}
function qrClearStatus() {
  document.getElementById('qr-status-box').className = 'qr-scan-status-box';
}

function initQRScan() {
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || ('ontouchstart' in window);
  const hasCamera = isMobile && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  // Badge device
  const wrap = document.getElementById('qr-device-badge-wrap');
  wrap.innerHTML = `<span class="qr-scan-device-badge">
    ${isMobile ? '📱 Appareil mobile' : '💻 Ordinateur de bureau'}
  </span>`;

  // Sur PC: afficher directement la saisie manuelle
  if (!isMobile) {
    document.getElementById('qr-btn-open-cam').style.display = 'none';
  } else {
    const btnCam = document.getElementById('qr-btn-open-cam');
    if (hasCamera) {
      btnCam.style.display = 'flex';
    }
  }
}

document.getElementById('qr-btn-open-cam')?.addEventListener('click', () => {
  qrGoTo('perm');
  qrClearStatus();
});

document.getElementById('qr-btn-request-cam')?.addEventListener('click', requestQRCamera);
document.getElementById('qr-btn-perm-skip')?.addEventListener('click', () => {
  qrGoTo('manual'); qrClearStatus();
});

async function requestQRCamera() {
  try {
    qrShowStatus('info', '⏳', 'Demande d\'autorisation en cours…');

    const constraints = {
      video: {
        facingMode: 'environment',
        width:  { ideal: 1280 },
        height: { ideal: 720  },
      }
    };

    qrVideoStream = await navigator.mediaDevices.getUserMedia(constraints);
    const video = document.getElementById('camera-video');
    video.srcObject = qrVideoStream;
    await video.play();

    qrClearStatus();
    qrGoTo('camera');
    startQRCamera();

  } catch (err) {
    if (err.name === 'NotAllowedError') {
      qrShowStatus('warn', '🚫', 'Permission refusée. Vous pouvez saisir le code manuellement.');
    } else {
      qrShowStatus('error', '❌', 'Impossible d\'accéder à la caméra : ' + err.message);
    }
    setTimeout(() => { qrGoTo('manual'); qrClearStatus(); }, 1800);
  }
}

function startQRCamera() {
  const video  = document.getElementById('camera-video');
  const canvas = document.getElementById('camera-canvas');
  const ctx    = canvas.getContext('2d', { willReadFrequently: true });

  qrScanInterval = setInterval(() => {
    if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });

    if (code && code.data && code.data !== qrLastScanned) {
      qrLastScanned = code.data;
      stopQRCamera();
      processQRCodeScan(code.data.trim());
    }
  }, 250);
}

function stopQRCamera() {
  clearInterval(qrScanInterval);
  if (qrVideoStream) {
    qrVideoStream.getTracks().forEach(t => t.stop());
    qrVideoStream = null;
  }
}

document.getElementById('qr-btn-stop-cam')?.addEventListener('click', () => {
  stopQRCamera();
  qrLastScanned = null;
  qrGoTo('idle');
  qrClearStatus();
});

document.getElementById('qr-btn-open-manual')?.addEventListener('click', () => {
  qrGoTo('manual'); qrClearStatus();
});
document.getElementById('qr-btn-manual-back')?.addEventListener('click', () => {
  qrGoTo('idle'); qrClearStatus();
  document.getElementById('qr-manual-code').value = '';
});

document.getElementById('qr-btn-manual-submit')?.addEventListener('click', () => {
  const code = document.getElementById('qr-manual-code').value.trim();
  if (!code) {
    qrShowStatus('warn', '⚠️', 'Veuillez saisir un code avant de valider.');
    return;
  }
  processQRCodeScan(code);
});

document.getElementById('qr-manual-code')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('qr-btn-manual-submit').click();
});


// 2️⃣ Remplace processQRCodeScan ENTIÈREMENT
async function processQRCodeScan(qrValue) {
  qrClearStatus();

  // 🆕 EXTRACTION DU CODE (gère URL ou texte brut)
  let codeToCheck = qrValue.trim();
  try {
    const url = new URL(qrValue);
    const param = url.searchParams.get('code');
    if (param) codeToCheck = param.toLowerCase();
  } catch {
    codeToCheck = qrValue.toLowerCase();
  }

  if (!isValidQRFormat(codeToCheck)) {
    qrShowError('Code invalide', 'Le format du code QR est incorrect ou corrompu.');
    return;
  }

  qrGoTo('loading');
  try {
    const userData = JSON.parse(localStorage.getItem('attendly_user') || 'null');
    if (!userData || userData.role !== 'student') {
      qrShowError('Non connecté', 'Vous devez être connecté pour pointer votre présence.');
      return;
    }
    const student = { id: userData.id, full_name: userData.full_name, grade: userData.grade };

    const now = new Date().toISOString();
    const { data: sessionRaw, error: sessError } = await db
      .from('sessions')
      .select('id, subject, grade, session_date, start_time, end_time, qr_expires_at, is_active')
      .eq('qr_code', codeToCheck)
      .maybeSingle();

    if (sessError) throw sessError;

    if (!sessionRaw) {
      qrShowError('Code introuvable', 'Ce code QR ne correspond à aucune session. Vérifiez le code saisi.');
      return;
    }
    if (!sessionRaw.is_active) {
      qrShowError('Session terminée', 'Cette session a été clôturée par le professeur.');
      return;
    }
    if (sessionRaw.qr_expires_at < now) {
      const expAt = new Date(sessionRaw.qr_expires_at);
      const expStr = expAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      qrShowError('QR Code expiré', `Ce code a expiré à ${expStr}. Demandez au professeur d'en générer un nouveau.`);
      return;
    }
    const session = sessionRaw;

    if (session.grade !== student.grade) {
      qrShowError('Accès refusé', `Cette session est réservée à ${session.grade}. Votre niveau : ${student.grade}.`);
      return;
    }

    // Vérifier si déjà présent
    const { data: existing } = await db
      .from('attendance')
      .select('id, marked_at')
      .eq('student_id', student.id)
      .eq('session_id', session.id)
      .maybeSingle();

    if (existing) {
      const t = new Date(existing.marked_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      qrShowError('Déjà enregistré ✓', `Vous avez déjà été enregistré présent(e) à ${t} pour cette session.`);
      return;
    }

    // Insérer la présence
    const { data: attendance, error: attError } = await db
      .from('attendance')
      .insert({ student_id: student.id, session_id: session.id })
      .select()
      .single();

    if (attError) {
      if (attError.code === '23505') {
        qrShowError('Déjà enregistré ✓', 'Votre présence pour cette session a déjà été enregistrée.');
      } else {
        throw attError;
      }
      return;
    }

    // Envoyer une notification à l'étudiant
    const markedTime = new Date(attendance.marked_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    await db.from('notifications').insert({
      student_id: student.id,
      type: 'success',
      message: `✅ Vous avez été enregistré(e) présent(e) en ${session.subject} le ${new Date(session.session_date).toLocaleDateString('fr-FR')} à ${markedTime}.`,
      is_read: false
    });

    qrShowSuccess(session, student, attendance);
  } catch (err) {
    console.error('[QR Scanner] Erreur:', err);
    qrShowError('Erreur serveur', 'Une erreur inattendue est survenue.');
  }
}
function qrShowSuccess(session, student, attendance) {
  const markedAt = new Date(attendance.marked_at);
  const timeStr  = markedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const dateStr  = markedAt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  document.getElementById('qr-success-time').textContent = `${dateStr} à ${timeStr}`;
  document.getElementById('qr-attendance-detail').innerHTML = `
    <div class="row"><span>Étudiant</span><span>${student.full_name || 'Vous'}</span></div>
    <div class="row"><span>Matière</span><span>${session.subject}</span></div>
    <div class="row"><span>Promotion</span><span>${session.grade}</span></div>
    <div class="row"><span>Créneau</span><span>${session.start_time.slice(0,5)} – ${session.end_time.slice(0,5)}</span></div>
    <div class="row"><span>Heure de pointage</span><span>${timeStr}</span></div>
  `;

  qrGoTo('success');
}

function qrShowError(title, msg) {
  document.getElementById('qr-err-title').textContent = title;
  document.getElementById('qr-err-msg').textContent   = msg;
  qrGoTo('error');
}

document.getElementById('qr-btn-retry')?.addEventListener('click', () => {
  qrLastScanned = null;
  document.getElementById('qr-manual-code').value = '';
  qrGoTo('idle');
  qrClearStatus();
});

document.getElementById('qr-btn-restart')?.addEventListener('click', () => {
  qrLastScanned = null;
  document.getElementById('qr-manual-code').value = '';
  qrGoTo('idle');
  qrClearStatus();
});

function resetQRScan() {
  qrGoTo('idle');
  qrClearStatus();
  qrLastScanned = null;
  document.getElementById('qr-manual-code').value = '';
}

function isValidQRFormat(value) {
  if (!value || typeof value !== 'string') return false;
  // Accepte soit le code hex brut (32 chars), soit l'URL complète avec ?code=
  const hexRegex = /^[a-f0-9]{32}$/i;
  if (hexRegex.test(value)) return true;
  try {
    const url = new URL(value);
    const code = url.searchParams.get('code');
    return code ? hexRegex.test(code) : false;
  } catch { return false; }
}

window.closeQRScan = closeQRScan;

function closeQR() {
    document.getElementById('qrModal').classList.remove('show');
    stopQRScanner();
    document.getElementById('qrInput').value = '';
}

async function startQRScanner() {
    if (isScanning) return;
    
    try {
        // Vérifier si Html5Qrcode existe
        if (typeof Html5Qrcode === 'undefined') {
            throw new Error('Librairie Html5Qrcode non chargée');
        }

        // Arrêter le scanner existant s'il y en a un
        if (html5QrCode) {
            try {
                await html5QrCode.stop();
                await html5QrCode.clear();
            } catch (e) {
                console.log('Scanner arrêté');
            }
        }

        html5QrCode = new Html5Qrcode("qr-reader");
        isScanning = true;

        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            rememberLastUsedCamera: true,
            aspectRatio: 1.0
        };

        await html5QrCode.start(
            { facingMode: "environment" },
            config,
            onScanSuccess,
            onScanFailure
        );

        document.getElementById('qrMessage').textContent = 'Scannez le code QR avec votre caméra';
        document.getElementById('qrMessage').style.color = '#10b981';

    } catch (err) {
        console.error('Erreur initialisation scanner:', err);
        isScanning = false;
        
        let errorMsg = 'Erreur : Impossible d\'accéder à la caméra';
        
        if (err.message.includes('NotAllowedError')) {
            errorMsg = 'Permission d\'accès à la caméra refusée. Vérifiez vos paramètres.';
        } else if (err.message.includes('NotFoundError')) {
            errorMsg = 'Aucune caméra trouvée sur cet appareil';
        } else if (err.message.includes('Html5Qrcode')) {
            errorMsg = 'Librairie QR non chargée. Rechargez la page.';
        }
        
        document.getElementById('qrMessage').textContent = errorMsg;
        document.getElementById('qrMessage').style.color = '#ef4444';
    }
}

async function stopQRScanner() {
    if (html5QrCode && isScanning) {
        try {
            await html5QrCode.stop();
            await html5QrCode.clear();
            isScanning = false;
        } catch (err) {
            console.error('Erreur arrêt scanner:', err);
        }
    }
}

async function onScanSuccess(decodedText, decodedResult) {
    if (!isScanning) return;
    
    // Arrêter le scanning une fois qu'on a un résultat
    await stopQRScanner();
    
    // Traiter le code scanné
    await processQRCode(decodedText);
}

function onScanFailure(error) {
    // Ignorer les erreurs de scan, continuer le scanning
    // Ne pas logger les erreurs pour éviter le spam console
}

async function processQRCode(code) {
    const msg = document.getElementById('qrMessage');
    
    try {
        msg.textContent = 'Vérification du code...';
        msg.style.color = '#6b7280';
        
        await markAttendance(user.id, code);
        
        msg.textContent = '✓ Présence marquée avec succès !';
        msg.style.color = '#22c55e';
        
        // Fermer la modale après 2 secondes
        setTimeout(() => {
            closeQR();
        }, 2000);
        
    } catch (err) {
        msg.textContent = '✗ ' + (err.message || 'Erreur lors du traitement du code');
        msg.style.color = '#ef4444';
        
        // Redémarrer le scanner si on est en mode caméra
        const isMobile = detectDevice();
        if (isMobile && document.getElementById('qrScanner').style.display !== 'none') {
            setTimeout(() => {
                startQRScanner();
            }, 3000);
        }
    }
}

async function submitQR() {
    const input = document.getElementById('qrInput');
    const msg = document.getElementById('qrMessage');
    const code = input.value.trim();

    if (!code) {
        msg.textContent = '✗ Veuillez entrer le code QR';
        msg.style.color = '#ef4444';
        return;
    }

    // Désactiver le bouton pendant le traitement
    const btn = document.getElementById('qrSubmitBtn');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'En cours...';

    await processQRCode(code);
    
    input.value = '';
    btn.disabled = false;
    btn.textContent = originalText;
}

// Expose to global for onclick handlers
window.toggleSidebar = toggleSidebar;
window.openQR = openQR;
window.closeQR = closeQR;
window.submitQR = submitQR;

// Close modal on outside click / Escape
document.getElementById('qrModal')?.addEventListener('click', function (e) {
    if (e.target === this) closeQR();
});
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeQR();
});

// Permettre de soumettre avec Enter dans le champ d'entrée
document.getElementById('qrInput')?.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        submitQR();
    }
});

// ==========================================
// PAGE ROUTING
// ==========================================

async function initPage(user) {
    try {
        switch (page) {
            case 'index.html': window.location.replace('emploi.html'); return;
            case 'emploi.html': await loadSchedule(user); break;
            case 'notes.html': await loadNotes(user); break;
            case 'notifications.html': await loadNotifications(user); break;
            case 'profile.html': await loadProfile(user); break;
            case 'parametres.html': loadSettings(user); break;
        }
    } catch (err) {
        console.error('Erreur chargement page:', err);
    }
}

// ==========================================
// EMPLOI DU TEMPS (emploi.html)
// ==========================================

async function loadSchedule(user) {
    const now = new Date();
    const dateP = document.querySelector('.page-header p');
    if (dateP) {
        const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        dateP.textContent = formatGrade(user.grade) + ' — ' + (user.td_group || '') + ' — ' + dateStr;
    }

    // Highlight today's column header
    const dayNames = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const todayName = dayNames[now.getDay()];
    const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

    const container = document.getElementById('timetableContainer');
    const emptyEl = document.getElementById('emptyTimetable');

    // Highlight today's column in the static grid
    container.querySelectorAll('.tt-head[data-day]').forEach(el => {
        if (el.dataset.day === todayName) {
            el.classList.add('tt-today');
            el.innerHTML += ' <small>●</small>';
        }
    });

    // Highlight current time slot row
    const slotEnds = { '08:30': '10:00', '10:15': '11:45', '12:00': '13:00', '13:00': '14:30', '14:45': '16:15', '16:30': '18:00'};
    container.querySelectorAll('.tt-cell').forEach(cell => {
        const start = cell.dataset.start;
        const end = slotEnds[start];
        if (cell.dataset.day === todayName && start <= currentTime && end > currentTime) {
            cell.classList.add('tt-now');
        }
    });

    // Fetch schedule and populate cells
    try {
        const schedule = await getStudentSchedule(user.grade, user.td_group);

        if (!schedule || schedule.length === 0) {
            // Keep the empty grid visible, no courses to inject
            return;
        }

        // Assign colors per subject
        const colorClasses = ['', 'green', 'orange', 'pink', 'purple'];
        const subjectColors = {};
        let colorIdx = 0;
        schedule.forEach(s => {
            if (!(s.subject in subjectColors)) {
                subjectColors[s.subject] = colorClasses[colorIdx % colorClasses.length];
                colorIdx++;
            }
        });

        // Inject courses into matching cells
        schedule.forEach(s => {
            const startTime = formatTime(s.start_time);
            const day = s.day_of_week.toLowerCase();
            // Find the cell that matches this day + closest time slot
            const cell = findCell(container, day, startTime);
            if (cell) {
                const cls = subjectColors[s.subject] || '';
                cell.innerHTML = '<div class="course ' + cls + '">'
                    + s.subject
                    + '<br><small>' + (s.room || '') + '</small>'
                    + '<br><small>' + (s.professors?.full_name || '') + '</small>'
                    + (s.td_group ? '<br><small>' + s.td_group + '</small>' : '')
                    + '</div>';
            }
        });
    } catch (err) {
        console.error('Erreur chargement emploi du temps:', err);
    }
}

function findCell(container, day, startTime) {
    // Exact match first
    let cell = container.querySelector(`.tt-cell[data-day="${day}"][data-start="${startTime}"]`);
    if (cell) return cell;

    // Snap to nearest slot (for times like 08:30 -> 08:00 slot)
    const slotStarts = ['08:00', '09:30', '11:00', '12:30', '14:00', '15:30', '17:00'];
    let bestSlot = slotStarts[0];
    for (const slot of slotStarts) {
        if (slot <= startTime) bestSlot = slot;
        else break;
    }
    return container.querySelector(`.tt-cell[data-day="${day}"][data-start="${bestSlot}"]`);
}

// ==========================================
// NOTES (notes.html)
// ==========================================

async function loadNotes(user) {
    const notes = await getStudentNotes(user.id);
    const tbody = document.getElementById('notesBody');
    const emptyEl = document.getElementById('emptyNotes');

    if (!notes || notes.length === 0) {
        const tw = tbody?.closest('.table-wrapper');
        if (tw) tw.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'flex';
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    // Group notes by subject
    const grouped = {};
    notes.forEach(n => {
        if (!grouped[n.subject]) grouped[n.subject] = {};
        const type = (n.exam_type || 'autre').toLowerCase();
        if (!grouped[n.subject][type]) grouped[n.subject][type] = [];
        grouped[n.subject][type].push(n);
    });

    function avgOfType(list) {
        if (!list || list.length === 0) return null;
        const avg = list.reduce((s, n) => s + n.note, 0) / list.length;
        const max = list[0].max_note;
        return { avg, max };
    }

    let totalWeighted = 0;
    let totalCount = 0;
    let validated = 0;

    const rows = Object.entries(grouped).map(([subject, types]) => {
        const allTypes = Object.keys(types);
        const td = avgOfType(allTypes.find(k => /^td$/i.test(k)) ? types[allTypes.find(k => /^td$/i.test(k))] : null);
        const tp = avgOfType(allTypes.find(k => /^tp$/i.test(k)) ? types[allTypes.find(k => /^tp$/i.test(k))] : null);
        const exam = avgOfType(allTypes.find(k => /^(examen|exam|controle|final)$/i.test(k)) ? types[allTypes.find(k => /^(examen|exam|controle|final)$/i.test(k))] : null);

        // Calculate module average: TD 25%, TP 25%, Exam 50%
        const parts = [];
        if (td) parts.push({ val: (td.avg / td.max) * 20, weight: 0.25 });
        if (tp) parts.push({ val: (tp.avg / tp.max) * 20, weight: 0.25 });
        if (exam) parts.push({ val: (exam.avg / exam.max) * 20, weight: 0.5 });

        let moduleAvg = null;
        if (parts.length > 0) {
            const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
            moduleAvg = parts.reduce((s, p) => s + p.val * (p.weight / totalWeight), 0);
            totalWeighted += moduleAvg;
            totalCount++;
        }

        const isValidated = moduleAvg !== null && moduleAvg >= 10;
        if (isValidated) validated++;

        return '<tr>'
            + '<td>' + subject + '</td>'
            + '<td>—</td>'
            + '<td>' + (td ? td.avg.toFixed(2) + '/' + td.max : '—') + '</td>'
            + '<td>' + (tp ? tp.avg.toFixed(2) + '/' + tp.max : '—') + '</td>'
            + '<td>' + (exam ? exam.avg.toFixed(2) + '/' + exam.max : '—') + '</td>'
            + '<td>' + (moduleAvg !== null ? moduleAvg.toFixed(2) + '/20' : '—') + '</td>'
            + '<td><span class="badge ' + (isValidated ? 'green' : moduleAvg !== null ? 'red' : '') + '">'
            + (moduleAvg !== null ? (isValidated ? 'Validé' : 'Non validé') : '—') + '</span></td>'
            + '</tr>';
    });

    tbody.innerHTML = rows.join('');

    // Stats
    const avgEl = document.getElementById('noteMoyenne');
    const validEl = document.getElementById('noteValides');
    const rankEl = document.getElementById('noteClassement');

    if (avgEl) avgEl.textContent = totalCount > 0 ? (totalWeighted / totalCount).toFixed(2) + '/20' : '—';
    if (validEl) validEl.textContent = validated + '/' + totalCount;

    // Ranking
    if (rankEl && user.grade) {
        try {
            const classNotes = await getAllNotesForClass(user.grade);
            const studentAvgs = {};
            classNotes.forEach(n => {
                if (!studentAvgs[n.student_id]) studentAvgs[n.student_id] = [];
                studentAvgs[n.student_id].push(n);
            });
            const avgs = Object.entries(studentAvgs).map(([sid, notes]) => ({
                id: sid,
                avg: parseFloat(calculateAverage(notes))
            })).sort((a, b) => b.avg - a.avg);

            const myRank = avgs.findIndex(a => a.id === user.id) + 1;
            rankEl.textContent = myRank > 0 ? myRank + '/' + avgs.length : '—';
        } catch { rankEl.textContent = '—'; }
    }
}

// ==========================================
// NOTIFICATIONS (notifications.html)
// ==========================================

async function loadNotifications(user) {
    const notifications = await getStudentNotifications(user.id);
    const list = document.getElementById('notifList');
    const emptyEl = document.getElementById('emptyNotifs');

    if (!notifications || notifications.length === 0) {
        if (list) list.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'flex';
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    const typeMap = {
        'absence_warning': { dot: 'warning', label: 'Avertissement absence' },
        'info': { dot: 'info', label: 'Information' },
        'success': { dot: 'success', label: 'Succès' },
        'danger': { dot: 'danger', label: 'Urgent' }
    };

    list.innerHTML = notifications.map(n => {
        const type = typeMap[n.type] || typeMap['absence_warning'];
        const timeAgo = getTimeAgo(n.created_at);

        return '<li class="notif-item' + (n.is_read ? '' : ' unread') + '" data-id="' + n.id + '">'
            + '<div class="notif-dot ' + type.dot + '"></div>'
            + '<div class="notif-content">'
            + '<strong>' + type.label + '</strong>'
            + '<span>' + escapeHtml(n.message) + '</span>'
            + '</div>'
            + '<div class="notif-time">' + timeAgo + '</div>'
            + '</li>';
    }).join('');

    // Mark unread as read on click
    list.querySelectorAll('.notif-item.unread').forEach(item => {
        item.addEventListener('click', async () => {
            try {
                await markNotificationRead(item.dataset.id);
                item.classList.remove('unread');
            } catch (err) {
                console.error('Erreur marquage notification:', err);
            }
        });
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getTimeAgo(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "À l'instant";
    if (diffMins < 60) return 'Il y a ' + diffMins + ' min';
    if (diffHours < 24) return 'Il y a ' + diffHours + 'h';
    if (diffDays < 7) return 'Il y a ' + diffDays + 'j';
    return formatDate(dateStr);
}

// ==========================================
// PROFILE (profile.html)
// ==========================================

async function loadProfile(user) {
    let profile = user;
    try {
        profile = await getStudentProfile(user.id);
    } catch {}

    const savedPhoto = localStorage.getItem('attendly_photo_' + user.id);
    const avatar = savedPhoto || generateAvatar(profile.full_name);
    const profileAvatar = document.getElementById('profileAvatar');
    if (profileAvatar) profileAvatar.src = avatar;

    const nameEl = document.getElementById('profileName');
    const descEl = document.getElementById('profileDesc');
    const matriculeEl = document.getElementById('profileMatricule');

    if (nameEl) nameEl.textContent = profile.full_name;
    if (descEl) descEl.textContent = formatGrade(profile.grade) + (profile.td_group ? ' — ' + profile.td_group : '');
    if (matriculeEl) matriculeEl.textContent = 'CIN : ' + profile.cin;

    setValue('fieldNom', profile.full_name);
    setValue('fieldEmail', profile.email);
    setValue('fieldFaculte', 'ISIMM');
    setValue('fieldNiveau', formatGrade(profile.grade));
    setValue('fieldGroupe', profile.td_group || '—');
}

function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
}

// ==========================================
// PARAMÈTRES (parametres.html)
// ==========================================

function loadSettings(user) {
    const emailEl = document.getElementById('settingsEmail');
    if (emailEl) emailEl.value = user.email;

    const saveBtn = document.getElementById('btnSavePassword');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const currentPwd = document.getElementById('settingsCurrentPwd').value;
            const newPwd = document.getElementById('settingsNewPwd').value;

            if (!currentPwd || !newPwd) {
                alert('Veuillez remplir tous les champs');
                return;
            }
            if (newPwd.length < 8) {
                alert('Le nouveau mot de passe doit contenir au moins 8 caractères');
                return;
            }

            try {
                const currentHash = await hashPassword(currentPwd);
                const newHash = await hashPassword(newPwd);
                await changeStudentPassword(user.id, currentHash, newHash);
                alert('Mot de passe modifié avec succès');
                document.getElementById('settingsCurrentPwd').value = '';
                document.getElementById('settingsNewPwd').value = '';
            } catch (err) {
                alert(err.message || 'Erreur lors du changement de mot de passe');
            }
        });
    }

    const logoutBtn = document.getElementById('btnDeleteAccount');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Voulez-vous vous déconnecter ?')) logout();
        });
    }
}