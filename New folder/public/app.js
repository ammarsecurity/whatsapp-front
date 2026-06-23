// API Configuration
const API_BASE_URL = 'https://whatsapp.alufiq.com/api';

// State Management
let currentUser = null;
let authToken = null;
let accounts = [];

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
});

// Check if user is authenticated
function checkAuth() {
    authToken = localStorage.getItem('authToken');
    currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');

    if (authToken && currentUser) {
        showApp();
        loadAccounts();
    } else {
        showAuth();
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Auth Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.target.dataset.tab;
            switchTab(tab);
        });
    });

    // Auth Forms
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);

    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const page = e.target.dataset.page;
            switchPage(page);
        });
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Create Account
    document.getElementById('createAccountBtn').addEventListener('click', () => {
        document.getElementById('createAccountModal').classList.add('active');
    });
    document.getElementById('createAccountForm').addEventListener('submit', handleCreateAccount);

    // Send Message
    document.getElementById('sendMessageForm').addEventListener('submit', handleSendMessage);

    // Send Media
    document.getElementById('sendMediaForm').addEventListener('submit', handleSendMedia);
    document.getElementById('mediaFile').addEventListener('change', handleFileSelect);

    // Check Number
    document.getElementById('checkNumberForm').addEventListener('submit', handleCheckNumber);

    // Filters
    document.getElementById('applyFilters').addEventListener('click', loadMessages);
}

// Tab Switching
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`${tab}Tab`).classList.add('active');
}

// Page Switching
function switchPage(page) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    document.querySelector(`[data-page="${page}"]`).classList.add('active');
    document.getElementById(`${page}Page`).classList.add('active');

    // Load page-specific data
    if (page === 'accounts') {
        loadAccounts();
    } else if (page === 'messages') {
        loadMessages();
        loadAccountsForFilter();
    } else if (page === 'statistics') {
        loadStatistics();
    } else if (page === 'send') {
        loadAccountsForSend();
    } else if (page === 'send-media') {
        loadAccountsForSendMedia();
    } else if (page === 'check-number') {
        loadAccountsForCheckNumber();
    } else if (page === 'about') {
        // About page doesn't need any data loading
    }
}

// Show/Hide Views
function showAuth() {
    document.getElementById('authModal').classList.add('active');
    document.getElementById('appContainer').classList.add('hidden');
}

function showApp() {
    document.getElementById('authModal').classList.remove('active');
    document.getElementById('appContainer').classList.remove('hidden');
    if (currentUser) {
        document.getElementById('userInfo').textContent = `👤 ${currentUser.username}`;
    }
}

// API Calls
async function apiCall(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...(authToken && { 'Authorization': `Bearer ${authToken}` })
        },
        ...options
    };

    try {
        const response = await fetch(url, config);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'حدث خطأ');
        }

        return data;
    } catch (error) {
        throw error;
    }
}

