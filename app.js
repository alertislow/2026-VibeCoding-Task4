import { CONFIG } from './config.js';

// ---- 全局狀態 ----
const STATE = {
    user: { name: '', email: '', role: 'user' },
    tokenClient: null,
    settings: {}, // { TodayRestaurant: 'R01' }
    restaurants: [], // [{ id: 'R01', name: 'Mac' }]
    menu: [], // [{id, resId, name, price, customizations}]
    todayDateStr: new Date().toISOString().split('T')[0],
    currentOrderItem: null
};

// ---- DOM 節點 ----
const DOM = {
    loginView: document.getElementById('login-container'),
    appView: document.getElementById('app-container'),
    authBtn: document.getElementById('auth-btn'),
    loader: document.querySelector('.loader'),
    btnText: document.querySelector('.btn-text'),
    logoutBtn: document.getElementById('logout-btn'),

    displayRole: document.getElementById('display-role'),
    displayName: document.getElementById('display-name'),
    displayEmail: document.getElementById('display-email'),

    navBtns: document.querySelectorAll('.nav-btn[data-target]'),
    sections: document.querySelectorAll('.view-section'),
    adminOnlyEls: document.querySelectorAll('.admin-only'),

    menuContainer: document.getElementById('menu-container'),
    todayResName: document.getElementById('today-restaurant-name'),
    dateDisplay: document.getElementById('date-display'),

    // modal
    orderModal: document.getElementById('order-modal'),
    modalClose: document.getElementById('modal-close'),
    modalItemName: document.getElementById('modal-item-name'),
    modalItemPrice: document.getElementById('modal-item-price'),
    customizationsContainer: document.getElementById('customizations-container'),
    qtyInput: document.getElementById('order-quantity'),
    qtyPlus: document.getElementById('qty-plus'),
    qtyMinus: document.getElementById('qty-minus'),
    remarksInput: document.getElementById('order-remarks'),
    modalTotalPrice: document.getElementById('modal-total-price'),
    btnSubmitOrder: document.getElementById('btn-submit-order'),

    // orders view
    ordersTableBody: document.getElementById('orders-table-body'),
    myTotalCost: document.getElementById('my-total-cost'),
    allTotalCost: document.getElementById('all-total-cost'),

    // admin panel
    adminResSelect: document.getElementById('admin-restaurant-select'),
    btnSaveRes: document.getElementById('btn-save-restaurant'),
    btnCopySummary: document.getElementById('btn-copy-summary'),
    orderSummaryText: document.getElementById('order-summary-text'),
    btnClearOld: document.getElementById('btn-clear-old'),

    // Admin CRUD - Res
    newResName: document.getElementById('new-res-name'),
    btnAddRes: document.getElementById('btn-add-res'),
    adminResList: document.getElementById('admin-res-list'),

    // Admin CRUD - Menu
    adminMenuResSelect: document.getElementById('admin-menu-res-select'),
    adminMenuEditor: document.getElementById('admin-menu-editor'),
    newMenuName: document.getElementById('new-menu-name'),
    newMenuPrice: document.getElementById('new-menu-price'),
    newMenuCustom: document.getElementById('new-menu-custom'),
    btnAddMenu: document.getElementById('btn-add-menu'),
    adminMenuList: document.getElementById('admin-menu-list')
};

