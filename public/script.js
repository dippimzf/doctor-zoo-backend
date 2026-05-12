let currentUser = null;
let servicesList = [];

async function apiCall(url, method = 'GET', data = null) {
    const options = {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
    };
    if (data) options.body = JSON.stringify(data);
    const response = await fetch(url, options);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Ошибка запроса');
    return result;
}

async function fetchCurrentUser() {
    try {
        const result = await apiCall('/api/me');
        currentUser = result.user;
        renderAuthArea();
        renderClientAppointmentsBlock();
        renderClientNotifications();
        return currentUser;
    } catch (error) {
        console.error('Ошибка:', error);
        return null;
    }
}

async function registerUser(name, phone, gender, password) {
    return await apiCall('/api/register', 'POST', { name, phone, gender, password });
}

async function loginUser(phone, password) {
    return await apiCall('/api/login', 'POST', { phone, password });
}

async function logoutUser() {
    await apiCall('/api/logout', 'POST');
    currentUser = null;
    renderAuthArea();
    const adminPanel = document.getElementById('adminPanel');
    if (adminPanel) adminPanel.classList.remove('active');
    const clientBlock = document.getElementById('clientAppointmentsBlock');
    if (clientBlock) clientBlock.style.display = 'none';
    const notifBlock = document.getElementById('notificationsBlock');
    if (notifBlock) notifBlock.style.display = 'none';
}

async function fetchServices() {
    try {
        servicesList = await apiCall('/api/services');
        populateServiceSelects();
        renderServicesGrid();
        return servicesList;
    } catch (error) {
        console.error('Ошибка загрузки услуг:', error);
        return [];
    }
}

async function fetchAppointments() {
    try {
        return await apiCall('/api/appointments');
    } catch (error) {
        console.error('Ошибка загрузки записей:', error);
        return [];
    }
}

async function createAppointment(petType, serviceId, date, time, symptoms) {
    return await apiCall('/api/appointments', 'POST', { petType, serviceId, date, time, symptoms });
}

async function cancelAppointment(appointmentId) {
    return await apiCall(`/api/appointments/${appointmentId}`, 'DELETE');
}

async function rescheduleAppointment(appointmentId, date, time) {
    return await apiCall(`/api/appointments/${appointmentId}/reschedule`, 'PUT', { date, time });
}

async function updateServiceDuration(serviceId, duration) {
    return await apiCall(`/api/services/${serviceId}`, 'PUT', { duration });
}

async function fetchNotifications() {
    try {
        return await apiCall('/api/notifications');
    } catch (error) {
        return [];
    }
}

async function markNotificationRead(notificationId) {
    return await apiCall(`/api/notifications/${notificationId}/read`, 'PUT');
}

async function fetchAvailableSlots(date, serviceId) {
    try {
        return await apiCall(`/api/available-slots?date=${date}&serviceId=${serviceId}`);
    } catch (error) {
        return [];
    }
}

async function fetchReviews() {
    try {
        return await apiCall('/api/reviews');
    } catch (error) {
        return [];
    }
}

function renderAuthArea() {
    const authArea = document.getElementById('authArea');
    if (!authArea) return;
    
    if (currentUser) {
        const roleBadge = currentUser.role === 'admin' ? '<span class="admin-badge">Админ</span>' : 
                         (currentUser.role === 'vet' ? '<span class="vet-badge">Врач</span>' : '');
        
        authArea.innerHTML = `<div class="profile-icon" id="profileIcon"><img src="./image/user_icon_150670.png" class="profile-icon-img" alt="user" style="width:20px;height:20px;">${currentUser.name} ${roleBadge}</div>`;
        
        const profileIcon = document.getElementById('profileIcon');
        if (profileIcon) profileIcon.addEventListener('click', showProfile);
        
        const adminPanel = document.getElementById('adminPanel');
        if (adminPanel) {
            if (currentUser.role === 'admin' || currentUser.role === 'vet') {
                adminPanel.classList.add('active');
                renderAdminPanel();
            } else {
                adminPanel.classList.remove('active');
            }
        }
    } else {
        authArea.innerHTML = '<button class="guest-login-btn" id="loginBtn">Войти / Регистрация</button>';
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) loginBtn.addEventListener('click', () => {
            const authModal = document.getElementById('authModal');
            if (authModal) authModal.style.display = 'flex';
        });
        const adminPanel = document.getElementById('adminPanel');
        if (adminPanel) adminPanel.classList.remove('active');
    }
}