// Authentication
async function handleLogin(e) {
    e.preventDefault();
    showLoading();

    try {
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;

        const data = await apiCall('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });

        authToken = data.token;
        currentUser = data.user;

        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        showToast('تم تسجيل الدخول بنجاح', 'success');
        showApp();
        loadAccounts();
    } catch (error) {
        showToast(error.message || 'فشل تسجيل الدخول', 'error');
    } finally {
        hideLoading();
    }
}

async function handleRegister(e) {
    e.preventDefault();
    showLoading();

    try {
        const username = document.getElementById('registerUsername').value;
        const password = document.getElementById('registerPassword').value;

        await apiCall('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });

        showToast('تم إنشاء الحساب بنجاح. يمكنك الآن تسجيل الدخول', 'success');
        switchTab('login');
        document.getElementById('loginUsername').value = username;
    } catch (error) {
        showToast(error.message || 'فشل إنشاء الحساب', 'error');
    } finally {
        hideLoading();
    }
}

function handleLogout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    showAuth();
    showToast('تم تسجيل الخروج', 'success');
}

// Accounts Management
async function loadAccounts() {
    showLoading();
    try {
        const data = await apiCall('/accounts');
        accounts = data.accounts;
        displayAccounts(accounts);
    } catch (error) {
        showToast(error.message || 'فشل تحميل الحسابات', 'error');
    } finally {
        hideLoading();
    }
}

function displayAccounts(accountsList) {
    const container = document.getElementById('accountsList');

    if (accountsList.length === 0) {
        container.innerHTML = `
            <div class="card" style="text-align: center; padding: 3rem;">
                <i class="fas fa-users" style="font-size: 3rem; color: #ccc; margin-bottom: 1rem;"></i>
                <p>لا توجد حسابات. قم بإضافة حساب جديد</p>
            </div>
        `;
        return;
    }

    container.innerHTML = accountsList.map(account => `
        <div class="account-card ${account.isReady ? 'ready' : 'not-ready'}">
            <div class="account-card-header">
                <div class="account-title-section">
                    <div class="account-icon-wrapper">
                        <i class="fas fa-user-circle"></i>
                    </div>
                    <div class="account-title-info">
                        <h3>${account.accountId}</h3>
                        <span class="account-id-badge">ID: ${account.accountId}</span>
                    </div>
                </div>
                <span class="status-badge ${account.isReady ? 'ready' : 'not-ready'}">
                    <i class="fas ${account.isReady ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                    ${account.isReady ? 'متصل' : 'غير متصل'}
                </span>
            </div>
            <div class="account-info">
                <div class="info-item">
                    <i class="fas fa-calendar-alt"></i>
                    <span>تم الإنشاء: ${new Date(account.createdAt).toLocaleDateString('ar')}</span>
                </div>
                ${account.hasQrCode ? `
                    <div class="info-item warning">
                        <i class="fas fa-qrcode"></i>
                        <span>يحتاج مسح QR Code</span>
                    </div>
                ` : account.isReady ? `
                    <div class="info-item success">
                        <i class="fas fa-check-circle"></i>
                        <span>الحساب جاهز للاستخدام</span>
                    </div>
                ` : ''}
            </div>
            <div class="account-card-actions">
                <button class="btn btn-secondary btn-sm" onclick="viewAccountStatus('${account.accountId}')" title="عرض التفاصيل">
                    <i class="fas fa-info-circle"></i>
                    <span>التفاصيل</span>
                </button>
                ${account.hasQrCode ? `
                    <button class="btn btn-primary btn-sm" onclick="showQRCode('${account.accountId}')" title="عرض QR Code">
                        <i class="fas fa-qrcode"></i>
                        <span>QR Code</span>
                    </button>
                ` : ''}
                <button class="btn btn-danger btn-sm" onclick="showDeleteModal('${account.accountId}')" title="حذف الحساب">
                    <i class="fas fa-trash"></i>
                    <span>حذف</span>
                </button>
            </div>
        </div>
    `).join('');
}

async function handleCreateAccount(e) {
    e.preventDefault();
    showLoading();

    try {
        const accountId = document.getElementById('newAccountId').value.trim();

        await apiCall('/accounts', {
            method: 'POST',
            body: JSON.stringify({ accountId })
        });

        showToast('تم إنشاء الحساب بنجاح. انتظر ظهور QR Code', 'success');
        closeModal('createAccountModal');
        document.getElementById('createAccountForm').reset();
        loadAccounts();
    } catch (error) {
        showToast(error.message || 'فشل إنشاء الحساب', 'error');
    } finally {
        hideLoading();
    }
}

function showDeleteModal(accountId) {
    document.getElementById('deleteAccountName').textContent = accountId;
    document.getElementById('deleteAccountModal').classList.add('active');

    // Set up confirm button
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    confirmBtn.onclick = () => {
        confirmDeleteAccount(accountId);
    };
}

function closeDeleteModal() {
    document.getElementById('deleteAccountModal').classList.remove('active');
}

async function confirmDeleteAccount(accountId) {
    closeDeleteModal();
    showLoading();

    try {
        await apiCall(`/accounts/${accountId}`, {
            method: 'DELETE'
        });

        showToast('تم حذف الحساب بنجاح', 'success');
        loadAccounts();
    } catch (error) {
        showToast(error.message || 'فشل حذف الحساب', 'error');
    } finally {
        hideLoading();
    }
}

async function viewAccountStatus(accountId) {
    try {
        const data = await apiCall(`/accounts/${accountId}/status`);
        showToast(`الحساب: ${data.connected ? 'متصل' : 'غير متصل'} - ${data.ready ? 'جاهز' : 'غير جاهز'}`, 'info');
    } catch (error) {
        showToast(error.message || 'فشل تحميل حالة الحساب', 'error');
    }
}

let qrCodeInterval = null;
let qrCodeModal = null;

async function showQRCode(accountId) {
    try {
        const data = await apiCall(`/accounts/${accountId}/qr`);

        if (data.qrCode) {
            // Clear any existing interval
            if (qrCodeInterval) {
                clearInterval(qrCodeInterval);
            }

            // Remove existing modal if any
            if (qrCodeModal) {
                qrCodeModal.remove();
            }

            // Display QR Code in modal
            qrCodeModal = document.createElement('div');
            qrCodeModal.className = 'modal active';
            qrCodeModal.innerHTML = `
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header">
                        <h3>QR Code - ${accountId}</h3>
                        <button class="close-btn" onclick="closeQRCodeModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="qr-code-container">
                        <p style="margin-bottom: 1rem; font-weight: 600;">امسح هذا الكود باستخدام WhatsApp</p>
                        <div id="qrcode" style="display: flex; justify-content: center; padding: 1rem; background: white; border-radius: 8px; margin-bottom: 1rem;"></div>
                        <p id="qrStatus" style="margin-top: 1rem; color: #666; font-size: 0.9rem; text-align: center;">
                            <i class="fas fa-info-circle"></i> افتح WhatsApp > الإعدادات > الأجهزة المرتبطة > ربط جهاز
                        </p>
                        <p id="qrLoading" style="margin-top: 0.5rem; color: var(--primary-color); font-size: 0.85rem; text-align: center; display: none;">
                            <i class="fas fa-spinner fa-spin"></i> جاري التحقق من حالة الاتصال...
                        </p>
                    </div>
                </div>
            `;
            document.body.appendChild(qrCodeModal);

            // Generate QR Code visually using qrcode.js library
            const qrContainer = document.getElementById('qrcode');
            // Clear any existing content
            qrContainer.innerHTML = '';

            // Generate QR Code
            new QRCode(qrContainer, {
                text: data.qrCode,
                width: 300,
                height: 300,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });

            // Start checking connection status every 2 seconds
            qrCodeInterval = setInterval(async () => {
                try {
                    const statusData = await apiCall(`/accounts/${accountId}/status`);

                    if (statusData.ready && statusData.connected) {
                        // Connection successful!
                        clearInterval(qrCodeInterval);
                        qrCodeInterval = null;

                        // Show success message
                        const qrStatus = document.getElementById('qrStatus');
                        const qrLoading = document.getElementById('qrLoading');
                        if (qrStatus) {
                            qrStatus.innerHTML = '<i class="fas fa-check-circle" style="color: var(--success-color);"></i> <strong style="color: var(--success-color);">تم الاتصال بنجاح!</strong>';
                        }
                        if (qrLoading) {
                            qrLoading.style.display = 'none';
                        }

                        // Reload accounts list
                        loadAccounts();

                        // Close modal after 2 seconds
                        setTimeout(() => {
                            if (qrCodeModal) {
                                qrCodeModal.remove();
                                qrCodeModal = null;
                            }
                            showToast('تم الاتصال بنجاح!', 'success');
                        }, 2000);
                    } else if (statusData.qrCode && statusData.qrCode !== data.qrCode) {
                        // QR Code has changed, update it
                        qrContainer.innerHTML = '';
                        new QRCode(qrContainer, {
                            text: statusData.qrCode,
                            width: 300,
                            height: 300,
                            colorDark: '#000000',
                            colorLight: '#ffffff',
                            correctLevel: QRCode.CorrectLevel.H
                        });
                        data.qrCode = statusData.qrCode;
                    }
                } catch (error) {
                    console.error('Error checking connection status:', error);
                }
            }, 2000); // Check every 2 seconds
        } else {
            showToast('QR Code غير متاح', 'warning');
        }
    } catch (error) {
        showToast(error.message || 'فشل تحميل QR Code', 'error');
    }
}

function closeQRCodeModal() {
    if (qrCodeInterval) {
        clearInterval(qrCodeInterval);
        qrCodeInterval = null;
    }
    if (qrCodeModal) {
        qrCodeModal.remove();
        qrCodeModal = null;
    }
}

// Send Messages
async function loadAccountsForSend() {
    try {
        const data = await apiCall('/accounts');
        const select = document.getElementById('sendAccountId');
        select.innerHTML = '<option value="">اختر الحساب...</option>';

        const readyAccounts = data.accounts.filter(account => account.isReady);

        readyAccounts.forEach(account => {
            const option = document.createElement('option');
            option.value = account.accountId;
            option.textContent = `${account.accountId} ${account.isReady ? '(جاهز)' : ''}`;
            select.appendChild(option);
        });

        // إذا كان هناك حساب واحد فقط، حدده تلقائياً
        if (readyAccounts.length === 1) {
            select.value = readyAccounts[0].accountId;
        }
    } catch (error) {
        showToast('فشل تحميل الحسابات', 'error');
    }
}

async function handleSendMessage(e) {
    e.preventDefault();
    showLoading();

    try {
        const accountId = document.getElementById('sendAccountId').value;
        const phoneNumbersText = document.getElementById('phoneNumbers').value;
        const message = document.getElementById('messageText').value;

        // Parse phone numbers (support comma and newline separated)
        const phoneNumbers = phoneNumbersText
            .split(/[,\n]/)
            .map(num => num.trim())
            .filter(num => num.length > 0);

        if (phoneNumbers.length === 0) {
            throw new Error('يرجى إدخال رقم هاتف واحد على الأقل');
        }

        const data = await apiCall('/send', {
            method: 'POST',
            body: JSON.stringify({
                accountId,
                phoneNumbers,
                message
            })
        });

        displaySendResults(data);
        showToast(`تم إرسال ${data.successCount} من ${data.total} رسالة`, 'success');
        document.getElementById('sendMessageForm').reset();
    } catch (error) {
        showToast(error.message || 'فشل إرسال الرسالة', 'error');
    } finally {
        hideLoading();
    }
}

function displaySendResults(data) {
    const container = document.getElementById('sendResults');
    container.innerHTML = `
        <h3>نتائج الإرسال</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 1rem 0;">
            <div class="stat-card" style="padding: 1rem;">
                <h3>${data.total}</h3>
                <p>إجمالي</p>
            </div>
            <div class="stat-card success" style="padding: 1rem;">
                <h3>${data.successCount}</h3>
                <p>نجحت</p>
            </div>
            <div class="stat-card danger" style="padding: 1rem;">
                <h3>${data.failureCount}</h3>
                <p>فشلت</p>
            </div>
        </div>
        <div class="results-container">
            ${data.results.map(result => `
                <div class="result-item ${result.success ? 'success' : 'error'}">
                    <div>
                        <strong>${result.phoneNumber}</strong>
                        ${result.error ? `<div style="font-size: 0.9rem; margin-top: 0.25rem;">${result.error}</div>` : ''}
                    </div>
                    <span>${result.success ? '✓' : '✗'}</span>
                </div>
            `).join('')}
        </div>
    `;
}

// Send Media Functions
async function loadAccountsForSendMedia() {
    try {
        const data = await apiCall('/accounts');
        const select = document.getElementById('sendMediaAccountId');
        select.innerHTML = '<option value="">اختر الحساب...</option>';

        const readyAccounts = data.accounts.filter(account => account.isReady);

        readyAccounts.forEach(account => {
            const option = document.createElement('option');
            option.value = account.accountId;
            option.textContent = `${account.accountId} ${account.isReady ? '(جاهز)' : ''}`;
            select.appendChild(option);
        });

        if (readyAccounts.length === 1) {
            select.value = readyAccounts[0].accountId;
        }
    } catch (error) {
        showToast('فشل تحميل الحسابات', 'error');
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    const fileName = document.getElementById('fileName');
    const label = e.target.nextElementSibling;

    if (file) {
        fileName.textContent = file.name;
        label.classList.add('has-file');

        // Auto-detect media type based on file extension
        const ext = file.name.split('.').pop().toLowerCase();
        const mediaTypeSelect = document.getElementById('mediaType');

        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
            mediaTypeSelect.value = 'image';
        } else if (['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext)) {
            mediaTypeSelect.value = 'video';
        } else if (['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext)) {
            mediaTypeSelect.value = 'audio';
        } else {
            mediaTypeSelect.value = 'document';
        }
    } else {
        fileName.textContent = 'اختر ملف...';
        label.classList.remove('has-file');
    }
}

async function handleSendMedia(e) {
    e.preventDefault();
    showLoading();

    try {
        const accountId = document.getElementById('sendMediaAccountId').value;
        const phoneNumbersText = document.getElementById('mediaPhoneNumbers').value;
        const fileInput = document.getElementById('mediaFile');
        const mediaType = document.getElementById('mediaType').value;
        const caption = document.getElementById('mediaCaption').value;

        if (!fileInput.files || fileInput.files.length === 0) {
            throw new Error('يرجى اختيار ملف');
        }

        const file = fileInput.files[0];

        // Check file size (100MB max)
        const maxSize = 100 * 1024 * 1024; // 100MB
        if (file.size > maxSize) {
            throw new Error('حجم الملف كبير جداً. الحد الأقصى هو 100MB');
        }

        // Parse phone numbers
        const phoneNumbers = phoneNumbersText
            .split(/[,\n]/)
            .map(num => num.trim())
            .filter(num => num.length > 0);

        if (phoneNumbers.length === 0) {
            throw new Error('يرجى إدخال رقم هاتف واحد على الأقل');
        }

        // Create FormData
        const formData = new FormData();
        formData.append('accountId', accountId);
        formData.append('phoneNumbers', JSON.stringify(phoneNumbers));
        formData.append('file', file);
        formData.append('mediaType', mediaType);
        if (caption.trim()) {
            formData.append('caption', caption.trim());
        }

        // Send request
        const url = `${API_BASE_URL}/send-media`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'حدث خطأ');
        }

        displaySendMediaResults(data);
        showToast(`تم إرسال ${data.successCount} من ${data.total} ملف`, 'success');
        document.getElementById('sendMediaForm').reset();
        document.getElementById('fileName').textContent = 'اختر ملف...';
        document.getElementById('mediaFile').nextElementSibling.classList.remove('has-file');
    } catch (error) {
        showToast(error.message || 'فشل إرسال الملف', 'error');
    } finally {
        hideLoading();
    }
}

function displaySendMediaResults(data) {
    const container = document.getElementById('sendMediaResults');
    container.innerHTML = `
        <h3>نتائج الإرسال</h3>
        <div style="margin: 1rem 0; padding: 1rem; background: #f9f9f9; border-radius: 8px;">
            <p><strong>اسم الملف:</strong> ${data.fileName}</p>
            <p><strong>نوع الملف:</strong> ${data.mediaType}</p>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 1rem 0;">
            <div class="stat-card" style="padding: 1rem;">
                <h3>${data.total}</h3>
                <p>إجمالي</p>
            </div>
            <div class="stat-card success" style="padding: 1rem;">
                <h3>${data.successCount}</h3>
                <p>نجحت</p>
            </div>
            <div class="stat-card danger" style="padding: 1rem;">
                <h3>${data.failureCount}</h3>
                <p>فشلت</p>
            </div>
        </div>
        <div class="results-container">
            ${data.results.map(result => `
                <div class="result-item ${result.success ? 'success' : 'error'}">
                    <div>
                        <strong>${result.phoneNumber}</strong>
                        ${result.error ? `<div style="font-size: 0.9rem; margin-top: 0.25rem;">${result.error}</div>` : ''}
                    </div>
                    <span>${result.success ? '✓' : '✗'}</span>
                </div>
            `).join('')}
        </div>
    `;
}

// Messages History
async function loadAccountsForFilter() {
    try {
        const data = await apiCall('/accounts');
        const select = document.getElementById('filterAccount');
        select.innerHTML = '<option value="">جميع الحسابات</option>';

        data.accounts.forEach(account => {
            const option = document.createElement('option');
            option.value = account.accountId;
            option.textContent = account.accountId;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load accounts for filter:', error);
    }
}

async function loadMessages() {
    showLoading();
    try {
        const accountId = document.getElementById('filterAccount')?.value || '';
        const status = document.getElementById('filterStatus')?.value || '';

        const params = new URLSearchParams();
        if (accountId) params.append('accountId', accountId);
        if (status) params.append('status', status);

        const data = await apiCall(`/messages?${params.toString()}`);
        displayMessages(data.messages);
    } catch (error) {
        showToast(error.message || 'فشل تحميل الرسائل', 'error');
    } finally {
        hideLoading();
    }
}

function displayMessages(messages) {
    const container = document.getElementById('messagesList');

    if (messages.length === 0) {
        container.innerHTML = `
            <div class="card" style="text-align: center; padding: 3rem;">
                <i class="fas fa-inbox" style="font-size: 3rem; color: #ccc; margin-bottom: 1rem;"></i>
                <p>لا توجد رسائل</p>
            </div>
        `;
        return;
    }

    container.innerHTML = messages.map(msg => `
        <div class="message-item ${msg.status}">
            <div class="message-header">
                <div>
                    <span class="message-phone">${msg.phone_number}</span>
                    <span class="message-status ${msg.status}">${getStatusText(msg.status)}</span>
                </div>
                <div style="font-size: 0.85rem; color: #999;">
                    ${msg.account_id}
                </div>
            </div>
            <div class="message-text">${msg.message_text}</div>
            <div class="message-meta">
                <span>${new Date(msg.created_at).toLocaleString('ar')}</span>
                ${msg.error_message ? `<span style="color: var(--danger-color);">${msg.error_message}</span>` : ''}
            </div>
        </div>
    `).join('');
}

function getStatusText(status) {
    const statusMap = {
        'sent': 'مرسلة',
        'failed': 'فاشلة',
        'pending': 'قيد الانتظار'
    };
    return statusMap[status] || status;
}

// Statistics
async function loadStatistics() {
    showLoading();
    try {
        const data = await apiCall('/messages/statistics');
        displayStatistics(data.statistics);
    } catch (error) {
        showToast(error.message || 'فشل تحميل الإحصائيات', 'error');
    } finally {
        hideLoading();
    }
}

function displayStatistics(stats) {
    const container = document.getElementById('statisticsCards');
    container.innerHTML = `
        <div class="stat-card">
            <h3>${stats.total || 0}</h3>
            <p><i class="fas fa-envelope"></i> إجمالي الرسائل</p>
        </div>
        <div class="stat-card success">
            <h3>${stats.sent || 0}</h3>
            <p><i class="fas fa-check-circle"></i> مرسلة</p>
        </div>
        <div class="stat-card danger">
            <h3>${stats.failed || 0}</h3>
            <p><i class="fas fa-times-circle"></i> فاشلة</p>
        </div>
        <div class="stat-card warning">
            <h3>${stats.pending || 0}</h3>
            <p><i class="fas fa-clock"></i> قيد الانتظار</p>
        </div>
    `;
}

// Utility Functions
function showLoading() {
    document.getElementById('loadingSpinner').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loadingSpinner').classList.add('hidden');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    toast.innerHTML = `
        <i class="fas ${icons[type] || icons.info}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastSlideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Check Number Functions
async function loadAccountsForCheckNumber() {
    try {
        const data = await apiCall('/accounts');
        const select = document.getElementById('checkNumberAccountId');
        select.innerHTML = '<option value="">-- اختر الحساب --</option>';

        data.accounts.forEach(account => {
            if (account.isReady) {
                const option = document.createElement('option');
                option.value = account.accountId;
                option.textContent = `${account.accountId} ${account.isReady ? '(جاهز)' : ''}`;
                select.appendChild(option);
            }
        });
    } catch (error) {
        showToast('فشل تحميل الحسابات', 'error');
    }
}

async function handleCheckNumber(e) {
    e.preventDefault();
    showLoading();

    try {
        const accountId = document.getElementById('checkNumberAccountId').value;
        const phoneNumber = document.getElementById('checkNumberPhone').value.trim();

        if (!accountId) {
            throw new Error('يرجى اختيار الحساب');
        }

        if (!phoneNumber) {
            throw new Error('يرجى إدخال رقم الهاتف');
        }



        const NumberService = require('../services/NumberService');
        const numberService = new NumberService('http://localhost:3000');
        const exists = await numberService.checkNumber(phone);



        // const data = await apiCall('/messages/check-number', {
        //     method: 'POST',
        //     body: JSON.stringify({
        //         accountId,
        //         phoneNumber
        //     })
        // });

        hideLoading();

        // Show result
        const resultDiv = document.getElementById('checkNumberResult');
        const resultIcon = document.getElementById('resultIcon');
        const resultTitle = document.getElementById('resultTitle');
        const resultMessage = document.getElementById('resultMessage');
        const resultPhoneNumber = document.getElementById('resultPhoneNumber');
        const resultFormattedNumber = document.getElementById('resultFormattedNumber');
        const resultStatus = document.getElementById('resultStatus');

        resultDiv.style.display = 'block';

        if (data.isRegistered) {
            resultIcon.className = 'fas fa-check-circle';
            resultIcon.style.color = '#28a745';
            resultTitle.textContent = 'الرقم مسجل في WhatsApp';
            resultMessage.textContent = 'يمكنك إرسال رسالة إلى هذا الرقم';
            resultStatus.innerHTML = '<span style="color: #28a745; font-weight: bold;">✓ مسجل</span>';
        } else {
            resultIcon.className = 'fas fa-times-circle';
            resultIcon.style.color = '#dc3545';
            resultTitle.textContent = 'الرقم غير مسجل في WhatsApp';
            resultMessage.textContent = 'هذا الرقم غير مسجل في WhatsApp. لا يمكن إرسال رسالة إليه.';
            resultStatus.innerHTML = '<span style="color: #dc3545; font-weight: bold;">✗ غير مسجل</span>';
        }

        resultPhoneNumber.textContent = data.phoneNumber;
        resultFormattedNumber.textContent = data.formattedNumber;

        showToast('تم التحقق من الرقم بنجاح', 'success');

        // Scroll to result
        resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (error) {
        hideLoading();
        showToast(error.message || 'حدث خطأ أثناء التحقق من الرقم', 'error');

        // Hide result on error
        document.getElementById('checkNumberResult').style.display = 'none';
    }
}

// Make functions globally available
window.viewAccountStatus = viewAccountStatus;
window.showQRCode = showQRCode;
window.showDeleteModal = showDeleteModal;
window.closeDeleteModal = closeDeleteModal;
window.closeModal = closeModal;
window.closeQRCodeModal = closeQRCodeModal;