// ---- 工具函數 ----
const showToast = (msg, isError = false) => {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast ${isError ? 'toast-error' : ''}`;
    setTimeout(() => toast.classList.add('hidden'), 3000);
};

const setLoading = (isLoading) => {
    if (isLoading) {
        DOM.loader.classList.remove('hidden');
        DOM.btnText.classList.add('hidden');
        DOM.authBtn.disabled = true;
    } else {
        DOM.loader.classList.add('hidden');
        DOM.btnText.classList.remove('hidden');
        DOM.authBtn.disabled = false;
    }
};

const switchView = (targetId) => {
    DOM.sections.forEach(sec => sec.classList.remove('active'));
    document.getElementById(targetId).classList.add('active');
    DOM.navBtns.forEach(btn => {
        if (btn.dataset.target === targetId) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    if (targetId === 'orders-view') loadTodayOrders();
    if (targetId === 'admin-panel') renderAdminPanel();
};

function generateId(prefix) {
    return prefix + Math.floor(Math.random() * 1000000);
}

// ---- 初始化與認證 (與 localStorage) ----
function initGoogleAPI() {
    const d = new Date();
    DOM.dateDisplay.textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 菜單清單`;

    STATE.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: CONFIG.SCOPES,
        callback: async (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                const token = tokenResponse.access_token;
                // 到期時間約 3599 秒
                const expiresAt = new Date().getTime() + (tokenResponse.expires_in * 1000);

                try {
                    // Fetch user info with token
                    const userInfoResp = await fetch(`https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${token}`);
                    const userInfo = await userInfoResp.json();

                    const sessionData = {
                        token: token,
                        expiresAt: expiresAt,
                        email: userInfo.email,
                        name: userInfo.name || userInfo.email.split('@')[0]
                    };
                    localStorage.setItem('vibe_session', JSON.stringify(sessionData));
                    loadSessionAndStartApp(sessionData);

                } catch (e) {
                    setLoading(false);
                    showToast('獲取 Google 帳戶資訊失敗', true);
                }
            } else {
                setLoading(false);
            }
        },
    });

    checkPersistedSession();
}
window.onload = initGoogleAPI; // 等候 gapi script 載入

async function checkPersistedSession() {
    const sessionStr = localStorage.getItem('vibe_session');
    if (sessionStr) {
        const session = JSON.parse(sessionStr);
        if (new Date().getTime() < session.expiresAt) {
            // Token is still valid, bypass explicit login
            setLoading(true);
            loadSessionAndStartApp(session);
            return;
        } else {
            localStorage.removeItem('vibe_session');
        }
    }
}

DOM.authBtn.addEventListener('click', () => {
    setLoading(true);
    STATE.tokenClient.requestAccessToken({ prompt: '' });
});

async function loadSessionAndStartApp(sessionData) {
    STATE.user.name = sessionData.name;
    STATE.user.email = sessionData.email;

    // Check role by email
    STATE.user.role = CONFIG.ADMIN_EMAILS.includes(sessionData.email) ? 'admin' : 'user';

    gapi.load('client', async () => {
        try {
            await gapi.client.init({
                discoveryDocs: CONFIG.DISCOVERY_DOCS,
            });
            gapi.client.setToken({ access_token: sessionData.token });

            // 介面轉換
            DOM.loginView.classList.add('hidden');
            DOM.appView.classList.remove('hidden');
            DOM.displayName.textContent = STATE.user.name;
            DOM.displayEmail.textContent = STATE.user.email;
            DOM.displayRole.textContent = STATE.user.role === 'admin' ? '管理員' : '一般用戶';

            if (STATE.user.role === 'admin') {
                DOM.adminOnlyEls.forEach(el => el.classList.remove('hidden'));
            } else {
                DOM.adminOnlyEls.forEach(el => el.classList.add('hidden'));
                DOM.navBtns.forEach(btn => {
                    if (btn.dataset.target === 'admin-panel') btn.style.display = 'none';
                });
            }

            await fetchData();
        } catch (err) {
            setLoading(false);
            localStorage.removeItem('vibe_session');
            showToast('初始化連線失敗，請重新登入', true);
            console.error(err);
        }
    });
}

DOM.logoutBtn.addEventListener('click', () => {
    DOM.appView.classList.add('hidden');
    DOM.loginView.classList.remove('hidden');
    gapi.client.setToken('');
    localStorage.removeItem('vibe_session');
    setLoading(false);
    showToast('已登出');
});

// ---- 資料存取 ----
async function fetchData() {
    try {
        const response = await gapi.client.sheets.spreadsheets.values.batchGet({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            ranges: [CONFIG.RANGES.SETTINGS, CONFIG.RANGES.RESTAURANTS, CONFIG.RANGES.MENU]
        });

        const valueRanges = response.result.valueRanges;

        // Parse Settings
        let settingsRows = valueRanges[0].values || [];
        STATE.settings = {};
        settingsRows.forEach(row => { if (row[0]) STATE.settings[row[0]] = row[1] || ''; });

        // Parse Restaurants array
        let resRows = valueRanges[1].values || [];
        STATE.restaurants = resRows.filter(r => r[0]).map(row => ({ id: row[0], name: row[1] }));

        // Parse Menu array
        let menuRows = valueRanges[2].values || [];
        STATE.menu = menuRows.filter(r => r[0]).map(row => ({
            id: row[0],
            resId: row[1],
            name: row[2],
            price: parseInt(row[3]) || 0,
            customizations: row[4] || ''
        }));

        await checkAndSeedData();
        renderDashboard();
    } catch (err) {
        showToast('載入資料失敗，若為首次使用可能您試算表無預期資料格式', true);
        console.error(err);
    }
}