async function renderAdminPanel() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'vet')) return;
    
    const appointmentsDiv = document.getElementById('appointmentsList');
    if (!appointmentsDiv) return;
    
    const appointments = await fetchAppointments();
    
    if (appointments.length === 0) {
        appointmentsDiv.innerHTML = '<p>Нет записей на приём</p>';
    } else {
        appointmentsDiv.innerHTML = appointments.map(app => {
            let timeStr = app.appointment_time || '';
            if (timeStr.includes(':')) timeStr = timeStr.substring(0, 5);
            return `
            <div class="appointment-item">
                <div>
                    <strong>${app.pet_type || 'Не указано'}</strong><br>
                    <small>Клиент: ${app.user_name || 'ID: ' + app.user_id}</small><br>
                    <small>Дата: ${app.appointment_date} | Время: ${timeStr}</small><br>
                    <small>Услуга: ${app.service_name || 'Услуга'}</small><br>
                    <small>Жалобы: ${app.symptoms || '—'}</small>
                </div>
                <div>
                    <button class="btn-reschedule" onclick="openRescheduleModal(${app.id})">Перенести</button>
                    <button class="btn-cancel" onclick="cancelAppointmentHandler(${app.id})">Отменить</button>
                </div>
            </div>
        `}).join('');
    }
    
    const servicesDiv = document.getElementById('servicesList');
    if (servicesDiv && servicesList.length > 0) {
        servicesDiv.innerHTML = servicesList.map(service => `
            <div class="appointment-item">
                <div>
                    <strong>${service.title}</strong><br>
                    <small>Длительность: ${service.duration} мин</small>
                    <div style="margin-top: 10px;">
                        <input type="number" id="duration_${service.id}" value="${service.duration}" style="width:100px; padding:5px;" min="15" step="5">
                        <button class="btn-edit" onclick="updateServiceDurationHandler(${service.id})">Сохранить</button>
                    </div>
                </div>
            </div>
        `).join('');
    }
}

async function renderClientAppointmentsBlock() {
    const block = document.getElementById('clientAppointmentsBlock');
    if (!block) return;
    
    if (currentUser && currentUser.role === 'client') {
        const appointments = await fetchAppointments();
        block.style.display = 'block';
        if (appointments.length === 0) {
            block.innerHTML = `<div class="client-appointments-title">Ваши записи</div><div class="no-appointments-msg">У вас пока нет активных записей.</div>`;
        } else {
            block.innerHTML = `
                <div class="client-appointments-title">Ваши записи</div>
                <div class="client-appointments-list">
                    ${appointments.map(app => {
                        let timeStr = app.appointment_time || '';
                        if (timeStr.includes(':')) timeStr = timeStr.substring(0, 5);
                        return `
                        <div class="client-app-item">
                            <div class="client-app-info">
                                <strong>${app.appointment_date} ${timeStr}</strong> — ${app.service_name || 'Услуга'}<br>
                                <span style="font-size:12px;">${app.pet_type || ''}</span>
                            </div>
                            <button class="btn-cancel-small" onclick="cancelAppointmentHandler(${app.id})">Отменить</button>
                        </div>
                    `}).join('')}
                </div>
            `;
        }
    } else {
        block.style.display = 'none';
    }
}

async function renderClientNotifications() {
    const block = document.getElementById('notificationsBlock');
    if (!block) return;
    
    if (currentUser && currentUser.role === 'client') {
        const notifications = await fetchNotifications();
        const unreadNotifications = notifications.filter(n => !n.is_read);
        
        if (unreadNotifications.length > 0) {
            block.style.display = 'block';
            block.innerHTML = `
                <div class="client-appointments-title">Уведомления (${unreadNotifications.length})</div>
                <div class="client-appointments-list">
                    ${unreadNotifications.map(n => `
                        <div class="notification-item">
                            <strong>${n.title || 'Информация'}</strong><br>
                            ${n.message || ''}<br>
                            <small style="color:#6b7280;">${new Date(n.created_at).toLocaleString()}</small><br>
                            <button class="btn-cancel-small" style="margin-top:5px;" onclick="markNotificationReadHandler(${n.id})">Отметить прочитанным</button>
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            block.style.display = 'none';
        }
    } else {
        block.style.display = 'none';
    }
}

