import supabase from './supabase-client.js';

let currentSignupCIN = null;

// groupes de TD autorises ppour chaque niveau
const tdMapping = {
    'L1-info': [1, 2, 3, 4, 5],
    'L2-info': [1, 2, 3, 4],
    'L3-info': [1, 2, 3, 4, 5, 6]
};

window.toggleForms = toggleForms;
window.backToStep1 = backToStep1;
window.checkCIN = checkCIN;
window.handleSignup = handleSignup;
window.handleLogin = handleLogin;
window.performLogout = performLogout;

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

function openCurtainsAndRedirect(url) {
    const body = document.getElementById('pageBody');
    body.classList.remove('curtains-closed');
    const onTransitionEnd = (e) => {
        if (e.target.classList.contains('curtain')) {
            document.removeEventListener('transitionend', onTransitionEnd);
            window.location.href = url;
        }
    };
    document.addEventListener('transitionend', onTransitionEnd);
    setTimeout(() => {
        document.removeEventListener('transitionend', onTransitionEnd);
        window.location.href = url;
    }, 2000);
}

function toggleForms(target) {
    const loginForm = document.getElementById('loginForm');
    const signupStep1 = document.getElementById('signupFormStep1');
    const signupStep2 = document.getElementById('signupFormStep2');

    loginForm.classList.remove('active');
    signupStep1.classList.remove('active');
    signupStep2.classList.remove('active');

    if (target === 'signup') {
        signupStep1.classList.add('active');
    } else {
        loginForm.classList.add('active');
    }
}

function backToStep1() {
    document.getElementById('signupFormStep2').classList.remove('active');
    document.getElementById('signupFormStep1').classList.add('active');
    // Réinitialiser les champs de l'étape 2 sans supprimer les options TD
    document.getElementById('signupLevel').value = '';
    document.getElementById('signupTD').value = '';
    currentSignupCIN = null;
}

async function checkCIN(btn) {
    const cin = document.getElementById('signupCIN').value.trim();

    if (!/^\d{8}$/.test(cin)) {
        alert('Le CIN doit contenir exactement 8 chiffres');
        return;
    }

    btn.classList.add('loading');

    try {
        const { data, error } = await supabase
            .from('students')
            .select('email')
            .eq('cin', cin)
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            alert('CIN non trouvé. Veuillez contacter l\'administration.');
            btn.classList.remove('loading');
            return;
        }

        currentSignupCIN = cin;
        document.getElementById('displayEmail').textContent = data.email;

        // Réinitialiser les sélections pour l'étape 2
        document.getElementById('signupLevel').value = '';
        document.getElementById('signupTD').value = '';

        document.getElementById('signupFormStep1').classList.remove('active');
        document.getElementById('signupFormStep2').classList.add('active');
    } catch (err) {
        console.error('Erreur lors de la vérification du CIN :', err);
        alert('Erreur technique. Veuillez réessayer plus tard.');
    } finally {
        btn.classList.remove('loading');
    }
}

async function handleSignup(btn) {
    const password = document.getElementById('signupPassword').value;
    const passwordConfirm = document.getElementById('signupPasswordConfirm').value;
    const selectedGrade = document.getElementById('signupLevel').value;
    const selectedTD = document.getElementById('signupTD').value;
    const emailDisplay = document.getElementById('displayEmail').textContent;

    const gradeMapping = {
        'L1-info': 'licence_info_1',
        'L2-info': 'licence_info_2',
        'L3-info': 'licence_info_3'
    };
    const grade = gradeMapping[selectedGrade];
    if (!grade) {
        alert('Veuillez choisir un niveau valide');
        return;
    }
    if (!selectedTD) {
        alert('Veuillez choisir votre groupe de TD');
        return;
    }
    const tdNumber = parseInt(selectedTD.replace('TD', ''));
    if (!tdMapping[selectedGrade].includes(tdNumber)) {
        alert('Groupe de TD invalide pour ce niveau');
        return;
    }

    if (!currentSignupCIN) {
        alert('Erreur : CIN perdu. Veuillez recommencer.');
        toggleForms('signup');
        return;
    }

    if (password.length < 8) {
        alert('Le mot de passe doit contenir au moins 8 caractères');
        return;
    }

    if (password !== passwordConfirm) {
        alert('Les mots de passe ne correspondent pas');
        return;
    }

    btn.classList.add('loading');

    try {
        const { data: existing, error: checkError } = await supabase
            .from('students')
            .select('is_registered')
            .eq('cin', currentSignupCIN)
            .maybeSingle();

        if (checkError) throw checkError;

        if (existing && existing.is_registered) {
            alert('Ce compte est déjà inscrit. Veuillez vous connecter.');
            toggleForms('login');
            btn.classList.remove('loading');
            return;
        }

        const hashedPassword = await hashPassword(password);

        const { error } = await supabase
            .from('students')
            .update({
                password: hashedPassword,
                grade: grade,
                td_group: selectedTD,
                is_registered: true
            })
            .eq('cin', currentSignupCIN)
            .eq('email', emailDisplay);

        if (error) {
            console.error('Erreur Supabase:', error);
            alert('Erreur lors de la création du compte. Veuillez réessayer.');
            return;
        }

        openCurtainsAndRedirect('student/profile.html');
    } catch (err) {
        console.error('Erreur technique:', err);
        alert('Erreur technique. Veuillez réessayer plus tard.');
    } finally {
        btn.classList.remove('loading');
    }
}

async function handleLogin(btn) {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    btn.classList.add('loading');

    try {
        const { data, error } = await supabase
            .from('students')
            .select('password, is_registered')
            .eq('email', email)
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            alert('Email ou mot de passe incorrect');
            btn.classList.remove('loading');
            return;
        }

        const hashedInput = await hashPassword(password);
        if (data.password !== hashedInput) {
            alert('Email ou mot de passe incorrect');
            btn.classList.remove('loading');
            return;
        }

        if (!data.is_registered) {
            alert('Votre compte n\'est pas encore activé. Veuillez finaliser votre inscription.');
            btn.classList.remove('loading');
            return;
        }

        openCurtainsAndRedirect('student/profile.html');
    } catch (err) {
        console.error('Erreur lors de la connexion :', err);
        alert('Erreur technique. Veuillez réessayer plus tard.');
    } finally {
        btn.classList.remove('loading');
    }
}