async function checkAndSeedData() {
    try {
        let dirtyRes = false;
        let dirtyMenu = false;
        let macResId = null;

        const hasMac = STATE.restaurants.some(r => r.name === '麥當勞');
        if (!hasMac) {
            macResId = generateId('R-');
            STATE.restaurants.push({ id: macResId, name: '麥當勞' });
            dirtyRes = true;

            const newMenuItems = [
                { id: generateId('M-'), resId: macResId, name: '大麥克', price: 80, customizations: '套餐:單點,經典套餐,清爽套餐' },
                { id: generateId('M-'), resId: macResId, name: '麥香魚', price: 60, customizations: '套餐:單點,經典套餐' },
                { id: generateId('M-'), resId: macResId, name: '薯條', price: 40, customizations: '尺寸:小,中,大' },
                { id: generateId('M-'), resId: macResId, name: '玉米湯', price: 40, customizations: '尺寸:小,大' },
                { id: generateId('M-'), resId: macResId, name: '可樂', price: 33, customizations: '冰塊:正常,少冰,去冰;尺寸:小,中,大' }
            ];
            STATE.menu.push(...newMenuItems);
            dirtyMenu = true;
        }

        const hasMoreRes = STATE.restaurants.some(r => r.name === '鼎泰豐');
        if (!hasMoreRes) {
            showToast('自動幫您建立其他 4 家餐廳與餐點...');
            
            const additionalRes = [
                { name: '鼎泰豐', items: [
                    { name: '小籠包', price: 230, custom: '份量:半籠,一籠' },
                    { name: '排骨蛋炒飯', price: 280, custom: '飯:白米,糙米' },
                    { name: '紅油抄手', price: 180, custom: '辣度:微辣,中辣,大辣' },
                    { name: '酸辣湯', price: 100, custom: '尺寸:小,中,大' },
                    { name: '元盅雞湯', price: 220, custom: '' }
                ]},
                { name: '八方雲集', items: [
                    { name: '招牌鍋貼', price: 65, custom: '數量:10個,15個' },
                    { name: '韭菜水餃', price: 65, custom: '數量:10個,15個' },
                    { name: '古早味乾麵', price: 45, custom: '辣度:不辣,小辣' },
                    { name: '玉米濃湯', price: 35, custom: '' },
                    { name: '寒天真傳紅茶', price: 30, custom: '冰塊:正常,去冰;甜度:正常,半糖' }
                ]},
                { name: '健康小廚', items: [
                    { name: '舒肥雞胸肉餐盒', price: 120, custom: '飯:紫米,白米,不飯換菜' },
                    { name: '薄鹽烤鮭魚餐盒', price: 150, custom: '飯:紫米,白米,不飯換菜' },
                    { name: '蒜香滷牛腱餐盒', price: 140, custom: '飯:紫米,白米,不飯換菜' },
                    { name: '田園綜合鮮蔬餐', price: 100, custom: '醬料:和風,胡麻,不加醬' },
                    { name: '無糖綠茶', price: 30, custom: '冰塊:正常,去冰' }
                ]},
                { name: '五十嵐', items: [
                    { name: '1號(珍波椰青茶)', price: 45, custom: '冰塊:正常,少冰,去冰;甜度:正常,半糖,無糖' },
                    { name: '波霸奶茶', price: 50, custom: '冰塊:正常,少冰,去冰;甜度:正常,半糖,無糖;尺寸:中,大' },
                    { name: '四季春青茶', price: 35, custom: '冰塊:正常,去冰;甜度:正常,無糖' },
                    { name: '冰淇淋紅茶', price: 50, custom: '冰塊:去冰;甜度:正常,無糖' },
                    { name: '燕麥奶茶', price: 55, custom: '冰塊:正常,去冰;甜度:正常,半糖' }
                ]}
            ];

            additionalRes.forEach(r => {
                const resId = generateId('R-');
                STATE.restaurants.push({ id: resId, name: r.name });
                r.items.forEach(i => {
                    STATE.menu.push({ id: generateId('M-'), resId, name: i.name, price: i.price, customizations: i.custom });
                });
            });
            dirtyRes = true;
            dirtyMenu = true;
        }

        if (dirtyRes) {
            const resDataRows = STATE.restaurants.map(r => [r.id, r.name]);
            await syncWholeSheet('Restaurants!A:B', ['ID', 'Name'], resDataRows);
        }

        if (dirtyMenu) {
            const menuDataRows = STATE.menu.map(m => [m.id, m.resId, m.name, m.price, m.customizations]);
            await syncWholeSheet('Menu!A:E', ['ID', 'RestaurantID', 'Name', 'Price', 'Customizations'], menuDataRows);
        }

        // 當第一次寫入麥當勞時才主動更改今日標記，其餘情況不影響正在用餐設定
        if (!hasMac && macResId) {
            STATE.settings['TodayRestaurant'] = macResId;
            const response = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: CONFIG.SPREADSHEET_ID, range: 'Settings!A:B' });
            let rows = response.result.values || [];
            let rowIndex = -1;
            for (let i = 0; i < rows.length; i++) { if (rows[i][0] === 'TodayRestaurant') { rowIndex = i + 1; break; } }

            if (rowIndex > 0) {
                await gapi.client.sheets.spreadsheets.values.update({
                    spreadsheetId: CONFIG.SPREADSHEET_ID, range: `Settings!B${rowIndex}`, valueInputOption: 'USER_ENTERED', resource: { values: [[macResId]] }
                });
            } else {
                await gapi.client.sheets.spreadsheets.values.append({
                    spreadsheetId: CONFIG.SPREADSHEET_ID, range: 'Settings!A:B', valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', resource: { values: [['TodayRestaurant', macResId]] }
                });
            }
        }

        if (dirtyRes || dirtyMenu) {
            showToast('預設資料建立完成！總計 5 家餐廳已寫入。');
        }

    } catch (err) {
        console.error("AutoSeed Error", err);
        showToast('自動建立資料時失敗: ' + (err.message || JSON.stringify(err)), true);
    }
}