function populateServiceSelects() {
    const selects = ['serviceSelect', 'vetServiceSelect'];
    selects.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.innerHTML = '<option value="">-- Выберите услугу --</option>';
            servicesList.forEach(service => {
                const option = document.createElement('option');
                option.value = service.id;
                option.textContent = `${service.title} (${service.duration} мин)`;
                select.appendChild(option);
            });
        }
    });
}

function renderServicesGrid() {
    const grid = document.getElementById('servicesGrid');
    if (!grid) return;
    
    const servicesData = [
        { title: "Терапия", desc: "Первичный осмотр, диагностика и назначение лечения.", fullDesc: "Полное клиническое обследование, сбор анамнеза, термометрия, пальпация, аускультация. Подбор индивидуального лечения.", icon: "./image/90bb77f2c204ee2ed71fc3a004f01eeaa58c6513.png" },
        { title: "Вакцинация", desc: "Комплексные прививки для собак и кошек. Паспорта.", fullDesc: "Вакцинация от бешенства, чумы плотоядных, парвовирусного энтерита и других опасных заболеваний.", icon: "./image/d685307b45b9cf506caf226626ba18c349181124.png" },
        { title: "Стоматология", desc: "Чистка зубов, удаление, лечение.", fullDesc: "Профессиональная гигиена полости рта, удаление зубного камня, лечение гингивита и стоматита.", icon: "./image/5df1d4c7a72e5226cf83512efc5bfa4282e06026.png" },
        { title: "Хирургия", desc: "Плановые и экстренные операции любой сложности.", fullDesc: "Стерилизация и кастрация, удаление новообразований, ушивание ран, кесарево сечение.", icon: "./image/1bef5b70a7815fd684b040072466aa12155935fd.png" },
        { title: "УЗИ", desc: "Проведение узи для животных", fullDesc: "УЗ-диагностика брюшной полости, сердца (ЭхоКГ), почек, печени, мочевого пузыря.", icon: "./image/f3f529b9e0b5a4d9f5ec3d1d4822a0655423929a.png" },
        { title: "Груминг", desc: "Стрижка, мытье и уход за шерстью вашего любимца.", fullDesc: "Комплексный уход: гигиеническая и модельная стрижка, чистка ушей, стрижка когтей.", icon: "./image/ec4751ae27fd1e80becb1c3b95ee752bc80ac92a.png" }
    ];
    
    grid.innerHTML = servicesData.map(service => `
        <div class="service-card" onclick="showServiceDetail('${service.title}', '${service.fullDesc}')">
            <div class="service-icon"><img src="${service.icon}" alt="${service.title}" onerror="this.src='https://via.placeholder.com/28'"></div>
            <div class="service-title">${service.title}</div>
            <div class="service-desc">${service.desc}</div>
            <a class="service-link">Подробнее →</a>
        </div>
    `).join('');
}

async function renderTimeSlots() {
    const date = document.getElementById('appDate').value;
    const serviceId = document.getElementById('serviceSelect').value;
    const container = document.getElementById('timeSlotsContainer');
    
    if (!date) {
        if (container) container.innerHTML = '<span style="color:#999;">Сначала выберите дату</span>';
        return;
    }
    if (!serviceId) {
        if (container) container.innerHTML = '<span style="color:#999;">Сначала выберите услугу</span>';
        return;
    }
    
    const slots = await fetchAvailableSlots(date, serviceId);
    if (slots.length === 0) {
        if (container) container.innerHTML = '<span style="color:#ef4444;">Нет доступного времени на эту дату</span>';
        return;
    }
    
    if (container) {
        container.innerHTML = slots.map(slot => `<div class="time-slot" data-time="${slot}">${slot}</div>`).join('');
        document.querySelectorAll('#timeSlotsContainer .time-slot').forEach(el => {
            el.addEventListener('click', () => {
                document.querySelectorAll('#timeSlotsContainer .time-slot').forEach(s => s.classList.remove('selected'));
                el.classList.add('selected');
                const appTime = document.getElementById('appTime');
                if (appTime) appTime.value = el.dataset.time;
            });
        });
    }
}