function getResName(id) {
    const match = STATE.restaurants.find(r => r.id === id);
    return match ? match.name : id;
}

// ---- 首頁點餐渲染 ----
function renderDashboard() {
    DOM.menuContainer.innerHTML = '';
    const todayResId = STATE.settings['TodayRestaurant'];

    if (!todayResId) {
        DOM.todayResName.textContent = "尚未設定";
        DOM.menuContainer.innerHTML = '<p class="text-sm">管理員尚未設定今日餐廳。</p>';
        return;
    }

    DOM.todayResName.textContent = getResName(todayResId);

    const todayMenu = STATE.menu.filter(m => m.resId === todayResId);
    if (todayMenu.length === 0) {
        DOM.menuContainer.innerHTML = '<p class="text-sm">該餐廳尚未建置餐點。</p>';
        return;
    }

    todayMenu.forEach(item => {
        const card = document.createElement('div');
        card.className = 'menu-card glass-panel';
        card.innerHTML = `
            <div>
                <h3>${item.name}</h3>
            </div>
            <div class="card-footer">
                <span class="price">$${item.price}</span>
                <button class="add-btn" data-id="${item.id}">+</button>
            </div>
        `;
        card.addEventListener('click', () => openOrderModal(item));
        DOM.menuContainer.appendChild(card);
    });
}

// ---- Modal 點餐邏輯 ----
function openOrderModal(item) {
    STATE.currentOrderItem = item;
    DOM.modalItemName.textContent = item.name;
    DOM.modalItemPrice.textContent = `$${item.price}`;
    DOM.qtyInput.value = 1;
    DOM.remarksInput.value = '';
    updateModalPrice();

    DOM.customizationsContainer.innerHTML = '';
    if (item.customizations) {
        const groups = item.customizations.split(';');
        groups.forEach(g => {
            const parts = g.split(':');
            if (parts.length === 2) {
                const labelName = parts[0].trim();
                const options = parts[1].split(',').map(o => o.trim());

                const groupDiv = document.createElement('div');
                groupDiv.className = 'form-group';
                groupDiv.innerHTML = `<label>${labelName}</label>`;

                const select = document.createElement('select');
                select.className = 'custom-select';
                select.dataset.label = labelName;
                options.forEach(opt => {
                    const optionTag = document.createElement('option');
                    optionTag.value = opt;
                    optionTag.textContent = opt;
                    select.appendChild(optionTag);
                });
                groupDiv.appendChild(select);
                DOM.customizationsContainer.appendChild(groupDiv);
            }
        });
    }

    DOM.orderModal.classList.remove('hidden');
}

function updateModalPrice() {
    if (!STATE.currentOrderItem) return;
    const qty = parseInt(DOM.qtyInput.value) || 1;
    DOM.modalTotalPrice.textContent = `$${STATE.currentOrderItem.price * qty}`;
}

DOM.qtyPlus.addEventListener('click', () => { DOM.qtyInput.value = parseInt(DOM.qtyInput.value) + 1; updateModalPrice(); });
DOM.qtyMinus.addEventListener('click', () => { if (DOM.qtyInput.value > 1) { DOM.qtyInput.value = parseInt(DOM.qtyInput.value) - 1; updateModalPrice(); } });
DOM.qtyInput.addEventListener('change', updateModalPrice);

DOM.modalClose.addEventListener('click', () => { DOM.orderModal.classList.add('hidden'); });

DOM.btnSubmitOrder.addEventListener('click', async () => {
    if (!STATE.currentOrderItem) return;
    const item = STATE.currentOrderItem;
    const qty = parseInt(DOM.qtyInput.value) || 1;
    const total = qty * item.price;
    const remarks = DOM.remarksInput.value.trim();

    let customArr = [];
    document.querySelectorAll('.custom-select').forEach(sel => customArr.push(`${sel.value}`));
    let customText = customArr.join(' / ');
    if (remarks) customText += ` (備註: ${remarks})`;

    const orderId = 'ORD-' + Date.now();
    const rowData = [
        orderId,
        STATE.todayDateStr,
        STATE.user.name,
        DOM.todayResName.textContent,
        item.name,
        customText,
        qty,
        total
    ];

    DOM.btnSubmitOrder.disabled = true;
    DOM.btnSubmitOrder.textContent = '送出中...';

    try {
        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: 'Orders!A:H',
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: { values: [rowData] }
        });
        showToast('訂單送出成功！');
        DOM.orderModal.classList.add('hidden');
    } catch (err) {
        showToast('送出失敗', true);
        console.error(err);
    } finally {
        DOM.btnSubmitOrder.disabled = false;
        DOM.btnSubmitOrder.textContent = '確認送出訂單';
    }
});

// ---- 今日訂單邏輯 ----
async function loadTodayOrders() {
    DOM.ordersTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">載入中...</td></tr>';
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range: CONFIG.RANGES.ORDERS
        });

        let rows = response.result.values || [];
        let myTotal = 0; let allTotal = 0; let tableHTML = '';

        const todayRows = rows.filter(row => row[1] === STATE.todayDateStr && row[3] === DOM.todayResName.textContent);

        todayRows.forEach(row => {
            const userName = row[2] || '';
            const itemName = row[4] || '';
            const custom = row[5] || '';
            const qty = row[6] || '1';
            const cost = parseInt(row[7]) || 0;

            allTotal += cost;
            if (userName === STATE.user.name) myTotal += cost;

            tableHTML += `<tr><td>${userName}</td><td>${itemName}</td><td class="text-sm">${custom}</td><td>${qty}</td><td class="highlight">$${cost}</td></tr>`;
        });

        if (todayRows.length === 0) tableHTML = '<tr><td colspan="5" style="text-align:center;">今日尚無人點餐。</td></tr>';

        DOM.ordersTableBody.innerHTML = tableHTML;
        DOM.myTotalCost.textContent = `$${myTotal}`;
        DOM.allTotalCost.textContent = `$${allTotal}`;
    } catch (err) {
        DOM.ordersTableBody.innerHTML = '<tr><td colspan="5">載入錯誤</td></tr>';
    }
}

// ---- 管理員核心：與試算表全覆寫 (CRUD Helper) ----
async function syncWholeSheet(range, headerRow, dataArray) {
    // dataArray parameter format: [ ["col1", "col2"...] ... ]
    const finalData = [headerRow, ...dataArray];
    // Clear
    await gapi.client.sheets.spreadsheets.values.clear({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        range: range
    });
    // Update
    await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        range: range.split('!')[0] + '!A1', // force update starting A1
        valueInputOption: 'USER_ENTERED',
        resource: { values: finalData }
    });
}