window.cancelAppointmentHandler = async function(appId) {
    if (confirm('Отменить эту запись?')) {
        try {
            await cancelAppointment(appId);
            alert('Запись отменена');
            await renderClientAppointmentsBlock();
            await renderAdminPanel();
            await renderClientNotifications();
        } catch (error) {
            alert('Ошибка: ' + error.message);
        }
    }
};

window.markNotificationReadHandler = async function(notifId) {
    try {
        await markNotificationRead(notifId);
        await renderClientNotifications();
        renderAuthArea();
    } catch (error) {
        console.error('Ошибка:', error);
    }
};

window.updateServiceDurationHandler = async function(serviceId) {
    const durationInput = document.getElementById(`duration_${serviceId}`);
    if (!durationInput) return;
    const newDuration = parseInt(durationInput.value);
    if (isNaN(newDuration) || newDuration < 15) {
        alert('Длительность должна быть не менее 15 минут');
        return;
    }
    try {
        await updateServiceDuration(serviceId, newDuration);
        alert('Длительность услуги обновлена!');
        await fetchServices();
        await renderAdminPanel();
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
};

window.openRescheduleModal = async function(appointmentId) {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'vet')) {
        alert('Только администратор или врач могут переносить записи');
        return;
    }
    
    const appointments = await fetchAppointments();
    const appointment = appointments.find(a => a.id === appointmentId);
    if (!appointment) {
        alert('Запись не найдена');
        return;
    }
    
    const newDate = prompt('Введите новую дату (ГГГГ-ММ-ДД):', appointment.appointment_date);
    if (!newDate) return;
    
    const newDateObj = new Date(newDate);
    if (newDateObj.getDay() === 1) {
        alert('Понедельник - выходной день. Выберите другой день.');
        return;
    }
    
    const slots = await fetchAvailableSlots(newDate, appointment.service_id);
    if (slots.length === 0) {
        alert('На выбранную дату нет свободных слотов');
        return;
    }
    
    const timeOptions = slots.join(', ');
    let newTime = prompt(`Выберите новое время из доступных:\n${timeOptions}\n\nВведите время в формате ЧЧ:ММ`, appointment.appointment_time);
    if (!newTime) return;
    if (newTime.length === 4) newTime = '0' + newTime;
    if (!slots.includes(newTime)) {
        alert('Выбранное время недоступно');
        return;
    }
    
    try {
        await rescheduleAppointment(appointmentId, newDate, newTime);
        alert('Запись успешно перенесена!');
        await renderAdminPanel();
        await renderClientAppointmentsBlock();
        await renderClientNotifications();
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
};

window.showServiceDetail = function(title, fullDesc) {
    const modalTitle = document.getElementById('modalTitle');
    const modalDesc = document.getElementById('modalDesc');
    const serviceModal = document.getElementById('serviceModal');
    if (modalTitle) modalTitle.innerText = title;
    if (modalDesc) modalDesc.innerHTML = fullDesc;
    if (serviceModal) serviceModal.style.display = 'flex';
};

window.closeServiceModal = function() {
    const modal = document.getElementById('serviceModal');
    if (modal) modal.style.display = 'none';
};

window.closeProfileModal = function() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.style.display = 'none';
};

window.closeAuthModal = function() {
    const modal = document.getElementById('authModal');
    if (modal) modal.style.display = 'none';
};