// ---- 管理員：選單渲染 ----
function renderAdminPanel() {
    // 渲染「設定今日餐廳」選項
    DOM.adminResSelect.innerHTML = '<option value="">請選擇餐廳</option>';
    STATE.restaurants.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name;
        if (STATE.settings['TodayRestaurant'] === r.id) opt.selected = true;
        DOM.adminResSelect.appendChild(opt);
    });

    // 渲染「餐廳清單」CRUD
    DOM.adminResList.innerHTML = '';
    STATE.restaurants.forEach(r => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${r.name}</span> <button data-id="${r.id}">刪除</button>`;
        li.querySelector('button').addEventListener('click', () => handleDeleteRes(r.id));
        DOM.adminResList.appendChild(li);
    });

    // 渲染「維護菜單：選取區」
    DOM.adminMenuResSelect.innerHTML = '<option value="">選擇要編輯菜單的餐廳...</option>';
    STATE.restaurants.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name;
        DOM.adminMenuResSelect.appendChild(opt);
    });

    loadAdminSummary();
}

// 餐廳新增
DOM.btnAddRes.addEventListener('click', async () => {
    const name = DOM.newResName.value.trim();
    if (!name) return;
    DOM.btnAddRes.disabled = true;

    const newId = generateId('R-');
    STATE.restaurants.push({ id: newId, name: name });

    try {
        const dataRows = STATE.restaurants.map(r => [r.id, r.name]);
        await syncWholeSheet('Restaurants!A:B', ['ID', 'Name'], dataRows);
        DOM.newResName.value = '';
        renderAdminPanel();
        showToast('新增餐廳成功');
    } catch (err) {
        showToast('新增失敗', true);
    } finally {
        DOM.btnAddRes.disabled = false;
    }
});

// 餐廳刪除
async function handleDeleteRes(id) {
    if (!confirm('確定刪除此餐廳？(相關的菜單依然會留在後台)')) return;
    STATE.restaurants = STATE.restaurants.filter(r => r.id !== id);
    try {
        const dataRows = STATE.restaurants.map(r => [r.id, r.name]);
        await syncWholeSheet('Restaurants!A:B', ['ID', 'Name'], dataRows);
        renderAdminPanel();
        showToast('已刪除餐廳');
    } catch (err) { showToast('刪除失敗', true); }
}

// 產生今日餐廳選定
DOM.btnSaveRes.addEventListener('click', async () => {
    const selectedRes = DOM.adminResSelect.value;
    if (!selectedRes) return showToast('請選擇餐廳', true);

    DOM.btnSaveRes.disabled = true;
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: CONFIG.SPREADSHEET_ID, range: 'Settings!A:B' });
        const rows = response.result.values || [];
        let rowIndex = -1;
        for (let i = 0; i < rows.length; i++) { if (rows[i][0] === 'TodayRestaurant') { rowIndex = i + 1; break; } }

        if (rowIndex > 0) {
            await gapi.client.sheets.spreadsheets.values.update({
                spreadsheetId: CONFIG.SPREADSHEET_ID, range: `Settings!B${rowIndex}`, valueInputOption: 'USER_ENTERED', resource: { values: [[selectedRes]] }
            });
        } else {
            await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: CONFIG.SPREADSHEET_ID, range: 'Settings!A:B', valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', resource: { values: [['TodayRestaurant', selectedRes]] }
            });
        }
        STATE.settings['TodayRestaurant'] = selectedRes;
        renderDashboard();
        showToast('發布成功！');
    } catch (err) { showToast('設定失敗', true); }
    finally { DOM.btnSaveRes.disabled = false; }
});

// 菜單維護區連動
DOM.adminMenuResSelect.addEventListener('change', () => {
    const resId = DOM.adminMenuResSelect.value;
    if (resId) {
        DOM.adminMenuEditor.classList.remove('hidden');
        renderAdminMenuList(resId);
    } else {
        DOM.adminMenuEditor.classList.add('hidden');
    }
});

function renderAdminMenuList(resId) {
    DOM.adminMenuList.innerHTML = '';
    const items = STATE.menu.filter(m => m.resId === resId);
    items.forEach(m => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div style="flex:1;"><b>${m.name}</b> <span class="highlight">$${m.price}</span> <div class="text-sm">${m.customizations}</div></div>
            <button data-id="${m.id}">刪除</button>
        `;
        li.querySelector('button').addEventListener('click', () => handleDeleteMenu(m.id, resId));
        DOM.adminMenuList.appendChild(li);
    });
}

DOM.btnAddMenu.addEventListener('click', async () => {
    const resId = DOM.adminMenuResSelect.value;
    const name = DOM.newMenuName.value.trim();
    const price = parseInt(DOM.newMenuPrice.value);
    const custom = DOM.newMenuCustom.value.trim();

    if (!resId || !name || isNaN(price)) return showToast('資料不完整', true);

    DOM.btnAddMenu.disabled = true;
    STATE.menu.push({ id: generateId('M-'), resId, name, price, customizations: custom });

    try {
        const dataRows = STATE.menu.map(m => [m.id, m.resId, m.name, m.price, m.customizations]);
        await syncWholeSheet('Menu!A:E', ['ID', 'RestaurantID', 'Name', 'Price', 'Customizations'], dataRows);

        DOM.newMenuName.value = ''; DOM.newMenuPrice.value = ''; DOM.newMenuCustom.value = '';
        renderAdminMenuList(resId);
        showToast('新增餐點成功');
    } catch (err) { showToast('新增失敗', true); }
    finally { DOM.btnAddMenu.disabled = false; }
});

async function handleDeleteMenu(id, resId) {
    if (!confirm('確定刪除這個餐點？')) return;
    STATE.menu = STATE.menu.filter(m => m.id !== id);
    try {
        const dataRows = STATE.menu.map(m => [m.id, m.resId, m.name, m.price, m.customizations]);
        await syncWholeSheet('Menu!A:E', ['ID', 'RestaurantID', 'Name', 'Price', 'Customizations'], dataRows);
        renderAdminMenuList(resId);
        showToast('刪除餐點成功');
    } catch (err) { showToast('刪除失敗', true); }
}

async function loadAdminSummary() {
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: CONFIG.SPREADSHEET_ID, range: CONFIG.RANGES.ORDERS });
        let rows = response.result.values || [];
        const todayRows = rows.filter(row => row[1] === STATE.todayDateStr && row[3] === DOM.todayResName.textContent);

        let summary = `【${DOM.todayResName.textContent} 點餐明細】\n`;
        let grandTotal = 0;
        todayRows.forEach(row => {
            const userName = row[2] || ''; const itemName = row[4] || ''; const custom = row[5] ? `(${row[5]})` : '';
            const qty = row[6] || 1; const cost = parseInt(row[7]) || 0;
            grandTotal += cost;
            summary += `${userName}：${itemName}${custom} x${qty} ($${cost})\n`;
        });
        summary += `\n結算總金額：$${grandTotal}`;
        DOM.orderSummaryText.value = summary;
        DOM.orderSummaryText.classList.remove('hidden');
    } catch (e) { }
}

DOM.btnCopySummary.addEventListener('click', () => {
    DOM.orderSummaryText.classList.remove('hidden');
    DOM.orderSummaryText.select();
    document.execCommand('copy');
    showToast('已複製明細內容！');
});

DOM.btnClearOld.addEventListener('click', async () => {
    if (!confirm('這將刪除所有「非今日」或「非當前餐廳」的訂單，確定嗎？')) return;
    DOM.btnClearOld.disabled = true;
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: CONFIG.SPREADSHEET_ID, range: 'Orders!A:H' });
        let rows = response.result.values || [];
        const keepRows = rows.filter((row, i) => i === 0 || (row[1] === STATE.todayDateStr));

        await syncWholeSheet('Orders!A:H', keepRows[0] || ['OrderID', 'Date', 'UserName', 'RestaurantName', 'ItemName', 'CustomizationDetails', 'Quantity', 'TotalPrice'], keepRows.slice(1));
        showToast('清理完成');
    } catch (err) {
        showToast('清理失敗', true);
    } finally {
        DOM.btnClearOld.disabled = false;
    }
});

// ---- 導航事件 ----
DOM.navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        if (!btn.dataset.target) return;
        switchView(btn.dataset.target);
    });
});