window.showProfile = async function() {
    if (!currentUser) return;
    
    const genderSym = currentUser.gender === 'male' ? 'Мужской' : (currentUser.gender === 'female' ? 'Женский' : 'Не указан');
    const appointments = await fetchAppointments();
    const notifications = await fetchNotifications();
    
    let appsHtml = '<h4 style="margin-top:20px;">Мои записи:</h4>';
    if (appointments.length === 0) {
        appsHtml += '<p>Нет записей</p>';
    } else {
        appsHtml += appointments.map(app => {
            let timeStr = app.appointment_time || '';
            if (timeStr.includes(':')) timeStr = timeStr.substring(0, 5);
            return `
            <div style="border-bottom:1px solid #eee; padding:8px 0;">
                <strong>${app.appointment_date} ${timeStr}</strong><br>
                ${app.pet_type || ''} - ${app.service_name || 'Услуга'}<br>
                <button class="btn-cancel" style="margin-top:8px;" onclick="cancelAppointmentHandler(${app.id})">Отменить запись</button>
            </div>
        `}).join('');
    }
    
    let notifHtml = '<h4>Уведомления:</h4>';
    if (notifications.length === 0) {
        notifHtml += '<p>Нет уведомлений</p>';
    } else {
        notifHtml += notifications.map(n => `
            <div class="notification-item" style="margin-bottom:8px;">
                <strong>${n.title || 'Информация'}</strong><br>
                ${n.message || ''}<br>
                <small>${new Date(n.created_at).toLocaleString()}</small>
            </div>
        `).join('');
    }
    
    const profileInfo = document.getElementById('profileInfo');
    if (profileInfo) {
        profileInfo.innerHTML = `
            <p><strong>Имя:</strong> ${currentUser.name}</p>
            <p><strong>Телефон:</strong> ${currentUser.phone}</p>
            <p><strong>Пол:</strong> ${genderSym}</p>
            <p><strong>Роль:</strong> ${currentUser.role === 'admin' ? 'Администратор' : (currentUser.role === 'vet' ? 'Ветеринар' : 'Клиент')}</p>
        `;
    }
    
    const profileNotifications = document.getElementById('profileNotifications');
    if (profileNotifications) profileNotifications.innerHTML = notifHtml;
    
    const myAppointments = document.getElementById('myAppointments');
    if (myAppointments) myAppointments.innerHTML = appsHtml;
    
    const profileModal = document.getElementById('profileModal');
    if (profileModal) profileModal.style.display = 'flex';
};

window.logout = async function() {
    await logoutUser();
    const profileModal = document.getElementById('profileModal');
    if (profileModal) profileModal.style.display = 'none';
    location.reload();
};

window.showRegisterForm = function() {
    const loginContainer = document.getElementById('loginFormContainer');
    const registerContainer = document.getElementById('registerFormContainer');
    if (loginContainer) loginContainer.style.display = 'none';
    if (registerContainer) registerContainer.style.display = 'block';
};

window.showLoginForm = function() {
    const loginContainer = document.getElementById('loginFormContainer');
    const registerContainer = document.getElementById('registerFormContainer');
    if (loginContainer) loginContainer.style.display = 'block';
    if (registerContainer) registerContainer.style.display = 'none';
};

window.scrollReviews = function(direction) {
    const carousel = document.getElementById('reviewsCarousel');
    if (carousel) carousel.scrollBy({ left: direction * 400, behavior: 'smooth' });
};

function initYandexMap() {
    if (typeof ymaps !== 'undefined') {
        ymaps.ready(() => {
            try {
                const map = new ymaps.Map('yandex-map', {
                    center: [52.581, 104.432],
                    zoom: 17,
                    controls: ['zoomControl', 'fullscreenControl']
                });
                const placemark = new ymaps.Placemark([52.581, 104.432], {
                    hintContent: 'Ветеринарный кабинет "Доктор ЗОО"',
                    balloonContent: 'Доктор ЗОО<br>с. Оек, ул. Кирова, д. 142<br>8 (908) 662-82-77'
                });
                map.geoObjects.add(placemark);
            } catch(e) {
                console.warn("Ошибка карты:", e);
            }
        });
    } else {
        setTimeout(initYandexMap, 500);
    }
}

function setupEventListeners() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const phone = document.getElementById('loginIdentifier').value;
            const password = document.getElementById('loginPassword').value;
            try {
                const result = await loginUser(phone, password);
                if (result.success) {
                    currentUser = result.user;
                    renderAuthArea();
                    closeAuthModal();
                    alert(`Добро пожаловать, ${currentUser.name}!`);
                    await renderClientAppointmentsBlock();
                    await renderClientNotifications();
                    if (currentUser.role === 'admin' || currentUser.role === 'vet') await renderAdminPanel();
                }
            } catch (error) {
                alert('Ошибка входа: ' + error.message);
            }
        });
    }
    
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('regName').value;
            const phone = document.getElementById('regPhone').value;
            const gender = document.getElementById('regGender').value;
            const password = document.getElementById('regPassword').value;
            const passwordConfirm = document.getElementById('regPasswordConfirm').value;
            const passwordError = document.getElementById('passwordError');
            if (password !== passwordConfirm) {
                if (passwordError) passwordError.innerText = 'Пароли не совпадают';
                return;
            }
            if (password.length < 4) {
                if (passwordError) passwordError.innerText = 'Пароль должен быть не менее 4 символов';
                return;
            }
            try {
                const result = await registerUser(name, phone, gender, password);
                if (result.success) {
                    currentUser = result.user;
                    renderAuthArea();
                    closeAuthModal();
                    alert('Регистрация успешна!');
                    await renderClientAppointmentsBlock();
                }
            } catch (error) {
                if (passwordError) passwordError.innerText = error.message;
            }
        });
    }
    
    const appointmentForm = document.getElementById('appointmentForm');
    if (appointmentForm) {
        appointmentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUser) {
                alert('Для записи необходимо авторизоваться!');
                const authModal = document.getElementById('authModal');
                if (authModal) authModal.style.display = 'flex';
                return;
            }
            if (currentUser.role !== 'client') {
                alert('Только клиенты могут записываться на приём');
                return;
            }
            const petType = document.getElementById('petType').value;
            const serviceId = document.getElementById('serviceSelect').value;
            const date = document.getElementById('appDate').value;
            const time = document.getElementById('appTime').value;
            const symptoms = document.querySelector('#appointmentForm textarea').value;
            if (!serviceId || !date || !time) {
                alert('Заполните все обязательные поля');
                return;
            }
            try {
                await createAppointment(petType, parseInt(serviceId), date, time, symptoms);
                alert('Запись успешно создана!');
                document.getElementById('appDate').value = '';
                document.getElementById('appTime').value = '';
                const textarea = document.querySelector('#appointmentForm textarea');
                if (textarea) textarea.value = '';
                document.getElementById('serviceSelect').value = '';
                const slotsContainer = document.getElementById('timeSlotsContainer');
                if (slotsContainer) slotsContainer.innerHTML = '<span style="color:#999;">Сначала выберите дату и услугу</span>';
                await renderClientAppointmentsBlock();
                await renderAdminPanel();
                await renderClientNotifications();
            } catch (error) {
                alert('Ошибка: ' + error.message);
            }
        });
    }
    
    const serviceSelect = document.getElementById('serviceSelect');
    if (serviceSelect) serviceSelect.addEventListener('change', renderTimeSlots);
    
    const appDate = document.getElementById('appDate');
    if (appDate) appDate.addEventListener('change', renderTimeSlots);
    
    const bookNowBtn = document.getElementById('bookNowBtn');
    if (bookNowBtn) bookNowBtn.addEventListener('click', () => {
        const bookingSection = document.getElementById('booking');
        if (bookingSection) bookingSection.scrollIntoView({ behavior: 'smooth' });
    });
    
    const learnMoreBtn = document.getElementById('learnMoreBtn');
    if (learnMoreBtn) learnMoreBtn.addEventListener('click', () => {
        const aboutSection = document.getElementById('about');
        if (aboutSection) aboutSection.scrollIntoView({ behavior: 'smooth' });
    });
    
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', () => {
        const navMenu = document.getElementById('navMenu');
        if (navMenu) navMenu.classList.toggle('active');
    });
    
    document.querySelectorAll('.nav-menu a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            const target = document.getElementById(targetId);
            if (target) target.scrollIntoView({ behavior: 'smooth' });
            if (window.innerWidth <= 768) {
                const navMenu = document.getElementById('navMenu');
                if (navMenu) navMenu.classList.remove('active');
            }
        });
    });
    
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.admin-content').forEach(c => c.classList.remove('active'));
            const tabName = tab.dataset.tab;
            const target = document.getElementById(`tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
            if (target) target.classList.add('active');
        });
    });
}

async function initReviews() {
    const reviews = await fetchReviews();
    const reviewsContainer = document.getElementById('reviewsCarousel');
    if (reviewsContainer && reviews.length > 0) {
        reviewsContainer.innerHTML = reviews.map(review => `
            <div class="review-card">
                <div class="review-rating">${'⭐'.repeat(review.rating)}</div>
                <p class="review-text">"${review.text}"</p>
                <div class="review-author">${review.author_name || 'Аноним'}</div>
                <div class="review-date">${new Date(review.created_at).toLocaleDateString('ru-RU')}</div>
            </div>
        `).join('');
    }
}

async function init() {
    await fetchCurrentUser();
    await fetchServices();
    await initReviews();
    setupEventListeners();
    initYandexMap();
}

init();